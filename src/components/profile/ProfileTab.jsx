import React from 'react';
import { Lock, Unlock, Bug } from 'lucide-react';
import { useProfile, ALL_SCALE_FAMILIES } from '../../contexts/ProfileContext';
import './ProfileTab.css';

// Human-readable descriptions shown next to each scale family
const FAMILY_DESCRIPTIONS = {
    Simple:          'Major & Minor',
    Diatonic:        '7 church modes (Ionian, Dorian …)',
    Pentatonic:      '5-note scales',
    Melodic:         'Melodic minor modes',
    'Harmonic Minor':  'Harmonic minor modes',
    'Harmonic Major':  'Harmonic major modes',
    Hexatonic:       '6-note scales (whole-tone, blues …)',
    'Double Harmonic': 'Double harmonic modes',
    'Other Heptatonic':'Misc. 7-note scales',
    Supertonic:      'Exotic & synthetic scales',
};

export default function ProfileTab() {
    const { unlockedFamilies, debugMode, setDebugMode, toggleFamily, isFamilyUnlocked } = useProfile();

    return (
        <div className="profile-tab">
            <h2 className="profile-title">Profile</h2>

            {/* Debug mode toggle */}
            <section className="profile-section">
                <div className="profile-section-header">
                    <Bug size={16} />
                    <span>Debug mode</span>
                </div>
                <p className="profile-section-desc">
                    Unlock everything regardless of lesson progress.
                </p>
                <button
                    className={`profile-debug-toggle${debugMode ? ' active' : ''}`}
                    onClick={() => setDebugMode(!debugMode)}
                    aria-pressed={debugMode}
                >
                    {debugMode ? 'ON' : 'OFF'}
                </button>
            </section>

            {/* Scale families */}
            <section className="profile-section">
                <div className="profile-section-header">
                    <span>Scale families</span>
                </div>
                <p className="profile-section-desc">
                    Unlocked families appear in the scale selector and randomizer.
                </p>
                {!debugMode && (
                    <p className="profile-section-hint">
                        Enable debug mode to manually change lock state.
                    </p>
                )}
                <ul className="profile-family-list">
                    {ALL_SCALE_FAMILIES.map(family => {
                        const isUnlocked = unlockedFamilies.has(family);
                        return (
                            <li
                                key={family}
                                className={`profile-family-item${isUnlocked ? ' active' : ' locked'}`}
                            >
                                <button
                                    className="profile-family-btn"
                                    onClick={() => toggleFamily(family)}
                                    aria-pressed={isUnlocked}
                                    disabled={!debugMode}
                                    title={!debugMode ? 'Enable debug mode to edit' : undefined}
                                >
                                    <span className="profile-family-lock-icon">
                                        {isUnlocked
                                            ? <Unlock size={14} />
                                            : <Lock size={14} />
                                        }
                                    </span>
                                    <span className="profile-family-name">{family}</span>
                                    <span className="profile-family-desc">
                                        {FAMILY_DESCRIPTIONS[family] || ''}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </section>
        </div>
    );
}
