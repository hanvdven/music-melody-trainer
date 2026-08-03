// #662 (Han 2026-08-03): shifts every note's tick offset by a constant amount, leaving everything else on
// the melody untouched. Used to push a REAL generated melody's notation later in tick-space so it doesn't
// visually appear until after a level's lead-in measures have scrolled past (see SheetMusic.jsx's
// scrollNotationBass — Level 8's real bass has no fixed lead-in pattern to show, so it must stay silent/
// invisible during measures -1/0, same as its audio).
const shiftMelodyOffsets = (melody, tickShift) => {
    if (!melody || !tickShift) return melody;
    return { ...melody, offsets: melody.offsets.map((o) => (o == null ? o : o + tickShift)) };
};

export default shiftMelodyOffsets;
