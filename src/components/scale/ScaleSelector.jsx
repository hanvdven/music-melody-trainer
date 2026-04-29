// components/ScaleSelector.jsx

import React, { useState, useEffect } from 'react';
import PianoView from '../controls/PianoView';
import ScaleSelectorWheel from './ScaleSelectorWheel';
import generateAllNotesArray from '../../theory/allNotesArray';
import {
  Music,
  Play,
  Square,
  Maximize,
  Minimize,
  Maximize2,
  BookOpen,
  Settings,
  List as ListIcon,
  Search as SearchIcon,
  Shuffle as ShuffleIcon
} from 'lucide-react';
import {
  generateSelectedScale,
  updateScaleWithTonic,
  updateScaleWithMode,
  modes,
  getCleanModeName,
  getModeDefinition,
  formatScaleName,
  scaleDefinitions,
} from '../../theory/scaleHandler';
import './ScaleSelector.css';

const ScaleSelector = ({
  trebleInstrument,
  windowSize,
  scale,
  scaleRange,
  setScale,
  setSelectedMode,
  setTonic,
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
}) => {
  const allNotesArray = generateAllNotesArray();

  /* =========================
       UI STATE (presentation)
       ========================= */
  const wheelFamilies = [
    'Diatonic',
    'Melodic',
    'Harmonic Major',
    'Harmonic Minor',
    'Double Harmonic',
  ];

  const [scaleModeUI, setScaleModeUI] = useState(() => {
    // Initialize view based on isSimpleView
    if (isSimpleView) return 'list';
    if (scale && wheelFamilies.includes(scale.family)) return 'wheel';
    return 'list';
  });
  const [selectTonic, setSelectTonic] = useState(true);
  const [selectedFamily, setSelectedFamily] = useState(() => {
    if (isSimpleView) return 'Simple';
    return scale?.family || 'Diatonic';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [wheelSize, setWheelSize] = useState(0);

  // Initialize wheelFamily based on current scale, default to Diatonic
  const [wheelFamily, setWheelFamily] = useState(() => {
    if (scale && wheelFamilies.includes(scale.family)) {
      return scale.family;
    }
    return 'Diatonic';
  });

  // Sync state when check changes
  useEffect(() => {
    if (!scale) return;

    // Logical Routing High-Level
    if (isSimpleView) {
      // If simple view is ACTIVE, we force the view to be 'list' and family to 'Simple'
      if (scaleModeUI !== 'list') setScaleModeUI('list');
      if (selectedFamily !== 'Simple') setSelectedFamily('Simple');
    } else {
      // If simple view is NOT active
      // Check if scale family is in the list families
      // Always sync the underlying family selectors with the active scale
      if (wheelFamilies.includes(scale.family)) {
        setWheelFamily(scale.family);
      }
      // Also sync list family if applicable
      if (listFamilies.includes(scale.family)) {
        setSelectedFamily(scale.family);
      }

      const isStrictlyList = ['Triad scales', 'Pentatonic', 'Hexatonic', 'Other Heptatonic', 'Supertonic'].includes(scale.family);

      if (isStrictlyList) {
        setScaleModeUI('list');
        // selectedFamily already synced above
      } else {
        setScaleModeUI('wheel');
        // wheelFamily already synced above
      }
    }
  }, [scale, isSimpleView]);


  /* =========================
       HANDLE MODE CHANGE
       ========================= */
  const handleModeChange = (newFamily, newMode, displayNameOverride = null, source = 'unknown') => {
    if (!scale) return;

    // Update Simple state based on Source
    if (source === 'simple') {
      setIsSimpleView(true);
    } else {
      setIsSimpleView(false);
    }

    const updatedScale = updateScaleWithMode({
      currentScale: scale,
      newFamily,
      newMode,
      displayName: displayNameOverride,
    });
    setScale(updatedScale);
    setSelectedMode(newMode);
    if (setCustomScaleLabel) setCustomScaleLabel(null);
  };

  // Format display name: remove octave from tonic, remove numeral from mode name
  const formatDisplayName = (tonic, modeName, family) => {
    return formatScaleName(tonic, modeName, family);
  };

  /* =========================
       TONIC CHANGE HANDLER
       ========================= */
  const handleTonicChange = (newTonic, isManualOverride = false) => {
    if (!scale) return;

    // Pass isManualOverride to the elevated setTonic
    setTonic(newTonic, isManualOverride);

    // We don't need updateScaleWithTonic here if App.setTonic handles it,
    // but the current structure has App and Selector both updating scale.
    // Let's keep it consistent: App.setTonic will now handle the scale update too.
    /*
    const updatedScale = updateScaleWithTonic({ currentScale: scale, newTonic });
    setScale(updatedScale);
    */

  };

  const handleRandomScale = () => {
    const familyKeys = Object.keys(scaleDefinitions);
    const randomFamily = familyKeys[Math.floor(Math.random() * familyKeys.length)];
    const familyModes = scaleDefinitions[randomFamily];
    const randomModeDef = familyModes[Math.floor(Math.random() * familyModes.length)];

    const modeName = randomModeDef.index
      ? `${randomModeDef.index}. ${randomModeDef.wheelName || randomModeDef.name}`
      : randomModeDef.wheelName || randomModeDef.name;

    const updatedScale = updateScaleWithMode({
      currentScale: scale,
      newFamily: randomFamily,
      newMode: modeName,
    });

    setScale(updatedScale);
    setSelectedMode(modeName);

    // Random is never Simple view
    setIsSimpleView(false);

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
  const WheelIcon = ({ size = 20 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v20" />
      <path d="M2 12h20" />
      <path d="m4.93 4.93 14.14 14.14" />
      <path d="m19.07 4.93-14.14 14.14" />
    </svg>
  );

  const modeIcons = {
    wheel: <WheelIcon />,
    list: <ListIcon />,
    random: <ShuffleIcon />,
  };

  // Get families for list view in specific order
  const listFamilies = [
    'Simple',
    'Pentatonic',
    'Hexatonic',
    'Diatonic',
    'Other Heptatonic',
    'Supertonic',
  ];

  // Search functionality
  const searchResults = searchQuery.trim()
    ? (() => {
      const query = searchQuery.toLowerCase();
      const results = [];
      for (const [family, familyModes] of Object.entries(modes)) {
        for (const [modeName, intervals] of Object.entries(familyModes)) {
          const cleanModeName =
            getCleanModeName(family, modeName) || modeName.replace(/^[IVX]+\.\s*/, '');
          const modeDef = scaleDefinitions[family]?.find((def) => {
            const legacyKey = def.index
              ? `${def.index}. ${def.wheelName || def.name}`
              : def.wheelName || def.name;
            return legacyKey === modeName || def.name === cleanModeName;
          });
          const aliases = modeDef?.aliases || [];
          const searchableText =
            `${family} ${cleanModeName} ${modeName} ${aliases.join(' ')}`.toLowerCase();
          if (searchableText.includes(query)) {
            results.push({ family, modeName, cleanModeName });
          }
        }
      }
      return results;
    })()
    : [];

  const isHighlightActive = !!scale;

  return (
    <div className="ss-root">

      {/* CONTENT AREA */}
      <div className="ss-content">
        {/* LEFT SIDEBAR: Controls & Families */}
        <div className="ss-sidebar">
          {/* STICKY TOP: Mode Buttons only */}
          <div className="ss-sidebar-top">
            {/* View Mode Buttons */}
            <div className="ss-mode-buttons">
              {['list', 'wheel'].map((mode) => (
                <button
                  key={mode}
                  className={`tab-button ss-tab-btn${scaleModeUI === mode ? ' active' : ''}`}
                  onClick={() => {
                    setScaleModeUI(mode);
                    setSearchQuery(''); // Clear search when manually changing mode
                  }}
                >
                  {mode === 'list' ? <ListIcon size={22} /> : <WheelIcon size={22} />}
                  <span className="tab-label">{mode}</span>
                </button>
              ))}
              <button
                className="tab-button ss-tab-btn"
                onClick={() => {
                  handleRandomScale();
                  setSearchQuery(''); // Clear search on random
                }}
                title="Random Scale"
              >
                <ShuffleIcon size={22} />
                <span className="tab-label">RANDOM</span>
              </button>
              {/* Play Scale button — composite wheel+play icon when idle */}
              {handlePlayScale && (
                <button
                  className={`tab-button ss-tab-btn${isPlayingScale ? ' active' : ''}`}
                  onClick={handlePlayScale}
                  style={{ color: isPlayingScale ? 'var(--accent-yellow)' : undefined }}
                  title={isPlayingScale ? 'Stop scale' : 'Play scale'}
                >
                  {isPlayingScale ? (
                    <Square size={22} />
                  ) : (
                    <Play size={20} />
                  )}
                  <span className="tab-label">PLAY</span>
                </button>
              )}
            </div>
          </div>

          {/* SCROLLABLE FAMILY LIST + SEARCH AT BOTTOM */}
          <div className="ss-family-list">
            {(scaleModeUI === 'wheel' ? wheelFamilies : listFamilies).map((family) => (
              <button
                key={family}
                className={`scale-selector-button ss-family-btn${((scaleModeUI === 'wheel' ? wheelFamily : selectedFamily) === family) ? ' active' : ''}`}
                onClick={() => {
                  if (scaleModeUI === 'wheel') setWheelFamily(family);
                  else setSelectedFamily(family);
                  setSearchQuery(''); // Clear search when family reselected
                  if (scaleModeUI === 'search') {
                    // Restore view based on the clicked family
                    setScaleModeUI(wheelFamilies.includes(family) ? 'wheel' : 'list');
                  }
                }}
              >
                {family}
              </button>
            ))}

            {/* Search Input — below family list */}
            <div className="ss-search-wrap">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  if (val.trim()) {
                    if (scaleModeUI !== 'search') setScaleModeUI('search');
                  } else {
                    if (scale && wheelFamilies.includes(scale.family)) {
                      setScaleModeUI('wheel');
                    } else {
                      setScaleModeUI('list');
                    }
                  }
                }}
                className="ss-search-input"
              />
            </div>
          </div>
        </div>

        {/* RIGHT AREA: View content */}
        <div className="ss-right">
          {scaleModeUI === 'wheel' && (
            <div className="ss-view-col">
              <div className="ss-mode-header">MODE</div>
              <div
                className="ss-wheel-container"
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
              >
                <ScaleSelectorWheel
                  family={wheelFamily}
                  size={wheelSize}
                  activeMode={scale.family === wheelFamily ? scale.name : null}
                  onSelect={(mode) => {
                    handleModeChange(wheelFamily, mode, mode, 'wheel');
                  }}
                />
              </div>
            </div>
          )}

          {/* List mode: families on left, scales on right */}
          {scaleModeUI === 'list' && (
            <div className="ss-view-col-gap">
              {/* Spacer to align with family view (matching mode buttons on left: 32px + 4px gap) */}
              <div className="ss-spacer-36" />
              <div className="mode-buttons-container">
                {selectedFamily &&
                  Object.keys(modes[selectedFamily]).map((mode) => {
                    const cleanModeName =
                      getCleanModeName(selectedFamily, mode) || mode.replace(/^[IVX]+\.\s*/, '');

                    const isActive =
                      (scale.family === selectedFamily || (selectedFamily === 'Simple' && scale.isSimple)) &&
                      (scale.name === cleanModeName || scale.name === mode);

                    return (
                      <button
                        key={mode}
                        className={`scale-selector-button ss-list-btn${isActive ? ' active' : ''}`}
                        onClick={() => {
                          // Determine source based on family
                          const source = selectedFamily === 'Simple' ? 'simple' : 'list';
                          handleModeChange(selectedFamily, mode, cleanModeName, source);
                        }}
                      >
                        {cleanModeName}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Search mode: search input and results */}
          {scaleModeUI === 'search' && (
            <div className="ss-search-content">
              <div className="ss-search-center">
                {searchResults.length > 0 && (
                  <div className="ss-results">
                    {searchResults.map((result, idx) => (
                      <button
                        key={`${result.family}-${result.modeName}-${idx}`}
                        className={`scale-selector-button ss-result-btn${scale?.family === result.family && scale?.name === result.modeName ? ' active' : ''}`}
                        onClick={() => {
                          const updatedScale = updateScaleWithMode({
                            currentScale: scale,
                            newFamily: result.family,
                            newMode: result.modeName,
                            displayName: result.modeName,
                          });
                          setScale(updatedScale);
                          setSelectedMode(result.modeName);

                          // Mark not simple
                          setIsSimpleView(false);

                          // Reset view
                          if (wheelFamilies.includes(result.family)) {
                            setScaleModeUI('wheel');
                            setWheelFamily(result.family);
                          } else {
                            setScaleModeUI('list');
                            setSelectedFamily(result.family);
                          }
                          setSearchQuery(''); // Clear search on selection

                          // Handle Alias
                          if (setCustomScaleLabel) {
                            const def = scaleDefinitions[result.family]?.find(
                              (d) =>
                                d.name === result.cleanModeName ||
                                (d.wheelName || d.name) === result.modeName
                            );
                            if (def && def.aliases && def.aliases.length > 0) {
                              setCustomScaleLabel(def.aliases[0]);
                            } else {
                              setCustomScaleLabel(null);
                            }
                          }
                        }}
                      >
                        <div className="ss-result-family">{result.family}</div>
                        <div className="ss-result-name">{result.cleanModeName}</div>
                        {/* Show Aliases if any match query or just show first alias as info */}
                        {scaleDefinitions[result.family]?.find(
                          (def) =>
                            def.name === result.cleanModeName ||
                            (def.wheelName || def.name) === result.modeName
                        )?.aliases?.length > 0 && (
                            <div className="ss-result-alias">
                              {scaleDefinitions[result.family]
                                ?.find(
                                  (def) =>
                                    def.name === result.cleanModeName ||
                                    (def.wheelName || def.name) === result.modeName
                                )
                                ?.aliases.join(', ')}
                            </div>
                          )}
                      </button>
                    ))}
                  </div>
                )}
                {searchQuery.trim() && searchResults.length === 0 && (
                  <div className="ss-no-results">No results found</div>
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
        <div className="ss-piano-wrapper">
          <div className="ss-tonic-label">SELECT TONIC</div>
          <div className="ss-piano-container">
            {trebleInstrument && scale && (
              <PianoView
                scale={scale}
                trebleInstrument={trebleInstrument}
                interactionMode={selectTonic ? 'select-tonic' : 'play'}
                onTonicSelect={handleTonicChange}
                minNote="A3"
                maxNote="G5"
                smallLabels={true}
                isHighlightActive={isHighlightActive}
                noteColoringMode="tonic_scale_keys"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScaleSelector;
