import React from 'react';
import {
    Palette,
    Music2,
    BookOpenCheck,
    ArrowRightFromLine,
    ArrowLeft,
    PencilOff,
    MicVocal,
    MoveHorizontal,
    Settings2,
} from 'lucide-react';
import { ChordNotationIcon } from '../common/CustomIcons';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { useMelodies } from '../../contexts/MelodyContext';

// ── Cycling lists for button modes ───────────────────────────────────────────
const COLOR_MODES = ['none', 'tonic_scale_keys', 'chords', 'chromatone', 'subtle-chroma'];
const LYRICS_MODES = ['none', 'doremi-rel', 'doremi-abs', 'kodaly', 'takadimi'];

const SubHeader = ({
    show,
    isInputTestMode,
    inputTestState,
    onActivateAdjustments,
    onOpenRange,
    onOpenClef,
    onOpenSettings,
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
        paginationVariant, setPaginationVariant,
    } = useDisplaySettings();

    const { treble: trebleMelody, bass: bassMelody, percussion: percMelody } = useMelodies();

    // Build DNA grouping string for debug overlay: "(r0 r1)(r2 r3)..."
    const { debugDnaText, debugGroupingText } = (() => {
        if (!debugMode) return { debugDnaText: null, debugGroupingText: null };
        const src = trebleMelody ?? bassMelody ?? percMelody;
        const dna = src?.rhythmicDNA;
        const grouping = src?.rhythmicGrouping;
        const debugGroupingText = grouping?.length
            ? `grouping: [${grouping.join(', ')}]`
            : null;
        if (!dna?.length || !grouping?.length) return { debugDnaText: null, debugGroupingText };
        const totalBeats = grouping.reduce((a, b) => a + b, 0);
        if (!totalBeats) return { debugDnaText: null, debugGroupingText };
        const spb = dna.length / totalBeats;
        const debugDnaText = grouping.map((size, gi) => {
            const start = Math.round(grouping.slice(0, gi).reduce((a, b) => a + b, 0) * spb);
            return `(${dna.slice(start, Math.round(start + size * spb)).map(r => r ?? '?').join(' ')})`;
        }).join('');
        return { debugDnaText, debugGroupingText };
    })();

    const branch = import.meta.env.VITE_GIT_BRANCH ?? '?';
    const pr = import.meta.env.VITE_PR_NUMBER;

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
            // Han 2026-05-29: mark the SubHeader as a settings-keepalive zone
            // so pointerdown here doesn't trigger useSettingsOverlay's
            // click-outside-to-close. The buttons still receive their clicks
            // (renderButton stops propagation), but without this marker the
            // capture-phase listener would close the overlay first and the
            // user's tap would feel like it dismissed everything instead of
            // toggling the intended option (note coloring, highlights, ...).
            data-settings-keepalive=""
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

                {/* LEFT: 2*BW*btnScale from padded edge — animation mode + pagination variant.
                    Cycle: pag-snel → pag-mid → wipe → scroll. The 'lang' pagination variant
                    was removed 2026-05-28 (Han: no use case). If a user has 'lang' saved in
                    localStorage from a previous session it falls through to 'wipe' on the
                    next cycle press; legacy state isn't actively scrubbed. */}
                <div style={{ position: 'absolute', left: Math.round(BW * 2 * btnScale), top: '50%', transform: 'translateY(-50%)' }}>
                    {renderButton(
                        animationMode === 'wipe' ? <ArrowRightFromLine size={22} /> : animationMode === 'scroll' ? <ArrowLeft size={22} /> : <BookOpenCheck size={22} />,
                        animationMode === 'wipe' ? 'WIPE'
                            : animationMode === 'scroll' ? 'SCROLL'
                            : `PAG · ${(paginationVariant ?? 'mid').toUpperCase()}`,
                        () => {
                            // Cycle: pag/snel → pag/mid → wipe → scroll → pag/snel.
                            if (animationMode !== 'pagination') {
                                if (animationMode === 'wipe') setAnimationMode('scroll');
                                else { setAnimationMode('pagination'); setPaginationVariant('snel'); }
                                return;
                            }
                            const next = { snel: 'mid', mid: null }[paginationVariant ?? 'mid'];
                            if (next) setPaginationVariant(next);
                            else setAnimationMode('wipe');
                        },
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

            {/* RANGE button — TEMPORARY entry point for the visual settings re-haul.
                Lives OUTSIDE the opacity:show wrapper above so it stays visible even
                when the adjustment buttons are faded out (Han: "altijd zichtbaar").
                Will be replaced by tap-on-element context overlays later. */}
            {(onOpenRange || onOpenClef || onOpenSettings) && (
                <div style={{ position: 'absolute', right: SIDE_PAD, top: '50%', transform: 'translateY(-50%)', zIndex: 2, display: 'flex', gap: 8 }}>
                    {/* SETTINGS button — the ONLY entry point for the legacy settings
                        surface now (Han #13: clicking the sheet no longer opens it).
                        Goal: deprecate once its options migrate to in-staff setters. */}
                    {onOpenSettings && renderButton(
                        <Settings2 size={22} />,
                        'SETTINGS',
                        onOpenSettings,
                        false,
                        '#9aa0a6'
                    )}
                    {/* Chords are enabled/disabled inside the CLEF selector (Han #6) —
                        no standalone CHORDS button. */}
                    {onOpenClef && renderButton(
                        <Music2 size={22} />,
                        'CLEF',
                        onOpenClef,
                        false,
                        '#c0a0ff'
                    )}
                    {onOpenRange && renderButton(
                        <MoveHorizontal size={22} />,
                        'RANGE',
                        onOpenRange,
                        false,
                        '#88ccff'
                    )}
                </div>
            )}

            {/* Debug info: centered over everything else, visible only in debug mode */}
            {debugMode && (
                <div style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 20,
                    pointerEvents: 'none',
                    userSelect: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1,
                }}>
                    {debugDnaText && (
                        <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'red', whiteSpace: 'nowrap' }}>
                            {debugDnaText}
                        </span>
                    )}
                    <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'red', whiteSpace: 'nowrap' }}>
                        {branch}{pr ? ` #${pr}` : ''}
                    </span>
                    {debugGroupingText && (
                        <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'red', whiteSpace: 'nowrap' }}>
                            {debugGroupingText}
                        </span>
                    )}
                </div>
            )}
        </div >
    );
};

export default SubHeader;
