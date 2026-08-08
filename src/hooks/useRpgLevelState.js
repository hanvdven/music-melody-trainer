import { useState, useEffect, useRef, useCallback } from 'react';

// #693 (Han 2026-08-04, RPG Level tab round 2): the movement/pet/NPC-dialogue state for the RPG Level
// preview tab. Lives in its own hook (mirrors `useBestiaryEditor`'s pattern) so the SAME state can be read
// by both the top-area scene (RpgLevelPanel) and the bottom-area speech bubble (RpgLevelBottomPanel, Han:
// "tekstballon mag in bottom view") — App.jsx creates ONE instance and passes it to both.
//
// All positions are in WORLD units (native, unscaled pixels — the same 32px grid RpgLevelPanel's tiles use);
// the panel multiplies by its own ZOOM only when rendering.

const WALK_SPEED = 90;             // world px/sec
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

// #693 round 7 (Han: "generate a level of 200 16x16 tiles"): the walkable world spans exactly 200×16 =
// 3200 world units, centered on x=0 (the original spawn/tree/tent/NPC placement) — matches
// RpgLevelPanel's own LEVEL_TILES/FLOOR_TILE constants (§6c: one shared bound, not two independently
// hardcoded numbers that could drift apart).
export const LEVEL_MIN_X = -1600;
export const LEVEL_MAX_X = 1600;
const clampToLevel = (x) => Math.min(LEVEL_MAX_X, Math.max(LEVEL_MIN_X, x));

// Matches RpgLevelPanel's own NPC_X constant — kept as one shared default so the visual placement and the
// walk-to-NPC target never drift apart (§6c).
export default function useRpgLevelState({ npcX = 0 } = {}) {
    const [playerX, setPlayerX] = useState(-150);
    const [petX, setPetX] = useState(-150 - PET_FOLLOW_GAP);
    const [facing, setFacing] = useState(1);          // 1 = right, -1 = left
    const [moving, setMoving] = useState(false);
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
                // "make it possible to move beyond the screen EDGE" is the CAMERA's job (RpgLevelPanel) —
                // the player itself is still clamped to the generated 200-tile world's own bounds.
                playerXRef.current = clampToLevel(playerXRef.current + vx * WALK_SPEED * dt);
                if (vx !== facingRef.current) { facingRef.current = vx; setFacing(vx); }
                setPlayerX(playerXRef.current);
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

    return { playerX, petX, facing, moving, petMoving, dialogue, closeDialogue: () => setDialogue(null), moveTo, clickNpc, setHeldDirection };
}
