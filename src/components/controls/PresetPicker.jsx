import React from 'react';
import { Check } from 'lucide-react';
import './styles/PresetPicker.css';

const PresetPicker = ({
    activePreset,
    setActivePreset,
    setPlaybackConfig,
    setNumMeasures,
    setTrebleSettings,
    setBassSettings,
    setPercussionSettings,
    setChordSettings,
    setNoteColoringMode,
    setShowChordLabels,
    setShowChordsOddRounds,
    setShowChordsEvenRounds,
    setBpm,
    isOpen,
    setIsOpen,
}) => {
    if (!isOpen) return null;

    const presets = [
        { id: 'practice_scales', label: 'PRACTICE SCALES' },
        { id: 'practice_listening', label: 'PRACTICE LISTENING' },
        { id: 'practice_reading', label: 'PRACTICE READING' },
        { id: 'improvise_treble', label: 'IMPROVISE TREBLE' },
        { id: 'improvise_bass', label: 'IMPROVISE BASS' },
        { id: 'improvise_2hands', label: 'IMPROVISE 2 HANDS' },
    ];

    const applyPreset = (id) => {
        setActivePreset(id);
        setIsOpen(false);

        if (id === 'practice_scales') {
            setPlaybackConfig(prev => ({
                ...prev,
                randomize: { tonic: true, mode: true, family: false, melody: false },
                repsPerMelody: 2,
                oddRounds: {
                    treble: 1, bass: 1, percussion: 1, chords: 1, metronome: 0, notes: true,
                    trebleEye: true, bassEye: true, percussionEye: 'metronome', chordsEye: true
                },
                evenRounds: {
                    treble: 1, bass: 0, percussion: 0, chords: 1, metronome: 1, notes: true,
                    trebleEye: true, bassEye: false, percussionEye: false, chordsEye: true
                },
            }));
            setNumMeasures(2);
            setTrebleSettings(prev => ({
                ...prev,
                rhythmVariability: 0,
                notePool: 'scale',
                randomizationRule: 'uniform',
                notesPerMeasure: 4,
            }));
        } else if (id === 'practice_listening') {
            setBpm(80);
            setNoteColoringMode('chromatone');
            setShowChordLabels(false);
            setPlaybackConfig({
                repsPerMelody: 2,
                oddRounds: {
                    treble: 1, bass: 1, percussion: 0, chords: 0, metronome: 0.4, notes: true,
                    trebleEye: true, bassEye: true, percussionEye: 'metronome', chordsEye: false
                },
                evenRounds: {
                    treble: 0, bass: 0, percussion: 0, chords: 0, metronome: 1, notes: true,
                    trebleEye: false, bassEye: false, percussionEye: false, chordsEye: false
                },
                randomize: { tonic: false, mode: false, family: false, melody: true, chords: false },
                totalMelodies: -1,
                chordComplexity: 'triad',
            });
        } else if (id === 'practice_reading') {
            setPlaybackConfig(prev => ({
                ...prev,
                randomize: { tonic: true, mode: false, family: false, melody: true },
            }));
        } else if (id === 'improvise_treble') {
            setPlaybackConfig(prev => ({
                ...prev,
                randomize: { ...prev.randomize, tonic: false, mode: false, family: false, melody: true },
                oddRounds: { ...prev.oddRounds, treble: 1, trebleEye: false }
            }));
        } else if (id === 'improvise_bass') {
            setPlaybackConfig(prev => ({
                ...prev,
                randomize: { ...prev.randomize, tonic: false, mode: false, family: false, melody: true },
                oddRounds: { ...prev.oddRounds, bass: 1, bassEye: false }
            }));
        } else if (id === 'improvise_2hands') {
            setPlaybackConfig(prev => ({
                ...prev,
                randomize: { ...prev.randomize, tonic: false, mode: false, family: false, melody: true },
                oddRounds: { ...prev.oddRounds, treble: 1, bass: 1, trebleEye: false, bassEye: false }
            }));
        }
    };

    return (
        <div className="pp-overlay" onClick={() => setIsOpen(false)}>
            <div className="pp-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="pp-title">SELECT PRESET</div>
                {presets.map((p) => (
                    <button
                        key={p.id}
                        onClick={() => applyPreset(p.id)}
                        className={`pp-btn${activePreset === p.id ? ' active' : ''}`}
                    >
                        {p.label}
                        {activePreset === p.id && <Check size={14} />}
                    </button>
                ))}
                <button onClick={() => setIsOpen(false)} className="pp-cancel">
                    Cancel
                </button>
            </div>
        </div>
    );
};

export default PresetPicker;
