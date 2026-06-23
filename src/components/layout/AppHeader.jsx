import React from 'react';
import {
    Play,
    Square,
    SlidersHorizontal,
    Cog,
    Repeat1,
    MicOff,
    Piano,
    Mic,
    SkipBack,
    SkipForward,
    Bug,
    KanbanSquare,
} from 'lucide-react';
import './AppHeader.css';
import { formatScaleName } from '../../theory/scaleHandler';
import { IconOne } from '../common/CustomIcons';

const AppHeader = ({
    scale,
    displayTonic = null,        // written tonic when global transposition is active (item 5)
    globalInstLabel = null,     // "(B♭ instrument)" line under the title when global-transposed
    showSheetMusicSettings,
    toggleSheetMusicSettings,
    isInputTestMode,
    inputTestSubMode = 'step',
    setInputTestSubMode,
    isPlayingMelody,
    handlePlayMelody,
    handlePlayRepeat,
    handleToggleInputTest,
    isPlayingContinuously,
    handlePlayContinuously,
    customScaleLabel,
    headerPlayMode,
    setHeaderPlayMode,
    windowWidth,
    setActiveTab,
    handleSkipBack,
    handleSkipForward,
    canSkipBack,
    debugMode = false,
    setDebugMode,
    onOpenKanban = null,        // opens the in-app kanban board; button only shown in debug mode
    onScaleClick = null,
    isScalePlaying = false,
    progressionLabel = null,
    songTitle = null,
}) => {
    const headerScale = windowWidth >= 550 ? 1 : Math.max(0.5, windowWidth / 550);

    return (
        <div className="app-header">
            <div className="app-header-left">
                {/* Unified Input Mode Cycler */}
                <button
                    className={`tab-button secondary app-header-btn ${inputTestSubMode !== 'none' ? 'active' : ''}`}
                    onClick={() => {
                        const nextModes = { 'none': 'note', 'note': 'live', 'live': 'none' };
                        const next = nextModes[inputTestSubMode || 'none'];
                        setInputTestSubMode(next);
                        if (next === 'live') setActiveTab?.('listen');
                        if (next === 'none' && isInputTestMode) handleToggleInputTest();
                        else if (next !== 'none' && !isInputTestMode) handleToggleInputTest();
                    }}
                    style={{ color: inputTestSubMode !== 'none' ? 'var(--accent-yellow)' : '#88ccff', transform: `scale(${headerScale})`, transformOrigin: 'center', outline: debugMode ? '2px solid cyan' : undefined }}
                >
                    {inputTestSubMode === 'none' ? <MicOff size={22} /> :
                        inputTestSubMode === 'note' ? <Piano size={22} /> : <Mic size={22} />}
                </button>

                <button
                    className={`tab-button secondary app-header-btn ${showSheetMusicSettings ? 'active' : ''}`}
                    onClick={toggleSheetMusicSettings}
                    style={{ color: showSheetMusicSettings ? 'var(--accent-yellow)' : '#88ccff', transform: `scale(${headerScale})`, transformOrigin: 'center', outline: debugMode ? '2px solid cyan' : undefined }}
                >
                    <SlidersHorizontal size={22} />
                </button>

                <button
                    className={`tab-button secondary app-header-btn ${debugMode ? 'active' : ''}`}
                    onClick={() => setDebugMode?.(d => !d)}
                    title="Toggle debug mode (shows clickable zones)"
                    style={{ color: debugMode ? 'var(--accent-yellow)' : '#88ccff', transform: `scale(${headerScale})`, transformOrigin: 'center', outline: debugMode ? '2px solid cyan' : undefined }}
                >
                    <Bug size={22} />
                </button>

                {/* Kanban board — only surfaced via debug (Han 2026-06-22: "via debug -> kanban"). */}
                {debugMode && (
                    <button
                        className="tab-button secondary app-header-btn"
                        onClick={() => onOpenKanban?.()}
                        title="Open kanban board"
                        style={{ color: '#88ccff', transform: `scale(${headerScale})`, transformOrigin: 'center', outline: '2px solid cyan' }}
                    >
                        <KanbanSquare size={22} />
                    </button>
                )}
            </div>

            {/* Hidden SVG for gradients */}
            <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                    <linearGradient id="chromatone-gradient-hdr" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#FF0000" />
                        <stop offset="20%" stopColor="#FFFF00" />
                        <stop offset="40%" stopColor="#00FF00" />
                        <stop offset="60%" stopColor="#00FFFF" />
                        <stop offset="80%" stopColor="#0000FF" />
                        <stop offset="100%" stopColor="#FF00FF" />
                    </linearGradient>
                    <linearGradient id="subtle-chromatone-gradient-hdr" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="color-mix(in srgb, #FF0000, var(--text-primary) 60%)" />
                        <stop offset="20%" stopColor="color-mix(in srgb, #FFFF00, var(--text-primary) 60%)" />
                        <stop offset="40%" stopColor="color-mix(in srgb, #00FF00, var(--text-primary) 60%)" />
                        <stop offset="60%" stopColor="color-mix(in srgb, #00FFFF, var(--text-primary) 60%)" />
                        <stop offset="80%" stopColor="color-mix(in srgb, #0000FF, var(--text-primary) 60%)" />
                        <stop offset="100%" stopColor="color-mix(in srgb, #FF00FF, var(--text-primary) 60%)" />
                    </linearGradient>
                </defs>
            </svg>

            {/* CENTER: Title — absolutely centered regardless of button widths */}
            <div className="app-header-center">
                <div className="app-header-center-inner">
                    <div className="app-header-title">
                        {songTitle ? `${songTitle} in` : (progressionLabel ? `${progressionLabel} in` : 'Melody in')}{' '}
                    <span
                        style={{
                            color: showSheetMusicSettings ? 'var(--accent-yellow)' : 'inherit',
                            filter: isScalePlaying ? 'drop-shadow(0 0 6px white) drop-shadow(0 0 3px white)' : 'none',
                            cursor: 'pointer',
                            pointerEvents: 'auto',
                            transition: 'color 0.2s, filter 0.3s',
                            outline: debugMode ? '2px solid cyan' : undefined,
                        }}
                        onClick={(e) => { e.stopPropagation(); onScaleClick?.(); }}
                    >
                        {formatScaleName(displayTonic ?? scale.tonic, scale.name, scale.family, customScaleLabel)}
                    </span>
                    </div>
                    {/* Global-transposition instrument line (item 5): shown only when both staves
                        share a non-concert transposition; the title above already shows the
                        WRITTEN key (e.g. "in D Major" for a concert-C piece on a B♭ instrument). */}
                    {globalInstLabel && (
                        <div className="app-header-subtitle">({globalInstLabel})</div>
                    )}
                </div>
            </div>

            <div
                className="app-header-right"
                style={{ transform: `translateY(-50%) scale(${headerScale})`, transformOrigin: 'center right' }}
            >
                <button
                    className="tab-button secondary app-header-btn"
                    onClick={handleSkipBack}
                    disabled={!canSkipBack}
                    style={{ color: canSkipBack ? '#88ccff' : '#444', outline: debugMode ? '2px solid cyan' : undefined }}
                >
                    <SkipBack size={22} />
                </button>

                <button
                    className="tab-button secondary app-header-btn"
                    onClick={handleSkipForward}
                    style={{ color: '#88ccff', outline: debugMode ? '2px solid cyan' : undefined }}
                >
                    <SkipForward size={22} />
                </button>

                {/* PLAY THIS (Han 2026-05-28): play the CURRENT melody. Mode is set
                    by the toggler next to it — 'once' = single playback, 'repeat' = repeat
                    the same melody without regeneration. Continuous-with-regeneration is
                    its own button (the cog/Generate button below). */}
                <button
                    className={`tab-button secondary app-header-btn ${isPlayingMelody ? 'active' : ''}`}
                    onClick={() => {
                        if (isPlayingMelody) {
                            handlePlayMelody();
                        } else {
                            // Defensive: legacy headerPlayMode='continuous' from before
                            // this split is treated as 'once' here. The toggler below
                            // only emits 'once'/'repeat' from now on.
                            if (headerPlayMode === 'repeat') handlePlayRepeat?.();
                            else handlePlayMelody();
                        }
                    }}
                    title="Play this melody"
                    style={{ color: isPlayingMelody ? 'var(--accent-yellow)' : '#88ccff', outline: debugMode ? '2px solid cyan' : undefined }}
                >
                    {isPlayingMelody ? (
                        <Square size={24} color="var(--accent-yellow)" />
                    ) : (
                        <Play size={24} />
                    )}
                </button>

                {/* Once/Repeat toggle (Han 2026-05-28: 'continuous' option removed,
                    that role is now owned by the cog/Generate button). */}
                <button
                    className="tab-button secondary app-header-btn-sm"
                    onClick={() => setHeaderPlayMode(m => m === 'repeat' ? 'once' : 'repeat')}
                    title={headerPlayMode === 'repeat' ? 'Repeat current melody' : 'Play once'}
                    style={{ color: '#88ccff', outline: debugMode ? '2px solid cyan' : undefined }}
                >
                    {headerPlayMode === 'repeat' ? <Repeat1 size={17} /> : <IconOne size={17} />}
                </button>

                {/* START GENERATING (Han 2026-05-28): continuous play that regenerates
                    a fresh melody at every series boundary. Independent toggle from PLAY
                    THIS so the user can keep "play this once" muscle memory separate
                    from "start the random-generation loop". */}
                <button
                    className={`tab-button secondary app-header-btn ${isPlayingContinuously ? 'active' : ''}`}
                    onClick={() => {
                        handlePlayContinuously();
                    }}
                    title={isPlayingContinuously ? 'Stop generating' : 'Start generating'}
                    style={{ color: isPlayingContinuously ? 'var(--accent-yellow)' : '#88ccff', outline: debugMode ? '2px solid cyan' : undefined }}
                >
                    {isPlayingContinuously ? (
                        <Square size={24} color="var(--accent-yellow)" />
                    ) : (
                        <Cog size={24} />
                    )}
                </button>
            </div>

        </div>
    );
};

export default AppHeader;
