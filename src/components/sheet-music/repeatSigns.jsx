import React from 'react';

// ── Shared full-height repeat barline signs (#430, extracted from BarlinesLayer per §6d) ──────────
//
// WHY this file exists: BarlinesLayer draws the in-staff begin/end repeat barlines (thick bar +
// thin line + two Maestro 'k' dots per visible staff) inline. The PLAYBACK settings overlay needs
// the EXACT same signs drawn on the staff when repeats ≠ 1 (Han #430: "render vertical repeat block
// in line … volledig begin- én eind-repeat teken"). Rather than replicate the glyph offsets in the
// overlay (which would drift the moment one site is tuned — the §6d failure mode), the sign geometry
// lives here as ONE source of truth and BOTH BarlinesLayer and SettingsOverlay render it.
//
// Geometry is copied verbatim from BarlinesLayer's previous inline code so the sheet is unchanged:
//   • BEGIN: thick bar (rect w=3) on the LEFT at x−2, thin line at x+4, dots at x+9.
//   • END:   dots at x−9, thin line at x−4, thick bar (rect w=3) on the RIGHT at x+1.
// The thick bar + thin line span the whole system (trebleStart → bottomY); the dots sit per VISIBLE
// staff (Maestro 'k' at start+18.5 and +28.5, fontSize 21). Callers wrap this in whatever <g> they
// need (BarlinesLayer keeps its data-mel="barline"/data-offset wrapper for the highlight system).

const StaffDots = ({ x, trebleStart, bassStart, percussionStart,
    isTrebleVisible, isBassVisible, isPercussionVisible, color }) =>
    [trebleStart, bassStart, percussionStart].map((start, sIdx) => {
        const show = sIdx === 0 ? isTrebleVisible : sIdx === 1 ? isBassVisible : isPercussionVisible;
        if (!show || start == null) return null;
        return (
            <g key={sIdx}>
                <text x={x} y={start + 18.5} fontSize="21" fontFamily="Maestro" fill={color} textAnchor="middle">k</text>
                <text x={x} y={start + 28.5} fontSize="21" fontFamily="Maestro" fill={color} textAnchor="middle">k</text>
            </g>
        );
    });

export const BeginRepeatSign = ({
    x, trebleStart, bassStart, percussionStart, bottomY,
    isTrebleVisible, isBassVisible, isPercussionVisible, color = 'var(--text-primary)',
}) => (
    <g style={{ pointerEvents: 'none' }}>
        <rect x={x - 2} y={trebleStart} width="3" height={bottomY - trebleStart} fill={color} />
        <path d={`M ${x + 4} ${trebleStart} V ${bottomY}`} stroke={color} strokeWidth="1" />
        <StaffDots x={x + 9} trebleStart={trebleStart} bassStart={bassStart} percussionStart={percussionStart}
            isTrebleVisible={isTrebleVisible} isBassVisible={isBassVisible} isPercussionVisible={isPercussionVisible}
            color={color} />
    </g>
);

export const EndRepeatSign = ({
    x, trebleStart, bassStart, percussionStart, bottomY,
    isTrebleVisible, isBassVisible, isPercussionVisible, color = 'var(--text-primary)',
}) => (
    <g style={{ pointerEvents: 'none' }}>
        <StaffDots x={x - 9} trebleStart={trebleStart} bassStart={bassStart} percussionStart={percussionStart}
            isTrebleVisible={isTrebleVisible} isBassVisible={isBassVisible} isPercussionVisible={isPercussionVisible}
            color={color} />
        <path d={`M ${x - 4} ${trebleStart} V ${bottomY}`} stroke={color} strokeWidth="1" />
        <rect x={x + 1} y={trebleStart} width="3" height={bottomY - trebleStart} fill={color} />
    </g>
);
