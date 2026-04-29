import React from 'react';

const sharpsY = [11, 26, 6, 21, 36, 16, 31];
const flatsY = [31, 16, 36, 21, 41, 26, 46];

// Semitone values for each position in the accidental order.
// Used to pick chromatone colors.
const sharpSemitones = [6, 1, 8, 3, 10, 5, 0];         // F#, C#, G#, D#, A#, E#, B#
const doubleSharpSemitones = [7, 2, 9, 4, 11, 6, 1];   // F##, C##, G##, D##, A##, E##, B##
const flatSemitones = [10, 3, 8, 1, 6, 11, 4];          // Bb, Eb, Ab, Db, Gb, Cb, Fb
const doubleFlatSemitones = [9, 2, 7, 0, 5, 10, 3];    // Bbb, Ebb, Abb, Dbb, Gbb, Cbb, Fbb

// startY: absolute SVG y-coordinate of the top staff line for this staff.
//   treble → trebleStart (11), bass → bassStart, etc.
const renderAccidentals = (numAccidentals, clef = 'treble', startY = 11, noteColoringMode = 'none', startXOffset = 42, spacing = 8) => {
  if (numAccidentals === 0) return null;

  const clefOffsets = {
    treble: 0,
    bass: 10,
    alto: 5,
    tenor: -5,
    soprano: 25,
    'mezzo-soprano': 15,
  };

  // The sharpsY/flatsY arrays are calibrated so that y=sharpsY[i] gives the
  // correct position when the treble staff top is at y=11. For any other staff,
  // shift by (startY − 11) and add the clef-specific note offset.
  const clefMain = clef.replace(/8va|15va|8vb|15vb|8/g, '');
  const dynamicClefOffset = clefOffsets[clefMain] !== undefined ? clefOffsets[clefMain] : 0;
  const shift = (startY - 11) + dynamicClefOffset;

  const isSharp = numAccidentals > 0;
  const absNum = Math.abs(numAccidentals);
  const singleSymbol = isSharp ? '#' : 'b';
  const doubleSharpSymbol = 'Ü';
  const doubleFlatSymbol = 'º';

  const basePositions = isSharp ? sharpsY : flatsY;

  const renderSymbols = (absNum, yPositions, singleSymbol, doubleSymbol) => {
    const symbols = [];
    const loopOffset = absNum > 7 ? absNum - 7 : 0;

    for (let i = 0; i < Math.min(absNum, 7); i++) {
      const x = startXOffset + spacing * i;
      const yIndex = (i + loopOffset) % 7;
      const y = yPositions[yIndex] + shift;
      const isDouble = i >= 7 - loopOffset;
      const symbol = isDouble ? doubleSymbol : singleSymbol;

      let fill = 'var(--text-primary)';
      if (noteColoringMode === 'chromatone' || noteColoringMode === 'subtle-chroma') {
        let semitone;
        if (isSharp) {
          semitone = isDouble
            ? doubleSharpSemitones[i - (7 - loopOffset)]
            : sharpSemitones[i];
        } else {
          semitone = isDouble
            ? doubleFlatSemitones[i - (7 - loopOffset)]
            : flatSemitones[i];
        }
        const baseColor = `var(--chromatone-${semitone})`;

        if (noteColoringMode === 'subtle-chroma') {
          fill = `color-mix(in srgb, ${baseColor}, var(--soft-mix-target, white) 60%)`;
        } else {
          fill = baseColor;
        }
      }

      symbols.push(
        <text
          key={`${symbol}-${i}`}
          x={x}
          y={y}
          fontSize="30"
          fill={fill}
          fontFamily="Maestro"
        >
          {symbol}
        </text>
      );
    }

    return symbols;
  };

  return renderSymbols(
    absNum,
    basePositions,
    singleSymbol,
    isSharp ? doubleSharpSymbol : doubleFlatSymbol
  );
};

export { renderAccidentals };
