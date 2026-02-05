// App.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { replacementsMap, standardizeTonic, getRelativeNoteName } from './components/generateMelody/convertToDisplayNotes';
import PianoView from './components/bottom/PianoView';
import TrebleSettings, { instrumentOptions } from './components/bottom/TrebleSettings';
import SheetMusic from './components/sheetmusic/SheetMusic';
import Scale from './model/Scale';
import playMelodies from './audio/playMelodies';
import './styles/App.css'
import ScaleSelector from "./components/scale/ScaleSelector";
import generateAllNotesArray from './utils/allNotesArray';
import { transposeMelodyToScale } from './utils/musicUtils';
import { formatScaleName } from './utils/scaleHandler';
import PlaybackSettings from "./components/bottom/PlaybackSettings";
import Sequencer from './audio/Sequencer';
import LayoutDebugOverlay from './components/debug/LayoutDebugOverlay';
import Melody from "./model/Melody";

// Hooks
import useWindowSize from './hooks/useWindowSize';
import useInstruments from './hooks/useInstruments';
import useMelodyState from './hooks/useMelodyState';

// Icons 
const MusicIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>;
const PlayIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
const ContinuousIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>;
const StopIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2" /></svg>;

const PianoIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20v-4" /><path d="M16 20v-4" /><path d="M2 18h20" /><path d="M2 20h20" /><path d="M2 4v16" /><path d="M22 4v16" /><path d="M4 10V4" /><path d="M8 10V4" /><path d="M12 10V4" /><path d="M16 10V4" /><path d="M20 10V4" /><path d="M4 10h16" /><path d="M8 20v-4" /></svg>;
const SetupIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
const PlayerIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><path d="M12 18V6" /><path d="M6 12h12" /></svg>;

const App = () => {
    const [context] = useState(() => new (window.AudioContext || window.webkitAudioContext)());
    const [activeTab, setActiveTab] = useState('piano');

    const [bpm, setBpm] = useState(120);
    const [timeSignature, setTimeSignature] = useState([4, 4]);
    const [numMeasures, setNumMeasures] = useState(2);
    const [scale, setScale] = useState(() => Scale.defaultScale('C4', 'Major'));
    const [scaleRange, setScaleRange] = useState(12);
    const [isPlayingContinuously, setIsPlayingContinuously] = useState(false);
    const [isPlayingScale, setIsPlayingScale] = useState(false);
    const [isPlayingMelody, setIsPlayingMelody] = useState(false);
    const [activeClef, setActiveClef] = useState('treble');

    // UI State persistence for Generator
    const [generatorMode, setGeneratorMode] = useState('presets');
    const [activePreset, setActivePreset] = useState('default');

    // Theme State
    const [theme, setTheme] = useState('default');
    const [customScaleLabel, setCustomScaleLabel] = useState(null);
    useEffect(() => {
        if (theme === 'default') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }, [theme]);



    // Re-generate melodies if settings change (and randomization is ON)
    useEffect(() => {
        if (!playbackConfig.randomize.melody) return; // Don't auto-regen if "Keep Melody" implies standard behavior, 
        // BUT the prompt says: "if melody is not selected... transposed". 
        // "if family randomization is active, melody must be active".

        // This useEffect was originally handling "Auto-generate on change".
        // Now we have specific "Randomize Next Set" toggles.
        // We only regenerate IF the specific toggle is ON *AND* the relevant property changed.
        // Actually, the user likely presses "Update" or it happens automatically on cycle?
        // In this app, usually melodies regen when parameters change.

        // Let's stick to the requested "Transposition" feature for now and leave existing auto-generation logic active 
        // if it exists, or rely on manual "Generate".
        // The existing code didn't have a big "Auto-Regen" effect other than initial.

    }, []); // Empty for now, relying on manual triggers or specific flows.   }

    const [tonic, setTonic] = useState('C4');
    const [selectedMode, setSelectedMode] = useState('Major');

    const [playbackConfig, setPlaybackConfig] = useState({
        repsPerMelody: 2,
        round1: { treble: true, bass: true, percussion: true, metronome: false },
        round2: { treble: false, bass: false, percussion: false, metronome: true },
        randomize: { tonic: false, mode: false, family: false, melody: true }
    });



    const percussionScale = Scale.defaultPercussionScale();
    const windowSize = useWindowSize();
    const { instruments, settings: instrumentSettingsHooks } = useInstruments(context);
    const instrumentsRef = useRef(instruments);
    useEffect(() => { instrumentsRef.current = instruments; }, [instruments]);

    const [trebleSettings, setTrebleSettings] = instrumentSettingsHooks.treble;
    const [bassSettings, setBassSettings] = instrumentSettingsHooks.bass;
    const [percussionSettings, setPercussionSettings] = instrumentSettingsHooks.percussion;

    const {
        melodies,
        setters: melodySetters,
        randomizeAll,
        randomizeMeasure
    } = useMelodyState(numMeasures, timeSignature, scale, percussionScale, trebleSettings, bassSettings, percussionSettings);

    const { treble: trebleMelody, bass: bassMelody, percussion: percussionMelody, metronome: metronomeMelody } = melodies;
    const { setTreble: setTrebleMelody, setBass: setBassMelody, setPercussion: setPercussionMelody, setMetronome: setMetronomeMelody } = melodySetters;

    // Track previous scale for transposition logic
    const prevScaleRef = useRef(scale);

    useEffect(() => {
        // Transposition Logic
        if (scale && prevScaleRef.current && scale !== prevScaleRef.current) {
            // Check if we should transpose (If Randomize Melody is OFF)
            if (playbackConfig && playbackConfig.randomize && !playbackConfig.randomize.melody) {
                const oldScaleNotes = prevScaleRef.current.notes;
                const newScaleNotes = scale.notes;
                const oldDisplayScale = prevScaleRef.current.displayScale;
                const newDisplayScale = scale.displayScale;

                // Transpose Treble
                if (trebleMelody && trebleMelody.notes) {
                    const newNotes = transposeMelodyToScale(trebleMelody.notes, oldScaleNotes, newScaleNotes);

                    // Generate new display notes from the NEW technical notes and NEW scale context
                    const newDisplay = newNotes.map(n => {
                        if (!n || ['k', 'c', 'b', 'hh', 's', '/'].includes(n)) return n;
                        const idx = newScaleNotes.indexOf(n);
                        if (idx !== -1) return newDisplayScale[idx];
                        // Fallback for chromatic notes
                        return getRelativeNoteName(n, scale.tonic);
                    });

                    setTrebleMelody(new Melody(newNotes, trebleMelody.durations, trebleMelody.timeStamps, newDisplay));
                }

                // Transpose Bass
                if (bassMelody && bassMelody.notes) {
                    const oldBassSc = prevScaleRef.current.generateBassScale();
                    const newBassSc = scale.generateBassScale();

                    const newBassNotes = transposeMelodyToScale(bassMelody.notes, oldBassSc.notes, newBassSc.notes);

                    const newBassDisplay = newBassNotes.map(n => {
                        if (!n || ['k', 'c', 'b', 'hh', 's', '/'].includes(n)) return n;
                        const idx = newBassSc.notes.indexOf(n);
                        if (idx !== -1) return newBassSc.displayScale[idx];
                        return getRelativeNoteName(n, newBassSc.tonic);
                    });

                    setBassMelody(new Melody(newBassNotes, bassMelody.durations, bassMelody.timeStamps, newBassDisplay));
                }
            }
        }
        prevScaleRef.current = scale;
    }, [scale, playbackConfig.randomize.melody, trebleMelody, bassMelody]);

    const bpmRef = useRef(bpm);
    const tsRef = useRef(timeSignature);
    const nmRef = useRef(numMeasures);
    const playbackTimeoutRef = useRef(null);
    const scaleRef = useRef(scale);
    const configRef = useRef(playbackConfig);
    const metronomeRef = useRef(metronomeMelody);
    const melodiesRef = useRef(melodies);

    const instrumentSettingsRef = useRef({
        treble: trebleSettings,
        bass: bassSettings,
        percussion: percussionSettings
    });

    useEffect(() => {
        instrumentSettingsRef.current = {
            treble: trebleSettings,
            bass: bassSettings,
            percussion: percussionSettings
        };
    }, [trebleSettings, bassSettings, percussionSettings]);

    const sequencerRef = useRef(null);
    useEffect(() => {
        if (!context || !instruments.treble) return;
        sequencerRef.current = new Sequencer({
            context,
            instruments,
            percussionScale,
            setters: {
                setTrebleMelody,
                setBassMelody,
                setPercussionMelody,
                setTonic: (v) => setTonic(v),
                setScale: (v) => setScale(v),
                onStop: () => setIsPlayingContinuously(false)
            },
            refs: { bpmRef, timeSignatureRef: tsRef, numMeasuresRef: nmRef, scaleRef, playbackConfigRef: configRef, metronomeRef, melodiesRef, instrumentSettingsRef }
        });
        return () => { if (sequencerRef.current) sequencerRef.current.stop(); };
    }, [context, !!instruments.treble]);

    const handleStopAllPlayback = () => {
        if (sequencerRef.current) sequencerRef.current.stop();
        const insts = instrumentsRef.current;
        if (insts) {
            insts.treble?.stop();
            insts.bass?.stop();
            insts.percussion?.stop();
            insts.metronome?.stop();
        }
        if (playbackTimeoutRef.current) {
            clearTimeout(playbackTimeoutRef.current);
            playbackTimeoutRef.current = null;
        }
        setIsPlayingContinuously(false);
        setIsPlayingScale(false);
        setIsPlayingMelody(false);
    };

    const handlePlayContinuously = () => {
        if (isPlayingContinuously) {
            handleStopAllPlayback();
            return;
        }
        if (context.state === 'suspended') context.resume();
        setIsPlayingContinuously(true);
        const initial = randomizeAll(playbackConfig.randomize);
        sequencerRef.current?.start(initial);
    };

    const handlePlayScale = async () => {
        if (isPlayingScale) {
            handleStopAllPlayback();
        } else {
            handleStopAllPlayback();
            setIsPlayingScale(true);
            try {
                // Returns maxEndTime (in audio context time)
                const endTime = await playMelodies([scale], [instruments.treble], context, bpm, context.currentTime);

                if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
                const durationMs = (endTime - context.currentTime) * 1000;
                // Add a small buffer or align exactly
                playbackTimeoutRef.current = setTimeout(() => {
                    setIsPlayingScale(false);
                    playbackTimeoutRef.current = null;
                }, durationMs);

            } catch (e) {
                console.error(e);
                setIsPlayingScale(false);
            }
        }
    };

    const handlePlayMelody = async () => {
        if (isPlayingMelody) {
            handleStopAllPlayback();
        } else {
            handleStopAllPlayback();
            setIsPlayingMelody(true);
            try {
                const endTime = await playMelodies(
                    [trebleMelody, bassMelody, percussionMelody],
                    [instruments.treble, instruments.bass, instruments.percussion],
                    context, bpm, context.currentTime
                );

                if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
                const durationMs = (endTime - context.currentTime) * 1000;

                playbackTimeoutRef.current = setTimeout(() => {
                    setIsPlayingMelody(false);
                    playbackTimeoutRef.current = null;
                }, durationMs);

            } catch (e) {
                console.error(e);
                setIsPlayingMelody(false);
            }
        }
    };

    useEffect(() => {
        const updatedMetronome = Melody.updateMetronome(timeSignature, numMeasures);
        setMetronomeMelody(updatedMetronome);
    }, [timeSignature, numMeasures]);

    const handleTimeSignatureChange = (type, value) => {
        if (type === 'incrementTop') setTimeSignature(p => [Math.min(32, p[0] + 1), p[1]]);
        else if (type === 'decrementTop') setTimeSignature(p => [Math.max(1, p[0] - 1), p[1]]);
        else if (type === 'cycleBottom') setTimeSignature(p => [p[0], p[1] === 16 ? 2 : p[1] * 2]);
        else if (type === 'cycleBottomBackward') setTimeSignature(p => [p[0], Math.max(2, p[1] / 2)]);
    };

    const handleNumMeasuresChange = (newNum) => {
        setNumMeasures(newNum);
    };

    return (
        <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--app-bg)', color: 'white', overflow: 'hidden', boxSizing: 'border-box', padding: '20px 0' }}>

            {/* TOP SECTION: SHEET MUSIC & PLAYBACK */}
            <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0 20px' }}>
                {/* Title */}
                <div style={{ width: '100%', textAlign: 'center', marginBottom: '4px', fontFamily: 'serif', fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    Melody in {formatScaleName(scale.tonic, scale.name, scale.family, customScaleLabel)}
                </div>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', width: '100%', justifyContent: 'flex-start', alignItems: 'center' }}>
                    <SheetMusic
                        timeSignature={timeSignature}
                        onTimeSignatureChange={handleTimeSignatureChange}
                        bpm={bpm}
                        onBpmChange={setBpm}
                        trebleMelody={trebleMelody}
                        bassMelody={bassMelody}
                        percussionMelody={percussionMelody}
                        numAccidentals={scale.numAccidentals}
                        screenWidth={windowSize.width}
                        onRandomizeMeasure={randomizeMeasure}
                    />
                </div>

                {/* PLAYBACK CONTROLS */}
                <div style={{ padding: '0 0 4px', display: 'flex', gap: '2px', justifyContent: 'center', backgroundColor: 'var(--app-bg)', width: '100%' }}>
                    <button className={`tab-button ${isPlayingScale ? 'active' : ''}`} onClick={handlePlayScale} style={{ minWidth: '65px' }}>
                        {isPlayingScale ? <StopIcon /> : <MusicIcon />}
                        <span className="tab-label">Scale</span>
                    </button>
                    <button className={`tab-button ${isPlayingMelody ? 'active' : ''}`} onClick={handlePlayMelody} style={{ minWidth: '65px' }}>
                        {isPlayingMelody ? <StopIcon /> : <PlayIcon />}
                        <span className="tab-label">Melody</span>
                    </button>
                    <button className={`tab-button ${isPlayingContinuously ? 'active' : ''}`} onClick={handlePlayContinuously} style={{ minWidth: '65px' }}>
                        {isPlayingContinuously ? <StopIcon /> : <ContinuousIcon />}
                        <span className="tab-label">Continuous</span>
                    </button>
                </div>
            </div>

            {/* BOTTOM SECTION: PANEL */}
            <div style={{
                height: '56vh',
                backgroundColor: 'var(--panel-bg)',
                borderRadius: '24px 24px 0 0',
                display: 'flex',
                flexDirection: 'column',
                borderTop: '1px solid #333',
                overflow: 'hidden'
            }}>
                {/* MENU SELECTOR */}
                <div style={{ height: '54px', flexShrink: 0, borderBottom: '1px solid #333', display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center', padding: '0 20px' }}>
                    <button className={`tab-button ${activeTab === 'piano' ? 'active' : ''}`} onClick={() => setActiveTab('piano')} style={{ minWidth: '65px' }}>
                        <PianoIcon /><span className="tab-label">Keys</span>
                    </button>
                    <button className={`tab-button ${activeTab === 'scale' ? 'active' : ''}`} onClick={() => setActiveTab('scale')} style={{ minWidth: '65px' }}>
                        <MusicIcon /><span className="tab-label">PICK SCALE</span>
                    </button>
                    <button className={`tab-button ${activeTab === 'playback' ? 'active' : ''}`} onClick={() => setActiveTab('playback')} style={{ minWidth: '65px' }}>
                        <ContinuousIcon /><span className="tab-label">GENERATOR</span>
                    </button>
                    <button className={`tab-button ${activeTab === 'treble' ? 'active' : ''}`} onClick={() => setActiveTab('treble')} style={{ minWidth: '65px' }}>
                        <SetupIcon /><span className="tab-label">Setup</span>
                    </button>
                </div>

                {/* CONTENT AREA */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
                    {activeTab === 'piano' && (
                        <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '10px' }}>
                            {/* Header with Clef Toggle and Instrument Selector */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div
                                    onClick={() => setActiveClef(activeClef === 'treble' ? 'bass' : 'treble')}
                                    style={{
                                        width: '44px', height: '56px', backgroundColor: 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', fontFamily: 'Maestro', fontSize: '32px', color: 'white',
                                        userSelect: 'none'
                                    }}
                                >
                                    {activeClef === 'treble' ? (
                                        <span>&</span>
                                    ) : (
                                        <span style={{ transform: 'translateY(-8px)' }}>?</span>
                                    )}
                                </div>

                                <select
                                    value={Object.keys(instrumentOptions).find(key => instrumentOptions[key] === (activeClef === 'treble' ? trebleSettings.instrument : bassSettings.instrument)) || 'Acoustic Grand Piano'}
                                    onChange={(e) => {
                                        const slug = instrumentOptions[e.target.value];
                                        if (activeClef === 'treble') setTrebleSettings(p => ({ ...p, instrument: slug }));
                                        else setBassSettings(p => ({ ...p, instrument: slug }));
                                    }}
                                    style={{
                                        flex: 1, height: '32px', backgroundColor: '#222', color: 'white',
                                        border: '1px solid #444', borderRadius: '4px', padding: '0 8px', fontSize: '12px'
                                    }}
                                >
                                    {Object.keys(instrumentOptions).map(name => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>

                            {instruments.treble ? (
                                <PianoView
                                    scale={scale}
                                    trebleInstrument={activeClef === 'treble' ? instruments.treble : instruments.bass}
                                    activeClef={activeClef}
                                />
                            ) : <div style={{ padding: '20px', color: '#888' }}>Waking up instruments...</div>}
                        </div>
                    )}
                    {activeTab === 'treble' && <TrebleSettings trebleInstrumentSettings={trebleSettings} setTrebleInstrumentSettings={setTrebleSettings} bassSettings={bassSettings} setBassSettings={setBassSettings} currentTheme={theme} setTheme={setTheme} />}
                    {activeTab === 'scale' && <ScaleSelector trebleInstrument={instruments.treble} windowSize={windowSize} scale={scale} scaleRange={scaleRange} setTonic={setTonic} setScale={setScale} setSelectedMode={setSelectedMode} customScaleLabel={customScaleLabel} setCustomScaleLabel={setCustomScaleLabel} />}
                    {activeTab === 'playback' &&
                        <PlaybackSettings
                            numMeasures={numMeasures}
                            setNumMeasures={handleNumMeasuresChange}
                            playbackConfig={playbackConfig}
                            setPlaybackConfig={setPlaybackConfig}
                            trebleSettings={trebleSettings}
                            setTrebleSettings={setTrebleSettings}
                            bassSettings={bassSettings}
                            setBassSettings={setBassSettings}
                            percussionSettings={percussionSettings}
                            setPercussionSettings={setPercussionSettings}
                            activeScale={scale}
                            generatorMode={generatorMode}
                            setGeneratorMode={setGeneratorMode}
                            activePreset={activePreset}
                            setActivePreset={setActivePreset}
                        />
                    }
                </div>
            </div>

            {/* Debug Overlay - Remove this when done debugging */}
            <LayoutDebugOverlay />
        </div>
    );
};

export default App;
