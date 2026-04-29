import React from 'react';
import './ThemeToggle.css';

const ThemeToggle = ({ currentTheme, setTheme }) => {
  const allThemes = [
    { id: 'default',         name: 'Default (Dark)',   colors: ['#14131a', '#f2c879'] },
    { id: 'light',           name: 'Light',            colors: ['#f5f5f5', '#000'] },
    { id: 'nocturne',        name: 'Nocturne',         colors: ['#0b1020', '#d4af37'] },
    { id: 'meridienne',      name: 'Meridienne',       colors: ['#f4e7c5', '#3a2e1f'] },
    { id: 'museum',          name: 'Museum',           colors: ['#0e2a47', '#f2c94c'] },
    { id: 'afterglow',       name: 'Afterglow',        colors: ['#0e1220', '#c85c5c'] },
    { id: 'pastel-dawn',     name: 'Pastel Dawn',      colors: ['#eef3f7', '#f3c6a8'] },
    { id: 'golden-wetlands', name: 'Golden Wetlands',  colors: ['#e6ddc6', '#d6b35c'] },
  ];

  return (
    <div className="theme-toggle-grid">
      {allThemes.map((theme) => {
        const isActive = currentTheme === theme.id;
        return (
          <div
            key={theme.id}
            onClick={() => setTheme(theme.id)}
            className={`theme-swatch-item${isActive ? ' active' : ''}`}
          >
            <div
              className={`theme-swatch-box${isActive ? ' active' : ''}`}
              style={{ backgroundColor: theme.colors[0] }}
            >
              {/* Top and bottom halves show bg and accent colors of each theme */}
              <div className="theme-swatch-half" style={{ backgroundColor: theme.colors[0] }} />
              <div className="theme-swatch-half" style={{ backgroundColor: theme.colors[1] }} />
            </div>
            <span className="theme-swatch-label">{theme.name}</span>
          </div>
        );
      })}
    </div>
  );
};

export default ThemeToggle;
