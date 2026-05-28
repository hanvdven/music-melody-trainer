import { usePlaybackTransport } from './PlaybackTransportContext';
import { useRoundState } from './RoundStateContext';
import { useTransitionOverlay } from './TransitionOverlayContext';

/**
 * Backwards-compat aggregator for the legacy `usePlaybackState()` hook.
 *
 * This context used to be a single Provider that lumped transport, round
 * state, and transition overlay state together. It was split into three
 * providers in May 2026 because the monolithic provider re-rendered every
 * consumer on every measure tick (isOddRound flip), invalidating the
 * MelodyNotesLayer / ChordLabelsLayer / PreviewOverlay React.memo caches
 * that we built around the heavy renderMelodyNotes / renderChordLabels
 * passes.
 *
 * New code should import the specific hook it needs:
 * - usePlaybackTransport() — { isPlaying, isPlayingContinuously }
 * - useRoundState() — { isOddRound, showNotes, inputTestState, ... }
 * - useTransitionOverlay() — { nextLayer, previewMelody }
 *
 * This aggregate hook stays so existing consumers (TabView, SheetMusic)
 * can migrate gradually. It returns the same shape as the old context
 * value object so callers don't have to change their destructuring.
 */
export const usePlaybackState = () => {
  const transport = usePlaybackTransport() ?? {};
  const round = useRoundState() ?? {};
  const overlay = useTransitionOverlay() ?? {};
  return { ...transport, ...round, ...overlay };
};

export default usePlaybackState;
