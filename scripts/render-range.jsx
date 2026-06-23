// Dev-only visual harness for the RANGE setter (Han #12). Renders RangeStaffOverlay with
// a VOCAL frame (6 presets) so we can confirm all six brackets fit. Run:
//   node_modules/.bin/vite-node scripts/render-range.jsx
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import RangeStaffOverlay from '../src/components/sheet-music/overlays/RangeStaffOverlay.jsx';

const out = '/tmp/range-setter.png';
const VARS = {
  '--text-primary': '#e8e8e8', '--text-lowlight': '#8a8a8a', '--range-lowlight': '#a8a8a8',
  '--accent-yellow': '#ffd24a', '--range-boundary-highlight': '#ffffff',
  '--note-tonic': '#ff8a8a', '--note-scale': '#8ab4ff', '--text-dim': '#777',
};
const resolveVars = (svg) => svg.replace(/var\(\s*(--[a-z-]+)\s*(?:,[^)]*)?\)/g, (_, n) => VARS[n] || '#ccc');

// Vocal frame for an ALTO clef: all 6 voices as presets (mirrors computeRangeFrame).
const VOICES = [
  ['Bass', 'G2', 'C4', 'bass'], ['Baritone', 'B2', 'F4', 'bass'], ['Tenor', 'D3', 'A4', 'tenor'],
  ['Alto', 'F3', 'C5', 'alto'], ['Mezzo-soprano', 'A3', 'G5', 'mezzo-soprano'], ['Soprano', 'C4', 'G6', 'soprano'],
];
const vocalFrame = {
  rowLow: 'A1', rowHigh: 'G6',
  presets: VOICES.map(([label, min, max, clef]) => ({ label: label.toUpperCase(), rangeMode: label, clef, min, max })),
};

const inner = renderToStaticMarkup(
  React.createElement(RangeStaffOverlay, {
    startX: 150, endX: 920, trebleStart: 60, bassStart: 170, percussionStart: 280,
    isTrebleVisible: true, isBassVisible: false, isPercussionVisible: false,
    clefTreble: 'alto', clefBass: 'bass',
    trebleFrame: vocalFrame, bassFrame: vocalFrame,
    trebleRange: { min: 'F3', max: 'C5' }, bassRange: { min: 'A2', max: 'C4' },
    timeSignature: { numerator: 4, denominator: 4 }, theme: 'dark', debugMode: false,
  }),
);

const W = 960, H = 160;
const svg = resolveVars(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
  + `<rect width="${W}" height="${H}" fill="#161616"/>`
  + [0, 1, 2, 3, 4].map(i => `<line x1="150" y1="${71 + i * 7.5}" x2="920" y2="${71 + i * 7.5}" stroke="#3a3a3a" stroke-width="1"/>`).join('')
  + inner + `</svg>`,
);
fs.writeFileSync(out.replace(/\.png$/, '.svg'), svg);
fs.writeFileSync(out, new Resvg(svg, { font: { fontFiles: ['src/assets/fonts/maestro.ttf'], loadSystemFonts: true, defaultFontFamily: 'serif' } }).render().asPng());
console.log('wrote', out);
