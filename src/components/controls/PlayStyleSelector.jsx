import React from 'react';
import { Dices, TrendingUp, Drum, Pin } from 'lucide-react';
import GenericStepper from '../common/GenericStepper';
import { RULE_FAMILIES, PERC_FAMILIES } from '../../constants/instrumentRules';
import { getPlayStyleLabel } from '../../utils/labelUtils';

const PlayStyleSelector = ({ settings, setSettings, isSheetMusic = false, instrumentKey, lowlighted = false }) => {
    if (instrumentKey === 'metronome' || instrumentKey === 'chords') return null;
    if (isSheetMusic) return <div className="ir-placeholder">-</div>;

    const currentRule = settings?.randomizationRule || 'uniform';
    const isPerc     = instrumentKey === 'percussion';
    const families   = isPerc ? PERC_FAMILIES : RULE_FAMILIES;
    const allRules   = Object.values(families).flat();

    const getIconForRule = (r) => {
        const family = Object.keys(families).find(k => families[k].includes(r));
        if (family === 'random')   return <Dices size={14} />;
        if (family === 'arp')      return <TrendingUp size={14} />;
        if (family === 'stylized') return <Drum size={14} />;
        if (family === 'fixed')    return <Pin size={14} />;
        return null;
    };

    const options = allRules.map(r => ({ label: getPlayStyleLabel(r), value: r, icon: getIconForRule(r) }));

    return (
        <div className="ir-stepper-90">
            <GenericStepper
                value={currentRule}
                label={getPlayStyleLabel(currentRule)}
                fontSize="11.5px"
                fontWeight="normal"
                fontFamily="sans-serif"
                uppercase
                allowedValues={allRules}
                options={options}
                shouldCycle
                onChange={(val) => setSettings(p => {
                    // #435: the chords-family type-hijack is gone (voices is its own setting);
                    // normalise a stale persisted 'fullchord'/'pairedchord' type back to the track.
                    const newType = (p.type === 'fullchord' || p.type === 'pairedchord') ? instrumentKey : p.type;
                    return { ...p, randomizationRule: val, type: newType };
                })}
                background="none"
                lowlighted={lowlighted}
            />
        </div>
    );
};

export default PlayStyleSelector;
