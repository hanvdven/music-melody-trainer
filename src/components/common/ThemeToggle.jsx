import React from 'react';
import './ThemeToggle.css';

// #628-S3: icons8 theme icons live in src/assets/icons8/themes/icons8-<basename>-100.png (a SUBDIR the
// instrument glob in constants/instruments.jsx does not cover). Vite bundles them via import.meta.glob
// (?url). getThemeIconUrl(basename) → the hashed asset URL, or null if the asset is missing.
const THEME_ICON_URLS = import.meta.glob('../../assets/icons8/themes/icons8-*-100.png', {
  eager: true, query: '?url', import: 'default',
});
export const getThemeIconUrl = (basename) =>
  THEME_ICON_URLS[`../../assets/icons8/themes/icons8-${basename}-100.png`] ?? null;

// SINGLE SOURCE OF TRUTH for the theme list (§6c) — each theme's id + display name + category + icons8
// icon basename + [bg, accent, panel, text] swatch colours. Exported so the in-staff notation/colour
// theme carousel (#533) reuses it instead of duplicating the list.
//
// #628-S2 (Han 2026-07-30): the flat list became a CATEGORISED catalog (Default / Light / Dark /
// Elemental / Special / Pets); the theme carousel groups by `category` (familyMode). `icon` is the
// icons8 basename in src/assets/icons8/themes/icons8-<icon>-100.png (used by the #628-S3 swatch redesign).
// The orphan themes afterglow / pastel-dawn / golden-wetlands (no App.css block → did nothing, #627)
// were removed; `thronefall` became `royal` (crown). colors = [app-bg, accent, panel-bg, text-primary]
// — the real page background is panel-bg (index 2); index 0 is kept for the swatch. Every id here MUST
// have a matching `:root[data-theme=<id>]` block in App.css (else selecting it does nothing).
export const allThemes = [
  // Default
  { id: 'default',    name: 'Night',       category: 'Default',   icon: 'night',          colors: ['#14131a', '#f2c879', '#1f1e2a', '#ffffff'] },
  { id: 'classical',  name: 'Classical',   category: 'Default',   icon: 'lyre',           colors: ['#eef3f7', '#c97b4b', '#bcc7d4', '#2b3a42'] },
  // Light
  { id: 'marble',     name: 'Marble',      category: 'Light',     icon: 'bust',           colors: ['#f2f1f4', '#8a7a6a', '#e4e3e8', '#33323a'] },
  { id: 'barley',     name: 'Barley',      category: 'Light',     icon: 'barley',         colors: ['#f4e7c5', '#b08a5a', '#e3d3a2', '#3a2e1f'] },
  { id: 'bright-day', name: 'Bright Day',  category: 'Light',     icon: 'sky',            colors: ['#e6f4fd', '#3f9bd6', '#c8e6f7', '#1e3a4a'] },
  // Dark
  { id: 'sunset',     name: 'Sunset',      category: 'Dark',      icon: 'field',          colors: ['#241018', '#ff8c42', '#3a1c2a', '#ffe6d0'] },
  { id: 'stars',      name: 'Stars',       category: 'Dark',      icon: 'shooting-stars', colors: ['#0b1020', '#d4af37', '#222c40', '#e6e8ef'] },
  { id: 'museum',     name: 'Museum',      category: 'Dark',      icon: 'exhibition',     colors: ['#0e2a47', '#f2c94c', '#163a5f', '#f0e6d2'] },
  // Elemental
  { id: 'clover',     name: 'Clover',      category: 'Elemental', icon: 'clover',         colors: ['#0d2016', '#5fbf6a', '#16321f', '#e2f2e4'] },
  { id: 'river',      name: 'River',       category: 'Elemental', icon: 'water-element',  colors: ['#08202b', '#3fb6c9', '#103440', '#dff0f4'] },
  { id: 'lava',       name: 'Lava',        category: 'Elemental', icon: 'volcano',        colors: ['#2e1310', '#ff6a3d', '#451a15', '#ffe0d6'] },
  { id: 'rock',       name: 'Rock',        category: 'Elemental', icon: 'rock',           colors: ['#26241f', '#a08c6a', '#34322b', '#e8e4dc'] },
  // Special
  { id: 'pride-light',name: 'Pride (Light)',category: 'Special',  icon: 'flag',           colors: ['#fdf0f5', '#e0407a', '#f3dbe8', '#3a2030'] },
  { id: 'pride-dark', name: 'Pride (Dark)', category: 'Special',  icon: 'flag',           colors: ['#1a1020', '#ff5fa2', '#2a1a38', '#f0d8e8'] },
  { id: 'vapourwave', name: 'Vapourwave',  category: 'Special',   icon: 'vaporwave',      colors: ['#2a1a3e', '#ff6ad5', '#3a2552', '#f0d0ff'] },
  { id: 'disco',      name: 'Disco',       category: 'Special',   icon: 'disco-ball',     colors: ['#f0eefa', '#b06adf', '#e2dcf0', '#2a2440'] },
  { id: 'royal',      name: 'Royal',       category: 'Special',   icon: 'crown',          colors: ['#1f2a52', '#ffc93c', '#2d3d78', '#fff3d6'] },
  // Pets
  { id: 'cat',        name: 'Cat',         category: 'Pets',      icon: 'cat',            colors: ['#241d18', '#e8a04b', '#332a22', '#f5e8dc'] },
  { id: 'dog',        name: 'Dog',         category: 'Pets',      icon: 'dog',            colors: ['#201811', '#c98a3f', '#31261c', '#f0e4d4'] },
  { id: 'ram',        name: 'Ram',         category: 'Pets',      icon: 'ram',            colors: ['#242019', '#9a8768', '#322d24', '#ece6da'] },
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
