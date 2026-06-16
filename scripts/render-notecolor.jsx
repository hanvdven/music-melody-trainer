// Dev-only visual harness for the NOTE-COLOURING overlay (Han 2026-06-14, on-staff). Run:
//   node_modules/.bin/vite-node scripts/render-notecolor.jsx
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import NoteColoringStaffOverlay from '../src/components/sheet-music/overlays/NoteColoringStaffOverlay.jsx';

const out = '/tmp/notecolor.png';
const VARS = {
  '--text-primary': '#e8e8e8', '--text-dim': '#666', '--accent-yellow': '#ffd24a',
  '--note-tonic': '#ff8a8a', '--note-scale': '#8ab4ff', '--note-blue': '#6b7a99',
  '--chromatone-0': '#ff4a4a', '--chromatone-1': '#ff8a3a', '--chromatone-2': '#ffd24a',
  '--chromatone-3': '#bfe04a', '--chromatone-4': '#6fe06a', '--chromatone-5': '#4ae0a8',
  '--chromatone-6': '#4ad2e0', '--chromatone-7': '#4a9ae0', '--chromatone-8': '#5a6ae0',
  '--chromatone-9': '#9a5ae0', '--chromatone-10': '#d24ae0', '--chromatone-11': '#e04a9a',
};
const resolveVars = (svg) => svg.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/g, (_, n) => VARS[n] || '#ccc');
const trebleStart = 70;
const startX = 150, endX = 920;
const overlay = renderToStaticMarkup(
  React.createElement(NoteColoringStaffOverlay, {
    startX, endX, trebleStart, clefTreble: 'treble',
    noteColoringMode: 'chords', setNoteColoringMode: () => {},
    tonic: 'C4', scaleNotes: ['C','D','E','F','G','A','B'], activeChord: { root: 'C4', notes: ['C4','E4','G4'] }, theme: 'dark', debugMode: false,
  }),
);
// Existing top staff lines (what the real SheetMusic draws) so we can confirm alignment.
const staff = [0,10,20,30,40].map(d => `<path d="M ${startX} ${trebleStart+d} H ${endX}" stroke="#e8e8e8" stroke-width="0.5"/>`).join('');
const W = 960, H = 160;
const svg = resolveVars(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#1a1a1a"/>${staff}${overlay}</svg>`);
fs.writeFileSync(out, new Resvg(svg, { background: '#1a1a1a' }).render().asPng());
console.log('wrote', out);
