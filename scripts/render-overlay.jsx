// Dev-only visual harness: render an in-SVG overlay to a PNG so we can SEE the clef/
// range setter without a browser (Han 2026-06-03 — stop guessing geometry blind).
// Run: node_modules/.bin/vite-node scripts/render-overlay.jsx -- <out.png>
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import ClefStaffOverlay from '../src/components/sheet-music/overlays/ClefStaffOverlay.jsx';

const out = process.argv.find(a => a.endsWith('.png')) || '/tmp/clef-setter.png';

// Concrete values for the CSS custom properties resvg can't resolve (dark theme).
const VARS = {
  '--text-primary': '#e8e8e8', '--text-lowlight': '#8a8a8a', '--setter-lowlight': '#4a4a4a',
  '--accent-yellow': '#ffd24a', '--note-tonic': '#ff8a8a', '--note-scale': '#8ab4ff',
  '--text-dim': '#777', '--note-active': '#ffffff',
};
const resolveVars = (svg) => svg.replace(/var\(\s*(--[a-z-]+)\s*(?:,[^)]*)?\)/g,
  (_, name) => VARS[name] || '#cccccc');

const inner = renderToStaticMarkup(
  React.createElement(ClefStaffOverlay, {
    startX: 150, endX: 920,
    trebleStart: 45, bassStart: 150, percussionStart: 260,
    isTrebleVisible: true, isBassVisible: true, isPercussionVisible: false,
    clefTreble: 'treble', clefBass: 'bass',
    // B♭ transposition active on treble so we can see A3 (selected card colours its
    // notes per the scheme); bass stays concert C (all cards dimmed).
    trebleSettings: { transpositionKey: 'Bb', rangeMode: 'STANDARD' },
    bassSettings: { transpositionKey: 'C', rangeMode: 'STANDARD' },
    tonic: 'B♭4',
    scaleNotes: ['B♭4', 'C5', 'D5', 'E♭5', 'F5', 'G5', 'A5'],
    noteColoringMode: 'tonic_scale_keys',
    theme: 'dark', onApplyClefPatch: () => {}, debugMode: false,
  }),
);

const W = 960, H = 240;
const svg = resolveVars(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
  + `<rect width="${W}" height="${H}" fill="#161616"/>`
  // Faint staff lines for the two rows so positions read in context.
  + [45, 150].map(s => [0, 1, 2, 3, 4].map(i =>
      `<line x1="150" y1="${s + 11 + i * 7.5}" x2="920" y2="${s + 11 + i * 7.5}" stroke="#3a3a3a" stroke-width="1"/>`).join('')).join('')
  + inner + `</svg>`,
);

fs.writeFileSync(out.replace(/\.png$/, '.svg'), svg);
const png = new Resvg(svg, {
  font: { fontFiles: ['src/assets/fonts/maestro.ttf'], loadSystemFonts: true, defaultFontFamily: 'serif' },
}).render().asPng();
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
