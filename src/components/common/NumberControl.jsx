import React from 'react';
import { Minus, Plus } from 'lucide-react';

const NumberControl = ({ value, onWarning, onIncrease, onDecrease, min = 0, max = 100, step = 1, label, showLabel = false, fontFamily = 'serif', color = 'var(--accent-yellow)', fontSize = '16px', disableRangeCheck = false, suffix = '' }) => {
    const handleDecrease = (e) => {
        // e.stopPropagation(); // Optional, depending on if rows are clickable
        if (disableRangeCheck || value > min) {
            onDecrease();
        } else if (onWarning) {
            onWarning();
        }
    };

    const handleIncrease = (e) => {
        // e.stopPropagation();
        if (disableRangeCheck || value < max) {
            onIncrease();
        } else if (onWarning) {
            onWarning();
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Value (Top Layer visually, but clicks pass through) */}
            <span
                style={{
                    fontFamily: fontFamily,
                    fontSize: fontSize,
                    textAlign: 'center',
                    color: color,
                    pointerEvents: 'none', // Allow clicks to pass through to hitboxes
                    zIndex: 2,
                    userSelect: 'none',
                    width: '100%',
                }}
            >
                {value}{suffix}
            </span>

            {/* Hitboxes (Background Layer) */}
            {/* Decrease (Left) */}
            <div
                onClick={handleDecrease}
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '50%',
                    cursor: 'pointer',
                    zIndex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start', // Align indicator to left
                }}
            >
                {/* Indicator - ~30% from left */}
                <span style={{
                    pointerEvents: 'none',
                    color: '#444',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    marginLeft: '30%'
                }}>
                    -
                </span>
            </div>

            {/* Increase (Right) */}
            <div
                onClick={handleIncrease}
                style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: '50%',
                    cursor: 'pointer',
                    zIndex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end', // Align indicator to right
                }}
            >
                {/* Indicator - ~30% from right */}
                <span style={{
                    pointerEvents: 'none',
                    color: '#444',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    marginRight: '30%'
                }}>
                    +
                </span>
            </div>
        </div>
    );
};

export default NumberControl;
