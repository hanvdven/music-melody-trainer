import React from 'react';

const sharpsTrebleY = [11, 26, 6, 21, 36, 16, 31];
const flatsTrebleY = [31, 16, 36, 21, 41, 26, 46];
const sharpsBassY = [101, 116, 96, 111, 126, 106, 121];
const flatsBassY = [121, 106, 126, 111, 131, 116, 136];

const renderAccidentals = (numAccidentals) => {
  if (numAccidentals === 0) return null;

  const isSharp = numAccidentals > 0;
  const absNum = Math.abs(numAccidentals);
  const singleSymbol = isSharp ? '#' : 'b';
  const doubleSharpSymbol = 'Ü';
  const doubleFlatSymbol = 'º';

  const yPositionsTreble = isSharp ? sharpsTrebleY : flatsTrebleY;
  const yPositionsBass = isSharp ? sharpsBassY : flatsBassY;

  const renderSymbols = (absNum, yPositions, singleSymbol, doubleSymbol) => {
    const symbols = [];
    const loopOffset = absNum > 7 ? absNum - 7 : 0;

    for (let i = 0; i < Math.min(absNum, 7); i++) {
      const x = 42 + 8 * i;
      const yIndex = (i + loopOffset) % 7;
      const y = yPositions[yIndex];
      let symbol = singleSymbol;

      if (i >= 7 - loopOffset) {
        symbol = doubleSymbol;
      }

      symbols.push(
        <text
          key={`${symbol}-${i}`}
          x={x}
          y={y}
          fontSize="28"
          fill="var(--text-primary)"
          fontFamily="Maestro"
        >
          {symbol}
        </text>
      );
    }

    return symbols;
  };

  const trebleSymbols = renderSymbols(
    absNum,
    yPositionsTreble,
    singleSymbol,
    isSharp ? doubleSharpSymbol : doubleFlatSymbol
  );
  const bassSymbols = renderSymbols(
    absNum,
    yPositionsBass,
    singleSymbol,
    isSharp ? doubleSharpSymbol : doubleFlatSymbol
  );

  return (
    <>
      {trebleSymbols}
      {bassSymbols}
    </>
  );
};

export default renderAccidentals;
