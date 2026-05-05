import React from 'react';
import SheetMusic from '../sheet-music/SheetMusic';
import PianoView from '../controls/PianoView';
import RangeControls from '../controls/RangeControls';
import ToneRecognizer from '../controls/ToneRecognizer';
import DrumPad from '../controls/DrumPad';
import ScaleSelector from '../scale/ScaleSelector';
import PlaybackSettings from '../controls/PlaybackSettings';
import SettingsPanel from '../controls/SettingsPanel';
import ChordGrid from '../controls/ChordGrid';
import InstrumentRow from '../controls/rows/InstrumentRow';
import ErrorBoundary from '../error/ErrorBoundary';
import { SectionHeader, ColumnHeaders } from '../controls/PlaybackSubComponents';
import { instrumentOptions } from '../controls/instrumentOptions';
import { HARMONY_DIFFICULTY_RANGE } from '../../utils/harmonyTable';
import { useInstrumentSettings } from '../../contexts/InstrumentSettingsContext';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { usePlaybackState } from '../../contexts/PlaybackStateContext';

// ─────────────────────────────────────────────────────────────────────────────
// TabView — renders the content area for each tab.
// Lives inside all Providers, so it reads shared state from context directly.
// Props are limited to values not yet in any context.
// ─────────────────────────────────────────────────────────────────────────────

const TabView = ({
    activeTab,
    // Sheet music
    sheetMusicCommonProps,
    startMeasureIndex,
    idealVisibleMeasures,
    // Instruments (loading state + audio)
    instruments,
    manualInstruments,
    context,
    // Scale/playback
    scale,
    activeClef,
    handleInputTestNote,
    qwertyKeyboardActive,
    showSheetMusicSettings,
    resetSettingsTimer,
    // Percussion custom mapping
    customPercussionMapping,
    setCustomPercussionMapping,
    // Theme
    theme,
    setTheme,
    // Chord display
    displayChordProgression,
    chordProgression,
    sequencerRef,
    // Scale tab
    selectedMode,
    setSelectedMode,
    customScaleLabel,
    setCustomScaleLabel,
    isModulationEnabled,
    setIsModulationEnabled,
    isSimpleView,
    setIsSimpleView,
    minimizeAccidentals,
    setMinimizeAccidentals,
    handlePlayScale,
    isPlayingScale,
    setTonic,
    // Playback settings tab
    numMeasures,
    setNumMeasures,
    musicalBlocks,
    setShowChordLabels,
    generatorMode,
    setGeneratorMode,
    activePreset,
    setActivePreset,
    showChordsOddRounds,
    setShowChordsOddRounds,
    showChordsEvenRounds,
    setShowChordsEvenRounds,
    difficultyLevel,
    setDifficultyLevel,
    difficultyProgression,
    setDifficultyProgression,
    bpm,
    setBpm,
    generateChords,
    setScale,
    targetHarmonicDifficulty,
    setTargetHarmonicDifficulty,
    applyHarmonyAtDifficulty,
    targetTrebleDifficulty,
    setTargetTrebleDifficulty,
    targetBassDifficulty,
    setTargetBassDifficulty,
    // Other settings tab
    isFullscreen,
    toggleFullscreen,
    // Layout
    windowSize,
}) => {
    const {
        trebleSettings, setTrebleSettings,
        bassSettings, setBassSettings,
        percussionSettings, setPercussionSettings,
        chordSettings, setChordSettings,
    } = useInstrumentSettings();

    const { noteColoringMode, setNoteColoringMode, chordDisplayMode, setChordDisplayMode } = useDisplaySettings();
    const { isPlayingContinuously, isPlaying, inputTestSubMode } = usePlaybackState();

    return (
        <div className="app-content-area">
            {activeTab === 'sheet-music' && (
                <div className="app-tab-sheet">
                    <ErrorBoundary>
                        <SheetMusic
                            {...sheetMusicCommonProps}
                            visibleMeasures={idealVisibleMeasures}
                            startMeasureIndex={startMeasureIndex}
                        />
                    </ErrorBoundary>
                </div>
            )}
            {activeTab === 'piano' && (
                <div className="app-instrument-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                    {instruments.treble ? (
                        <div style={{ flex: 1, position: 'relative', width: '100%', overflow: 'visible' }}>
                            <PianoView
                                scale={scale}
                                trebleInstrument={activeClef === 'treble' ? manualInstruments.treble : manualInstruments.bass}
                                activeClef={activeClef}
                                minNote={activeClef === 'treble' ? trebleSettings?.range?.min : bassSettings?.range?.min}
                                maxNote={activeClef === 'treble' ? trebleSettings?.range?.max : bassSettings?.range?.max}
                                noteColoringMode={noteColoringMode}
                                onNoteInput={handleInputTestNote}
                                qwertyKeyboardActive={qwertyKeyboardActive}
                            />
                            {showSheetMusicSettings && (
                                <div style={{
                                    position: 'absolute',
                                    top: 0, left: 0, right: 0,
                                    background: 'var(--panel-bg)',
                                    zIndex: 20,
                                    padding: '4px 8px 20px 8px',
                                }}>
                                    <RangeControls
                                        activeSettings={activeClef === 'treble' ? trebleSettings : bassSettings}
                                        setSettings={activeClef === 'treble' ? setTrebleSettings : setBassSettings}
                                        tonic={scale.tonic}
                                        activeClef={activeClef}
                                        instrumentOptions={instrumentOptions}
                                        setInstrument={(slug) => {
                                            if (activeClef === 'treble') setTrebleSettings(p => ({ ...p, instrument: slug }));
                                            else setBassSettings(p => ({ ...p, instrument: slug }));
                                        }}
                                        noteColoringMode={noteColoringMode}
                                        setNoteColoringMode={setNoteColoringMode}
                                        onSettingsInteraction={resetSettingsTimer}
                                    />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="app-instrument-loading">Waking up instruments...</div>
                    )}
                </div>
            )}
            {/* Persistent ToneRecognizer for mic input across tabs */}
            {(activeTab === 'listen' || inputTestSubMode === 'live') && (
                <div className="app-tab-listen" style={{ display: activeTab === 'listen' ? 'block' : 'none' }}>
                    <ToneRecognizer
                        context={context}
                        scale={scale}
                        noteColoringMode={noteColoringMode}
                        onNoteInput={handleInputTestNote}
                        inputTestSubMode={inputTestSubMode}
                        activeTab={activeTab}
                    />
                </div>
            )}
            {activeTab === 'keys-bottom' && (
                <div className="app-instrument-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {instruments.bass ? (
                        <div style={{ flex: 1, position: 'relative', width: '100%', overflow: 'visible' }}>
                            <PianoView
                                scale={scale}
                                trebleInstrument={manualInstruments.bass}
                                activeClef={'bass'}
                                minNote={bassSettings?.range?.min}
                                maxNote={bassSettings?.range?.max}
                                noteColoringMode={noteColoringMode}
                                onNoteInput={handleInputTestNote}
                                qwertyKeyboardActive={qwertyKeyboardActive}
                            />
                            {showSheetMusicSettings && (
                                <div style={{
                                    position: 'absolute',
                                    top: 0, left: 0, right: 0,
                                    background: 'var(--panel-bg)',
                                    zIndex: 20,
                                    padding: '4px 8px 20px 8px',
                                }}>
                                    <RangeControls
                                        activeSettings={bassSettings}
                                        setSettings={setBassSettings}
                                        tonic={scale.tonic}
                                        activeClef={'bass'}
                                        instrumentOptions={instrumentOptions}
                                        setInstrument={(slug) => setBassSettings(p => ({ ...p, instrument: slug }))}
                                        noteColoringMode={noteColoringMode}
                                        setNoteColoringMode={setNoteColoringMode}
                                        onSettingsInteraction={resetSettingsTimer}
                                    />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="app-instrument-loading">Waking up instruments...</div>
                    )}
                </div>
            )}
            {activeTab === 'percussion' && (
                <div style={{
                    width: '100%',
                    flex: 1,
                    minHeight: 0,
                    maxHeight: `${Math.min(windowSize.height * 0.65, windowSize.width * 0.75)}px`,
                }}>
                    <DrumPad
                        instruments={manualInstruments}
                        context={context}
                        customMapping={customPercussionMapping}
                        setCustomMapping={setCustomPercussionMapping}
                        percussionSettings={percussionSettings}
                        setPercussionSettings={setPercussionSettings}
                        onNoteInput={handleInputTestNote}
                        qwertyKeyboardActive={qwertyKeyboardActive}
                        theme={theme}
                    />
                </div>
            )}
            {activeTab === 'chords' && (
                <div className="app-tab-chords">
                    <div className="app-tab-chords-inner">
                        <SectionHeader label="Chords" />
                        <ColumnHeaders
                            gridConfig="12% 18% 12% 22% 12% 12% 12%"
                            columns={['chord notation', 'complexity', 'randomization', 'progression', 'chords/ MEASURE', '', 'variability']}
                        />
                        <InstrumentRow
                            label="Chords"
                            glyph="/"
                            instrumentKey="chords"
                            settings={chordSettings}
                            setSettings={setChordSettings}
                            setActiveRandTypeSelector={() => {}}
                            firstChord={chordProgression?.chords?.[0] ?? null}
                            renderMode="instrument"
                        />
                    </div>
                    <ChordGrid
                        scale={scale}
                        chordProgression={displayChordProgression}
                        chordDisplayMode={chordDisplayMode}
                        setChordDisplayMode={setChordDisplayMode}
                        isPlaying={isPlaying}
                        liveComplexity={chordSettings?.complexity || 'triad'}
                        context={context}
                        sequencerRef={sequencerRef}
                    />
                </div>
            )}
            {activeTab === 'scale' && (
                <ErrorBoundary>
                    <ScaleSelector
                        trebleInstrument={manualInstruments.treble}
                        windowSize={windowSize}
                        scale={scale}
                        setScale={setScale}
                        scaleRange={trebleSettings?.range}
                        setTonic={(v, isManualOverride) => {
                            setTonic(v, isManualOverride);
                        }}
                        activeMode={selectedMode}
                        setSelectedMode={setSelectedMode}
                        customScaleLabel={customScaleLabel}
                        setCustomScaleLabel={setCustomScaleLabel}
                        isModulationEnabled={isModulationEnabled}
                        setIsModulationEnabled={setIsModulationEnabled}
                        isSimpleView={isSimpleView}
                        setIsSimpleView={setIsSimpleView}
                        minimizeAccidentals={minimizeAccidentals}
                        setMinimizeAccidentals={setMinimizeAccidentals}
                        handlePlayScale={handlePlayScale}
                        isPlayingScale={isPlayingScale}
                    />
                </ErrorBoundary>
            )}
            {activeTab === 'playback' && (
                <div className="app-tab-playback">
                    <ErrorBoundary>
                        <PlaybackSettings
                            numMeasures={numMeasures}
                            musicalBlocks={musicalBlocks}
                            setNumMeasures={setNumMeasures}
                            setShowChordLabels={setShowChordLabels}
                            activeScale={scale}
                            generatorMode={generatorMode}
                            setGeneratorMode={setGeneratorMode}
                            activePreset={activePreset}
                            setActivePreset={setActivePreset}
                            showChordsOddRounds={showChordsOddRounds}
                            setShowChordsOddRounds={setShowChordsOddRounds}
                            showChordsEvenRounds={showChordsEvenRounds}
                            setShowChordsEvenRounds={setShowChordsEvenRounds}
                            difficultyLevel={difficultyLevel}
                            setDifficultyLevel={setDifficultyLevel}
                            difficultyProgression={difficultyProgression}
                            setDifficultyProgression={setDifficultyProgression}
                            bpm={bpm}
                            setBpm={setBpm}
                            generateChords={generateChords}
                            setScale={setScale}
                            setSelectedMode={setSelectedMode}
                            targetHarmonicDifficulty={targetHarmonicDifficulty}
                            setTargetHarmonicDifficulty={setTargetHarmonicDifficulty}
                            onApplyHarmonyDifficulty={applyHarmonyAtDifficulty}
                            harmonyDifficultyRange={HARMONY_DIFFICULTY_RANGE}
                            targetTrebleDifficulty={targetTrebleDifficulty}
                            setTargetTrebleDifficulty={setTargetTrebleDifficulty}
                            targetBassDifficulty={targetBassDifficulty}
                            setTargetBassDifficulty={setTargetBassDifficulty}
                            chordProgression={chordProgression}
                        />
                    </ErrorBoundary>
                </div>
            )}
            {activeTab === 'other-settings' && (
                <SettingsPanel
                    theme={theme} setTheme={setTheme}
                    isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen}
                    minimizeAccidentals={minimizeAccidentals} setMinimizeAccidentals={setMinimizeAccidentals}
                    isModulationEnabled={isModulationEnabled} setIsModulationEnabled={setIsModulationEnabled}
                />
            )}
        </div>
    );
};

export default TabView;
