import { useRef, useCallback } from 'react';
import playMelodies from '../audio/playMelodies';
import { ticksPerSecond } from '../constants/timing';

/**
 * Rubato engine — refs, the EWMA tempo estimator, and the predictive
 * accompaniment scheduler — extracted verbatim from App.jsx
 * (ARCHITECTURE_AUDIT.md §4, Han 2026-06-19). This is a PURE MECHANICAL move:
 * every ref, constant, and function is byte-identical to the previous inline
 * App.jsx code. No timing math, no scheduling, no EWMA constant changed.
 *
 * What MOVED here:
 *   - rubatoEngageRef, rubatoEventHistoryRef, rubatoInputStateRefForwarderRef,
 *     rubatoScrollAnchorRef
 *   - RUBATO_HISTORY_LIMIT, RUBATO_EWMA_ALPHA
 *   - estimateRubatoTps, scheduleRubatoAccompaniment
 *
 * What STAYED in App (and why): the Play-button rubato interception
 * (handlePlayMelody/Continuously/Repeat), the onNoteCorrect rubato branch
 * (passed into useInputTest), the two ref-population effects, and the
 * onToggleRubato handler — all are entangled with useInputTest's outputs
 * (handleToggleInputTest, inputTestStateRef) or with React state setters and
 * cannot move cleanly. They CONSUME the refs/functions this hook exposes.
 *
 * @param {object}   deps
 * @param {AudioContext|null} deps.context
 * @param {object}   deps.instruments                - smplr instruments map
 * @param {React.MutableRefObject<number>} deps.bpmRef
 * @param {React.MutableRefObject<object>} deps.melodiesRef
 * @param {React.MutableRefObject<object>} deps.customPercussionMappingRef
 */
export default function useRubato({ context, instruments, bpmRef, melodiesRef, customPercussionMappingRef }) {
    // Rubato playback engage hook (PR-C wave 1, Han 2026-05-29).
    // When rubato is active, the Play buttons hand control to input-test mode
    // instead of starting the Sequencer's audio-time loop — the user advances
    // note-by-note from the bottom-pane keyboard. The ref is populated by a
    // useEffect AFTER useInputTest mounts; until then it's a no-op.
    const rubatoEngageRef = useRef(null);

    // PR-D wave 2 (Han 2026-05-29): predictive accompaniment for rubato.
    // Track recent advance events to estimate ticks-per-second (TPS) via EWMA;
    // when the user advances a treble note in rubato mode, schedule the
    // bass / chord / percussion notes whose offsets fall in
    // [currentTrebleOffset, nextTrebleOffset) using the estimated TPS so the
    // background tracks "catch up" with the user's tempo. Until 2 advances
    // have happened we fall back to the configured BPM.
    const rubatoEventHistoryRef = useRef([]);
    // Forwarder for inputTestStateRef — populated after useInputTest mounts so
    // onNoteCorrect can read the latest activeIndex without circular TDZ.
    const rubatoInputStateRefForwarderRef = useRef(null);
    // Scroll anchor for rubato (PR-E round 18). When isActive=true, the scroll
    // animation in useSheetMusicHighlight uses pageFraction directly instead
    // of the audio-time formula. Updated on each correct-note advance to
    // point at the NEXT expected note's tick offset so the user sees the
    // cursor glide forward into the upcoming note position.
    const rubatoScrollAnchorRef = useRef({ pageFraction: 0, isActive: false, currentFraction: 0 });
    const RUBATO_HISTORY_LIMIT = 8;
    const RUBATO_EWMA_ALPHA = 0.6; // higher → more reactive to recent intervals

    const estimateRubatoTps = useCallback(() => {
        const hist = rubatoEventHistoryRef.current;
        // BPM/5 = ticks/sec (since 5/bpm sec/tick). ticksPerSecond(bpm) = bpm/5, byte-identical
        // via the timing SSOT (Han 2026-06-19).
        if (hist.length < 2) return ticksPerSecond(bpmRef.current);
        let ewma = null;
        for (let i = 1; i < hist.length; i++) {
            const dt = hist[i].wallTime - hist[i - 1].wallTime;
            const dTicks = hist[i].offset - hist[i - 1].offset;
            if (dt <= 0 || dTicks <= 0) continue;
            const tps = dTicks / dt;
            ewma = ewma === null ? tps : RUBATO_EWMA_ALPHA * tps + (1 - RUBATO_EWMA_ALPHA) * ewma;
        }
        // ticksPerSecond(bpm) = bpm/5, byte-identical to the prior fallback (Han 2026-06-19).
        return ewma ?? ticksPerSecond(bpmRef.current);
    }, [bpmRef]);

    const scheduleRubatoAccompaniment = useCallback((currentOffset, nextOffset) => {
        if (!context || nextOffset <= currentOffset) return;
        const tps = estimateRubatoTps();
        const bpm = tps * 5;
        const m = melodiesRef.current || {};
        const playList = [];
        const instList = [];
        if (m.bass && instruments.bass) { playList.push(m.bass); instList.push(instruments.bass); }
        if (m.percussion && instruments.percussion) { playList.push(m.percussion); instList.push(instruments.percussion); }
        if (m.chordProgression && instruments.chords) { playList.push(m.chordProgression); instList.push(instruments.chords); }
        if (playList.length === 0) return;
        // Filter [currentOffset+1, nextOffset) — exclude notes at currentOffset because the
        // treble onset already played, and we want bass/chord that synced WITH the treble note
        // to play at the same tap. Actually keep currentOffset INCLUSIVE so simultaneous
        // bass/chord notes do fire alongside the treble tap.
        playMelodies(
            playList,
            instList,
            context,
            bpm,
            context.currentTime,
            null,
            [currentOffset, nextOffset],
            instruments,
            customPercussionMappingRef.current ?? null,
        );
    }, [context, instruments, estimateRubatoTps, melodiesRef, customPercussionMappingRef]);

    return {
        rubatoEngageRef,
        rubatoEventHistoryRef,
        rubatoInputStateRefForwarderRef,
        rubatoScrollAnchorRef,
        RUBATO_HISTORY_LIMIT,
        estimateRubatoTps,
        scheduleRubatoAccompaniment,
    };
}
