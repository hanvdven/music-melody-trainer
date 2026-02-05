
import playMelodies from './playMelodies';
import MelodyGenerator from '../components/generateMelody/melodyGenerator';
import { randomTonic, randomMode, randomScale, scaleDefinitions, updateScaleWithTonic, updateScaleWithMode } from '../utils/scaleHandler';

const playContinuously = async (
    abortControllerRef,
    bpmRef,
    timeSignatureRef,
    numMeasuresRef,
    context,
    trebleMelody,
    bassMelody,
    percussionMelody,
    metronomeMelody,
    scaleRef,
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
    setTonic,
    setScale,
    playbackConfigRef
) => {
    try {
        let nextStartTime = context.currentTime + 0.1;
        let melodyCount = 0; // How many different randomizations we've done
        let repCount = 0;    // How many reps we've done for the CURRENT melody
        let iteration = 0;   // Total iterations (rounds)

        let currentTreble = trebleMelody;
        let currentBass = bassMelody;
        let currentPercussion = percussionMelody;

        console.log(`Starting Live Sequencer...`);

        while (playbackConfigRef.current.totalMelodies === -1 || melodyCount < playbackConfigRef.current.totalMelodies) {
            // SAFE ABORT CHECK
            if (!abortControllerRef.current || abortControllerRef.current.signal.aborted) break;

            // Pick up structural parameters for THIS melody set
            const currentTS = timeSignatureRef.current;
            const currentNumMeasures = numMeasuresRef.current;
            const measureLengthTicks = (48 * currentTS[0]) / currentTS[1];

            const repsPerMelody = playbackConfigRef.current.repsPerMelody;
            const isRound1 = iteration % 2 === 0;

            for (let m = 0; m < currentNumMeasures; m++) {
                // Pick up latest BPM and Live Round Toggles at the start of every measure!
                const currentBpm = bpmRef.current;
                const activeConfig = isRound1 ? playbackConfigRef.current.round1 : playbackConfigRef.current.round2;

                const timeFactor = 5 / currentBpm;
                const measureDuration = measureLengthTicks * timeFactor;
                const lookahead = measureDuration * 0.5;

                console.log(`[M${melodyCount + 1}] [R${repCount + 1}] [Round ${isRound1 ? 1 : 2}] [Meas ${m + 1}/${currentNumMeasures}] @ BPM ${currentBpm}`);

                // 1. Prepare Playback for THIS measure
                const melodiesToPlay = [];
                const instrumentsToPlay = [];
                if (activeConfig.treble && currentTreble) { melodiesToPlay.push(currentTreble); instrumentsToPlay.push(trebleInstrument); }
                if (activeConfig.bass && currentBass) { melodiesToPlay.push(currentBass); instrumentsToPlay.push(bassInstrument); }
                if (activeConfig.percussion && currentPercussion) { melodiesToPlay.push(currentPercussion); instrumentsToPlay.push(percussionInstrument); }

                const allMelodiesToPlay = [...melodiesToPlay];
                const allInstrumentsToPlay = [...instrumentsToPlay];
                if (activeConfig.metronome && metronomeMelody) {
                    allMelodiesToPlay.push(metronomeMelody);
                    allInstrumentsToPlay.push(metronomeInstrument);
                }

                if (allMelodiesToPlay.length > 0) {
                    playMelodies(
                        allMelodiesToPlay,
                        allInstrumentsToPlay,
                        context,
                        currentBpm,
                        nextStartTime,
                        abortControllerRef,
                        [m * measureLengthTicks, (m + 1) * measureLengthTicks]
                    );
                }

                // 2. Wait for next measure scheduling window
                const sleepUntil = nextStartTime + measureDuration - lookahead;
                while (context.currentTime < sleepUntil) {
                    if (!abortControllerRef.current || abortControllerRef.current.signal.aborted) break;
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                if (!abortControllerRef.current || abortControllerRef.current.signal.aborted) break;

                nextStartTime += measureDuration;
            }

            if (!abortControllerRef.current || abortControllerRef.current.signal.aborted) break;

            // 4. Update Progress after completing a full set of measures
            iteration++;

            if (iteration % 2 === 0) {
                repCount++;

                if (repCount >= repsPerMelody) {
                    melodyCount++;
                    repCount = 0;

                    const totalM = playbackConfigRef.current.totalMelodies;
                    if (totalM === -1 || melodyCount < totalM) {
                        console.log("Generating fresh melody for next set of repetitions...");

                        let activeScale = scaleRef.current;
                        const randConfig = playbackConfigRef.current.randomize || {};

                        // TONIC RANDOMIZATION
                        if (randConfig.tonic) {
                            const newTonic = randomTonic();
                            setTonic(newTonic);
                            activeScale = updateScaleWithTonic({
                                currentScale: activeScale,
                                newTonic,
                                rangeUp: activeScale.rangeUp,
                                rangeDown: activeScale.rangeDown
                            });
                            setScale(activeScale);
                        }

                        // MODE / FAMILY RANDOMIZATION
                        if (randConfig.family) {
                            // Full random scale (Family + Mode)
                            const families = Object.keys(scaleDefinitions);
                            const newFamily = families[Math.floor(Math.random() * families.length)];
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
                            setScale(activeScale);
                        } else if (randConfig.mode) {
                            // Shift mode within SAME family
                            const currentFamily = activeScale.family;
                            const modesInFamily = scaleDefinitions[currentFamily];
                            const modeDef = modesInFamily[Math.floor(Math.random() * modesInFamily.length)];
                            const newMode = modeDef.index ? `${modeDef.index}. ${modeDef.wheelName || modeDef.name}` : (modeDef.wheelName || modeDef.name);

                            activeScale = updateScaleWithMode({
                                currentScale: activeScale,
                                newFamily: currentFamily,
                                newMode,
                                rangeUp: activeScale.rangeUp,
                                rangeDown: activeScale.rangeDown
                            });
                            setScale(activeScale);
                        }

                        const nextNumM = numMeasuresRef.current;
                        const nextTS = timeSignatureRef.current;

                        currentTreble = new MelodyGenerator(activeScale, nextNumM, nextTS, trebleInstrumentSettings).generateMelody();
                        currentBass = new MelodyGenerator(activeScale.generateBassScale(), nextNumM, nextTS, bassInstrumentSettings).generateMelody();
                        currentPercussion = new MelodyGenerator(percussionScale, nextNumM, nextTS, percussionInstrumentSettings).generateMelody();

                        setTrebleMelody(currentTreble);
                        setBassMelody(currentBass);
                        setPercussionMelody(currentPercussion);
                    }
                }
            }
        }

        console.log("Playback loop ended.");

    } catch (error) {
        console.error("Playback engine error:", error);
    } finally {
        trebleInstrument?.stop();
        bassInstrument?.stop();
        percussionInstrument?.stop();
        metronomeInstrument?.stop();
    }
};

export default playContinuously;
