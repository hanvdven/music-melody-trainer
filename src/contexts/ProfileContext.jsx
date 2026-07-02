import React, { createContext, useContext, useState, useRef, useCallback, useMemo, useEffect } from 'react';
import logger from '../utils/logger';
import { getNoteSemitone } from '../theory/noteUtils';
import {
    XP_TABLE,
    MULTIPLIED_EVENTS,
    SKILL_BRANCHES,
    levelFromXP,
    tierName,
    skillScore,
    attributeBranches,
    xpMultiplier,
    evaluateStreak,
    effectiveStreakDays,
    localDateISO,
} from '../utils/gamification';

const STORAGE_KEY = 'music-trainer-profile';
const PROFILE_VERSION = 1;

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
        // Raw XP pools per skill branch; displayed 0–100 via skillScore().
        branchXP: { ear: 0, sightReading: 0, rhythm: 0, harmony: 0, consistency: 0 },
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
    return {
        ...base,
        ...saved,
        version: PROFILE_VERSION,
        unlockedFamilies: saved.unlockedFamilies ?? base.unlockedFamilies,
        branchXP: { ...base.branchXP, ...(saved.branchXP || {}) },
        streak: { ...base.streak, ...(saved.streak || {}) },
        lifetime: {
            keys: { ...(saved.lifetime?.keys || {}) },
            scales: { ...(saved.lifetime?.scales || {}) },
        },
    };
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
            // Skill scores at session start, to compute the summary's ↑ deltas.
            skillsAtStart: Object.fromEntries(SKILL_BRANCHES.map(b => [b, skillScore(p.branchXP[b])])),
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
            profileRef.current = {
                ...p,
                branchXP: { ...p.branchXP, consistency: p.branchXP.consistency + 50 },
            };
        }
        flush();

        if (s.melodiesCompleted < 1 && s.seriesListened < 1) return null;

        const final = profileRef.current;
        const skillDeltas = Object.fromEntries(SKILL_BRANCHES.map(b => [
            b, skillScore(final.branchXP[b]) - s.skillsAtStart[b],
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
                next.branchXP = { ...next.branchXP, consistency: next.branchXP.consistency + 100 };
            }
        }

        if (xp > 0) {
            next.totalXP = p.totalXP + xp;
            if (s) s.xpEarned += xp;
            const weights = attributeBranches(payload);
            const branchXP = { ...next.branchXP };
            for (const [branch, w] of Object.entries(weights)) {
                branchXP[branch] += xp * w;
            }
            next.branchXP = branchXP;
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
            skills: Object.fromEntries(SKILL_BRANCHES.map(b => [b, skillScore(snapshot.branchXP[b])])),
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
