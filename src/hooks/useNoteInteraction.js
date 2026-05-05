import { useCallback } from 'react';
import { METRONOME_NOTE_IDS } from '../audio/drumKits';
import { ENHARMONIC_PAIRS } from '../theory/scaleHandler';
import { getNoteIndex } from '../theory/musicUtils';
import playSound from '../audio/playSound';
import generateAllNotesArray from '../theory/allNotesArray';
import Melody from '../model/Melody';

/**
 * Handles click-to-play for notes/chords in the sheet music and enharmonic toggles.
 *
 * @param {Object} params
 * @param {AudioContext} params.context - Web AudioContext
 * @param {Object} params.instruments - loaded smplr instrument instances
 * @param {React.RefObject} params.customPercussionMappingRef - ref to current percussion mapping
 * @param {React.RefObject} params.sequencerRef - ref to the Sequencer instance
 * @param {Melody|null} params.trebleMelody
 * @param {Melody|null} params.bassMelody
 * @param {Function} params.setTrebleMelody
 * @param {Function} params.setBassMelody
 */
export default function useNoteInteraction({
    context,
    instruments,
    customPercussionMappingRef,
    sequencerRef,
    trebleMelody,
    bassMelody,
    setTrebleMelody,
    setBassMelody,
}) {
    // Click-to-play a note in the sheet music.
    // ROUTING: same logic as playMelodies.js — METRONOME_NOTE_IDS go to metronome Soundfont.
    // Import METRONOME_NOTE_IDS from drumKits.js; never redefine inline.
    const handleNoteClick = useCallback(async (notes, staff) => {
        if (!context) return;
        try {
            if (context.state !== 'running') await context.resume();
            const mapping = staff === 'percussion' ? (customPercussionMappingRef.current ?? null) : null;
            notes.forEach(note => {
                let instrument;
                if (staff === 'bass') {
                    instrument = instruments.bass;
                } else if (staff === 'percussion') {
                    instrument = (METRONOME_NOTE_IDS.has(note) && instruments.metronome)
                        ? instruments.metronome
                        : instruments.percussion;
                } else {
                    instrument = instruments.treble;
                }
                if (!instrument) return;
                // Duration: 2.0s for all click-to-play notes; percussion plays to natural end via smplr.
                // Passing null caused some smplr instruments to cut off immediately (inconsistent).
                playSound(note, instrument, context, context.currentTime, 2.0, 1, mapping);
            });
        } catch { /* audio context may not be ready */ }
    }, [context, instruments.treble, instruments.bass, instruments.percussion, instruments.metronome]);

    // Play a chord label clicked in the sheet music.
    // Replicates ChordGrid's playNotes: uses the chords instrument with strumming
    // and adds the root note in bass range on the bass instrument.
    const handleChordClick = useCallback(async (notes) => {
        if (!context || !notes?.length) return;
        try {
            if (context.state !== 'running') await context.resume();
            const seq = sequencerRef?.current;
            const inst = seq?.instruments?.chords;
            if (!inst) return;
            const now = context.currentTime;
            const gain = seq.refs?.playbackConfigRef?.current?.chords ?? 0.8;
            const strum = seq.refs?.instrumentSettingsRef?.current?.chords?.strummingEnabled ?? true;
            notes.forEach((noteStr, idx) => {
                playSound(noteStr, inst, context, now + (strum ? idx * 0.02 : 0), 2.0, gain);
            });
            // Bass root in octave 2–3
            const bassInst = seq?.instruments?.bass;
            if (bassInst && notes[0]) {
                const rootIdx = getNoteIndex(notes[0]);
                if (rootIdx !== -1) {
                    const allNotes = generateAllNotesArray();
                    let bassIdx = rootIdx;
                    while (bassIdx > 51) bassIdx -= 12;
                    while (bassIdx < 21) bassIdx += 12;
                    const bassNote = allNotes[bassIdx];
                    if (bassNote) {
                        const bassGain = seq.refs?.playbackConfigRef?.current?.bass ?? 0.7;
                        playSound(bassNote, bassInst, context, now, 2.0, bassGain);
                    }
                }
            }
        } catch { /* audio context may not be ready */ }
    }, [context, sequencerRef]);

    // Clicking an accidental symbol (♯/♭) in front of a note toggles its enharmonic spelling.
    // Only the displayNotes array is modified — the canonical notes (audio pitch) are unchanged.
    // absoluteOffset: tick position in the full melody (SheetMusic adds the pagination offset).
    const handleNoteEnharmonicToggle = useCallback((staff, absoluteOffset) => {
        const melody = staff === 'treble' ? trebleMelody : bassMelody;
        const setter = staff === 'treble' ? setTrebleMelody : setBassMelody;
        if (!melody) return;

        const noteIndex = melody.offsets.findIndex(o => o != null && Math.abs(o - absoluteOffset) < 0.5);
        if (noteIndex < 0) return;

        const currentDisplayNotes = melody.displayNotes ?? melody.notes;
        const displayNote = currentDisplayNotes[noteIndex];
        if (!displayNote || displayNote === 'r') return;

        // Strip octave number to get pitch class, look up enharmonic pair
        const match = displayNote.match(/^([A-G][♭♯𝄫𝄪b#]*)(-?\d+)$/u);
        if (!match) return;
        const [, pitchClass, octave] = match;
        const enharmonicPC = ENHARMONIC_PAIRS[pitchClass];
        if (!enharmonicPC) return; // Natural note with no defined enharmonic

        const newDisplayNotes = [...currentDisplayNotes];
        newDisplayNotes[noteIndex] = enharmonicPC + octave;

        const newMelody = new Melody(melody.notes, melody.durations, melody.offsets, newDisplayNotes, melody.volumes);
        // Preserve smallestNoteDenom so Takadimi beat level stays correct
        newMelody.smallestNoteDenom = melody.smallestNoteDenom;
        setter(newMelody);
    }, [trebleMelody, bassMelody, setTrebleMelody, setBassMelody]);

    return { handleNoteClick, handleChordClick, handleNoteEnharmonicToggle };
}
