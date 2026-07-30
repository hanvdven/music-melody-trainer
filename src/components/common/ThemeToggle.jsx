import React from 'react';
import './ThemeToggle.css';

// SINGLE SOURCE OF TRUTH for the theme list (§6c) — each theme's id + display name + [bg, accent]
// swatch colours. Exported so the in-staff notation/colour theme carousel (#533) reuses it instead of
// duplicating the list. `thronefall` is also toggleable via the crown button in the AppHeader (#296).
// colors = [background, accent, panel, text] (the last two only where App.css defines the theme; the
// header ThemeToggle only reads [0]/[1], the in-staff #533 swatch shows all four). Kept in sync with
// the `:root[data-theme=…]` blocks in App.css.
export const allThemes = [
  { id: 'default',         name: 'Default (Dark)',   colors: ['#14131a', '#f2c879', '#1f1e2a', '#ffffff'] },
  { id: 'light',           name: 'Light',            colors: ['#eef3f7', '#c97b4b', '#bcc7d4', '#2b3a42'] },
  { id: 'nocturne',        name: 'Nocturne',         colors: ['#0b1020', '#d4af37', '#222c40', '#e6e8ef'] },
  { id: 'meridienne',      name: 'Meridienne',       colors: ['#f4e7c5', '#b08a5a', '#e3d3a2', '#3a2e1f'] },
  { id: 'museum',          name: 'Museum',           colors: ['#0e2a47', '#f2c94c'] },
  { id: 'afterglow',       name: 'Afterglow',        colors: ['#0e1220', '#c85c5c'] },
  { id: 'pastel-dawn',     name: 'Pastel Dawn',      colors: ['#eef3f7', '#f3c6a8'] },
  { id: 'golden-wetlands', name: 'Golden Wetlands',  colors: ['#e6ddc6', '#d6b35c'] },
  { id: 'thronefall',      name: 'Thronefall',       colors: ['#1f2a52', '#ffc93c', '#2d3d78', '#fff3d6'] },
];

const ThemeToggle = ({ currentTheme, setTheme }) => {
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
