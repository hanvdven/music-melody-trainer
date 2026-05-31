import React from 'react';
import GenericStepper from '../common/GenericStepper';
import { getNoteSourceLabel } from '../../utils/labelUtils';
import { PERCUSSION_PRESETS } from '../../audio/drumKits';

const RULES_BY_INSTRUMENT = {
    treble:     ['root', 'chord', 'scale', 'chromatic'],
    bass:       ['root', 'chord', 'scale', 'chromatic'],
    // Percussion picks a pad POOL preset (Han 2026-05-31). The coarse
    // claves/kick_snare/all "fill flavour" was replaced by BASIC/STANDARD/FULL,
    // which write enabledPads — the same pad set the in-staff range selector
    // edits. One source of truth for "which drums"; the generator already
    // filters its output by enabledPads (filterPercussionByEnabledPads).
    percussion: ['BASIC', 'STANDARD', 'FULL'],
    chords:     ['modal-random', 'ii-v-i', 'pop-1-5-6-4', 'pop-6-4-1-5', 'doo-wop', 'classical-1-4-5-5', 'pachelbel'],
};

// Set-equality on small arrays (preset-match detection for percussion).
const sameSet = (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const s = new Set(a);
    return b.every(x => s.has(x));
};

const labelFor = (instrumentKey, rule) =>
    instrumentKey === 'percussion'
        ? rule.charAt(0) + rule.slice(1).toLowerCase()   // BASIC → Basic
        : getNoteSourceLabel(rule);

const RuleSelector = ({ instrumentKey, settings, setSettings, isSheetMusic = false }) => {
    if (isSheetMusic) return null;

    const rules = RULES_BY_INSTRUMENT[instrumentKey] ?? [];
    if (rules.length === 0) return null;

    const isPercussion = instrumentKey === 'percussion';

    // Percussion: reflect which preset the current enabledPads equals (or the
    // first preset as a fallback when it is a custom selection from the staff
    // range selector). Melodic instruments: reflect notePool as before.
    const currentRule = isPercussion
        ? (rules.find(m => sameSet(settings?.enabledPads, PERCUSSION_PRESETS[m])) || 'STANDARD')
        : (settings?.notePool || 'scale');

    const options = rules.map(r => ({ label: labelFor(instrumentKey, r), value: r }));

    const handleChange = (val) => {
        if (isPercussion) {
            setSettings(p => ({ ...p, enabledPads: [...PERCUSSION_PRESETS[val]] }));
        } else {
            setSettings(p => ({ ...p, notePool: val }));
        }
    };

    return (
        <div className="ir-stepper-90">
            <GenericStepper
                value={currentRule}
                label={labelFor(instrumentKey, currentRule)}
                fontSize="11.5px"
                fontFamily="sans-serif"
                uppercase
                allowedValues={rules}
                options={options}
                shouldCycle
                onChange={handleChange}
            />
        </div>
    );
};

export default RuleSelector;
