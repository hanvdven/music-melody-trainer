
import React from 'react';
import '../styles/TypeSelectorOverlay.css';
import { getNoteSourceLabel } from '../../../utils/labelUtils';
import {
    PROGRESSION_STRATEGIES,
    getProgressionDefaultLength,
} from '../../../theory/progressionDefinitions';

const TypeSelectorOverlay = ({
    activeRandTypeSelector,
    setActiveRandTypeSelector,
    setTrebleSettings,
    setBassSettings,
    setPercussionSettings,
    setChordSettings,
    setPlaybackConfig,
    setNumMeasures,
    setRandType,
}) => {
    if (!activeRandTypeSelector) return null;

    const instrument = activeRandTypeSelector;

    let options = ['Standard'];
    let optionLabels = { 'Standard': 'Standard' };
    let optionValues = { 'Standard': 'uniform' };

    if (instrument === 'treble' || instrument === 'bass') {
        options = [
            'Root',
            'Chord',
            'Scale',
            'Chromatic'
        ];
        optionValues = {
            'Root': 'root',
            'Chord': 'chord',
            'Scale': 'scale',
            'Chromatic': 'chromatic'
        };
    } else if (instrument === 'percussion') {
        options = ['Claves', 'Kick & Snare', 'All Percussion'];
        optionValues = {
            'Claves': 'claves',
            'Kick & Snare': 'kick_snare',
            'All Percussion': 'all'
        };
    } else if (instrument === 'chords') {
        // Derived from progressionDefinitions — single source of truth.
        // Use key as stable option id; display label includes chord notation.
        options = PROGRESSION_STRATEGIES.map((s) => s.key);
        PROGRESSION_STRATEGIES.forEach((s) => { optionLabels[s.key] = s.label; });
        optionValues = Object.fromEntries(
            PROGRESSION_STRATEGIES.map((s) => [s.key, s.key])
        );
    }

    if (instrument !== 'chords') {
        options.forEach(opt => { optionLabels[opt] = opt; });
    }

    const handleSelect = (option) => {
        const nextRule = optionValues[option] || 'uniform';

        if (instrument === 'treble' && setTrebleSettings)
            setTrebleSettings((p) => ({ ...p, notePool: nextRule }));
        if (instrument === 'bass' && setBassSettings)
            setBassSettings((p) => ({ ...p, notePool: nextRule }));
        if (instrument === 'percussion' && setPercussionSettings)
            setPercussionSettings((p) => ({ ...p, notePool: nextRule }));
        if (instrument === 'chords') {
            let chordRandomizationValue = nextRule;
            if (nextRule === 'tonic-tonic-tonic') {
                chordRandomizationValue = false; // Fixed I-I-I
            } else if (nextRule === 'random') {
                chordRandomizationValue = 'modal-random';
            }

            if (setChordSettings) {
                setChordSettings(p => ({ ...p, strategy: chordRandomizationValue }));
            }

            // Use the canonical length from progressionDefinitions (only force it for predetermined ones).
            const strategy = PROGRESSION_STRATEGIES.find((s) => s.key === nextRule);
            const forcedLength = strategy?.category === 'predetermined'
                ? getProgressionDefaultLength(nextRule)
                : null;

            setPlaybackConfig((p) => {
                const updates = {
                    ...p,
                    // randomize.chords removed - now in chordSettings
                };

                if (forcedLength) {
                    updates.repsPerMelody = 1;
                    updates.round1 = { ...p.round1, chords: true };
                }
                return updates;
            });

            if (forcedLength && setNumMeasures) {
                setNumMeasures(forcedLength);
            }
        }

        const label = instrument === 'chords'
            ? (PROGRESSION_STRATEGIES.find((s) => s.key === nextRule)?.shortLabel ?? nextRule)
            : getNoteSourceLabel(nextRule);
        setRandType(prev => ({ ...prev, [instrument]: label }));
        setActiveRandTypeSelector(null);
    };

    return (
        <div className="tso-overlay" onClick={() => setActiveRandTypeSelector(null)}>
            <div className="tso-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="tso-title">{instrument} TYPE</div>
                {options.map(option => (
                    <button
                        key={option}
                        onClick={() => handleSelect(option)}
                        className="scale-selector-button tso-btn"
                    >
                        {optionLabels[option]}
                    </button>
                ))}
                <button
                    onClick={() => setActiveRandTypeSelector(null)}
                    className="tso-cancel"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
};

export default TypeSelectorOverlay;
