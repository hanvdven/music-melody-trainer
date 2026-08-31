import React, { useState } from 'react';
import { Swords } from 'lucide-react';
import './LevelSplash.css';
import { LeftFanCarousel } from '../sheet-music/overlays/fanCarousels';
import { LEVELS, LEVEL_MODE_VARIANTS, applyLevelVariant, availableVariantLetters } from '../../levels/levels';
import LevelZeroConfigForm from './LevelZeroConfigForm';
// #1087 icon rollout (Han 2026-08-24, "gebruik de nieuwe status_effect_icons"): the actual asset imports
// live HERE (the UI layer), not in levels.js (§6c/§6d — levels.js stays import-free of UI/asset concerns,
// same reasoning as generationFields.js's lucide icons never being imported there). levels.js's
// `LEVEL_MODE_VARIANTS[letter].iconKey` is the lookup key into this map — the numbers below are Han's own
// index into the Status_effect sheet (e.g. "1.200" = Status_effect1_1_200.png), verified to exist.
import iconRubato from '../../assets/ASSET DROP/Icons/Status_effect1_1_200.png';        // Snowflake
import iconSlow from '../../assets/ASSET DROP/Icons/Status_effect1_1_11.png';           // Hourglass
import iconHalfTempo from '../../assets/ASSET DROP/Icons/Status_effect1_1_343.png';     // Boot
import iconListenRepeat1 from '../../assets/ASSET DROP/Icons/Status_effect1_1_151.png'; // Mage / Hat
import iconListenRepeat2 from '../../assets/ASSET DROP/Icons/Status_effect2_1_74.png';  // Laser/Blast
import iconFullTempo from '../../assets/ASSET DROP/Icons/Status_effect2_1_11.png';      // Award
import iconModulated from '../../assets/ASSET DROP/Icons/Status_effect1_1_323.png';     // Spiral
import iconRandomizedNotes from '../../assets/ASSET DROP/Icons/Status_effect1_1_462.png'; // Dice
import iconAdaptiveSpeed from '../../assets/ASSET DROP/Icons/Status_effect1_1_23.png';  // Arrow

const ICON_BY_KEY = {
    rubato: iconRubato,
    slow: iconSlow,
    halfTempo: iconHalfTempo,
    listenRepeat1: iconListenRepeat1,
    listenRepeat2: iconListenRepeat2,
    fullTempo: iconFullTempo,
    modulated: iconModulated,
    randomizedNotes: iconRandomizedNotes,
    adaptiveSpeed: iconAdaptiveSpeed,
};

// #1100 (split from #1087, Han 2026-08-22): the picker's own display order — an explicit array rather
// than `Object.keys(LEVEL_MODE_VARIANTS)` so a future variant added to that table doesn't silently
// reorder these buttons (object key order is an implementation detail, not a UI contract).
// #1101 (split from #1087): d/e (call-response) added — see levels.js's LEVEL_MODE_VARIANTS own comment.
// #1087 icon rollout (Han 2026-08-24): g/h/i added as RESERVED slots (levels.js's `notYetImplemented`) —
// shown with their icon so Han can see the full planned set, but disabled (see the button's `disabled`
// prop below) since picking one would currently change nothing.
// #1153/#1154 (Han 2026-08-25): g (Modulated) and h (Randomized Notes) are now IMPLEMENTED —
// `notYetImplemented` removed from their levels.js entries, so they're no longer disabled here. Only i
// (Adaptive speed) remains reserved.
const VARIANT_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

// #679 (Han 2026-08-03, Level 9): derived from LEVELS itself (§6c — no hardcoded list to fall out of sync
// with levels.json again) instead of a literal array that silently excludes any newly-added level.
const LEVEL_NUMBERS = Object.keys(LEVELS).map(Number).sort((a, b) => a - b);

// #661 (Han 2026-08-02): "maak een splash screen voor het level start, met daarin een tanh carousel dat
// het level nummer kiest." Reuses the SAME CSS chrome as the "Well done!" splash (LevelSplash.css, §6d —
// one card look for both level-flow modals) and the SAME tangens/tanh fan carousel every other in-sheet
// setter uses (`LeftFanCarousel`, src/components/sheet-music/overlays/fanCarousels.jsx — no second
// carousel engine). Replaces the header's old 3 separate per-level buttons (AppHeader.jsx): ONE "Start
// Level" button opens this splash; dragging the carousel picks 1/2/3; a separate Start button confirms
// (Han: avoid accidentally starting mid-drag).
//
// UAT (same day, Han: "maak hidden carousel van, en de scroll richting moet andersom") — both are EXISTING
// `LeftFanCarousel` props, reused verbatim (§6c/§6d), not new behaviour: `compact` shows only the active
// number at rest and fans the neighbours out while dragging (the same "reveal-on-interaction" convention
// the generation carousels use, §52); `invert` flips only the DRAG direction (layout is unchanged — high
// values still sit high), matching the BPM/measures/repeats fans elsewhere in the app.
//
// #661 (Han 2026-08-02, 8-level ramp): an info panel below the carousel shows each level's bpm, enemy type
// (Han: "gewoon slimes" — always Slime, no per-level bestiary swap) and what it newly introduces
// (`lvl.intro`, levels.js) — read straight off the chosen `LEVELS[n]` object, single source of truth.
// Level editor (Han 2026-08-06, Level 0 = the live-editable sandbox): defaults the carousel to LEVEL 1,
// not array-index 0 — id 0 now sorts first in LEVEL_NUMBERS, but a brand-new player should still land on
// the real first level, not the sandbox. Falls back to index 0 if id 1 is ever removed.
const DEFAULT_INDEX = Math.max(0, LEVEL_NUMBERS.indexOf(1));

export default function LevelStartSplash({ onStart, onClose, debugMode = false }) {
    const [activeIndex, setActiveIndex] = useState(DEFAULT_INDEX);
    const chosen = LEVEL_NUMBERS[activeIndex];
    const lvl = LEVELS[chosen];
    const levelName = lvl?.name || `Level ${chosen}`;
    // #1100 (split from #1087): `null` = "standaard" (the level's own authored bpm/colorScheme/colorScope, today's
    // exact behaviour) — not mapped to any one letter, since most levels' own config doesn't exactly
    // match any single variant (levels.js's `applyLevelVariant` own comment).
    // UX reversal (Han 2026-08-25, "Level variant mode kiezen en dan level nummer veranderen: laat level
    // mode staan TENZIJ deze niet bestaat / actief is voor het gekozen level"): used to unconditionally
    // reset to "standaard" on every carousel move. Now PERSISTS across a level-number change — see
    // `handleCarouselCommit` below, which only clears it when the newly-chosen level doesn't offer that
    // letter (`availableVariantLetters`) or isn't a sideScroll level (no variant row shown at all).
    const [selectedVariant, setSelectedVariant] = useState(null);
    const previewLvl = lvl ? applyLevelVariant(lvl, selectedVariant) : null;
    // Level 0 (Han 2026-08-06, "dat wil ik in de 'config' voor het begin van het level doen, dus niet
    // via instelling overlay"): a pre-start editable draft, kept in THIS component (not written back to
    // LEVELS[0] — every fresh open of the splash starts from the JSON baseline again). Persists across
    // carousel moves within one open session (deliberately NOT reset when navigating away and back to id
    // 0) so a half-finished edit isn't lost by briefly checking another level.
    const [level0Draft, setLevel0Draft] = useState(() => LEVELS[0]);
    const isLevel0 = chosen === 0;
    // Audit fix (Han 2026-08-24, "los inconsistenties op" — see levels.js's `availableVariantLetters`
    // own comment for the two broken combos this excludes): computed per-level, not a static list, since
    // whether a letter makes sense depends on THIS level's songId/enemyType.
    const variantLetters = lvl ? availableVariantLetters(lvl, VARIANT_LETTERS) : [];

    // Han 2026-08-25: carries `selectedVariant` forward into the newly-chosen level, clearing it ONLY
    // when that letter doesn't apply there — either the level isn't `sideScroll` (no variant row at all)
    // or `availableVariantLetters` drops it for this level's shape (e.g. 'h' Randomized Notes only exists
    // for songId levels; 'd'/'e' call-response combos §9's own exclusions).
    const handleCarouselCommit = (i) => {
        setActiveIndex(i);
        setSelectedVariant((prev) => {
            if (prev == null) return null;
            const newLvl = LEVELS[LEVEL_NUMBERS[i]];
            if (!newLvl || !newLvl.sideScroll) return null;
            return availableVariantLetters(newLvl, VARIANT_LETTERS).includes(prev) ? prev : null;
        });
    };

    return (
        <div className="ls-overlay" onClick={onClose}>
            <div className="ls-card" onClick={(e) => e.stopPropagation()}>
                <div className="ls-badge"><Swords size={40} style={{ color: 'var(--accent-yellow)' }} /></div>
                <h2 className="ls-title">Start Level</h2>
                <div className="ls-sub">{levelName}</div>
                <svg viewBox="0 0 200 140" width="100%" height="140" style={{ overflow: 'visible' }}>
                    <LeftFanCarousel
                        cx={100}
                        centerY={70}
                        items={LEVEL_NUMBERS}
                        activeIndex={activeIndex}
                        onCommit={handleCarouselCommit}
                        renderLabel={(v) => String(v)}
                        activeLabelSize={36}
                        bandW={60}
                        compact
                        invert
                    />
                </svg>
                {/* #1100 (split from #1087): a/b/c/f mode-variant picker — only for sideScroll levels
                    (every variant concerns scrolling-gameplay pacing/coloring, see levels.js's
                    `applyLevelVariant` own comment). `null` ("standaard") has no button of its own; it's
                    just the state before any letter is picked, reset on every carousel move above.
                    'a' (rubato) is offered for EVERY sideScroll level, songId included — the plan's
                    original risk flag ("gatedScroll+songId is unverified") turned out to be WRONG: Levels
                    1 and 2 (levels.json) are ALREADY songId+gatedScroll together, and are the two most
                    heavily fixed/tested levels in the whole app this cycle (§285-289) — the gating
                    mechanism has always been content-source-agnostic (fixed song vs JIT-procedural).
                    Audit fix (Han 2026-08-24): `variantLetters` (not the raw VARIANT_LETTERS list) —
                    `availableVariantLetters` (levels.js) drops 'd'/'e' for a songId level (call-response
                    generation would silently replace the actual composed song) and drops 'a' for a
                    native Wizard/Mixed level (the gate freeze isn't gate-aware for the wizard cast audio
                    yet, see that function's own comment for the full trace). */}
                {lvl && !isLevel0 && lvl.sideScroll && (
                    <>
                        <div className="ls-variant-row">
                            {variantLetters.map((letter) => (
                                <button
                                    key={letter}
                                    type="button"
                                    className={`ls-variant-btn${selectedVariant === letter ? ' ls-variant-active' : ''}`}
                                    title={LEVEL_MODE_VARIANTS[letter].label}
                                    disabled={!!LEVEL_MODE_VARIANTS[letter].notYetImplemented}
                                    onClick={() => setSelectedVariant(letter)}
                                >
                                    {/* Icon rollout (Han 2026-08-24, "vervang het vakje gewoon voor het
                                        icoontje, geen letter meer, zelfde formaat, outline op de
                                        geselecteerde"): the icon FILLS the button — no letter text
                                        anywhere. Active state = a border outline (.ls-variant-active in
                                        LevelSplash.css), not a fill colour swap. */}
                                    <img src={ICON_BY_KEY[LEVEL_MODE_VARIANTS[letter].iconKey]}
                                        alt={LEVEL_MODE_VARIANTS[letter].label} draggable={false} />
                                </button>
                            ))}
                        </div>
                        {/* Bug fix (Han 2026-08-23, "wat is E? is me niet geheel duidelijk"): a hover-only
                            `title` tooltip isn't discoverable on a touch device and gives no feedback once
                            a letter is already picked — this line always shows what the CURRENT selection
                            (including "Standaard", the null/no-letter state) actually means, no hover
                            needed. */}
                        <div className="ls-variant-label">
                            {selectedVariant ? LEVEL_MODE_VARIANTS[selectedVariant].label : 'Standaard'}
                        </div>
                    </>
                )}
                {lvl && !isLevel0 && (
                    <div className="ls-stats" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
                        <div className="ls-stat">
                            {/* #1053 (Han 2026-08-17, "Zet de BPM op 'rubato'"): a gated level has no fixed
                                tempo to click to (SheetRpgLayer waits for the player, #1052) — shown here
                                the same way BpmControls.jsx's header display does (§6c: same convention,
                                not a second one), never the raw number. #1100: reads `previewLvl` (the
                                chosen variant applied on top of `lvl`) so picking 'a'/rubato or a slower
                                speed variant is reflected here immediately, before Start is pressed. */}
                            <span className="ls-stat-value">{previewLvl.gatedScroll ? 'rubato' : previewLvl.bpm}</span>
                            <span className="ls-stat-label">bpm</span>
                        </div>
                        <div className="ls-stat">
                            <span className="ls-stat-value">{lvl.enemyType}</span>
                            <span className="ls-stat-label">tegenstander</span>
                        </div>
                        <div className="ls-stat" style={{ gridColumn: '1 / -1' }}>
                            <span className="ls-stat-value" style={{ fontSize: 14 }}>{lvl.intro}</span>
                            <span className="ls-stat-label">nieuw in dit level</span>
                        </div>
                    </div>
                )}
                {/* Debug: full level params (Han 2026-08-06, "ik wil de level params zien tijdens het
                    'start level' splash screen, niet tijdens het level") — the stats grid above only ever
                    showed bpm/enemyType/intro; this dumps the WHOLE chosen level object (every field,
                    including normalizeLevel's derived numRepeats/totalMeasures) so debugMode users can
                    inspect every param BEFORE starting. Not shown for Level 0 — its own editable form
                    (below) already shows/edits every field, a read-only dump on top would be redundant. */}
                {debugMode && lvl && !isLevel0 && (
                    <pre style={{
                        textAlign: 'left', fontSize: 10, lineHeight: 1.3, maxHeight: 220, overflow: 'auto',
                        background: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: '6px 8px', marginBottom: 14,
                    }}>
                        {JSON.stringify(previewLvl, null, 1)}
                    </pre>
                )}
                {/* Level 0 (Han 2026-08-06, "hoe kan ik level 0 aanpassen? dat wil ik in de config voor
                    het begin van het level doen, niet via instelling overlay"): every schema field,
                    editable here, BEFORE Start — see LevelZeroConfigForm.jsx. */}
                {isLevel0 && <LevelZeroConfigForm draft={level0Draft} onChange={setLevel0Draft} />}
                <div className="ls-actions">
                    <button className="ls-btn ls-replay" onClick={() => onStart(isLevel0 ? level0Draft : chosen, isLevel0 ? null : selectedVariant)}>▶ Start</button>
                    <button className="ls-btn" onClick={onClose}>Sluiten</button>
                </div>
            </div>
        </div>
    );
}
