import React from 'react';
import InstrumentRow from './rows/InstrumentRow';
import { MetronomeIcon } from '../common/CustomIcons';
import { SectionHeader, ColumnHeaders, BracketHeader } from './PlaybackSubComponents';
import { HarmonicSlider } from './DifficultyControls';
import { MELODY_DIFFICULTY_RANGE, calcTrebleDifficulty } from '../../utils/melodyDifficultyTable';
import { useInstrumentSettings } from '../../contexts/InstrumentSettingsContext';

const GRID_GENERATOR = '12% 18% 12% 22% 12% 12% 12%';
const GRID_VISIBILITY = '12% 22% 22% 22% 22%';

/**
 * Renders the "Instruments" and "Visibility & Audibility" sections of PlaybackSettings.
 * Instruments section: per-clef melody-difficulty sliders + InstrumentRow generator config.
 * Visibility section: per-clef show/hear toggles for odd & even repetitions.
 */
const PlaybackInstrumentSection = ({
    targetTrebleDifficulty, setTargetTrebleDifficulty,
    targetBassDifficulty, setTargetBassDifficulty,
    setActiveRandTypeSelector,
}) => {
    const { trebleSettings, setTrebleSettings, bassSettings, setBassSettings,
        percussionSettings, setPercussionSettings } = useInstrumentSettings();

    return (
        <>
            <SectionHeader label="Instruments" />

            {/* ── MELODY DIFFICULTY SLIDERS (treble + bass) ───────────────────── */}
            {[
                { key: 'treble', settings: trebleSettings, target: targetTrebleDifficulty, setTarget: setTargetTrebleDifficulty },
                { key: 'bass',   settings: bassSettings,   target: targetBassDifficulty,   setTarget: setTargetBassDifficulty   },
            ].map(({ key, settings, target, setTarget }) => (
                <div key={key} className="ps-diff-row" style={{ gridTemplateColumns: GRID_GENERATOR }}>
                    <div className="ps-diff-col-label">{key}</div>
                    <div className="ps-diff-col-slider">
                        <HarmonicSlider
                            min={MELODY_DIFFICULTY_RANGE.min}
                            max={MELODY_DIFFICULTY_RANGE.max}
                            target={target ?? MELODY_DIFFICULTY_RANGE.min}
                            actual={calcTrebleDifficulty(settings)}
                            disabled={false}
                            onChange={(e) => setTarget(parseInt(e.target.value, 10))}
                        />
                    </div>
                    <div className="ps-diff-col-value">{target != null ? target : '–'}</div>
                    <div className="ps-diff-col-clear">
                        {target != null && (
                            <button onClick={() => setTarget(null)} className="ps-clear-btn" title="Clear — return to manual">✕</button>
                        )}
                    </div>
                </div>
            ))}

            <ColumnHeaders
                gridConfig={GRID_GENERATOR}
                columns={['instrument', 'melody notes', 'randomization', 'melody', 'NOTES / MEASURE', 'SMALLEST NOTE', 'VARIABILITY']}
            />
            <InstrumentRow
                label="Treble"
                glyph="&"
                instrumentKey="treble"
                settings={trebleSettings}
                setSettings={setTrebleSettings}
                setActiveRandTypeSelector={setActiveRandTypeSelector}
                renderMode="instrument"
            />
            <InstrumentRow
                label="Bass"
                glyph="?"
                instrumentKey="bass"
                settings={bassSettings}
                setSettings={setBassSettings}
                setActiveRandTypeSelector={setActiveRandTypeSelector}
                renderMode="instrument"
            />
            <InstrumentRow
                label="Perc"
                glyph="/"
                instrumentKey="percussion"
                settings={percussionSettings}
                setSettings={setPercussionSettings}
                setActiveRandTypeSelector={setActiveRandTypeSelector}
                renderMode="instrument"
            />
            <div className="ps-section-gap" />

            {/* 4. VISIBILITY / AUDIBILITY BLOCK */}
            <SectionHeader label="Visibility & Audibility" />
            <div className="ps-vis-grid" style={{ gridTemplateColumns: GRID_VISIBILITY }}>
                <div className="ps-vis-clef-label">Clef</div>
                <div className="ps-vis-odd-header">
                    <BracketHeader label="ODD REPETITIONS" subLeft="VISIBLE" subRight="AUDIBLE" />
                </div>
                <div className="ps-vis-even-header">
                    <BracketHeader label="EVEN REPETITIONS" subLeft="VISIBLE" subRight="AUDIBLE" />
                </div>
            </div>

            <InstrumentRow label="Chords"    glyph="/"               instrumentKey="chords"     renderMode="visibility" />
            <InstrumentRow label="Treble"    glyph="&"               instrumentKey="treble"     renderMode="visibility" />
            <InstrumentRow label="Bass"      glyph="?"               instrumentKey="bass"       renderMode="visibility" />
            <InstrumentRow label="Perc"      glyph="/"               instrumentKey="percussion" renderMode="visibility" />
            <InstrumentRow label="Metronome" glyph={<MetronomeIcon />} instrumentKey="metronome"  renderMode="visibility" />
        </>
    );
};

export default PlaybackInstrumentSection;
