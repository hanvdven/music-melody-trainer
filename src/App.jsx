// App.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react'
import Melody from './model/Melody'
import PianoView from './components/bottom/PianoView';
import TrebleSettings from './components/bottom/TrebleSettings';
import SheetMusic from './components/sheetmusic/SheetMusic';
import Scale from './model/Scale';
import InstrumentSettings from './model/InstrumentSettings';
import playMelodies from './audio/playMelodies';
// import playContinuously from './audio/playContinuously';
import generateAllNotesArray from './utils/allNotesArray';
import { Soundfont, Reverb, DrumMachine, CacheStorage } from 'smplr';
import './styles/App.css'
import playContinuously from "./audio/playContinuously";
import ScaleSelector from "./components/scale/ScaleSelector";
import PlaybackSettings from "./components/bottom/PlaybackSettings";
import MelodyGenerator from './components/generateMelody/melodyGenerator';

const App = () => {
    // initialize audio context
    const [context] = useState(() => new (window.AudioContext || window.webkitAudioContext)());

    // 1️⃣ Notes & Scale
    const allNotesArray = useMemo(() => generateAllNotesArray(), []);
    const [scale, setScale] = useState(() => Scale.defaultScale('C4', 'Major'));
    const [selectedScaleType, setSelectedScaleType] = useState('Simple');
    const [selectedMode, setSelectedMode] = useState('Major');
    const [tonic, setTonic] = useState('C4');
    const [scaleRange, setScaleRange] = useState(12);

    const percussionScale = Scale.defaultPercussionScale();

    const [bpm, setBpm] = useState(120);
    const updateBpm = (newBpm) => {
        setBpm(newBpm);
    };
    const [timeSignature, setTimeSignature] = useState([4, 4]);
    const [numMeasures, setNumMeasures] = useState(2);

    // State Handlers
    const abortControllerRef = useRef(null);
    const [isPlayingContinuously, setIsPlayingContinuously] = useState(false);
    const [stopPlayback, setStopPlayback] = useState(false);
    const [activeTab, setActiveTab] = useState('piano');

    const [playbackConfig, setPlaybackConfig] = useState({
        totalMelodies: -1, // -1 is infinite
        repsPerMelody: 2,
        round1: { treble: true, bass: true, percussion: true, metronome: false },
        round2: { treble: false, bass: false, percussion: false, metronome: true }
    });


    // metronoom
    useEffect(() => {
        const updatedMetronome = Melody.updateMetronome(timeSignature, numMeasures);
        setMetronomeMelody(updatedMetronome);
    }, [timeSignature, numMeasures]);

    // 3️⃣ Audio & instrumenten setup

    // Instrument settings via useState
    const [trebleInstrumentSettings, setTrebleInstrumentSettings] = useState(
        InstrumentSettings.defaultTrebleInstrumentSettings()
    );
    const [bassInstrumentSettings, setBassInstrumentSettings] = useState(
        InstrumentSettings.defaultBassInstrumentSettings()
    );
    const [percussionInstrumentSettings, setPercussionInstrumentSettings] = useState(
        InstrumentSettings.defaultPercussionInstrumentSettings()
    );
    const [metronomeInstrumentSettings, setMetronomeInstrumentSettings] = useState(
        InstrumentSettings.defaultMetronomeInstrumentSettings()
    );

    // Instrumenten zelf: beginnen als null, vullen in useEffect
    const [trebleInstrument, setTrebleInstrument] = useState(null);
    const [bassInstrument, setBassInstrument] = useState(null);
    const [percussionInstrument, setPercussionInstrument] = useState(null);
    const [metronomeInstrument, setMetronomeInstrument] = useState(null);

    // Melodies
    const [trebleMelody, setTrebleMelody] = useState(Melody.defaultTrebleMelody());
    const [bassMelody, setBassMelody] = useState(Melody.defaultBassMelody());
    const [percussionMelody, setPercussionMelody] = useState(Melody.defaultPercussionMelody());
    const [metronomeMelody, setMetronomeMelody] = useState(Melody.defaultMetronomeMelody());

    // Audio initialisatie effect
    useEffect(() => {
        if (!context) return;

        const storage = new CacheStorage();
        const reverb = new Reverb(context);

        // Treble
        const trebleInst = new Soundfont(context, {
            instrument: trebleInstrumentSettings.instrument,
            storage,
        });
        trebleInst.output.addEffect('reverb', reverb, 0.1);
        setTrebleInstrument(trebleInst);

        // Bass
        const bassInst = new Soundfont(context, {
            instrument: bassInstrumentSettings.instrument,
            storage,
        });
        setBassInstrument(bassInst);

        // Percussion
        const percussionInst = new DrumMachine(context, {
            instrument: percussionInstrumentSettings.instrument,
            storage,
        });
        setPercussionInstrument(percussionInst);

        // Metronome
        const metronomeInst = new Soundfont(context, {
            instrument: metronomeInstrumentSettings.instrument,
            storage,
        });
        setMetronomeInstrument(metronomeInst);

    }, [
        context,
        trebleInstrumentSettings,
        bassInstrumentSettings,
        percussionInstrumentSettings,
        metronomeInstrumentSettings
    ]);

    //


    // 2️⃣ Window size for responsive piano
    const increaseRange = () => {
        setScaleRange(r => r + 1);
    };

    const decreaseRange = () => {
        setScaleRange(r => Math.max(5, r - 1));
    };

    const [windowSize, setWindowSize] = useState({
        width: window.innerWidth,
        height: window.innerHeight,
    });

    useEffect(() => {
        const handleResize = () => setWindowSize({
            width: window.innerWidth,
            height: window.innerHeight,
        });
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const pianoWidth = windowSize.width - 10;
    const pianoHeight = windowSize.height / 2 - 10;



    // play functions

    const playScale = async () => {
        handleStopAllPlayback();
        playMelodies(
            [scale],
            [trebleInstrument],
            context,
            bpm,
            context.currentTime
        );
    };

    const playAllMelodies = async () => {
        handleStopAllPlayback();

        // Randomize before playing
        const newTreble = new MelodyGenerator(scale, numMeasures, timeSignature, trebleInstrumentSettings).generateMelody();
        const newBass = new MelodyGenerator(scale.generateBassScale(), numMeasures, timeSignature, bassInstrumentSettings).generateMelody();
        const newPercussion = new MelodyGenerator(percussionScale, numMeasures, timeSignature, percussionInstrumentSettings).generateMelody();

        setTrebleMelody(newTreble);
        setBassMelody(newBass);
        setPercussionMelody(newPercussion);

        playMelodies(
            [newTreble, newBass, newPercussion],
            [trebleInstrument, bassInstrument, percussionInstrument],
            context,
            bpm,
            context.currentTime
        );
    };

    const handleStopAllPlayback = () => {
        setStopPlayback(true);
        // Instant stop on all instruments
        if (trebleInstrument) trebleInstrument.stop();
        if (bassInstrument) bassInstrument.stop();
        if (percussionInstrument) percussionInstrument.stop();
        if (metronomeInstrument) metronomeInstrument.stop();

        setIsPlayingContinuously(false);
        // Abort the controller to prevent NEW notes from being scheduled
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            // Don't nullify immediately, playContinuously needs to check the .aborted flag
        }
    };

    const handlePlayContinuously = () => {
        if (isPlayingContinuously) {
            handleStopAllPlayback();
        } else {
            setStopPlayback(false);
            setIsPlayingContinuously(true);
            abortControllerRef.current = new AbortController();

            // Always randomize before starting a new continuous session
            const newTreble = new MelodyGenerator(scale, numMeasures, timeSignature, trebleInstrumentSettings).generateMelody();
            const newBass = new MelodyGenerator(scale.generateBassScale(), numMeasures, timeSignature, bassInstrumentSettings).generateMelody();
            const newPercussion = new MelodyGenerator(percussionScale, numMeasures, timeSignature, percussionInstrumentSettings).generateMelody();

            setTrebleMelody(newTreble);
            setBassMelody(newBass);
            setPercussionMelody(newPercussion);

            playContinuously(
                abortControllerRef,
                bpm,
                timeSignature,
                numMeasures,
                context,
                newTreble, // Pass the FRESHLY generated melodies
                newBass,
                newPercussion,
                metronomeMelody,
                scale,
                scale.generateBassScale(),
                percussionScale,
                trebleInstrument,
                bassInstrument,
                percussionInstrument,
                metronomeInstrument,
                trebleInstrumentSettings,
                bassInstrumentSettings,
                percussionInstrumentSettings,
                metronomeInstrumentSettings,
                setTrebleMelody,
                setBassMelody,
                setPercussionMelody,
                playbackConfig
            ).finally(() => setIsPlayingContinuously(false));
        }
    };

    const handleTimeSignatureChange = (type, value) => {
        if (type === 'incrementTop') {
            setTimeSignature((prev) => [prev[0] < 32 ? prev[0] + 1 : 1, prev[1]]);
        } else if (type === 'decrementTop') {
            setTimeSignature((prev) => [prev[0] > 1 ? prev[0] - 1 : 32, prev[1]]);
        } else if (type === 'setTop') {
            const newTop = parseInt(value, 10);
            if (!isNaN(newTop) && newTop > 0 && newTop <= 32) {
                setTimeSignature((prev) => [newTop, prev[1]]);
            }
        } else if (type === 'cycleBottom') {
            setTimeSignature((prev) => {
                const newBottom = prev[1] === 2 ? 4 : prev[1] === 4 ? 8 : prev[1] === 8 ? 16 : 2;
                return [prev[0], newBottom];
            });
        } else if (type === 'cycleBottomBackward') {
            setTimeSignature((prev) => {
                const newBottom = prev[1] === 16 ? 8 : prev[1] === 8 ? 4 : prev[1] === 4 ? 2 : 16;
                return [prev[0], newBottom];
            });
        }
    };

    const handleRandomizeMeasure = (measureIndex, trackType) => {
        let setTargetMelody, settings, instrumentScale;

        if (trackType === 'treble') {
            setTargetMelody = setTrebleMelody;
            settings = trebleInstrumentSettings;
            instrumentScale = scale;
        } else if (trackType === 'bass') {
            setTargetMelody = setBassMelody;
            settings = bassInstrumentSettings;
            instrumentScale = scale.generateBassScale();
        } else if (trackType === 'percussion') {
            setTargetMelody = setPercussionMelody;
            settings = percussionInstrumentSettings;
            instrumentScale = percussionScale;
        }

        if (!setTargetMelody) return;

        // Generate FULL melody for the track
        const generator = new MelodyGenerator(
            instrumentScale,
            numMeasures, // Use global number of measures
            timeSignature,
            settings
        );

        const newMelody = generator.generateMelody();
        setTargetMelody(newMelody);
    };

    return (
        <div style={{ width: '100%', height: '95vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, padding: '20px', overflow: 'auto' }}>
                <h1>Piano Demo</h1>
                <div>
                    <strong>Scale:</strong> {scale.displayScale.join(', ')}
                </div>
            </div>

            {/* SHEET MUSIC */}
            <div
                style={{
                    height: '40%',
                    width: '100%',
                    backgroundColor: 'var(--app-bg)',
                    overflow: 'hidden',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                <SheetMusic
                    timeSignature={timeSignature}
                    onTimeSignatureChange={handleTimeSignatureChange}
                    bpm={bpm}
                    onBpmChange={updateBpm}
                    trebleMelody={trebleMelody}
                    bassMelody={bassMelody}
                    percussionMelody={percussionMelody}
                    numAccidentals={scale.numAccidentals}
                    screenWidth={windowSize.width}
                    onRandomizeMeasure={handleRandomizeMeasure}
                />
            </div>

            {/* Buttons tussen SheetMusic en PianoView */}
            <div style={{ display: 'flex', gap: '8px', margin: '12px 0', justifyContent: 'center' }}>
                <button onClick={playScale}>⏵ Scale</button>
                <button onClick={playAllMelodies}>⏵ Melody</button>
                <button onClick={handlePlayContinuously}>⏵ Continuously</button>
                <button onClick={handleStopAllPlayback}>⏹ </button>
            </div>

            {/* Menu Buttons above PianoView */}
            <div
                style={{
                    display: 'flex',
                    gap: '8px',
                    justifyContent: 'center',
                    marginBottom: '8px',
                }}
            >
                <button onClick={() => setActiveTab('piano')}>🎹</button>
                <button onClick={() => setActiveTab('treble')}>⚙️</button>
                <button onClick={() => setActiveTab('scale')}>Scale</button>
                <button onClick={() => setActiveTab('playback')}>Playback</button>
            </div>

            {/* Conditional rendering for PianoView / Scale Settings */}
            <div
                style={{
                    width: '100%',
                    height: '40%',
                    backgroundColor: 'var(--panel-bg)',
                }}
            >
                {activeTab === 'piano' && trebleInstrument && scale && (
                    <PianoView
                        scale={scale}
                        trebleInstrument={trebleInstrument}
                    />
                )}

                {activeTab === 'treble' && (
                    <TrebleSettings
                        trebleInstrumentSettings={trebleInstrumentSettings}
                        setTrebleInstrumentSettings={setTrebleInstrumentSettings}
                    />
                )}

                {activeTab === 'scale' && (
                    <ScaleSelector
                        trebleInstrument={trebleInstrument}
                        windowSize={windowSize}
                        scale={scale}
                        scaleRange={scaleRange}
                        setTonic={setTonic}
                        setScale={setScale}
                        setSelectedMode={setSelectedMode}
                    />
                )}

                {activeTab === 'playback' && (
                    <PlaybackSettings
                        numMeasures={numMeasures}
                        setNumMeasures={setNumMeasures}
                        playbackConfig={playbackConfig}
                        setPlaybackConfig={setPlaybackConfig}
                    />
                )}
            </div>

        </div>
    );
};

export default App;
