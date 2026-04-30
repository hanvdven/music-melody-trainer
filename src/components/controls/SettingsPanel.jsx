import React from 'react';
import { Palette, Maximize, Minimize } from 'lucide-react';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';

const COLOR_MODES = ['none', 'tonic_scale_keys', 'chords', 'chromatone', 'subtle-chroma'];

/** Theme swatches: each entry describes one selectable theme. */
const THEMES = [
    { id: 'default', label: 'Default', swatches: ['#14131a', '#1f1e2a', '#6a2a8a', '#f2c879'] },
    { id: 'light', label: 'Light', swatches: ['#eef3f7', '#d1d9e2', '#f3c6a8', '#2b3a42'] },
    { id: 'nocturne', label: 'Nocturne', swatches: ['#0b1020', '#222c40', '#d4af37', '#e6e8ef'] },
    { id: 'meridienne', label: 'Meridienne', swatches: ['#f4e7c5', '#e6c15a', '#b08a5a', '#3a2e1f'] },
];

const SettingsPanel = ({
    theme, setTheme,
    isFullscreen, toggleFullscreen,
    minimizeAccidentals, setMinimizeAccidentals,
    isModulationEnabled, setIsModulationEnabled,
}) => {
    const { noteColoringMode, setNoteColoringMode } = useDisplaySettings();

    return (
        <div className="app-settings-panel">
            {/* Theme */}
            <div className="app-settings-section">
                <div className="app-settings-section-label">THEME</div>
                <div className="app-theme-picker">
                    {THEMES.map(({ id: tId, label: tLabel, swatches }) => {
                        const isActive = theme === tId || (!theme && tId === 'default');
                        return (
                            <div key={tId} className="app-theme-item" onClick={() => setTheme(tId)}>
                                <div
                                    className="app-theme-swatch"
                                    style={{ border: isActive ? '2px solid var(--accent-yellow)' : '2px solid #444' }}
                                >
                                    {swatches.map((c, ci) => (
                                        <div key={ci} className="app-theme-swatch-slice" style={{ backgroundColor: c }} />
                                    ))}
                                </div>
                                <span className="app-theme-label" style={{ color: isActive ? 'var(--accent-yellow)' : 'var(--text-dim)' }}>{tLabel}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Color Palette */}
            <div className="app-settings-section">
                <div className="app-settings-section-label">STAVE COLORING</div>
                <div className="app-settings-row" onClick={() => {
                    const idx = COLOR_MODES.indexOf(noteColoringMode);
                    setNoteColoringMode(COLOR_MODES[(idx + 1) % COLOR_MODES.length]);
                }}>
                    <div className="app-settings-row-icon"><Palette size={20} /></div>
                    <div className="app-settings-row-body">
                        <div className="app-settings-row-title">
                            {noteColoringMode === 'none' ? 'None' :
                                noteColoringMode === 'tonic_scale_keys' ? 'Tonic / Scale' :
                                    noteColoringMode === 'chords' ? 'Chords' : 'Chromatone'}
                        </div>
                        <div className="app-settings-row-sub">Cycle coloring mode</div>
                    </div>
                </div>
            </div>

            {/* Fullscreen */}
            <div className="app-settings-section">
                <div className="app-settings-section-label">DISPLAY</div>
                <div className="app-settings-row" onClick={() => toggleFullscreen()}>
                    <div className="app-settings-row-icon">
                        {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                    </div>
                    <div className="app-settings-row-body">
                        <div className="app-settings-row-title">{isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}</div>
                    </div>
                </div>
            </div>

            {/* Scale toggles */}
            <div className="app-settings-section">
                <div className="app-settings-section-label">SCALE OPTIONS</div>
                <div className="app-settings-toggles">
                    <div className="app-toggle-row" onClick={() => setMinimizeAccidentals(v => !v)}>
                        <div className="app-toggle-track" style={{ backgroundColor: minimizeAccidentals ? 'var(--accent-yellow)' : '#444' }}>
                            <div className="app-toggle-thumb" style={{ left: minimizeAccidentals ? 19 : 3 }} />
                        </div>
                        <span className="app-toggle-label" style={{ color: minimizeAccidentals ? 'var(--text-primary)' : 'var(--text-dim)' }}>Minimize Accidentals</span>
                    </div>
                    <div className="app-toggle-row" onClick={() => setIsModulationEnabled(v => !v)}>
                        <div className="app-toggle-track" style={{ backgroundColor: isModulationEnabled ? 'var(--accent-yellow)' : '#444' }}>
                            <div className="app-toggle-thumb" style={{ left: isModulationEnabled ? 19 : 3 }} />
                        </div>
                        <span className="app-toggle-label" style={{ color: isModulationEnabled ? 'var(--text-primary)' : 'var(--text-dim)' }}>Modulate</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsPanel;
