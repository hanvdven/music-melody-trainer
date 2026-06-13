// Dev-only visual harness for the NOTE-COLOURING overlay (Han 2026-06-13). Run:
//   node_modules/.bin/vite-node scripts/render-notecolor.jsx
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import NoteColoringStaffOverlay from '../src/components/sheet-music/overlays/NoteColoringStaffOverlay.jsx';

const out = '/tmp/notecolor.png';
const VARS = {
  '--text-primary': '#e8e8e8', '--accent-yellow': '#ffd24a', '--note-tonic': '#ff8a8a',
  '--note-scale': '#8ab4ff',
  // chromatone pitch-class colours (0-11) — approximate rainbow so the harness shows them.
  '--chromatone-0': '#ff4a4a', '--chromatone-1': '#ff8a3a', '--chromatone-2': '#ffd24a',
  '--chromatone-3': '#bfe04a', '--chromatone-4': '#6fe06a', '--chromatone-5': '#4ae0a8',
  '--chromatone-6': '#4ad2e0', '--chromatone-7': '#4a9ae0', '--chromatone-8': '#5a6ae0',
  '--chromatone-9': '#9a5ae0', '--chromatone-10': '#d24ae0', '--chromatone-11': '#e04a9a',
};
const resolveVars = (svg) => svg.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/g, (_, n) => VARS[n] || '#ccc');

const inner = renderToStaticMarkup(
  React.createElement(NoteColoringStaffOverlay, {
    startX: 150, endX: 920, trebleStart: 20, bottomY: 470,
    noteColoringMode: 'chromatone', setNoteColoringMode: () => {},
    tonic: 'C4', scaleNotes: ['C','D','E','F','G','A','B'], theme: 'dark', debugMode: false,
  }),
);
const W = 960, H = 480;
const svg = resolveVars(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#1a1a1a"/>${inner}</svg>`
);
const png = new Resvg(svg, { background: '#1a1a1a' }).render().asPng();
fs.writeFileSync(out, png);
console.log('wrote', out);
