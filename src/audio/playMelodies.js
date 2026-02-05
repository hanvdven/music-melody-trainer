
import { resolveNotePitch } from './playSound'

const playMelodies = (
  melodies,
  instruments,
  context,
  bpm,
  scheduledStart = context.currentTime,
  abortControllerRef = null,
  tickRange = null // [minTick, maxTick]
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
      const timestamp = timeStamps[i];
      // Skip if outside desired range
      if (tickRange && (timestamp < tickRange[0] || timestamp >= tickRange[1])) continue;

      const pitch = resolveNotePitch(notes[i]);
      if (pitch !== null) {
        // Offset timing so it starts at adjustedStart for this specific measure/window
        const relativeTick = tickRange ? timestamp - tickRange[0] : timestamp;
        queue.push({
          pitch,
          instrument,
          time: adjustedStart + relativeTick * timeFactor,
          duration: durations[i] * timeFactor
        });
      }
    }
  }

  // 2. Chronological sorting
  queue.sort((a, b) => a.time - b.time);

  // 3. Ultra-fast Scheduling Loop (minimal logic inside)
  const isAborted = () => abortControllerRef?.current?.signal?.aborted;

  if (isAborted()) return 0;

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

  // Return the end time of the last note + its duration
  // Since queue is sorted by start time, we must check all to find max(end) or just iterate.
  // Actually, queue is sorted by start time. The last starting note isn't necessarily the last ending one (if short).
  // Calculate max end time.
  let maxEndTime = adjustedStart;
  for (const item of queue) {
    if (item.time + item.duration > maxEndTime) {
      maxEndTime = item.time + item.duration;
    }
  }
  return maxEndTime;
};

export default playMelodies;
