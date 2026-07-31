// #645 Character profile — persisted across sessions in localStorage (Han: standalone POC level, no
// coupling to the gamification system yet). Shape:
//   { name, birthday, gender, layers: { <category>: <partName|null> }, level }
// `layers` stores the SELECTED part NAME per category (resolved back to a URL via characterAssets at
// render time, so a moved/renamed asset degrades gracefully instead of storing a stale bundled URL).

const KEY = 'mmt.character.v1';

export const emptyCharacter = () => ({
    name: '',
    birthday: '',
    gender: 'male',
    layers: {},
    level: 1,
});

export function loadCharacter() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return emptyCharacter();
        const parsed = JSON.parse(raw);
        return { ...emptyCharacter(), ...parsed, layers: { ...(parsed.layers || {}) } };
    } catch {
        // Corrupt/blocked storage → start fresh; not worth surfacing for a cosmetic POC.
        return emptyCharacter();
    }
}

export function saveCharacter(character) {
    try {
        localStorage.setItem(KEY, JSON.stringify(character));
        return true;
    } catch {
        return false;
    }
}
