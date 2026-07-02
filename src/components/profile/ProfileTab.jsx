import React from 'react';
import { Lock, Unlock, Bug, Flame, Snowflake, Trophy } from 'lucide-react';
import { useProfile, ALL_SCALE_FAMILIES } from '../../contexts/ProfileContext';
import { SKILL_BRANCHES } from '../../utils/gamification';
import './ProfileTab.css';

// Display labels for the five skill branches (docs/gamification.md §4).
const SKILL_LABELS = {
    ear: 'Ear',
    sightReading: 'Sight Reading',
    rhythm: 'Rhythm',
    harmony: 'Harmony',
    consistency: 'Consistency',
};

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
    const {
        unlockedFamilies, debugMode, setDebugMode, toggleFamily,
        gamification, gamificationEnabled, setGamificationEnabled,
    } = useProfile();

    return (
        <div className="profile-tab">
            <h2 className="profile-title">Profile</h2>

            {/* Level & XP (#128) */}
            {gamificationEnabled && (
                <section className="profile-section">
                    <div className="profile-section-header">
                        <Trophy size={16} />
                        <span>Level</span>
                    </div>
                    <div className="profile-level-row">
                        <span className="profile-level-number">Lv {gamification.level}</span>
                        <span className="profile-level-tier">{gamification.tier}</span>
                        <span className="profile-level-xp">{gamification.totalXP} XP</span>
                    </div>
                    <div className="profile-xp-bar" title={`${gamification.intoLevel} / ${gamification.needed} XP to next level`}>
                        <div
                            className="profile-xp-bar-fill"
                            style={{ width: `${Math.min(100, (gamification.intoLevel / gamification.needed) * 100)}%` }}
                        />
                    </div>
                    <p className="profile-section-hint">
                        {gamification.needed - gamification.intoLevel} XP to level {gamification.level + 1}
                    </p>
                </section>
            )}

            {/* Skill branches (#129) */}
            {gamificationEnabled && (
                <section className="profile-section">
                    <div className="profile-section-header">
                        <span>Skills</span>
                    </div>
                    <p className="profile-section-desc">
                        Adaptive ratings: play a melody flawlessly at a difficulty above your
                        rating and it rises; miss notes below it and it falls. 100 = flawless
                        at the hardest difficulty.
                    </p>
                    <ul className="profile-skill-list">
                        {SKILL_BRANCHES.map(branch => (
                            <li key={branch} className="profile-skill-item">
                                <span className="profile-skill-name">{SKILL_LABELS[branch]}</span>
                                <div className="profile-skill-bar">
                                    <div
                                        className="profile-skill-bar-fill"
                                        style={{ width: `${gamification.skills[branch]}%` }}
                                    />
                                </div>
                                <span className="profile-skill-score">{gamification.skills[branch]}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Daily streak (#130) */}
            {gamificationEnabled && (
                <section className="profile-section">
                    <div className="profile-section-header">
                        <Flame size={16} />
                        <span>Streak</span>
                    </div>
                    <div className="profile-streak-row">
                        <span className="profile-streak-days">
                            {gamification.streakDays} {gamification.streakDays === 1 ? 'day' : 'days'}
                        </span>
                        <span className="profile-streak-tokens" title="Freeze tokens protect your streak on a missed day">
                            <Snowflake size={14} /> ×{gamification.freezeTokens}
                        </span>
                    </div>
                    <p className="profile-section-desc">
                        A day counts when you complete at least one melody. Every 7 days earns a freeze token (max 2).
                    </p>
                </section>
            )}

            {/* Gamification opt-out (#134) */}
            <section className="profile-section">
                <div className="profile-section-header">
                    <span>Gamification</span>
                </div>
                <p className="profile-section-desc">
                    XP, levels, skills and streaks. When off, only the session summary remains.
                </p>
                <button
                    className={`profile-debug-toggle${gamificationEnabled ? ' active' : ''}`}
                    onClick={() => setGamificationEnabled(!gamificationEnabled)}
                    aria-pressed={gamificationEnabled}
                >
                    {gamificationEnabled ? 'ON' : 'OFF'}
                </button>
            </section>

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
