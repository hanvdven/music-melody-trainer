import { useState, useEffect, useRef, useCallback } from 'react';
import { LEVEL_MIN_X as LDTK_MIN_X, LEVEL_MAX_X as LDTK_MAX_X, ENTITY_WORLD_X } from '../levels/ldtk/ldtkWorld';

// #693 (Han 2026-08-04, RPG Level tab round 2): the movement/pet/NPC-dialogue state for the RPG Level
// preview tab. Lives in its own hook (mirrors `useBestiaryEditor`'s pattern) so the SAME state can be read
// by both the top-area scene (RpgLevelPanel) and the bottom-area speech bubble (RpgLevelBottomPanel, Han:
// "tekstballon mag in bottom view") — App.jsx creates ONE instance and passes it to both.
//
// All positions are in WORLD units (native, unscaled pixels — the same 32px grid RpgLevelPanel's tiles use);
// the panel multiplies by its own ZOOM only when rendering.

const WALK_SPEED = 90;             // world px/sec
// #RAM-level (Han 2026-08-11, "als personage langer dan 2 seconden loopt, ga dan over naar 'run' met
// dubbele snelheid"): a continuous-movement timer (reset the instant movement stops, regardless of which
// direction — a pause always starts the 2s count over) that upgrades walk -> run once it crosses this
// threshold. Only the HERO runs — the pet's own follow-catch-up speed is untouched (not requested).
const RUN_AFTER_MS = 2000;
const RUN_SPEED_MULTIPLIER = 2;
// Han: "vanaf dat ik 3 tiles (dus 64 pixels) weg ben, sluit die aan" — the explicit pixel figure (64) is
// used as the authoritative gap threshold (3 tiles × 32px would be 96, not 64 — Han's own arithmetic
// doesn't quite match his tile count; the literal "64 pixels" is taken as intended).
const PET_FOLLOW_GAP = 64;
// #693 round 3 ("het volg mechanisme is nice; maar zorg dat de pet helemaal doorloopt tot vlakbij het
// personage"): the pet TRIGGERS following once the leash (PET_FOLLOW_GAP) stretches taut, but must then
// keep walking until it's almost touching the player (`PET_CLOSE_ENOUGH`), not just stop the instant the
// gap drops back under the trigger distance — hysteresis (`petFollowingRef` below), not a single threshold.
const PET_CLOSE_ENOUGH = 10;
const ARRIVE_EPSILON = 4;

// #RAM-level (Han 2026-08-10): the walkable world's bounds are now derived from `RAM level.ldtk`'s own
// level width (ldtkWorld.js), centered on x=0 like the original hand-tuned -1600..1600 span was — NOT a
// second hardcoded number that could drift from the actual scene (§6c: one shared bound). RpgLevelPanel
// re-exports/reads these same two constants for its camera clamp, so the walkable area and the LDtk
// scenery's own extent can never disagree.
export const LEVEL_MIN_X = LDTK_MIN_X;
export const LEVEL_MAX_X = LDTK_MAX_X;
const clampToLevel = (x) => Math.min(LEVEL_MAX_X, Math.max(LEVEL_MIN_X, x));

// #RAM-level (Han 2026-08-11, "spawn personage op entity hero (staat in het level)"): hero/pet/NPC now
// spawn at the `.ldtk` file's own Hero/Pet/Wisp `Entities` markers (`ENTITY_WORLD_X`, ldtkWorld.js)
// instead of hand-tuned numbers — falls back to the old hand-tuned spots if a marker is ever missing from
// the file, so a future re-export that drops an entity degrades gracefully instead of spawning at 0.
const DEFAULT_PLAYER_X = ENTITY_WORLD_X.Hero ?? -150;
const DEFAULT_PET_X = ENTITY_WORLD_X.Pet ?? (DEFAULT_PLAYER_X - PET_FOLLOW_GAP);
const DEFAULT_NPC_X = ENTITY_WORLD_X.Wisp ?? 0;

export default function useRpgLevelState({ npcX = DEFAULT_NPC_X } = {}) {
    const [playerX, setPlayerX] = useState(DEFAULT_PLAYER_X);
    const [petX, setPetX] = useState(DEFAULT_PET_X);
    const [facing, setFacing] = useState(1);          // 1 = right, -1 = left
    const [moving, setMoving] = useState(false);
    const [running, setRunning] = useState(false);
    const [petMoving, setPetMoving] = useState(false);
    const [dialogue, setDialogue] = useState(null);    // { text } | null

    const keysRef = useRef({ left: false, right: false });
    const targetRef = useRef(null);                   // world x the player is walking toward (click/tap/NPC)
    const onArriveRef = useRef(null);                 // callback fired once the target is reached
    const playerXRef = useRef(playerX); playerXRef.current = playerX;
    const petXRef = useRef(petX); petXRef.current = petX;
    const facingRef = useRef(facing); facingRef.current = facing;
    const petFollowingRef = useRef(false);
    // Perf fix (Han 2026-08-06, "hakkelig beeld... te veel geladen?"): `moving`/`petMoving` used to be set
    // UNCONDITIONALLY every rAF tick (60/sec) even while standing still, which re-invokes App.jsx's render
    // function every frame for no reason (React only bails out of RE-RENDERING children on an
    // Object.is-identical setState, not out of re-running the calling component). These refs let the tick
    // loop skip the setState call entirely when the value hasn't actually changed — playerX/petX already did
    // this correctly (only set while actually moving); this brings moving/petMoving in line.
    const movingRef = useRef(false);
    const petMovingRef = useRef(false);
    const runningRef = useRef(false);
    const movingSinceRef = useRef(null);   // timestamp continuous movement started, or null while stopped

    // Keyboard: A/D or ArrowLeft/ArrowRight, held-down state (§693: "met A en D of pijl links pijl rechts").
    useEffect(() => {
        const down = (e) => {
            if (e.code === 'KeyA' || e.code === 'ArrowLeft') { keysRef.current.left = true; targetRef.current = null; }
            if (e.code === 'KeyD' || e.code === 'ArrowRight') { keysRef.current.right = true; targetRef.current = null; }
        };
        const up = (e) => {
            if (e.code === 'KeyA' || e.code === 'ArrowLeft') keysRef.current.left = false;
            if (e.code === 'KeyD' || e.code === 'ArrowRight') keysRef.current.right = false;
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }, []);

    // Tap/click-to-move (§693: "of op mobile, tap op scherm") — also works with mouse on desktop. Walks
    // toward `x` (world units); an optional `onArrive` fires once, used by the Whisp NPC click below.
    const moveTo = useCallback((x, onArrive = null) => {
        keysRef.current.left = false; keysRef.current.right = false;
        targetRef.current = clampToLevel(x);
        onArriveRef.current = onArrive;
    }, []);

    // #693 round 7 (Han: "pressing and holding near screen edge should keep the character moving"):
    // reuses the SAME held-key movement path keyboard input already drives (§6c — no parallel "auto-walk"
    // mechanism) — RpgLevelPanel calls this from its edge-zone pointerdown/up handlers exactly like a
    // virtual left/right key. dir: -1 (left), 1 (right), 0 (release).
    const setHeldDirection = useCallback((dir) => {
        keysRef.current.left = dir < 0;
        keysRef.current.right = dir > 0;
        if (dir !== 0) targetRef.current = null;
    }, []);

    // #693 ("Zet de whisp NPC neer. Als ik daarop klik loopt personage erheen, en verschijnt een
    // tekstballon"): clicking the NPC walks the player to it, then opens the dialogue once arrived.
    const clickNpc = useCallback(() => {
        setDialogue(null);
        moveTo(npcX - 24, () => setDialogue({ text: 'Hello there!' }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [npcX, moveTo]);

    // Single rAF loop drives player velocity (keys OR walk-to-target), facing, and the pet's delayed follow.
    useEffect(() => {
        let raf;
        let last = performance.now();
        const tick = (now) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            let vx = 0;
            if (keysRef.current.left && !keysRef.current.right) vx = -1;
            else if (keysRef.current.right && !keysRef.current.left) vx = 1;
            else if (targetRef.current != null) {
                const d = targetRef.current - playerXRef.current;
                if (Math.abs(d) <= ARRIVE_EPSILON) {
                    targetRef.current = null;
                    const cb = onArriveRef.current; onArriveRef.current = null;
                    if (cb) cb();
                } else vx = d > 0 ? 1 : -1;
            }
            if (vx !== 0) {
                if (movingSinceRef.current == null) movingSinceRef.current = now;
                const nextRunning = (now - movingSinceRef.current) >= RUN_AFTER_MS;
                if (nextRunning !== runningRef.current) { runningRef.current = nextRunning; setRunning(nextRunning); }
                const speed = WALK_SPEED * (nextRunning ? RUN_SPEED_MULTIPLIER : 1);
                // "make it possible to move beyond the screen EDGE" is the CAMERA's job (RpgLevelPanel) —
                // the player itself is still clamped to the generated 200-tile world's own bounds.
                playerXRef.current = clampToLevel(playerXRef.current + vx * speed * dt);
                if (vx !== facingRef.current) { facingRef.current = vx; setFacing(vx); }
                setPlayerX(playerXRef.current);
            } else {
                movingSinceRef.current = null;
                if (runningRef.current) { runningRef.current = false; setRunning(false); }
            }
            const nextMoving = vx !== 0;
            if (nextMoving !== movingRef.current) { movingRef.current = nextMoving; setMoving(nextMoving); }

            // Pet: hangs back until the leash (PET_FOLLOW_GAP) stretches taut, THEN keeps walking (even as
            // the gap shrinks back below that trigger distance) until it's right up next to the player
            // (PET_CLOSE_ENOUGH) — a real "catch up to my side", not just "stay within N px".
            const gap = playerXRef.current - petXRef.current;
            const absGap = Math.abs(gap);
            if (absGap > PET_FOLLOW_GAP) petFollowingRef.current = true;
            else if (absGap <= PET_CLOSE_ENOUGH) petFollowingRef.current = false;
            const petIsWalking = petFollowingRef.current && absGap > PET_CLOSE_ENOUGH;
            if (petIsWalking) {
                const dir = gap > 0 ? 1 : -1;
                petXRef.current += dir * WALK_SPEED * dt;
                setPetX(petXRef.current);
            }
            // #693 (Han: "i expect the fox to use the 'walk' animation when walking") — exposed so the
            // panel can pick the classified 'move' vs 'idle' animation cells (bestiaryAssets.js) instead
            // of always showing idle.
            if (petIsWalking !== petMovingRef.current) { petMovingRef.current = petIsWalking; setPetMoving(petIsWalking); }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    return { playerX, petX, facing, moving, running, petMoving, dialogue, closeDialogue: () => setDialogue(null), moveTo, clickNpc, setHeldDirection };
}
