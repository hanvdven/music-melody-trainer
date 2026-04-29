import React, { useState, useRef, useEffect } from 'react';
import {
    Dices,
    TrendingUp,
    Pin,
    Piano,
    Guitar,
    Music2,
    Wind,
    MicVocal,
    MoveVertical,
    Palette,
} from 'lucide-react';
import DoubleStepper from '../common/DoubleStepper';
import GenericStepper from '../common/GenericStepper';
import { ALL_NOTES } from '../../theory/noteUtils';
import './styles/RangeControls.css';

const getNoteValue = (note) => {
    if (!note) return 60;
    const match = note.match(/^([A-G][#b♯♭]?)(-?\d+)$/);
    if (!match) return 60;
    let pc = match[1].replace('#', '♯').replace('b', '♭');
    const oct = parseInt(match[2], 10);
    const enharmonics = { 'C♯': 'D♭', 'D♯': 'E♭', 'G♯': 'A♭', 'A♯': 'B♭' };
    if (enharmonics[pc]) pc = enharmonics[pc];
    const pcIndex = ALL_NOTES.indexOf(pc);
    return pcIndex === -1 ? 60 : (oct + 1) * 12 + pcIndex;
};

const getNoteFromValue = (val) => {
    const oct = Math.floor(val / 12) - 1;
    const pcIndex = val % 12;
    return `${ALL_NOTES[pcIndex]}${oct}`;
};

const formatNoteLabel = (note, baseSize = '24px', subSize = '0.7em', fontFamily = 'serif') => {
    const match = note.match(/^([A-G][#b♯♭]?)(-?\d+)$/);
    if (!match) return note;
    return (
        <div className="rc-note-label">
            <span style={{ fontSize: baseSize, fontFamily: fontFamily }}>
                {match[1]}<sub style={{ fontSize: subSize }}>{match[2]}</sub>
            </span>
        </div>
    );
};

const RangeControls = ({
    activeSettings,
    setSettings,
    tonic,
    activeClef,
    instrumentOptions: oldOptions,
    setInstrument,
    noteColoringMode,
    setNoteColoringMode,
    onSettingsInteraction,
}) => {
    const range = activeSettings?.range || { min: 'C4', max: 'E5' };
    const rangeMode = activeSettings?.rangeMode || 'STANDARD';

    const VOCAL_RANGES = [
        { label: 'Bass', min: 'G2', max: 'C4', clef: 'bass' },
        { label: 'Baritone', min: 'B2', max: 'F4', clef: 'bass' },
        { label: 'Tenor', min: 'D3', max: 'A4', clef: 'tenor' },
        { label: 'Alto', min: 'F3', max: 'C5', clef: 'alto' },
        { label: 'Mezzo-soprano', min: 'A3', max: 'G5', clef: 'mezzo-soprano' },
        { label: 'Soprano', min: 'C4', max: 'G6', clef: 'soprano' },
    ];

    const PRESET_RANGES = {
        STANDARD: {
            treble: { min: 'C4', max: 'E5' },
            bass: { min: 'A2', max: 'C4' }
        },
        LARGE: {
            treble: { min: 'C4', max: 'G5' },
            bass: { min: 'G2', max: 'C4' }
        },
        FULL: {
            treble: { min: 'A3', max: 'C6' },
            bass: { min: 'C2', max: 'E4' }
        }
    };

    const isCustom = !['STANDARD', 'LARGE', 'FULL', 'relative'].includes(rangeMode) && !VOCAL_RANGES.some(r => r.label === rangeMode);
    const [lastPreset, setLastPreset] = useState('STANDARD');

    const getActiveClefCategory = () => {
        const pref = activeSettings?.preferredClef || activeClef;
        if (VOCAL_RANGES.some(r => r.label === rangeMode)) return 'vocal';
        if (['alto', 'tenor', 'soprano', 'mezzo-soprano'].includes(pref)) return 'vocal';
        if (pref === 'bass') return 'f-clef';
        return 'g-clef';
    };

    const handleRangeChange = (bound, newVal) => {
        setSettings(prev => {
            const currentMin = getNoteValue(prev.range.min);
            const currentMax = getNoteValue(prev.range.max);
            let newMin = bound === 'min' ? newVal : currentMin;
            let newMax = bound === 'max' ? newVal : currentMax;

            if (newMax - newMin < 12) {
                if (bound === 'min') newMax = newMin + 12;
                else newMin = newMax - 12;
            }

            if (newMin < 21) { newMin = 21; if (newMax < 33) newMax = 33; }
            if (newMax > 108) { newMax = 108; if (newMin > 96) newMin = 96; }

            const nextRange = { min: getNoteFromValue(newMin), max: getNoteFromValue(newMax) };
            let nextMode = 'CUSTOM';
            for (const m of ['STANDARD', 'LARGE', 'FULL']) {
                const p = PRESET_RANGES[m][activeClef === 'treble' ? 'treble' : 'bass'];
                if (p.min === nextRange.min && p.max === nextRange.max) {
                    nextMode = m;
                    setLastPreset(m);
                    break;
                }
            }
            return { ...prev, range: nextRange, rangeMode: nextMode };
        });
    };

    // Filtered Instruments (No Percussion)
    const INSTRUMENTS = {
        'Piano': 'acoustic_grand_piano',
        'Harp': 'orchestral_harp',
        'Guitar Nylon': 'acoustic_guitar_nylon',
        'Guitar Steel': 'acoustic_guitar_steel',
        'Guitar Clean': 'electric_guitar_clean',
        'Bass Picked': 'electric_bass_pick',
        'Synth Bass': 'synth_bass_1',
        'Violin': 'violin',
        'Ensemble': 'string_ensemble_1',
        'Trumpet': 'trumpet',
        'Saxophone': 'tenor_sax',
        'Flute': 'flute',
        'Voice Oohs': 'voice_oohs',
    };

    const getIconForInstrument = (id) => {
        const size = 18; // Increased by ~15% from 16
        if (['acoustic_grand_piano', 'orchestral_harp'].includes(id)) return <Piano size={size} />;
        if (['acoustic_guitar_nylon', 'acoustic_guitar_steel', 'electric_guitar_clean', 'electric_bass_pick', 'synth_bass_1'].includes(id)) return <Guitar size={size} />;
        if (['violin', 'string_ensemble_1'].includes(id)) return <Music2 size={size} />;
        if (['trumpet', 'tenor_sax', 'flute'].includes(id)) return <Wind size={size} />;
        if (['voice_oohs'].includes(id)) return <MicVocal size={size} />;
        return <Music2 size={size} />;
    };

    const currentInstrument = activeSettings?.instrument || 'acoustic_grand_piano';
    const instrumentOptionsList = Object.keys(INSTRUMENTS).map(name => ({
        label: name.toUpperCase(),
        value: INSTRUMENTS[name],
        icon: getIconForInstrument(INSTRUMENTS[name])
    }));

    // Clef Options for GenericStepper
    const clefOptions = [
        { label: <span className="rc-maestro-lg" style={{ transform: 'translateY(2px)' }}>&</span>, value: 'g-clef' },
        { label: <span className="rc-maestro-lg" style={{ transform: 'translateY(-8px)' }}>?</span>, value: 'f-clef' }, // Bass clef adjusted +8px (-12 -> -4 -> -8)
        { label: <span className="rc-maestro-lg" style={{ transform: 'translateY(-8px)' }}>B</span>, value: 'vocal' } // Vocal clef adjusted +4px (-4 -> 0 -> -8)
    ];

    const currentCat = getActiveClefCategory();

    const gClef = <span className="rc-maestro-sm">&</span>;
    const fClef = <span className="rc-maestro-sm">?</span>;
    const vClef = <span className="rc-maestro-sm">B</span>;

    // Range Options for LIST Picker — all options visible regardless of current clef
    const rangeOptionsList = [
        { label: 'TREBLE 8VA',      value: 'TREBLE_RELATIVE',     icon: gClef },
        { label: 'TREBLE 15MA',     value: 'TREBLE_RELATIVE_15A', icon: gClef },
        { label: 'TREBLE FULL',     value: 'FULL_TREBLE',         icon: gClef },
        { label: 'TREBLE LARGE',    value: 'LARGE_TREBLE',        icon: gClef },
        { label: 'TREBLE STANDARD', value: 'STANDARD_TREBLE',     icon: gClef },
        { label: 'BASS 8VB',        value: 'BASS_RELATIVE',       icon: fClef },
        { label: 'BASS LOW',        value: 'BASS_RELATIVE_LOW',   icon: fClef },
        { label: 'BASS FULL',       value: 'FULL_BASS',           icon: fClef },
        { label: 'BASS LARGE',      value: 'LARGE_BASS',          icon: fClef },
        { label: 'BASS STANDARD',   value: 'STANDARD_BASS',       icon: fClef },
        // VOCAL reversed: Soprano at top
        ...[...VOCAL_RANGES].reverse().map(v => ({ label: v.label.toUpperCase(), value: v.label, icon: vClef }))
    ];

    // Clef-specific stepper cycles
    const TREBLE_STEPPER = ['STANDARD', 'LARGE', 'FULL', 'relative', 'relative_15a'];
    const BASS_STEPPER   = ['STANDARD', 'LARGE', 'FULL', 'relative', 'relative_low'];
    const VOCAL_STEPPER  = VOCAL_RANGES.map(v => v.label);

    const rangeOptionsStepper = currentCat === 'g-clef' ? TREBLE_STEPPER
        : currentCat === 'f-clef' ? BASS_STEPPER
        : VOCAL_STEPPER;

    return (
        <div className="range-controls">
            {/* 1. Lower Bound */}
            <div className="rc-col">
                <DoubleStepper
                    value={getNoteValue(range.min)}
                    onChange={(val) => { onSettingsInteraction?.(); handleRangeChange('min', val); }}
                    label={formatNoteLabel(range.min)}
                    fontSize="48px"
                    min={21} max={108}
                />
            </div>

            {/* 1b. Palette Toggler (between lower bound and clef) */}
            <div className="rc-col">
                {setNoteColoringMode && (
                    <button
                        onClick={() => {
                            const COLOR_MODES = ['none', 'tonic_scale_keys', 'chords', 'chromatone', 'subtle-chroma'];
                            const idx = COLOR_MODES.indexOf(noteColoringMode);
                            setNoteColoringMode(COLOR_MODES[(idx + 1) % COLOR_MODES.length]);
                        }}
                        className="rc-palette-btn"
                    >
                        <div
                            className="rc-palette-icon-wrap"
                            style={{
                                color: noteColoringMode === 'none' ? 'var(--text-primary)' :
                                    noteColoringMode === 'subtle-chroma' ? 'url(#subtle-chromatone-gradient-hdr)' :
                                        noteColoringMode === 'chromatone' ? 'url(#chromatone-gradient-hdr)' :
                                            noteColoringMode === 'chords' ? '#90EE90' :
                                                'var(--note-tonic)'
                            }}
                        >
                            <Palette size={22} color={noteColoringMode === 'chromatone' ? 'url(#chromatone-gradient-hdr)' : noteColoringMode === 'subtle-chroma' ? 'url(#subtle-chromatone-gradient-hdr)' : 'currentColor'} fill="none" />
                        </div>
                        <span
                            className="rc-palette-label"
                            style={{
                                color: noteColoringMode === 'none' ? 'var(--text-primary)' :
                                    noteColoringMode === 'subtle-chroma' ? 'url(#subtle-chromatone-gradient-hdr)' :
                                        noteColoringMode === 'chromatone' ? 'url(#chromatone-gradient-hdr)' :
                                            noteColoringMode === 'chords' ? '#90EE90' :
                                                'var(--note-tonic)'
                            }}
                        >
                            {{
                                none: 'NO COLOR',
                                tonic_scale_keys: 'TONICS',
                                chords: 'CHORDS',
                                chromatone: 'CHROMATONE',
                                'subtle-chroma': 'SUBTLE CHROMA'
                            }[noteColoringMode] || 'NO COLOR'}
                        </span>
                    </button>
                )}
            </div>

            {/* 2. Clef Selector (Reduced height) */}
            <div className="rc-col">
                <GenericStepper
                    value={currentCat}
                    label={clefOptions.find(o => o.value === currentCat)?.label}
                    options={clefOptions}
                    allowedValues={['g-clef', 'f-clef', 'vocal']}
                    shouldCycle={true}
                    height="29px" // Decreased 10%
                    onChange={(val) => {
                        if (val === 'g-clef') {
                            setSettings(prev => ({ ...prev, range: { min: 'A3', max: 'C5' }, preferredClef: 'treble', rangeMode: 'default' }));
                        } else if (val === 'f-clef') {
                            setSettings(prev => ({ ...prev, range: { min: 'C2', max: 'E4' }, preferredClef: 'bass', rangeMode: 'default' }));
                        } else {
                            setSettings(prev => ({ ...prev, range: { min: 'F3', max: 'C5' }, preferredClef: 'alto', rangeMode: 'Alto' }));
                        }
                    }}
                    background="none"
                />
            </div>

            {/* 3. Range Mode */}
            <div className="rc-col-padded">
                <GenericStepper
                    value={rangeMode}
                    label={
                        (() => {
                            if (currentCat === 'vocal') return (VOCAL_RANGES.find(v => v.label === rangeMode)?.label.toUpperCase() || (isCustom ? 'CUSTOM' : rangeMode));
                            if (rangeMode === 'relative') return (activeClef === 'treble' ? '8VA' : '8VB');
                            if (rangeMode === 'relative_15a') return '15MA';
                            if (rangeMode === 'relative_low') return '8VB LOW';
                            return isCustom ? 'CUSTOM' : rangeMode;
                        })()
                    }
                    options={rangeOptionsList}
                    allowedValues={rangeOptionsStepper}
                    shouldCycle={true}
                    fontSize="12px"
                    fontFamily="sans-serif"
                    uppercase={true}
                    height="29px"
                    onChange={(val) => {
                        onSettingsInteraction?.();
                        // Handle synthetic clef-prefixed values from list picker
                        if (val === 'TREBLE_RELATIVE') {
                            setSettings(p => ({ ...p, rangeMode: 'relative', preferredClef: 'treble' }));
                        } else if (val === 'TREBLE_RELATIVE_15A') {
                            setSettings(p => ({ ...p, rangeMode: 'relative_15a', preferredClef: 'treble' }));
                        } else if (val === 'BASS_RELATIVE') {
                            setSettings(p => ({ ...p, rangeMode: 'relative', preferredClef: 'bass' }));
                        } else if (val === 'BASS_RELATIVE_LOW') {
                            setSettings(p => ({ ...p, rangeMode: 'relative_low', preferredClef: 'bass' }));
                        } else if (val === 'relative') {
                            setSettings(p => ({ ...p, rangeMode: 'relative' }));
                        } else if (val === 'relative_15a') {
                            setSettings(p => ({ ...p, rangeMode: 'relative_15a' }));
                        } else if (val === 'relative_low') {
                            setSettings(p => ({ ...p, rangeMode: 'relative_low' }));
                        } else if (val.includes('_')) {
                            const parts = val.split('_');
                            const clef = parts[parts.length - 1].toLowerCase();
                            const mode = parts.slice(0, -1).join('_');
                            const preset = PRESET_RANGES[mode]?.[clef];
                            if (preset) {
                                setSettings(p => ({ ...p, rangeMode: mode, range: preset, preferredClef: clef === 'treble' ? 'treble' : 'bass' }));
                                setLastPreset(mode);
                            }
                        } else if (['STANDARD', 'LARGE', 'FULL'].includes(val)) {
                            const preset = PRESET_RANGES[val][activeClef === 'treble' ? 'treble' : 'bass'];
                            setSettings(p => ({ ...p, rangeMode: val, range: preset }));
                            setLastPreset(val);
                        } else {
                            const preset = VOCAL_RANGES.find(v => v.label === val);
                            if (preset) setSettings(p => ({ ...p, range: { min: preset.min, max: preset.max }, preferredClef: preset.clef, rangeMode: preset.label }));
                        }
                    }}
                    background="none"
                    lowlighted={isCustom}
                />
            </div>

            {/* 4. Instrument Selector */}
            <div className="rc-col-padded">
                <GenericStepper
                    value={currentInstrument}
                    label={(Object.keys(INSTRUMENTS).find(k => INSTRUMENTS[k] === currentInstrument) || 'PIANO').toUpperCase()}
                    options={instrumentOptionsList}
                    allowedValues={instrumentOptionsList.map(o => o.value)}
                    fontSize="12px"
                    fontFamily="sans-serif"
                    uppercase={true}
                    shouldCycle={true}
                    height="29px"
                    onChange={(val) => setInstrument(val)}
                    icon={getIconForInstrument(currentInstrument)}
                    background="none"
                />
            </div>

            {/* 5. Upper Bound */}
            <div className="rc-col">
                <DoubleStepper
                    value={getNoteValue(range.max)}
                    onChange={(val) => { onSettingsInteraction?.(); handleRangeChange('max', val); }}
                    label={formatNoteLabel(range.max)}
                    fontSize="48px"
                    min={21} max={108}
                />
            </div>
        </div>
    );
};

export default RangeControls;
