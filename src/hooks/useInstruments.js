
import { useState, useEffect } from 'react';
import { Soundfont, Reverb, DrumMachine, CacheStorage } from 'smplr';
import InstrumentSettings from '../model/InstrumentSettings';

const useInstruments = (context) => {
    // Settings
    const [trebleSettings, setTrebleSettings] = useState(InstrumentSettings.defaultTrebleInstrumentSettings());
    const [bassSettings, setBassSettings] = useState(InstrumentSettings.defaultBassInstrumentSettings());
    const [percussionSettings, setPercussionSettings] = useState(InstrumentSettings.defaultPercussionInstrumentSettings());
    const [metronomeSettings, setMetronomeSettings] = useState(InstrumentSettings.defaultMetronomeInstrumentSettings());

    // Instances
    const [treble, setTreble] = useState(null);
    const [bass, setBass] = useState(null);
    const [percussion, setPercussion] = useState(null);
    const [metronome, setMetronome] = useState(null);

    useEffect(() => {
        if (!context) return;

        const storage = new CacheStorage();
        const reverb = new Reverb(context);

        const trebleInst = new Soundfont(context, { instrument: trebleSettings.instrument, storage });
        trebleInst.output.addEffect('reverb', reverb, 0.1);
        setTreble(trebleInst);

        const bassInst = new Soundfont(context, { instrument: bassSettings.instrument, storage });
        setBass(bassInst);

        const percussionInst = new DrumMachine(context, { instrument: percussionSettings.instrument, storage });
        setPercussion(percussionInst);

        const metronomeInst = new Soundfont(context, { instrument: metronomeSettings.instrument, storage });
        setMetronome(metronomeInst);

    }, [context, trebleSettings, bassSettings, percussionSettings, metronomeSettings]);

    return {
        instruments: { treble, bass, percussion, metronome },
        settings: {
            treble: [trebleSettings, setTrebleSettings],
            bass: [bassSettings, setBassSettings],
            percussion: [percussionSettings, setPercussionSettings],
            metronome: [metronomeSettings, setMetronomeSettings]
        }
    };
};

export default useInstruments;
