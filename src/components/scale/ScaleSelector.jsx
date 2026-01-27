// components/ScaleSelector.jsx

import React, {useState, useEffect} from 'react';
import PianoView from '../bottom/PianoView';
import ScaleSelectorWheel from './ScaleSelectorWheel'
import generateAllNotesArray from '../../utils/allNotesArray';
import { generateSelectedScale, updateScaleWithTonic, updateScaleWithMode, modes, getCleanModeName, scaleDefinitions } from '../../utils/scaleHandler';

const ScaleSelector = ({
                           trebleInstrument, windowSize, scale, scaleRange, setScale, setSelectedMode, setTonic
                       }) => {
    const allNotesArray = generateAllNotesArray();

    /* =========================
       UI STATE (presentation)
       ========================= */
    const [scaleModeUI, setScaleModeUI] = useState('wheel'); // 'wheel' | 'list' | 'search'
    const [selectTonic, setSelectTonic] = useState(true);
    const [selectedFamily, setSelectedFamily] = useState('Diatonic');
    const [searchQuery, setSearchQuery] = useState('');
    // Available families for wheel view
    const wheelFamilies = ['Diatonic', 'Melodic', 'Harmonic Major', 'Harmonic Minor', 'Double Harmonic'];
    
    // Initialize wheelFamily based on current scale, default to Diatonic
    const [wheelFamily, setWheelFamily] = useState(() => {
        if (scale && wheelFamilies.includes(scale.family)) {
            return scale.family;
        }
        return 'Diatonic';
    }); // Family for wheel view

    // Sync wheelFamily when scale changes externally
    useEffect(() => {
        if (scale && wheelFamilies.includes(scale.family)) {
            setWheelFamily(scale.family);
        }
    }, [scale?.family]);

    /* =========================
       HANDLE MODE CHANGE
       ========================= */
    const handleModeChange = (newFamily, newMode) => {
        if (!scale) return;

        const updatedScale = updateScaleWithMode({ currentScale: scale, newFamily, newMode });

        setScale(updatedScale);
        setSelectedMode(newMode);

        console.log('🔹 Mode changed:', newMode, '→ Scale updated with tonic:', updatedScale.tonic);
    };

    // Format display name: remove octave from tonic, remove numeral from mode name
    const formatDisplayName = (tonic, modeName, family) => {
        // Remove octave number from tonic (e.g., "C#4" -> "C#")
        const tonicWithoutOctave = tonic.replace(/\d+$/, '');
        // Get clean mode name (without index prefix like "II. ")
        const cleanModeName = getCleanModeName(family, modeName) || modeName.replace(/^[IVX]+\.\s*/, '');
        return `${tonicWithoutOctave} ${cleanModeName}`;
    };


    /* =========================
       TONIC CHANGE HANDLER
       ========================= */
    const handleTonicChange = (newTonic) => {
        if (!scale) return;

        const updatedScale = updateScaleWithTonic({ currentScale: scale, newTonic });

        setTonic(newTonic);
        setScale(updatedScale);

        console.log('🔹 Tonic changed:', newTonic, '→ Scale updated:', updatedScale.name, updatedScale.family);
    };

    /* =========================
       LAYOUT
       ========================= */
    const modeEmojis = {
        wheel: '🎡',
        list: '📋',
        search: '🔍'
    };

    // Get families for list view in specific order
    const listFamilies = ['Simple', 'Pentatonic', 'Hexatonic', 'Diatonic', 'Other Heptatonic', 'Supertonic']
        .filter(family => modes.hasOwnProperty(family));
    
    // Search functionality (with alias support)
    const searchResults = searchQuery.trim() ? (() => {
        const query = searchQuery.toLowerCase();
        const results = [];
        
        for (const [family, familyModes] of Object.entries(modes)) {
            for (const [modeName, intervals] of Object.entries(familyModes)) {
                const cleanModeName = getCleanModeName(family, modeName) || modeName.replace(/^[IVX]+\.\s*/, '');
                
                // Get aliases from scaleDefinitions if available
                const modeDef = scaleDefinitions[family]?.find(def => {
                    const legacyKey = def.index 
                        ? `${def.index}. ${def.displayName || def.name}`
                        : (def.displayName || def.name);
                    return legacyKey === modeName || def.name === cleanModeName;
                });
                const aliases = modeDef?.aliases || [];
                
                // Build searchable text including aliases
                const searchableText = `${family} ${cleanModeName} ${modeName} ${aliases.join(' ')}`.toLowerCase();
                
                if (searchableText.includes(query)) {
                    results.push({ family, modeName, cleanModeName });
                }
            }
        }
        
        return results;
    })() : [];

    return (<div
        style={{
            width: '100%', height: '100%', display: 'flex', flexDirection: 'column'
        }}
    >
        {/* =========================
          TOP 2/3 — SCALE SELECTION
          ========================= */}
        <div style={{flex: 2, display: 'flex', flexDirection: 'column', gap: 12, padding: 12}}>
            {/* TOP: Mode selector buttons (horizontal) */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                {['list', 'wheel', 'search'].map(mode => (
                    <button
                        key={mode}
                        onClick={() => setScaleModeUI(mode)}
                        style={{
                            padding: '8px 16px',
                            borderRadius: 6,
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: scaleModeUI === mode ? '#666' : '#444',
                            color: 'white',
                            fontSize: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                        }}
                        title={mode.charAt(0).toUpperCase() + mode.slice(1)}
                    >
                        <span>{modeEmojis[mode]}</span>
                        <span>{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
                    </button>
                ))}
            </div>

            {/* CONTENT: Based on mode */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'row', gap: 12 }}>
                {/* Wheel mode: families on left, wheel in center/right */}
                {scaleModeUI === 'wheel' && (
                    <>
                        <div style={{ width: '180px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ color: 'white', fontWeight: 'bold', textAlign: 'center', marginBottom: 4, fontSize: '14px' }}>
                                Families
                            </div>
                            {wheelFamilies.map(family => (
                                <button
                                    key={family}
                                    onClick={() => {
                                        setWheelFamily(family);
                                        const firstMode = Object.keys(modes[family])[0];
                                        const updatedScale = updateScaleWithMode({
                                            currentScale: scale,
                                            newFamily: family,
                                            newMode: firstMode,
                                        });
                                        setScale(updatedScale);
                                        setSelectedMode(firstMode);
                                    }}
                                    style={{
                                        padding: '6px 8px',
                                        borderRadius: 4,
                                        border: '1px solid #555',
                                        cursor: 'pointer',
                                        backgroundColor: wheelFamily === family ? '#666' : '#444',
                                        color: 'white',
                                        textAlign: 'center',
                                        fontSize: '11px',
                                        width: '100%'
                                    }}
                                >
                                    {family}
                                </button>
                            ))}
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
                            {scale && (
                                <div style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
                                    {formatDisplayName(scale.tonic, scale.name, scale.family)}
                                </div>
                            )}
                            <ScaleSelectorWheel
                                family={wheelFamily}
                                activeMode={scale.family === wheelFamily ? scale.name : null}
                                onSelect={(mode) => {
                                    const updatedScale = updateScaleWithMode({
                                        currentScale: scale,
                                        newFamily: wheelFamily,
                                        newMode: mode,
                                    });
                                    setScale(updatedScale);
                                    setSelectedMode(mode);
                                }}
                            />
                        </div>
                    </>
                )}

                {/* List mode: families on left, scales on right */}
                {scaleModeUI === 'list' && (
                    <>
                        <div style={{ width: '180px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ color: 'white', fontWeight: 'bold', textAlign: 'center', marginBottom: 4, fontSize: '14px' }}>
                                Families
                            </div>
                            {listFamilies.map(family => (
                                <button
                                    key={family}
                                    onClick={() => {
                                        setSelectedFamily(family);
                                        const firstMode = Object.keys(modes[family])[0];
                                        const updatedScale = updateScaleWithMode({
                                            currentScale: scale,
                                            newFamily: family,
                                            newMode: firstMode,
                                        });
                                        setScale(updatedScale);
                                        setSelectedMode(firstMode);
                                    }}
                                    style={{
                                        padding: '6px 8px',
                                        borderRadius: 4,
                                        border: '1px solid #555',
                                        cursor: 'pointer',
                                        backgroundColor: selectedFamily === family ? '#666' : '#444',
                                        color: 'white',
                                        textAlign: 'center',
                                        fontSize: '11px',
                                        width: '100%'
                                    }}
                                >
                                    {family}
                                </button>
                            ))}
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {scale && (
                                <div style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
                                    {formatDisplayName(scale.tonic, scale.name, scale.family)}
                                </div>
                            )}
                            <div
                                className="mode-buttons-container"
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '2px',
                                    justifyContent: 'center',
                                }}
                            >
                                {selectedFamily &&
                                    Object.keys(modes[selectedFamily]).map(mode => {
                                        const cleanModeName = getCleanModeName(selectedFamily, mode) || mode.replace(/^[IVX]+\.\s*/, '');
                                        return (
                                            <button
                                                key={mode}
                                                className={`scale-selector-button ${scale.name === mode ? 'active' : ''}`}
                                                onClick={() => {
                                                    const updatedScale = updateScaleWithMode({
                                                        currentScale: scale,
                                                        newFamily: selectedFamily,
                                                        newMode: mode,
                                                    });
                                                    setScale(updatedScale);
                                                    setSelectedMode(mode);
                                                }}
                                            >
                                                {cleanModeName}
                                            </button>
                                        );
                                    })}
                            </div>
                        </div>
                    </>
                )}

                {/* Search mode: search input and results */}
                {scaleModeUI === 'search' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {scale && (
                            <div style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
                                {formatDisplayName(scale.tonic, scale.name, scale.family)}
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                            <input
                                type="text"
                                placeholder="Search scales or families..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    padding: '10px 16px',
                                    borderRadius: 6,
                                    border: '1px solid #555',
                                    backgroundColor: '#333',
                                    color: 'white',
                                    fontSize: '14px',
                                    width: '100%',
                                    maxWidth: '500px'
                                }}
                            />
                            {searchResults.length > 0 && (
                                <div style={{ 
                                    display: 'flex', 
                                    flexWrap: 'wrap', 
                                    gap: '4px', 
                                    justifyContent: 'center',
                                    maxHeight: '400px',
                                    overflowY: 'auto',
                                    width: '100%'
                                }}>
                                    {searchResults.map((result, idx) => (
                                        <button
                                            key={`${result.family}-${result.modeName}-${idx}`}
                                            className={`scale-selector-button ${scale?.family === result.family && scale?.name === result.modeName ? 'active' : ''}`}
                                            onClick={() => {
                                                const updatedScale = updateScaleWithMode({
                                                    currentScale: scale,
                                                    newFamily: result.family,
                                                    newMode: result.modeName,
                                                });
                                                setScale(updatedScale);
                                                setSelectedMode(result.modeName);
                                            }}
                                            style={{ fontSize: '12px' }}
                                        >
                                            {result.family}: {result.cleanModeName}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {searchQuery.trim() && searchResults.length === 0 && (
                                <div style={{ color: '#888', textAlign: 'center' }}>
                                    No results found
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* =========================
          BOTTOM 1/3 — PIANO
          ========================= */}
        <div style={{flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 12}}>
            {trebleInstrument && scale && (
                <PianoView
                    scale={scale}
                    trebleInstrument={trebleInstrument}
                    interactionMode={selectTonic ? 'select-tonic' : 'play'}
                    onTonicSelect={handleTonicChange}
                    minNote = 'A3'
                    maxNote = 'G5'
                />
            )}
        </div>
    </div>);
};

export default ScaleSelector;
