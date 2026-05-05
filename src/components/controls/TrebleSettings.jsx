import React, { useState } from 'react';
import '../../styles/App.css';
import './styles/TrebleSettings.css';
import { Snowflake, Flame } from 'lucide-react';
import ThemeToggle from '../common/ThemeToggle';
import RangeControls from './RangeControls';

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
  'Standard Drums (GM)': 'standard',
  'Electronic Drums (GM)': 'electronic',
  'Jazz Drums (GM)': 'jazz',
};

const TrebleSettings = ({
  trebleInstrumentSettings,
  setTrebleInstrumentSettings,
  bassInstrumentSettings,
  setBassInstrumentSettings,
  currentTheme,
  setTheme,
  generateChords,
  playbackConfig,
  noteColoringMode,
  setNoteColoringMode,
  activeTonic,
}) => {
  const [heat, setHeat] = useState(50);

  return (
    <div className="treble-settings">
      <h3 className="treble-settings-setup-title">Setup</h3>

      {/* HEAT SLIDER (Placeholder) */}
      <div className="treble-settings-heat-row">
        <Snowflake size={20} color="#88ccff" />
        <div className="treble-settings-heat-col">
          <span className="treble-settings-heat-label">Rhythm Heat</span>
          <input
            type="range"
            min="0"
            max="100"
            value={heat}
            onChange={(e) => setHeat(parseInt(e.target.value))}
            className="treble-settings-heat-range"
          />
        </div>
        <Flame size={20} color="#ff8800" />
      </div>

      {/* RANGE SELECTORS (Using Reusable Component) */}
      <div className="treble-settings-range-section">
        <div className="treble-settings-range-row">
          <RangeControls
            activeSettings={trebleInstrumentSettings}
            setSettings={setTrebleInstrumentSettings}
            tonic={activeTonic}
            activeClef="treble"
            noteColoringMode={noteColoringMode}
            setNoteColoringMode={setNoteColoringMode}
          />
        </div>
        <div>
          <RangeControls
            activeSettings={bassInstrumentSettings}
            setSettings={setBassInstrumentSettings}
            tonic={activeTonic}
            activeClef="bass"
            noteColoringMode={noteColoringMode}
            setNoteColoringMode={setNoteColoringMode}
          />
        </div>
      </div>

      <div className="treble-settings-regen-wrap">
        <button
          className="tab-button treble-settings-regen-btn"
          onClick={() => generateChords(playbackConfig?.randomize?.chords)}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 3v18h18" />
            <path d="M7 12h10" />
            <path d="M7 7h10" />
            <path d="M7 17h10" />
          </svg>
          <span className="treble-settings-regen-label">Regenerate Chords</span>
        </button>
      </div>
      <ThemeToggle currentTheme={currentTheme} setTheme={setTheme} />
    </div>
  );
};

export default TrebleSettings;
