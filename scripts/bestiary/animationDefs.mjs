// #790 (Han 2026-08-09, "er is een giga-bestand met sprite-definities; doe een voorstel die drastisch op
// te ruimen - maak die zo overzichtelijk dat ik er handmatig in kan werken"): extracted from
// scripts/generate-bestiary-manifest.mjs's "PER-CREATURE ANIMATION DEFS" section (plus a few sibling
// bespoke-animation functions that lived scattered inside "COLUMN-SHEET EXPANSION"/"SPECIAL ONE-OFF
// EXPANSIONS" — same shape: one hand-authored function per creature, called only from the main script's
// scan loop). This is the file to hand-edit when Han gives a new/corrected "frame N-M = animation X" spec
// for one specific creature — every function here is self-contained (no shared state, only the tiny
// `rowCells`/`cap`/`frameRange` helpers from ./helpers.mjs), so a change to one creature can never
// accidentally affect another.
import { rowCells, frameRange } from './helpers.mjs';

// #669/#671 (Han's exact horse mapping, 1-indexed in his notation, converted to 0-indexed {row,col} cells
// here). No generic algorithm could infer this: animations are STITCHED across row boundaries in an
// irregular pattern (e.g. "walk" = the tail end of row 3 continued by the start of row 4). §671 corrected
// the frame to 128×90 → 768/128 = 6 COLUMNS × 720/90 = 8 ROWS (was 96×120 → 8 cols × 6 rows in §669, which
// made the stagger/death "rij 7/8" references out-of-bounds — resolved by this correction, not a code fix).
// "Full row" cases (idle's rij1, jump's rij6) use all 6 columns.
// #683 (Han 2026-08-04, "remove 'stagger' en zet f39-46 = death"): 'stagger' dropped entirely; 'death'
// recomputed from Han's frame numbers (row-major across the 6-col grid: frame N → row=⌊(N-1)/6⌋,
// col=(N-1)%6) — frames 39-46 = row7 cols3-6 + row8 cols1-4 (1-indexed), replacing the old 5-cell death.
export function horseAnimations() {
    const seq = (...pairs) => pairs.flatMap(([row1, cols1]) => cols1.map((c) => ({ row: row1 - 1, col: c - 1 })));
    return [
        { key: 'idle', label: 'Idle', cells: seq([1, [1, 2, 3, 4, 5, 6]], [2, [1, 2]]) },
        { key: 'graze', label: 'Graze', cells: seq([2, [3, 4, 5, 6]], [3, [1, 2, 3, 4]]) },
        { key: 'walk', label: 'Walk', cells: seq([3, [5, 6]], [4, [1, 2, 3, 4, 5]]) },
        { key: 'gallop', label: 'Gallop', cells: seq([4, [6]], [5, [1, 2, 3, 4, 5]]) },
        { key: 'jump', label: 'Jump', cells: seq([6, [1, 2, 3, 4, 5, 6]], [7, [1, 2]]) },
        { key: 'death', label: 'Death', cells: seq([7, [3, 4, 5, 6]], [8, [1, 2, 3, 4]]) },
    ];
}

// #683 (Han 2026-08-04, Goblin: "frame 1-6 run" ... "frame 47-57 death", frame size 84x64, 6-col grid) —
// row-major frame numbering (frame N → row=⌊(N-1)/6⌋, col=(N-1)%6), verified self-consistent: 57 frames
// used out of the 60-cell (6×10) grid, 3 trailing blank cells.
export function goblinAnimations() {
    const seq = (...pairs) => pairs.flatMap(([row1, cols1]) => cols1.map((c) => ({ row: row1 - 1, col: c - 1 })));
    return [
        { key: 'run', label: 'Run', cells: seq([1, [1, 2, 3, 4, 5, 6]]) },
        { key: 'runhit', label: 'Run Hit', cells: seq([2, [1, 2, 3, 4, 5, 6]]) },
        { key: 'idle', label: 'Idle', cells: seq([3, [1, 2, 3, 4, 5]]) },
        { key: 'block', label: 'Block', cells: seq([3, [6]], [4, [1, 2, 3, 4]]) },
        { key: 'blockhit', label: 'Block Hit', cells: seq([4, [5, 6]], [5, [1, 2, 3]]) },
        { key: 'idle2', label: 'Idle 2', cells: seq([5, [4, 5, 6]], [6, [1, 2]]) },
        { key: 'attack', label: 'Attack', cells: seq([6, [3, 4, 5, 6]], [7, [1, 2, 3]]) },
        { key: 'jump', label: 'Jump', cells: seq([7, [4, 5, 6]], [8, [1, 2, 3, 4]]) },
        { key: 'death', label: 'Death', cells: seq([8, [5, 6]], [9, [1, 2, 3, 4, 5, 6]], [10, [1, 2, 3]]) },
    ];
}

// #683 (Han 2026-08-04, Zombie: "f1-7 idle" ... "f73-79 crawl death", 64x64, 10-col grid) — same row-major
// numbering; 79 frames used out of 80 (10×8), 1 trailing blank.
export function zombieAnimations() {
    const seq = (...pairs) => pairs.flatMap(([row1, cols1]) => cols1.map((c) => ({ row: row1 - 1, col: c - 1 })));
    return [
        { key: 'idle', label: 'Idle', cells: seq([1, [1, 2, 3, 4, 5, 6, 7]]) },
        { key: 'walk', label: 'Walk', cells: seq([1, [8, 9, 10]], [2, [1, 2, 3, 4, 5]]) },
        { key: 'attack', label: 'Attack', cells: seq([2, [6, 7, 8, 9, 10]], [3, [1, 2, 3]]) },
        { key: 'eating', label: 'Eating', cells: seq([3, [4, 5, 6, 7, 8]]) },
        { key: 'walkattack', label: 'Walk Attack', cells: seq([3, [9, 10]], [4, [1, 2, 3, 4, 5, 6]]) },
        { key: 'takingdamage', label: 'Taking Damage', cells: seq([4, [7, 8, 9, 10]], [5, [1]]) },
        { key: 'death', label: 'Death', cells: seq([5, [2, 3, 4, 5, 6, 7, 8, 9, 10]], [6, [1, 2, 3, 4, 5]]) },
        { key: 'crawlidle', label: 'Crawl Idle', cells: seq([6, [6, 7, 8, 9, 10]], [7, [1]]) },
        { key: 'crawl', label: 'Crawl', cells: seq([7, [2, 3, 4, 5, 6, 7]]) },
        { key: 'crawleating', label: 'Crawl Eating', cells: seq([7, [8, 9, 10]], [8, [1, 2]]) },
        { key: 'crawldeath', label: 'Crawl Death', cells: seq([8, [3, 4, 5, 6, 7, 8, 9]]) },
    ];
}

// #683 (Han 2026-08-04, Maid: "f1-8 walk" ... "f73-84 death", 64x64, 10-col grid, shared by BOTH the
// "normal" and "full" sheets — same layout, only the art differs) — 84 frames used out of 90 (10×9), 6
// trailing blank.
export function maidAnimations() {
    const seq = (...pairs) => pairs.flatMap(([row1, cols1]) => cols1.map((c) => ({ row: row1 - 1, col: c - 1 })));
    return [
        { key: 'walk', label: 'Walk', cells: seq([1, [1, 2, 3, 4, 5, 6, 7, 8]]) },
        { key: 'walkbasket', label: 'Walk Basket', cells: seq([1, [9, 10]], [2, [1, 2, 3, 4, 5, 6]]) },
        { key: 'walkclothing', label: 'Walk Clothing', cells: seq([2, [7, 8, 9, 10]], [3, [1, 2, 3, 4]]) },
        { key: 'run', label: 'Run', cells: seq([3, [5, 6, 7, 8, 9, 10]], [4, [1, 2]]) },
        { key: 'idle', label: 'Idle', cells: seq([4, [3, 4, 5, 6, 7]]) },
        { key: 'idlebasket', label: 'Idle Basket', cells: seq([4, [8, 9, 10]], [5, [1, 2]]) },
        { key: 'idleclothing', label: 'Idle Clothing', cells: seq([5, [3, 4, 5, 6, 7]]) },
        { key: 'resting', label: 'Resting', cells: seq([5, [8, 9, 10]], [6, [1, 2, 3]]) },
        { key: 'jump', label: 'Jump', cells: seq([6, [4, 5, 6, 7, 8, 9]]) },
        { key: 'floor1', label: 'On The Floor 1', cells: seq([6, [10]], [7, [1, 2, 3, 4]]) },
        { key: 'floor2', label: 'On The Floor 2', cells: seq([7, [5, 6, 7, 8, 9, 10]], [8, [1, 2]]) },
        { key: 'death', label: 'Death', cells: seq([8, [3, 4, 5, 6, 7, 8, 9, 10]], [9, [1, 2, 3, 4]]) },
    ];
}

// #687/#690 (Han 2026-08-04, Maid sheet2, 640×320 = 10×5 = 50 cells: "f1-13 carry water, f14-21 wash
// dishes, f22-27 read, f28-33 sit, f34-38 idle alt", corrected follow-up: "sleep: frame 39-45, carry
// clothes: 46-50"): verified self-consistent — 13+8+6+6+5+7+5 = 50, EXACTLY the full grid, no leftover.
export function maidSheet2Animations() {
    return [
        { key: 'carrywater', label: 'Carry Water', cells: frameRange(1, 13, 10) },
        { key: 'washdishes', label: 'Wash Dishes', cells: frameRange(14, 21, 10) },
        { key: 'read', label: 'Read', cells: frameRange(22, 27, 10) },
        { key: 'sit', label: 'Sit', cells: frameRange(28, 33, 10) },
        { key: 'idlealt', label: 'Idle Alt', cells: frameRange(34, 38, 10) },
        { key: 'sleep', label: 'Sleep', cells: frameRange(39, 45, 10) },
        { key: 'carryclothes', label: 'Carry Clothes', cells: frameRange(46, 50, 10) },
    ];
}
// #687 (Han 2026-08-04, Maid combat sheet, 640×512 = 10×8 = 80 cells): verified self-consistent — the 8
// given ranges total exactly 78 frames (5+5+16+14+5+12+10+11), 2 trailing blank cells.
export function maidCombatAnimations() {
    return [
        { key: 'combatstance1', label: 'Combat Stance 1', cells: frameRange(1, 5, 10) },
        { key: 'combatstance2', label: 'Combat Stance 2', cells: frameRange(6, 10, 10) },
        { key: 'attack', label: 'Attack', cells: frameRange(11, 26, 10) },
        { key: 'charge', label: 'Charge', cells: frameRange(27, 40, 10) },
        { key: 'idlesword', label: 'Idle With Sword', cells: frameRange(41, 45, 10) },
        { key: 'fallgetup', label: 'Fall And Get Up', cells: frameRange(46, 57, 10) },
        { key: 'parryhit', label: 'Parry Hit', cells: frameRange(58, 67, 10) },
        { key: 'death2', label: 'Death (Sword)', cells: frameRange(68, 78, 10) },
    ];
}
// #687 (Han: "sword down (sheet 4) is een idle sword animatie") — 512×64 = 8×1, one animation, the whole row.
export function maidSwordDownAnimations() {
    return [{ key: 'idleswordstill', label: 'Idle Sword (Still)', cells: frameRange(1, 8, 8) }];
}

// #689 (Han 2026-08-04, "poop thrower: frame 1,2,3 en frame 51, 50 (in die volgorde) -> idle. alle andere
// frames (4-49) throwing poop"): 640×320 = 10×5 = 50 cells. "Frame 51" doesn't exist in a 50-cell grid —
// read as row-major "row 5, frame 1" shorthand (Han uses this "row.frame" style elsewhere in this batch,
// e.g. Maid's "sheet2 f39-45"-style ranges are always plain sequential numbering, but a bare two-digit
// number this far past the grid size is most consistent with a row.col reading: row5 frame1 = index
// (5-1)×10+1 = 41) — NOT independently verified pixel-by-pixel, flagged as an assumption. `idle` plays the
// non-contiguous sequence 1,2,3,41,50 in EXACTLY that order (Han: "in die volgorde"); every other frame
// (4-49, excluding 41) is 'throwing'. Self-consistency check: 5 idle + 45 throwing = 50, the full grid.
export function poopThrowerAnimations() {
    const cellFor = (n) => { const i = n - 1; return { row: Math.floor(i / 10), col: i % 10 }; };
    const idleFrames = [1, 2, 3, 41, 50];
    const throwFrames = Array.from({ length: 46 }, (_, i) => i + 4).filter((n) => !idleFrames.includes(n));
    return [
        { key: 'idle', label: 'Idle', cells: idleFrames.map(cellFor) },
        { key: 'throwing', label: 'Throwing Poop', cells: throwFrames.map(cellFor) },
    ];
}

// #689 (Han 2026-08-04, Skeleton: "f1-8 walk, f9-16 walk arm stretched, f17-f24 walk alt, f25-30 idle,
// f31-40 glow, f41-46 attack, f47-57 death, f58-65 resurrect") — 640×448 = 10×7 = 70 cells; verified
// self-consistent (8+8+8+6+10+6+11+8 = 65 of 70 cells used, 5 trailing blank).
export function skeletonAnimations() {
    return [
        { key: 'walk', label: 'Walk', cells: frameRange(1, 8, 10) },
        { key: 'walkarmstretched', label: 'Walk Arm Stretched', cells: frameRange(9, 16, 10) },
        { key: 'walkalt', label: 'Walk Alt', cells: frameRange(17, 24, 10) },
        { key: 'idle', label: 'Idle', cells: frameRange(25, 30, 10) },
        { key: 'glow', label: 'Glow', cells: frameRange(31, 40, 10) },
        { key: 'attack', label: 'Attack', cells: frameRange(41, 46, 10) },
        { key: 'death', label: 'Death', cells: frameRange(47, 57, 10) },
        { key: 'resurrect', label: 'Resurrect', cells: frameRange(58, 65, 10) },
    ];
}

// #870 (Han 2026-08-11, "kight mounted: 128x111: cell 1-8 idle, 9-16 graze, 17-23 walk, 24-29 run pike up,
// 30-35 charge, 36-41 charge hit, 42-50 jump, 51-58 death"): 1280×666 / 128×111 = 10 cols × 6 rows, exact —
// same row-major 1-indexed frame numbering as horse/goblin/zombie above. Verified self-consistent: 58 frames
// used out of the 60-cell grid (8+8+7+6+6+6+9+8=58), 2 trailing blank cells. Shared by every colour variant.
export function knightMountedAnimations() {
    return [
        { key: 'idle', label: 'Idle', cells: frameRange(1, 8, 10) },
        { key: 'graze', label: 'Graze', cells: frameRange(9, 16, 10) },
        { key: 'walk', label: 'Walk', cells: frameRange(17, 23, 10) },
        { key: 'runpikeup', label: 'Run Pike Up', cells: frameRange(24, 29, 10) },
        { key: 'charge', label: 'Charge', cells: frameRange(30, 35, 10) },
        { key: 'chargehit', label: 'Charge Hit', cells: frameRange(36, 41, 10) },
        { key: 'jump', label: 'Jump', cells: frameRange(42, 50, 10) },
        { key: 'death', label: 'Death', cells: frameRange(51, 58, 10) },
    ];
}

// #674 (Han: "art lady, last frame is 'statue' variant") — the 7th (last) idle frame is a distinct static
// pose, not part of the idle loop; split into its own 'statue' animation on the SAME creature.
export function artLadyAnimations(contentRows) {
    const row0 = contentRows.find((r) => r.row === 0);
    const total = row0?.frames || 7;
    return [
        { key: 'idle', label: 'Idle', cells: rowCells(0, total - 1) },
        { key: 'statue', label: 'Statue', cells: [{ row: 0, col: total - 1 }] },
    ];
}

// #683 (Han 2026-08-04, replaces §675's earlier transcription of this SAME 6-col×11-row sheet — Han:
// "f1-5 idle" ... "f53-65 death"): row-major frame numbering (frame N → row=⌊(N-1)/6⌋, col=(N-1)%6);
// verified self-consistent — 65 frames used out of the 66-cell grid, 1 trailing blank, exactly matching
// idle's frame count (5) unchanged from §675's version (row0 cols0-4 either way). 8 colour variants
// (Black/Blue/Brown/Green/Purple/Red/White/Yellow Wizard sheet.png) share this mapping.
// #790 (Han 2026-08-09, "the wizard has hardcoded, time-tuned animations. Solution to keep single source
// of truth: add these animations to the bestiary too: song_attack"): Level 9's song-timed attack — formerly
// `src/model/enemyAssets.js`'s hardcoded `WIZARD_ATTACK_SINGLE/DOUBLE/TRIPLE` (§679/§693 round 3) — is now
// defined HERE as 3 animation keys (`song_attack_single/double/triple`, one per note-run length) using the
// SAME 1-indexed row-major frame numbers `enemyAssets.js` used, resolved via `frameCell` below instead of a
// hand-copied {row,col} list. `enemyAssets.js`/`SheetRpgLayer.jsx` now read these from the manifest instead
// of hardcoding them (§6c) — this NOTE (and the stale "cast2 no longer exists" caveat it used to carry) is
// now resolved: 'idle' is still unaffected (identical cell list to before).
export function wizardPortraitAnimations() {
    const seq = (...pairs) => pairs.flatMap(([row1, cols1]) => cols1.map((c) => ({ row: row1 - 1, col: c - 1 })));
    // frame N (1-indexed, row-major across the 6-col sheet) → {row,col}; `flashIndices` is the index INTO
    // `cells` (not a raw frame number) of each "flash" beat — enemyAssets.js used to derive this at runtime
    // via `frames.indexOf(f)`; precomputed once here since the frame list itself now lives here too.
    const frameCell = (n) => ({ row: Math.floor((n - 1) / 6), col: (n - 1) % 6 });
    const songAttack = (frames, flashFrames) => ({
        cells: frames.map(frameCell),
        flashIndices: flashFrames.map((f) => frames.indexOf(f)),
    });
    // Han's frame spec (§693 round 3, revised): single f26-31(flash 30); double f26-31(flash30),32-34,36-37
    // (flash36, skips f35); triple double + f38,40-44 (flash42, also skips f39).
    const songAttackSingle = songAttack([26, 27, 28, 29, 30, 31], [30]);
    const songAttackDouble = songAttack([26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 37], [30, 36]);
    const songAttackTriple = songAttack([26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 37, 38, 40, 41, 42, 43, 44], [30, 36, 42]);
    return [
        { key: 'idle', label: 'Idle', cells: seq([1, [1, 2, 3, 4, 5]]) },
        { key: 'walk', label: 'Walk', cells: seq([1, [6]], [2, [1, 2, 3, 4, 5]]) },
        { key: 'walkattack', label: 'Walk Attack', cells: seq([2, [6]], [3, [1, 2, 3, 4, 5]]) },
        { key: 'jump', label: 'Jump', cells: seq([3, [6]], [4, [1, 2, 3, 4, 5, 6]], [5, [1]]) },
        { key: 'simpleattack', label: 'Simple Attack', cells: seq([5, [2, 3, 4, 5, 6]], [6, [1, 2, 3, 4, 5, 6]], [7, [1]]) },
        { key: 'block', label: 'Block', cells: seq([7, [2, 3, 4, 5, 6]]) },
        { key: 'blockhit', label: 'Block Hit', cells: seq([8, [1, 2, 3, 4, 5]]) },
        { key: 'resting', label: 'Resting', cells: seq([8, [6]], [9, [1, 2, 3, 4]]) },
        { key: 'death', label: 'Death', cells: seq([9, [5, 6]], [10, [1, 2, 3, 4, 5, 6]], [11, [1, 2, 3, 4, 5]]) },
        { key: 'song_attack_single', label: 'Song Attack (Single)', cells: songAttackSingle.cells, flashIndices: songAttackSingle.flashIndices },
        { key: 'song_attack_double', label: 'Song Attack (Double)', cells: songAttackDouble.cells, flashIndices: songAttackDouble.flashIndices },
        { key: 'song_attack_triple', label: 'Song Attack (Triple)', cells: songAttackTriple.cells, flashIndices: songAttackTriple.flashIndices },
    ];
}

// #677 (Han 2026-08-03, ninth follow-up: "santa, vampire lady 2, zij steeds 1,2,3,4,5 idle, 6,7,8,9,10,11,
// 12,13 walk, 14 portrait") — a SINGLE row, 14 columns: cols0-4 idle, cols5-12 walk, col13 is an embedded
// portrait (unused here — the standalone "…Portrait 64x64.png" already pairs via the normal PORTRAIT_MAP
// mechanism, §672, since both live in their own dedicated character folder).
export function santaVampireAnimations() {
    return [
        { key: 'idle', label: 'Idle', cells: Array.from({ length: 5 }, (_, c) => ({ row: 0, col: c })) },
        { key: 'walk', label: 'Walk', cells: Array.from({ length: 8 }, (_, c) => ({ row: 0, col: c + 5 })) },
    ];
}

// #677 (Han: "knights (heavy en knighty) 69x58" + detailed row/col breakdown). Verified against Knight
// Knighty's actual sheet dimensions (345×812 = EXACTLY 5 cols × 14 rows at 69×58 — Han's own numbers,
// cross-checked: the 8 animations below total exactly 70 cells = 5×14, with no leftover, a strong
// consistency check) — but Knight HEAVY's sheets (455×768) do NOT divide evenly by 69×58 (455/69≈6.59,
// 768/58≈13.24), so this mapping is applied to KNIGHTY ONLY. Heavy is left on the generic scan pending
// Han re-measuring its real frame size — flagged, not guessed.
// One row/col typo assumed corrected: "rij 5 (3,4,5) + rij 5 (1,2) idle" reused row 5 twice, which can't be
// right (a row can't supply both halves of a merge) — read as "+ rij 6", which is what makes the totals
// below add up to exactly 70 cells.
// #682 (Han 2026-08-04, "merge alle knight (heavy); ... heeft dezelfde animaties"): parameterized by the
// sheet's real row count so the SAME cell layout serves both Knighty (14 rows) and Heavy (12 rows) — Heavy's
// sheet is 2 rows shorter, so its 'death' animation simply ends up with fewer frames (whatever rows 11-12
// 0-indexed actually contain) rather than reading out-of-bounds rows that don't exist in the file.
export function knightyAnimations(totalRows = 14) {
    const seq = (...pairs) => pairs.flatMap(([row1, cols1]) => cols1.map((c) => ({ row: row1 - 1, col: c - 1 })));
    const clamp = (cells) => cells.filter((c) => c.row < totalRows);
    return [
        { key: 'walk', label: 'Walk', cells: clamp(seq([1, [1, 2, 3, 4, 5]], [2, [1, 2, 3, 4, 5]])) },
        { key: 'attack', label: 'Attack', cells: clamp(seq([3, [1, 2, 3, 4, 5]], [4, [1]])) },
        { key: 'jump', label: 'Jump', cells: clamp(seq([4, [2, 3, 4, 5]], [5, [1, 2]])) },
        { key: 'idle', label: 'Idle', cells: clamp(seq([5, [3, 4, 5]], [6, [1, 2]])) },
        { key: 'block', label: 'Block', cells: clamp(seq([6, [3, 4, 5]], [7, [1, 2, 3, 4, 5]], [8, [1, 2, 3]])) },
        { key: 'attackdouble', label: 'Attack Double', cells: clamp(seq([8, [4, 5]], [9, [1, 2, 3, 4, 5]], [10, [1, 2]])) },
        { key: 'idlesit', label: 'Idle Sit', cells: clamp(seq([10, [3, 4, 5]], [11, [1, 2, 3]])) },
        { key: 'death', label: 'Death', cells: clamp(seq([11, [4, 5]], [12, [1, 2, 3, 4, 5]], [13, [1, 2, 3, 4, 5]], [14, [1, 2, 3, 4, 5]])) },
    ].filter((a) => a.cells.length > 0);
}
// #677 (Han: "en dan sheet run nog run - fast") — a single 6-frame animation, its own bonus sheet. Also
// reused for Knight Heavy's run sheet (§682 — same 6×1 layout, just a different pixel size).
export function knightyRunFastAnimations() {
    return [{ key: 'runfast', label: 'Run - Fast', cells: Array.from({ length: 6 }, (_, c) => ({ row: 0, col: c })) }];
}
// #682 (Han: "en dan sheet2: rij 1 walk alt, rij 2 run alt, rij 3 attack alt") — Knight Heavy's bonus 7×3
// sheet (Knighty itself has no matching file on disk).
export function knightHeavySheet2Animations() {
    const labels = ['Walk Alt', 'Run Alt', 'Attack Alt'];
    return labels.map((label, row) => ({ key: label.toLowerCase().replace(/\s+/g, ''), label, cells: rowCells(row, 7) }));
}

// #670 (Han: "boss_spider: rij1 idle, rij2 walk, rij3 threaten, rij4 attack, rij5 ??, rij6 death") — row 5
// is explicitly "unknown" (Han's own "??"), so it's dropped rather than guessed at.
export function boss_spiderAnimations(contentRows) {
    const labels = ['Idle', 'Walk', 'Threaten', 'Attack', null, 'Death'];
    return contentRows.filter((r) => labels[r.row]).map((r) => ({
        key: labels[r.row].toLowerCase(), label: labels[r.row], cells: rowCells(r.row, r.frames),
    }));
}

// #670/#672 (Han: "large skull: ok, maar rij1+rij2 = attack" → "large skull: idle, attack, move") — rows
// 0+1 (his rij1/rij2) merge into one 'attack' animation; §672 clarified the display ORDER is idle, attack,
// move (not attack first) — attack is still built from the SAME merged rows 0-1, just listed second.
export function largeSkullAnimations(contentRows) {
    const ROW_LABELS = ['Idle', 'Move', 'Attack', 'Death'];
    const attackCells = contentRows.slice(0, 2).flatMap((r) => rowCells(r.row, r.frames));
    const attack = { key: 'attack', label: 'Attack', cells: attackCells };
    const rest = contentRows.slice(2).map((r, i) => ({
        key: (ROW_LABELS[i] || `Row ${r.row}`).toLowerCase(), label: ROW_LABELS[i] || `Row ${r.row}`,
        cells: rowCells(r.row, r.frames),
    }));
    // rest[0] is positionally 'Idle' (first row after the merge) — reorder to idle, attack, move.
    return rest.length ? [rest[0], attack, ...rest.slice(1)] : [attack];
}

// #670 (Han: "the devil: eerste 2 rijen: idle 1, rij3+4 idle2, rij5: empty cauldron") — rows given 1-
// indexed; two idle VARIANTS (not idle+move) plus a distinct 3rd pose, each spanning 2 merged rows except
// the last.
export function devilAnimations(contentRows) {
    const cellsFor = (rowIdxs) => contentRows.filter((r) => rowIdxs.includes(r.row)).flatMap((r) => rowCells(r.row, r.frames));
    return [
        { key: 'idle1', label: 'Idle 1', cells: cellsFor([0, 1]) },
        { key: 'idle2', label: 'Idle 2', cells: cellsFor([2, 3]) },
        { key: 'emptycauldron', label: 'Empty Cauldron', cells: cellsFor([4]) },
    ];
}

// #870 (Han 2026-08-11, "heal totem en buff totem: r1 idle, r2 spawn r4 death (r3 mag weg)") — both totems
// share the exact same 4-row layout (generic idle/move/attack/death guess); row 3 (the old 'attack') is
// explicitly dropped rather than guessed at, same "??" convention as `boss_spiderAnimations`.
export function healBuffTotemAnimations(contentRows) {
    const labels = ['Idle', 'Spawn', null, 'Death'];
    return contentRows.filter((r) => labels[r.row]).map((r) => ({
        key: labels[r.row].toLowerCase(), label: labels[r.row], cells: rowCells(r.row, r.frames),
    }));
}
// #870 (Han 2026-08-11, "fire totem (64x32): r1 idle r2 spawn r3 cast r5 death") — row 4 is dropped (Han's
// spec skips straight from r3 'cast' to r5 'death'); the fire spit projectile lives in a separate file,
// wired as a portrait companion instead (PORTRAIT_OVERRIDES_BY_NAME in the main script), not a 6th row here.
export function fireTotemAnimations(contentRows) {
    const labels = ['Idle', 'Spawn', 'Cast', null, 'Death'];
    return contentRows.filter((r) => labels[r.row]).map((r) => ({
        key: labels[r.row].toLowerCase(), label: labels[r.row], cells: rowCells(r.row, r.frames),
    }));
}
