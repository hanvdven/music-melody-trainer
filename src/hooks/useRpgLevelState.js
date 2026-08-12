import { useState, useEffect, useRef, useCallback } from 'react';
import { LEVEL_MIN_X as LDTK_MIN_X, LEVEL_MAX_X as LDTK_MAX_X, ENTITY_WORLD_X } from '../levels/ldtk/ldtkWorld';
import { LOREM_IPSUM_PARAGRAPHS } from '../model/conversationContent';

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
// #922 (Han 2026-08-12, "op de wisp klikken: loop erheen (indien >128 px verwijderd), en start daarna
// gesprek"): explicit threshold — within this range the conversation opens immediately (no walk-then-arrive
// indirection at all), otherwise walk first. Also reused as the "walking away closes the conversation"
// distance (Han: "weglopen sluit het gesprek", no distinct value given — same 128px reads naturally as
// "still close enough to be talking to it").
const NPC_TALK_RANGE = 128;

// #922 (Han: "wisp: geef een uit 5 random zinnen, als je erop klikt. Sommige korter, sommige langer."):
// varying length on purpose — the typewriter reveal (useConversationTypewriter) reads noticeably different
// at 3 words vs a full sentence, so a flat "5 near-identical lines" wouldn't actually exercise that.
const WISP_LINES = [
    'Hello there!',
    'Have you seen my friends? They wandered off again.',
    'The music keeps me warm, you know.',
    'Careful, the slimes bite.',
    'I like the way you play.',
];

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
// #922 (Han 2026-08-12, "je hebt nu de lorem ipsum op de slime van het level gezet, maar ik wou die op de
// slime van de RPG-wereld"): the DECORATIVE open-world slime (RpgLevelPanel's `WorldSlime`, standing at the
// `.ldtk` file's own Slime entity marker) — a different sprite from SheetRpgLayer's real in-song combat
// slimes. Falls back to a fixed spot if the marker is ever missing, same convention as the Wisp/Hero/Pet
// defaults above.
const DEFAULT_SLIME_X = ENTITY_WORLD_X.Slime ?? 200;

export default function useRpgLevelState({ npcX = DEFAULT_NPC_X, slimeX = DEFAULT_SLIME_X } = {}) {
    const [playerX, setPlayerX] = useState(DEFAULT_PLAYER_X);
    const [petX, setPetX] = useState(DEFAULT_PET_X);
    const [facing, setFacing] = useState(1);          // 1 = right, -1 = left
    const [moving, setMoving] = useState(false);
    const [running, setRunning] = useState(false);
    const [petMoving, setPetMoving] = useState(false);
    const [dialogue, setDialogue] = useState(null);    // { pages: string[], entity } | null — #922
    // #922 (Han: "zet rechts van de tekstbox een toggler: auto-continue"): one shared toggle preference for
    // every conversation in this RPG-level session (wisp, and App.jsx's post-combat wizard/slime).
    const [autoContinue, setAutoContinue] = useState(false);

    const keysRef = useRef({ left: false, right: false });
    const targetRef = useRef(null);                   // world x the player is walking toward (click/tap/NPC)
    const onArriveRef = useRef(null);                 // callback fired once the target is reached
    const playerXRef = useRef(playerX); playerXRef.current = playerX;
    const petXRef = useRef(petX); petXRef.current = petX;
    const facingRef = useRef(facing); facingRef.current = facing;
    // #922 (Han: "weglopen sluit het gesprek") — read inside the movement tick loop below (mounted once,
    // `[]` deps) without needing `dialogue`/the entity's X in that effect's dependency array. Set whenever
    // ANY dialogue opens (wisp OR the open-world slime — see `openEntityDialogue` below), so "walking away
    // closes it" works for either speaker, not just the wisp.
    const dialogueRef = useRef(dialogue); dialogueRef.current = dialogue;
    const dialogueAnchorXRef = useRef(npcX);
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
    // tekstballon") + #922 fix (Han: "op de wisp klikken: loop erheen (indien >128 px verwijderd), en start
    // daarna gesprek (nu opent het gesprek niet altijd consistent)"): the OLD version always went through
    // moveTo()'s walk-then-arrive callback, even when already standing right next to the NPC — relying on
    // the movement rAF loop's arrival-epsilon check to fire on the very next tick. Explicitly branching on
    // distance up front removes that indirection (and the "sometimes doesn't open" inconsistency) entirely:
    // already close enough -> open immediately; otherwise walk there first, then open on arrival.
    // #922: shared "walk to X (if needed), then open a dialogue" logic — reused by BOTH the wisp and the
    // open-world slime below, so the walk-then-open fix only lives in ONE place (§6c).
    const openEntityDialogue = useCallback((entityX, entity, pages, walkStopOffset = 24) => {
        setDialogue(null);
        dialogueAnchorXRef.current = entityX;
        const open = () => setDialogue({ pages, entity });
        if (Math.abs(playerXRef.current - entityX) <= NPC_TALK_RANGE) open();
        else moveTo(entityX - walkStopOffset, open);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [moveTo]);

    const clickNpc = useCallback(() => {
        const line = WISP_LINES[Math.floor(Math.random() * WISP_LINES.length)];
        // #922: `dialogue.pages` is an array (one paragraph per page) so the SAME shape covers both a
        // single-line NPC (wisp: one page) and a multi-paragraph one (the open-world slime's lorem ipsum).
        openEntityDialogue(npcX, 'wisp', [line]);
    }, [npcX, openEntityDialogue]);

    // #922 (Han: "je hebt nu de lorem ipsum op de slime van het level gezet, maar ik wou die op de slime van
    // de RPG-wereld"): the open-world DECORATIVE slime — click it to hear the full lorem ipsum, paginated.
    const clickSlime = useCallback(() => {
        openEntityDialogue(slimeX, 'slime', LOREM_IPSUM_PARAGRAPHS);
    }, [slimeX, openEntityDialogue]);

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
                // #922 (Han: "weglopen sluit het gesprek") — only relevant while actually moving (distance
                // to the NPC can only grow on a tick where the player moved).
                if (dialogueRef.current && Math.abs(playerXRef.current - dialogueAnchorXRef.current) > NPC_TALK_RANGE) {
                    setDialogue(null);
                }
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

    return {
        playerX, petX, facing, moving, running, petMoving, dialogue, setDialogue,
        closeDialogue: () => setDialogue(null), moveTo, clickNpc, clickSlime, setHeldDirection,
        autoContinue, toggleAutoContinue: () => setAutoContinue((a) => !a),
    };
}
