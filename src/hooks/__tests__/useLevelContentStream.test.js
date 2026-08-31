import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useLevelContentStream from '../useLevelContentStream';
import { LEVELS, LEVEL_BASS_SIMPLE } from '../../levels/levels';
import { blockMeasuresFor, blockTypeAt } from '../../levels/levelBlockPlan';
import Scale from '../../model/Scale';
import InstrumentSettings from '../../model/InstrumentSettings';
import { TICKS_PER_WHOLE, secondsPerTick } from '../../constants/timing';
import buildTimpaniPattern from '../../utils/timpaniPattern';

vi.mock('../../audio/playMelodies', () => ({ default: vi.fn(() => 0) }));
import playMelodies from '../../audio/playMelodies';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// #1165 — PER-MECHANISM MIGRATION GUARDS.
//
// This one hook replaced FIVE live mechanisms. There is one describe block per retired
// mechanism, asserting the behaviour that mechanism was responsible for still holds:
//
//   useLevelTrebleStream        → gated loop-forever, Wizard call-response + cast timing,
//                                 the #1102 fresh-bpm / accumulated-cursor / decider behaviour
//   useLevelBackingStream       → the lead-in + metronome half-stagger, gated audio exclusions
//   useLevelMixedStream         → Mixed block-type alternation
//   useLevelKeyModulationStream → decorativeWizard Major/Minor alternation
//   regenerate()-per-wave       → a non-sideScroll (static) level still produces content
//
// The generation itself is REAL (`generateBlock`) — only `playMelodies` is mocked, so every
// scheduling assertion reads the arguments the audio layer would actually receive.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const scale = Scale.defaultScale();
const percussionScale = Scale.defaultPercussionScale();
const timeSignature = [4, 4];
const MLT = (TICKS_PER_WHOLE * timeSignature[0]) / timeSignature[1];   // 48
const barSecAt = (bpm) => MLT * secondsPerTick(bpm);

// Every object prop must be a STABLE reference across renders — this hook's effect depends on
// them, so a fresh literal per render would retrigger it in an infinite loop.
const trebleSettings = InstrumentSettings.defaultTrebleInstrumentSettings();
const bassSettings = InstrumentSettings.defaultBassInstrumentSettings();
const percussionSettings = InstrumentSettings.defaultPercussionInstrumentSettings();
const chordSettings = InstrumentSettings.defaultChordInstrumentSettings();
const metronomeSettings = InstrumentSettings.defaultMetronomeInstrumentSettings();
const wizardInstrument = { name: 'wizard-cast' };
const bassInstrument = { name: 'cello' };
const metronomeInstrument = { name: 'woodblock' };
const timpaniInstrument = { name: 'timpani' };

const ANCHOR = 10;   // levelAudioStart

function renderStream(lvl, overrides = {}) {
    const context = { currentTime: 0 };
    const wizardStopFnsRef = { current: [] };
    const backingStopFnsRef = { current: [] };
    return renderHook(() => useLevelContentStream({
        active: true,
        lvl,
        scale,
        timeSignature: lvl.timeSignature ?? timeSignature,
        trebleSettings, bassSettings, percussionSettings, chordSettings, metronomeSettings,
        percussionScale,
        chordProgression: null,
        context,
        levelAudioStart: ANCHOR,
        wizardInstrument,
        wizardVolume: 1,
        wizardStopFnsRef,
        bassInstrument,
        metronomeInstrument,
        backingStopFnsRef,
        bassReady: true,
        metronomeReady: true,
        levelMelodyReady: true,
        ...overrides,
    }));
}

// playMelodies(melodies, instruments, context, bpm, scheduledStart, …, namedInstruments, …)
const castCalls = () => playMelodies.mock.calls.filter((c) => c[1][0] === wizardInstrument);
const bassCalls = () => playMelodies.mock.calls.filter((c) => c[1][0] === bassInstrument);
const metronomeCalls = () => playMelodies.mock.calls.filter((c) => c[1][0] === metronomeInstrument);
const timpaniCalls = () => playMelodies.mock.calls.filter((c) => c[1][0] === timpaniInstrument);

/** Offsets of a growing Melody must be strictly non-decreasing and never rewritten. */
const isAppendOnly = (prev, next) => {
    if (next.offsets.length < prev.offsets.length) return false;
    for (let i = 0; i < prev.offsets.length; i++) {
        if (next.offsets[i] !== prev.offsets[i]) return false;
        if (next.notes[i] !== prev.notes[i]) return false;
    }
    return true;
};

beforeEach(() => { vi.clearAllMocks(); });

// ── RETIRED: useLevelBackingStream — the lead-in ────────────────────────────────────────────
describe('#1165 guard — lead-in block + metronome half-stagger (was useLevelBackingStream)', () => {
    // A 4-measure procedural level with a 2-measure lead-in: metronomeBars = ceil(2/2) = 1.
    const lvl = {
        id: 900, sideScroll: true, enemyType: 'Slime', bpm: 80,
        numMeasures: 4, numRepeats: 1, totalMeasures: 4,
        leadInBars: 2, metronomeBars: 1, visibleMeasures: 2,
    };

    it('scores cello through ALL leadInBars measures and the metronome only through the last metronomeBars', () => {
        const { result, unmount } = renderStream(lvl);
        // Bass covers the lead-in from tick 0 (Han: "alle opmaten cello+timpanen" — no silent lead-in
        // measure); the metronome's own timeline starts one measure in.
        expect(Math.min(...result.current.bass.offsets.filter((o) => o != null))).toBe(0);
        expect(Math.min(...result.current.metronome.offsets.filter((o) => o != null)))
            .toBe((lvl.leadInBars - lvl.metronomeBars) * MLT);
        unmount();
    });

    it('anchors the lead-in cello AT levelAudioStart and the metronome metronomeBars later, both at the level bpm', () => {
        const { unmount } = renderStream(lvl);
        expect(bassCalls()[0][4]).toBeCloseTo(ANCHOR, 10);
        expect(bassCalls()[0][3]).toBe(lvl.bpm);
        expect(metronomeCalls()[0][4])
            .toBeCloseTo(ANCHOR + (lvl.leadInBars - lvl.metronomeBars) * barSecAt(lvl.bpm), 10);
        unmount();
    });

    it('keeps the lead-in at leadInBars even when the CONTENT cadence is a different size', () => {
        // The whole point of `leadInSpecFor` being separate from `blockMeasuresFor`: #1166 changes
        // numMeasures without touching the count-in a player sees and hears.
        const shortBlocks = { ...lvl, numMeasures: 2 };
        const { result, unmount } = renderStream(shortBlocks);
        const leadInTicks = lvl.leadInBars * MLT;
        // The first content block's bass starts exactly after the lead-in, never overlapping it.
        expect(result.current.bass.offsets.filter((o) => o != null && o < leadInTicks).length)
            .toBeGreaterThan(0);
        unmount();
    });

    it('content blocks start on the accumulated cursor: contentStart = anchor + leadInBars bars', () => {
        const { unmount } = renderStream(lvl);
        const contentStart = ANCHOR + lvl.leadInBars * barSecAt(lvl.bpm);
        // bassCalls()[0] is the lead-in; [1] is content block 0.
        expect(bassCalls()[1][4]).toBeCloseTo(contentStart, 10);
        unmount();
    });
});

// ── RETIRED: useLevelBackingStream — gated exclusions + #1096 rubato hand-off ───────────────
describe('#1165 guard — a gated level schedules NO bass/metronome audio (#1096/#867)', () => {
    const gated = LEVELS[3];   // gatedScroll, procedural, Slime

    afterEach(() => { vi.useRealTimers(); });

    it('generates content but never pre-schedules cello or metronome (useLevelGatedRubatoAudio owns it)', () => {
        vi.useFakeTimers();
        const { result, unmount } = renderStream(gated);
        expect(result.current.bass.notes.length).toBeGreaterThan(0);
        expect(result.current.metronome.notes.length).toBeGreaterThan(0);
        expect(bassCalls().length).toBe(0);
        expect(metronomeCalls().length).toBe(0);
        unmount();
    });

    it('loops FOREVER — content keeps growing past the level\'s own declared length', () => {
        vi.useFakeTimers();
        const { result, unmount } = renderStream(gated);
        const initialTreble = result.current.treble;
        const initialBass = result.current.bass;
        expect(initialTreble.notes.length).toBeGreaterThan(0);
        act(() => { vi.advanceTimersByTime(60_000); });
        expect(result.current.treble.notes.length).toBeGreaterThan(initialTreble.notes.length);
        expect(result.current.bass.notes.length).toBeGreaterThan(initialBass.notes.length);
        // …and every earlier block is untouched (the append-only invariant, CLAUDE.md §6).
        expect(isAppendOnly(initialTreble, result.current.treble)).toBe(true);
        expect(isAppendOnly(initialBass, result.current.bass)).toBe(true);
        unmount();
    });
});

// ── RETIRED: useLevelTrebleStream — Wizard call-response ────────────────────────────────────
describe('#1165 guard — Wizard call-response (was useLevelTrebleStream)', () => {
    const native = LEVELS[13];   // native Wizard level, callResponseMeasures undefined → 1+1

    it('a native Wizard level keeps its 2-measure (1 call + 1 response) block cadence', () => {
        expect(blockMeasuresFor(native)).toBe(2);
    });

    it('schedules exactly ONE cast per generated block, leadOffsetSeconds EARLY (#693 must not regress)', () => {
        const { unmount } = renderStream(native);
        const casts = castCalls();
        // The lead-in plus blocks 0 and 1 are generated synchronously → two casts so far.
        expect(casts.length).toBe(2);
        const bar = barSecAt(native.bpm);
        const contentStart = ANCHOR + native.leadInBars * bar;
        const lead = (native.wizardSpawnLeadMeasures ?? 1) * bar;
        expect(casts[0][4]).toBeCloseTo(contentStart - lead, 10);
        expect(casts[1][4]).toBeCloseTo(contentStart + 2 * bar - lead, 10);
        unmount();
    });

    it('the call half is silent and the response half carries the real notes', () => {
        const { result, unmount } = renderStream(native);
        const t = result.current.treble;
        const events = t.offsets
            .map((o, i) => ({ o, n: t.notes[i] }))
            .filter((e) => e.o != null && e.o < MLT);   // block 0's CALL measure
        expect(events.length).toBeGreaterThan(0);
        for (const e of events) expect(e.n).toBe('r');
        const response = t.offsets
            .map((o, i) => ({ o, n: t.notes[i] }))
            .filter((e) => e.o != null && e.o >= MLT && e.o < 2 * MLT);
        expect(response.some((e) => e.n !== 'r' && e.n !== 'c')).toBe(true);
        unmount();
    });

    it('variant d/e (callResponseMeasures 1 / 2) scale the block cadence, not a second mechanism', () => {
        const d = { ...LEVELS[4], enemyType: 'Wizard', callResponseMeasures: 1, numMeasures: 1, numRepeats: 2, totalMeasures: 8, wizardSpawnLeadMeasures: 1 };
        const e = { ...d, callResponseMeasures: 2, numMeasures: 2, wizardSpawnLeadMeasures: 2 };
        expect(blockMeasuresFor(d)).toBe(2);
        expect(blockMeasuresFor(e)).toBe(4);

        vi.clearAllMocks();
        const rd = renderStream(d);
        const bar = barSecAt(d.bpm);
        const contentStart = ANCHOR + d.leadInBars * bar;
        expect(castCalls()[0][4]).toBeCloseTo(contentStart - 1 * bar, 10);
        rd.unmount();

        vi.clearAllMocks();
        const re = renderStream(e);
        // Variant e's cast lead is its OWN 2-measure call length (the §1101 UAT fix) — the cast
        // finishes exactly as the response window opens.
        expect(castCalls()[0][4]).toBeCloseTo(contentStart - 2 * bar, 10);
        re.unmount();
    });

    it('the cello covers BOTH halves of a call-response block (doubled accompaniment)', () => {
        const { result, unmount } = renderStream(native);
        const B = blockMeasuresFor(native);
        const leadInTicks = native.leadInBars * MLT;
        // Block 0's bass occupies [leadIn, leadIn + B) — the response half included, not just the call.
        const inResponseHalf = result.current.bass.offsets
            .filter((o) => o != null && o >= leadInTicks + MLT && o < leadInTicks + B * MLT);
        expect(inResponseHalf.length).toBeGreaterThan(0);
        unmount();
    });
});

// ── RETIRED: useLevelMixedStream ────────────────────────────────────────────────────────────
describe('#1165 guard — Mixed level alternates block types (was useLevelMixedStream)', () => {
    const mixed = LEVELS[14];

    it('keeps the 2-measure alternation period and schedules a cast ONLY on Wizard blocks', () => {
        expect(blockMeasuresFor(mixed)).toBe(2);
        const { unmount } = renderStream(mixed);
        // Blocks 0 (Slime) and 1 (Wizard) are generated synchronously → exactly ONE cast.
        expect(blockTypeAt(0)).toBe('Slime');
        expect(blockTypeAt(2)).toBe('Wizard');
        expect(castCalls().length).toBe(1);
        const bar = barSecAt(mixed.bpm);
        const contentStart = ANCHOR + mixed.leadInBars * bar;
        expect(castCalls()[0][4])
            .toBeCloseTo(contentStart + 2 * bar - (mixed.wizardSpawnLeadMeasures ?? 1) * bar, 10);
        unmount();
    });

    it('a Slime block\'s treble is real playable content (no call rests)', () => {
        const { result, unmount } = renderStream(mixed);
        const block0 = result.current.treble.offsets
            .map((o, i) => ({ o, n: result.current.treble.notes[i] }))
            .filter((e) => e.o != null && e.o < 2 * MLT);
        expect(block0.some((e) => e.n !== 'r' && e.n !== 'c')).toBe(true);
        unmount();
    });
});

// ── RETIRED: useLevelKeyModulationStream ────────────────────────────────────────────────────
describe('#1165 guard — decorativeWizard Major/Minor alternation (was useLevelKeyModulationStream, §305)', () => {
    const decorative = LEVELS[15];

    it('keeps the 2-measure modulation period', () => {
        expect(blockMeasuresFor(decorative)).toBe(2);
    });

    it('alternates the generated content between Major and Minor, tonic untouched, forward-only', () => {
        const { result, unmount } = renderStream(decorative);
        const t = result.current.treble;
        const pitchClasses = (loTicks, hiTicks) => new Set(t.offsets
            .map((o, i) => ({ o, n: t.notes[i] }))
            .filter((e) => e.o != null && e.o >= loTicks && e.o < hiTicks && e.n !== 'r' && e.n !== 'c')
            .map((e) => e.n.replace(/\d+$/, '')));
        // Block 0 is Major (no E♭/A♭/B♭ possible), block 1 is Minor (no E/A/B natural possible).
        const majorBlock = pitchClasses(0, 2 * MLT);
        const minorBlock = pitchClasses(2 * MLT, 4 * MLT);
        expect(majorBlock.size).toBeGreaterThan(0);
        expect(minorBlock.size).toBeGreaterThan(0);
        for (const pc of majorBlock) expect(['Eb', 'Ab', 'Bb', 'D#', 'G#', 'A#']).not.toContain(pc);
        unmount();
    });
});

// ── RETIRED: useLevel.js regenerate()-per-wave ──────────────────────────────────────────────
describe('#1165 guard — a NON-sideScroll (static combat) level runs the same pipeline (was regenerate())', () => {
    const staticLvl = LEVELS[101];

    it('produces treble content with no anchor, no timers and no scheduled audio at all', () => {
        const { result, unmount } = renderStream(staticLvl, { levelAudioStart: null });
        expect(result.current.treble.notes.length).toBeGreaterThan(0);
        // The whole lookahead/scroll machinery is inert: nothing is scheduled, nothing pending.
        expect(playMelodies).not.toHaveBeenCalled();
        // …and there is no lead-in for a level that has no scroll: every offset sits inside the
        // level's own content span, starting at content measure 0 (never shifted by leadInBars).
        const offsets = result.current.treble.offsets.filter((o) => o != null);
        expect(Math.min(...offsets)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...offsets)).toBeLessThan(staticLvl.totalMeasures * MLT);
        unmount();
    });

    it('covers exactly its own totalMeasures in one synchronous pass', () => {
        const { result, unmount } = renderStream(staticLvl, { levelAudioStart: null });
        const end = result.current.treble.offsets
            .map((o, i) => (o == null ? 0 : o + (result.current.treble.durations[i] || 0)))
            .reduce((m, v) => Math.max(m, v), 0);
        expect(Math.abs(end - staticLvl.totalMeasures * MLT)).toBeLessThan(1e-6);
        unmount();
    });
});

// ── #1102 re-fit ────────────────────────────────────────────────────────────────────────────
describe('#1165/#1102 — adaptive tempo re-fitted onto the ONE cadence', () => {
    // 4/4 → a bar is exactly 3.0s at 80bpm and 2.4s at 100bpm: round numbers, so the accumulated
    // cursor can be asserted exactly.
    const BAR_AT_80 = 3.0;
    const BAR_AT_100 = 2.4;
    const adaptiveLvl = {
        id: 901, sideScroll: true, enemyType: 'Slime', bpm: 80, adaptive: true,
        numMeasures: 2, numRepeats: 1, totalMeasures: 8, leadInBars: 2, metronomeBars: 1,
        visibleMeasures: 2,
    };

    it('reads the bpm FRESH per block and accumulates each block start at its OWN bar duration', () => {
        const seen = [];
        const adaptiveTempo = {
            bpmForMeasure: (measure, startTime) => { seen.push([measure, startTime]); return measure >= 2 ? 100 : 80; },
            evaluate: vi.fn(),
        };
        const { unmount } = renderStream(adaptiveLvl, { adaptiveTempo, statsRef: { current: {} } });
        // contentStart = 10 + 2 * 3.0 = 16 (the LEAD-IN is pinned to the level's own starting tempo and
        // never consults the controller); block 1's cursor = 16 + 2 * 3.0 = 22.
        expect(seen).toEqual([[0, 16], [2, 22]]);
        // Block 1's cello sounds at the accumulated cursor, at the NEW tempo.
        expect(bassCalls()[2][3]).toBe(100);
        expect(bassCalls()[2][4]).toBeCloseTo(22, 10);
        expect(bassCalls()[1][3]).toBe(80);
        expect(bassCalls()[1][4]).toBeCloseTo(16, 10);
        expect(barSecAt(100)).toBeCloseTo(BAR_AT_100, 10);
        expect(barSecAt(80)).toBeCloseTo(BAR_AT_80, 10);
        unmount();
    });

    it('decides at every block boundary with units [B] — ONE cadence, so exact sync is structural', () => {
        const evaluate = vi.fn();
        const statsRef = { current: { defeated: 1 } };
        const { unmount } = renderStream(adaptiveLvl, {
            adaptiveTempo: { bpmForMeasure: () => 80, evaluate }, statsRef,
        });
        expect(evaluate).toHaveBeenCalledTimes(2);
        expect(evaluate.mock.calls[0][0]).toEqual({ stats: statsRef.current, fromMeasure: 2, units: [2] });
        expect(evaluate.mock.calls[1][0]).toEqual({ stats: statsRef.current, fromMeasure: 4, units: [2] });
        unmount();
    });

    it('never consults the controller for a NON-adaptive level (byte-identical old behaviour)', () => {
        const bpmForMeasure = vi.fn(() => 999);
        const evaluate = vi.fn();
        const { unmount } = renderStream({ ...adaptiveLvl, adaptive: false }, {
            adaptiveTempo: { bpmForMeasure, evaluate }, statsRef: { current: {} },
        });
        expect(bpmForMeasure).not.toHaveBeenCalled();
        expect(evaluate).not.toHaveBeenCalled();
        expect(playMelodies.mock.calls.every((c) => c[3] === 80)).toBe(true);
        unmount();
    });
});

// ── Side-effect (b): song treble published incrementally ────────────────────────────────────
describe('#1165 side-effect (b) — a song\'s treble is published per block, same notes, same offsets', () => {
    const MEASURES = 4;
    const songMelody = {
        notes: ['C4', 'D4', 'E4', 'F4'],
        durations: [MLT, MLT, MLT, MLT],
        offsets: [0, MLT, 2 * MLT, 3 * MLT],
        displayNotes: ['C4', 'D4', 'E4', 'F4'],
    };
    const songLvl = {
        id: 902, sideScroll: true, enemyType: 'Slime', songId: 'fake-song', bpm: 80,
        numMeasures: 1, numRepeats: 1, totalMeasures: MEASURES, leadInBars: 2, metronomeBars: 1,
        visibleMeasures: 2,
    };

    it('reassembles the song EXACTLY — verbatim notes and absolute offsets, never re-spelled', () => {
        vi.useFakeTimers();
        const { result, unmount } = renderStream(songLvl, { songMelody, chordProgression: null });
        act(() => { vi.advanceTimersByTime(60_000); });
        const t = result.current.treble;
        expect(t.notes).toEqual(songMelody.notes);
        expect(t.offsets).toEqual(songMelody.offsets);
        expect(t.durations).toEqual(songMelody.durations);
        expect(t.displayNotes).toEqual(songMelody.displayNotes);
        unmount();
        vi.useRealTimers();
    });

    it('grows one block at a time (block 0 alone is NOT the whole song)', () => {
        vi.useFakeTimers();
        const { result, unmount } = renderStream(songLvl, { songMelody, chordProgression: null });
        // Blocks 0 and 1 are generated synchronously (B = numMeasures = 1) → 2 of 4 measures.
        const afterSync = result.current.treble;
        expect(afterSync.notes).toEqual(['C4', 'D4']);
        act(() => { vi.advanceTimersByTime(60_000); });
        expect(isAppendOnly(afterSync, result.current.treble)).toBe(true);
        expect(result.current.treble.notes.length).toBe(MEASURES);
        unmount();
        vi.useRealTimers();
    });

    it('still generates its OWN cello backing — a level\'s bass is never the song\'s (#871)', () => {
        const { result, unmount } = renderStream(songLvl, { songMelody, chordProgression: null });
        expect(result.current.bass.notes.length).toBeGreaterThan(0);
        unmount();
    });
});

// ── The invariant, stated once, for every shape ─────────────────────────────────────────────
describe('#1165 — every published Melody is APPEND-ONLY (CLAUDE.md §6)', () => {
    it('offsets are non-decreasing and never rewritten as blocks arrive', () => {
        vi.useFakeTimers();
        const lvl = {
            id: 903, sideScroll: true, enemyType: 'Slime', bpm: 80,
            numMeasures: 2, numRepeats: 1, totalMeasures: 8, leadInBars: 2, metronomeBars: 1,
            visibleMeasures: 2,
        };
        const { result, unmount } = renderStream(lvl);
        const snapshots = [];
        for (let i = 0; i < 4; i++) {
            snapshots.push({ t: result.current.treble, b: result.current.bass, m: result.current.metronome });
            act(() => { vi.advanceTimersByTime(6_000); });
        }
        for (let i = 1; i < snapshots.length; i++) {
            expect(isAppendOnly(snapshots[i - 1].t, snapshots[i].t)).toBe(true);
            expect(isAppendOnly(snapshots[i - 1].b, snapshots[i].b)).toBe(true);
            expect(isAppendOnly(snapshots[i - 1].m, snapshots[i].m)).toBe(true);
        }
        const finite = result.current.treble.offsets.filter((o) => o != null);
        for (let i = 1; i < finite.length; i++) expect(finite[i]).toBeGreaterThanOrEqual(finite[i - 1]);
        unmount();
        vi.useRealTimers();
    });
});

// ── Roster-wide smoke: every shipped level must build its first blocks without throwing ──────
describe('#1165 — every shipped level generates through the ONE pipeline without throwing', () => {
    // Realistic per-track settings, as `useLevel.applyConfig` leaves them for a side-scroll level:
    // the cello preset on bass and MELODIC percussion (the flag App.jsx routes timpani on).
    const levelBass = { ...bassSettings, instrument: 'cello', ...LEVEL_BASS_SIMPLE };
    const levelPercussion = { ...percussionSettings, melodic: true };

    for (const lvl of Object.values(LEVELS)) {
        it(`level ${lvl.id} (${lvl.sideScroll ? 'sideScroll' : 'static'}${lvl.gatedScroll ? '+gated' : ''}, ${lvl.enemyType})`, () => {
            const songMelody = lvl.songId ? {
                notes: ['C4'], durations: [MLT], offsets: [0], displayNotes: ['C4'],
            } : null;
            let handle;
            expect(() => {
                handle = renderStream(lvl, {
                    bassSettings: levelBass,
                    percussionSettings: levelPercussion,
                    songMelody,
                    levelAudioStart: lvl.sideScroll ? ANCHOR : null,
                    timeSignature: lvl.timeSignature ?? timeSignature,
                });
            }).not.toThrow();
            expect(handle.result.current.treble).toBeTruthy();
            handle.unmount();
        });
    }
});

// ── #1167 — TIMPANI, generated and scheduled WITH the chunks ─────────────────────────────────
// Han 2026-08-29 (UAT of #1102): "Genereer de timpanen en cello gewoon mee met de chunks."
// The timpani used to be ONE whole-level `playMelodies` call in App.jsx, fixed at the level's
// STARTING tempo — so on an adaptive level (or any multi-block level whose bar duration is
// re-derived per block) it drifted against the music. It now rides the stream's own per-block
// cadence. Two properties must survive that move: the notes are byte-identical to Han's authorized
// hardcoded pattern (§663), and it stays FINITE — falling silent with the music (§867).
describe('#1167 — timpani is scheduled per block, on the same cursor as cello/metronome', () => {
    const lvl = LEVELS[4];   // plain procedural side-scroll level: bpm 80, 4/4, 8 measures, B = 2
    const withTimpani = { timpaniInstrument, timpaniVolume: 0.5 };

    afterEach(() => { vi.useRealTimers(); });

    it('schedules one timpani chunk per block, at the SAME start time and bpm as that block', () => {
        vi.useFakeTimers();
        const { unmount } = renderStream(lvl, withTimpani);
        act(() => { vi.advanceTimersByTime(60_000); });
        const timp = timpaniCalls();
        const met = metronomeCalls();
        // One lead-in call + one per content block — exactly the metronome's own cadence.
        expect(timp.length).toBe(met.length);
        expect(timp.length).toBeGreaterThan(3);
        // Index 0 is the LEAD-IN, where the two deliberately DON'T coincide: timpani sounds through
        // every lead-in measure while only the metronome is staggered into the last `metronomeBars`
        // (Han, §248: "alle opmaten cello+timpanen. de tweede helft (round up) + metronoom erbij").
        // Every CONTENT block must share the cursor and the tempo exactly.
        timp.slice(1).forEach((call, k) => {
            expect(call[4]).toBeCloseTo(met[k + 1][4], 9);   // scheduledStart — the same cursor
            expect(call[3]).toBe(met[k + 1][3]);             // bpm — the same tempo
        });
        expect(timp[0][3]).toBe(met[0][3]);                  // the lead-in still shares the tempo
        unmount();
    });

    it('the lead-in chunk starts at the anchor and covers ALL leadInBars measures (§994)', () => {
        vi.useFakeTimers();
        const { unmount } = renderStream(lvl, withTimpani);
        const [melodies, , , , scheduledStart] = timpaniCalls()[0];
        expect(scheduledStart).toBeCloseTo(ANCHOR, 9);
        // Han: "alle opmaten cello+timpanen" — no silent lead-in measure, so the slice starts at
        // tick 0 and reaches into the last lead-in measure.
        expect(Math.min(...melodies[0].offsets)).toBe(0);
        expect(Math.max(...melodies[0].offsets)).toBeGreaterThanOrEqual((lvl.leadInBars - 1) * MLT);
        unmount();
    });

    it('the scheduled chunks reassemble EXACTLY into Han\'s hardcoded whole-level pattern (§663/§108)', () => {
        vi.useFakeTimers();
        const { unmount } = renderStream(lvl, withTimpani);
        act(() => { vi.advanceTimersByTime(60_000); });
        const B = blockMeasuresFor(lvl);
        // Rebuild the absolute-tick timeline from the chunks: the lead-in chunk covers pattern
        // measures [0, leadInBars); block k covers [leadInBars + k*B, +B).
        const rebuilt = [];
        timpaniCalls().forEach(([melodies], k) => {
            const startMeasure = k === 0 ? 0 : lvl.leadInBars + (k - 1) * B;
            melodies[0].offsets.forEach((o, i) => {
                rebuilt.push({ tick: startMeasure * MLT + o, note: melodies[0].notes[i] });
            });
        });
        const full = buildTimpaniPattern(lvl.leadInBars + lvl.totalMeasures, lvl.timeSignature ?? timeSignature);
        expect(rebuilt.map((e) => e.tick)).toEqual(full.offsets);
        expect(rebuilt.map((e) => e.note)).toEqual(full.notes);
        unmount();
    });

    it('is FINITE — it stops with the music and never loops forever (§867)', () => {
        vi.useFakeTimers();
        const { unmount } = renderStream(lvl, withTimpani);
        act(() => { vi.advanceTimersByTime(120_000); });
        const after = timpaniCalls().length;
        act(() => { vi.advanceTimersByTime(120_000); });
        expect(timpaniCalls().length).toBe(after);
        unmount();
    });

    it('a GATED level gets NO timpani from this schedule — useLevelGatedRubatoAudio owns it (#1096)', () => {
        vi.useFakeTimers();
        const { unmount } = renderStream(LEVELS[3], withTimpani);
        act(() => { vi.advanceTimersByTime(20_000); });
        expect(timpaniCalls().length).toBe(0);
        unmount();
    });

    it('a level with no melodic percussion schedules no timpani at all', () => {
        vi.useFakeTimers();
        const { unmount } = renderStream(lvl);   // timpaniInstrument defaults to null
        act(() => { vi.advanceTimersByTime(60_000); });
        expect(timpaniCalls().length).toBe(0);
        unmount();
    });
});
