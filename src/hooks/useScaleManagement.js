import { useState, useRef, useCallback } from 'react';
import playSound from '../audio/playSound';
import { ENHARMONIC_PAIRS, updateScaleWithTonic } from '../theory/scaleHandler';

/**
 * Owns scale-interaction handlers that are independent of the larger tonic/mode pipeline:
 * - `handleScaleClick`: plays the scale's notes sequentially when the scale name in the header
 *   is clicked, and tracks `isScalePlaying` so the UI can highlight while audio is in flight.
 * - `handleEnharmonicToggle`: toggles the tonic to its enharmonic equivalent (F♯ ↔ G♭).
 *
 * @param {Object} params
 * @param {AudioContext} params.context
 * @param {Object} params.instruments - loaded smplr instruments (uses .treble)
 * @param {Object} params.scale - current Scale instance
 * @param {Function} params.setScale - wrapped scale setter (updates scaleRef)
 * @param {React.RefObject} params.bpmRef
 */
export default function useScaleManagement({ context, instruments, scale, setScale, bpmRef }) {
    const [isScalePlaying, setIsScalePlaying] = useState(false);
    const scalePlayTimerRef = useRef(null);

    // Play all scale notes sequentially when the scale name in the header is clicked.
    const handleScaleClick = useCallback(async () => {
        if (!context || !instruments.treble || !scale?.notes?.length) return;
        try {
            if (context.state !== 'running') await context.resume();
            const spacing = 60 / Math.max(60, bpmRef.current || 120);
            scale.notes.forEach((note, i) => {
                playSound(note, instruments.treble, context, context.currentTime + i * spacing, spacing * 0.9, 1, null);
            });
            setIsScalePlaying(true);
            if (scalePlayTimerRef.current) clearTimeout(scalePlayTimerRef.current);
            const totalMs = scale.notes.length * spacing * 1000;
            scalePlayTimerRef.current = setTimeout(() => setIsScalePlaying(false), totalMs);
        } catch {}
    }, [context, instruments.treble, scale, bpmRef]);

    // Toggle tonic to its enharmonic equivalent when the key-signature accidentals are clicked.
    // E.g. F♯ major ↔ G♭ major. Uses ENHARMONIC_PAIRS (pitch-class → enharmonic pitch-class).
    const handleEnharmonicToggle = useCallback(() => {
        setScale(prev => {
            if (!prev?.tonic) return prev;
            // Strip octave suffix to get pitch class, then look up enharmonic spelling.
            const tonicPC = prev.tonic.replace(/\d+$/, '');
            const altPC = ENHARMONIC_PAIRS[tonicPC];
            if (!altPC) return prev; // no enharmonic exists (C, E, B, etc.)
            const octave = prev.tonic.match(/\d+$/)?.[0] ?? '4';
            const newTonic = altPC + octave;
            return updateScaleWithTonic({ currentScale: prev, newTonic });
        });
    }, [setScale]);

    return { isScalePlaying, handleScaleClick, handleEnharmonicToggle };
}
