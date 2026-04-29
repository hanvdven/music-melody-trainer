
import React from 'react';
import {
    Shuffle,
    Music,
    Eye,
    EyeOff,
    ListMusic,
    Percent,
    Snowflake,
    Flame
} from 'lucide-react';

export const ShuffleIcon = ({ color = 'var(--accent-yellow)' }) => (
    <Shuffle color={color} size={18} />
);

export const NotesIcon = ({ color = 'var(--accent-yellow)' }) => (
    <Music color={color} size={18} />
);

export const WheelIcon = ({ color = 'var(--accent-yellow)', size = 20 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2v20" />
        <path d="M2 12h20" />
        <path d="m4.93 4.93 14.14 14.14" />
        <path d="m19.07 4.93-14.14 14.14" />
        {/* Circle inner segments */}
        <circle cx="12" cy="12" r="5" strokeWidth="1" opacity="0.6" />
    </svg>
);

export const MetronomeIcon = ({ color = '#ccc' }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2 4 22h16L12 2Z" />
        <path d="m12 18-2-10" />
        <circle cx="10" cy="8" r="1.5" fill={color} />
    </svg>
);

const DYNAMICS_LABEL = { 1.0: 'f', 0.8: 'mf', 0.6: 'mp', 0.4: 'p', 0.2: 'pp', 0.0: '//' };

export const VolumeIcon = ({ color = 'white', volume, size = 22 }) => {
    const rounded = Math.round((volume ?? 1) * 10) / 10;
    const label = DYNAMICS_LABEL[rounded] ?? 'f';
    return (
        <span style={{
            fontFamily: 'serif', fontStyle: 'italic', fontWeight: 'bold',
            fontSize: `${Math.round(size * 0.68)}px`,
            color: volume === 0 ? 'rgba(255,255,255,0.35)' : color,
            userSelect: 'none', lineHeight: 1,
            display: 'inline-block', minWidth: `${size}px`, textAlign: 'center',
        }}>{label}</span>
    );
};

export const VisibilityIcon = ({ color, crossed, low, size = 22 }) => {
    const Icon = crossed ? Percent : Music;
    return <Icon color={color} size={size} style={{ opacity: low ? 0.4 : (crossed ? 0.6 : 1) }} />;
};

export const ChordIcon = ({ color, mode }) => (
    <ListMusic color={color} size={18} />
);

// Chord notation mode icon — cycles letters ↔ roman numerals
// letters mode: "D-" + superscript "7"  (D minor seventh; "-" = minor convention)
// roman  mode: "ii" + superscript "7"
// Size default 26 (20% larger than previous 22). Font: serif normal.
export const ChordNotationIcon = ({ mode, size = 26 }) => (
    mode === 'letters'
        ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <text x="9" y="17" fontSize="15" fontFamily="serif" fontStyle="normal" fontWeight="normal"
                fill="currentColor" textAnchor="middle">D-</text>
            <text x="21" y="8" fontSize="9" fontFamily="serif" fontStyle="normal" fontWeight="normal"
                fill="currentColor" textAnchor="middle">7</text>
          </svg>
        : <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <text x="9" y="17" fontSize="15" fontFamily="serif" fontStyle="normal" fontWeight="normal"
                fill="currentColor" textAnchor="middle">ii</text>
            <text x="21" y="8" fontSize="9" fontFamily="serif" fontStyle="normal" fontWeight="normal"
                fill="currentColor" textAnchor="middle">7</text>
          </svg>
);

// Lucide-style "1" — vertical stem + top-left serif + base line
export const IconOne = ({ size = 22, color = 'currentColor', style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={style}>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="8.5" y1="8.5" x2="12" y2="5" />
        <line x1="8.5" y1="19" x2="15.5" y2="19" />
    </svg>
);
