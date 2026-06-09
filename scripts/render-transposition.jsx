// Dev-only mockup render of the new TranspositionSetter (Han 2026-06-08). Shows the
// treble staff at trans=+2 (concert C4 written as D4 = B♭ instrument) and the bass staff
// at trans=0 (concert). LINEAR placeholder — pending Han's "tangens" drawing.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import TranspositionSetter from '../src/components/sheet-music/overlays/TranspositionSetter.jsx';

const VARS = {
  '--text-primary': '#e8e8e8', '--text-lowlight': '#8a8a8a', '--setter-lowlight': '#5a5a5a',
  '--accent-yellow': '#ffd24a',
};
const resolveVars = (s) => s.replace(/var\(\s*(--[a-z-]+)\s*(?:,[^)]*)?\)/g, (_, n) => VARS[n] || '#ccc');

const startX = 150, endX = 920;
const trebleStart = 70, bassStart = 230;
const panel = (staff, clef, staffStart, trans, dragDelta = 0) => renderToStaticMarkup(
  React.createElement(TranspositionSetter, {
    staff, clef, staffStart, startX, endX, transSemitones: trans,
    debugDragDelta: dragDelta, theme: 'dark', debugMode: false,
  }),
);

const W = 960, H = 360;
const staffLines = (s) => [0, 1, 2, 3, 4].map(i =>
  `<line x1="${startX}" y1="${s + i * 10}" x2="${endX}" y2="${s + i * 10}" stroke="#3a3a3a" stroke-width="1"/>`).join('');
const svg = resolveVars(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
  + `<rect width="${W}" height="${H}" fill="#161616"/>`
  + `<text x="20" y="20" fill="#bbb" font-size="12" font-family="serif">treble · trans 0 (concert) — LEFT: [clef][fixed C4] "C4 =" [names] · RIGHT: stemmed heads</text>`
  + staffLines(trebleStart) + panel('treble', 'treble', trebleStart, 0)
  + `<text x="20" y="210" fill="#bbb" font-size="12" font-family="serif">treble · trans +9 (E♭ inst) — accidentals (♭/♯) drawn IN FRONT of the noteheads</text>`
  + staffLines(bassStart) + panel('treble', 'treble', bassStart, 9)
  + `</svg>`,
);
fs.writeFileSync('/tmp/transposition.svg', svg);
fs.writeFileSync('/tmp/transposition.png',
  new Resvg(svg, { font: { fontFiles: ['src/assets/fonts/maestro.ttf'], loadSystemFonts: true, defaultFontFamily: 'serif' } }).render().asPng());
console.log('wrote /tmp/transposition.png');
