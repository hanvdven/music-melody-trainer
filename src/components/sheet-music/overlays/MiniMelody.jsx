import React from 'react';
import MelodyNotesLayer from '../MelodyNotesLayer';
import { processMelodyAndCalculateSlots } from '../processMelodyAndCalculateSlots';
import { generateAccidentalMap } from '../generateAccidentalMap';

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
    processedChords = [], previewColor = null, forcedAccidentals = null,
    // #435 (Han 2026-07-19): beats per group for the 'g' spacers. Default 2 (the sheet's [2,2]); the
    // note-pool + colour runs pass 8 → one group of 8 (no internal gaps, grouping [8]).
    groupBeats = 2,
}) => {
    const offsets = [];
    let cum = 0;
    for (const d of durations) { offsets.push(cum); cum += d; }
    const raw = { notes: slots, durations, offsets, displayNotes: slots };
    const mel = processMelodyAndCalculateSlots(raw, TS, MINI_QUARTER, cum);

    // Build the x-grid like SheetMusic, using the SAME marker vocabulary the real staff uses so the
    // carousel notes get identical spacing (Han 2026-07-19: "de noten hebben geen extra spacing voor
    // de accidentals … geen note grouping"): 'a' before a note that carries an accidental (widens its
    // slot), 'g' at each 2-beat group boundary (the beat grouping). Illustrations are NOT measures, so
    // we build the array directly (no 'm' barlines) instead of calling calculateAllOffsets. With
    // groupSpacing the caller wants only the beat gaps (rhythm previews, no accidentals).
    const accs = generateAccidentalMap(mel.notes, 0, mel.offsets, MEASURE_TICKS);
    if (forcedAccidentals) forcedAccidentals.forEach((a, i) => { if (a != null && i < accs.length) accs[i] = a; });
    const hasAcc = (a) => Array.isArray(a) ? a.some(x => x != null) : a != null;
    const GROUP_TICKS = groupBeats * MINI_QUARTER;   // beats per group (default 2 = sheet [2,2])
    const allOffsets = (() => {
        const grid = mel.offsets
            .map((o, i) => ({ o, i }))
            .filter(x => x.o != null)
            .sort((a, b) => a.o - b.o);
        const out = [-1];                    // leading sentinel → first note lands at startX
        let lastGroup = -1;
        for (const { o, i } of grid) {
            const group = Math.floor(o / GROUP_TICKS);
            if (lastGroup >= 0 && group !== lastGroup) out.push('g');
            lastGroup = group;
            if (hasAcc(accs[i])) out.push('a');
            out.push(o);
        }
        out.push((grid[grid.length - 1]?.o ?? 0) + 1);   // trailing sentinel
        return out;
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
                forcedAccidentals={forcedAccidentals}
            />
        </g>
    );
};

export default MiniMelody;
