import { generateChordOnDegree, generateAllScaleChords, generateRandomProgression } from '../src/utils/chordGenerator.js';

const scales = {
  cMajor: {
    notes: ['C4','D4','E4','F4','G4','A4','B4','C5'],
    displayScale: ['C4','D4','E4','F4','G4','A4','B4','C5'],
    tonic: 'C4'
  },
  ebMajor: {
    notes: ['E♭4','F4','G4','A♭4','B♭4','C5','D5','E♭5'],
    displayScale: ['E♭4','F4','G4','A♭4','B♭4','C5','D5','E♭5'],
    tonic: 'E♭4'
  },
  aMelodicMinor: {
    notes: ['A4','B4','C5','D5','E5','F♯5','G♯5','A5'],
    displayScale: ['A4','B4','C5','D5','E5','F♯5','G♯5','A5'],
    tonic: 'A4'
  }
};

function printChordsForScale(scaleObj, name) {
  console.log(`\n=== Chords for ${name} (triads) ===`);
  const triads = generateAllScaleChords(scaleObj, 'triad');
  triads.forEach((c, i) => {
    console.log(`${i+1}. ${c.internalRoot}${c.internalSuffix ? (' ' + c.internalSuffix) : ''} -> ${c.romanBaseDisplay || c.romanBaseRaw} ${c.romanSuffix || ''} [${c.notes.join(' ')}]`);
  });

  console.log(`\n=== Chords for ${name} (sevenths) ===`);
  const sevenths = generateAllScaleChords(scaleObj, 'seventh');
  sevenths.forEach((c, i) => {
    console.log(`${i+1}. ${c.internalRoot}${c.internalSuffix ? (' ' + c.internalSuffix) : ''} -> ${c.romanBaseDisplay || c.romanBaseRaw} ${c.romanSuffix || ''} [${c.notes.join(' ')}]`);
  });
}

async function run() {
  printChordsForScale(scales.cMajor, 'C Major');
  printChordsForScale(scales.ebMajor, 'E♭ Major');
  printChordsForScale(scales.aMelodicMinor, 'A Melodic Minor');

  console.log('\n=== Random progression (Eb Major) ===');
  const prog = generateRandomProgression(scales.ebMajor, 4);
  prog.forEach((c, i) => {
    console.log(`${i+1}. ${c.internalRoot}${c.internalSuffix ? (' ' + c.internalSuffix) : ''} -> ${c.romanBaseDisplay || c.romanBaseRaw}${c.romanSuffix ? ' ' + c.romanSuffix : ''} [${c.notes.join(' ')}]`);
  });
}

run().catch(err => {
  console.error('Test script error:', err);
  process.exit(1);
});

