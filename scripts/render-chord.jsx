// Dev-only render of the chord-COMPLEXITY selector (ChordStaffOverlay) to inspect the
// "extended" chord's 3-column spacing (Han). Run: vite-node scripts/render-chord.jsx
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import ChordStaffOverlay from '../src/components/sheet-music/overlays/ChordStaffOverlay.jsx';

const out = '/tmp/chord-setter.png';
const VARS = {
  '--text-primary': '#e8e8e8', '--text-lowlight': '#8a8a8a', '--range-lowlight': '#a8a8a8',
  '--accent-yellow': '#ffd24a', '--note-tonic': '#ff8a8a', '--note-scale': '#8ab4ff', '--text-dim': '#777',
};
const resolveVars = (svg) => svg.replace(/var\(\s*(--[a-z-]+)\s*(?:,[^)]*)?\)/g, (_, n) => VARS[n] || '#ccc');

const inner = renderToStaticMarkup(
  React.createElement(ChordStaffOverlay, {
    startX: 60, endX: 900, trebleStart: 140, chordComplexity: 'extended',
    onSetChordComplexity: () => {}, debugMode: false,
  }),
);
const W = 940, H = 130;
const svg = resolveVars(
  `<svg xmlns="http://www.w3.org/2000/svg" width="550" height="450" viewBox="788 18 110 90">`
  + `<rect width="${W}" height="${H}" fill="#161616"/>`
  + [0, 1, 2, 3, 4].map(i => `<line x1="60" y1="${43 + i * 7.5}" x2="900" y2="${43 + i * 7.5}" stroke="#333" stroke-width="1"/>`).join('')
  + inner + `</svg>`,
);
fs.writeFileSync(out.replace(/\.png$/, '.svg'), svg);
fs.writeFileSync(out, new Resvg(svg, { font: { fontFiles: ['src/assets/fonts/maestro.ttf'], loadSystemFonts: true, defaultFontFamily: 'serif' } }).render().asPng());
console.log('wrote', out);
