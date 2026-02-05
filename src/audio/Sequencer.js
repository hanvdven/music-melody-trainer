
import playMelodies from './playMelodies';
import { transposeMelodyToScale } from '../utils/musicUtils';
import Melody from '../model/Melody';
import MelodyGenerator from '../components/generateMelody/melodyGenerator';
import { randomTonic, randomMode, scaleDefinitions, updateScaleWithTonic, updateScaleWithMode } from '../utils/scaleHandler';

class Sequencer {
    constructor(config) {
        this.abortController = null;
        this.isPlaying = false;

        // Hooks / Callbacks
        this.setters = config.setters; // { setTreble, setBass, setPercussion, setTonic, setScale }
        this.refs = config.refs;       // { bpmRef, timeSignatureRef, numMeasuresRef, scaleRef, playbackConfigRef }
        this.instruments = config.instruments;
        this.context = config.context;
        this.percussionScale = config.percussionScale;
    }

    async start(initialMelodies) {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.abortController = new AbortController();

        let { treble, bass, percussion } = initialMelodies;
        let nextStartTime = this.context.currentTime + 0.1;
        let melodyCount = 0;
        let repCount = 0;
        let iteration = 0;

        try {
            while (this.isPlaying && (this.refs.playbackConfigRef.current.totalMelodies === -1 || melodyCount < this.refs.playbackConfigRef.current.totalMelodies)) {
                if (this.abortController.signal.aborted) break;

                const currentTS = this.refs.timeSignatureRef.current;
                const currentNumMeasures = this.refs.numMeasuresRef.current;
                const measureLengthTicks = (48 * currentTS[0]) / currentTS[1];
                const repsPerMelody = this.refs.playbackConfigRef.current.repsPerMelody;
                const isRound1 = iteration % 2 === 0;

                for (let m = 0; m < currentNumMeasures; m++) {
                    const currentBpm = this.refs.bpmRef.current;
                    const activeConfig = isRound1 ? this.refs.playbackConfigRef.current.round1 : this.refs.playbackConfigRef.current.round2;
                    const timeFactor = 5 / currentBpm;
                    const measureDuration = measureLengthTicks * timeFactor;
                    const lookahead = measureDuration * 0.5;

                    const melodiesToPlay = [];
                    const instrumentsToPlay = [];
                    if (activeConfig.treble && treble) { melodiesToPlay.push(treble); instrumentsToPlay.push(this.instruments.treble); }
                    if (activeConfig.bass && bass) { melodiesToPlay.push(bass); instrumentsToPlay.push(this.instruments.bass); }
                    if (activeConfig.percussion && percussion) { melodiesToPlay.push(percussion); instrumentsToPlay.push(this.instruments.percussion); }

                    const metronomeMelody = this.refs.metronomeRef.current;

                    if (activeConfig.metronome && metronomeMelody) {
                        melodiesToPlay.push(metronomeMelody);
                        instrumentsToPlay.push(this.instruments.metronome);
                    }

                    if (melodiesToPlay.length > 0) {
                        playMelodies(
                            melodiesToPlay,
                            instrumentsToPlay,
                            this.context,
                            currentBpm,
                            nextStartTime,
                            { current: this.abortController },
                            [m * measureLengthTicks, (m + 1) * measureLengthTicks]
                        );
                    }

                    const sleepUntil = nextStartTime + measureDuration - lookahead;
                    while (this.context.currentTime < sleepUntil) {
                        if (this.abortController.signal.aborted) break;
                        await new Promise(r => setTimeout(r, 50));
                    }
                    if (this.abortController.signal.aborted) break;

                    nextStartTime += measureDuration;
                }

                if (this.abortController.signal.aborted) break;

                iteration++;
                if (iteration % 2 === 0) {
                    repCount++;
                    if (repCount >= repsPerMelody) {
                        melodyCount++;
                        repCount = 0;

                        if (this.refs.playbackConfigRef.current.totalMelodies === -1 || melodyCount < this.refs.playbackConfigRef.current.totalMelodies) {
                            // Sync with latest manual changes if available
                            if (this.refs.melodiesRef && this.refs.melodiesRef.current) {
                                const current = this.refs.melodiesRef.current;
                                if (current.treble) treble = current.treble;
                                if (current.bass) bass = current.bass;
                                if (current.percussion) percussion = current.percussion;
                            }

                            const result = this.randomizeScaleAndGenerate(currentNumMeasures, currentTS, { treble, bass, percussion });
                            treble = result.treble;
                            bass = result.bass;
                            percussion = result.percussion;
                        }
                    }
                }
            }
        } finally {
            this.stop();
        }
    }

    randomizeScaleAndGenerate(numMeasures, timeSignature, currentMelodies = {}) {
        let activeScale = this.refs.scaleRef.current;
        const oldScaleNotes = activeScale.notes;
        const oldDisplayScale = activeScale.displayScale;

        const randConfig = this.refs.playbackConfigRef.current.randomize || {};

        if (randConfig.tonic) {
            const newTonic = randomTonic(); // randomTonic already includes octave (e.g. "C4")
            this.setters.setTonic(newTonic);
            activeScale = updateScaleWithTonic({
                currentScale: activeScale,
                newTonic,
                rangeUp: activeScale.rangeUp,
                rangeDown: activeScale.rangeDown
            });
            this.setters.setScale(activeScale);
        }

        if (randConfig.family) {
            let potentialFamilies = Object.keys(scaleDefinitions);
            if (randConfig.family === 'hepta') {
                potentialFamilies = ['Diatonic', 'Melodic', 'Harmonic Minor', 'Harmonic Major', 'Double Harmonic', 'Other Heptatonic'];
            }
            const newFamily = potentialFamilies[Math.floor(Math.random() * potentialFamilies.length)];
            const modesInFamily = scaleDefinitions[newFamily];
            const modeDef = modesInFamily[Math.floor(Math.random() * modesInFamily.length)];
            const newMode = modeDef.index ? `${modeDef.index}. ${modeDef.wheelName || modeDef.name}` : (modeDef.wheelName || modeDef.name);
            activeScale = updateScaleWithMode({
                currentScale: activeScale,
                newFamily,
                newMode,
                rangeUp: activeScale.rangeUp,
                rangeDown: activeScale.rangeDown
            });
            this.setters.setScale(activeScale);
        } else if (randConfig.mode) {
            // FIX: If family is FIXED, only randomize within the current family!
            // Do NOT use randomizationFamily definitions from scaleHandler if it results in family hoping.
            const modesInFamily = scaleDefinitions[activeScale.family] || [];
            if (modesInFamily.length > 0) {
                const modeDef = modesInFamily[Math.floor(Math.random() * modesInFamily.length)];
                const newMode = modeDef.index ? `${modeDef.index}. ${modeDef.wheelName || modeDef.name}` : (modeDef.wheelName || modeDef.name);
                activeScale = updateScaleWithMode({
                    currentScale: activeScale,
                    newFamily: activeScale.family,
                    newMode,
                    rangeUp: activeScale.rangeUp,
                    rangeDown: activeScale.rangeDown
                });
                this.setters.setScale(activeScale);
            }
        }

        let newTreble, newBass, newPercussion;

        if (randConfig.melody === false) {
            // Transpose
            if (currentMelodies.treble) {
                const transposedNotes = transposeMelodyToScale(currentMelodies.treble.notes, oldScaleNotes, activeScale.notes);
                const currentDisplay = currentMelodies.treble.displayNotes || currentMelodies.treble.notes;
                const transposedDisplay = transposeMelodyToScale(currentDisplay, oldDisplayScale, activeScale.displayScale);
                newTreble = new Melody(transposedNotes, currentMelodies.treble.durations, currentMelodies.treble.timeStamps, transposedDisplay);
            } else {
                newTreble = null;
            }

            if (currentMelodies.bass) {
                const lowerOctave = note => {
                    const match = note.match(/([^0-9]+)(\d+)/);
                    if (!match) return note;
                    return match[1] + (parseInt(match[2]) - 1);
                };
                const oldBassNotes = oldScaleNotes.map(lowerOctave);
                const oldBassDisplay = oldDisplayScale.map(lowerOctave);
                const newBassNotes = activeScale.notes.map(lowerOctave);
                const newBassDisplay = activeScale.displayScale.map(lowerOctave);
                const transposedNotes = transposeMelodyToScale(currentMelodies.bass.notes, oldBassNotes, newBassNotes);
                const currentDisplay = currentMelodies.bass.displayNotes || currentMelodies.bass.notes;
                const transposedDisplay = transposeMelodyToScale(currentDisplay, oldBassDisplay, newBassDisplay);
                newBass = new Melody(transposedNotes, currentMelodies.bass.durations, currentMelodies.bass.timeStamps, transposedDisplay);
            } else {
                newBass = null;
            }
            newPercussion = currentMelodies.percussion;
        } else {
            // Regenerate
            const instrumentSettings = this.refs.instrumentSettingsRef.current;
            newTreble = new MelodyGenerator(activeScale, numMeasures, timeSignature, instrumentSettings.treble).generateMelody();
            newBass = new MelodyGenerator(activeScale.generateBassScale(), numMeasures, timeSignature, instrumentSettings.bass).generateMelody();
            newPercussion = new MelodyGenerator(this.percussionScale, numMeasures, timeSignature, instrumentSettings.percussion).generateMelody();

            this.setters.setTrebleMelody(newTreble);
            this.setters.setBassMelody(newBass);
            this.setters.setPercussionMelody(newPercussion);
        }

        return { treble: newTreble, bass: newBass, percussion: newPercussion };
    }

    stop() {
        this.isPlaying = false;
        if (this.abortController) this.abortController.abort();

        this.instruments.treble?.stop();
        this.instruments.bass?.stop();
        this.instruments.percussion?.stop();
        this.instruments.metronome?.stop();

        if (this.setters.onStop) this.setters.onStop();
    }
}

export default Sequencer;
