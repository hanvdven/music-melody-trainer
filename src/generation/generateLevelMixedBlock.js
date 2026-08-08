import MelodyGenerator from './melodyGenerator';
import { generateLevel9CallResponseBlock } from './generateLevel9CallResponseBlock';
import { sliceMelodyByRange } from '../utils/melodySlice';

// Level 10 (Han 2026-08-06, "mixed level - stuur 2 maten slimes, dan 2 maten wizard (de gebruikelijke
// rust; speel voor-speel na), dan weer 2 maten slimes..."): one 2-measure BLOCK of the mixed level's
// treble. `blockType` picks which of the two EXISTING generation shapes to use — no third mechanism
// invented (§6c): a Slime block is a plain 2-measure melody through the SAME MelodyGenerator every other
// track uses (exactly like a normal side-scroll level's treble); a Wizard block reuses
// generateLevel9CallResponseBlock verbatim ("de gebruikelijke rust" = Level 9's own call/rest + response
// convention). PURE — mirrors generateLevel9CallResponseBlock.js/generateLevelBackingChunk.js's "pure
// generation" boundary so useLevelMixedStream.js can call it JIT, per block.
export function generateLevelMixedBlock({
  blockType,   // 'Slime' | 'Wizard'
  scale,
  timeSignature,
  trebleSettings,
  chordProgression,
  chordChunkStartMeasure,
  blockMeasures,
  measureLengthTicks,
  runId,
}) {
  if (blockType === 'Wizard') {
    return generateLevel9CallResponseBlock({
      scale, timeSignature, trebleSettings, chordProgression, chordChunkStartMeasure, measureLengthTicks, runId,
    });
  }
  const chordSlice = (chordProgression && chordProgression.notes?.length)
    ? sliceMelodyByRange(chordProgression, measureLengthTicks, blockMeasures, chordChunkStartMeasure)
    : null;
  return new MelodyGenerator(
    scale, blockMeasures, timeSignature, trebleSettings, chordSlice, trebleSettings?.range, runId,
  ).generateMelody();
}

export default generateLevelMixedBlock;
