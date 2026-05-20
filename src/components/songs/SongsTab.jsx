import React, { useState } from 'react';
import SONGS from '../../songs/songIndex.js';
import './SongsTab.css';

const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const DIFFICULTY_ORDER  = ['easy', 'medium', 'hard'];

/**
 * SongsTab — grid of song cards with difficulty selector.
 * Calls onLoadSong(songDef, difficulty) when the user clicks "Load".
 */
const SongsTab = ({ onLoadSong }) => {
  // Track selected difficulty per song id.
  const [selectedDifficulty, setSelectedDifficulty] = useState(() =>
    Object.fromEntries(SONGS.map(s => [s.id, 'easy']))
  );

  const handleDifficulty = (songId, diff) => {
    setSelectedDifficulty(prev => ({ ...prev, [songId]: diff }));
  };

  const handleLoad = (songDef) => {
    const diff = selectedDifficulty[songDef.id];
    onLoadSong(songDef, diff);
  };

  return (
    <div className="songs-tab">
      <h2 className="songs-tab__heading">Songs</h2>
      <p className="songs-tab__sub">
        Load a song to see it on the sheet music. Transpose by changing the tonic in the Scale tab.
      </p>
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
