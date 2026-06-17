import React, { useState } from 'react';
import SONGS from '../../songs/songIndex.js';
import './SongsTab.css';

const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const DIFFICULTY_ORDER  = ['easy', 'medium', 'hard'];

/**
 * SongsTab — grid of song cards with difficulty selector.
 *
 * Props:
 *   onLoadSong(songDef, difficulty, useOriginalTonic: boolean)
 *     Called when the user loads a song. When useOriginalTonic is true,
 *     the app's tonic is updated to match the song's written key.
 */
const SongsTab = ({ onLoadSong }) => {
  const [selectedDifficulty, setSelectedDifficulty] = useState(() =>
    Object.fromEntries(SONGS.map(s => [s.id, 'easy']))
  );

  // When true: load/re-load songs in their written key and update the app tonic to match.
  // Default ON (Han 2026-06-17): loading a song uses its original key unless the user opts out.
  const [useOriginalKey, setUseOriginalKey] = useState(true);

  // Tracks the last-loaded song so toggling "original key" ON can re-apply it immediately.
  const [lastLoaded, setLastLoaded] = useState(null);

  const handleDifficulty = (songId, diff) => {
    setSelectedDifficulty(prev => ({ ...prev, [songId]: diff }));
  };

  const handleLoad = (songDef) => {
    const diff = selectedDifficulty[songDef.id];
    setLastLoaded({ songDef, difficulty: diff });
    onLoadSong(songDef, diff, useOriginalKey);
  };

  const handleToggleOriginalKey = () => {
    const next = !useOriginalKey;
    setUseOriginalKey(next);
    // If turning ON while a song is already loaded, re-apply it in its original key.
    if (next && lastLoaded) {
      onLoadSong(lastLoaded.songDef, lastLoaded.difficulty, true);
    }
  };

  return (
    <div className="songs-tab">
      <h2 className="songs-tab__heading">Songs</h2>

      {/* Original-key toggle — above the song list */}
      <div className="songs-tab__original-key-row">
        <button
          role="switch"
          aria-checked={useOriginalKey}
          className={`toggle-btn ${useOriginalKey ? 'toggle-btn--on' : ''}`}
          onClick={handleToggleOriginalKey}
        >
          <span className="toggle-btn__track">
            <span className="toggle-btn__thumb" />
          </span>
        </button>
        <span className="songs-tab__original-key-label">
          {useOriginalKey
            ? <>Original key{lastLoaded ? `: ${lastLoaded.songDef.defaultTonic} (${lastLoaded.songDef.timeSignature[0]}/${lastLoaded.songDef.timeSignature[1]})` : ''}</>
            : 'Original key'}
        </span>
        {!useOriginalKey && (
          <span className="songs-tab__original-key-hint">
            Transposes to current tonic
          </span>
        )}
      </div>

      <div className="songs-tab__grid">
        {SONGS.map(song => {
          const availableDiffs = DIFFICULTY_ORDER.filter(d => song.difficulties[d]);
          const selected = selectedDifficulty[song.id];

          return (
            <div key={song.id} className="song-card">
              <div className="song-card__header">
                <span className="song-card__title">{song.title}</span>
                {song.subtitle && (
                  <span className="song-card__subtitle">{song.subtitle}</span>
                )}
              </div>

              <div className="song-card__meta">
                <span className="song-card__timesig">
                  {song.timeSignature[0]}/{song.timeSignature[1]}
                </span>
                <span className="song-card__key">
                  Key of {song.defaultTonic}
                </span>
                <span className="song-card__tempo">
                  ♩ = {song.defaultTempo}
                </span>
              </div>

              <div className="song-card__difficulties">
                {availableDiffs.map(diff => (
                  <button
                    key={diff}
                    className={`diff-btn ${selected === diff ? 'diff-btn--active' : ''}`}
                    onClick={() => handleDifficulty(song.id, diff)}
                  >
                    {DIFFICULTY_LABELS[diff]}
                  </button>
                ))}
              </div>

              <button
                className="song-card__load-btn"
                onClick={() => handleLoad(song)}
              >
                Load
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SongsTab;
