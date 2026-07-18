// Dev-only entry for gen-harness.html (#435 clipping debug). Mounts the real
// GenerationSetterOverlay over real staff lines with the app's CSS, using Han's observed
// proportions. `?open=1` renders the expanded state; `?bisect=1` renders a minimal
// image+label matrix instead (isolating what clips the label). Default: rest (hidden) state.
import React from 'react';
import { createRoot } from 'react-dom/client';
import GenerationSetterOverlay from '../src/components/sheet-music/overlays/GenerationSetterOverlay.jsx';
import { InstrumentSettingsProvider } from '../src/contexts/InstrumentSettingsContext.jsx';
import { DisplaySettingsProvider } from '../src/contexts/DisplaySettingsContext.jsx';
import { getIconUrlByBasename } from '../src/constants/instruments.jsx';
import { renderRepeatGlyph } from '../src/components/sheet-music/overlays/carouselOptionGlyph.jsx';
import { AXES } from '../src/exercises/exerciseIndex.js';
import '../src/styles/App.css';

const params = new URLSearchParams(window.location.search);
const HIDDEN = params.get('open') !== '1';
const BISECT = params.get('bisect') === '1';
const FONTS = params.get('fonts') === '1';

// Han's screenshot proportions: staves ~95 apart (short container), sheet ~600 wide.
const startX = 15, endX = 585, trebleStart = 120, bassStart = 215, percussionStart = 310;

const ctx = {
  trebleSettings: { notePool: 'scale', randomizationRule: 'weighted', notesPerMeasure: 2, voices: 1, clef: 'treble' },
  setTrebleSettings: () => {},
  bassSettings: { notePool: 'chord', randomizationRule: 'emphasize_roots', notesPerMeasure: 2, voices: 1, clef: 'bass' },
  setBassSettings: () => {},
  percussionSettings: { enabledPads: ['k', 's', 'hh', 'ho', 'cc', 'cr', 'tl'], randomizationRule: 'uniform', notesPerMeasure: 4, voices: 1 },
  setPercussionSettings: () => {},
  chordSettings: { complexity: 'exotic', strategy: 'modal-random', chordCount: 2 },
  setChordSettings: () => {},
};

const staffLines = [];
for (const s of [trebleStart, bassStart, percussionStart]) {
  for (let i = 0; i < 5; i++) staffLines.push(s + i * 10);
}

// Minimal repro matrix: an icons8 <image> (38px, top at cy-19) + a label at cy+38, four ways.
const Bisect = () => {
  const dice = getIconUrlByBasename('dice');
  const cy = 100;
  const cell = (x, title, imageEl) => (
    <g key={title}>
      <text x={x} y={20} textAnchor="middle" fontSize={11} fill="#8ab4ff">{title}</text>
      {imageEl}
      <text x={x} y={cy + 38} textAnchor="middle" fontSize={11} fontFamily="sans-serif"
        fontWeight="bold" fill="#ffffff">LABEL</text>
    </g>
  );
  return (
    <svg width="610" height="220" viewBox="0 0 610 220" style={{ background: '#1b1b28', display: 'block' }}>
      <defs>
        <filter id="bisect-tint" x="-20%" y="-20%" width="140%" height="140%">
          <feFlood style={{ floodColor: '#a0bcd8' }} />
          <feComposite in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
      {cell(80, 'no image', null)}
      {cell(230, 'plain image',
        <image href={dice} x={230 - 19} y={cy - 19} width={38} height={38} />)}
      {cell(380, 'css var filter',
        <image href={dice} x={380 - 19} y={cy - 19} width={38} height={38}
          style={{ filter: 'var(--instrument-icon-filter, none)' }} />)}
      {cell(530, 'feFlood tint',
        <image href={dice} x={530 - 19} y={cy - 19} width={38} height={38}
          style={{ filter: 'url(#bisect-tint)' }} />)}
    </svg>
  );
};

// #494 font check: Academico samples + the repeat glyphs (italic × counts) beside Maestro.
const Fonts = () => (
  <svg width="610" height="300" viewBox="0 0 610 300" style={{ background: '#1b1b28', display: 'block' }}>
    <text x={20} y={40} fontFamily="Academico" fontSize={28} fill="#e8e8e8">Academico 0123456789</text>
    <text x={20} y={80} fontFamily="Academico" fontStyle="italic" fontSize={28} fill="#e8e8e8">Academico italic ×  0123456789</text>
    <text x={20} y={120} fontFamily="Maestro" fontSize={28} fill="#8ab4ff">Maestro Ï À k (music glyphs)</text>
    <text x={20} y={170} fontFamily="Academico" fontSize={14} fontStyle="italic" fill="#888">repeat glyphs (×N counts, ∞, until):</text>
    {AXES.evaluation.map((item, i) => (
      <g key={i} transform={`translate(${70 + i * 80}, 230)`}>
        <rect x={-28} y={-30} width={56} height={56} fill="none" stroke="#333" />
        {renderRepeatGlyph(item, true, 0)}
        <text x={0} y={40} fontFamily="Academico" fontSize={11} fill="#888" textAnchor="middle">
          {item.isUntil ? 'until' : String(item.value)}
        </text>
      </g>
    ))}
  </svg>
);

// #493 verify: with ?reveal=x,y (SVG user coords) auto-open ONE field so the widen + veil show in
// the realistic single-open state (headless Chrome can't click). Dispatches a pointerdown/up there.
const AutoReveal = () => {
  React.useEffect(() => {
    const rv = params.get('reveal');
    if (!rv) return;
    const [ux, uy] = rv.split(',').map(Number);
    const t = setTimeout(() => {
      const svg = document.querySelector('svg');
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const sx = rect.left + (ux - vb.x) * (rect.width / vb.width);
      const sy = rect.top + (uy - vb.y) * (rect.height / vb.height);
      const el = document.elementFromPoint(sx, sy) || svg;
      for (const type of ['pointerdown', 'pointerup']) {
        el.dispatchEvent(new PointerEvent(type, { clientX: sx, clientY: sy, bubbles: true, pointerId: 1 }));
      }
    }, 800);
    return () => clearTimeout(t);
  }, []);
  return null;
};

const App = () => FONTS ? <Fonts /> : BISECT ? <Bisect /> : (
  <InstrumentSettingsProvider value={ctx}>
    <AutoReveal />
    <DisplaySettingsProvider value={{ noteColoringMode: 'tonic_scale_keys', theme: 'default' }}>
      <svg width="610" height="440" viewBox="-5 -30 610 440"
        style={{ background: 'var(--app-bg, #1b1b28)', display: 'block' }}>
        {staffLines.map((y, i) => (
          <line key={i} x1={startX} y1={y} x2={endX} y2={y}
            stroke="var(--text-primary)" strokeWidth="0.5" opacity="0.5" />
        ))}
        <GenerationSetterOverlay
          startX={startX} endX={endX}
          trebleStart={trebleStart} bassStart={bassStart} percussionStart={percussionStart}
          isTrebleVisible isBassVisible isPercussionVisible showChordsRow
          hiddenFields={HIDDEN}
        />
      </svg>
    </DisplaySettingsProvider>
  </InstrumentSettingsProvider>
);

createRoot(document.getElementById('root')).render(<App />);
