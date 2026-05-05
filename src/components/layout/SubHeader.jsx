import React from 'react';
import {
    Palette,
    Music2,
    BookOpenCheck,
    ArrowRightFromLine,
    ArrowLeft,
    PencilOff,
    MicVocal,
} from 'lucide-react';
import { ChordNotationIcon } from '../common/CustomIcons';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';

// ── Cycling lists for button modes ───────────────────────────────────────────
const COLOR_MODES = ['none', 'tonic_scale_keys', 'chords', 'chromatone', 'subtle-chroma'];
const LYRICS_MODES = ['none', 'doremi-rel', 'doremi-abs', 'kodaly', 'takadimi'];

const SubHeader = ({
    show,
    isInputTestMode,
    inputTestState,
    headerPlayMode, setHeaderPlayMode,
    isPlaying, isPlayingMelody, isPlayingContinuously,
    handlePlayMelody, handlePlayContinuously,
    onActivateAdjustments,
    windowWidth,
    difficultyMultiplier,
}) => {
    const {
        noteColoringMode, setNoteColoringMode,
        debugMode,
        lyricsMode, setLyricsMode,
        chordDisplayMode, setChordDisplayMode,
        showNoteHighlight, setShowNoteHighlight,
        animationMode, setAnimationMode,
    } = useDisplaySettings();

    // Scale factor: 100% at 550px, scales down linearly below. Applied to button content, NOT the container.
    const btnScale = windowWidth >= 550 ? 1 : Math.max(0.5, windowWidth / 550);
    const BW = 75; // button width

    const paletteColor =
        noteColoringMode === 'none' ? 'var(--text-primary)' :
            noteColoringMode === 'subtle-chroma' ? 'url(#subtle-chromatone-gradient-hdr)' :
                noteColoringMode === 'chromatone' ? 'url(#chromatone-gradient-hdr)' :
                    noteColoringMode === 'chords' ? '#90EE90' :
                        'var(--note-tonic)';

    const renderButton = (icon, label, onClick, isActive, forceColor) => {
        const color = forceColor || (isActive ? 'var(--accent-yellow)' : '#88ccff');
        return (
            <div
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    width: BW,
                    height: '30px',
                    boxSizing: 'border-box',
                    transform: `scale(${btnScale})`,
                    transformOrigin: 'center center',
                    outline: debugMode ? '2px solid cyan' : undefined,
                }}
            >
                <div style={{ color: color, height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {icon}
                </div>
                <span style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontFamily: 'sans-serif',
                    fontSize: '9px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    whiteSpace: 'normal',
                    lineHeight: '1.2',
                    width: BW,
                    color: color,
                    pointerEvents: 'none',
                }}>
                    {label}
                </span>
            </div>
        );
    };

    const SIDE_PAD = 20; // 20px padding on either side as requested

    return (
        <div
            onClick={onActivateAdjustments}
            style={{
                width: '100%',
                position: 'relative',
                height: `${Math.ceil(52 * btnScale)}px`,
                zIndex: 10,
                cursor: 'pointer',
                boxSizing: 'border-box',
                overflow: 'visible',
            }}
        >
            {/* CENTER: Score line — always visible if isInputTestMode is on */}
            <div style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0px',
                width: '180px',
                opacity: isInputTestMode ? 1 : 0,
                pointerEvents: 'none',
                transition: 'opacity 0.2s',
                zIndex: 1
            }}>
                <div style={{
                    height: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    color: 'var(--accent-yellow)',
                    fontFamily: 'sans-serif',
                    whiteSpace: 'nowrap',
                    lineHeight: '1',
                    letterSpacing: '0.2px'
                }}>
                    accuracy: {inputTestState?.totalNotes ? Math.round(((inputTestState?.correctNotes || 0) / inputTestState?.totalNotes) * 100) : 0}%
                    &nbsp;|&nbsp; score: {inputTestState?.score || 0}
                    &nbsp;|&nbsp; difficulty: {difficultyMultiplier != null ? difficultyMultiplier.toFixed(2) : '–'}×
                </div>
            </div>

            <div style={{
                position: 'absolute',
                left: SIDE_PAD,
                right: SIDE_PAD,
                top: 0,
                bottom: 0,
                opacity: show ? 1 : 0,
                pointerEvents: show ? 'auto' : 'none',
                transition: 'opacity 0.2s',
            }}>
                {/* LEFT: 0 from padded edge */}
                <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)' }}>
                    {renderButton(
                        <Palette size={22} color={noteColoringMode === 'chromatone' ? 'url(#chromatone-gradient-hdr)' : noteColoringMode === 'subtle-chroma' ? 'url(#subtle-chromatone-gradient-hdr)' : paletteColor} fill="none" />,
                        noteColoringMode === 'none' ? 'NO COLOR' : noteColoringMode === 'tonic_scale_keys' ? 'TONICS' : noteColoringMode === 'chords' ? 'CHORDS' : noteColoringMode === 'subtle-chroma' ? 'SUBTLE CHROMA' : 'CHROMATONE',
                        () => {
                            const idx = COLOR_MODES.indexOf(noteColoringMode);
                            setNoteColoringMode(COLOR_MODES[(idx + 1) % COLOR_MODES.length]);
                        },
                        noteColoringMode !== 'none',
                        paletteColor
                    )}
                </div>

                {/* LEFT: 1*BW*btnScale from padded edge */}
                <div style={{ position: 'absolute', left: Math.round(BW * btnScale), top: '50%', transform: 'translateY(-50%)' }}>
                    {renderButton(
                        <Music2 size={22} style={showNoteHighlight ? { filter: 'drop-shadow(0 0 8px white) drop-shadow(0 0 4px white) drop-shadow(0 0 2px white)' } : {}} />,
                        showNoteHighlight ? 'HIGHLIGHTS' : 'NO HIGHLIGHTS',
                        () => setShowNoteHighlight(!showNoteHighlight),
                        false,
                        showNoteHighlight ? 'white' : '#88ccff'
                    )}
                </div>

                {/* LEFT: 2*BW*btnScale from padded edge */}
                <div style={{ position: 'absolute', left: Math.round(BW * 2 * btnScale), top: '50%', transform: 'translateY(-50%)' }}>
                    {renderButton(
                        animationMode === 'wipe' ? <ArrowRightFromLine size={22} /> : animationMode === 'scroll' ? <ArrowLeft size={22} /> : <BookOpenCheck size={22} />,
                        animationMode === 'wipe' ? 'WIPE' : animationMode === 'scroll' ? 'SCROLL' : 'PAGINATION',
                        () => setAnimationMode(m => m === 'pagination' ? 'wipe' : m === 'wipe' ? 'scroll' : 'pagination'),
                        false,
                        '#88ccff'
                    )}
                </div>

                {/* LEFT: 3*BW*btnScale from padded edge */}
                <div style={{ position: 'absolute', left: Math.round(BW * 3 * btnScale), top: '50%', transform: 'translateY(-50%)' }}>
                    {renderButton(
                        lyricsMode === 'none' ? <PencilOff size={22} /> : lyricsMode === 'takadimi' ? <Music2 size={22} /> : <MicVocal size={22} />,
                        lyricsMode === 'none' ? 'NO LYRICS' : lyricsMode === 'doremi-rel' ? 'DO-RE-MI (RELATIVE)' : lyricsMode === 'doremi-abs' ? 'DO-RE-MI (ABSOLUTE)' : lyricsMode === 'kodaly' ? 'DO-RE-MI (KODÁLY)' : 'TAKADIMI',
                        () => {
                            const idx = LYRICS_MODES.indexOf(lyricsMode);
                            setLyricsMode(LYRICS_MODES[(idx + 1) % LYRICS_MODES.length]);
                        },
                        lyricsMode !== 'none',
                        lyricsMode !== 'none' ? 'var(--accent-yellow)' : '#88ccff'
                    )}
                </div>

                {/* LEFT: 4*BW*btnScale from padded edge — chord notation mode */}
                <div style={{ position: 'absolute', left: Math.round(BW * 4 * btnScale), top: '50%', transform: 'translateY(-50%)' }}>
                    {renderButton(
                        <ChordNotationIcon mode={chordDisplayMode} size={22} />,
                        chordDisplayMode === 'letters' ? 'LETTERS' : 'NUMERALS',
                        () => setChordDisplayMode(m => m === 'letters' ? 'roman' : 'letters'),
                        false,
                        '#88ccff'
                    )}
                </div>

            </div>
        </div >
    );
};

export default SubHeader;
