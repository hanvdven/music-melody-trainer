
import { useState, useEffect } from 'react';
import Melody from '../model/Melody';
import MelodyGenerator from '../components/generateMelody/melodyGenerator';

const useMelodyState = (numMeasures, timeSignature, scale, percussionScale, trebleSettings, bassSettings, percussionSettings) => {
    const [treble, setTreble] = useState(Melody.defaultTrebleMelody());
    const [bass, setBass] = useState(Melody.defaultBassMelody());
    const [percussion, setPercussion] = useState(Melody.defaultPercussionMelody());
    const [metronome, setMetronome] = useState(Melody.defaultMetronomeMelody());

    // Update metronome when structure changes
    useEffect(() => {
        const updatedMetronome = Melody.updateMetronome(timeSignature, numMeasures);
        setMetronome(updatedMetronome);
    }, [timeSignature, numMeasures]);

    const randomizeAll = (randomizeConfig) => {
        // If Melody Randomization is OFF, do NOT regenerate melodies.
        // Return current state so the sequencer continues playing them (or effectively "cycles" without change).
        if (randomizeConfig && randomizeConfig.melody === false) {
            return { treble, bass, percussion };
        }

        const newTreble = new MelodyGenerator(scale, numMeasures, timeSignature, trebleSettings).generateMelody();
        const newBass = new MelodyGenerator(scale.generateBassScale(), numMeasures, timeSignature, bassSettings).generateMelody();
        const newPercussion = new MelodyGenerator(percussionScale, numMeasures, timeSignature, percussionSettings).generateMelody();

        setTreble(newTreble);
        setBass(newBass);
        setPercussion(newPercussion);

        return { treble: newTreble, bass: newBass, percussion: newPercussion };
    };

    const randomizeMeasure = (measureIndex, trackType) => {
        let generator;
        if (trackType === 'treble') {
            generator = new MelodyGenerator(scale, numMeasures, timeSignature, trebleSettings);
            const newMelody = generator.generateMelody();
            setTreble(newMelody);
        } else if (trackType === 'bass') {
            generator = new MelodyGenerator(scale.generateBassScale(), numMeasures, timeSignature, bassSettings);
            const newMelody = generator.generateMelody();
            setBass(newMelody);
        } else if (trackType === 'percussion') {
            generator = new MelodyGenerator(percussionScale, numMeasures, timeSignature, percussionSettings);
            const newMelody = generator.generateMelody();
            setPercussion(newMelody);
        }
    };

    return {
        melodies: { treble, bass, percussion, metronome },
        setters: {
            setTreble,
            setBass,
            setPercussion,
            setMetronome
        },
        randomizeAll,
        randomizeMeasure
    };
};

export default useMelodyState;
