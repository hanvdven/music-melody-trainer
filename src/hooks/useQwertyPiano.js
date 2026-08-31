import { useEffect, useRef } from 'react';

// Shared QWERTY-piano key wiring (Han 2026-08-28: "kopieer de functionaliteit van de pianoview ...
// keyboardinput"). Owns ONLY the window keydown/keyup listener, the auto-repeat/modifier/typing-target
// guards, and a "currently down" set that dedupes repeats and releases everything on window blur. The
// key→note MAPPING is NOT redefined here — the caller passes one built from `utils/qwertyScheme.js`,
// which stays the single source of truth (§6d). The caller decides what note-on / note-off do
// (WorldPiano: play the piano sample + route into the same combat path a click uses).
export default function useQwertyPiano({ active = true, keysToNotes, onNoteOn, onNoteOff }) {
    const cb = useRef({ keysToNotes, onNoteOn, onNoteOff });
    cb.current = { keysToNotes, onNoteOn, onNoteOff };
    const downRef = useRef(new Set());

    useEffect(() => {
        if (!active) return undefined;

        const noteFor = (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return null;
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return null;
            return cb.current.keysToNotes?.[e.key.toLowerCase()] || null;
        };
        const onDown = (e) => {
            if (e.repeat) return;
            const note = noteFor(e);
            if (!note) return;
            e.preventDefault();
            if (downRef.current.has(note)) return;   // held already (physical auto-repeat / stuck key)
            downRef.current.add(note);
            cb.current.onNoteOn?.(note);
        };
        const onUp = (e) => {
            const note = noteFor(e);
            if (!note) return;
            if (!downRef.current.delete(note)) return;
            cb.current.onNoteOff?.(note);
        };
        // Losing focus (alt-tab, devtools) never delivers keyup — release everything so no note sticks.
        const onBlur = () => {
            downRef.current.forEach((n) => cb.current.onNoteOff?.(n));
            downRef.current.clear();
        };

        window.addEventListener('keydown', onDown);
        window.addEventListener('keyup', onUp);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onDown);
            window.removeEventListener('keyup', onUp);
            window.removeEventListener('blur', onBlur);
            onBlur();
        };
        // Only `active` gates the listener; keysToNotes/onNoteOn/onNoteOff are read fresh via `cb`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);
}
