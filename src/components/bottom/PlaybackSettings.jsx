
import React from 'react';
import '../../styles/App.css';

const PlaybackSettings = ({ numMeasures, setNumMeasures, playbackConfig, setPlaybackConfig }) => {

    const handleMeasureChange = (newValue) => {
        setNumMeasures(Math.max(1, Math.min(30, newValue)));
    };

    const toggleRoundSetting = (round, instrument) => {
        setPlaybackConfig(prev => ({
            ...prev,
            [round]: {
                ...prev[round],
                [instrument]: !prev[round][instrument]
            }
        }));
    };

    const handleMelodiesChange = (newValue) => {
        // -1 is infinity. Range -1 to 20.
        let val = newValue;
        if (newValue === 0) val = playbackConfig.totalMelodies === 1 ? -1 : 1;
        setPlaybackConfig(prev => ({
            ...prev,
            totalMelodies: val > 20 ? 20 : val < -1 ? -1 : val
        }));
    };

    const handleRepsChange = (newValue) => {
        setPlaybackConfig(prev => ({
            ...prev,
            repsPerMelody: Math.max(1, Math.min(20, newValue))
        }));
    };

    const InstrumentRow = ({ label, instrumentKey }) => (
        <div className="setting-row" style={{ display: 'grid', gridTemplateColumns: '120px 100px 100px', alignItems: 'center', gap: '20px', marginBottom: '8px' }}>
            <label style={{ fontSize: '14px' }}>{label}:</label>
            <button
                onClick={() => toggleRoundSetting('round1', instrumentKey)}
                style={{
                    padding: '8px',
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: playbackConfig.round1[instrumentKey] ? 'var(--accent-yellow)' : '#333',
                    color: playbackConfig.round1[instrumentKey] ? 'black' : 'white',
                    fontWeight: 'bold',
                    transition: '0.2s'
                }}
            >
                {playbackConfig.round1[instrumentKey] ? 'ON' : 'OFF'}
            </button>
            <button
                onClick={() => toggleRoundSetting('round2', instrumentKey)}
                style={{
                    padding: '8px',
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: playbackConfig.round2[instrumentKey] ? 'var(--accent-yellow)' : '#333',
                    color: playbackConfig.round2[instrumentKey] ? 'black' : 'white',
                    fontWeight: 'bold',
                    transition: '0.2s'
                }}
            >
                {playbackConfig.round2[instrumentKey] ? 'ON' : 'OFF'}
            </button>
        </div>
    );

    return (
        <div className="playback-settings" style={{ padding: '20px', color: 'white', overflowY: 'auto', maxHeight: '100%' }}>
            <h3 style={{ marginTop: 0 }}>Playback & Sequencer</h3>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', marginBottom: '20px' }}>

                <div className="setting-column">
                    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '5px' }}>REPS PER MELODY</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button onClick={() => handleRepsChange(playbackConfig.repsPerMelody - 1)}>-</button>
                        <span style={{ minWidth: '20px', textAlign: 'center' }}>{playbackConfig.repsPerMelody}</span>
                        <button onClick={() => handleRepsChange(playbackConfig.repsPerMelody + 1)}>+</button>
                    </div>
                </div>

                <div className="setting-column">
                    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '5px' }}>TOTAL MELODIES</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button onClick={() => handleMelodiesChange(playbackConfig.totalMelodies - 1)}>-</button>
                        <span style={{ minWidth: '20px', textAlign: 'center', fontSize: playbackConfig.totalMelodies === -1 ? '20px' : '16px' }}>
                            {playbackConfig.totalMelodies === -1 ? '∞' : playbackConfig.totalMelodies}
                        </span>
                        <button onClick={() => handleMelodiesChange(playbackConfig.totalMelodies + 1)}>+</button>
                    </div>
                </div>

                <div className="setting-column">
                    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '5px' }}>MEASURES</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button onClick={() => handleMeasureChange(numMeasures - 1)}>-</button>
                        <span style={{ minWidth: '20px', textAlign: 'center' }}>{numMeasures}</span>
                        <button onClick={() => handleMeasureChange(numMeasures + 1)}>+</button>
                    </div>
                </div>

            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '20px 0' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '120px 100px 100px', gap: '20px', fontWeight: 'bold', marginBottom: '15px', color: '#888', fontSize: '12px' }}>
                <div>INSTRUMENT</div>
                <div>ROUND 1 (ODD)</div>
                <div>ROUND 2 (EVEN)</div>
            </div>

            <InstrumentRow label="Treble Melody" instrumentKey="treble" />
            <InstrumentRow label="Bass Line" instrumentKey="bass" />
            <InstrumentRow label="Percussion" instrumentKey="percussion" />
            <InstrumentRow label="Metronome" instrumentKey="metronome" />

            <p style={{ fontSize: '11px', color: '#666', marginTop: '15px' }}>
                * Round 1 and Round 2 will alternate. "Total Melodies" defines how many times a new randomization occurs.
            </p>
        </div>
    );
};

export default PlaybackSettings;
