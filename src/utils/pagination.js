/**
 * Calculate musical blocks based on Backlog formula.
 * @param {number} numMeasures 
 * @param {number} slotLength Current noteWidth if all measures were shown
 * @param {number} minSlotLength Target minimum width (default 30)
 * @returns {number[]} 
 */
export const calculateMusicalBlocks = (numMeasures, slotLength, minSlotLength = 10) => {
  if (numMeasures <= 0) return [1];
  
  // Backlog formula: limit = numMeasures * slotLength / minSlotLength
  const limit = (numMeasures * slotLength) / minSlotLength;
  const measuresPerBlock = Math.max(1, Math.floor(limit));
  
  if (measuresPerBlock >= numMeasures) return [numMeasures];
  
  const numBlocks = Math.ceil(numMeasures / measuresPerBlock);
  
  // Balanced distribution:
  // Use div and mod to distribute measures as evenly as possible
  const baseSize = Math.floor(numMeasures / numBlocks);
  const remainder = numMeasures % numBlocks;
  
  const blocks = Array(numBlocks).fill(baseSize);
  for (let i = 0; i < remainder; i++) {
    blocks[i] += 1;
  }
  
  return blocks;
};
