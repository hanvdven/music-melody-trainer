import React from 'react';

// Renders 3 stacked Maestro whole-note glyphs to represent a block chord.
// Used in PlayStyleSelector (family icon) and InstrumentRow (family button).
const ChordGroupIcon = ({ size = 22, color = 'currentColor' }) => {
    const fontSize  = Math.round(size * 1.08);
    const spacing   = Math.round(size * 0.41) - 2;
    const vertShift = Math.round(size * -0.2);
    return (
        <span style={{
            position: 'relative',
            display: 'inline-block',
            width: `${fontSize + 2}px`,
            height: `${fontSize + spacing * 2 + Math.round(size * 0.3)}px`,
            verticalAlign: 'middle',
        }}>
            {[spacing, 0, -spacing].map((yOff, i) => (
                <span key={i} style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(-50%, calc(-50% + ${yOff + vertShift}px))`,
                    fontFamily: 'Maestro',
                    fontSize: `${fontSize}px`,
                    lineHeight: 1,
                    color,
                }}>w</span>
            ))}
        </span>
    );
};

export default ChordGroupIcon;
