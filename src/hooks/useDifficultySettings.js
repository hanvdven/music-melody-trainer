import { useState, useEffect, useRef, useMemo } from 'react';
import { calcDifficulty } from '../utils/difficultyCalculator';
import { MELODY_DIFFICULTY_RANGE, calcTrebleDifficulty } from '../utils/melodyDifficultyTable';
import { HARMONY_DIFFICULTY_RANGE } from '../utils/harmonyTable';

/**
 * Manages the three target-difficulty sliders (harmonic, treble, bass),
 * their corresponding refs (read by the Sequencer), and the derived
 * `actualDifficulty` value shown in the debug panel.
 *
 * @param {{ scale, trebleSettings, bpm, playbackConfig }} params
 */
const useDifficultySettings = ({ scale, trebleSettings, bpm, playbackConfig }) => {
    const [difficultyLevel, setDifficultyLevel] = useState(5.0);
    const [difficultyProgression, setDifficultyProgression] = useState('stable');

    // Target harmonic difficulty set by the slider (null = manual / unset)
    const [targetHarmonicDifficulty, setTargetHarmonicDifficulty] = useState(null);
    const targetHarmonicDifficultyRef = useRef(null);
    useEffect(() => { targetHarmonicDifficultyRef.current = targetHarmonicDifficulty; }, [targetHarmonicDifficulty]);

    // Target treble melody difficulty set by the slider (null = manual / unset)
    const [targetTrebleDifficulty, setTargetTrebleDifficulty] = useState(null);
    const targetTrebleDifficultyRef = useRef(null);
    useEffect(() => { targetTrebleDifficultyRef.current = targetTrebleDifficulty; }, [targetTrebleDifficulty]);

    // Target bass melody difficulty set by the slider (null = manual / unset)
    const [targetBassDifficulty, setTargetBassDifficulty] = useState(null);
    const targetBassDifficultyRef = useRef(null);
    useEffect(() => { targetBassDifficultyRef.current = targetBassDifficulty; }, [targetBassDifficulty]);

    // Derived: actual difficulty of the current settings (shown in debug panel + score tracker)
    const actualDifficulty = useMemo(() => {
        const d = calcDifficulty(scale, trebleSettings, bpm, playbackConfig);
        const trebleScore = calcTrebleDifficulty(trebleSettings);
        const hRange = HARMONY_DIFFICULTY_RANGE;
        const harmNorm = hRange.max > hRange.min
            ? Math.max(0, Math.min(1, (d.harmonic.score - hRange.min) / (hRange.max - hRange.min)))
            : 0;
        const trebleNorm = MELODY_DIFFICULTY_RANGE.max > MELODY_DIFFICULTY_RANGE.min
            ? Math.max(0, Math.min(1, (trebleScore - MELODY_DIFFICULTY_RANGE.min) / (MELODY_DIFFICULTY_RANGE.max - MELODY_DIFFICULTY_RANGE.min)))
            : 0;
        return { ...d, multiplier: harmNorm + trebleNorm };
    }, [scale, trebleSettings, bpm, playbackConfig]);

    return {
        difficultyLevel, setDifficultyLevel,
        difficultyProgression, setDifficultyProgression,
        targetHarmonicDifficulty, setTargetHarmonicDifficulty, targetHarmonicDifficultyRef,
        targetTrebleDifficulty, setTargetTrebleDifficulty, targetTrebleDifficultyRef,
        targetBassDifficulty, setTargetBassDifficulty, targetBassDifficultyRef,
        actualDifficulty,
    };
};

export default useDifficultySettings;
