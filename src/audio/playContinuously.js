
import playMelodies from './playMelodies';
import MelodyGenerator from '../components/generateMelody/melodyGenerator';

const playContinuously = async (
    abortControllerRef,
    bpm,
    timeSignature,
    numMeasures,
    context,
    trebleMelody,
    bassMelody,
    percussionMelody,
    metronomeMelody,
    scale,
    _bassScale,
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
    playbackConfig = {}
) => {
    try {
        const {
            totalMelodies = -1, // -1 is infinite
            repsPerMelody = 2,
            round1 = { treble: true, bass: true, percussion: true, metronome: false },
            round2 = { treble: false, bass: false, percussion: false, metronome: true }
        } = playbackConfig;

        const timeFactor = 5 / bpm;
        const measureLengthTicks = (48 * timeSignature[0]) / timeSignature[1];
        const iterationDuration = measureLengthTicks * numMeasures * timeFactor;

        const lookahead = Math.min(0.5, iterationDuration * 0.4);

        let nextStartTime = context.currentTime + 0.1;
        let melodyCount = 0; // How many different randomizations we've done
        let repCount = 0;    // How many reps we've done for the CURRENT melody
        let iteration = 0;   // Total iterations (rounds)

        let currentTreble = trebleMelody;
        let currentBass = bassMelody;
        let currentPercussion = percussionMelody;

        console.log(`Starting Playbook: Melodies=${totalMelodies === -1 ? '∞' : totalMelodies}, RepsPerMelody=${repsPerMelody}`);

        while (totalMelodies === -1 || melodyCount < totalMelodies) {
            // SAFE ABORT CHECK
            if (!abortControllerRef.current || abortControllerRef.current.signal.aborted) {
                console.log("Abort detected at loop start.");
                break;
            }

            const isRound1 = iteration % 2 === 0;
            const config = isRound1 ? round1 : round2;

            console.log(`[Melody ${melodyCount + 1}/${totalMelodies === -1 ? '∞' : totalMelodies}] [Rep ${repCount + 1}/${repsPerMelody}] [Round ${isRound1 ? 1 : 2}] @ ${nextStartTime.toFixed(3)}`);

            // 1. Prepare Playback
            const melodiesToPlay = [];
            const instrumentsToPlay = [];
            if (config.treble && currentTreble) { melodiesToPlay.push(currentTreble); instrumentsToPlay.push(trebleInstrument); }
            if (config.bass && currentBass) { melodiesToPlay.push(currentBass); instrumentsToPlay.push(bassInstrument); }
            if (config.percussion && currentPercussion) { melodiesToPlay.push(currentPercussion); instrumentsToPlay.push(percussionInstrument); }

            // 2. Schedule
            const allMelodiesToPlay = [...melodiesToPlay];
            const allInstrumentsToPlay = [...instrumentsToPlay];
            if (config.metronome && metronomeMelody) {
                allMelodiesToPlay.push(metronomeMelody);
                allInstrumentsToPlay.push(metronomeInstrument);
            }

            if (allMelodiesToPlay.length > 0) {
                playMelodies(allMelodiesToPlay, allInstrumentsToPlay, context, bpm, nextStartTime, abortControllerRef);
            }

            // 3. Wait for next round scheduling window
            const sleepUntil = nextStartTime + iterationDuration - lookahead;
            while (context.currentTime < sleepUntil) {
                if (!abortControllerRef.current || abortControllerRef.current.signal.aborted) break;
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            if (!abortControllerRef.current || abortControllerRef.current.signal.aborted) {
                console.log("Abort detected after sleep.");
                break;
            }

            // 4. Update Progress
            nextStartTime += iterationDuration;
            iteration++;

            if (iteration % 2 === 0) {
                repCount++;

                if (repCount >= repsPerMelody) {
                    melodyCount++;
                    repCount = 0;

                    if (totalMelodies === -1 || melodyCount < totalMelodies) {
                        console.log("Generating fresh melody for next set of repetitions...");
                        currentTreble = new MelodyGenerator(scale, numMeasures, timeSignature, trebleInstrumentSettings).generateMelody();
                        currentBass = new MelodyGenerator(scale.generateBassScale(), numMeasures, timeSignature, bassInstrumentSettings).generateMelody();
                        currentPercussion = new MelodyGenerator(percussionScale, numMeasures, timeSignature, percussionInstrumentSettings).generateMelody();

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
