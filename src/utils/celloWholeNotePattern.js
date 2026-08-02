import { TICKS_PER_WHOLE } from '../constants/timing';

// #661 (Han 2026-08-02, Level 2 exception): a single whole note, C2, every measure. Han: "de cello is een
// octaaf te hoog [met de gegenereerde baslijn] ... voor level 2 wil ik uitzonderlijk gewoon een C2 toon,
// hele noot, elke maat" — deliberately simpler than Level 3 (which keeps the real generated bass melody),
// authorized as a hardcoded exception (mirrors utils/timpaniPattern.js's Level 2/3 timpani pattern).
export default function buildCelloWholeNotePattern(numMeasures, timeSignature = [4, 4]) {
    const measureTicks = TICKS_PER_WHOLE * (timeSignature[0] / timeSignature[1]);
    const notes = [], offsets = [], durations = [];
    for (let m = 0; m < Math.max(1, numMeasures); m++) {
        notes.push('C2');
        offsets.push(m * measureTicks);
        durations.push(measureTicks);
    }
    return { notes, offsets, durations, ties: new Array(notes.length).fill(null) };
}
