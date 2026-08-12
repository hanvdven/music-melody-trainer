// #922 (Han 2026-08-12, RPG conversation system): pure scheduling logic for the per-character "typewriter"
// dialogue reveal — kept separate from the React hook that drives it (useConversationTypewriter.js) so the
// click-timing rules are unit-testable without mounting a component or an AudioContext.
//
// Han's exact rules:
//   - space: no tone, but still consumes 1 silent click (keeps the typewriter rhythm even)
//   - comma: its own click (a "leesteken", so C3), plus 2 EXTRA silent clicks (an eighth-beat pause = half
//     of the 4-click beat, #923's CLICKS_PER_BEAT)
//   - period: its own click (C3), then the schedule snaps forward to the NEXT beat boundary (a full
//     CLICKS_PER_BEAT multiple) — a natural "breath" before continuing/finishing
//   - uppercase letters AND any other punctuation: C3
//   - lowercase letters: weighted random C3 (70%), D3 (25%), E3 (5%)
const LOWERCASE_TONES = [
    { note: 'C3', weight: 70 },
    { note: 'D3', weight: 25 },
    { note: 'E3', weight: 5 },
];

export function pickLowercaseTone(rand = Math.random) {
    const r = rand() * 100;
    let acc = 0;
    for (const t of LOWERCASE_TONES) {
        acc += t.weight;
        if (r < acc) return t.note;
    }
    return LOWERCASE_TONES[0].note;
}

const isLetter = (c) => /[a-zA-Z]/.test(c);
const isUpper = (c) => isLetter(c) && c === c.toUpperCase();

// Builds the click-offset schedule for one page of text. `clicksPerBeat` is #923's CLICKS_PER_BEAT.
// Returns Array<{ char, tone: string|null, clickOffset }> — clickOffset is in whole "clicks" measured from
// the page's own start (the caller multiplies by its own clickMs, kept fixed for the page's duration).
export function buildTypewriterSchedule(text, clicksPerBeat, rand = Math.random) {
    const schedule = [];
    let click = 0;
    for (const char of text) {
        if (char === ' ') {
            schedule.push({ char, tone: null, clickOffset: click });
            click += 1;
            continue;
        }
        if (char === ',') {
            schedule.push({ char, tone: 'C3', clickOffset: click });
            click += 1 + 2;   // own click + 2 silent clicks (1/8-beat pause)
            continue;
        }
        if (char === '.') {
            schedule.push({ char, tone: 'C3', clickOffset: click });
            click += 1;
            const rem = click % clicksPerBeat;
            if (rem !== 0) click += clicksPerBeat - rem;   // snap forward to the next beat boundary
            continue;
        }
        const tone = isLetter(char) ? (isUpper(char) ? 'C3' : pickLowercaseTone(rand)) : 'C3';
        schedule.push({ char, tone, clickOffset: click });
        click += 1;
    }
    return schedule;
}
