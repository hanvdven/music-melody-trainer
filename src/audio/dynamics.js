// #922/#924 (Han 2026-08-12, "maak alle muziek, en ook de tekst mf"): ONE shared "mezzo-forte" gain level
// (§6c — no second hand-picked volume constant) used by every RPG-world audio system that should read as a
// moderate, clearly-audible-but-not-maximum dynamic: the conversation typewriter, and the world's generated
// ambient music. Standard mf sits around MIDI velocity 76-84/127; expressed here as the 0-1 gain fraction
// `playSound`/`playMelodies` already take as their own volume parameter.
export const MF_VOLUME = 0.7;
