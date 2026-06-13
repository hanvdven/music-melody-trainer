import React from 'react';
import SheetMusic from '../sheet-music/SheetMusic';
import PianoView from '../controls/PianoView';
import KeyboardRangeSetter from '../controls/KeyboardRangeSetter';
import KeyboardTransposeSetter from '../controls/KeyboardTransposeSetter';
import RangeControls from '../controls/RangeControls';
import ToneRecognizer from '../controls/ToneRecognizer';
import DrumPad from '../controls/DrumPad';
import ScaleSelector from '../scale/ScaleSelector';
import PlaybackSettings from '../controls/PlaybackSettings';
import SettingsPanel from '../controls/SettingsPanel';
import ChordGrid from '../controls/ChordGrid';
import ProfileTab from '../profile/ProfileTab';
import SongsTab from '../songs/SongsTab';
import InstrumentRow from '../controls/rows/InstrumentRow';
import ErrorBoundary from '../error/ErrorBoundary';
import { SectionHeader, ColumnHeaders } from '../controls/PlaybackSubComponents';
import { instrumentOptions } from '../controls/instrumentOptions';
import { HARMONY_DIFFICULTY_RANGE } from '../../utils/harmonyTable';
import { useInstrumentSettings } from '../../contexts/InstrumentSettingsContext';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { usePlaybackTransport } from '../../contexts/PlaybackTransportContext';
import { useRoundState } from '../../contexts/RoundStateContext';

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
    blockMeasureStart,
    blockPlayStart,
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
    rangeEditMode,
    clefEditMode,
    keyboardTranspose = 0,
    setKeyboardTranspose,
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
    // Songs tab
    onLoadSong,
}) => {
    const {
        trebleSettings, setTrebleSettings,
        bassSettings, setBassSettings,
        percussionSettings, setPercussionSettings,
        chordSettings, setChordSettings,
    } = useInstrumentSettings();

    const { noteColoringMode, setNoteColoringMode, chordDisplayMode, setChordDisplayMode, debugMode } = useDisplaySettings();
    const { isPlaying } = usePlaybackTransport();
    const { inputTestSubMode } = useRoundState();

    return (
        <div className="app-content-area">
            {activeTab === 'sheet-music' && (
                <div className="app-tab-sheet">
                    <ErrorBoundary boundary="sheet-music-tab">
                        <SheetMusic
                            {...sheetMusicCommonProps}
                            visibleMeasures={idealVisibleMeasures}
                            startMeasureIndex={startMeasureIndex}
                            blockMeasureStart={blockMeasureStart}
                            blockPlayStart={blockPlayStart}
                        />
                    </ErrorBoundary>
                </div>
            )}
            {activeTab === 'piano' && (
                <div className="app-instrument-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                    {instruments.treble ? (
                        <div style={{ flex: 1, position: 'relative', width: '100%', overflow: 'visible' }}>
                            {/* Range-edit swaps the playable piano for the graphical
                                range setter (windowed keyboard + band + handles +
                                preset buttons). Settings-only mode keeps the playable
                                piano + the full RangeControls overlay. */}
                            {clefEditMode ? (
                                <KeyboardTransposeSetter
                                    scale={scale}
                                    instrument={activeClef === 'treble' ? manualInstruments.treble : manualInstruments.bass}
                                    keyboardTranspose={keyboardTranspose}
                                    setKeyboardTranspose={setKeyboardTranspose}
                                />
                            ) : rangeEditMode ? (
                                <KeyboardRangeSetter
                                    scale={scale}
                                    instrument={activeClef === 'treble' ? manualInstruments.treble : manualInstruments.bass}
                                    activeClef={activeClef}
                                    settings={activeClef === 'treble' ? trebleSettings : bassSettings}
                                    setSettings={activeClef === 'treble' ? setTrebleSettings : setBassSettings}
                                    noteColoringMode={noteColoringMode}
                                    qwertyKeyboardActive={qwertyKeyboardActive}
                                    onNoteInput={handleInputTestNote}
                                    debugMode={debugMode}
                                />
                            ) : (
                                <>
                                    <PianoView
                                        scale={scale}
                                        trebleInstrument={activeClef === 'treble' ? manualInstruments.treble : manualInstruments.bass}
                                        activeClef={activeClef}
                                        minNote={activeClef === 'treble' ? trebleSettings?.range?.min : bassSettings?.range?.min}
                                        maxNote={activeClef === 'treble' ? trebleSettings?.range?.max : bassSettings?.range?.max}
                                        noteColoringMode={noteColoringMode}
                                        onNoteInput={handleInputTestNote}
                                        qwertyKeyboardActive={qwertyKeyboardActive}
                                        transpose={keyboardTranspose}
                                    />
                                    {/* data-settings-keepalive stops the overlay's
                                        click-outside-to-close from firing when the user
                                        taps a control here (bug #7, Han 2026-05-30). */}
                                    {showSheetMusicSettings && (
                                        <div data-settings-keepalive="" style={{
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
                                                rangeOnly={false}
                                            />
                                        </div>
                                    )}
                                </>
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
                            {/* See piano-tab: range-edit swaps in the graphical setter. */}
                            {(rangeEditMode || clefEditMode) ? (
                                <KeyboardRangeSetter
                                    scale={scale}
                                    instrument={manualInstruments.bass}
                                    activeClef={'bass'}
                                    settings={bassSettings}
                                    setSettings={setBassSettings}
                                    noteColoringMode={noteColoringMode}
                                    qwertyKeyboardActive={qwertyKeyboardActive}
                                    onNoteInput={handleInputTestNote}
                                    debugMode={debugMode}
                                    keyboardTranspose={keyboardTranspose}
                                    setKeyboardTranspose={setKeyboardTranspose}
                                    clefMode={clefEditMode}
                                />
                            ) : (
                                <>
                                    <PianoView
                                        scale={scale}
                                        trebleInstrument={manualInstruments.bass}
                                        activeClef={'bass'}
                                        minNote={bassSettings?.range?.min}
                                        maxNote={bassSettings?.range?.max}
                                        noteColoringMode={noteColoringMode}
                                        onNoteInput={handleInputTestNote}
                                        qwertyKeyboardActive={qwertyKeyboardActive}
                                        transpose={keyboardTranspose}
                                    />
                                    {showSheetMusicSettings && (
                                        <div data-settings-keepalive="" style={{
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
                                                rangeOnly={false}
                                            />
                                        </div>
                                    )}
                                </>
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
                <ErrorBoundary boundary="scale-tab">
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
                    <ErrorBoundary boundary="playback-tab">
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
            {activeTab === 'songs' && (
                <ErrorBoundary boundary="songs-tab">
                    <SongsTab onLoadSong={onLoadSong} />
                </ErrorBoundary>
            )}
            {activeTab === 'profile' && (
                <ErrorBoundary boundary="profile-tab">
                    <ProfileTab />
                </ErrorBoundary>
            )}
        </div>
    );
};

export default TabView;
