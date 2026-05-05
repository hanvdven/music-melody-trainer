import { useState, useRef, useCallback, useEffect } from 'react';
import playMelodies from '../audio/playMelodies';
import logger from '../utils/logger';

const usePlayback = ({
    sequencerRef,
    instrumentsRef,
    context,
    bpm,
    scale,
    melodies, // Contains { treble, bass, percussion }
    instruments, // Contains { treble, bass, percussion } objects from useInstruments
    playbackConfig,
    randomizeAll, // Function to regenerate melodies (for continuous mode)
    instrumentSettings, // { treble, bass, percussion, chords, metronome }
    headerPlayMode,
    onPlaybackStart, // Callback when any playback mode starts
}) => {
    const [isPlayingContinuously, setIsPlayingContinuously] = useState(false);
    const [isPlayingScale, setIsPlayingScale] = useState(false);
    const [isPlayingMelody, setIsPlayingMelody] = useState(false);
    const [isOddRound, setIsOddRound] = useState(true);

    const playbackTimeoutRef = useRef(null);

    // Sync sequencer and UI states when headerPlayMode is toggled during playback
    useEffect(() => {
        const sequencer = sequencerRef.current;
        if (!sequencer || !sequencer.isPlaying) return;

        const nextOnce = headerPlayMode === 'once';

        // Sync sequencer internal mode
        sequencer.isOnceMode = nextOnce;

        // Sync UI states to highlight the correct playback button
        if (nextOnce && isPlayingContinuously) {
            setIsPlayingContinuously(false);
            setIsPlayingMelody(true);
        } else if (!nextOnce && isPlayingMelody) {
            setIsPlayingMelody(false);
            setIsPlayingContinuously(true);
        }
    }, [headerPlayMode, isPlayingMelody, isPlayingContinuously, sequencerRef]);

    // Stop all playback (Sequencer + One-shot melodies)
    const handleStopAllPlayback = useCallback(() => {
        if (sequencerRef.current) sequencerRef.current.stop();

        const insts = instrumentsRef.current || instruments;
        if (insts) {
            insts.treble?.stop();
            insts.bass?.stop();
        }

        if (playbackTimeoutRef.current) {
            clearTimeout(playbackTimeoutRef.current);
            playbackTimeoutRef.current = null;
        }

        // Reset visibility to 'odd' repeats and clear highlights when stopped
        if (sequencerRef.current && sequencerRef.current.setters) {
            const pc = playbackConfig || {};
            // If oddRounds.notes is unspecified, default is true
            if (sequencerRef.current.setters.setShowNotes) {
                sequencerRef.current.setters.setShowNotes(pc.oddRounds?.notes !== false);
            }
            if (sequencerRef.current.setters.setShowChordLabels) {
                sequencerRef.current.setters.setShowChordLabels(pc.oddRounds?.chords !== false);
            }
            if (sequencerRef.current.setters.clearActiveHighlight) {
                sequencerRef.current.setters.clearActiveHighlight();
            }
        }

        setIsPlayingContinuously(false);
        setIsPlayingScale(false);
        setIsPlayingMelody(false);
        setIsOddRound(true);
    }, [sequencerRef, instrumentsRef, instruments, playbackConfig]);

    const handlePlayContinuously = useCallback(async () => {
        if (isPlayingContinuously) {
            handleStopAllPlayback();
            return;
        }

        if (isPlayingMelody) {
            if (sequencerRef.current) sequencerRef.current.isOnceMode = false;
            setIsPlayingMelody(false);
            setIsPlayingContinuously(true);
            return;
        }

        handleStopAllPlayback();

        if (context.state !== 'running') {
            await context.resume();
        }

        if (onPlaybackStart) onPlaybackStart();
        setIsPlayingContinuously(true);

        const offset = melodies.globalMeasureOffset || 0;

        // Generate initial melodies for the sequencer
        let initial;
        try {
            initial = randomizeAll(playbackConfig.randomize);
        } catch (e) {
            logger.error('usePlayback', 'E007-RANDOMIZE-BEFORE-START', e);
            setIsPlayingContinuously(false);
            return;
        }

        try {
            // Start sequencer (don't await so UI remains responsive)
            sequencerRef.current?.start(initial, false, offset);
        } catch (e) {
            logger.error('usePlayback', 'E008-SEQUENCER-START', e);
            setIsPlayingContinuously(false);
        }
    }, [isPlayingContinuously, isPlayingMelody, handleStopAllPlayback, context, randomizeAll, playbackConfig.randomize, sequencerRef, onPlaybackStart, melodies.globalMeasureOffset]);

    const handlePlayScale = useCallback(async () => {
        if (isPlayingScale) {
            handleStopAllPlayback();
        } else {
            handleStopAllPlayback();
            if (onPlaybackStart) onPlaybackStart();
            setIsPlayingScale(true);
            try {
                const ctx = context;
                if (ctx.state !== 'running') {
                    await ctx.resume();
                }

                // Returns maxEndTime (in audio context time)
                const endTime = await playMelodies(
                    [{ ...scale.toMelody(), strummingEnabled: instrumentSettings?.treble?.strummingEnabled }],
                    [instruments.treble],
                    ctx,
                    bpm,
                    ctx.currentTime
                );

                if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
                const durationMs = (endTime - ctx.currentTime) * 1000;

                // Add a small buffer or align exactly
                playbackTimeoutRef.current = setTimeout(() => {
                    setIsPlayingScale(false);
                    playbackTimeoutRef.current = null;
                }, durationMs);
            } catch (e) {
                logger.error('usePlayback', 'E009-PLAY-SCALE', e);
                setIsPlayingScale(false);
            }
        }
    }, [isPlayingScale, handleStopAllPlayback, scale, instruments.treble, context, bpm, onPlaybackStart, instrumentSettings?.treble?.strummingEnabled]);

    const handlePlayMelody = useCallback(async () => {
        if (isPlayingMelody) {
            handleStopAllPlayback();
            return;
        }

        handleStopAllPlayback();
        if (onPlaybackStart) onPlaybackStart();
        setIsPlayingMelody(true);

        if (context.state !== 'running') {
            await context.resume();
        }

        try {
            const offset = melodies.globalMeasureOffset || 0;
            sequencerRef.current?.start(melodies, true, offset);
        } catch (e) {
            logger.error('usePlayback', 'E010-PLAY-MELODY', e);
            setIsPlayingMelody(false);
        }
    }, [isPlayingMelody, handleStopAllPlayback, melodies, context, sequencerRef, onPlaybackStart]);

    const startSequencer = useCallback((initial, once = false, offset = 0) => {
        sequencerRef.current?.start(initial, once, offset);
    }, [sequencerRef]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (playbackTimeoutRef.current) {
                clearTimeout(playbackTimeoutRef.current);
            }
        };
    }, []);

    return {
        isPlayingContinuously,
        isPlayingScale,
        isPlayingMelody,
        handlePlayContinuously,
        handlePlayScale,
        handlePlayMelody,
        handleStopAllPlayback,
        setIsPlayingContinuously,
        setIsPlayingScale,
        setIsPlayingMelody,
        isOddRound,
        setIsOddRound,
        startSequencer,
    };
};

export default usePlayback;
