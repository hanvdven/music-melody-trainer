import React from 'react';
import NonLinearCarousel, { visibleRange, xOffsetForDist } from './overlays/NonLinearCarousel';

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

// ── ITEM RENDERER ──────────────────────────────────────────────────────────────────────────────
// Build a renderItem(item, i) for a NonLinearCarousel from an option list + an icon/label resolver.
// item shape: { value/key, label, Icon }. The active item (i === activeIndex) is bright
// (var(--text-primary)); the rest are lowlit (var(--text-lowlight)) — same convention as the
// instrument carousel. Layout: lucide icon on top (iconY), text label below (labelY).
//
// SIZING is passed in as named consts from the owning overlay (Han 2026-06-22 wants all sizing as
// tunable named consts at the overlay top), so this renderer is layout-agnostic.
export const makeRenderItem = ({ activeIndex, iconSize, iconY, labelY, labelFontSize }) => {
  // Returns a render-PROP for NonLinearCarousel.renderItem (invoked manually), NOT a React
  // component — so there's no display name to give.
  const renderCarouselItem = (item, i) => {
    const active = i === activeIndex;
    const color = active ? 'var(--text-primary)' : 'var(--text-lowlight)';
    return (
      // `color` on the group → currentColor for the lucide icon; fill on the <text> for the label.
      <g style={{ pointerEvents: 'none', color }}>
        {renderLucideIcon(item.Icon, { size: iconSize, iconY })}
        <text x={0} y={labelY} textAnchor="middle" fontSize={labelFontSize}
          fontFamily="sans-serif" fontWeight={active ? 'bold' : 'normal'} fill={color}>
          {item.label}
        </text>
      </g>
    );
  };
  return renderCarouselItem;
};

// ── BRACKET GEOMETRY (replicated from InstrumentStaffOverlay.bracketGeom — TODO consolidate) ─────
// One dashed bracket spanning [x1, x2] at vertical `y`, with the UPPERCASE label centred in a gap:
//   |———— LABEL ————|
// Returns the two path strings + the label mid-x so the caller can draw two <path>s + a <text>.
const buildBracket = (x1, x2, y, rawLabel) => {
  const label = rawLabel.toUpperCase();
  const mid = (x1 + x2) / 2;
  // Estimate label half-width to leave a gap (matches InstrumentStaffOverlay's heuristic).
  const halfText = Math.min((x2 - x1) / 2 - 6, label.length * 3.4 + 4);
  return {
    label, mid, y,
    leftPath: `M ${x1} ${y + 6} V ${y} H ${mid - halfText}`,
    rightPath: `M ${mid + halfText} ${y} H ${x2} V ${y + 6}`,
  };
};

// Render the dashed bracket <g> (two paths + centred label). Style matches the instrument carousel
// brackets exactly: stroke var(--text-primary), strokeWidth 1, dashed 4,3, bold 10px label.
const BracketSvg = ({ geom }) => (
  <g style={{ pointerEvents: 'none' }}>
    <path d={geom.leftPath} stroke="var(--text-primary)" strokeWidth="1" fill="none" strokeDasharray="4,3" />
    <path d={geom.rightPath} stroke="var(--text-primary)" strokeWidth="1" fill="none" strokeDasharray="4,3" />
    <text x={geom.mid} y={geom.y} textAnchor="middle" dominantBaseline="middle"
      fontSize={10} fontFamily="sans-serif" fontWeight="bold" letterSpacing={1}
      fill="var(--text-primary)">{geom.label}</text>
  </g>
);

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
  pos, items, { centerX, bracketY, baseWidth, visibleHalf, edgeX, familyName },
) => {
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
    return buildBracket(x1, x2, bracketY, familyName(r.family));
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
  familyMode = false,   // true → group items by item.family
  familyName,           // (family) => display string (family mode only)
  debugMode = false,
}) => {
  const VISIBLE_HALF = 2;   // Han 2026-06-22: full 5-wide carousel per field.
  const edgeX = (VISIBLE_HALF + 0.5) * baseWidth;
  const iconY = rowCenterY + iconDy;
  const labelY = rowCenterY + labelDy;
  const bracketY = rowCenterY + bracketDy;
  const hitY = rowCenterY + hitTop;

  // Live carousel centre for family brackets (track onPosChange). At rest it equals activeIndex.
  const [pos, setPos] = React.useState(activeIndex);
  // Keep pos in sync when the committed activeIndex changes externally (e.g. settings reset).
  React.useEffect(() => { setPos(activeIndex); }, [activeIndex]);

  const renderItem = makeRenderItem({ activeIndex, iconSize, iconY, labelY, labelFontSize });

  return (
    <g>
      {familyMode ? (
        <FamilyBrackets
          pos={pos}
          items={items}
          geomProps={{ centerX, bracketY, baseWidth, visibleHalf: VISIBLE_HALF, edgeX, familyName }}
        />
      ) : (
        <FieldNameBracket centerX={centerX} bracketY={bracketY} edgeX={edgeX} label={fieldLabel} />
      )}
      <NonLinearCarousel
        items={items}
        activeIndex={activeIndex}
        renderItem={renderItem}
        centerX={centerX}
        y={hitY}
        baseWidth={baseWidth}
        height={hitHeight}
        onSelect={onSelect}
        // Family brackets must track the carousel during a drag → feed live pos. Cheap re-render.
        onPosChange={familyMode ? setPos : undefined}
        visibleHalf={VISIBLE_HALF}
        debugMode={debugMode}
      />
    </g>
  );
};
