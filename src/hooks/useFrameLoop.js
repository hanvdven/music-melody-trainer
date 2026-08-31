import { useEffect, useRef } from 'react';
import logger from '../utils/logger';

// #1162 Fase 8 (Han 2026-08-27, real-hardware DevTools trace analysis — docs/architecture.md §328): a
// SHARED requestAnimationFrame ticker that many subsystems subscribe to, instead of each subsystem
// registering its own independent rAF chain. RpgLevelPanel alone had 4+ of its own `useEffect`+
// `requestAnimationFrame` loops (camera, pet animation, walk animation, critter wander), plus
// ForegroundFoliageLayer/LdtkLitGround/LdtkAnimatedTiles/useRpgLevelState each running their own on top —
// Han's real trace showed ~15% of main-thread CPU samples in native "createTask"/"requestAnimationFrame"
// scheduling machinery, tied to how many SEPARATE registrations exist, not to what any one loop's body
// does. This hook does not change how much work runs per frame or what clock drives any subsystem's own
// timing — it only reduces the number of separate rAF registrations the browser has to schedule.
//
// Callbacks receive the RAW rAF timestamp (a DOMHighResTimeStamp — the same value a native
// `requestAnimationFrame` callback receives). This ticker is a pure dispatch mechanism; it never derives
// or substitutes its own notion of "current time". Any subsystem that must stay locked to the AudioContext
// clock (e.g. SheetRpgLayer's scroll position — see docs/architecture.md §7/§88's "never use
// performance.now for audio-synced position" invariant, and CLAUDE.md §6's "never use setTimeout to drive
// setCurrentMeasureIndex") keeps reading `context.currentTime` itself inside its own callback, exactly as
// before migrating onto this hook — nothing about that invariant changes here.
//
// Priority — carries forward SheetRpgLayer's own #1050 finding (still true here): the browser paints only
// after ALL same-frame rAF callbacks finish, regardless of how many separate `requestAnimationFrame()`
// registrations exist, so merely combining loops does not by itself stop one subsystem's slow frame from
// delaying another's paint. 'critical' subscribers run FIRST, every frame, in full — use this for anything
// that must never skip a frame (clock-driven scroll/camera position). 'throttled' subscribers run after,
// and are individually rate-limited by their own `throttleMs` (mirrors the existing
// `RPG_ENTITY_THROTTLE_MS`-style pattern already used elsewhere) so a slow throttled subsystem never delays
// a critical one, and each throttled subsystem can have its own independent cadence.
const criticalSubscribers = new Set();
const throttledSubscribers = new Set(); // each entry: { callback, throttleMs, lastMs }

let rafId = null;

// #1162 Fase 8 follow-up (before migrating SheetRpgLayer.jsx onto this hook — that component's own rAF
// loop wraps its per-frame body in try/catch for a documented reason: #863, "een uncaught throw here
// doesn't just skip one bad paint, it escapes the loop function entirely" — a real production crash once,
// fixed with per-frame error recovery, same pattern as E023-FOLIAGE-DRAW-FRAME). A SHARED ticker makes this
// MORE important, not less: without isolation, one subscriber throwing would stop `requestAnimationFrame`
// from ever being re-requested, silently freezing EVERY subscriber sharing this ticker, not just the one
// that failed. Each subscriber call is therefore individually guarded.
function runSubscriber(cb, now) {
    try {
        cb(now);
    } catch (err) {
        logger.error('FrameLoop', 'E034-FRAME-LOOP-SUBSCRIBER', err);
    }
}

function tick(now) {
    for (const cb of criticalSubscribers) runSubscriber(cb, now);
    for (const entry of throttledSubscribers) {
        if (now - entry.lastMs >= entry.throttleMs) {
            entry.lastMs = now;
            runSubscriber(entry.callback, now);
        }
    }
    rafId = requestAnimationFrame(tick);
}

function ensureRunning() {
    if (rafId == null) rafId = requestAnimationFrame(tick);
}

function stopIfIdle() {
    if (criticalSubscribers.size === 0 && throttledSubscribers.size === 0 && rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
}

/**
 * Subscribe a callback to the shared per-frame ticker. Mirrors the `useEffect`+`requestAnimationFrame`+
 * `cancelAnimationFrame` pattern this replaces: pass the same dependency array you'd give that `useEffect`.
 * @param {(now: number) => void} callback
 * @param {Array} deps - re-subscribes when these change, same semantics as a useEffect dependency array
 * @param {{ priority?: 'critical' | 'throttled', throttleMs?: number }} [options]
 */
export default function useFrameLoop(callback, deps, options = {}) {
    const { priority = 'critical', throttleMs = 0 } = options;
    // Ref indirection: always calls the LATEST callback closure without needing to re-subscribe (remove +
    // re-add to the shared Set) on every render where `deps` didn't change — cheaper than resubscribing,
    // and avoids stale-closure bugs the old per-effect `tick` functions could otherwise have.
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        if (priority === 'critical') {
            const wrapped = (now) => callbackRef.current(now);
            criticalSubscribers.add(wrapped);
            ensureRunning();
            return () => { criticalSubscribers.delete(wrapped); stopIfIdle(); };
        }
        const entry = { callback: (now) => callbackRef.current(now), throttleMs, lastMs: 0 };
        throttledSubscribers.add(entry);
        ensureRunning();
        return () => { throttledSubscribers.delete(entry); stopIfIdle(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
