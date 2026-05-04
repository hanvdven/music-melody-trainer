import React from 'react';
import GenericStepper from '../common/GenericStepper';
import { getNoteSourceLabel } from '../../utils/labelUtils';

const RULES_BY_INSTRUMENT = {
    treble:     ['root', 'chord', 'scale', 'chromatic'],
    bass:       ['root', 'chord', 'scale', 'chromatic'],
    percussion: ['claves', 'kick_snare', 'all'],
    chords:     ['modal-random', 'ii-v-i', 'pop-1-5-6-4', 'pop-6-4-1-5', 'doo-wop', 'classical-1-4-5-5', 'pachelbel'],
};

const RuleSelector = ({ instrumentKey, settings, setSettings, isSheetMusic = false }) => {
    if (isSheetMusic) return null;

    const rules = RULES_BY_INSTRUMENT[instrumentKey] ?? [];
    if (rules.length === 0) return null;

    const currentRule = settings?.notePool || (instrumentKey === 'percussion' ? 'all' : 'scale');
    const options = rules.map(r => ({ label: getNoteSourceLabel(r), value: r }));

    return (
        <div className="ir-stepper-90">
            <GenericStepper
                value={currentRule}
                label={getNoteSourceLabel(currentRule)}
                fontSize="11.5px"
                fontFamily="sans-serif"
                uppercase
                allowedValues={rules}
                options={options}
                shouldCycle
                onChange={(val) => setSettings(p => ({ ...p, notePool: val }))}
            />
        </div>
    );
};

export default RuleSelector;
