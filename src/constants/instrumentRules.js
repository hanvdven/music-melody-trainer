// Randomization rule families for melodic instruments and percussion.
// Centralised here so InstrumentRow and any future selectors share one definition.

// #435 (Han 2026-07-17): the 'chords' family (pairedchord/fullchord) was removed — simultaneous
// notes are now driven by the InstrumentSettings.voices field (melodyGenerator.applyVoicing),
// not by hijacking the settings `type` with a chord-rule value.
export const RULE_FAMILIES = {
  random: ['uniform', 'emphasize_roots', 'weighted'],
  arp:    ['arp_up', 'arp_down', 'arp', 'arp_var', 'arp_group'],
  walk:   ['walking_bass'],
  fixed:  ['fixed'],
};

export const PERC_FAMILIES = {
  random:   ['uniform'],
  stylized: ['backbeat', 'backbeat_2', 'swing'],
  fixed:    ['fixed'],
};
