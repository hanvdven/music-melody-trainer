import { useState, useRef, useCallback, useEffect } from 'react';
import { LEVEL1, wavesForLevel, trebleOnlyEyes, threeLineEyes, LEVEL_BASS_SIMPLE, LEVEL_BASS_DEFAULT, DEFAULT_LEVEL_COLOR_MODE } from '../levels/levels';
import { DEFAULT_BPM, DEFAULT_TIME_SIG, DEFAULT_SCALE_TONIC, DEFAULT_SCALE_MODE } from '../constants/generatorDefaults';

// #659/#660 Level orchestration. Applies a level's config (snapshotting the prior config to restore on
// close), accumulates combat stats (defeated / misses / longest streak), counts cleared waves, and flags
// completion so the app can show the "Well done!" splash. Parametrised by the level def so it drives both
// Level 1 (static combat) and Level 2 (side-scroll). Pure state machine — the app wires the setters +
// regenerate.

// Graded timing stats (Han 2026-08-02): the side-scroll levels grade each kill (gradeHit — perfect /
// too fast / too slow / much too fast / much too slow) and award points (perfect = 1, everything else ½).
// Level 1 (no metronome) passes no grade → just defeated + 1 point.
//
// Well-done breakdown (Han 2026-08-02, 4 distinct outcomes for a "miss" — see SheetRpgLayer's combat
// effect for how each is resolved). Field names match the `reason`/`grade.category` strings SheetRpgLayer
// emits EXACTLY (no translation table) — see gradeHit.js's GRADE_LABELS for the display-label mapping:
//   - missed                 a due note was never attempted at all before its slime expired.
//   - wrongUncorrected       a wrong pitch was played while a slime was hittable, and never fixed in time.
//   - secondAttemptCorrected a wrong pitch was played, then CORRECTED before the slime expired (½ point).
//   - extraNote              a note was played while nothing was due at all (no slime in any window).
const emptyStats = () => ({
    defeated: 0, misses: 0, currentStreak: 0, longestStreak: 0, points: 0,
    perfect: 0, tooFast: 0, tooSlow: 0, muchTooFast: 0, muchTooSlow: 0,
    secondAttemptCorrected: 0, wrongUncorrected: 0, missed: 0, extraNote: 0,
    // Han 2026-08-10 ("wrong,corrected + too early... moet bovenop de too early staan"): a corrected
    // hit's OWN timing tier, tracked SEPARATELY from `secondAttemptCorrected` above (see onHit's
    // `timingTier` handling) — read by the timing-accuracy chart to stack the corrected portion on top
    // of its matching tier's bar.
    muchTooFastCorrected: 0, tooFastCorrected: 0, perfectCorrected: 0, tooSlowCorrected: 0, muchTooSlowCorrected: 0,
    // #693 round 8 (Han: "critters killed" → later reframed as the positive "critters saved y/m"):
    // `critterKilled` is the raw running count; the splash derives `saved = totalCritters - critterKilled`.
    critterKilled: 0,
});

// Level editor (Han 2026-08-06): per-track notation visibility, shared by applyConfig's initial
// application and the live debug-mode-toggle effect below. Starts from the existing
// debugOnlyLines-derived default, then lets `tracks.<name>.visible` override any ONE track explicitly
// (e.g. force bass visible on an otherwise debug-gated level) — §6c: one shared computation, not two
// copies that could drift.
const computeEyes = (lvl, debugMode) => {
    const base = lvl.debugOnlyLines
        ? (debugMode ? threeLineEyes({}, true) : trebleOnlyEyes({}, false))
        : threeLineEyes({}, true);
    // #871 (Han 2026-08-11 UAT: "percussie en bas zijn zichtbaar, terwijl er geen muziek is
    // meegegeven"): a song-backed level whose song has no bass/percussion track hides that staff by
    // default — applied BEFORE the explicit tracks.*.visible overrides below so a level can still force
    // it visible (empty) if ever needed.
    return {
        ...base,
        ...(lvl.songId && !lvl.songHasBass ? { bassEye: false } : {}),
        ...(lvl.songId && !lvl.songHasPercussion ? { percussionEye: false } : {}),
        ...(lvl.tracks?.treble?.visible != null ? { trebleEye: lvl.tracks.treble.visible } : {}),
        ...(lvl.tracks?.bass?.visible != null ? { bassEye: lvl.tracks.bass.visible } : {}),
        ...(lvl.tracks?.percussion?.visible != null ? { percussionEye: lvl.tracks.percussion.visible } : {}),
    };
};

// `setters` — the app state setters the level drives. `snapshot()` returns the current config to restore.
// `regenerate()` builds a fresh melody (a new wave) from the CURRENT settings (call AFTER applying config).
// `debugMode` (Han 2026-08-02, "in level 1 en 2, toon de bas en percussie ENKEL in debug mode") — for a
// `debugOnlyLines` level (1/2), bass/percussion visibility follows this LIVE, reacted to below, so toggling
// the app's debug mode while the level is running shows/hides them immediately — no restart needed.
export default function useLevel({ setters, snapshot, regenerate, debugMode = false }) {
    const [current, setCurrent] = useState(LEVEL1);
    const [active, setActive] = useState(false);
    const [wave, setWave] = useState(0);
    const [done, setDone] = useState(false);
    const [stats, setStats] = useState(emptyStats);
    // #693 round 8 ("enemies vanquished x/n" / "critters saved y/m"): the TOTAL denominators, reported up
    // from SheetRpgLayer (onEnemyTotal/onCritterTotal) as the melody's slime/critter counts become known.
    const [totalEnemies, setTotalEnemies] = useState(0);
    const [totalCritters, setTotalCritters] = useState(0);
    const snapRef = useRef(null);
    const activeRef = useRef(false); activeRef.current = active;
    const currentRef = useRef(current); currentRef.current = current;
    const totalWaves = wavesForLevel(current);

    // apply a level's config (takes the level explicitly so it never reads a stale `current`).
    const applyConfig = useCallback((lvl) => {
        setters.setNumMeasures(lvl.numMeasures);
        setters.setStartMeasureIndex?.(0);           // a new level restarts the measure numbering from 1
        // Bug fix (Han 2026-08-06, "na wijzigen instellingen gaan de basislevels slecht... ik zet de
        // tonic op Gb, en wil dan level 2 spelen. Die heeft nog allemaal voortekens staan, en genereert
        // helemaal niet vanuit C-majeur"): bpm/timeSignature/key used to only apply when the LEVEL itself
        // declared them (`if (lvl.bpm) ...`) — for the original levels 1-9 (bpm always set, but no
        // `key`/`timeSignature` field at all), that silently meant "whatever tonic/mode/meter the app's
        // AMBIENT state happened to be in" — which was harmless only by accident, as long as nobody
        // changed the ambient tonic before playing. Once per-level `key` became a real feature (§168) and
        // Han started actually changing the ambient tonic between sessions, every level WITHOUT its own
        // `key` inherited a random leftover tonic instead of the C-major every one of them was actually
        // authored/tuned against — wrong accidentals, wrong-key generation, and (per the linked bug
        // report) inconsistent slime timing/positions once the generated content stopped matching what
        // the rest of the pipeline expected. Han's own preferred fix ("een lijst defaults 'if none
        // provided', C majeur 4/4 etc."): every level now gets bpm/timeSignature/key applied
        // UNCONDITIONALLY, falling back to the app's own DEFAULT_BPM/DEFAULT_TIME_SIG/DEFAULT_SCALE_TONIC/
        // DEFAULT_SCALE_MODE (src/constants/generatorDefaults.js — the SAME defaults the app's own
        // initial state already uses, §6c, not new hardcoded literals) when the level doesn't specify its
        // own. A level therefore ALWAYS starts from a fully deterministic, known state regardless of
        // whatever the app was doing right before — never "whatever was ambient."
        setters.setBpm?.(lvl.bpm ?? DEFAULT_BPM);
        setters.setTimeSignature?.(lvl.timeSignature ?? DEFAULT_TIME_SIG);
        // Applied BEFORE setTrebleSettings/setBassSettings below so the level's own explicit `range`/
        // `clef` (fixed, not tonic-relative) is what's actually left in effect — setTonic's own
        // tonic-relative range sync only fires for a RELATIVE rangeMode, but ordering it first keeps this
        // correct regardless. `restore()` reverts tonic/mode from the level's own start-of-session
        // snapshot (see App.jsx's `levelSnapshot`), exactly like every other level-applied field.
        // `lvl.key?.family` (Han 2026-08-17 bug fix): undefined for procedural levels (their `mode` is
        // always a Diatonic name already, so the setSelectedMode default of `prev.family` is a no-op),
        // but song-levels now carry their own family (levels.js `songLevelDefaults`) — without it, a
        // Pentatonic song-level's key silently failed to switch out of whatever family was last active.
        setters.setSelectedMode?.(lvl.key?.mode ?? DEFAULT_SCALE_MODE, lvl.key?.family ?? null);
        setters.setTonic?.(lvl.key?.tonic ?? DEFAULT_SCALE_TONIC, true);   // true = manual override, no auto-respell
        // Level editor (Han 2026-08-06, "theme = app kleurenschema"): forces the app's global colour
        // theme for the level's duration, reverted on close (same pattern as `key` above).
        if (lvl.theme) setters.setTheme?.(lvl.theme);
        // #1045 (Han 2026-08-17, "voeg color mode toe aan de settings van een level"): forces the app's
        // note-coloring scheme for the level's duration, same unconditional-apply/restore-on-close
        // pattern as `key`/`bpm`/`timeSignature` above — `normalizeLevel` (levels.js) always fills
        // `lvl.colorMode` in (explicit level field, else DEFAULT_LEVEL_COLOR_MODE), so the `??` here is
        // just the same defensive fallback every other level-applied field also carries.
        setters.setNoteColoringMode?.(lvl.colorMode ?? DEFAULT_LEVEL_COLOR_MODE);
        // #1046 (Han 2026-08-17, "voor elke noot met een kruis of mol een courtesy accidental... zet
        // maar aan voor elk level"): color and courtesy are deliberately SEPARATE params (Han's own
        // words) — this forces the EXISTING app-wide courtesyAccidentals toggle on for every level,
        // same unconditional-apply/restore pattern as colorMode just above, rather than inventing a new
        // "always show" rendering mode. generateAccidentalMap.js's existing showCourtesy=true behavior
        // already shows an accidental on every altered note's every occurrence (full symbol on first
        // appearance in a measure, small courtesy glyph on repeats/cross-measure carry-over) — the only
        // gap was a player having toggled the app-wide setting off; this closes it for every level
        // regardless of the player's own current preference.
        setters.setCourtesyAccidentals?.(true);
        // `volume`/`visible` are level-editor-only convenience fields (read separately by
        // resolveLevelVolume/computeEyes), NOT InstrumentSettings fields — stripped before spreading
        // onto trebleSettings so they don't leave a stray unused property behind.
        const { volume: _trebleVolume, visible: _trebleVisible, ...trebleGenOverride } = lvl.tracks?.treble ?? {};
        setters.setTrebleSettings((prev) => ({
            ...prev, notesPerMeasure: lvl.notesPerMeasure, rhythmVariability: lvl.variability,
            range: lvl.range, rangeMode: 'fixed',
            // #661 rework (Han 2026-08-02): quarter/half/eighth-note grids ramping toward full richness
            // (levels.js QUARTER_GRID/HALF_NOTE_GRID/EIGHTH_NOTE_GRID), produced by the GENERATOR — NOT a
            // post-process. smallestNoteDenom/insertBeatRests/polyMultiplier are written UNCONDITIONALLY
            // (never `...(lvl.x ? {x} : {})`) on every level switch, so a value set by a PREVIOUS level in
            // the same session can never leak into this one (e.g. Level 7's eighth-note grid must not
            // carry over into Level 8) — every level (1–8) explicitly declares all three fields.
            smallestNoteDenom: lvl.smallestNoteDenom ?? 8,
            insertBeatRests: !!lvl.insertBeatRests,
            polyMultiplier: lvl.polyMultiplier ?? 1,
            // Level editor (Han 2026-08-06): `tracks.treble` (any InstrumentSettings-shaped fields —
            // notePool/randomizationRule/voices/maxLeap/preferredClef/… — see levels.js's schema
            // reference) is spread LAST so it wins over the legacy flat fields above when both are
            // present. Omitted on levels 1-9 → their behaviour is unchanged.
            ...trebleGenOverride,
        }));
        // #661 (Han 2026-08-02, "de 3 lijnen zichtbaar maken" / later "in level 1 en 2, toon de bas en
        // percussie ENKEL in debug mode"): a `debugOnlyLines` level shows treble + bass + percussion ONLY
        // while debugMode is on (else treble-only) — Levels 1–6; Levels 7/8 always show all 3. The reactive
        // effect below re-applies this whenever `debugMode` changes DURING an active debugOnlyLines level,
        // so this initial application only needs to get the START state right.
        // #663: chordsEye now follows the SAME debugOnlyLines gate as bass/percussion (Han: "laat [de
        // akkoordenprogressie] in debug ook maar zien").
        // Level editor (Han 2026-08-06): `tracks.<name>.visible` overrides the debugOnlyLines-derived
        // default for that ONE track — see computeEyes below (shared with the live debug-mode effect).
        // Bug fix (Han 2026-08-18, "na level 2 start level 3 niet... er moet een conflicterende
        // leftover van vorig level zijn"): `handleLoadSong` (App.jsx, fired for a `songId` level right
        // after this function returns — see begin() below) unconditionally PINS
        // `playbackConfig.randomize.melody`/`.chords` to `false` so the loaded song plays verbatim.
        // Nothing ever un-pinned it again for the NEXT level if that next level has no songId of its
        // own — every level start UNTIL the app restarts would silently inherit "melody pinned" from
        // whichever song-backed level last ran, however many levels ago. Explicit, unconditional reset
        // here (same cross-level-leakage guard every other field in this function already uses) so a
        // `songId` level's own pin (applied moments later by handleLoadSong, AFTER this commits) is the
        // only way `randomize` ever stays pinned — never a leftover from a PREVIOUS level.
        setters.setPlaybackConfig((prev) => ({
            ...prev, repsPerMelody: lvl.numRepeats,
            randomize: { ...prev.randomize, melody: true, chords: true },
            oddRounds: { ...prev.oddRounds, ...computeEyes(lvl, debugMode) },
            evenRounds: { ...prev.evenRounds, ...computeEyes(lvl, debugMode) },
        }));
        // #661/#663 ("gewoon op de baslijn een cello zet"): a side-scroll level's bass line plays through
        // a cello timbre — either the REAL generated bass melody at full richness (Level 8, `fixedBass:
        // false`) or the SAME generator simplified via LEVEL_BASS_SIMPLE's settings (Levels 2–7,
        // `fixedBass: true` — Han UAT: the generated melody sounded an octave too high through the cello
        // timbre; #663 REWORK: no more hardcoded pattern function, just different generator settings).
        // All fields are written UNCONDITIONALLY (same cross-level-leakage guard as
        // insertBeatRests/polyMultiplier/percussion.melodic below) so a previous level's simplified
        // values can never leak into the next.
        // Level editor (Han 2026-08-06): `tracks.bass` (any InstrumentSettings-shaped fields — see
        // levels.js's schema reference) takes precedence over the `fixedBass` boolean when present, so a
        // hand-written level can fully control the bass generator (e.g. for a future 'walking bass' level)
        // without needing a new hardcoded preset in levels.js. Omitted → unchanged `fixedBass` behaviour
        // (100% backward compatible with levels 1-9). `volume`/`visible` are stripped before this decision
        // — they're level-editor-only convenience fields (read separately, by App.jsx/computeEyes), NOT
        // InstrumentSettings fields; a level that sets ONLY `tracks.bass.volume` (no generator fields)
        // must still fall through to `fixedBass`, not silently skip the whole preset.
        const { volume: _bassVolume, visible: _bassVisible, ...bassGenOverride } = lvl.tracks?.bass ?? {};
        const hasBassGenOverride = Object.keys(bassGenOverride).length > 0;
        // #871 follow-up (Han 2026-08-11, "cello en timpanen... moeten niet op bass melody en percussion
        // melody staan; ze zouden op twee van de invisible melodies moeten staan. Geldt voor alle
        // levels."): the #871 UAT round-1 fix that skipped this preset for a no-bass song is REVERTED —
        // the level's cello backing is generated for EVERY side-scroll level unconditionally again. What
        // changed instead (App.jsx) is WHERE that generated content is scheduled/exposed: through its own
        // dedicated `celloRef` Soundfont + `LEVEL_CELLO_SLOT` invisible melody, never through
        // `instruments.bass` or the visible bass staff — so it can no longer bleed into a song that
        // provides no bass of its own. The bass STAFF itself stays hidden for such a song regardless
        // (computeEyes's `songHasBass` check below, unchanged) — this field only drives audio content now.
        if (lvl.sideScroll) setters.setBassSettings?.((prev) => ({
            ...prev, instrument: 'cello',
            ...(hasBassGenOverride ? bassGenOverride : (lvl.fixedBass ? LEVEL_BASS_SIMPLE : LEVEL_BASS_DEFAULT)),
        }));
        // #663 (Han 2026-08-03, "genereer ook akkoordenprogressie (I-I-I) tonic progressie", then "zet
        // ook voor level 1 akkoord op c" + "chords per measure naar 1"): EVERY level (1-8, not just
        // side-scroll) forces a fresh 'tonic-tonic-tonic' progression by default, fixed to C regardless of
        // the ambient melody scale (`fixedTonic` — melody/notation untouched, only the chord track's own
        // tonic moves, per Han's explicit answer), one structural chord per measure. All reuse EXISTING
        // generation fields (chordGenerator.js's strategy, useMelodyState's fixedTonic/chordCount) — no
        // hardcoded pattern. `begin()` below passes `forceNewChords: true` to the FIRST regenerate() call
        // so this actually gets exercised (regenerate() alone doesn't regenerate chords — see App.jsx's
        // levelRegenerate comment). Written UNCONDITIONALLY (same cross-level-leakage guard as the bass/
        // percussion fields above).
        // Level editor (Han 2026-08-06): an explicit `chords` object overrides the default 'tonic-tonic-
        // tonic'/1-chord-per-measure pair — e.g. a level could use `chords: { strategy: 'pop-1-5-6-4',
        // chordCount: 4 }` for real harmonic movement instead of a static drone. Omitted → unchanged
        // default (strategy/chordCount); any other chordSettings field (complexity, rhythmVariability,
        // passingChordTypes) can also be forced via `chords` when present.
        //
        // Bug fix (Han 2026-08-06, "chords hangen af van level maar volgen niet de toonladder... level
        // 113 (F#), cello staat nog in C"): `fixedTonic` used to be hardcoded 'C4' UNCONDITIONALLY
        // (Han's original #663 instruction, from before per-level `key` existed) — for any level that ALSO
        // sets its own `key.tonic` (the vocal-range/key feature added later, §168-170), the chord
        // progression's roots stayed on C regardless, and `fixedBass: true`'s cello (which follows the
        // chord roots via LEVEL_BASS_SIMPLE's `randomizationRule` — 'emphasize_roots' then,
        // 'force_chord_roots' since #925) audibly played the
        // WRONG key. Fix: defaults to the level's OWN `key.tonic` when set, falling back to the original
        // 'C4' only when the level has no `key` at all — levels 1-9 (no `key` field) are byte-identical.
        setters.setChordSettings?.((prev) => ({
            ...prev, strategy: 'tonic-tonic-tonic', fixedTonic: lvl.key?.tonic ?? 'C4', chordCount: 1, ...lvl.chords,
        }));
        // #661 ("melodische percussie … percussie de timpanen"): percussion becomes the fixed pitched
        // timpani pattern (utils/timpaniPattern.js) — the level's dedicated timpani audio keys off this
        // flag. Written UNCONDITIONALLY (mirrors insertBeatRests/polyMultiplier above) so it can never
        // leak between levels.
        // #871 follow-up (Han 2026-08-11): REVERTED the "no percussion track -> no timpani" UAT round-1
        // fix, same reasoning as bass above — timpani is generated for EVERY side-scroll level again
        // (it already lives on its own dedicated `timpaniRef`/`LEVEL_TIMPANI_SLOT`, never the visible
        // percussion staff). The percussion STAFF stays hidden for a no-percussion song regardless
        // (computeEyes's `songHasPercussion` check below, unchanged).
        // #1052 (Han 2026-08-17, gated-scroll levels): a gated level never schedules timpani at all
        // (App.jsx's one-shot scheduling call is gated on `!lvl.gatedScroll` — see its own comment), so
        // showing "melodic" percussion notation there would promise pitched timpani audio that never
        // plays. Excluded the same way a non-side-scroll level already is.
        setters.setPercussionSettings?.((prev) => ({ ...prev, melodic: !!lvl.sideScroll && !lvl.gatedScroll }));
        setters.setShowChordsOddRounds?.(false);
        setters.setShowChordsEvenRounds?.(false);
        // #661 (Han UAT): a side-scroll level is ONE continuous piece — it must NOT paginate, or the melody
        // (and its slimes) get sliced to a single page and only part of the measures scroll in ("5 of 8").
        // 'wipe' does not slice the melody (only 'pagination' does); the static staff is hidden anyway.
        if (lvl.sideScroll) setters.setAnimationMode?.('wipe');
    }, [setters, debugMode]);

    // Live debug-mode reactivity (Han 2026-08-02): toggling the app's debug mode WHILE a `debugOnlyLines`
    // level (1/2) is running immediately shows/hides bass+percussion — no level restart needed. A no-op
    // for Level 3 (debugOnlyLines=false) and while no level is active.
    useEffect(() => {
        if (!active || !current?.debugOnlyLines) return;
        const eyes = computeEyes(current, debugMode);
        setters.setPlaybackConfig((prev) => ({
            ...prev, oddRounds: { ...prev.oddRounds, ...eyes }, evenRounds: { ...prev.evenRounds, ...eyes },
        }));
    }, [debugMode, active, current, setters]);

    const begin = useCallback((lvl) => {
        applyConfig(lvl);
        setStats(emptyStats()); setWave(0); setDone(false); setActive(true);
        setTotalEnemies(0); setTotalCritters(0);
        pendingSongEndRef.current = false;
        // #871: a level with `songId` plays that FIXED song (via App's `loadSong` setter → the existing
        // handleLoadSong pipeline) instead of generating one — applyConfig above has already back-filled
        // this level's bpm/timeSignature/numMeasures/etc. from the song definition (levels.js's
        // songLevelDefaults), so nothing else here needs to branch on songId.
        if (lvl.songId) {
            setters.loadSong(lvl.songId);
        } else {
            // #663: force a fresh chord regeneration on the level's FIRST wave only — applyConfig just set
            // chordSettings.strategy to 'tonic-tonic-tonic' for side-scroll levels; without forceNewChords,
            // regenerate() would just adapt whatever progression was left over from normal play.
            regenerate(true);
        }
    }, [applyConfig, regenerate, setters]);

    const start = useCallback((lvl = LEVEL1) => { snapRef.current = snapshot(); setCurrent(lvl); begin(lvl); }, [snapshot, begin]);
    const replay = useCallback(() => begin(currentRef.current), [begin]);   // keep the snapshot; restart the run

    // combat stat hooks (only meaningful while active — the app passes these only then).
    // `grade` = { category, points } from gradeHit (side-scroll); undefined for ungraded (Level 1) hits.
    const onHit = useCallback((grade) => setStats((s) => {
        const cs = s.currentStreak + 1;
        const g = grade || { category: null, points: 1 };
        // #862 follow-up (Han 2026-08-10, "ik wil dat elke balk in twee gesplitst wordt... L R"): `hand`
        // ('treble'|'bass', set at the SheetRpgLayer/useTwoHandedBass call sites) additionally bumps a
        // `${category}_${hand}` stat — alongside, never instead of, the combined unsuffixed one, so every
        // existing formula/chart that reads the combined stats is completely unaffected. Dynamic key,
        // same pattern as the `${tier}Corrected` stat below (§6c — one mechanism, not two).
        const handSuffix = g.hand ? `_${g.hand}` : '';
        return {
            ...s, defeated: s.defeated + 1, currentStreak: cs, longestStreak: Math.max(s.longestStreak, cs),
            points: s.points + g.points,
            ...(handSuffix ? { [`defeated${handSuffix}`]: (s[`defeated${handSuffix}`] || 0) + 1 } : {}),
            ...(g.category ? { [g.category]: (s[g.category] || 0) + 1 } : {}),
            ...(g.category && handSuffix ? { [`${g.category}${handSuffix}`]: (s[`${g.category}${handSuffix}`] || 0) + 1 } : {}),
            // Han 2026-08-10 ("wrong,corrected + too early... moet bovenop de too early staan"): a
            // corrected hit's OWN timing tier (SheetRpgLayer's `grade.timingTier`, set only for
            // secondAttemptCorrected hits) bumps a SEPARATE `${tier}Corrected` stat — one hit, two
            // facts (correctness verdict + timing tier), so neither `defeated`/`points`/streak nor the
            // `secondAttemptCorrected` bump above is double-counted.
            ...(g.timingTier ? { [`${g.timingTier}Corrected`]: (s[`${g.timingTier}Corrected`] || 0) + 1 } : {}),
            ...(g.timingTier && handSuffix ? { [`${g.timingTier}Corrected${handSuffix}`]: (s[`${g.timingTier}Corrected${handSuffix}`] || 0) + 1 } : {}),
        };
    }), []);
    // `reason` = 'missed' | 'wrongUncorrected' | 'extraNote' (see emptyStats above) — each breaks the
    // streak and bumps the total `misses` count (used for the overall accuracy %) plus its own stat row.
    // `hand` — see onHit's own comment above; same additive `${reason}_${hand}` stat.
    const onMiss = useCallback((reason, hand) => setStats((s) => {
        const handSuffix = hand ? `_${hand}` : '';
        return {
            ...s, misses: s.misses + 1, currentStreak: 0,
            ...(reason ? { [reason]: (s[reason] || 0) + 1 } : {}),
            ...(reason && handSuffix ? { [`${reason}${handSuffix}`]: (s[`${reason}${handSuffix}`] || 0) + 1 } : {}),
        };
    }), []);
    // #693 round 8 (Han: "als personage een critter slaat kost dat -1/2 punt, die gaat dood"): a critter
    // hit is its own outcome — NOT a `misses`/streak-breaking event (it isn't tied to a due note the
    // player failed), just a direct point deduction + its own running count (the splash derives the
    // positively-framed "critters saved" from `totalCritters - critterKilled`).
    const onCritterKilled = useCallback(() => setStats((s) => ({
        ...s, critterKilled: s.critterKilled + 1, points: s.points - 0.5,
    })), []);

    // #688 (Han 2026-08-04, "end of level splash screen: niet bij laatste noot, maar pas wanneer end of song
    // (laatste maatstreep) de hit zone bereikt"): for a SIDE-SCROLL level, the splash must wait for the
    // final barline to visually reach the strike line — NOT fire the instant the last note/wave resolves
    // (which can be measures before the tail of the piece has even scrolled into view). `pendingSongEndRef`
    // marks "waves are all cleared, but still waiting for the visual/audio tail to finish"; `onSongEnd`
    // (called by SheetRpgLayer once it detects the final barline crossing the hit zone, on the SAME
    // audio-anchored clock everything else there uses) is what actually flips `done`. Non-side-scroll levels
    // (static combat, no scroll to wait for) keep the original immediate behaviour.
    const pendingSongEndRef = useRef(false);
    const onSongEnd = useCallback(() => {
        if (pendingSongEndRef.current) { pendingSongEndRef.current = false; setDone(true); }
    }, []);

    // a cleared slime-wave. Returns true if the level consumed it (so the app skips its default regen). At the
    // target wave count → done (splash); otherwise spawn the next wave.
    const onWaveCleared = useCallback(() => {
        if (!activeRef.current) return false;
        const tw = wavesForLevel(currentRef.current);
        setWave((w) => {
            const next = w + 1;
            if (next >= tw) {
                if (currentRef.current?.sideScroll) pendingSongEndRef.current = true;
                else setDone(true);
            } else regenerate();
            return next;
        });
        return true;
    }, [regenerate]);

    const restore = useCallback(() => {
        const s = snapRef.current;
        if (!s) return;
        setters.setNumMeasures(s.numMeasures);
        setters.setBpm?.(s.bpm);
        // Level editor (Han 2026-08-06): revert a level's `timeSignature` override (if any) — same
        // snapshot/restore guarantee as bpm above.
        setters.setTimeSignature?.(s.timeSignature);
        setters.setTrebleSettings(() => s.trebleSettings);
        setters.setBassSettings?.(() => s.bassSettings);   // restores the pre-level bass instrument (cello only during a level)
        setters.setPercussionSettings?.(() => s.percussionSettings);   // restores melodic flag + percussion kit
        setters.setChordSettings?.(() => s.chordSettings);   // restores the pre-level chord strategy (#663)
        setters.setPlaybackConfig(() => s.playbackConfig);
        setters.setShowChordsOddRounds?.(s.showChordsOddRounds);
        setters.setShowChordsEvenRounds?.(s.showChordsEvenRounds);
        setters.setAnimationMode?.(s.animationMode);   // restore the user's animation mode (see applyConfig)
        // Level editor (Han 2026-08-06): revert a level's `key` override (if any) — mode first, then tonic
        // with the manual-override flag so it lands on the EXACT pre-level tonic, not a minimize-accidentals
        // respelling of it. `s.selectedFamily` (Han 2026-08-17 bug fix) so a level that switched scale
        // FAMILY (e.g. a Pentatonic song-level) restores the pre-level family too, not just the mode name
        // inside whatever family the level itself left active.
        setters.setSelectedMode?.(s.selectedMode, s.selectedFamily ?? null);
        setters.setTonic?.(s.tonic, true);
        // Level editor (Han 2026-08-06): revert a level's `theme` override (if any) to whatever the
        // user had selected before the level started.
        setters.setTheme?.(s.theme);
        // #1045 (Han 2026-08-17): revert a level's `colorMode` override to whatever note-coloring
        // scheme the user had selected before the level started (same pattern as theme above).
        setters.setNoteColoringMode?.(s.noteColoringMode);
        // #1046 (Han 2026-08-17): revert the forced-on courtesyAccidentals to whatever the player had
        // set before the level started (same pattern as colorMode/theme above).
        setters.setCourtesyAccidentals?.(s.courtesyAccidentals);
    }, [setters]);

    const close = useCallback(() => {
        restore();
        setActive(false); setDone(false); setWave(0);
        regenerate();   // rebuild a normal melody from the restored config
    }, [restore, regenerate]);

    return {
        active, done, wave, totalWaves, stats, current, start, replay, close, onHit, onMiss, onWaveCleared, onSongEnd,
        onCritterKilled, totalEnemies, totalCritters, setTotalEnemies, setTotalCritters,
    };
}
