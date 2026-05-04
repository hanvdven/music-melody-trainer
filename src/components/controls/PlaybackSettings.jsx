import React, { useState, useEffect } from 'react';
import {
  Snowflake,
  Flame,
} from 'lucide-react';
import '../../styles/App.css';
import './styles/PlaybackSettings.css';
import SmartToggle from './rows/SmartToggle';
import TypeSelectorOverlay from './rows/TypeSelectorOverlay';
import InstrumentRow from './rows/InstrumentRow';
import PresetPicker from './PresetPicker';
import GenericStepper from '../common/GenericStepper';
import { MetronomeIcon } from '../common/CustomIcons';
import { getNoteSourceLabel, getProgressionLabel } from '../../utils/labelUtils';
import { modes, updateScaleWithMode } from '../../theory/scaleHandler';
import { SectionHeader, RepeatMeasureBar, ColumnHeaders, BracketHeader } from './PlaybackSubComponents';
import { calcHarmonicDifficulty } from '../../utils/difficultyCalculator';
import { MELODY_DIFFICULTY_RANGE, calcTrebleDifficulty } from '../../utils/melodyDifficultyTable';
import { HARMONY_DIFFICULTY_RANGE } from '../../utils/harmonyTable';
import { DifficultyPanel, HarmonicSlider } from './DifficultyControls';
import { usePlaybackConfig } from '../../contexts/PlaybackConfigContext';
import { useInstrumentSettings } from '../../contexts/InstrumentSettingsContext';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { GRID_GENERATOR, GRID_VISIBILITY } from '../../constants/musicLayout';

// ─────────────────────────────────────────────────────────────────────────────

const PlaybackSettings = ({
  numMeasures,
  musicalBlocks,
  setNumMeasures,
  activeScale,
  generatorMode,
  setGeneratorMode,
  activePreset,
  setActivePreset,
  onRandomizeAll,
  isPlayingContinuously,
  setIsPlayingContinuously,
  showChordsOddRounds,
  setShowChordsOddRounds,
  showChordsEvenRounds,
  setShowChordsEvenRounds,
  setShowChordLabels,
  bpm,
  setBpm,
  setScale,
  setSelectedMode,
  difficultyLevel,
  setDifficultyLevel,
  difficultyProgression,
  setDifficultyProgression,
  targetHarmonicDifficulty,
  setTargetHarmonicDifficulty,
  onApplyHarmonyDifficulty,
  harmonyDifficultyRange,
  targetTrebleDifficulty,
  setTargetTrebleDifficulty,
  targetBassDifficulty,
  setTargetBassDifficulty,
  chordProgression,
  generateChords,
}) => {
  // ── Context-provided values (formerly props) ──────────────────────────────
  const { playbackConfig, setPlaybackConfig, toggleRoundSetting } = usePlaybackConfig();
  const { trebleSettings, setTrebleSettings, bassSettings, setBassSettings,
    percussionSettings, setPercussionSettings, metronomeSettings, setMetronomeSettings,
    chordSettings, setChordSettings } = useInstrumentSettings();
  const { chordDisplayMode, setChordDisplayMode, setNoteColoringMode } = useDisplaySettings();
  const MELODY_NOTE_SOURCES = [
    { value: "root", label: "Root" },
    { value: "chord", label: "Chord" },
    { value: "scale", label: "Scale" },
    { value: "chromatic", label: "Chromatic" }
  ];

  const PERCUSSION_NOTE_SOURCES = [
    { value: "claves", label: "Claves" },
    { value: "kick_snare", label: "Kick & Snare" },
    { value: "all", label: "All Percussion" }
  ];

  const RANDOMIZATION_RULES = [
    { value: "uniform", label: "Uniform" },
    { value: "emphasize_roots", label: "Emphasize Roots" },
    { value: "weighted", label: "Weighted" },
    { value: "arp_up", label: "Arpeggio Up" },
    { value: "arp_down", label: "Arpeggio Down" },
    { value: "arp", label: "Arpeggio (Bounce)" }
  ];


  // use getRandTypeLabel instead

  const [randType, setRandType] = useState({});
  const [activeRandTypeSelector, setActiveRandTypeSelector] = useState(null);

  // Sync state with props
  useEffect(() => {
    setRandType({
      treble: getNoteSourceLabel(trebleSettings?.notePool),
      bass: getNoteSourceLabel(bassSettings?.notePool),
      percussion: getNoteSourceLabel(percussionSettings?.notePool),
      chords: getProgressionLabel(chordSettings?.strategy),
    });
  }, [
    trebleSettings?.notePool,
    bassSettings?.notePool,
    percussionSettings?.notePool,
    chordSettings?.strategy,
  ]);

  const randTypeOptions = ['random', 'tonic', 'quarters', 'scale'];

  const cycleRandType = (instrument) => {
    markCustom();
    const current = randType[instrument] || 'random';
    const index = randTypeOptions.indexOf(current);
    const nextType = randTypeOptions[(index + 1) % randTypeOptions.length];

    const ruleMap = {
      random: 'scale',
      tonic: 'root',
      quarters: 'scale',
      scale: 'scale',
    };
    const nextRule = ruleMap[nextType];

    if (instrument === 'treble' && setTrebleSettings)
      setTrebleSettings((p) => ({ ...p, notePool: nextRule }));
    if (instrument === 'bass' && setBassSettings)
      setBassSettings((p) => ({ ...p, notePool: nextRule }));
    if (instrument === 'percussion' && setPercussionSettings)
      setPercussionSettings((p) => ({ ...p, notePool: nextRule }));
  };


  const handleRepsChangeLocal = (newValue) => {
    setPlaybackConfig((prev) => ({
      ...prev,
      repsPerMelody: Math.max(1, Math.min(20, newValue)),
    }));
  };

  const [isPresetOpen, setIsPresetOpen] = useState(false);

  const markCustom = () => {
    if (setActivePreset) setActivePreset('custom');
  };

  const handleTonicToggle = () => {
    markCustom();
    setPlaybackConfig((prev) => ({
      ...prev,
      randomize: { ...prev.randomize, tonic: !prev.randomize.tonic },
    }));
  };

  const handleMelodyToggle = () => {
    markCustom();
    setPlaybackConfig((prev) => ({
      ...prev,
      randomize: { ...prev.randomize, melody: !prev.randomize.melody },
    }));
  };

  const displayFamily = (() => {
    if (activeScale?.family === 'Simple') {
      if (activeScale.name === 'Major' || activeScale.name === 'Minor') return 'Diatonic';
    }
    return activeScale?.family;
  })();

  const isHeptatonicSubset = (family) => {
    return ['Diatonic', 'Melodic', 'Harmonic Minor', 'Harmonic Major', 'Double Harmonic'].includes(
      family
    );
  };

  const handleModeToggle = () => {
    if (
      ['Supertonic', 'Tritonic'].includes(activeScale?.family) ||
      activeScale?.name === 'Chromatic'
    )
      return;
    markCustom();
    setPlaybackConfig((prev) => {
      const isFamilyRandom = prev.randomize.family !== false;
      if (isFamilyRandom) {
        return {
          ...prev,
          randomize: { ...prev.randomize, mode: false, family: false },
        };
      }
      return {
        ...prev,
        randomize: { ...prev.randomize, mode: !prev.randomize.mode },
      };
    });
  };

  const handleFamilyToggle = () => {
    markCustom();
    setPlaybackConfig((prev) => {
      const current = prev.randomize.family;
      let next;
      if (current === false) next = 'hepta';
      else if (current === 'hepta') next = true;
      else next = false;

      const newRandomize = { ...prev.randomize, family: next };
      if (next === 'hepta' || next === true) {
        newRandomize.mode = true;
      }
      return { ...prev, randomize: newRandomize };
    });
  };

  const isModeDisabled =
    ['Supertonic', 'Tritonic'].includes(activeScale?.family) || activeScale?.name === 'Chromatic';
  const isModeRandomForced =
    playbackConfig.randomize.family === true || playbackConfig.randomize.family === 'hepta';

  // getRandTypeLabel moved to src/utils/labelUtils.js

  const handleTrebleChange = (field, value) => {
    if (!setTrebleSettings) return;
    markCustom();
    setTrebleSettings((prev) => ({ ...prev, [field]: value }));
  };

  const noteDenoms = [1, 2, 4, 8, 16];
  const noteDenomLabels = { 1: '1/1', 2: '1/2', 4: '1/4', 8: '1/8', 16: '1/16' };

  const cycleSmallestNote = () => {
    if (!trebleSettings) return;
    markCustom();
    const current = trebleSettings.smallestNoteDenom || 4;
    const idx = noteDenoms.indexOf(current);
    const next = noteDenoms[(idx + 1) % noteDenoms.length];
    handleTrebleChange('smallestNoteDenom', next);
  };


  const handleMeasureChangeLocal = (newValue) => {
    markCustom();
    setNumMeasures(Math.max(1, Math.min(30, newValue)));
  };

  // applyPreset removed: logic moved to PresetPicker.jsx

  return (
    <div className="ps-root">

      {/* 1. SONG BLOCK */}
      <SectionHeader label="Song" />

      {/* ROW 1 HEADERS */}
      <div className="ps-row-3col ps-row-3col-headers">
        <div className="ps-col-header-cell">Preset</div>
        <div className="ps-col-header-cell ps-col-header-cell-difficulty">
          Difficulty
          <span className="ps-difficulty-level-overlay">{difficultyLevel.toFixed(2)}x</span>
        </div>
        <div className="ps-col-header-cell">Progression</div>
      </div>

      {/* ROW 1 CONTROLS */}
      <div className="ps-row-3col ps-row-3col-controls">
        {/* Preset Selector */}
        <div className="ps-preset-wrapper">
          <button
            className="scale-selector-button ps-preset-btn"
            onClick={() => setIsPresetOpen(true)}
          >
            {activePreset.replace(/_/g, ' ')}
          </button>
        </div>

        {/* Difficulty Slider */}
        <div className="ps-difficulty-control">
          <div className="ps-difficulty-multiplier">
            {(1 + (difficultyLevel - 1) * 0.75).toFixed(2)}x
          </div>
          <div className="ps-difficulty-slider-inner">
            <Snowflake size={20} color="#88ccff" />
            <input
              type="range" min="1" max="10" step="0.25"
              value={difficultyLevel}
              onChange={(e) => setDifficultyLevel(parseFloat(e.target.value))}
              className="ps-difficulty-range-input"
            />
            <Flame size={20} color="#ff8800" />
          </div>
        </div>

        {/* Progression Stepper */}
        <div className="ps-progression-wrapper">
          <GenericStepper
            value={difficultyProgression}
            label={difficultyProgression === 'stable' ? 'STABLE' : (difficultyProgression === 'slight' ? 'SLIGHT' : 'INCREMENTS')}
            fontSize="11.5px"
            fontFamily="sans-serif"
            uppercase={true}
            allowedValues={['stable', 'slight', 'increments']}
            options={[
              { label: 'STABLE', value: 'stable' },
              { label: 'SLIGHT', value: 'slight' },
              { label: 'INCREMENTS', value: 'increments' }
            ]}
            onChange={(val) => setDifficultyProgression(val)}
            height="42px"
            background="#222"
          />
        </div>
      </div>

      {/* ROW 2 HEADERS */}
      <div className="ps-row-3col ps-row-3col-headers">
        <div className="ps-col-header-cell">Tonic</div>
        <div className="ps-col-header-cell">Mode</div>
        <div className="ps-col-header-cell">Family</div>
      </div>

      {/* ROW 2 CONTROLS */}
      <div className="ps-row-3col ps-row-3col-controls">
        <SmartToggle
          label="TONIC"
          value={activeScale?.tonic ? activeScale.tonic.replace(/[0-9]/g, '') : ''}
          state={playbackConfig.randomize.tonic}
          onToggle={handleTonicToggle}
          height="42px"
          playbackConfig={playbackConfig}
        />
        <SmartToggle
          label="MODE"
          value={activeScale?.modeName || activeScale?.name}
          state={playbackConfig.randomize.mode}
          onToggle={handleModeToggle}
          disabled={isModeDisabled}
          lowlighted={isModeRandomForced}
          height="42px"
          playbackConfig={playbackConfig}
          onOptionSelect={(opt) => {
            if (opt.value === 'random') {
              setPlaybackConfig(p => ({ ...p, randomize: { ...p.randomize, mode: true, family: false } }));
            } else {
              const updated = updateScaleWithMode({ currentScale: activeScale, newMode: opt.value });
              setScale(updated);
              setSelectedMode(opt.value);
              setPlaybackConfig(p => ({ ...p, randomize: { ...p.randomize, mode: false, family: false } }));
            }
          }}
          longPressOptions={[
            ...(activeScale && modes[activeScale.family] ? Object.keys(modes[activeScale.family]).map(m => ({
              label: m.replace(/^[IVX]+\.\s*/, ''),
              value: m,
              iconType: 'pin'
            })) : []),
            { label: 'RANDOM', value: 'random', iconType: 'dice' }
          ]}
        />
        <SmartToggle
          label="FAMILY"
          value={displayFamily}
          state={playbackConfig.randomize.family}
          onToggle={handleFamilyToggle}
          height="42px"
          playbackConfig={playbackConfig}
          onOptionSelect={(opt) => {
            if (opt.value === 'hepta') setPlaybackConfig(p => ({ ...p, randomize: { ...p.randomize, family: 'hepta' } }));
            else if (opt.value === 'random') setPlaybackConfig(p => ({ ...p, randomize: { ...p.randomize, family: true } }));
            else {
              // Fixed: pick first mode of that family
              const family = opt.value;
              const firstMode = Object.keys(modes[family])[0];
              const updated = updateScaleWithMode({ currentScale: activeScale, newFamily: family, newMode: firstMode });
              setScale(updated);
              setSelectedMode(firstMode);
              setPlaybackConfig(p => ({ ...p, randomize: { ...p.randomize, family: false, mode: false } }));
            }
          }}
          longPressOptions={[
            ...(!['Simple', 'Diatonic'].includes(activeScale?.family) ? [{ label: activeScale?.family, value: activeScale?.family, iconType: 'pin' }] : []),
            { label: 'SIMPLE', value: 'Simple', iconType: 'pin' },
            { label: 'DIATONIC', value: 'Diatonic', iconType: 'pin' },
            { label: 'HEPTATONIC', value: 'hepta', iconType: 'wheel' },
            { label: 'RANDOM', value: 'random', iconType: 'dice' }
          ]}
        />
      </div>

      {/* ── HARMONIC DIFFICULTY SLIDER ───────────────────────────────────── */}
      {harmonyDifficultyRange && (() => {
        const rand = playbackConfig.randomize;
        const allFixed = !rand.tonic && !rand.mode && rand.family === false;
        const actualHarmonic = calcHarmonicDifficulty(activeScale).score;
        return (
          <div
            className="ps-diff-row"
            style={{ gridTemplateColumns: GRID_GENERATOR, marginBottom: '6px', opacity: allFixed ? 0.4 : 1 }}
          >
            <div className="ps-diff-col-label">Harmonic</div>
            <div className="ps-diff-col-slider">
              <HarmonicSlider
                min={harmonyDifficultyRange.min}
                max={harmonyDifficultyRange.max}
                target={targetHarmonicDifficulty ?? harmonyDifficultyRange.min}
                actual={actualHarmonic}
                disabled={allFixed}
                onChange={(e) => { if (!allFixed) setTargetHarmonicDifficulty(parseFloat(e.target.value)); }}
              />
            </div>
            <div className="ps-diff-col-value">
              {targetHarmonicDifficulty != null ? targetHarmonicDifficulty.toFixed(1) : '–'}
            </div>
            <div className="ps-diff-col-clear">
              {targetHarmonicDifficulty != null && (
                <button onClick={() => setTargetHarmonicDifficulty(null)} className="ps-clear-btn" title="Clear — return to manual">✕</button>
              )}
            </div>
          </div>
        );
      })()}

      <RepeatMeasureBar
        numMeasures={numMeasures}
        musicalBlocks={musicalBlocks}
        reps={playbackConfig.repsPerMelody}
        onMeasuresChange={handleMeasureChangeLocal}
        onRepsChange={handleRepsChangeLocal}
      />

      {/* 2. CHORDS BLOCK */}
      <SectionHeader label="Chords" />
      <ColumnHeaders
        gridConfig={GRID_GENERATOR}
        columns={['chord notation', 'complexity', 'randomization', 'progression', 'chords/ MEASURE', 'PASSING CHORDS', 'variability']}
      />
      <InstrumentRow
        label="Chords"
        glyph="/"
        instrumentKey="chords"
        settings={chordSettings}
        setSettings={setChordSettings}
        setActiveRandTypeSelector={setActiveRandTypeSelector}
        firstChord={chordProgression?.chords?.[0] ?? null}
        renderMode="instrument"
      />
      <div className="ps-section-gap" />

      {/* 3. INSTRUMENTS BLOCK */}
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

      <InstrumentRow
        label="Chords"
        glyph="/"
        instrumentKey="chords"
        renderMode="visibility"
      />
      <InstrumentRow
        label="Treble"
        glyph="&"
        instrumentKey="treble"
        renderMode="visibility"
      />
      <InstrumentRow
        label="Bass"
        glyph="?"
        instrumentKey="bass"
        renderMode="visibility"
      />
      <InstrumentRow
        label="Perc"
        glyph="/"
        instrumentKey="percussion"
        renderMode="visibility"
      />
      <InstrumentRow
        label="Metronome"
        glyph={<MetronomeIcon />}
        instrumentKey="metronome"
        renderMode="visibility"
      />

      {/* ── DIFFICULTY DEBUG PANEL ────────────────────────────────────── */}
      <DifficultyPanel
        scale={activeScale}
        trebleSettings={trebleSettings}
        bassSettings={bassSettings}
        bpm={bpm}
        playbackConfig={playbackConfig}
      />

      <TypeSelectorOverlay
        activeRandTypeSelector={activeRandTypeSelector}
        setActiveRandTypeSelector={setActiveRandTypeSelector}
        setTrebleSettings={setTrebleSettings}
        setBassSettings={setBassSettings}
        setPercussionSettings={setPercussionSettings}
        setChordSettings={setChordSettings}
        setPlaybackConfig={setPlaybackConfig}
        setNumMeasures={handleMeasureChangeLocal}
        setRandType={setRandType}
      />

      <PresetPicker
        activePreset={activePreset}
        setActivePreset={setActivePreset}
        setPlaybackConfig={setPlaybackConfig}
        setNumMeasures={setNumMeasures}
        setTrebleSettings={setTrebleSettings}
        setBassSettings={setBassSettings}
        setPercussionSettings={setPercussionSettings}
        setChordSettings={setChordSettings}
        setNoteColoringMode={setNoteColoringMode}
        setShowChordLabels={setShowChordLabels}
        setShowChordsOddRounds={setShowChordsOddRounds}
        setShowChordsEvenRounds={setShowChordsEvenRounds}
        setBpm={setBpm}
        isOpen={isPresetOpen}
        setIsOpen={setIsPresetOpen}
      />
    </div>
  );
};

export default PlaybackSettings;
