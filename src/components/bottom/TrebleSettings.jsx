import React from 'react';
import '../../styles/App.css';

export const instrumentOptions = {
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

import ThemeToggle from '../ui/ThemeToggle';

const TrebleSettings = ({ currentTheme, setTheme }) => {
    return (
        <div className="treble-settings">
            <h3 style={{ textAlign: 'center' }}>Setup</h3>
            <ThemeToggle currentTheme={currentTheme} setTheme={setTheme} />
        </div>
    );
};

export default TrebleSettings;
