import React from 'react';
import '../../styles/App.css';

const ThemeToggle = ({ currentTheme, setTheme }) => {
    // Themes matching App.css
    const themes = [
        { id: 'light', name: 'Light', colors: ['#f5f5f5', '#000'] },
        { id: 'nocturne', name: 'Nocturne', colors: ['#0b1020', '#d4af37'] },
        { id: 'meridienne', name: 'Meridienne', colors: ['#f4e7c5', '#3a2e1f'] },
        { id: 'museum', name: 'Museum', colors: ['#0e2a47', '#f2c94c'] },
        { id: 'afterglow', name: 'Afterglow', colors: ['#0e1220', '#c85c5c'] },
        { id: 'pastel-dawn', name: 'Pastel Dawn', colors: ['#eef3f7', '#f3c6a8'] },
        { id: 'golden-wetlands', name: 'Golden Wetlands', colors: ['#e6ddc6', '#d6b35c'] },
    ];

    // If current theme is not in list (e.g. default), handle it? 
    // Default in CSS seems to be dark-theme rooted. Let's assume 'default' or empty string is Dark.
    // We can add a "Default" option.

    const allThemes = [
        { id: 'default', name: 'Default (Dark)', colors: ['#14131a', '#f2c879'] },
        ...themes
    ];

    return (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {allThemes.map(theme => (
                <div
                    key={theme.id}
                    onClick={() => setTheme(theme.id)}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        cursor: 'pointer',
                        opacity: currentTheme === theme.id ? 1 : 0.6
                    }}
                >
                    <div style={{
                        width: '40px',
                        height: '40px',
                        display: 'grid',
                        gridTemplateColumns: '1fr',
                        border: currentTheme === theme.id ? '2px solid var(--accent-yellow)' : '1px solid gray',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        backgroundColor: theme.colors[0]
                    }}>
                        <div style={{ width: '100%', height: '50%', backgroundColor: theme.colors[0] }} />
                        <div style={{ width: '100%', height: '50%', backgroundColor: theme.colors[1] }} />
                    </div>
                    <span style={{ marginTop: '2px', fontSize: '10px', color: 'var(--text-primary)' }}>{theme.name}</span>
                </div>
            ))}
        </div>
    );
};

export default ThemeToggle;