
import { resolveNotePitch } from './playSound'

const playMelodies = (
  melodies,
  instruments,
  context,
  bpm,
  scheduledStart = context.currentTime,
  abortControllerRef = null
) => {
  const timeFactor = 5 / bpm;
  const safetyBuffer = 0.05;
  const adjustedStart = Math.max(scheduledStart, context.currentTime + safetyBuffer);

  // 1. Prepare and Resolve All Notes in advance
  const queue = [];
  for (let index = 0; index < melodies.length; index++) {
    const melody = melodies[index];
    if (!melody) continue;
    const { notes, durations, timeStamps } = melody;
    const instrument = instruments[index];
    if (!instrument) continue;

    for (let i = 0; i < notes.length; i++) {
      const pitch = resolveNotePitch(notes[i]);
      if (pitch !== null) {
        queue.push({
          pitch,
          instrument,
          time: adjustedStart + timeStamps[i] * timeFactor,
          duration: durations[i] * timeFactor
        });
      }
    }
  }

  // 2. Chronological sorting
  queue.sort((a, b) => a.time - b.time);

  // 3. Ultra-fast Scheduling Loop (minimal logic inside)
  const isAborted = () => !abortControllerRef?.current || abortControllerRef.current.signal.aborted;

  if (isAborted()) return;

  for (let i = 0; i < queue.length; i++) {
    // Intermittent abort check
    if (i % 20 === 0 && isAborted()) break;

    const item = queue[i];
    item.instrument.start({
      note: item.pitch,
      time: item.time,
      duration: item.duration
    });
  }
};

export default playMelodies;
