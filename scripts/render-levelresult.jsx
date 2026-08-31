// Dev render of the #867 rework round 2 LevelResultOverlay — checks (1) tier/KPI label legibility at the
// new sizes and (2) that the clef area (x < startX) is left unobstructed by the cover rect / staff lines.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import LevelResultOverlay from '../src/components/sheet-music/LevelResultOverlay.jsx';

const out = '/tmp/levelresult.png';
const VARS = {
  '--text-primary': '#e8e8e8', '--text-secondary': '#a8a8a8', '--text-dim': '#666',
  '--accent-yellow': '#e8c547', '--panel-bg': '#161616',
  '--judgment-perfect': '#4caf50', '--judgment-near': '#8bc34a', '--judgment-far': '#ff9800',
  '--judgment-missed': '#777', '--judgment-extra': '#4a4a4a', '--judgment-corrected': '#4aa8ff',
  '--judgment-wrong': '#b060ff',
};
const resolveVars = (s) => s.replace(/var\(\s*(--[a-z-]+)\s*(?:,[^)]*)?\)/g, (_, n) => VARS[n] || '#ccc');

const startX = 140;   // clef area = 0..startX, matches App.jsx's real clef width roughly
const endX = 900;
const trebleStart = 100;
const bassStart = 220;

const stats = {
  perfect: 12, tooFast: 3, tooSlow: 2, muchTooFast: 1, muchTooSlow: 1,
  secondAttemptCorrected: 2, wrongUncorrected: 1, missed: 2, extraNote: 1,
  perfectCorrected: 0, tooFastCorrected: 0, muchTooFastCorrected: 0, tooSlowCorrected: 0, muchTooSlowCorrected: 0,
};
const rows = [
  { label: 'Enemies vanquished', value: '18/20' },
  { label: 'Accuraatheid', value: '86%' },
  { label: 'Critters saved', value: '4/5' },
  { label: 'Points', value: '142' },
  { label: 'Longest streak', value: '9' },
];

const inner = renderToStaticMarkup(React.createElement(LevelResultOverlay, {
  startX, endX, trebleStart, bassStart, isTrebleVisible: true, isBassVisible: true,
  coverX: startX, coverY: -30, coverWidth: 940 - startX, coverHeight: 320,
  stats, twoHanded: false, rows,
  onReplay: () => {}, onClose: () => {},
}));

const W = 940, H = 320;
// Fake clef markers in the UNCOVERED region (x < startX) — if the overlay is correct, these stay visible.
const clefMarkers = `
  <text x="20" y="${trebleStart + 30}" font-size="40" fill="#e8e8e8" font-family="serif">𝄞</text>
  <text x="20" y="${bassStart + 30}" font-size="34" fill="#e8e8e8" font-family="serif">𝄢</text>
  <rect x="0" y="0" width="${startX}" height="${H}" fill="none" stroke="#3a5" stroke-dasharray="4 4" />
  <text x="4" y="14" font-size="10" fill="#3a5" font-family="sans-serif">CLEF AREA (must stay visible)</text>
`;
const svg = resolveVars(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#1a1a1a"/>${clefMarkers}${inner}</svg>`);
fs.writeFileSync(out, new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'sans-serif' } }).render().asPng());
console.log('wrote', out);
