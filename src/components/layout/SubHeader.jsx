import React from 'react';
import {
    Palette,
    Music2,
    MoveHorizontal,
    Piano,
    SlidersHorizontal,
    Sparkles,
    FlaskConical,
    Dumbbell,
    Award,
} from 'lucide-react';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { useMelodies } from '../../contexts/MelodyContext';


const SubHeader = ({
    show,
    isInputTestMode,
    inputTestState,
    onActivateAdjustments,
    onOpenRange,
    onOpenClef,
    onOpenSettings,
    onOpenColor,
    onOpenInstrument,
    onOpenPlayback,
    onOpenGeneration,
    onOpenGenerationAdvanced,
    onOpenExercises,
    // #1096 (Han 2026-08-20): the level-result tab — `onOpenLevelResult` is only provided once a level
    // result actually exists this session (App.jsx), same "only show when there's something to show"
    // convention as `(onOpenRange || onOpenClef) &&` gating the whole button row further down.
    onOpenLevelResult,
    rangeEditMode = false,
    clefEditMode = false,
    colorEditMode = false,
    instrumentEditMode = false,
    playbackEditMode = false,
    generationEditMode = false,
    generationAdvancedEditMode = false,
    exerciseEditMode = false,
    levelResultEditMode = false,
    exerciseRun = null,          // #267: { target, completed } while a bounded run is active
    showSheetMusicSettings = false,
    windowWidth,
    difficultyMultiplier,
}) => {
    const {
        colorScheme,
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

    // #1103: this small header swatch reflects colorScheme only (not colorScope) — chroma/subtle-chroma
    // keep their gradient swatches, root keeps the old 'chords' green, highlight (today's default) keeps
    // the old tonic/scale fallback var.
    const paletteColor =
        colorScheme === 'none' ? 'var(--text-primary)' :
            colorScheme === 'subtle-chroma' ? 'url(#subtle-chromatone-gradient-hdr)' :
                colorScheme === 'chroma' ? 'url(#chromatone-gradient-hdr)' :
                    colorScheme === 'root' ? '#90EE90' :
                        'var(--note-tonic)';

    const renderButton = (icon, label, onClick, isActive, forceColor, isMenuToggle = false, excludeFromLevelClose = false) => {
        // Menu-toggle buttons (SETTINGS / TRANSPOSITION / RANGE / COLOUR) all share ONE highlight
        // colour: lowlit (dimmed) when their menu is closed, full + a GLOW when active. The glow
        // reuses the current-note highlight pattern already used by the note-highlight button
        // below (triple drop-shadow), tinted to the highlight colour (Han 2026-06-13).
        const color = isMenuToggle
            ? 'var(--accent-yellow)'
            : (forceColor || (isActive ? 'var(--accent-yellow)' : '#88ccff'));
        const glow = isMenuToggle && isActive
            ? 'drop-shadow(0 0 8px var(--accent-yellow)) drop-shadow(0 0 4px var(--accent-yellow)) drop-shadow(0 0 2px var(--accent-yellow))'
            : undefined;
        const dim = isMenuToggle && !isActive ? 0.4 : 1;
        return (
            <div
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                // #1095: RESULT/Award re-OPENS the level's own result screen — it must NOT be treated as
                // "navigating away", or App.jsx's universal header-click-closes-level handler would close
                // the level (flipping `level.done` false) the instant you click it, right before the tab's
                // own onClick tries to open that same now-inconsistent result screen.
                {...(excludeFromLevelClose ? { 'data-header-level-control': '' } : {})}
                style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    width: BW,
                    height: '30px',
                    boxSizing: 'border-box',
                    opacity: dim,
                    transform: `scale(${btnScale})`,
                    transformOrigin: 'center center',
                }}
            >
                {/* Hit-extender: the label sits at top:100% with pointerEvents:none, so
                    without this the tap only registered on the icon, not the text (Han CR
                    2026-06-03). This transparent child stretches the clickable region down
                    over the label; clicks bubble to the container's onClick. Debug outline
                    moved here so it shows the REAL hit region (§3a). */}
                <div style={{
                    position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                    width: BW, height: 54,
                    outline: debugMode ? '2px solid cyan' : undefined,
                }} />
                <div style={{ color: color, filter: glow, height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                    {/* Exercise-run progress (#267): melody counter while a bounded
                        run is active. completed+1 = the melody currently being played
                        (capped at the target for the final one). */}
                    {exerciseRun && (
                        <span style={{ color: 'var(--accent-yellow)', fontWeight: 600 }}>
                            &nbsp;|&nbsp;melody {Math.min(exerciseRun.completed + 1, exerciseRun.target)}/{exerciseRun.target}
                        </span>
                    )}
                    {/* TOO SLOW flash (#266 rework 3): set by the live-tracker miss in
                        useInputTest; clears on the next state update (every tracked
                        note advances the state during fixed-tempo play-along). */}
                    {inputTestState?.lastMissAt && Date.now() - inputTestState.lastMissAt < 2000 && (
                        <span style={{ color: '#c96a5a', fontWeight: 700 }}>
                            &nbsp;|&nbsp;TOO SLOW
                        </span>
                    )}
                </div>
            </div>

            {/* (#502: legacy adjustment-button row removed 2026-07-20 — colour+chord-notation
                dropped; highlights/animation/lyrics moved into the COLOUR setter as bass-staff carousels.) */}

            {/* RANGE button — TEMPORARY entry point for the visual settings re-haul.
                Lives OUTSIDE the opacity:show wrapper above so it stays visible even
                when the adjustment buttons are faded out (Han: "altijd zichtbaar").
                Will be replaced by tap-on-element context overlays later. */}
            {(onOpenRange || onOpenClef) && (
                <div style={{ position: 'absolute', right: SIDE_PAD, top: '50%', transform: 'translateY(-50%)', zIndex: 2, display: 'flex', gap: 8 }}>
                    {/* Chords are enabled/disabled inside the CLEF selector (Han #6) —
                        no standalone CHORDS button. */}
                    {/* #500 (Han 2026-07-24): renamed TRANSPOSITION → NOTATION. This setter owns clef +
                        transposition + (per #501) font/theme/accidental notation choices. */}
                    {onOpenClef && renderButton(
                        <Music2 size={22} />,
                        'NOTATION',
                        onOpenClef,
                        clefEditMode,
                        null,
                        true
                    )}
                    {onOpenRange && renderButton(
                        <MoveHorizontal size={22} />,
                        'RANGE',
                        onOpenRange,
                        rangeEditMode,
                        null,
                        true
                    )}
                    {onOpenColor && renderButton(
                        <Palette size={22} />,
                        'COLOUR',
                        onOpenColor,
                        colorEditMode,
                        null,
                        true
                    )}
                    {/* INSTRUMENT setter — per-staff playback instrument picker (Han
                        2026-06-16). Menu-toggle button like the others. */}
                    {onOpenInstrument && renderButton(
                        <Piano size={22} />,
                        'INSTRUMENT',
                        onOpenInstrument,
                        instrumentEditMode,
                        null,
                        true
                    )}
                    {/* PLAYBACK / GENERATION / GEN. ADVANCED setters (Han 2026-06-22). Menu-toggle
                        buttons like the others (active glow via isMenuToggle). Distinct lucide
                        icons consistent with the existing set. */}
                    {onOpenPlayback && renderButton(
                        <SlidersHorizontal size={22} />,
                        'PLAYBACK',
                        onOpenPlayback,
                        playbackEditMode,
                        null,
                        true
                    )}
                    {onOpenGeneration && renderButton(
                        <Sparkles size={22} />,
                        'GENERATION',
                        onOpenGeneration,
                        generationEditMode,
                        null,
                        true
                    )}
                    {onOpenGenerationAdvanced && renderButton(
                        <FlaskConical size={22} />,
                        'GEN. ADVANCED',
                        onOpenGenerationAdvanced,
                        generationAdvancedEditMode,
                        null,
                        true
                    )}
                    {/* EXERCISES selector (#266, Han 2026-07-02) — in-staff exercise
                        carousel; opening it also flips the bottom view to songs. */}
                    {onOpenExercises && renderButton(
                        <Dumbbell size={22} />,
                        'EXERCISES',
                        onOpenExercises,
                        exerciseEditMode,
                        null,
                        true
                    )}
                    {/* #1096 (Han 2026-08-20, "(A)" — replicate the settings-overlay tab pattern
                        including icon): the level-result view, now one of these in-staff overlay tabs
                        instead of its own bespoke presentation. Only rendered once a result actually
                        exists this session (onOpenLevelResult is undefined otherwise). */}
                    {onOpenLevelResult && renderButton(
                        <Award size={22} />,
                        'RESULT',
                        onOpenLevelResult,
                        levelResultEditMode,
                        null,
                        true,
                        true   // #1095: excluded from the universal header-click-closes-level behavior
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
