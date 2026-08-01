import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SheetRpgLayer from '../SheetRpgLayer';

// #647 — a slime under each treble note (coloured by duration), the hero bottom-left. pixelsPerTick is null
// in the real render (the bug that hid every slime); the index-based fallback via allOffsets + noteWidth
// must place them. Exercise that (null ppt) path here.
const wrap = (props) => render(
    <svg>
        <SheetRpgLayer startX={20} pixelsPerTick={null} allOffsets={[0, 12, 18, 24]} noteWidth={20}
            trebleStart={100} staffHeight={40} viewBottom={220} {...props} />
    </svg>,
);

describe('SheetRpgLayer (#647)', () => {
    it('renders one slime per non-rest treble note (via the ppt=null fallback), coloured by duration, plus a hero', () => {
        // C4 quarter(12)=green, rest(skip), E4 eighth(6)=blue, G4 half(24)=red
        const melody = { notes: ['C4', 'r', 'E4', 'G4'], offsets: [0, 12, 18, 24], durations: [12, 6, 6, 24] };
        const { container } = wrap({ trebleMelody: melody });
        const hrefs = [...container.querySelectorAll('image')].map((im) => im.getAttribute('href') || '');
        expect(hrefs).toHaveLength(3);               // 4 notes − 1 rest
        expect(hrefs[0]).toContain('slime-green');   // quarter
        expect(hrefs[1]).toContain('slime-blue');    // eighth
        expect(hrefs[2]).toContain('slime-red');     // half
        expect(container.querySelector('foreignObject')).toBeTruthy();   // hero
    });

    it('skips the spacer note "c" and renders no slimes without a treble melody', () => {
        expect(wrap({ trebleMelody: null }).container.querySelectorAll('image')).toHaveLength(0);
        const spacer = { notes: ['c', 'D4'], offsets: [0, 12], durations: [12, 12] };
        expect(wrap({ trebleMelody: spacer }).container.querySelectorAll('image')).toHaveLength(1);
    });
});
