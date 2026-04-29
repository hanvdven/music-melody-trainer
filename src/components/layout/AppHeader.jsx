import React from 'react';
import {
    Play,
    Square,
    SlidersHorizontal,
    RefreshCw,
    MicOff,
    Piano,
    Mic,
    SkipBack,
    SkipForward,
    Bug,
} from 'lucide-react';
import './AppHeader.css';
import { formatScaleName } from '../../theory/scaleHandler';
import { IconOne } from '../common/CustomIcons';

const AppHeader = ({
    scale,
    showSheetMusicSettings,
    toggleSheetMusicSettings,
    isInputTestMode,
    inputTestSubMode = 'step',
    setInputTestSubMode,
    isPlayingMelody,
    handlePlayMelody,
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
    onScaleClick = null,
    isScalePlaying = false,
    progressionLabel = null,
}) => {
    const headerScale = windowWidth >= 550 ? 1 : Math.max(0.5, windowWidth / 550);

    const isSomethingPlaying = isPlayingMelody || isPlayingContinuously;

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
                        {progressionLabel ? `${progressionLabel} in` : 'Melody in'}{' '}
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
                        {formatScaleName(scale.tonic, scale.name, scale.family, customScaleLabel)}
                    </span>
                    </div>
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

                <button
                    className={`tab-button secondary app-header-btn ${isSomethingPlaying ? 'active' : ''}`}
                    onClick={() => {
                        if (isSomethingPlaying) {
                            if (isPlayingMelody) handlePlayMelody();
                            if (isPlayingContinuously) handlePlayContinuously();
                        } else {
                            if (headerPlayMode === 'once') handlePlayMelody();
                            else if (headerPlayMode === 'continuous') handlePlayContinuously();
                        }
                    }}
                    style={{ color: isSomethingPlaying ? 'var(--accent-yellow)' : '#88ccff', outline: debugMode ? '2px solid cyan' : undefined }}
                >
                    {isSomethingPlaying ? (
                        <Square size={24} color="var(--accent-yellow)" />
                    ) : (
                        <Play size={24} />
                    )}
                </button>

                {/* Slim Repeat/Once Toggle */}
                <button
                    className="tab-button secondary app-header-btn-sm"
                    onClick={() => setHeaderPlayMode(m => m === 'once' ? 'continuous' : 'once')}
                    style={{ color: '#88ccff', outline: debugMode ? '2px solid cyan' : undefined }}
                >
                    {headerPlayMode === 'once' ? <IconOne size={17} /> : <RefreshCw size={17} />}
                </button>
            </div>

        </div>
    );
};

export default AppHeader;
