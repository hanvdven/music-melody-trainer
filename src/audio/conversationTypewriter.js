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

// Builds the click-offset schedule for one page of text. `clicksPerBeat` is #923's CLICKS_PER_BEAT.
// Returns Array<{ char, tone: string|null, clickOffset }> — clickOffset is in whole "clicks" measured from
// the page's own start (the caller multiplies by its own clickMs, kept fixed for the page's duration).
export function buildTypewriterSchedule(text, clicksPerBeat, options = {}) {
    const { tonePool = DEFAULT_TONE_POOL, rand = Math.random } = options;
    const capTone = tonePool[0].note;   // the pool's own highest-weighted entry doubles as the "cap tone"
    const schedule = [];
    let click = 0;
    for (const char of text) {
        if (char === ' ') {
            schedule.push({ char, tone: null, clickOffset: click });
            click += 1;
            continue;
        }
        if (char === ',') {
            schedule.push({ char, tone: capTone, clickOffset: click });
            click += 1 + 2;   // own click + 2 silent clicks (1/8-beat pause)
            continue;
        }
        if (char === '.') {
            schedule.push({ char, tone: capTone, clickOffset: click });
            click += 1;
            const rem = click % clicksPerBeat;
            if (rem !== 0) click += clicksPerBeat - rem;   // snap forward to the next beat boundary
            continue;
        }
        const tone = isLetter(char) ? (isUpper(char) ? capTone : pickWeightedTone(tonePool, rand)) : capTone;
        schedule.push({ char, tone, clickOffset: click });
        click += 1;
    }
    return schedule;
}
