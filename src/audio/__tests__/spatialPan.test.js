import { describe, it, expect } from 'vitest';
import { computeSpatialPan } from '../spatialPan';

// #925 (Han 2026-08-16, "Graag stereo: in beeld: tot 50%-100% L-R, buiten beeld 0-50% L
// (afstandsgebaseerd)"): the shared pan/proximity formula every env-audio voice (birds, water) uses.
describe('computeSpatialPan', () => {
    it('pans 50% at exact screen-center while in view (never dead-center)', () => {
        const { pan, proximity } = computeSpatialPan(500, 1000, 1200);
        expect(pan).toBeCloseTo(0.5, 5);
        expect(proximity).toBe(1);
    });

    it('reaches 100% pan at the viewport edges while in view', () => {
        expect(computeSpatialPan(1000, 1000, 1200).pan).toBeCloseTo(1, 5);
        expect(computeSpatialPan(0, 1000, 1200).pan).toBeCloseTo(-1, 5);
    });

    it('holds at 50% pan just off-screen, decaying toward 0 with distance', () => {
        const justOff = computeSpatialPan(-1, 1000, 1200);
        expect(justOff.pan).toBeCloseTo(-0.5, 1);
        expect(justOff.proximity).toBeCloseTo(1, 1);

        const farOff = computeSpatialPan(-1200, 1000, 1200);
        expect(farOff.proximity).toBe(0);
        expect(farOff.pan).toBe(-0);
    });

    it('is symmetric for left vs right offscreen', () => {
        const left = computeSpatialPan(-600, 1000, 1200);
        const right = computeSpatialPan(1600, 1000, 1200);
        expect(right.pan).toBeCloseTo(-left.pan, 5);
        expect(right.proximity).toBeCloseTo(left.proximity, 5);
    });
});
