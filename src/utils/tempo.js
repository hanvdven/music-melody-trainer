export const tempoTerms = [
  { bpm: 0, term: 'Larghissimo', target: 30 },  // no lower bound; use 30 as practical minimum
  { bpm: 35, term: 'Larghissimo (Grave)' },
  { bpm: 40, term: 'Largo (Grave)' },
  { bpm: 45, term: 'Largo (Lento)' },
  { bpm: 60, term: 'Larghetto' },
  { bpm: 66, term: 'Adagio' },
  { bpm: 72, term: 'Adagietto' },
  { bpm: 76, term: 'Andante' },
  { bpm: 80, term: 'Andante (Andantino)' },
  { bpm: 92, term: 'Andante Moderato' },
  { bpm: 108, term: 'Moderato' },
  { bpm: 112, term: 'Allegretto (Moderato)' },
  { bpm: 116, term: 'Allegro Moderato' },
  { bpm: 120, term: 'Allegro' },
  { bpm: 140, term: 'Allegro (Vivace)' },
  { bpm: 168, term: 'Presto' },
  { bpm: 172, term: 'Allegrissimo (Vivacissimo)' },
  { bpm: 176, term: 'Presto' },
  { bpm: 200, term: 'Prestissimo', target: 210 },  // no upper bound; use 210 as practical target
];

export const getTempoTerm = (bpm) => {
  const reversedTerms = [...tempoTerms].reverse();
  const term = reversedTerms.find((term) => bpm >= term.bpm);
  return term ? term.term : 'Unknown';
};
