// components/ScaleSelector.jsx

import React, { useState, useEffect } from 'react';
import PianoView from '../bottom/PianoView';
import ScaleSelectorWheel from './ScaleSelectorWheel'
import generateAllNotesArray from '../../utils/allNotesArray';
import { generateSelectedScale, updateScaleWithTonic, updateScaleWithMode, modes, getCleanModeName, scaleDefinitions } from '../../utils/scaleHandler';

const ScaleSelector = ({
    trebleInstrument, windowSize, scale, scaleRange, setScale, setSelectedMode, setTonic, setCustomScaleLabel
    // Add these props if they aren't there, or use local if they are just for UI
}) => {
    const allNotesArray = generateAllNotesArray();

    /* =========================
       UI STATE (presentation)
       ========================= */
    const wheelFamilies = ['Diatonic', 'Melodic', 'Harmonic Major', 'Harmonic Minor', 'Double Harmonic'];

    const [scaleModeUI, setScaleModeUI] = useState(() => {
        if (scale && wheelFamilies.includes(scale.family)) return 'wheel';
        return 'list';
    });
    const [selectTonic, setSelectTonic] = useState(true);
    const [selectedFamily, setSelectedFamily] = useState(() => scale?.family || 'Diatonic');
    const [searchQuery, setSearchQuery] = useState('');
    const [wheelSize, setWheelSize] = useState(0); // start bij 0, wordt later gemeten


    // Initialize wheelFamily based on current scale, default to Diatonic
    const [wheelFamily, setWheelFamily] = useState(() => {
        if (scale && wheelFamilies.includes(scale.family)) {
            return scale.family;
        }
        return 'Diatonic';
    });


    // Sync state when scale changes externally (e.g. from search or random)
    useEffect(() => {
        if (scale) {
            setSelectedFamily(scale.family);
            if (wheelFamilies.includes(scale.family)) {
                setWheelFamily(scale.family);
            }
        }
    }, [scale?.family, scale?.name]);

    /* =========================
       HANDLE MODE CHANGE
       ========================= */
    const handleModeChange = (newFamily, newMode) => {
        if (!scale) return;
        const updatedScale = updateScaleWithMode({ currentScale: scale, newFamily, newMode });
        setScale(updatedScale);
        setSelectedMode(newMode);
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

    const handleRandomScale = () => {
        const familyKeys = Object.keys(scaleDefinitions);
        const randomFamily = familyKeys[Math.floor(Math.random() * familyKeys.length)];
        const familyModes = scaleDefinitions[randomFamily];
        const randomModeDef = familyModes[Math.floor(Math.random() * familyModes.length)];

        const modeName = randomModeDef.index
            ? `${randomModeDef.index}. ${randomModeDef.displayName || randomModeDef.name}`
            : (randomModeDef.displayName || randomModeDef.name);

        const updatedScale = updateScaleWithMode({
            currentScale: scale,
            newFamily: randomFamily,
            newMode: modeName
        });

        setScale(updatedScale);
        setSelectedMode(modeName);

        // Auto-switch view
        if (wheelFamilies.includes(randomFamily)) {
            setScaleModeUI('wheel');
            setWheelFamily(randomFamily);
        } else {
            setScaleModeUI('list');
            setSelectedFamily(randomFamily);
        }
        if (setCustomScaleLabel) setCustomScaleLabel(null);
    };

    /* =========================
       LAYOUT
       ========================= */
    const ListIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>;
    const WheelIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 2v20" /><path d="M2 12h20" /><path d="m4.93 4.93 14.14 14.14" /><path d="m19.07 4.93-14.14 14.14" /></svg>;
    const SearchIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
    const ShuffleIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>;

    const modeIcons = {
        wheel: <WheelIcon />,
        list: <ListIcon />,
        search: <SearchIcon />,
        random: <ShuffleIcon />
    };

    // Get families for list view in specific order
    const listFamilies = ['Simple', 'Pentatonic', 'Hexatonic', 'Diatonic', 'Other Heptatonic', 'Supertonic'];

    // Search functionality
    const searchResults = searchQuery.trim() ? (() => {
        const query = searchQuery.toLowerCase();
        const results = [];
        for (const [family, familyModes] of Object.entries(modes)) {
            for (const [modeName, intervals] of Object.entries(familyModes)) {
                const cleanModeName = getCleanModeName(family, modeName) || modeName.replace(/^[IVX]+\.\s*/, '');
                const modeDef = scaleDefinitions[family]?.find(def => {
                    const legacyKey = def.index ? `${def.index}. ${def.displayName || def.name}` : (def.displayName || def.name);
                    return legacyKey === modeName || def.name === cleanModeName;
                });
                const aliases = modeDef?.aliases || [];
                const searchableText = `${family} ${cleanModeName} ${modeName} ${aliases.join(' ')}`.toLowerCase();
                if (searchableText.includes(query)) {
                    results.push({ family, modeName, cleanModeName });
                }
            }
        }
        return results;
    })() : [];

    return (<div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* TOP: Mode selector buttons (horizontal) */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2px', padding: '0px 0px' }}>
            {['list', 'wheel', 'search'].map(mode => (
                <button
                    key={mode}
                    className={`tab-button ${scaleModeUI === mode ? 'active' : ''}`}
                    onClick={() => setScaleModeUI(mode)}
                    style={{ minWidth: '65px' }}
                >
                    {modeIcons[mode]}
                    <span className="tab-label" style={{ fontSize: '9px' }}>{mode}</span>
                </button>
            ))}
            <button
                className="tab-button"
                onClick={handleRandomScale}
                style={{ minWidth: '65px' }}
                title="Random Scale"
            >
                {modeIcons.random}
                <span className="tab-label" style={{ fontSize: '9px' }}>Random</span>
            </button>
        </div>

        {/* ACTIVE SCALE NAME */}
        {scaleModeUI !== 'search' && (
            <div style={{ padding: '0px 0', color: 'white', fontWeight: 'bold', textAlign: 'center', fontSize: '20px' }}>
                {formatDisplayName(scale.tonic, scale.name, scale.family)}
            </div>
        )}

        {/* CONTENT AREA */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 0', gap: 8 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'row', gap: 0, minHeight: 0 }}>
                {/* Wheel mode: families on left, wheel in center/right */}
                {scaleModeUI === 'wheel' && (
                    <>
                        <div style={{ width: '30%', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', padding: 0 }}>
                            <div style={{ color: '#888', fontWeight: 'bold', textAlign: 'center', marginBottom: 2, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', height: '14px', lineHeight: '14px' }}>
                                FAMILIES
                            </div>
                            {wheelFamilies.map(family => (
                                <button
                                    key={family}
                                    className={`scale-selector-button ${wheelFamily === family ? 'active' : ''}`}
                                    onClick={() => setWheelFamily(family)}
                                    style={{
                                        width: '100%',
                                        margin: '0',
                                        fontSize: '11px',
                                        padding: '0',
                                        height: '24px'
                                    }}
                                >
                                    {family}
                                </button>
                            ))}
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
                            <div style={{ color: '#888', fontWeight: 'bold', textAlign: 'center', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', height: '14px', lineHeight: '14px' }}>
                                MODE
                            </div>
                            <div
                                ref={(el) => {
                                    if (!el) return;
                                    const observer = new ResizeObserver((entries) => {
                                        if (entries[0]) {
                                            const { width, height } = entries[0].contentRect;
                                            const newSize = Math.min(width, height);
                                            setWheelSize(newSize);
                                        }
                                    });
                                    observer.observe(el);
                                }}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minHeight: 0 }}
                            >
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
                                        if (setCustomScaleLabel) setCustomScaleLabel(null);
                                    }}
                                />
                            </div>
                        </div>
                    </>
                )}

                {/* List mode: families on left, scales on right */}
                {scaleModeUI === 'list' && (
                    <>
                        <div style={{ width: '30%', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', padding: 0 }}>
                            <div style={{ color: '#888', fontWeight: 'bold', textAlign: 'center', marginBottom: 2, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', height: '14px', lineHeight: '14px' }}>
                                FAMILIES
                            </div>
                            {listFamilies.map(family => (
                                <button
                                    key={family}
                                    className={`scale-selector-button ${selectedFamily === family ? 'active' : ''}`}
                                    onClick={() => setSelectedFamily(family)}
                                    style={{
                                        width: '100%',
                                        margin: '0',
                                        fontSize: '11px',
                                        padding: '0',
                                        height: '24px',
                                    }}
                                >
                                    {family}
                                </button>
                            ))}
                        </div>
                        <div style={{ width: '20px', flexShrink: 0 }} />
                        <div style={{ flex: 1, gap: 4, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <div style={{ color: '#888', fontWeight: 'bold', textAlign: 'center', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', height: '14px', lineHeight: '14px' }}>
                                SCALE
                            </div>
                            <div
                                className="mode-buttons-container"
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    columnGap: '10%', // 👈 space BETWEEN columns only
                                    rowGap: '4px',     // keep your vertical rhythm
                                    justifyContent: 'center',
                                    overflowY: 'auto',
                                    flex: 1
                                }}
                            >
                                {selectedFamily &&
                                    Object.keys(modes[selectedFamily]).map(mode => {
                                        const cleanModeName = getCleanModeName(selectedFamily, mode) || mode.replace(/^[IVX]+\.\s*/, '');
                                        const isActive = scale.family === selectedFamily && scale.name === mode;
                                        return (
                                            <button
                                                key={mode}
                                                className={`scale-selector-button ${isActive ? 'active' : ''}`}
                                                onClick={() => {
                                                    const updatedScale = updateScaleWithMode({
                                                        currentScale: scale,
                                                        newFamily: selectedFamily,
                                                        newMode: mode,
                                                    });
                                                    setScale(updatedScale);
                                                    setSelectedMode(mode);
                                                    if (setCustomScaleLabel) setCustomScaleLabel(null);
                                                }}
                                                style={{
                                                    fontSize: '11px',
                                                    width: 'auto', flexBasis: '44.5%',
                                                    height: '24px', textAlign: 'center'
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
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                            <input
                                type="text"
                                placeholder="Search scales or families..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    padding: '10px 16px',
                                    borderRadius: 6,
                                    border: '1px solid var(--text-primary)',
                                    backgroundColor: 'transparent',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                    width: '100%',
                                    maxWidth: '500px'
                                }}
                                autoFocus
                            />
                            {searchResults.length > 0 && (
                                <div style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '8px',
                                    justifyContent: 'center',
                                    backgroundColor: 'black',
                                    overflowY: 'auto',
                                    width: '100%',
                                    paddingBottom: '20px'
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

                                                // Reset view
                                                if (wheelFamilies.includes(result.family)) {
                                                    setScaleModeUI('wheel');
                                                    setWheelFamily(result.family);
                                                } else {
                                                    setScaleModeUI('list');
                                                    setSelectedFamily(result.family);
                                                }

                                                // Handle Alias
                                                if (setCustomScaleLabel) {
                                                    // Check for specific alias match
                                                    // The search result has 'cleanModeName' and 'modeName'. 
                                                    // We want to see if 'searchQuery' matched an alias, OR if this result belongs to a definition that HAS aliases.
                                                    // Actually, if we selected it via search, and it *has* an alias, we probably want to show that if it matched?
                                                    // User said: "use the alias".
                                                    // Let's try to find if the current result corresponds to a definition that has a relevant alias.

                                                    const def = scaleDefinitions[result.family]?.find(d => d.name === result.cleanModeName || (d.displayName || d.name) === result.modeName);
                                                    if (def && def.aliases && def.aliases.length > 0) {
                                                        // Use the first alias, or the one that matched? 
                                                        // Simplest: Use the first alias if available to indicate "This is also known as..."
                                                        // OR if the user typed the alias, show that.
                                                        // Let's just set the first alias as the label if existing.
                                                        setCustomScaleLabel(def.aliases[0]);
                                                    } else {
                                                        setCustomScaleLabel(null);
                                                    }
                                                }
                                            }}
                                            style={{
                                                fontSize: '11px', padding: '2px 4px',
                                                width: 'auto', flexBasis: '48%',
                                                height: 'auto', minHeight: '32px',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                                            }}
                                        >
                                            <div style={{ fontSize: '9px', opacity: 0.7, marginBottom: 2 }}>{result.family}</div>
                                            <div style={{ fontWeight: 'bold' }}>{result.cleanModeName}</div>
                                            {/* Show Aliases if any match query or just show first alias as info */}
                                            {scaleDefinitions[result.family]?.find(def => def.name === result.cleanModeName || (def.displayName || def.name) === result.modeName)?.aliases?.length > 0 && (
                                                <div style={{ fontSize: '9px', opacity: 0.6, marginTop: 2, fontStyle: 'italic' }}>
                                                    {scaleDefinitions[result.family]?.find(def => def.name === result.cleanModeName || (def.displayName || def.name) === result.modeName)?.aliases.join(', ')}
                                                </div>
                                            )}
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
          BOTTOM PIANO (SELECT TONIC)
          ========================= */}
        {scaleModeUI !== 'search' && (
            <div style={{ flex: '0 0 140px', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0px 0px 0px', borderTop: '1px solid #333', }}>
                <div style={{ color: '#888', fontWeight: 'bold', marginBottom: 4, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    SELECT TONIC
                </div>
                <div style={{ width: '100%', flex: 1, display: 'flex', alignItems: 'stretch' }}>
                    {trebleInstrument && scale && (
                        <PianoView
                            scale={scale}
                            trebleInstrument={trebleInstrument}
                            interactionMode={selectTonic ? 'select-tonic' : 'play'}
                            onTonicSelect={handleTonicChange}
                            minNote='A3'
                            maxNote='G5'
                            smallLabels={true}
                        />
                    )}
                </div>
            </div>
        )}
    </div>);
};

export default ScaleSelector;
