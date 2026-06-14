// Verify #16: range-setter chromatone colour follows the transposition (Han 2026-06-07).
// Renders the SAME treble range twice — trans=0 vs trans=+2 — with chromatone coloring.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import RangeStaffOverlay from '../src/components/sheet-music/overlays/RangeStaffOverlay.jsx';
// 12 chromatone hues (approx) so colour differences are visible in the PNG.
const CHROMA = ['#e63946','#f3722c','#f8961e','#f9c74f','#90be6d','#43aa8b','#4d908e','#577590','#277da1','#5e60ce','#9d4edd','#c9184a'];
const VARS = Object.fromEntries(CHROMA.map((c,i)=>[`--chromatone-${i}`,c]));
Object.assign(VARS,{'--text-primary':'#e8e8e8','--text-lowlight':'#8a8a8a','--range-lowlight':'#a8a8a8','--accent-yellow':'#ffd24a','--text-dim':'#777'});
const resolveVars=(s)=>s.replace(/var\(\s*(--[a-z-]+)\s*(?:,[^)]*)?\)/g,(_,n)=>VARS[n]||'#ccc');
const trebleFrame={rowLow:'C3',rowHigh:'C6',presets:[{label:'STANDARD',min:'C4',max:'C5'}]};
const panel=(trans)=>renderToStaticMarkup(React.createElement(RangeStaffOverlay,{
  startX:60,endX:430,trebleStart:60,bassStart:170,percussionStart:280,
  isTrebleVisible:true,isBassVisible:false,isPercussionVisible:false,
  clefTreble:'treble',clefBass:'bass',trebleFrame,bassFrame:trebleFrame,
  trebleRange:{min:'E4',max:'A4'},bassRange:{min:'A2',max:'C4'},
  trebleTrans:trans,bassTrans:trans,
  noteColoringMode:'chromatone',scaleNotes:[],tonic:'C',
  timeSignature:{numerator:4,denominator:4},theme:'dark',debugMode:false,
}));
const staff=(x)=>[0,1,2,3,4].map(i=>`<line x1="${x}" y1="${71+i*7.5}" x2="${x+370}" y2="${71+i*7.5}" stroke="#3a3a3a"/>`).join('');
const W=900,H=150;
const svg=resolveVars(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#161616"/>`
 +`<text x="60" y="20" fill="#bbb" font-size="12" font-family="serif">trans=0 (concert colours)</text>${staff(60)}${panel(0)}`
 +`<g transform="translate(460 0)"><text x="0" y="20" fill="#bbb" font-size="12" font-family="serif">trans=+2 (colours shift +2 = match sheet)</text>${staff(0).replace(/x1="60"/g,'x1="60"')}</g>`
 +`<g transform="translate(400 0)">${panel(2)}</g></svg>`);
fs.writeFileSync('/tmp/range-trans.png',new Resvg(svg,{font:{fontFiles:['src/assets/fonts/maestro.ttf'],loadSystemFonts:true,defaultFontFamily:'serif'}}).render().asPng());
console.log('wrote /tmp/range-trans.png');
