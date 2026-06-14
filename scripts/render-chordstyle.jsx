// Dev render of the chord-STYLE row (ChordStyleOverlay) in the clef setter (Han Batch C).
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import ChordStyleOverlay from '../src/components/sheet-music/overlays/ChordStyleOverlay.jsx';
const out = '/tmp/chordstyle.png';
const VARS = { '--text-primary': '#e8e8e8', '--text-lowlight': '#8a8a8a' };
const resolveVars = (s) => s.replace(/var\(\s*(--[a-z-]+)\s*(?:,[^)]*)?\)/g, (_, n) => VARS[n] || '#ccc');
const trebleStart = 120;
const inner = renderToStaticMarkup(React.createElement(ChordStyleOverlay, {
  startX: 60, endX: 900, trebleStart, chordDisplayMode: 'letters', onSetChordDisplayMode: () => {}, debugMode: true,
}));
const W = 940, H = 160;
// staff lines at trebleStart (top line at trebleStart+11 like the app) + a CHORD_ROOT_Y guide.
const lines = [0,1,2,3,4].map(i => `<line x1="60" y1="${trebleStart + 11 + i*7.5}" x2="900" y2="${trebleStart + 11 + i*7.5}" stroke="#3a3a3a"/>`).join('');
const guide = `<line x1="60" y1="${trebleStart - 58}" x2="900" y2="${trebleStart - 58}" stroke="#225" stroke-dasharray="3 3"/><text x="64" y="${trebleStart-60}" font-size="9" fill="#558" font-family="serif">sheet CHORD_ROOT_Y</text>`;
const svg = resolveVars(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#161616"/>${lines}${guide}${inner}</svg>`);
fs.writeFileSync(out, new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'serif' } }).render().asPng());
console.log('wrote', out);
