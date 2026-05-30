import React from 'react';
import MelodyNotesLayer from '../MelodyNotesLayer';
import { noteYMap, getNoteAbsoluteY } from '../renderMelodyNotes';
import { getNoteValue } from '../../../utils/rangeUtils';
import { PRESET_RANGES } from '../../../constants/ranges';
import { PADS } from '../../../audio/drumKits';

/**
 * RangeStaffOverlay — in-SVG range selector (sheet/bladmuziek variant).
 *
 * PHASE 2: STATIC render. Shows the selectable pitches as a synthetic "melody"
 * rendered THROUGH the real note renderer (MelodyNotesLayer / renderMelodyNotes)
 * so we reuse its ledger-line drawing, ottava (8va/8vb/15ma/15vb) vertical
 * shifting and notehead glyphs (CLAUDE.md §6c — do not reinvent rendering).
 *
 * Layout: each staff gets a horizontal row of selectable noteheads spread across
 * the staff width by giving them sequential offsets on a private slot grid (the
 * renderer's slot-index X mode, pixelsPerTick=null). Pitch still maps to the
 * correct staff line, so the row reads as an ascending diagonal.
 *
 * Colouring (Han 2026-05-30, all via CSS theme vars):
 *   - boundary notes (current min & max)  → --accent-yellow (highlight)
 *   - notes inside the band                → --text-primary  (white/high)
 *   - notes outside the band               → --text-dim      (grey/low)
 * Achieved by splitting the row into three sub-melodies, each rendered with the
 * renderer's `previewMode` colour override. Boundary note NAMES are labelled.
 *
 * Decisions (docs/range-overlay-design.md §9): diatonic naturals only (D1);
 * extent = FULL preset ± 1 octave (D2); all kit percussion notes shown (D3).
 *
 * No interaction yet (drag/tap = Phase 3); percussion pool toggling = Phase 5.
 */

const STAFF_HEIGHT = 40;        // 5 staff lines × 10 units (matches SheetMusic)
const WHOLE = 48;               // whole-note duration → open head, no stem/beam
const ROW_RIGHT_GAP = 10;       // small right margin (preset chips land here, Phase 4)

// Natural pitch classes only — diatonic row (D1).
const PC_TO_LETTER = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

const naturalsInRange = (lowMidi, highMidi) => {
    const out = [];
    for (let m = lowMidi; m <= highMidi; m++) {
        const letter = PC_TO_LETTER[((m % 12) + 12) % 12];
        if (!letter) continue;
        out.push({ midi: m, name: `${letter}${Math.floor(m / 12) - 1}` });
    }
    return out;
};

// Constant MelodyNotesLayer props for our synthetic, rhythm-less selectable rows.
// scaleNotes/tonic/processedChords are unused because noteColoringMode='none' and
// colour comes from previewMode; ties=[] per note so the renderer's tie lookups
// (renderMelodyNotes reads melody.ties[index] unguarded) never hit undefined.
const STATIC_LAYER_PROPS = {
    numAccidentals: 0,
    noteGroupSize: 1,
    measureLengthSlots: 9999,   // single long "measure" → no barline/accidental resets
    scaleNotes: [],
    tonic: '',
    processedChords: [],
    inputTestState: null,
    pixelsPerTick: null,        // slot-index X layout
    startMeasureIndex: 0,
    transpositionSemitones: 0,
    debugMode: false,
    interactive: false,
    courtesyAccidentals: false,
    percussionVoiceSplit: false,
    noteColoringMode: 'none',
};

const mkMelody = (entries) => ({
    notes: entries.map(e => e.name),
    offsets: entries.map(e => e.offset),
    durations: entries.map(() => WHOLE),
    ties: entries.map(() => null),
    triplets: null,
    rhythmicGrouping: null,
});

const RangeStaffOverlay = ({
    startX, endX,
    trebleStart, bassStart, percussionStart,
    isTrebleVisible, isBassVisible, isPercussionVisible,
    clefTreble, clefBass,
    trebleRange, bassRange,
    timeSignature, theme,
}) => {
    if (startX == null || endX == null) return null;

    // Render one melodic staff's selectable row (treble or bass).
    const melodicStaff = (staff, staffStart, clef, range) => {
        const preset = PRESET_RANGES.FULL[staff];
        // Extent = FULL ± 1 octave (D2), clamped to the app's hard bounds (21..108).
        const rowLow = Math.max(21, getNoteValue(preset.min) - 12);
        const rowHigh = Math.min(108, getNoteValue(preset.max) + 12);
        const notes = naturalsInRange(rowLow, rowHigh);
        const N = notes.length;
        if (!N) return null;

        const selMin = getNoteValue(range?.min);
        const selMax = getNoteValue(range?.max);

        // Private slot grid: offsets 1..N, with a leading 0 sentinel so the
        // renderer's getTickX (startX + (indexOf(offset)-1)*noteWidth) puts the
        // first note exactly at startX.
        const allOffsets = Array.from({ length: N + 1 }, (_, i) => i);
        const noteWidth = (endX - ROW_RIGHT_GAP - startX) / N;
        const noteX = (offset) => startX + (offset - 1) * noteWidth;

        const out = [], inBand = [], boundary = [];
        notes.forEach((n, i) => {
            const entry = { name: n.name, offset: i + 1, midi: n.midi };
            if (n.midi === selMin || n.midi === selMax) boundary.push(entry);
            else if (n.midi > selMin && n.midi < selMax) inBand.push(entry);
            else out.push(entry);
        });

        const colorLayers = [
            { key: 'out', color: 'var(--text-dim)', entries: out },
            { key: 'in', color: 'var(--text-primary)', entries: inBand },
            { key: 'bound', color: 'var(--accent-yellow)', entries: boundary },
        ];

        return (
            <g className={`range-row range-row-${staff}`} key={staff}>
                {colorLayers.map(layer => layer.entries.length > 0 && (
                    <MelodyNotesLayer
                        key={layer.key}
                        {...STATIC_LAYER_PROPS}
                        melody={mkMelody(layer.entries)}
                        staff={staff}
                        staffYStart={staffStart}   // absolute: no per-staff translate here
                        clef={clef}
                        startX={startX}
                        noteWidth={noteWidth}
                        allOffsets={allOffsets}
                        timeSignature={timeSignature}
                        theme={theme}
                        previewMode={layer.color}
                    />
                ))}
                {/* Boundary note-name labels in a tidy row under the staff. */}
                {boundary.map(e => (
                    <text
                        key={`lbl-${e.offset}`}
                        x={noteX(e.offset)} y={staffStart + STAFF_HEIGHT + 16}
                        textAnchor="middle" fontFamily="serif" fontSize={12}
                        fill="var(--accent-yellow)"
                    >
                        {e.name}
                    </text>
                ))}
            </g>
        );
    };

    // Percussion: show a selectable notehead for every kit pad that has a staff
    // position (D3). Pool toggling (colour by selected/deselected) is Phase 5; for
    // now all are shown in the "available" colour.
    const percussionStaffRow = () => {
        const ids = PADS.map(p => p.id).filter(id => noteYMap[id] != null);
        const M = ids.length;
        if (!M) return null;
        const allOffsets = Array.from({ length: M + 1 }, (_, i) => i);
        const noteWidth = (endX - ROW_RIGHT_GAP - startX) / M;
        return (
            <g className="range-row range-row-percussion" key="percussion">
                <MelodyNotesLayer
                    {...STATIC_LAYER_PROPS}
                    melody={mkMelody(ids.map((id, i) => ({ name: id, offset: i + 1 })))}
                    staff="percussion"
                    staffYStart={percussionStart}
                    clef={null}
                    startX={startX}
                    noteWidth={noteWidth}
                    allOffsets={allOffsets}
                    timeSignature={timeSignature}
                    theme={theme}
                    previewMode={'var(--text-primary)'}
                />
            </g>
        );
    };

    return (
        // stopPropagation so taps here don't fall through to the sheet click
        // handler (Phase 3 will add real interaction inside this group).
        <g className="range-overlay" onClick={(e) => e.stopPropagation()}>
            {isTrebleVisible && melodicStaff('treble', trebleStart, clefTreble, trebleRange)}
            {isBassVisible && melodicStaff('bass', bassStart, clefBass, bassRange)}
            {isPercussionVisible && percussionStaffRow()}
        </g>
    );
};

export default RangeStaffOverlay;
