// Scarborough Fair — score data lives in the sibling JSON so the pure note/lyric/chord arrays stay
// separate from any JS-only fields (same split as happyBirthday.js).
//
// AUTO-GENERATED from src/songs/abc/scarborough-fair.abc by `npm run abc:song` (#871). Re-run the script rather
// than hand-editing the JSON. Conversion decisions (also recorded in the JSON's `_source`):
//   • repeats (|: :|) are NOT expanded — each section is written once;
//   • ties (-) are merged into the preceding note's duration;
//   • slurs ( ) are ignored.
// One difficulty tier ('easy'); no `randomizationRule: 'fixed'` so the loaded Melody (and its lyrics)
// survives randomizeAll by identity.
import data from '../data/scarborough-fair.json';

export default data;
