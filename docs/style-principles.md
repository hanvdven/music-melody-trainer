# Visual Design & Style Principles

This document is the source of truth for visual design decisions in the Music Melody Trainer app. Every UI ticket must be reviewed against these principles before implementation.

---

## 1. Typography

### Font families — strict rules

| Font | Where to use | Where NEVER to use |
|---|---|---|
| `'Maestro'` | Sheet music glyphs only: noteheads, stems, rests, clefs, time signatures, key signatures, BPM note symbol (`𝅗𝅥`) | Any UI text, labels, buttons, headings, overlays |
| `Arial, sans-serif` | Sheet music numeric labels: BPM value, measure numbers, beat counts | Body text (use system default instead) |
| `'Times New Roman', serif` | Tempo terms on the staff only (Andante, Allegro, ♩= …) — Italian music convention | Any non-notation UI |
| system default (unset) | All UI text: buttons, tabs, labels, overlays, settings | — |

**Rule:** If you see `font-family: 'Maestro'` outside of an SVG notation context, it is a bug. Fix it.

### Font sizes

- UI tab labels: `10px`, `text-transform: uppercase`, `letter-spacing: 0.5px`
- Inline small labels: `11–12px`
- Body / option text: `14px`
- Headings in overlays/popups: `1.25rem`
- Responsive text (keys, piano labels): `clamp(10px, 4vw, 26px)` or similar `clamp()` — never fixed px when the container is fluid

---

## 2. Color System

### Always use CSS variables — never hardcode

Every color in a component must reference a CSS variable from `App.css`. Hardcoded hex values outside of `App.css` itself will break theme switching.

### Text hierarchy

| Variable | Use |
|---|---|
| `--text-primary` | Main content, active labels |
| `--text-secondary` (= `--white-key-color`) | Supporting labels, icons |
| `--text-dim` | Passive buttons, placeholder text |
| `--text-lowlight` | Measure numbers, tuplet suffixes — use COLOR not opacity so crossfade animations don't double-dim |
| `--range-lowlight` | Out-of-band notes, disabled pads — slightly lighter than `--text-lowlight` |

### Accent colors

| Variable | Use |
|---|---|
| `--accent-yellow` | Active state, selection, primary action button, progress indicators |
| `--accent-purple` | Secondary highlight (tonic notes, wheel tonic) |
| `--button-active` | Alias for `--accent-yellow` in most themes — use this on active buttons, not direct `--accent-yellow` |
| `--pressed-key-color` | Piano key press feedback only |

### Surface colors

| Variable | Use |
|---|---|
| `--app-bg` | Outermost background |
| `--panel-bg` | Card surfaces, tab panels |
| `--button-passive` | Inactive button backgrounds (`#333` in dark) |

### Chromatone system

`--chromatone-0` through `--chromatone-11` map to pitch classes C through B. These are **only for musical notation and instrument coloring** — never for UI chrome, borders, or decorative backgrounds.

---

## 3. Spacing & Layout

### Unit grid

Use multiples of **4px** for all spacing: `4, 8, 12, 16, 20, 24, 32`. Never use odd or fractional px values for gaps, padding, or margins in UI layout.

### Root layout

- Root element: `height: 100dvh` (dynamic viewport height — not `100vh`, which breaks on mobile with browser chrome)
- `overflow: hidden` on root — no scroll on the app shell
- `user-select: none` on body and all interactive components
- `-webkit-tap-highlight-color: transparent` on all interactive elements

### Content padding

- Main content area: `padding: 0 20px 20px 20px`
- Tab inner content: `padding: 0 8px`
- Overlay/popup body: `padding: 20px`

---

## 4. Interactive Controls

### Button variants

| Class | Description | When to use |
|---|---|---|
| `.ghost-button` | No background, dim text, hover adds subtle bg | Secondary / tertiary actions |
| `.tab-button` | Navigation tabs, icon + label stack | Bottom nav tabs |
| `.scale-selector-button` | Dense grid button | Scale/mode selection grids |
| Generic `<button>` with `var(--accent-yellow)` bg | Primary action | Single primary CTA in an overlay |

### Active state

- Active buttons get `color: var(--accent-yellow)` — **not** a background change, unless they are chord grid cells (which have their own band-specific active styles)
- Never apply `--accent-yellow` as a background for navigation tabs (`.tab-button.active` only changes text color)

### Border radius

| Context | Radius |
|---|---|
| Modals, popups | `8px` |
| Standard buttons, ghost buttons | `6px` |
| Small inline buttons, scale selector buttons | `3–4px` |
| Piano keys | `0 0 6px 6px` (bottom corners only) |

---

## 5. Overlays & Modals

### Backdrop

```css
position: fixed;
top: 0; left: 0; right: 0; bottom: 0;
background-color: rgba(0, 0, 0, 0.6);
z-index: 999;
```

### Popup / modal surface

```css
position: fixed;
top: 50%; left: 50%;
transform: translate(-50%, -50%);
background-color: #222;  /* or var(--panel-bg) for themed overlays */
border: 2px solid var(--text-primary);
border-radius: 8px;
padding: 20px;
z-index: 1000;
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
```

### In-staff overlays (context setters on the sheet music)

- Follow **§6d of CLAUDE.md** — always reuse canonical renderer components
- Staff lines in overlays: `var(--text-primary)` at `strokeWidth="0.5"` — same as the real staff
- Frame lines, barlines, dividers must match the surface they sit on (same CSS var and strokeWidth)
- Never use a heavier border than the real staff lines to frame an overlay

### File convention

Every sheet-music context overlay lives in its own file under `src/components/sheet-music/overlays/`. Multiple overlays must never be in one file.

---

## 6. Z-index Layers

| Layer | Z-index | Used for |
|---|---|---|
| Piano white keys | 1 | `.piano-white` |
| Piano black keys | 2 | `.piano-black` |
| Overlay backdrop | 999 | `.gs-popup-overlay`, sheet-music overlays |
| Popup / modal | 1000 | `.gs-popup`, in-staff setters |

Do not introduce z-index values outside this table without documenting why.

---

## 7. Animation

### Standard durations

| Duration | Use |
|---|---|
| `0.2s ease` | Button hover/active color transition |
| `0.4s ease-out` | Panel/variant slide-in (`clefVariantEnter`) |
| `0.5s` | Scroll-mode preview fade-in (`scrollPreviewFadeIn`) |
| `0.6s` | Tone pulse, piano key pulse |
| `1.5s` | Settings/song universal transition |

### Rules

- **Never use `setTimeout` to drive visual transitions** — use rAF or CSS animations
- **Never set `style.opacity` via JSX props on animated elements** — React re-renders overwrite inline style. Use `element.style.opacity` in rAF, or CSS class toggles
- Use CSS class toggles (`.pagination-old-visible`, `.wipe-new-hidden`, etc.) for states managed by the animation loop

---

## 8. SVG / Sheet Music Rendering

- Staff lines: `stroke="var(--text-primary)"` `strokeWidth="0.5"`
- Note glyphs (noteheads, stems, accidentals): use canonical renderers — `staffNoteGlyph.jsx`, `renderMelodyNotes.jsx`, `clefGlyphs.jsx`, `renderAccidentals.jsx`
- **Never duplicate glyph rendering** in a new component — extract shared constants and reuse (§6d CLAUDE.md)
- SVG `font-family` is set globally to `'Maestro'` on the `<svg>` element — override it to `Arial, sans-serif` for numeric/text labels within SVG
- All interactive SVG elements must have a debug hit-box overlay when `debugMode` is on (§3a CLAUDE.md)

---

## 9. Music Notation Characters

| Use | Character | Unicode |
|---|---|---|
| Flat | `♭` | U+266D |
| Sharp | `♯` | U+266F |
| Double flat | `𝄫` | U+1D12B |
| Double sharp | `𝄪` | U+1D12A |

Never use ASCII `b` or `#` in any visible music label. Use `normalizeNoteChars()` from `src/theory/noteUtils.js` for programmatic conversion.

---

## 10. Themes

The app ships with four themes: `default` (dark nocturne-base), `nocturne`, `meridienne` (warm parchment), `light`.

When designing a new UI component:
1. Test it against **all four themes** — not just the default dark theme
2. Use CSS variables only — hardcoded colors will break non-default themes
3. For light themes, check contrast: `--accent-yellow` on `--app-bg` in `meridienne` and `light` is a darker amber — never assume it is bright yellow
4. The `--instrument-icon-filter: invert(1)` is set on dark themes, `none` on light — icons must remain legible under both

---

## 11. Design Agent Checklist

For UI tickets, the Stylist agent must verify the design against this checklist before approving:

- [ ] No hardcoded colors — all values reference CSS variables
- [ ] No `font-family: 'Maestro'` outside SVG notation context
- [ ] Font sizes use `clamp()` where the container is fluid
- [ ] Spacing values are multiples of 4px
- [ ] Overlay structure matches §5 (z-index 999/1000, backdrop + modal pattern)
- [ ] Active state uses `--accent-yellow` text color, not background (except chord grid)
- [ ] Tested mentally against all four themes
- [ ] In-staff overlays use canonical renderers (§6d CLAUDE.md)
- [ ] All new interactive elements have a debug hit-box plan
- [ ] Music notation uses Unicode accidentals (§9)
