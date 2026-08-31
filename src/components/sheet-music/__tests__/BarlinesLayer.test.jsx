import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { iterMeasureLines } from '../BarlinesLayer';

// #1155 (Han 2026-08-24, "pas de labelconventie toe op alle call-response levels"): the ONLY previously
// untested part of this file — no BarlinesLayer test existed before this ticket. Covers both: (1) the
// NEW call-response label path (`callResponseGroupMeasures`), and (2) a regression check that the
// EXISTING (non-call-response) numbering is completely unchanged by that prop's addition.

const baseProps = {
    mode: 'regular',
    noteWidth: 40,
    pixelsPerTick: 0.1,
    startX: 100,
    startIdx: 0,
    blockPlayStart: 0,
    partialTop: null,
    partialMeasureStart: null,
    measureBottom: null,
    measureYPositions: [],
    trebleStart: 100,
    bassStart: 200,
    percussionStart: 300,
    bottomY: 350,
    isTrebleVisible: true,
    isBassVisible: true,
    isPercussionVisible: true,
    isPlaying: true,
    debugMode: false,
    showSettings: false,
    measureLengthSlots: 48,
    onMeasureNumberClick: undefined,
};

const renderLabels = (props) => {
    const { container } = render(<svg>{iterMeasureLines(props)}</svg>);
    return Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
};

describe('BarlinesLayer — iterMeasureLines (#1155)', () => {
    it('regression: plain sequential numbering (numRepeats=1, no call-response) is UNCHANGED by callResponseGroupMeasures being absent', () => {
        const labels = renderLabels({
            ...baseProps,
            // A trailing extra 'm' — the VERY LAST barline in the array never shows a number (pre-existing
            // behaviour, `!isEnd` guard — same for every mode, unrelated to this ticket), matching how a
            // real JIT-growing melody always has "one more barline ahead" of whatever's fully visible.
            offsets: ['m', 'm', 'm', 'm', 'm'],
            blockMeasureStart: 1,
            numRepeats: 1,
            numMeasures: 4,
            callResponseGroupMeasures: null,
        });
        expect(labels).toEqual(['1', '2', '3', '4']);
    });

    it('call-response, groupMeasures=1 (letter d): "N" for the call, "N . 2" for the response, per barline', () => {
        const labels = renderLabels({
            ...baseProps,
            offsets: ['m', 'm', 'm', 'm', 'm'],
            blockMeasureStart: 1,
            numRepeats: 2,   // call-response levels DO set lvl.numRepeats=2
            numMeasures: 1,  // = callResponseMeasures for a call-response level
            callResponseGroupMeasures: 1,
        });
        expect(labels).toEqual(['1', '1 . 2', '2', '2 . 2']);
    });

    it('call-response, groupMeasures=2 (letter e): a 2-measure call group, then the same 2 measures repeat as the response', () => {
        const labels = renderLabels({
            ...baseProps,
            offsets: ['m', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 'm'],
            blockMeasureStart: 1,
            numRepeats: 2,
            numMeasures: 2,
            callResponseGroupMeasures: 2,
        });
        expect(labels).toEqual(['1', '2', '1 . 2', '2 . 2', '3', '4', '3 . 2', '4 . 2']);
    });

    // Bug fix (Han 2026-08-25 UAT, Level 11/letter e): synthetic lead-in barlines (SheetMusic.jsx
    // prepends `leadInBars` extra 'm' markers ahead of real content) must NOT be counted as
    // call/response measures — see `computeCallResponseLabel`'s own comment for the full bug.
    it('call-response with 2 lead-in bars: lead-in gets plain negative numbers, then the cycle restarts fresh at "1"', () => {
        const labels = renderLabels({
            ...baseProps,
            offsets: ['m', 'm', 'm', 'm', 'm', 'm', 'm'],
            blockMeasureStart: 1,
            numRepeats: 2,
            numMeasures: 2,
            callResponseGroupMeasures: 2,
            callResponseLeadInBars: 2,
        });
        expect(labels).toEqual(['-1', '0', '1', '2', '1 . 2', '2 . 2']);
    });

    it('never depends on blockMeasureStart/startIdx — call-response labeling is purely barline-ordinal-based', () => {
        // Deliberately mismatched blockMeasureStart/startIdx (as if combat-wave progress lagged behind
        // content generation, §304's usesTrebleJitStream scenario) must NOT change the labels.
        const labels = renderLabels({
            ...baseProps,
            offsets: ['m', 'm', 'm', 'm', 'm'],
            blockMeasureStart: 99,   // would be very wrong if this leaked into the call-response path
            startIdx: 50,
            numRepeats: 2,
            numMeasures: 1,
            callResponseGroupMeasures: 1,
        });
        expect(labels).toEqual(['1', '1 . 2', '2', '2 . 2']);
    });
});
