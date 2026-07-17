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
import '../src/styles/App.css';

const params = new URLSearchParams(window.location.search);
const HIDDEN = params.get('open') !== '1';
const BISECT = params.get('bisect') === '1';

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

const App = () => BISECT ? <Bisect /> : (
  <InstrumentSettingsProvider value={ctx}>
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
