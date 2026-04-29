import React, { useState, useRef, useEffect } from 'react';
import { Minus, Plus, ChevronsLeft, ChevronsRight } from 'lucide-react';
import './DoubleStepper.css';

/**
 * A reusable stepper component with double buttons:
 * [--] [-] [Value] [+] [++]
 * -- / ++ jump by 12 (octave)
 * - / + step by 1
 */
const DoubleStepper = ({
    value,
    onChange,
    min = 0,
    max = 127,
    label,
    fontSize = '34px',
    color = 'white',
    fontFamily = 'serif',
    fontWeight = 'normal',
    formatValue = (v) => v,
    lowlighted = false
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState(value);
    const longPressTimer = useRef(null);
    const inputRef = useRef(null);

    // SMARTH JUMPS: C, E, A
    // Chromatic indices: C=0, C#=1, D=2, Eb=3, E=4, F=5, F#=6, G=7, Ab=8, A=9, Bb=10, B=11
    const JUMP_TARGETS = [0, 4, 9];

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleStartPress = (e) => {
        if (e && e.cancelable) e.preventDefault();
        longPressTimer.current = setTimeout(() => {
            setIsEditing(true);
            setInputValue(value);
        }, 500);
    };

    const handleCancelPress = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const submitValue = () => {
        const num = parseInt(inputValue);
        if (!isNaN(num)) {
            const clamped = Math.max(min, Math.min(max, num));
            onChange(clamped);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') submitValue();
        else if (e.key === 'Escape') setIsEditing(false);
    };

    const handleStep = (delta) => {
        if (isEditing) return;
        let next;

        if (Math.abs(delta) >= 12) {
            // Smart Jump Logic: find the next C, E, or A in the requested direction
            const direction = delta > 0 ? 1 : -1;
            let current = value + direction;

            while (current >= min && current <= max) {
                if (JUMP_TARGETS.includes(current % 12)) {
                    next = current;
                    break;
                }
                current += direction;
            }
            if (next === undefined) next = Math.max(min, Math.min(max, value + delta));
        } else {
            next = Math.max(min, Math.min(max, value + delta));
        }

        onChange(next);
    };

    const iconColor = lowlighted ? '#444' : '#888';

    const renderPopup = () => {
        if (!isEditing) return null;
        return (
            <>
                <div className="ds-popup-overlay" onClick={() => setIsEditing(false)} />
                <div className="ds-popup">
                    <div className="ds-popup-hint">ENTER VALUE ({min}-{max})</div>
                    <input
                        ref={inputRef}
                        type="number"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="ds-popup-input"
                    />
                    <button onClick={submitValue} className="ds-popup-ok">OK</button>
                </div>
            </>
        );
    };

    return (
        <div className="double-stepper">
            {renderPopup()}

            {/* OCTAVE DOWN */}
            <div onClick={() => handleStep(-12)} className="ds-btn" style={{ color: value > min ? iconColor : '#444' }}>
                <ChevronsLeft size={16} strokeWidth={3} />
            </div>

            {/* STEP DOWN */}
            <div onClick={() => handleStep(-1)} className="ds-btn" style={{ color: value > min ? iconColor : '#444' }}>
                <Minus size={14} strokeWidth={3} />
            </div>

            <div
                onMouseDown={handleStartPress}
                onMouseUp={handleCancelPress}
                onMouseLeave={handleCancelPress}
                onTouchStart={handleStartPress}
                onTouchEnd={handleCancelPress}
                className="ds-label"
                style={{ fontSize, fontFamily, color, fontWeight }}
            >
                {label !== undefined ? label : formatValue(value)}
            </div>

            {/* STEP UP */}
            <div onClick={() => handleStep(1)} className="ds-btn" style={{ color: value < max ? iconColor : '#444' }}>
                <Plus size={14} strokeWidth={3} />
            </div>

            {/* OCTAVE UP */}
            <div onClick={() => handleStep(12)} className="ds-btn" style={{ color: value < max ? iconColor : '#444' }}>
                <ChevronsRight size={16} strokeWidth={3} />
            </div>
        </div>
    );
};

export default DoubleStepper;
