import React from 'react';
import NonLinearCarousel, { visibleRange, xOffsetForDist } from './overlays/NonLinearCarousel';
import { useRevealOnInteraction } from '../../hooks/useRevealOnInteraction';
import { bracketPaths, BracketSvg } from './overlays/carouselBrackets';

// ── Shared carousel-field building blocks for the generation setters (Han 2026-06-22) ──────────
//
// WHY this file exists (§6c/§6d): Han wants EVERY generation/advanced field rebuilt as a full
// 5-wide NonLinearCarousel (visibleHalf=2) with a LUCIDE ICON on top + a TEXT LABEL below + a
// dashed category "blokhaken" bracket above — the SAME look as the instrument carousel
// (InstrumentStaffOverlay). Both GenerationSetterOverlay and GenerationAdvancedSetterOverlay need
// the identical item renderer + bracket drawing, so rather than copy it into both overlays (which
// would drift), the shared pieces live here as ONE source of truth. The carousel ENGINE itself is
// reused (NonLinearCarousel) — this file only supplies renderItem + bracket geometry.
//
// TODO(§6d): consolidate bracket helper with InstrumentStaffOverlay. The bracket geometry below is
// REPLICATED from InstrumentStaffOverlay.bracketGeom / categoryHeaders (dashed line + end hooks,
// var(--text-primary), label gap in the middle). InstrumentStaffOverlay is owned by another agent
// right now, so we replicate-and-flag instead of extracting a single helper both consume. When both
// land, fold this and InstrumentStaffOverlay's bracket code into one module.

// ── Lucide icon → inline SVG inside the sheet <svg> ────────────────────────────────────────────
// Lucide components render an <svg viewBox="0 0 24 24">. Nesting <svg> inside <svg> is valid; we
// give it explicit x/y/width/height so it lands at the right spot and size. We pass
// stroke="currentColor" so the icon inherits the per-item colour set on the wrapping <g>'s `color`.
// Sized via the `size` prop (user units). Authored around the carousel item ORIGIN (0,0): the icon
// is centred horizontally on x=0 and sits at `iconY` (relative to the carousel row's centre).
const renderLucideIcon = (IconComp, { size, iconY }) => {
  if (!IconComp) return null;
  return (
    <IconComp
      x={-size / 2}
      y={iconY}
      width={size}
      height={size}
      // currentColor → inherits the wrapping <g style={{ color }}> so active/dim colouring is one
      // place (matches the instrument carousel's colour-by-state convention).
      color="currentColor"
      strokeWidth={2}
      style={{ pointerEvents: 'none' }}
    />
  );
};

// #436 (Han: icons8 pass) — an icons8 PNG icon for a carousel item, drawn like the instrument
// carousel's flat-black art: the theme filter keeps it visible on dark themes. Used when an item
// carries an `iconUrl` (melody-type rules now use icons8 instead of lucide glyphs).
const renderIcon8 = (iconUrl, { size, iconY }) => {
  if (!iconUrl) return null;
  return (
    <image href={iconUrl} x={-size / 2} y={iconY} width={size} height={size}
      style={{ pointerEvents: 'none', filter: 'var(--instrument-icon-filter, none)' }} />
  );
};

// ── ITEM RENDERER ──────────────────────────────────────────────────────────────────────────────
// Build a renderItem(item, i) for a NonLinearCarousel from an option list + an icon/label resolver.
// item shape: { value/key, label, Icon }. The active item (i === activeIndex) is bright
// (var(--text-primary)); the rest are lowlit (var(--text-lowlight)) — same convention as the
// instrument carousel. Layout: lucide icon on top (iconY), text label below (labelY).
//
// SIZING is passed in as named consts from the owning overlay (Han 2026-06-22 wants all sizing as
// tunable named consts at the overlay top), so this renderer is layout-agnostic.
export const makeRenderItem = ({ activeIndex, iconSize, iconY, labelY, labelFontSize, renderContent, colorOf }) => {
  // Returns a render-PROP for NonLinearCarousel.renderItem (invoked manually), NOT a React
  // component — so there's no display name to give.
  const renderCarouselItem = (item, i) => {
    const active = i === activeIndex;
    // #362 (Han): category colours per item, like the instrument setter — the
    // ACTIVE item takes its category tint; inactive stays lowlight.
    const color = active ? (colorOf?.(item) ?? 'var(--text-primary)') : 'var(--text-lowlight)';
    return (
      // `color` on the group → currentColor for the lucide icon; fill on the <text> for the label.
      <g style={{ pointerEvents: 'none', color }}>
        {/* #295 (Han): custom item CONTENT (inline staff notes, rhythm patterns,
            Roman numerals) takes the icon slot when provided; falls back to the
            lucide icon otherwise. Content renderers draw via the canonical
            staff-note components (§6d — see generationNoteGlyphs). */}
        {renderContent
          ? renderContent(item, active, color)
          : item.iconUrl
            ? renderIcon8(item.iconUrl, { size: iconSize, iconY })
            : renderLucideIcon(item.Icon, { size: iconSize, iconY })}
        {/* ALL CAPS per the standing carousel-text CR. An item/field may omit its
            label (e.g. Roman-numeral items ARE their label). */}
        {item.label ? (
          <text x={0} y={labelY} textAnchor="middle" fontSize={labelFontSize}
            fontFamily="sans-serif" fontWeight={active ? 'bold' : 'normal'} fill={color}>
            {String(item.label).toUpperCase()}
          </text>
        ) : null}
      </g>
    );
  };
  return renderCarouselItem;
};

// #432: the bracket path formula + <g> renderer now live in the SHARED carouselBrackets module (one
// source of truth for the "blokhaken", consumed by BOTH this file and InstrumentStaffOverlay). We
// just add the per-run colour on top of the shared geometry.
const buildBracket = (x1, x2, y, rawLabel, color) => ({ ...bracketPaths(x1, x2, y, rawLabel), y, color });

// ── SINGLE FIELD-NAME BRACKET ───────────────────────────────────────────────────────────────────
// For fields whose items are NOT grouped (notePool, notesPerMeasure, etc.), draw ONE bracket
// spanning the full visible carousel window, labelled with the FIELD NAME. Static (the field name
// never changes as the carousel scrolls), so this is a plain React element — no per-frame update.
// `edgeX` = (visibleHalf + 0.5) * baseWidth → the carousel's fixed visible-window half-width.
export const FieldNameBracket = ({ centerX, bracketY, edgeX, label }) => {
  const geom = buildBracket(centerX - edgeX, centerX + edgeX, bracketY, label);
  return <BracketSvg geom={geom} />;
};

// ── FAMILY BRACKETS (melody-type field — grouped by rule FAMILY) ─────────────────────────────────
// Mirrors InstrumentStaffOverlay.categoryHeaders: for the items currently VISIBLE around the centre,
// draw one bracket per consecutive same-FAMILY run of 2+ items, spanning that run. CYCLICAL + LIVE:
// `pos` is the fractional live carousel centre (wrapped); visibleRange returns the visible indices
// in left→right visual order (wrap-aware); we group consecutive same-family items and bracket runs
// of 2+. Each run's x-span uses xOffsetForDist(signedDist(...)) so brackets track items as pos moves.
//
// Unlike the instrument overlay we keep it SIMPLE (no imperative per-frame slot pool): the generation
// carousels are small and re-rendering a few brackets on each onPosChange tick is cheap, and these
// overlays don't have the morph-cascade slot machinery. We expose a hook-free helper that computes
// the bracket geoms for a given pos so the overlay can re-render via React state.
const signedDist = (i, pos, n) => ((i - pos + n / 2 + n) % n) - n / 2;

// items: [{ family }]; familyName: (family) => display string; visibleHalf matches the carousel.
export const familyBrackets = (
  pos, items, { centerX, bracketY, baseWidth, visibleHalf, edgeX, familyName, familyColor },
) => {
  const geomPropsColor = (fam) => familyColor?.(fam) ?? null;
  const N = items.length;
  const visible = visibleRange(pos, N, visibleHalf);  // ordered, wrap-aware real indices
  const firstVis = visible[0];
  const lastVis = visible[visible.length - 1];
  const runs = [];
  let run = null;
  const flush = () => {
    if (run && run.count >= 2) runs.push(run);
  };
  for (const idx of visible) {
    const fam = items[idx].family;
    if (run && run.family === fam) {
      run.lastIdx = idx; run.count += 1;
    } else {
      flush();
      run = { family: fam, firstIdx: idx, lastIdx: idx, count: 1 };
    }
  }
  flush();
  // Build geometry per run. Pin an outer end to the FIXED carousel edge when that run's outer item
  // is the outermost-visible item (anti-jitter, mirrors InstrumentStaffOverlay's pinLeft/pinRight).
  return runs.map((r) => {
    // Pass visibleHalf so the bracket x tracks the carousel's NON-LINEAR layout (Han #163:
    // xOffsetForDist now depends on the window half). These field carousels use the default
    // half (2), but we pass it explicitly so it stays correct if the window ever widens.
    const xLeftRaw = xOffsetForDist(signedDist(r.firstIdx, pos, N), visibleHalf) * baseWidth;
    const xRightRaw = xOffsetForDist(signedDist(r.lastIdx, pos, N), visibleHalf) * baseWidth;
    const x1 = r.firstIdx === firstVis ? (centerX - edgeX) : (centerX + xLeftRaw - baseWidth * 0.42);
    const x2 = r.lastIdx === lastVis ? (centerX + edgeX) : (centerX + xRightRaw + baseWidth * 0.42);
    return buildBracket(x1, x2, bracketY, familyName(r.family),
      geomPropsColor(r.family));
  });
};

// React component: the family brackets for a melody-type carousel, re-rendered from the live pos.
// `pos` is supplied by the owning overlay (it tracks the carousel's onPosChange in state). We key
// by position index, not family, so two same-family runs across the seam never collide.
export const FamilyBrackets = ({ pos, items, geomProps }) => {
  const geoms = familyBrackets(pos, items, geomProps);
  return (
    <g style={{ pointerEvents: 'none' }}>
      {geoms.map((geom, i) => <BracketSvg key={i} geom={geom} />)}
    </g>
  );
};

// ── ONE FIELD = one carousel + its bracket(s) ───────────────────────────────────────────────────
// A self-contained field cell: a NonLinearCarousel (5-wide, visibleHalf=2) showing `items`, with
// either a single FIELD-NAME bracket (default) or FAMILY brackets (melodyType) above it. The active
// item = the current value; onSelect writes the field (wiring lives in the overlay's onSelect).
//
// Sizing/spacing are passed in as named consts from the overlay (Han wants live-tunable consts at
// the overlay top). This component owns the family-bracket live-pos state so the overlay stays lean.
export const CarouselField = ({
  items, activeIndex, onSelect,
  centerX, rowCenterY,
  // sizing consts (from the overlay):
  baseWidth, hitTop, hitHeight, iconSize, iconDy, labelDy, labelFontSize, bracketDy,
  // bracket mode:
  fieldLabel,           // single field-name bracket label (when not family-grouped)
  // #362 (Han): plain caps label ABOVE the carousel instead of the blokhaken
  // bracket ("de groupings functie wordt abusievelijk gebruikt als setter label").
  labelAbove = null,
  familyMode = false,   // true → group items by item.family
  familyName,           // (family) => display string (family mode only)
  familyColor = null,   // (family) => CSS colour (category tints, #362)
  colorOf = null,       // (item) => CSS colour for the ACTIVE item (#362)
  // #295: custom item content (inline notes / rhythm patterns / Roman numerals);
  // wide-content fields shrink the window (visibleHalf 1 → 3 visible, like the
  // colour carousel) so neighbouring columns don't collide.
  renderContent = null,
  visibleHalf = 2,      // Han 2026-06-22 default: full 5-wide carousel per field.
  // #394a / #398 (Han 2026-07-08): reveal-on-interaction. When `hidden`, the field shows ONLY the
  // active value at rest; tapping it opens the full carousel; a selection or a tap-away closes it
  // (Han Q1). Opt-in so only the generation setters get it; default is the always-visible carousel.
  hidden = false,
  debugMode = false,
}) => {
  const VISIBLE_HALF = visibleHalf;
  const edgeX = (VISIBLE_HALF + 0.5) * baseWidth;
  const iconY = rowCenterY + iconDy;
  const labelY = rowCenterY + labelDy;
  const bracketY = rowCenterY + bracketDy;
  const hitY = rowCenterY + hitTop;

  // Live carousel centre for family brackets (track onPosChange). At rest it equals activeIndex.
  const [pos, setPos] = React.useState(activeIndex);
  // Keep pos in sync when the committed activeIndex changes externally (e.g. settings reset).
  React.useEffect(() => { setPos(activeIndex); }, [activeIndex]);

  const renderItem = makeRenderItem({ activeIndex, iconSize, iconY, labelY, labelFontSize, renderContent, colorOf });

  // #394a / #398 / #428: reveal-on-interaction. Only meaningful when `hidden`. The carousel is now
  // ALWAYS mounted when hidden (it renders itself COLLAPSED — only the active item paints), so a
  // press-and-hold on it begins a drag immediately. The reveal + 3s idle-fade state machine lives in
  // the shared useRevealOnInteraction hook (§6d — the same logic drives the instrument StaffCarousel).
  const { collapsed, mountAllItems, chromeVisible, open, reveal: handleReveal, resetHideTimer, closeNow } =
    useRevealOnInteraction(hidden);

  // handleSelect keeps the field OPEN for another 3s after a selection (Han: "na selectie, wordt na
  // 3s terug hidden") rather than closing immediately.
  const handleSelect = (item, i) => { onSelect?.(item, i); if (hidden) resetHideTimer(); };

  return (
    <g>
      {/* Hidden + open: a tap-away backdrop BEHIND the carousel closes it on a click outside the
          items (Han Q1 "tik weg … sluit"). Kept modest (±1.3·edgeX) so it doesn't hijack the whole
          surface. NB single-open coordination across fields is v1-per-field (documented). */}
      {hidden && open && (
        <rect x={centerX - edgeX * 1.3} y={hitY - hitHeight} width={edgeX * 2.6} height={hitHeight * 3}
          fill="transparent" onClick={closeNow} />
      )}
      {/* #428: fade the chrome (brackets / caps label) in/out with `open` so the whole field, not
          just the carousel items, honours the reveal + fade-out. */}
      <g style={{ opacity: chromeVisible ? 1 : 0, transition: 'opacity 260ms ease', pointerEvents: chromeVisible ? undefined : 'none' }}>
      {familyMode ? (
        <FamilyBrackets
          pos={pos}
          items={items}
          geomProps={{ centerX, bracketY, baseWidth, visibleHalf: VISIBLE_HALF, edgeX, familyName, familyColor }}
        />
      ) : labelAbove ? (
        /* #431 (Han 2026-07-13: "headers - no caps, labels: all caps"): the field-name HEADER above
           the carousel is italic SERIF, NON-capitalised; the item VALUE labels below are sans-serif
           ALL CAPS (makeRenderItem). The dashed blokhaken stay reserved for real groupings. */
        <text x={centerX} y={bracketY} textAnchor="middle" fontSize={14}
          fontFamily="serif" fontStyle="italic"
          fill="var(--text-secondary, #888)" style={{ pointerEvents: 'none' }}>
          {labelAbove}
        </text>
      ) : fieldLabel ? (
        <FieldNameBracket centerX={centerX} bracketY={bracketY} edgeX={edgeX} label={fieldLabel} />
      ) : null}
      </g>
      <NonLinearCarousel
        items={items}
        activeIndex={activeIndex}
        renderItem={renderItem}
        centerX={centerX}
        y={hitY}
        baseWidth={baseWidth}
        height={hitHeight}
        onSelect={handleSelect}
        // Family brackets must track the carousel during a drag → feed live pos, and ANY drag
        // activity resets the idle auto-hide timer (#428). Cheap re-render.
        onPosChange={(hidden || familyMode) ? ((p) => { if (familyMode) setPos(p); if (hidden) resetHideTimer(); }) : undefined}
        // #428: when hidden, the carousel renders COLLAPSED (only the active item) until revealed by
        // a press; the press both opens it and continues into a drag (hold-to-drag). `collapsed`
        // stays true through the fade-out so the side items fade before unmounting (from the hook).
        collapsed={collapsed}
        mountAllItems={mountAllItems}
        onReveal={hidden ? handleReveal : undefined}
        visibleHalf={VISIBLE_HALF}
        debugMode={debugMode}
      />
    </g>
  );
};
