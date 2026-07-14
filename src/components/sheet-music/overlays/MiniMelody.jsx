import React from 'react';
import MelodyNotesLayer from '../MelodyNotesLayer';
import { processMelodyAndCalculateSlots } from '../processMelodyAndCalculateSlots';
import { calculateAllOffsets } from '../calculateAllOffsets';

// ── MiniMelody — the ONE way carousels render note previews (Han 2026-07-13/14) ───────────────────
//
// Every carousel that shows pitched notes/chords/rhythms MUST render them through this helper, which
// drives the SAME pipeline the real staff uses — `processMelodyAndCalculateSlots` →
// `calculateAllOffsets` → `MelodyNotesLayer` (`renderMelodyNotes`). This replaced a hand-rolled
// "shadow renderer" that drifted from the staff on every axis (spacing, accidental size, clef
// changes, chord stems, colouring, beam-group spacing). Extracted from generationNoteGlyphs into its
// own module so the generation setter AND the colour setter (and future ones) share it (§6c/§6d).
//
// A "slot" is a note-name STRING (single note) or an ARRAY of names (a chord) — exactly the shape
// renderMelodyNotes consumes. Han's mental model: give a carousel slot a WIDTH and treat it as a
// tiny measure; `noteWidth = width / columns`, `startX = −width/2`.

const TS = [4, 4];
const MEASURE_TICKS = 48;      // one 4/4 measure in ticks
export const MINI_QUARTER = 12;

// Reference key for the C-based example previews (runs are always C-rooted, so the illustration is
// self-consistent while honouring whatever colouring rule is active).
export const PREVIEW_TONIC = 'C4';
export const PREVIEW_SCALE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

export const MiniMelody = ({
    slots, durations, width, staffStart, clef = 'treble', staff = 'treble',
    noteColoringMode, tonic = PREVIEW_TONIC, scaleNotes = PREVIEW_SCALE, theme,
    processedChords = [], groupSpacing = false, previewColor = null,
}) => {
    const offsets = [];
    let cum = 0;
    for (const d of durations) { offsets.push(cum); cum += d; }
    const raw = { notes: slots, durations, offsets, displayNotes: slots };
    const mel = processMelodyAndCalculateSlots(raw, TS, MINI_QUARTER, cum);

    // Build the x-grid like SheetMusic. With groupSpacing we use the real calculateAllOffsets (which
    // inserts 'g' markers at beat-group boundaries → the gap between the [2,2] groups). Without it a
    // plain sorted grid + two sentinels (leading sentinel lands the first note at startX).
    const allOffsets = groupSpacing
        ? calculateAllOffsets(TS, MINI_QUARTER, 1, 1, 0, [2, 2], mel.offsets.map(o => ({ offset: o })))
        : (() => {
            const grid = Array.from(new Set(mel.offsets)).sort((a, b) => a - b);
            const last = grid[grid.length - 1] ?? 0;
            return [-1, ...grid, last + 1];
        })();
    const cols = Math.max(1, allOffsets.length - 2);
    const noteWidth = width / cols;
    return (
        <g style={{ pointerEvents: 'none' }}>
            <MelodyNotesLayer
                melody={mel}
                clef={clef}
                staff={staff}
                staffYStart={staffStart}
                startX={-width / 2}
                noteWidth={noteWidth}
                allOffsets={allOffsets}
                timeSignature={TS}
                measureLengthSlots={MEASURE_TICKS}
                noteGroupSize={MINI_QUARTER}
                numAccidentals={0}
                scaleNotes={scaleNotes}
                tonic={tonic}
                noteColoringMode={noteColoringMode}
                theme={theme}
                processedChords={processedChords}
                inputTestState={null}
                pixelsPerTick={null}
                startMeasureIndex={0}
                transpositionSemitones={0}
                debugMode={false}
                interactive={false}
                courtesyAccidentals={false}
                percussionVoiceSplit={false}
                previewMode={previewColor}
            />
        </g>
    );
};

export default MiniMelody;
