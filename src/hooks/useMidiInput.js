import { useEffect, useRef, useState } from 'react';
import generateAllNotesArray from '../theory/allNotesArray';
import logger from '../utils/logger';

// #661 (Han): GLOBAL Web-MIDI input. Earlier this lived inside PianoView, but that only listens while the
// piano is mounted in the active view — Han's MIDI events "kwamen niet door". Lifting it to the app makes it
// always-on: a connected MIDI keyboard routes note-on/off to the active view regardless of which panel shows.
//
// The hook owns ONLY the Web-MIDI plumbing (access, hot-plug rebind, message parsing) and calls back with a
// note NAME string. What to do with the note (play it, feed combat, highlight) is the caller's job. It ALSO
// returns a live status object ({ supported, state, inputs, lastData, count }) so the app can show a debug
// overlay — Han: "kun je ergens debug midi events tonen om te zien of de app ze binnenkrijgt?" (Web MIDI is
// Chromium-only and needs permission + a secure/localhost context, so the status makes failures visible.)
//
// generateAllNotesArray() starts at A0 = MIDI 21, so notes[midiNumber − 21] is the note name for that key.

const NOTES = generateAllNotesArray();

export default function useMidiInput({ onNoteOn, onNoteOff } = {}) {
    const cbRef = useRef({ onNoteOn, onNoteOff });
    cbRef.current = { onNoteOn, onNoteOff };

    const supported = typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;
    const [status, setStatus] = useState({ supported, state: 'init', inputs: [], lastData: null, count: 0 });

    useEffect(() => {
        if (!supported) { setStatus((s) => ({ ...s, state: 'unsupported' })); return undefined; }
        let access = null;
        let cancelled = false;
        setStatus((s) => ({ ...s, state: 'requesting' }));

        const handle = (e) => {
            const data = Array.from(e.data);
            const status0 = data[0], d1 = data[1], d2 = data[2];
            const cmd = status0 & 0xf0;
            // debug: surface EVERY message (even ones we don't act on) so Han can see raw input arriving.
            setStatus((s) => ({ ...s, lastData: data, count: s.count + 1 }));
            const note = NOTES[d1 - 21];
            if (note == null) return;                             // outside the 88-key range / non-note msg
            if (cmd === 0x90 && d2 > 0) cbRef.current.onNoteOn?.(note, d2);
            else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) cbRef.current.onNoteOff?.(note);
        };
        const refresh = (a) => {
            const names = [];
            a.inputs.forEach((input) => { input.onmidimessage = handle; names.push(input.name || input.id); });
            setStatus((s) => ({ ...s, state: 'granted', inputs: names }));
        };

        navigator.requestMIDIAccess().then((a) => {
            if (cancelled) return;
            access = a;
            refresh(a);
            a.onstatechange = () => refresh(a);                   // hot-plug: (re)bind newly-connected inputs
        }).catch((err) => {
            logger.warn('useMidiInput', 'Web MIDI access denied/failed', err);
            if (!cancelled) setStatus((s) => ({ ...s, state: 'denied' }));
        });

        return () => {
            cancelled = true;
            if (access) { access.inputs.forEach((input) => { input.onmidimessage = null; }); access.onstatechange = null; }
        };
        // cbRef is reassigned every render (fresh closures); access is acquired ONCE. No render deps.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return status;
}
