import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useLevelContentStream from '../useLevelContentStream';
import { LEVELS } from '../../levels/levels';
import Scale from '../../model/Scale';
import InstrumentSettings from '../../model/InstrumentSettings';
import { TICKS_PER_WHOLE, TICKS_PER_BEAT, secondsPerTick } from '../../constants/timing';
import { outputLatencySeconds, MAX_COMPENSATED_LATENCY_S } from '../../audio/audioOutputLatency';

vi.mock('../../audio/playMelodies', () => ({ default: vi.fn(() => 0) }));
import playMelodies from '../../audio/playMelodies';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// #1186 — FRAME-PERFECT SYNC (Han 2026-08-29: "de noot valt niet EXACT tegelijk met de metronoom
// klik op de perfect hit mark (de rode streep). Dit moet echt 100% frame perfect zijn").
//
// THREE moments must coincide for one note:
//   1. the AUDIO time its beat's metronome click is heard,
//   2. the AUDIO time its own track (cello / Wizard cast) is heard,
//   3. the moment SheetRpgLayer's visual clock puts it on the strike line.
//
// (3) is not rendered here — it is pure arithmetic, and this file reproduces SheetRpgLayer's OWN
// formula verbatim (see `strikeCrossTime` below) so the two can be compared without mounting a
// 3000-line RPG layer. That is the whole point of the invariant: the visual crossing time is a
// closed form of `levelAudioStart`, `beatsOnScreen`, `beatMs` and the note's tick, and it must
// equal what the audio layer was actually asked to play.
//
// The #1186 investigation MEASURED all three on a plain non-adaptive level and found the
// arithmetic already exact to 0.000000 ms — and the real, unmodelled offset to be the audio
// hardware's own output latency (48 ms in this project's Chromium), which made every audible
// event land that much AFTER the visual one. Hence the second block of tests: the schedule must
// now be issued `outputLatency` early, and the HEARD time must be the one that lines up.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const scale = Scale.defaultScale();
const percussionScale = Scale.defaultPercussionScale();
const trebleSettings = InstrumentSettings.defaultTrebleInstrumentSettings();
const bassSettings = InstrumentSettings.defaultBassInstrumentSettings();
const percussionSettings = InstrumentSettings.defaultPercussionInstrumentSettings();
const chordSettings = InstrumentSettings.defaultChordInstrumentSettings();
const metronomeSettings = InstrumentSettings.defaultMetronomeInstrumentSettings();
const bassInstrument = { name: 'cello' };
const metronomeInstrument = { name: 'woodblock' };
const wizardInstrument = { name: 'wizard' };

const ANCHOR = 10;              // levelAudioStart, in AudioContext seconds
const DEFAULT_TS = [4, 4];      // module-level: `timeSignature` is in the stream effect's dep array

/**
 * Mount the real content stream for `lvl` and run its clock past `measures` content measures.
 * `outputLatency` goes on the fake AudioContext exactly as a browser would report it.
 */
function runLevel(lvl, { outputLatency, measures = 12 } = {}) {
    const ts = lvl.timeSignature ?? DEFAULT_TS;
    const context = { currentTime: 0, ...(outputLatency != null ? { outputLatency } : {}) };
    const wizardStopFnsRef = { current: [] };
    const backingStopFnsRef = { current: [] };
    let published = null;
    const hook = renderHook(() => {
        published = useLevelContentStream({
            active: true, lvl, scale, timeSignature: ts,
            trebleSettings, bassSettings, percussionSettings, chordSettings, metronomeSettings,
            percussionScale, chordProgression: null, context, levelAudioStart: ANCHOR,
            wizardInstrument, wizardVolume: 1, wizardStopFnsRef,
            bassInstrument, metronomeInstrument, backingStopFnsRef,
            bassReady: true, metronomeReady: true, levelMelodyReady: true,
        });
        return published;
    });
    const mls = (TICKS_PER_WHOLE * ts[0]) / ts[1];
    const barSec = mls * secondsPerTick(lvl.bpm);
    act(() => {
        for (let t = 0; t < (lvl.leadInBars + measures) * barSec + ANCHOR; t += 0.25) {
            context.currentTime += 0.25;
            vi.advanceTimersByTime(250);
        }
    });
    return { ...hook, context, mls, barSec, treble: () => published.treble };
}

/**
 * Every moment a metronome click is HEARD, reconstructed from the arguments the audio layer was
 * actually handed. `playMelodies(melodies, instruments, context, bpm, scheduledStart, …)` plays a
 * note at `scheduledStart + tick · secondsPerTick(bpm)`, and that sound reaches the speakers
 * `latency` later — so the heard time is that sum plus the latency the stream subtracted.
 */
const heardClickTimes = (latency) => {
    const out = [];
    for (const [melodies, instruments, , bpm, scheduledStart] of playMelodies.mock.calls) {
        if (instruments[0] !== metronomeInstrument) continue;
        const chunk = melodies[0];
        const tf = secondsPerTick(bpm);
        chunk.offsets.forEach((o, i) => {
            const n = chunk.notes[i];
            if (n === 'r' || n == null) return;
            out.push(scheduledStart + o * tf + latency);
        });
    }
    return out.sort((a, b) => a - b);
};

/**
 * SheetRpgLayer's OWN strike-line crossing time for a treble note, verbatim:
 *   the visual clock's t=0 is `levelAudioStart`; a note spawns at its own `beat`
 *   (= tick / TICKS_PER_BEAT, the content timeline) and travels for `beatsOnScreen` beats
 *   (`sideScrollX`: `msSinceSpawn = elapsed − beat·beatMs`, arrival at `msSinceSpawn === beatsOnScreen·beatMs`).
 */
const strikeCrossTime = (lvl, tick) => {
    const beatMs = 60000 / lvl.bpm;
    return ANCHOR + ((tick / TICKS_PER_BEAT + lvl.beatsOnScreen) * beatMs) / 1000;
};

const realNoteTicks = (melody, limit) => {
    const out = [];
    for (let i = 0; i < melody.notes.length && out.length < limit; i++) {
        if (melody.notes[i] === 'r' || melody.notes[i] == null || melody.offsets[i] == null) continue;
        out.push(melody.offsets[i]);
    }
    return out;
};

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

// ── The invariant the whole sync rests on ────────────────────────────────────────────────────
describe('#1186 — §108 holds numerically for every side-scroll level', () => {
    it('beatsOnScreen · TICKS_PER_BEAT === leadInBars · measureLengthTicks', () => {
        const sideScrollLevels = Object.values(LEVELS).filter((l) => l.sideScroll);
        expect(sideScrollLevels.length).toBeGreaterThan(0);
        for (const lvl of sideScrollLevels) {
            const ts = lvl.timeSignature ?? DEFAULT_TS;
            const mls = (TICKS_PER_WHOLE * ts[0]) / ts[1];
            // If this ever fails, the visual flight span and the lead-in no longer describe the same
            // stretch of music and NOTHING downstream can be frame-perfect.
            expect(lvl.beatsOnScreen * TICKS_PER_BEAT).toBe(lvl.leadInBars * mls);
        }
    });
});

// ── The three moments coincide ───────────────────────────────────────────────────────────────
describe('#1186 — the note lands on the strike line at the instant its metronome click is heard', () => {
    const lvl = LEVELS[4];   // plain procedural side-scroll level, no adaptive tempo, no Wizard

    it('every note coincides with a click, to the nanosecond, with NO reported latency', () => {
        const run = runLevel(lvl, { outputLatency: undefined });
        const clicks = heardClickTimes(0);
        const ticks = realNoteTicks(run.treble(), 12);
        expect(ticks.length).toBe(12);
        for (const tick of ticks) {
            const strike = strikeCrossTime(lvl, tick);
            const nearest = clicks.reduce((a, b) => (Math.abs(b - strike) < Math.abs(a - strike) ? b : a));
            // A note that falls on a beat must be EXACTLY on that beat's click. Notes between beats
            // (off-beat eighths) are never further from one than half a beat.
            expect(Math.abs(nearest - strike)).toBeLessThan(30 / lvl.bpm + 1e-9);
            if (tick % TICKS_PER_BEAT === 0) expect(nearest).toBeCloseTo(strike, 9);
        }
        run.unmount();
    });

    it('still coincides once the hardware reports a real output latency', () => {
        const latency = 0.048;   // the value measured in this project's own Chromium at 48 kHz
        const run = runLevel(lvl, { outputLatency: latency });
        const clicks = heardClickTimes(latency);
        for (const tick of realNoteTicks(run.treble(), 12)) {
            if (tick % TICKS_PER_BEAT !== 0) continue;
            const strike = strikeCrossTime(lvl, tick);
            const nearest = clicks.reduce((a, b) => (Math.abs(b - strike) < Math.abs(a - strike) ? b : a));
            expect(nearest).toBeCloseTo(strike, 9);
        }
        run.unmount();
    });

    it('the accumulated block cursor never drifts from the closed form', () => {
        const run = runLevel(lvl, {});
        const contentStart = ANCHOR + lvl.leadInBars * run.barSec;
        const B = lvl.numMeasures ?? 2;
        const bassCalls = playMelodies.mock.calls.filter((c) => c[1][0] === bassInstrument);
        expect(bassCalls.length).toBeGreaterThan(3);
        bassCalls.slice(1).forEach((call, k) => {
            expect(call[4]).toBeCloseTo(contentStart + k * B * run.barSec, 9);
        });
        run.unmount();
    });
});

// ── The correction itself ────────────────────────────────────────────────────────────────────
describe('#1186 — level audio is scheduled `outputLatency` early so it is HEARD on time', () => {
    const lvl = LEVELS[4];

    it('subtracts the reported outputLatency from every scheduled start', () => {
        const latency = 0.048;
        const withLatency = runLevel(lvl, { outputLatency: latency, measures: 6 });
        const shifted = playMelodies.mock.calls.map((c) => c[4]);
        withLatency.unmount();

        vi.clearAllMocks();
        const plain = runLevel(lvl, { outputLatency: 0, measures: 6 });
        const unshifted = playMelodies.mock.calls.map((c) => c[4]);
        plain.unmount();

        expect(shifted).toHaveLength(unshifted.length);
        shifted.forEach((s, i) => expect(unshifted[i] - s).toBeCloseTo(latency, 9));
    });

    it('falls back to baseLatency, and to zero, when outputLatency is absent', () => {
        expect(outputLatencySeconds({ outputLatency: 0.048, baseLatency: 0.0107 })).toBe(0.048);
        expect(outputLatencySeconds({ baseLatency: 0.0107 })).toBe(0.0107);
        expect(outputLatencySeconds({})).toBe(0);
        expect(outputLatencySeconds(null)).toBe(0);
    });

    it('caps a pathological reading so a level can never be scheduled into the past', () => {
        // App.jsx picks its anchor only 1.0 s ahead; an uncapped bogus value would land the opening
        // bars behind `context.currentTime`, where playMelodies silently clamps them to "now" (§166).
        expect(outputLatencySeconds({ outputLatency: 12 })).toBe(MAX_COMPENSATED_LATENCY_S);
        expect(outputLatencySeconds({ outputLatency: NaN })).toBe(0);
        expect(outputLatencySeconds({ outputLatency: -1 })).toBe(0);
    });
});
