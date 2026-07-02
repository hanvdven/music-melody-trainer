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
const PROFILE_VERSION = 2;

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
    }), [unlockedFamilies, snapshot.debugMode, snapshot.gamificationEnabled, gamification,
         setDebugMode, toggleFamily, isFamilyUnlocked, setGamificationEnabled,
         recordEvent, beginSession, endSession]);

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
