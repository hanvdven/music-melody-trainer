import React, { useState } from 'react';
import '../../styles/App.css';

const PlaybackSettings = ({
    numMeasures, setNumMeasures,
    playbackConfig, setPlaybackConfig,
    trebleSettings, setTrebleSettings,
    bassSettings, setBassSettings,
    percussionSettings, setPercussionSettings,
    activeScale,
    generatorMode, setGeneratorMode,
    activePreset, setActivePreset
}) => {

    const getTypeFromRule = (rule) => {
        if (rule === 'tonicOnOnes') return 'tonic';
        if (rule === 'quarters') return 'quarters';
        if (rule === 'scale') return 'scale';
        return 'random';
    };

    const [randType, setRandType] = useState({
        treble: getTypeFromRule(trebleSettings?.randomizationRules),
        bass: getTypeFromRule(bassSettings?.randomizationRules),
        percussion: getTypeFromRule(percussionSettings?.randomizationRules)
    });

    // Sync state with props
    React.useEffect(() => {
        setRandType({
            treble: getTypeFromRule(trebleSettings?.randomizationRules),
            bass: getTypeFromRule(bassSettings?.randomizationRules),
            percussion: getTypeFromRule(percussionSettings?.randomizationRules)
        });
    }, [trebleSettings?.randomizationRules, bassSettings?.randomizationRules, percussionSettings?.randomizationRules]);

    const randTypeOptions = ['random', 'tonic', 'quarters', 'scale'];

    const cycleRandType = (instrument) => {
        markCustom();
        const current = randType[instrument] || 'random';
        const index = randTypeOptions.indexOf(current);
        const nextType = randTypeOptions[(index + 1) % randTypeOptions.length];

        const ruleMap = { 'random': 'uniform', 'tonic': 'tonicOnOnes', 'quarters': 'quarters', 'scale': 'scale' };
        const nextRule = ruleMap[nextType];

        if (instrument === 'treble' && setTrebleSettings) setTrebleSettings(p => ({ ...p, randomizationRules: nextRule }));
        if (instrument === 'bass' && setBassSettings) setBassSettings(p => ({ ...p, randomizationRules: nextRule }));
        if (instrument === 'percussion' && setPercussionSettings) setPercussionSettings(p => ({ ...p, randomizationRules: nextRule }));
    };

    const toggleRoundSetting = (round, instrument) => {
        markCustom();
        setPlaybackConfig(prev => ({
            ...prev,
            [round]: {
                ...prev[round],
                [instrument]: !prev[round][instrument]
            }
        }));
    };

    const handleRepsChange = (newValue) => {
        setPlaybackConfig(prev => ({
            ...prev,
            repsPerMelody: Math.max(1, Math.min(20, newValue))
        }));
    };

    const markCustom = () => {
        if (setActivePreset) setActivePreset('custom');
    };

    const handleTonicToggle = () => {
        markCustom();
        setPlaybackConfig(prev => ({
            ...prev,
            randomize: { ...prev.randomize, tonic: !prev.randomize.tonic }
        }));
    };

    const handleMelodyToggle = () => {
        markCustom();
        setPlaybackConfig(prev => ({
            ...prev,
            randomize: { ...prev.randomize, melody: !prev.randomize.melody }
        }));
    };

    const displayFamily = (() => {
        if (activeScale?.family === 'Simple') {
            if (activeScale.name === 'Major' || activeScale.name === 'Minor') return 'Diatonic';
        }
        return activeScale?.family;
    })();

    const ShuffleIcon = ({ color = 'var(--accent-yellow)' }) => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 3 21 3 21 8"></polyline>
            <line x1="4" y1="20" x2="21" y2="3"></line>
            <polyline points="21 16 21 21 16 21"></polyline>
            <line x1="15" y1="15" x2="21" y2="21"></line>
            <line x1="4" y1="4" x2="9" y2="9"></line>
        </svg>
    );

    const NotesIcon = ({ color = 'var(--accent-yellow)' }) => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
        </svg>
    );

    const WheelIcon = ({ color = 'var(--accent-yellow)' }) => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 2v20"></path>
            <path d="M2 12h20"></path>
            <path d="M19.07 4.93l-14.14 14.14"></path>
            <path d="M4.93 4.93l14.14 14.14"></path>
        </svg>
    );

    const isHeptatonicSubset = (family) => {
        return ['Diatonic', 'Melodic', 'Harmonic Minor', 'Harmonic Major', 'Double Harmonic'].includes(family);
    };

    const handleModeToggle = () => {
        if (['Supertonic', 'Tritonic'].includes(activeScale?.family) || activeScale?.name === 'Chromatic') return;
        markCustom();
        setPlaybackConfig(prev => {
            const isModeRandom = prev.randomize.mode;
            const isFamilyRandom = prev.randomize.family !== false;

            if (isModeRandom && isFamilyRandom) {
                return {
                    ...prev,
                    randomize: { ...prev.randomize, mode: false, family: false }
                };
            }

            return {
                ...prev,
                randomize: { ...prev.randomize, mode: !prev.randomize.mode }
            };
        });
    };

    const handleFamilyToggle = () => {
        markCustom();
        setPlaybackConfig(prev => {
            const current = prev.randomize.family;
            let next;

            if (current === false) next = 'hepta';
            else if (current === 'hepta') next = true;
            else next = false;

            const newRandomize = { ...prev.randomize, family: next };

            if (next === 'hepta' || next === true) {
                newRandomize.mode = true;
                newRandomize.melody = true;
            }

            return { ...prev, randomize: newRandomize };
        });
    };

    const SmartToggle = ({ label, value, state, onToggle, disabled }) => {
        let isRandom = state === true || state === 'hepta';
        let isHepta = state === 'hepta';

        const activeBg = 'rgba(255, 255, 0, 0.05)';
        const activeColor = 'var(--accent-yellow)';
        const inactiveColor = 'white';
        const labelColor = '#888';

        const renderIconOrValue = () => {
            if (label === 'MELODY') {
                return isRandom ? <ShuffleIcon color={activeColor} /> : <NotesIcon color={inactiveColor} />;
            }

            if (isRandom) {
                if (label === 'MODE' && (playbackConfig.randomize.family === 'hepta' || isHeptatonicSubset(activeScale?.family))) {
                    return <WheelIcon color={activeColor} />;
                }
                return <ShuffleIcon color={activeColor} />;
            }
            return (
                <span style={{
                    fontSize: '15px',
                    fontFamily: 'serif',
                    color: inactiveColor,
                    fontWeight: '900',
                    textAlign: 'center',
                    wordBreak: 'break-word',
                    lineHeight: '1.1',
                    padding: '0 4px'
                }}>
                    {value || 'Active'}
                </span>
            );
        };

        return (
            <button
                onClick={() => !disabled && onToggle()}
                disabled={disabled}
                style={{
                    flex: 1,
                    height: '68px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isRandom ? activeBg : 'none',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 6px',
                    cursor: disabled ? 'default' : 'pointer',
                    transition: 'all 0.2s ease',
                    color: isRandom ? activeColor : inactiveColor,
                    opacity: disabled ? 0.4 : 1
                }}
                title={typeof value === 'string' ? value : ''}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '24px' }}>
                    {renderIconOrValue()}
                </div>
                <span style={{
                    fontSize: '8.5px',
                    marginTop: '2px',
                    color: isRandom ? activeColor : labelColor,
                    fontWeight: 'normal',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    lineHeight: '1',
                    textAlign: 'center',
                    maxWidth: '100%',
                    whiteSpace: 'normal'
                }}>
                    {isRandom ? (
                        label === 'TONIC' ? 'RANDOMIZE TONIC' :
                            label === 'MODE' ? 'RANDOMIZE MODE' :
                                label === 'FAMILY' ? (isHepta ? 'HEPTATONIC SCALE' : 'RANDOM SCALE') :
                                    label === 'MELODY' ? 'RANDOM MELODY' :
                                        (isHepta ? 'RANDOM HEPTATONIC' : 'RANDOM')
                    ) : `FIX ${label}`}
                </span>
            </button>
        );
    };

    const isModeDisabled = ['Supertonic', 'Tritonic'].includes(activeScale?.family) || activeScale?.name === 'Chromatic';
    const isModeRandomForced = playbackConfig.randomize.family === true || playbackConfig.randomize.family === 'hepta';

    const getRandTypeLabel = (val) => {
        if (val === 'random') return 'Random';
        if (val === 'tonic') return 'Tonic on one';
        if (val === 'quarters') return 'Quarters';
        if (val === 'scale') return 'Scale';
        return val;
    };

    const handleTrebleChange = (field, value) => {
        if (!setTrebleSettings) return;
        markCustom();
        setTrebleSettings(prev => ({ ...prev, [field]: value }));
    };

    const noteDenoms = [1, 2, 4, 8, 16];
    const noteDenomLabels = { 1: '1/1', 2: '1/2', 4: '1/4', 8: '1/8', 16: '1/16' };

    const cycleSmallestNote = () => {
        if (!trebleSettings) return;
        markCustom();
        const current = trebleSettings.smallestNoteDenom || 4;
        const idx = noteDenoms.indexOf(current);
        const next = noteDenoms[(idx + 1) % noteDenoms.length];
        handleTrebleChange('smallestNoteDenom', next);
    };

    const GeneratorToggle = ({ label, value }) => (
        <button
            className={`scale-selector-button ${generatorMode === value ? 'active' : ''}`}
            onClick={() => setGeneratorMode(value)}
            style={{ flex: 1, textAlign: 'center', height: '32px' }}
        >
            {label}
        </button>
    );

    const InvisibleButton = ({ label, onClick }) => (
        <button
            onClick={onClick}
            style={{ background: 'none', border: 'none', color: 'var(--accent-yellow)', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer', padding: '0 5px' }}
        >
            {label}
        </button>
    );

    const InstrumentRow = ({ label, glyph, instrumentKey }) => (
        <div style={{ display: 'grid', gridTemplateColumns: generatorMode === 'presets' ? '0.8fr 0.8fr' : '0.8fr 0.8fr 1.2fr 1.2fr 1.2fr 1.2fr', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
            <div style={{ fontSize: glyph ? '20px' : '11px', color: '#ccc', fontFamily: glyph ? 'Maestro' : 'inherit', paddingLeft: glyph ? '2px' : '0', textAlign: 'center', fontWeight: 'bold' }}>
                {glyph || label}
            </div>

            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                <div onClick={() => toggleRoundSetting('round1', instrumentKey)} style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: playbackConfig.round1[instrumentKey] ? 'var(--accent-yellow)' : '#333', color: playbackConfig.round1[instrumentKey] ? 'black' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>1</div>
                <div onClick={() => toggleRoundSetting('round2', instrumentKey)} style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: playbackConfig.round2[instrumentKey] ? 'var(--accent-yellow)' : '#333', color: playbackConfig.round2[instrumentKey] ? 'black' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>2</div>
            </div>

            {generatorMode !== 'presets' && (
                <>
                    <button onClick={() => cycleRandType(instrumentKey)} style={{ width: '100%', backgroundColor: '#222', color: 'white', border: '1px solid #444', fontSize: '10px', padding: '4px', borderRadius: '4px', cursor: 'pointer', textAlign: 'center' }}>
                        {getRandTypeLabel(randType[instrumentKey] || 'random')}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                        {instrumentKey === 'treble' && trebleSettings ? (
                            <>
                                <InvisibleButton label="-" onClick={() => handleTrebleChange('notesPerMeasure', Math.max(0, trebleSettings.notesPerMeasure - 1))} />
                                <span style={{ fontSize: '12px', minWidth: '15px', textAlign: 'center' }}>{trebleSettings.notesPerMeasure}</span>
                                <InvisibleButton label="+" onClick={() => handleTrebleChange('notesPerMeasure', Math.min(32, trebleSettings.notesPerMeasure + 1))} />
                            </>
                        ) : <span style={{ color: '#444' }}>-</span>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        {instrumentKey === 'treble' && trebleSettings ? (
                            <button onClick={cycleSmallestNote} style={{ backgroundColor: '#222', color: 'white', border: '1px solid #444', fontSize: '10px', padding: '2px', borderRadius: '4px', cursor: 'pointer', minWidth: '30px' }}>
                                {noteDenomLabels[trebleSettings.smallestNoteDenom] || '1/4'}
                            </button>
                        ) : <span style={{ color: '#444' }}>-</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                        {instrumentKey === 'treble' && trebleSettings ? (
                            <>
                                <InvisibleButton label="-" onClick={() => handleTrebleChange('rhythmVariability', Math.max(0, (trebleSettings.rhythmVariability || 30) - 10))} />
                                <span style={{ fontSize: '10px', minWidth: '20px', textAlign: 'center' }}>{trebleSettings.rhythmVariability}%</span>
                                <InvisibleButton label="+" onClick={() => handleTrebleChange('rhythmVariability', Math.min(100, (trebleSettings.rhythmVariability || 30) + 10))} />
                            </>
                        ) : <span style={{ color: '#444' }}>-</span>}
                    </div>
                </>
            )}
        </div>
    );

    const handleMeasureChange = (newValue) => {
        markCustom();
        setNumMeasures(Math.max(1, Math.min(30, newValue)));
    };

    const applyPreset = (presetName) => {
        if (setActivePreset) setActivePreset(presetName);
        if (presetName === 'default') {
            setPlaybackConfig(prev => ({
                ...prev,
                randomize: { tonic: false, mode: false, family: false, melody: true },
                repsPerMelody: 2,
                round1: { treble: true, bass: true, percussion: true, metronome: true },
                round2: { treble: true, bass: false, percussion: false, metronome: false }
            }));
            setNumMeasures(2);
            if (setTrebleSettings) setTrebleSettings(prev => ({ ...prev, notesPerMeasure: 2, smallestNoteDenom: 4, rhythmVariability: 30, randomizationRules: 'uniform' }));
        } else if (presetName === 'transposition') {
            setPlaybackConfig(prev => ({ ...prev, randomize: { tonic: true, mode: false, family: false, melody: false } }));
        } else if (presetName === 'scales') {
            setPlaybackConfig(prev => ({ ...prev, randomize: { tonic: true, mode: true, family: false, melody: false } }));
            setNumMeasures(2);
            if (setTrebleSettings) setTrebleSettings(prev => ({ ...prev, rhythmVariability: 0, randomizationRules: 'scale', notesPerMeasure: 4 }));
            setRandType(prev => ({ ...prev, treble: 'scale' }));
        }
    };

    return (
        <div style={{ padding: '0px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#222', padding: '4px 12px', borderRadius: '20px' }}>
                    <span style={{ fontSize: '10px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase' }}>Repeats</span>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <InvisibleButton label="-" onClick={() => handleRepsChange(playbackConfig.repsPerMelody - 1)} />
                        <span style={{ fontSize: '14px', fontWeight: 'bold', minWidth: '18px', textAlign: 'center', color: 'var(--accent-yellow)' }}>{playbackConfig.repsPerMelody}</span>
                        <InvisibleButton label="+" onClick={() => handleRepsChange(playbackConfig.repsPerMelody + 1)} />
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                <GeneratorToggle label="Presets" value="presets" />
                <GeneratorToggle label="Advanced" value="d" />
                <GeneratorToggle label="Chords" value="c" />
                <GeneratorToggle label="Custom" value="u" />
            </div>

            {generatorMode === 'presets' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button onClick={() => applyPreset('default')} style={{ padding: '10px', backgroundColor: activePreset === 'default' ? 'var(--accent-yellow)' : '#333', color: activePreset === 'default' ? 'black' : 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}>
                        <div style={{ fontWeight: 'bold' }}>Default</div>
                        <div style={{ fontSize: '10px', color: activePreset === 'default' ? '#333' : '#888' }}>Standard settings.</div>
                    </button>
                    <button onClick={() => applyPreset('transposition')} style={{ padding: '10px', backgroundColor: activePreset === 'transposition' ? 'var(--accent-yellow)' : '#333', color: activePreset === 'transposition' ? 'black' : 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}>
                        <div style={{ fontWeight: 'bold' }}>Transposition</div>
                        <div style={{ fontSize: '10px', color: activePreset === 'transposition' ? '#333' : '#888' }}>Random Tonic. Fixed Melody.</div>
                    </button>
                    <button onClick={() => applyPreset('scales')} style={{ padding: '10px', backgroundColor: activePreset === 'scales' ? 'var(--accent-yellow)' : '#333', color: activePreset === 'scales' ? 'black' : 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}>
                        <div style={{ fontWeight: 'bold' }}>Scales</div>
                        <div style={{ fontSize: '10px', color: activePreset === 'scales' ? '#333' : '#888' }}>Practice scales (2 measures).</div>
                    </button>
                    <button onClick={() => setGeneratorMode('d')} style={{ padding: '10px', backgroundColor: activePreset === 'custom' ? 'var(--accent-yellow)' : '#333', color: activePreset === 'custom' ? 'black' : 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}>
                        <div style={{ fontWeight: 'bold' }}>Custom</div>
                        <div style={{ fontSize: '10px', color: activePreset === 'custom' ? '#333' : '#888' }}>Open advanced view.</div>
                    </button>
                </div>
            )}

            {generatorMode === 'd' && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#222', padding: '4px 8px', borderRadius: '4px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '11px', color: '#888' }}># MEASURES</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <InvisibleButton label="-" onClick={() => handleMeasureChange(numMeasures - 1)} />
                            <span style={{ minWidth: '20px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>{numMeasures}</span>
                            <InvisibleButton label="+" onClick={() => handleMeasureChange(numMeasures + 1)} />
                        </div>
                    </div>

                    <div style={{ width: '100%', textAlign: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '10px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Randomization</span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', marginTop: '0px' }}>
                        <SmartToggle label="TONIC" value={activeScale?.tonic} state={playbackConfig.randomize.tonic} onToggle={handleTonicToggle} />
                        <SmartToggle label="MODE" value={activeScale?.modeName || activeScale?.name} state={playbackConfig.randomize.mode} onToggle={handleModeToggle} disabled={isModeDisabled || isModeRandomForced} />
                        <SmartToggle label="FAMILY" value={displayFamily} state={playbackConfig.randomize.family} onToggle={handleFamilyToggle} />
                        <SmartToggle label="MELODY" value="Fix" state={playbackConfig.randomize.melody} onToggle={handleMelodyToggle} />
                    </div>

                    <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '10px 0' }} />
                </>
            )}

            {generatorMode !== 'presets' && (
                <div style={{ marginTop: '0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 0.8fr 1.2fr 1.2fr 1.2fr 1.2fr', gap: '4px', marginBottom: '8px', color: '#888', fontSize: '9px', fontWeight: '900', textAlign: 'center' }}>
                        <div style={{ textAlign: 'left' }}>INSTRUMENT</div>
                        <div>ROUNDS</div>
                        <>
                            <div>TYPE</div>
                            <div>NOTES / MEASURE</div>
                            <div>SMALLEST</div>
                            <div>VARIABILITY</div>
                        </>
                    </div>

                    <InstrumentRow label="Treble" glyph="&" instrumentKey="treble" />
                    <InstrumentRow label="Bass" glyph="?" instrumentKey="bass" />
                    <InstrumentRow label="PERCUSSION" glyph="/" instrumentKey="percussion" />
                    <InstrumentRow label="METRONOME" instrumentKey="metronome" />

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1.2fr 0.8fr 0.6fr 0.8fr', gap: '4px', marginTop: '8px', alignItems: 'center' }}>
                        <div></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlaybackSettings;
