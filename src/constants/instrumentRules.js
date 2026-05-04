// Randomization rule families for melodic instruments and percussion.
// Centralised here so InstrumentRow and any future selectors share one definition.

export const RULE_FAMILIES = {
  random: ['uniform', 'emphasize_roots', 'weighted'],
  arp:    ['arp_up', 'arp_down', 'arp'],
  chords: ['pairedchord', 'fullchord'],
  fixed:  ['fixed'],
};

export const PERC_FAMILIES = {
  random:   ['uniform'],
  stylized: ['backbeat', 'swing'],
  fixed:    ['fixed'],
};
