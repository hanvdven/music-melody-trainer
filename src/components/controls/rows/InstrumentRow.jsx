import React from 'react';
import '../styles/InstrumentRow.css';
import { usePlaybackConfig } from '../../../contexts/PlaybackConfigContext';
import { useInstrumentSettings } from '../../../contexts/InstrumentSettingsContext';
import { useDisplaySettings } from '../../../contexts/DisplaySettingsContext';
import {
    Dices,
    TrendingUp,
    MoveUpRight,
    MoveDownRight,
    Shuffle,
    Music,
    Minus,
    Plus,
    Pin,
    Tally4,
    SquareArrowRight,
    Drum,
} from 'lucide-react';
import NumberControl from '../../common/NumberControl';
import { VolumeIcon, VisibilityIcon, MetronomeIcon } from '../../common/CustomIcons';
import { getNoteSourceLabel, getPlayStyleLabel, getProgressionLabel } from '../../../utils/labelUtils';
import GenericStepper from '../../common/GenericStepper';

/* ===============================
   Randomization Rule Families
================================= */

const RULE_FAMILIES = {
    random: ['uniform', 'emphasize_roots', 'weighted'],
    arp: ['arp_up', 'arp_down', 'arp'],
    chords: ['pairedchord', 'fullchord'],
    fixed: ['fixed']
};

const PERC_FAMILIES = {
    random: ['uniform'],
    stylized: ['backbeat', 'swing'],
    fixed: ['fixed']
};

const getRuleFamily = (rule) => {
    if (RULE_FAMILIES.random.includes(rule)) return 'random';
    if (RULE_FAMILIES.arp.includes(rule)) return 'arp';
    if (RULE_FAMILIES.chords.includes(rule)) return 'chords';
    if (rule === 'fixed') return 'fixed';
    if (PERC_FAMILIES.stylized.includes(rule)) return 'stylized';
    return 'random';
};


// getRandTypeLabel moved to src/utils/labelUtils.js

// Renders 3 stacked Maestro whole-note glyphs to represent a block chord.
// Used for the 'chords' group family icon in treble/bass rows.
const ChordGroupIcon = ({ size = 22, color = 'currentColor' }) => {
    const fontSize = Math.round(size * 1.08);
    const spacing = Math.round(size * 0.41) - 2;
    const vertShift = Math.round(size * -0.2); // shift all noteheads up
    return (
        <span style={{
            position: 'relative',
            display: 'inline-block',
            width: `${fontSize + 2}px`,
            height: `${fontSize + spacing * 2 + Math.round(size * 0.3)}px`,
            verticalAlign: 'middle',
        }}>
            {[spacing, 0, -spacing].map((yOff, i) => (
                <span key={i} style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(-50%, calc(-50% + ${yOff + vertShift}px))`,
                    fontFamily: 'Maestro',
                    fontSize: `${fontSize}px`,
                    lineHeight: 1,
                    color,
                }}>w</span>
            ))}
        </span>
    );
};

const ChordComplexityIcon = ({ type }) => {
    const STEP = 7;
    const OFFSET = 3.5;
    const Note = ({ x = 0, y = 0, char = 'w', lowlight = false }) => (
        <span style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y + OFFSET}px))`,
            fontFamily: 'Maestro',
            fontSize: '24px',
            lineHeight: 1,
            color: lowlight ? '#666' : 'var(--text-primary)',
            fontWeight: 'normal', // Maestro glyphs MUST be normal weight
            textTransform: 'none' // Disable all transforms to preserve glyph
        }}>
            {char}
        </span>
    );

    return (
        <div style={{ position: 'relative', width: '24px', height: '20px', margin: '0 auto' }}>
            {type === 'root' && <Note y={0} />}
            {type === 'power' && (
                <>
                    <Note y={-2 * STEP} />
                    <Note y={0} />
                </>
            )}
            {type === 'triad' && (
                <>
                    <Note y={-2 * STEP} />
                    <Note y={-STEP} />
                    <Note y={0} />
                </>
            )}
            {type === 'seventh' && (
                <>
                    <Note y={-3 * STEP} />
                    <Note y={-2 * STEP} />
                    <Note y={-STEP} />
                    <Note y={0} />
                </>
            )}
            {type === 'sus' && (
                <>
                    <Note x={-12} y={-2.5 * STEP} char="b" lowlight={true} />
                    <Note x={-12} y={-0.5 * STEP} char="#" lowlight={true} />
                    <Note x={0} y={-3 * STEP} lowlight={true} />
                    <Note x={0} y={-2 * STEP} />
                    <Note x={0} y={-STEP} lowlight={true} />
                    <Note x={0} y={0} />
                    <Note x={12} y={-2.5 * STEP} lowlight={true} />
                    <Note x={12} y={-1.5 * STEP} lowlight={true} />
                    <Note x={12} y={-0.5 * STEP} lowlight={true} />
                </>
            )}
            {type === 'exotic' && (
                <>
                    <Note x={-11} y={-2.5 * STEP} char="b" lowlight={true} />
                    <Note x={-11} y={-0.5 * STEP} char="#" lowlight={true} />
                    <Note x={2} y={-3 * STEP} />
                    <Note x={2} y={-2 * STEP} />
                    <Note x={2} y={-STEP} />
                    <Note x={2} y={0} />
                </>
            )}
        </div>
    );
};

const PlayStyleSelector = ({ settings, setSettings, isSheetMusic = false, instrumentKey, lowlighted = false }) => {
    if (instrumentKey === 'metronome' || instrumentKey === 'chords') return null;
    if (isSheetMusic) return <div className="ir-placeholder">-</div>;

    const currentRule = settings?.type === 'fullchord' ? 'fullchord' : (settings?.randomizationRule || 'uniform');
    const isPerc = instrumentKey === 'percussion';
    const families = isPerc ? PERC_FAMILIES : RULE_FAMILIES;

    const allRulesFlat = Object.values(families).flat();

    const getIconForRule = (r) => {
        const family = Object.keys(families).find(k => families[k].includes(r));
        if (family === 'random') return <Dices size={14} />;
        if (family === 'arp') return <TrendingUp size={14} />;
        if (family === 'chords') return <ChordGroupIcon size={14} />;
        if (family === 'stylized') return <Drum size={14} />;
        if (family === 'fixed') return <Pin size={14} />;
        return null;
    };

    const options = allRulesFlat.map(r => ({
        label: getPlayStyleLabel(r),
        value: r,
        icon: getIconForRule(r)
    }));

    return (
        <div className="ir-stepper-90">
            <GenericStepper
                value={currentRule}
                label={getPlayStyleLabel(currentRule)}
                fontSize="11.5px" // Reduced ~5% from 12px
                fontWeight="normal"
                fontFamily="sans-serif"
                uppercase={true}
                allowedValues={allRulesFlat}
                options={options}
                shouldCycle={true}
                onChange={(val) => setSettings(p => {
                    const newType = RULE_FAMILIES.chords.includes(val) ? val : (RULE_FAMILIES.chords.includes(p.type) ? instrumentKey : p.type);
                    return { ...p, randomizationRule: val, type: newType };
                })}
                background="none"
                lowlighted={lowlighted}
            />
        </div>
    );
};

const RuleSelector = ({ instrumentKey, settings, setSettings, setActiveRandTypeSelector, isSheetMusic = false }) => {
    // Standard label removed as requested. Reps will be rendered in Col 4 for Sheet Music.
    if (isSheetMusic) return null;

    let rules = [];
    if (instrumentKey === 'treble' || instrumentKey === 'bass') {
        rules = ['root', 'chord', 'scale', 'chromatic'];
    } else if (instrumentKey === 'percussion') {
        rules = ['claves', 'kick_snare', 'all'];
    } else if (instrumentKey === 'chords') {
        rules = ['modal-random', 'ii-v-i', 'pop-1-5-6-4', 'pop-6-4-1-5', 'doo-wop', 'classical-1-4-5-5', 'pachelbel'];
    }

    const currentRule = settings?.notePool || (instrumentKey === 'percussion' ? 'all' : 'scale');
    const options = rules.map(r => ({ label: getNoteSourceLabel(r), value: r }));

    return (
        <div className="ir-stepper-90">
            <GenericStepper
                value={currentRule}
                label={getNoteSourceLabel(currentRule)}
                fontSize="11.5px" // Matches other GenericStepper sizes; was 8.5pt (~11.3px)
                fontFamily="sans-serif"
                uppercase={true}
                allowedValues={rules}
                options={options}
                shouldCycle={true}
                onChange={(val) => setSettings(p => ({ ...p, notePool: val }))}
            />
        </div>
    );
};

const InstrumentRow = ({
    label,
    glyph,
    instrumentKey,
    type = 'audio',
    settings,
    setSettings,
    firstChord,
    showChords,
    onShowChordsToggle,
    setActiveRandTypeSelector,
    numMeasures,
    handleMeasureChange,
    handleRepsChange,
    renderMode = 'instrument' // 'instrument', 'chords', 'visibility'
}) => {
    // ── Context-provided values (formerly props) ────────────────────────────
    const { playbackConfig, setPlaybackConfig, toggleRoundSetting } = usePlaybackConfig();
    const { setTrebleSettings, setBassSettings, setPercussionSettings } = useInstrumentSettings();
    const { chordDisplayMode, setChordDisplayMode } = useDisplaySettings();
    const isMetronome = instrumentKey === 'metronome';
    const isChords = instrumentKey === 'chords';
    const isSheetMusic = instrumentKey === 'notes';
    const isPerc = instrumentKey === 'percussion';

    const Icon = (type === 'visual' || isChords) ? VisibilityIcon : VolumeIcon;

    const togglePercPerc = (round) => {
        const current = playbackConfig[round].percussion;
        let next;
        if (current === true) next = 'metronome';
        else if (current === 'metronome') next = false;
        else next = true;
        setPlaybackConfig(prev => ({
            ...prev,
            [round]: { ...prev[round], percussion: next }
        }));
    };

    const volColor = (vol) => {
        if (vol >= 1.0) return 'var(--accent-yellow)';
        if (vol >= 0.8) return '#d4aa44';
        if (vol >= 0.6) return '#a0c060';
        if (vol >= 0.4) return '#80b0c0';
        if (vol > 0.0) return '#6090e0';
        return 'rgba(255,255,255,0.35)';
    };

    // GRID WIDTHS: 
    // Generator (Instrument/Chords): 12% 16% 12% 20% 12% 16% 12% (approx)
    // Visibility: 20% 20% 20% 20% 20%
    const GRID_GENERATOR = '12% 18% 12% 22% 12% 12% 12%';
    const GRID_VISIBILITY = '12% 22% 22% 22% 22%';
    const GRID_CONFIG = renderMode === 'visibility' ? GRID_VISIBILITY : GRID_GENERATOR;

    const PROGRESSION_OPTIONS = [
        // Random
        { label: 'RANDOM MODAL', value: 'modal-random', icon: <Dices /> },
        { label: 'I-I-I (TONIC)', value: 'tonic-tonic-tonic', icon: <Tally4 color="var(--accent-yellow)" /> },

        // Predetermined
        { label: '..-ii-V-I (JAZZ)', value: 'ii-v-i', icon: <Tally4 color="var(--accent-yellow)" /> },
        { label: 'POP 4 (I-V-vi-IV)', value: 'pop-1-5-6-4', icon: <Tally4 color="var(--accent-yellow)" /> },
        { label: 'SENSITIVE (vi-IV-I-V)', value: 'pop-6-4-1-5', icon: <Tally4 color="var(--accent-yellow)" /> },
        { label: 'DOO WOP', value: 'doo-wop', icon: <Tally4 color="var(--accent-yellow)" /> },
        { label: 'CADENTIAL', value: 'classical-1-4-5-5', icon: <Tally4 color="var(--accent-yellow)" /> },
        { label: 'PACHELBEL', value: 'pachelbel', icon: <Tally4 color="var(--accent-yellow)" /> },
        { label: 'ANDALUSIAN (i-bVII-bVI-V)', value: 'andalusian', icon: <Tally4 color="var(--accent-yellow)" /> },
    ];

    if (renderMode === 'visibility') {
        return (
            <div className="ir-row" style={{ gridTemplateColumns: GRID_CONFIG }}>
                {/* Col 1: Target (Glyph/Clef) */}
                <div
                    className="ir-col-center"
                    onClick={() => { if (isChords) setChordDisplayMode(p => p === 'letters' ? 'roman' : 'letters'); }}
                    style={{ cursor: isChords ? 'pointer' : 'default' }}
                >
                    <span style={{
                        fontFamily: (isChords && chordDisplayMode === 'roman') ? 'serif' : (typeof glyph === 'string' && glyph.length === 1 ? 'Maestro' : 'inherit'),
                        fontSize: isChords ? '14.5px' : (glyph ? '22px' : '11px'),
                        fontWeight: 'normal',
                        color: '#eee',
                        transform: (instrumentKey === 'treble') ? 'translateY(2px)' : (instrumentKey === 'bass') ? 'translateY(-5px)' : 'none'
                    }}>
                        {isChords ? (
                            <div className="ir-round-btn">
                                {chordDisplayMode === 'roman'
                                ? <span className="ir-serif">
                                    {firstChord?.roman || 'i'}
                                    {firstChord?.romanSuffix && <sup>{firstChord.romanSuffix}</sup>}
                                  </span>
                                : <span className="ir-serif">
                                    {firstChord?.internalRoot || 'C'}
                                    {firstChord?.internalSuffix && <sup>{firstChord.internalSuffix}</sup>}
                                  </span>
                            }
                            </div>
                        ) : glyph}
                    </span>
                </div>

                {/* Col 2: ODD See */}
                <div className="ir-col-center">
                    {!isMetronome && (
                        <div
                            className="ir-round-btn"
                            onClick={() => toggleRoundSetting('oddRounds', instrumentKey, 'visual')}
                            style={{ opacity: (playbackConfig.oddRounds[`${instrumentKey}Eye`] || (isPerc && playbackConfig.oddRounds.percussionEye)) ? 1 : 0.6 }}
                        >
                            {isPerc && playbackConfig.oddRounds.percussionEye === 'metronome' ? (
                                <MetronomeIcon color="var(--accent-yellow)" />
                            ) : (
                                <VisibilityIcon color={playbackConfig.oddRounds[`${instrumentKey}Eye`] ? 'var(--accent-yellow)' : 'white'} crossed={!playbackConfig.oddRounds[`${instrumentKey}Eye`]} size={22} />
                            )}
                        </div>
                    )}
                </div>

                {/* Col 3: ODD Hear */}
                <div className="ir-col-center">
                    <div
                        className="ir-round-btn"
                        onClick={() => toggleRoundSetting('oddRounds', instrumentKey, 'audio')}
                        style={{ opacity: playbackConfig.oddRounds[instrumentKey] > 0 ? 1 : 0.6 }}
                    >
                        <VolumeIcon color={volColor(playbackConfig.oddRounds[instrumentKey])} volume={playbackConfig.oddRounds[instrumentKey]} size={22} />
                    </div>
                </div>

                {/* Col 4: EVEN See */}
                <div className="ir-col-center">
                    {!isMetronome && (
                        <div
                            className="ir-round-btn"
                            onClick={() => toggleRoundSetting('evenRounds', instrumentKey, 'visual')}
                            style={{ opacity: (playbackConfig.evenRounds[`${instrumentKey}Eye`] || (isPerc && playbackConfig.evenRounds.percussionEye)) ? 1 : 0.6 }}
                        >
                            {isPerc && playbackConfig.evenRounds.percussionEye === 'metronome' ? (
                                <MetronomeIcon color="var(--accent-yellow)" />
                            ) : (
                                <VisibilityIcon color={playbackConfig.evenRounds[`${instrumentKey}Eye`] ? 'var(--accent-yellow)' : 'white'} crossed={!playbackConfig.evenRounds[`${instrumentKey}Eye`]} size={22} />
                            )}
                        </div>
                    )}
                </div>

                {/* Col 5: EVEN Hear */}
                <div className="ir-col-center">
                    <div
                        className="ir-round-btn"
                        onClick={() => toggleRoundSetting('evenRounds', instrumentKey, 'audio')}
                        style={{ opacity: playbackConfig.evenRounds[instrumentKey] > 0 ? 1 : 0.6 }}
                    >
                        <VolumeIcon color={volColor(playbackConfig.evenRounds[instrumentKey])} volume={playbackConfig.evenRounds[instrumentKey]} size={22} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="ir-row" style={{ gridTemplateColumns: GRID_CONFIG }}>
            {/* Col 1: Label/Glyph */}
            <div
                className="ir-glyph-cell"
                onClick={() => { if (isChords) setChordDisplayMode(p => p === 'letters' ? 'roman' : 'letters'); }}
                style={{
                    cursor: isChords ? 'pointer' : 'default',
                    fontFamily: (isChords && chordDisplayMode === 'roman') ? 'serif' : (typeof glyph === 'string' && glyph.length === 1 ? 'Maestro' : 'inherit'),
                    fontSize: isChords ? '14.5px' : (glyph ? '22px' : '11px'),
                }}
            >
                {isChords ? (
                    <div className="ir-round-btn">
                        {chordDisplayMode === 'roman' ? <span>ii<sup>−7</sup></span> : <span className="ir-serif">D<sup>−7</sup></span>}
                    </div>
                ) : (
                    <span style={{ transform: (instrumentKey === 'treble') ? 'translateY(2px)' : (instrumentKey === 'bass') ? 'translateY(-5px)' : 'none' }}>
                        {glyph}
                    </span>
                )}
            </div>

            {/* Col 2: Melody Notes (Rule) */}
            <div className="ir-col-center-full">
                {!isMetronome && (
                    isChords ? (
                        <div className="ir-stepper-90">
                            <GenericStepper
                                value={settings?.complexity || 'triad'}
                                label={<ChordComplexityIcon type={settings?.complexity || 'triad'} />}
                                fontSize="11px"
                                fontFamily="sans-serif"
                                uppercase={true}
                                allowedValues={['root', 'power', 'triad', 'seventh', 'sus', 'exotic']}
                                options={[
                                    { label: 'ROOT', value: 'root', icon: <ChordComplexityIcon type="root" /> },
                                    { label: 'POWER', value: 'power', icon: <ChordComplexityIcon type="power" /> },
                                    { label: 'TRIAD', value: 'triad', icon: <ChordComplexityIcon type="triad" /> },
                                    { label: 'SEVENTH', value: 'seventh', icon: <ChordComplexityIcon type="seventh" /> },
                                    { label: 'SUS', value: 'sus', icon: <ChordComplexityIcon type="sus" /> },
                                    { label: 'EXOTIC', value: 'exotic', icon: <ChordComplexityIcon type="exotic" /> }
                                ]}
                                shouldCycle={true}
                                onChange={(val) => setSettings(p => ({ ...p, complexity: val }))}
                            />
                        </div>
                    ) : (
                        <RuleSelector
                            instrumentKey={instrumentKey}
                            settings={settings}
                            setSettings={setSettings}
                            setActiveRandTypeSelector={setActiveRandTypeSelector}
                        />
                    )
                )}
            </div>

            {/* Col 3: Randomization (Family) */}
            <div className="ir-col-center">
                {isChords ? (
                    (() => {
                        const strategy = settings?.strategy || 'tonic-tonic-tonic';
                        const isRandom = strategy === 'modal-random';
                        const isLocked = !playbackConfig.randomize.chords;
                        const handleChordGroupCycle = () => {
                            if (isLocked) {
                                setPlaybackConfig(p => ({ ...p, randomize: { ...p.randomize, chords: true } }));
                                setSettings(p => ({ ...p, strategy: 'modal-random' }));
                            } else if (isRandom) {
                                setSettings(p => ({ ...p, strategy: 'tonic-tonic-tonic' }));
                            } else {
                                setPlaybackConfig(p => ({ ...p, randomize: { ...p.randomize, chords: false } }));
                            }
                        };
                        return (
                            <div className="ir-round-btn" onClick={handleChordGroupCycle}>
                                {isLocked ? (
                                    <Pin size={22} color="white" className="ir-pin-dim" />
                                ) : isRandom ? (
                                    <Dices size={22} color="var(--accent-yellow)" />
                                ) : (
                                    <Tally4 size={22} color="var(--accent-yellow)" />
                                )}
                            </div>
                        );
                    })()
                ) : !isMetronome ? (
                    (() => {
                        const currentRule = RULE_FAMILIES.chords.includes(settings?.type) ? settings.type : (settings?.randomizationRule || 'uniform');
                        const family = getRuleFamily(currentRule);
                        const toggleMode = () => {
                            let nextRule, newType;
                            if (isPerc) {
                                if (family === 'random') { nextRule = 'backbeat'; newType = instrumentKey; }
                                else if (family === 'stylized') { nextRule = 'fixed'; newType = instrumentKey; }
                                else { nextRule = 'uniform'; newType = instrumentKey; }
                            } else {
                                if (family === 'random') { nextRule = RULE_FAMILIES.arp[0]; newType = instrumentKey; }
                                else if (family === 'arp') { nextRule = RULE_FAMILIES.chords[0]; newType = RULE_FAMILIES.chords[0]; }
                                else if (family === 'chords') {
                                    const ci = RULE_FAMILIES.chords.indexOf(currentRule);
                                    if (ci < RULE_FAMILIES.chords.length - 1) {
                                        nextRule = RULE_FAMILIES.chords[ci + 1]; newType = nextRule;
                                    } else {
                                        nextRule = 'fixed'; newType = instrumentKey;
                                    }
                                }
                                else { nextRule = RULE_FAMILIES.random[0]; newType = instrumentKey; }
                            }
                            setSettings(prev => ({ ...prev, randomizationRule: nextRule, type: newType }));
                            if (setPlaybackConfig) setPlaybackConfig(p => ({ ...p, randomize: { ...p.randomize, melody: true } }));
                        };
                        return (
                            <div className="ir-round-btn" onClick={toggleMode}>
                                {family === 'random' && <Dices size={22} color="var(--accent-yellow)" />}
                                {family === 'arp' && <TrendingUp size={22} color="var(--accent-yellow)" />}
                                {family === 'chords' && <ChordGroupIcon size={22} color="var(--accent-yellow)" />}
                                {family === 'stylized' && <Drum size={22} color="var(--accent-yellow)" />}
                                {family === 'fixed' && <Pin size={22} color="white" className="ir-pin-dim" />}
                            </div>
                        );
                    })()
                ) : null}
            </div>

            {/* Col 4: Sequence / Progression */}
            <div className="ir-col-center-full">
                {isChords ? (
                    <GenericStepper
                        value={settings?.strategy || 'tonic-tonic-tonic'}
                        label={(() => {
                            const label = getProgressionLabel(settings?.strategy || 'tonic-tonic-tonic');
                            const parts = label.split('^');
                            if (parts.length > 1) {
                                return <span>{parts[0]}<sup className="ir-prog-sup">{parts[1]}</sup></span>;
                            }
                            return label;
                        })()}
                        fontSize="11.5px"
                        fontFamily="sans-serif"
                        uppercase={true}
                        allowedValues={PROGRESSION_OPTIONS.map(opt => opt.value)}
                        options={PROGRESSION_OPTIONS}
                        shouldCycle={true}
                        onChange={(val) => setSettings(p => ({ ...p, strategy: val }))}
                    />
                ) : !isMetronome ? (
                    <PlayStyleSelector settings={settings} setSettings={setSettings} instrumentKey={instrumentKey} />
                ) : null}
            </div>

            {/* Col 5: Notes per Measure / Chords per Measure */}
            <div className="ir-col-center">
                {isChords ? (
                    <div className="ir-stepper-80">
                        <GenericStepper
                            value={settings?.chordCount ?? 1}
                            label={(() => {
                                const val = settings?.chordCount ?? 1;
                                if (val === 0.25) return '¼';
                                if (val === 0.5) return '½';
                                if (val === 1.5) return '1½';
                                if (val === 2.5) return '2½';
                                return val;
                            })()}
                            fontSize="15.5px"
                            fontFamily="serif"
                            allowedValues={[0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4]}
                            options={[
                                { label: '¼', value: 0.25 },
                                { label: '½', value: 0.5 },
                                { label: '1', value: 1 },
                                { label: '1½', value: 1.5 },
                                { label: '2', value: 2 },
                                { label: '2½', value: 2.5 },
                                { label: '3', value: 3 },
                                { label: '4', value: 4 },
                            ]}
                            onChange={(val) => setSettings(p => ({ ...p, chordCount: val }))}
                        />
                    </div>
                ) : !isMetronome ? (
                    <GenericStepper
                        value={settings?.notesPerMeasure || 0}
                        fontSize="15.5px"
                        fontFamily="serif"
                        allowedValues={[0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16]}
                        min={0} max={20}
                        onChange={(val) => setSettings(p => ({ ...p, notesPerMeasure: val }))}
                    />
                ) : null}
            </div>

            {/* Col 6: Smallest Note / Passing Chords toggle */}
            <div className="ir-col-center">
                {isChords ? (
                    // Passing chords mode selector.
                    // 'none'                → no passing chords
                    // 'secondary-dominant'  → only secondary-dominant approach (V7/x)
                    // 'all'                 → all types incl. sequential chains
                    <div className="ir-stepper-80">
                        <GenericStepper
                            value={settings?.passingChords ?? 'none'}
                            label={(() => {
                                const v = settings?.passingChords ?? 'none';
                                if (v === 'secondary-dominant') return '2nd dom';
                                if (v === 'all') return 'all types';
                                return 'none';
                            })()}
                            fontSize="11px"
                            fontFamily="sans-serif"
                            allowedValues={['none', 'secondary-dominant', 'all']}
                            options={[
                                { label: 'none',     value: 'none' },
                                { label: '2nd dom',  value: 'secondary-dominant' },
                                { label: 'all types', value: 'all' },
                            ]}
                            onChange={(val) => setSettings(p => ({ ...p, passingChords: val }))}
                        />
                    </div>
                ) : !isChords && !isMetronome ? (() => {
                    const current = settings?.smallestNoteDenom || 4;
                    const allowedValues = [16, 8, 4, 2, 1];
                    const glyphMap = { 1: 'w', 2: 'h', 4: 'q', 8: 'e', 16: 'x' };
                    const options = allowedValues.map(v => ({
                        label: <span className="ir-maestro-note-sm">{glyphMap[v]}</span>,
                        value: v
                    }));
                    return (
                        <div className="ir-stepper-full">
                            <GenericStepper
                                value={current}
                                label={<span className="ir-maestro-note-lg">{glyphMap[current] || 'q'}</span>}
                                allowedValues={allowedValues}
                                options={options}
                                onChange={(val) => setSettings(p => ({ ...p, smallestNoteDenom: val }))}
                            />
                        </div>
                    );
                })() : null}
            </div>

            {/* Col 7: Variability */}
            <div className="ir-col-center">
                {!isMetronome && (
                    <GenericStepper
                        value={settings?.rhythmVariability || 0}
                        fontSize="15.5px"
                        fontFamily="serif"
                        allowedValues={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                        min={0} max={100}
                        suffix="%"
                        onChange={(val) => setSettings(p => ({ ...p, rhythmVariability: val }))}
                    />
                )}
            </div>
        </div>
    );
};

export default InstrumentRow;
