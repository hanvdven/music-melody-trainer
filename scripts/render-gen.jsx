// Dev-only visual harness: render the GENERATION setter overlay to a PNG so we can SEE the
// header/label/bracket alignment without a browser (Han 2026-07-17 — audit UI rework round 3).
// Run: node_modules/.bin/vite-node scripts/render-gen.jsx -- <out.png>
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import GenerationSetterOverlay from '../src/components/sheet-music/overlays/GenerationSetterOverlay.jsx';
import { InstrumentSettingsProvider } from '../src/contexts/InstrumentSettingsContext.jsx';
import { DisplaySettingsProvider } from '../src/contexts/DisplaySettingsContext.jsx';

const out = process.argv.find(a => a.endsWith('.png')) || '/tmp/gen-setter.png';
const HIDDEN = process.argv.includes('--hidden');

const VARS = {
  '--text-primary': '#e8e8e8', '--text-secondary': '#b0b0b0', '--text-lowlight': '#7a7a7a',
  '--text-dim': '#777', '--setter-lowlight': '#4a4a4a', '--accent-yellow': '#ffd24a',
  '--note-tonic': '#ff8a8a', '--note-scale': '#8ab4ff', '--note-active': '#ffffff',
  '--cat-percussion-tuned': '#e0a3ff', '--cat-percussion': '#e0a3ff',
  '--cat-random': '#8ab4ff', '--cat-arp': '#7ee0b0', '--cat-walk': '#ffce6b',
  '--cat-chords': '#ff9db0', '--cat-fixed': '#c0c0c0', '--cat-stylized': '#ffb27e',
  '--instrument-icon-filter': 'none',
};
const resolveVars = (svg) => svg.replace(/var\(\s*(--[a-z-]+)\s*(?:,\s*([^)]*))?\)/g,
  (_, name, fb) => VARS[name] || fb || '#cccccc');

const ctx = {
  trebleSettings: { notePool: 'scale', randomizationRule: 'walking_bass', notesPerMeasure: 2, clef: 'treble' },
  setTrebleSettings: () => {},
  bassSettings: { notePool: 'chord', randomizationRule: 'emphasize_roots', notesPerMeasure: 2, clef: 'bass' },
  setBassSettings: () => {},
  percussionSettings: { enabledPads: [], randomizationRule: 'backbeat', notesPerMeasure: 4, notePool: 'STANDARD' },
  setPercussionSettings: () => {},
  chordSettings: { complexity: 'triad', strategy: 'modal-random', chordCount: 2 },
  setChordSettings: () => {},
};

// Match the REAL sheet: staff line gap = 10, staffHeight 40, staffGap baseGap=70 → staves 110 apart.
const trebleStart = 120, bassStart = 230, percussionStart = 340, startX = 15, endX = 445;
const inner = renderToStaticMarkup(
  React.createElement(InstrumentSettingsProvider, { value: ctx },
    React.createElement(DisplaySettingsProvider, { value: { noteColoringMode: 'tonic_scale_keys', theme: 'default' } },
      React.createElement(GenerationSetterOverlay, {
        startX, endX, trebleStart, bassStart, percussionStart,
        isTrebleVisible: true, isBassVisible: true, isPercussionVisible: true,
        showChordsRow: true, hiddenFields: HIDDEN, debugMode: false,
      }),
    ),
  ),
);

const W = 460, H = 480;
const staffLines = [trebleStart, bassStart, percussionStart].map(s =>
  [0, 1, 2, 3, 4].map(i =>
    `<line x1="${startX}" y1="${s + i * 10}" x2="${endX}" y2="${s + i * 10}" stroke="#3a3a3a" stroke-width="1"/>`).join('')).join('');
const svg = resolveVars(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 -20 ${W} ${H}">`
  + `<rect x="0" y="-20" width="${W}" height="${H}" fill="#1b1b28"/>`
  + staffLines + inner + `</svg>`,
);

fs.writeFileSync(out.replace(/\.png$/, '.svg'), svg);
const png = new Resvg(svg, {
  font: { fontFiles: ['src/assets/fonts/maestro.ttf'], loadSystemFonts: true, defaultFontFamily: 'serif' },
}).render().asPng();
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
