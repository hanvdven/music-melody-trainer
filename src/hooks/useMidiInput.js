import { useEffect, useRef } from 'react';
import generateAllNotesArray from '../theory/allNotesArray';
import logger from '../utils/logger';

// #661 (Han): GLOBAL Web-MIDI input. Earlier this lived inside PianoView, but that only listens while the
// piano is mounted in the active view — Han's MIDI events "kwamen niet door". Lifting it to the app makes it
// always-on: a connected MIDI keyboard routes note-on/off to the active view regardless of which panel shows.
//
// The hook owns ONLY the Web-MIDI plumbing (access, hot-plug rebind, message parsing) and calls back with a
// note NAME string. What to do with the note (play it, feed combat, highlight) is the caller's job. Handlers
// live in a ref so the once-only access effect always invokes the latest closures without re-requesting access.
//
// generateAllNotesArray() starts at A0 = MIDI 21, so notes[midiNumber − 21] is the note name for that key.

const NOTES = generateAllNotesArray();

export default function useMidiInput({ onNoteOn, onNoteOff }) {
    const cbRef = useRef({ onNoteOn, onNoteOff });
    cbRef.current = { onNoteOn, onNoteOff };

    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) return undefined;
        let access = null;
        let cancelled = false;

        const handle = (e) => {
            const status = e.data[0], d1 = e.data[1], d2 = e.data[2];
            const cmd = status & 0xf0;
            const note = NOTES[d1 - 21];
            if (!note) return;                                    // outside the 88-key range
            if (cmd === 0x90 && d2 > 0) cbRef.current.onNoteOn?.(note, d2);
            else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) cbRef.current.onNoteOff?.(note);
        };
        const attach = (a) => { a.inputs.forEach((input) => { input.onmidimessage = handle; }); };

        navigator.requestMIDIAccess().then((a) => {
            if (cancelled) return;
            access = a;
            attach(a);
            a.onstatechange = () => attach(a);                    // hot-plug: (re)bind newly-connected inputs
        }).catch((err) => logger.warn('useMidiInput', 'Web MIDI unavailable', err));

        return () => {
            cancelled = true;
            if (access) { access.inputs.forEach((input) => { input.onmidimessage = null; }); access.onstatechange = null; }
        };
        // cbRef is reassigned every render (fresh closures); access is acquired ONCE. No render deps.
    }, []);
}
