import React from 'react';
import '../../styles/App.css';

const instrumentOptions = {
    'Acoustic Grand Piano': 'acoustic_grand_piano',
    Harp: 'orchestral_harp',
    'Acoustic Guitar (Nylon)': 'acoustic_guitar_nylon',
    'Acoustic Guitar (Steel)': 'acoustic_guitar_steel',
    'Electric Guitar (Clean)': 'electric_guitar_clean',
    'Electric Bass (Picked)': 'electric_bass_pick',
    'Synth Bass': 'synth_bass_1',
    'Slap Bass': 'slap_bass_2',
    Violin: 'violin',
    'String Ensemble': 'string_ensemble_1',
    Trumpet: 'trumpet',
    Saxophone: 'tenor_sax',
    Flute: 'flute',
    Marimba: 'marimba',
    'Voice Oohs': 'voice_oohs',
};

const randomizationRulesOptions = {
    Uniform: 'uniform',
    'Tonic On Ones': 'tonic_on_ones',
    'Chords (Arpeggio)': 'chords_arpeggio',
};

const noteDenomNames = {
    'Whole (1)': 1,
    'Half (1/2)': 2,
    'Quarter (1/4)': 4,
    'Eigth (1/8)': 8,
    'Sixteenth (1/16)': 16,
};

const TrebleSettings = ({ trebleInstrumentSettings, setTrebleInstrumentSettings }) => {
    const handleChange = (field, value) => {
        setTrebleInstrumentSettings(prev => ({
            ...prev,
            [field]: value
        }));
    };

    return (
        <div className="treble-settings">
            <h3>Treble Settings</h3>

            <div className="setting-row">
                <label>Instrument: </label>
                <select
                    value={trebleInstrumentSettings.instrument}
                    onChange={e => handleChange('instrument', instrumentOptions[e.target.value])}
                >
                    {Object.keys(instrumentOptions).map(name => (
                        <option key={name} value={name}>{name}</option>
                    ))}
                </select>
            </div>

            <div className="setting-row">
                <label>Smallest Note: </label>
                <select
                    value={trebleInstrumentSettings.smallestNoteDenom}
                    onChange={e => handleChange('smallestNoteDenom', noteDenomNames[e.target.value])}
                >
                    {Object.keys(noteDenomNames).map(name => (
                        <option key={name} value={name}>{name}</option>
                    ))}
                </select>
            </div>

            <div className="setting-row">
                <label>Randomization Rule: </label>
                <select
                    value={trebleInstrumentSettings.randomizationRules}
                    onChange={e => handleChange('randomizationRules', randomizationRulesOptions[e.target.value])}
                >
                    {Object.keys(randomizationRulesOptions).map(name => (
                        <option key={name} value={name}>{name}</option>
                    ))}
                </select>
            </div>

            <div className="setting-row">
                <label>Notes per Measure: </label>
                <button onClick={() => handleChange('notesPerMeasure', Math.max(0, trebleInstrumentSettings.notesPerMeasure -1))}>-</button>
                <span>{trebleInstrumentSettings.notesPerMeasure}</span>
                <button onClick={() => handleChange('notesPerMeasure', Math.min(32, trebleInstrumentSettings.notesPerMeasure +1))}>+</button>
            </div>

            <div className="setting-row">
                <label>Rhythm Variability: </label>
                <button onClick={() => handleChange('rhythmVariability', Math.max(0, trebleInstrumentSettings.rhythmVariability -5))}>-</button>
                <span>{trebleInstrumentSettings.rhythmVariability}%</span>
                <button onClick={() => handleChange('rhythmVariability', Math.min(100, trebleInstrumentSettings.rhythmVariability +5))}>+</button>
            </div>

            <div className="setting-row">
                <label>Enable Triplets: </label>
                <button onClick={() => handleChange('enableTriplets', !trebleInstrumentSettings.enableTriplets)}>
                    {trebleInstrumentSettings.enableTriplets ? 'Yes' : 'No'}
                </button>
            </div>
        </div>
    );
};

export default TrebleSettings;
