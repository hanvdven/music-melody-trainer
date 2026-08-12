// #922 (Han 2026-08-12, RPG conversation system): pure scheduling logic for the per-character "typewriter"
// dialogue reveal — kept separate from the React hook that drives it (useConversationDialogue.js) so the
// click-timing rules are unit-testable without mounting a component or an AudioContext.
//
// Han's exact rules:
//   - space: no tone, but still consumes 1 silent click (keeps the typewriter rhythm even)
//   - comma: its own click (a "leesteken"), plus 2 EXTRA silent clicks (an eighth-beat pause = half of the
//     4-click beat, #923's CLICKS_PER_BEAT)
//   - period: its own click, then the schedule snaps forward to the NEXT beat boundary (a full
//     CLICKS_PER_BEAT multiple) — a natural "breath" before continuing/finishing
//   - uppercase letters AND any other punctuation: the tone pool's OWN "cap tone" (its first/highest-weight
//     entry)
//   - lowercase letters: the tone pool's weighted-random pick
//
// #922 follow-up (Han: "japanese musician: koto. gebruik de IN toonladder, dus noten C4 Db4 en F4, met
// zelfde kansverhouding"): tones are no longer a fixed C/D/E-plus-octave triad — each entity supplies its
// OWN `tonePool` (see conversationEntities.js), a list of `{ note, weight }` full note names. The DEFAULT
// pool below is the original spec's literal "c3, d3, e3" (70/25/5).
export const DEFAULT_TONE_POOL = [
    { note: 'C3', weight: 70 },
    { note: 'D3', weight: 25 },
    { note: 'E3', weight: 5 },
];

export function pickWeightedTone(tonePool, rand = Math.random) {
    const total = tonePool.reduce((sum, t) => sum + t.weight, 0);
    const r = rand() * total;
    let acc = 0;
    for (const t of tonePool) {
        acc += t.weight;
        if (r < acc) return t.note;
    }
    return tonePool[0].note;
}

const isLetter = (c) => /[a-zA-Z]/.test(c);
const isUpper = (c) => isLetter(c) && c === c.toUpperCase();
const isPunctuation = (c) => c === ',' || c === '.';

// #922 round 3 (Han 2026-08-12, "ga terug naar het vorige tempo, dus verlaag met factor 2, maar spawn 3
// letter per keer (lineair verspreid). dus op 120bpm: elke kwartnoot: 12 letters, 4 audio-beats. Stop
// altijd bij een leesteken met letters genereren, zo ontstaan er wel rusten"): characters no longer get one
// full click each — up to GROUP_SIZE of them now share ONE click, spread linearly across its duration
// (fractional `clickOffset`s, `1/groupSize` apart). 4 clicks/beat (#923's CLICKS_PER_BEAT) × 3
// letters/click = 12 letters/beat, matching Han's exact numbers. Each character STILL gets its own tone
// (unchanged — "elk karakter wordt apart 'opgeschreven'"), just compressed into a shorter slice of the
// click's duration (`subSpan`, consumed by useConversationDialogue.js to shrink each note's audible length
// so 3 quick tones don't overlap/blur together). A punctuation mark ALWAYS closes its group immediately
// (even mid-group, e.g. after just 1 or 2 letters) — the resulting short group naturally reads as a slight
// hesitation/rest before comma's extra silent clicks or period's beat-snap kick in.
export const GROUP_SIZE = 3;

// Builds the click-offset schedule for one page of text. `clicksPerBeat` is #923's CLICKS_PER_BEAT.
// Returns Array<{ char, tone: string|null, clickOffset, subSpan }> — clickOffset is in (possibly
// fractional) "clicks" measured from the page's own start; `subSpan` (0 < subSpan <= 1) is this entry's
// share of one click's duration, for the caller to size its audible note length.
export function buildTypewriterSchedule(text, clicksPerBeat, options = {}) {
    const { tonePool = DEFAULT_TONE_POOL, rand = Math.random, groupSize = GROUP_SIZE } = options;
    const capTone = tonePool[0].note;   // the pool's own highest-weighted entry doubles as the "cap tone"
    const schedule = [];
    let click = 0;
    let group = [];   // chars accumulated for the CURRENT click-group: { char, tone }

    const flushGroup = () => {
        if (group.length === 0) return;
        const size = group.length;
        group.forEach((entry, i) => {
            schedule.push({ ...entry, clickOffset: click + i / size, subSpan: 1 / size });
        });
        group = [];
        click += 1;
    };

    for (const char of text) {
        if (char === ' ') {
            group.push({ char, tone: null });
            if (group.length >= groupSize) flushGroup();
            continue;
        }
        if (isPunctuation(char)) {
            group.push({ char, tone: capTone });
            flushGroup();   // a leesteken always closes its group immediately, even if not yet full
            if (char === ',') click += 2;                                    // 1/8-beat pause
            else {
                const rem = click % clicksPerBeat;
                if (rem !== 0) click += clicksPerBeat - rem;                 // snap to next beat boundary
            }
            continue;
        }
        const tone = isLetter(char) ? (isUpper(char) ? capTone : pickWeightedTone(tonePool, rand)) : capTone;
        group.push({ char, tone });
        if (group.length >= groupSize) flushGroup();
    }
    flushGroup();   // trailing partial group at end of text
    return schedule;
}
