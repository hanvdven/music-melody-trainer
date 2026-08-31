import React, { createContext, useContext, useState, useRef, useCallback, useMemo, useEffect } from 'react';
import logger from '../utils/logger';
import { getNoteSemitone } from '../theory/noteUtils';
import {
    XP_TABLE,
    MULTIPLIED_EVENTS,
    SKILL_BRANCHES,
    RATING_BRANCHES,
    levelFromXP,
    tierName,
    skillScore,
    attributeBranches,
    xpMultiplier,
    evaluateStreak,
    effectiveStreakDays,
    localDateISO,
    difficultyToRating,
    gradedOutcome,
    updateRating,
} from '../utils/gamification';

const STORAGE_KEY = 'music-trainer-profile';
// v2 (#129 rework): branchXP → ELO-style skillRatings + consistencyXP scalar.
// v3 (#268): + exerciseProgress — per-exercise persistent counters (additive).
// v4 (#1054): + levelMastery — a FOURTH, separate progress axis (highest level cleared at >=80%, known
// scales/songs, play/perfect counts), independent of skillRatings/consistencyXP (docs/architecture.md
// §43) and the on-hold 11-dimension profile-schema.md design. Additive, like v3.
// v5 (#1099): + anpm — a single scalar (accurate notes per minute), NOT part of levelMastery: unlike
// every levelMastery field (all ratchets, only ever grow), anpm is an EWMA that can rise OR fall — it
// estimates the player's CURRENT sustainable reading speed, not a lifetime best. Additive, like v3/v4.
const PROFILE_VERSION = 5;

// #1099 (Han 2026-08-22, "dit is een getal dat steeds aanpast" — confirmed via chat interview: an
// exponential moving average, not a ratchet, so it can track a player getting slower again, not just
// their all-time peak). ALPHA is the EWMA smoothing weight given to the LATEST qualifying sample — named
// and exported so recordLevelCompletion's math is self-documenting instead of a bare literal.
export const ANPM_EWMA_ALPHA = 0.3;

// #1054 (Han 2026-08-20): the level-mastery axis's empty shape — its own function (not inlined in
// defaultProfile) so `recordLevelCompletion` can fall back to it for a pre-v4 save that predates the
// field (§6c, one source of truth for "what an empty levelMastery looks like").
function defaultLevelMastery() {
    return {
        highestLevelAt80: null,
        knownScales: [],   // ratchet — "tonic:mode" keys, e.g. "C4:Major"; never removed once earned
        knownSongs: [],    // ratchet — songId strings; never removed once earned
        playCounts: {},    // key (songId ?? numeric levelId) -> completion count
        perfectCounts: {}, // same keys -> count of completions at exactly 100% accuracy
    };
}

// Scale families in display order (matches scaleDefinitions keys + Simple)
export const ALL_SCALE_FAMILIES = [
    'Simple',
    'Diatonic',
    'Pentatonic',
    'Melodic',
    'Harmonic Minor',
    'Harmonic Major',
    'Hexatonic',
    'Double Harmonic',
    'Other Heptatonic',
    'Supertonic',
];

const DEFAULT_UNLOCKED = new Set(['Diatonic', 'Simple']);

// Gamification profile v1 (kanban #142). One versioned object under the SAME
// localStorage key that previously held { unlockedFamilies, debugMode } — the
// legacy shape is migrated losslessly in loadProfile().
function defaultProfile() {
    return {
        version: PROFILE_VERSION,
        unlockedFamilies: [...DEFAULT_UNLOCKED],
        debugMode: false,
        gamificationEnabled: true,
        totalXP: 0,
        // ELO-style ratings 0–100 per performance branch (#129 rework): updated
        // per completed input-test melody vs the settings' difficulty; can drop.
        // Stored unrounded; display rounds.
        skillRatings: { ear: 0, sightReading: 0, rhythm: 0, harmony: 0 },
        // Consistency is not a win/loss skill — it keeps the asymptotic XP curve
        // (fed by streak days and long sessions).
        consistencyXP: 0,
        streak: { days: 0, lastActiveDate: null, freezeTokens: 0 },
        // Novelty tracking for newKey/newScale XP: keys by semitone pitch class
        // (enharmonics count once), scales by 'family:mode'.
        lifetime: { keys: {}, scales: {} },
        // #268: persistent per-exercise progress — exerciseId → counters.
        // In rubato a melody cannot be failed, so "progress" = completions,
        // not a pass/fail score (per the ticket).
        exerciseProgress: {},
        // #1054: level-based progress — see defaultLevelMastery()'s own comment.
        levelMastery: defaultLevelMastery(),
        // #1099: accurate notes per minute — see PROFILE_VERSION's own v5 comment. null until the first
        // level completion at >=90% accuracy (no reading yet, not "zero speed").
        anpm: null,
    };
}

function loadProfile() {
    let raw;
    try {
        raw = localStorage.getItem(STORAGE_KEY);
    } catch {
        return defaultProfile(); // storage unavailable (private mode etc.)
    }
    if (!raw) return defaultProfile();
    let saved;
    try {
        saved = JSON.parse(raw);
    } catch (e) {
        // Corrupt JSON — start fresh rather than crash; the old value is unrecoverable.
        logger.warn('ProfileContext', 'corrupt profile JSON, resetting to defaults', e);
        return defaultProfile();
    }
    const base = defaultProfile();
    // Legacy (unversioned) shape had only { unlockedFamilies, debugMode }.
    // Spreading saved over defaults migrates it AND forward-fills any field
    // added in later versions — per-field merge for the nested objects so a
    // partial save never drops siblings.
    const merged = {
        ...base,
        ...saved,
        version: PROFILE_VERSION,
        unlockedFamilies: saved.unlockedFamilies ?? base.unlockedFamilies,
        skillRatings: { ...base.skillRatings, ...(saved.skillRatings || {}) },
        streak: { ...base.streak, ...(saved.streak || {}) },
        lifetime: {
            keys: { ...(saved.lifetime?.keys || {}) },
            scales: { ...(saved.lifetime?.scales || {}) },
        },
        // #268 (v3, additive): older saves simply lack the field.
        exerciseProgress: { ...(saved.exerciseProgress || {}) },
        // #1054 (v4, additive): per-field merge so a pre-v4 save (missing the whole field) still gets
        // the full default shape, and a partial v4 save never drops a sibling array/object.
        levelMastery: {
            ...defaultLevelMastery(),
            ...(saved.levelMastery || {}),
            knownScales: [...(saved.levelMastery?.knownScales || [])],
            knownSongs: [...(saved.levelMastery?.knownSongs || [])],
            playCounts: { ...(saved.levelMastery?.playCounts || {}) },
            perfectCounts: { ...(saved.levelMastery?.perfectCounts || {}) },
        },
        // #1099 (v5, additive): a plain scalar, no nested shape to per-field merge — a pre-v5 save simply
        // lacks the key, `??` supplies the "no reading yet" default.
        anpm: saved.anpm ?? null,
    };
    // v1 → v2 (#129 rework): the old volume-based branchXP becomes the STARTING
    // rating (its displayed score carries over); consistency keeps its XP pool.
    if (saved.version === 1 && saved.branchXP) {
        for (const b of RATING_BRANCHES) {
            merged.skillRatings[b] = skillScore(saved.branchXP[b] ?? 0);
        }
        merged.consistencyXP = saved.branchXP.consistency ?? 0;
        delete merged.branchXP; // v2 has no branchXP field
    }
    return merged;
}

// Displayed 0–100 skill scores for all five branches from a profile object.
function currentSkills(p) {
    const skills = {};
    for (const b of RATING_BRANCHES) skills[b] = Math.round(p.skillRatings[b]);
    skills.consistency = skillScore(p.consistencyXP);
    return skills;
}

function saveProfile(profile) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
        // Storage unavailable — ignore silently
    }
}

const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
    // The live profile lives in a REF, not state: recordEvent fires per correct
    // note during play, and a state write per note would re-render the entire
    // provider subtree (the whole app, since the provider wraps <App/>). The
    // `snapshot` state is refreshed only at flush points (session end, melody
    // complete, unlock/debug toggles) — cheap and current enough for the UI.
    const profileRef = useRef(null);
    if (profileRef.current === null) profileRef.current = loadProfile();

    const [snapshot, setSnapshot] = useState(() => profileRef.current);

    // Per-session accumulator for the session-summary card (#131). Null when
    // no session is running. A ref for the same reason as profileRef.
    const sessionRef = useRef(null);

    const flush = useCallback(() => {
        saveProfile(profileRef.current);
        // New object identity so consumers re-render.
        setSnapshot({ ...profileRef.current });
    }, []);

    // ── Family unlocks + debug (pre-existing API, now stored in the v1 shape) ──

    const setDebugMode = useCallback((enabled) => {
        profileRef.current = { ...profileRef.current, debugMode: enabled };
        flush();
    }, [flush]);

    const toggleFamily = useCallback((family) => {
        // Toggling lock state requires debug mode — in normal use, lessons control locks
        if (!profileRef.current.debugMode) return;
        const next = new Set(profileRef.current.unlockedFamilies);
        if (next.has(family)) next.delete(family);
        else next.add(family);
        profileRef.current = { ...profileRef.current, unlockedFamilies: [...next] };
        flush();
    }, [flush]);

    const setGamificationEnabled = useCallback((enabled) => {
        profileRef.current = { ...profileRef.current, gamificationEnabled: enabled };
        flush();
    }, [flush]);

    // ── Sessions (#131/#134) ───────────────────────────────────────────────

    const beginSession = useCallback(() => {
        if (sessionRef.current) return; // already running — playback mode toggles must not reset stats
        const p = profileRef.current;
        sessionRef.current = {
            startedAt: Date.now(),
            notesCorrect: 0,
            notesTotal: 0,
            currentNoteStreak: 0,
            longestNoteStreak: 0,
            melodiesCompleted: 0,
            seriesListened: 0,
            xpEarned: 0,
            // Skill scores at session start, to compute the summary's ↑/↓ deltas
            // (ratings can DROP since the #129 ELO rework).
            skillsAtStart: currentSkills(p),
        };
    }, []);

    /**
     * Ends the session and returns a summary object for the card, or null when
     * the session doesn't meet the display gate (≥1 completed melody or ≥1
     * fully listened series — Han 2026-07-02: no card while merely tweaking).
     */
    const endSession = useCallback(() => {
        const s = sessionRef.current;
        sessionRef.current = null;
        if (!s) return null;

        const p = profileRef.current;
        // Consistency branch is fed at session end: long sessions (>20 min)
        // train endurance (docs/gamification.md §4.5). Streak feeds it too, in
        // recordEvent's melodyComplete path.
        const sessionMinutes = (Date.now() - s.startedAt) / 60000;
        if (p.gamificationEnabled && sessionMinutes >= 20) {
            profileRef.current = { ...p, consistencyXP: p.consistencyXP + 50 };
        }
        flush();

        if (s.melodiesCompleted < 1 && s.seriesListened < 1) return null;

        const final = profileRef.current;
        const finalSkills = currentSkills(final);
        const skillDeltas = Object.fromEntries(SKILL_BRANCHES.map(b => [
            b, finalSkills[b] - s.skillsAtStart[b],
        ]));
        return {
            notesCorrect: s.notesCorrect,
            notesTotal: s.notesTotal,
            accuracy: s.notesTotal > 0 ? Math.round((s.notesCorrect / s.notesTotal) * 100) : null,
            longestNoteStreak: s.longestNoteStreak,
            melodiesCompleted: s.melodiesCompleted,
            seriesListened: s.seriesListened,
            xpEarned: Math.round(s.xpEarned),
            skillDeltas,
            streakDays: effectiveStreakDays(final.streak, localDateISO()),
            gamificationEnabled: final.gamificationEnabled,
        };
    }, [flush]);

    // ── recordEvent — the ONLY scoring write path (#128/#129/#130/#134) ────
    //
    // types: noteCorrect | noteWrong | cleanMeasure | melodyComplete |
    //        melodyListened | seriesComplete
    // payload: { staff, subMode, isChordTarget, meterNumerator, bpm,
    //            difficultyMultiplier, tonicPC, family, mode }
    const recordEvent = useCallback((type, payload = {}) => {
        const s = sessionRef.current;

        // Session stats accumulate even with gamification off — the summary
        // card is useful feedback regardless (docs/gamification.md §9.2).
        if (s) {
            if (type === 'noteCorrect') {
                s.notesCorrect += 1;
                s.notesTotal += 1;
                s.currentNoteStreak += 1;
                s.longestNoteStreak = Math.max(s.longestNoteStreak, s.currentNoteStreak);
            } else if (type === 'noteWrong') {
                s.notesTotal += 1;
                s.currentNoteStreak = 0;
            } else if (type === 'melodyComplete') {
                s.melodiesCompleted += 1;
            } else if (type === 'seriesComplete') {
                s.seriesListened += 1;
            }
        }

        const p = profileRef.current;
        if (!p.gamificationEnabled) return;

        let xp = XP_TABLE[type] ?? 0; // noteWrong is stats-only: not in the table → 0 XP
        if (MULTIPLIED_EVENTS.has(type)) {
            xp *= xpMultiplier(payload.difficultyMultiplier);
        }

        let next = { ...p };

        // ELO rating update (#129 rework): a completed INPUT-TEST melody is a
        // rated match vs the settings' difficulty. Only input-test completions
        // carry correct/total; listening events never reach this block, so
        // passive play cannot move ratings. Attribution decides which of the
        // four performance branches the match counts for.
        if (type === 'melodyComplete' && payload.total > 0) {
            const difficulty = difficultyToRating(payload.difficultyMultiplier);
            const outcome = gradedOutcome(payload.correct, payload.total);
            const weights = attributeBranches(payload);
            const ratings = { ...next.skillRatings };
            for (const branch of RATING_BRANCHES) {
                if (weights[branch]) {
                    ratings[branch] = updateRating(ratings[branch], difficulty, outcome, payload.total);
                }
            }
            next.skillRatings = ratings;
        }

        // Novelty + streak only on "a whole musical unit finished" events —
        // per-note checks would be wasted work.
        if (type === 'melodyComplete' || type === 'seriesComplete') {
            if (payload.tonicPC) {
                const pc = getNoteSemitone(payload.tonicPC);
                if (pc != null && pc >= 0 && !next.lifetime.keys[pc]) {
                    next.lifetime = { ...next.lifetime, keys: { ...next.lifetime.keys, [pc]: localDateISO() } };
                    xp += XP_TABLE.newKey;
                }
            }
            if (payload.family && payload.mode) {
                const scaleKey = `${payload.family}:${payload.mode}`;
                if (!next.lifetime.scales[scaleKey]) {
                    next.lifetime = { ...next.lifetime, scales: { ...next.lifetime.scales, [scaleKey]: localDateISO() } };
                    xp += XP_TABLE.newScale;
                }
            }
            const today = localDateISO();
            const prevDays = next.streak.days;
            next.streak = evaluateStreak(next.streak, today);
            // A streak day extended = consistency progress (docs/gamification.md §4.5).
            if (next.streak.days > prevDays) {
                next.consistencyXP += 100;
            }
        }

        if (xp > 0) {
            // XP is volume/effort only (#129 rework): it no longer feeds the four
            // performance branches — those move exclusively via the rating match above.
            next.totalXP = p.totalXP + xp;
            if (s) s.xpEarned += xp;
        }

        profileRef.current = next;

        // Persist at coarse boundaries only — per-note localStorage writes are
        // wasteful and per-note snapshot updates would re-render the app.
        if (type === 'melodyComplete' || type === 'seriesComplete') flush();
    }, [flush]);

    // #268: bump the persistent per-exercise counters. Melody bumps ride along
    // with recordEvent's own melodyComplete flush (call this BEFORE recordEvent
    // so one persist covers both); run completions flush themselves.
    const recordExerciseProgress = useCallback((exerciseId, { melodies = 0, runs = 0 } = {}) => {
        if (!exerciseId) return;
        const p = profileRef.current;
        const prev = p.exerciseProgress[exerciseId] || { melodies: 0, runs: 0, lastAt: null };
        profileRef.current = {
            ...p,
            exerciseProgress: {
                ...p.exerciseProgress,
                [exerciseId]: {
                    melodies: prev.melodies + melodies,
                    runs: prev.runs + runs,
                    lastAt: localDateISO(),
                },
            },
        };
        if (runs > 0) flush();
    }, [flush]);

    // #1054 (Han 2026-08-20, level-based stats/progression): the ONLY writer for `levelMastery`. Called
    // once per level completion (App.jsx, at the same `level.done` transition `levelResultRows` already
    // computes accuracy for — §6c, reuses that same `computeAccuracyPercent` call, never a second one).
    // Ratchet semantics confirmed by Han (chat interview): `highestLevelAt80`/`knownScales`/`knownSongs`
    // only ever GROW — a later, worse attempt never un-marks something already earned. `key` (the
    // play/perfect-count identity) is the song's own id for a scripted level, or its numeric level id for
    // a procedural one — the two id spaces never collide (`levels.json` ids are small integers, `songId`s
    // are strings).
    // #1099 (Han 2026-08-22): `notesPerMinute` is OPTIONAL (the caller may not always have a valid
    // elapsed-time measurement) and, when present, updates `anpm` via EWMA — but ONLY on a >=90%-accuracy
    // completion (Han: ANPM measures "how many notes/minute can the player handle AT that accuracy", so a
    // sloppy run doesn't drag the estimate down artificially). This is a SEPARATE gate from levelMastery's
    // own >=80% ratchet threshold above — the two axes are independent (v5 profile comment).
    const recordLevelCompletion = useCallback(({ levelId, songId, tonic, mode, accuracyPercent, notesPerMinute }) => {
        const p = profileRef.current;
        const key = songId ?? levelId;
        if (key == null) return;
        const lm = p.levelMastery || defaultLevelMastery();

        const playCounts = { ...lm.playCounts, [key]: (lm.playCounts[key] || 0) + 1 };
        const perfectCounts = accuracyPercent >= 100
            ? { ...lm.perfectCounts, [key]: (lm.perfectCounts[key] || 0) + 1 }
            : lm.perfectCounts;

        let highestLevelAt80 = lm.highestLevelAt80;
        let knownScales = lm.knownScales;
        let knownSongs = lm.knownSongs;
        if (accuracyPercent >= 80) {
            // Song vs numbered-level mastery are mutually exclusive per completion (a level either has a
            // songId or doesn't) — "known scale" is orthogonal to both and tracked whenever a tonic/mode
            // is known, regardless of which kind of level it was.
            if (songId != null) {
                if (!knownSongs.includes(songId)) knownSongs = [...knownSongs, songId];
            } else if (typeof levelId === 'number') {
                if (highestLevelAt80 == null || levelId > highestLevelAt80) highestLevelAt80 = levelId;
            }
            if (tonic && mode) {
                const scaleKey = `${tonic}:${mode}`;
                if (!knownScales.includes(scaleKey)) knownScales = [...knownScales, scaleKey];
            }
        }

        let anpm = p.anpm;
        if (accuracyPercent >= 90 && Number.isFinite(notesPerMinute)) {
            anpm = anpm == null ? notesPerMinute : ANPM_EWMA_ALPHA * notesPerMinute + (1 - ANPM_EWMA_ALPHA) * anpm;
        }

        profileRef.current = {
            ...p,
            levelMastery: { highestLevelAt80, knownScales, knownSongs, playCounts, perfectCounts },
            anpm,
        };
        flush();
    }, [flush]);

    // Persist any unflushed per-note XP if the tab closes mid-session.
    useEffect(() => {
        const persist = () => saveProfile(profileRef.current);
        window.addEventListener('beforeunload', persist);
        return () => window.removeEventListener('beforeunload', persist);
    }, []);

    // ── Derived, snapshot-based values for the UI ──────────────────────────

    const unlockedFamilies = useMemo(() => new Set(snapshot.unlockedFamilies), [snapshot.unlockedFamilies]);

    const isFamilyUnlocked = useCallback((family) => {
        return unlockedFamilies.has(family);
    }, [unlockedFamilies]);

    const gamification = useMemo(() => {
        const { level, intoLevel, needed } = levelFromXP(snapshot.totalXP);
        return {
            totalXP: Math.round(snapshot.totalXP),
            level,
            intoLevel: Math.round(intoLevel),
            needed,
            tier: tierName(level),
            skills: currentSkills(snapshot),
            streakDays: effectiveStreakDays(snapshot.streak, localDateISO()),
            freezeTokens: snapshot.streak.freezeTokens,
        };
    }, [snapshot]);

    // Memoise the value object so consumers don't re-render on parent re-renders
    // that don't touch the profile state itself.
    const value = useMemo(() => ({
        unlockedFamilies,
        activeFamilies: unlockedFamilies,
        debugMode: snapshot.debugMode,
        setDebugMode,
        toggleFamily,
        isFamilyUnlocked,
        // Gamification (kanban #128–#131, #134, #142)
        gamification,
        gamificationEnabled: snapshot.gamificationEnabled,
        setGamificationEnabled,
        recordEvent,
        beginSession,
        endSession,
        // #268: persistent per-exercise counters + the writer.
        exerciseProgress: snapshot.exerciseProgress || {},
        recordExerciseProgress,
        // #1054: level-based mastery + the writer.
        levelMastery: snapshot.levelMastery || defaultLevelMastery(),
        recordLevelCompletion,
        // #1099: accurate notes per minute (EWMA, null until a first qualifying completion).
        anpm: snapshot.anpm ?? null,
    }), [unlockedFamilies, snapshot.debugMode, snapshot.gamificationEnabled, gamification,
         snapshot.exerciseProgress, snapshot.levelMastery, snapshot.anpm,
         setDebugMode, toggleFamily, isFamilyUnlocked, setGamificationEnabled,
         recordEvent, beginSession, endSession, recordExerciseProgress, recordLevelCompletion]);

    return (
        <ProfileContext.Provider value={value}>
            {children}
        </ProfileContext.Provider>
    );
}

export function useProfile() {
    const ctx = useContext(ProfileContext);
    if (!ctx) throw new Error('useProfile must be used inside ProfileProvider');
    return ctx;
}
