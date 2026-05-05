import React, { useState, useRef, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';
import './GenericStepper.css';

/**
 * A reusable stepper component for +/- toggles.
 * Features temporary debug outlines as requested.
 * Supports long-click for direct numeric input.
 */
const GenericStepper = ({
    value,
    onChange,
    allowedValues, // Array of values to step through
    options,       // Array of {label, value} for list popup
    min = 0,
    max = 100,
    shouldCycle = false,
    label,
    fontSize = '17.5px', // Increased 10% from 16px
    color = 'var(--text-primary)',
    fontFamily = 'sans-serif',
    suffix = '',
    lowlighted = false,
    uppercase = false,
    height = '42px',
    icon = null
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState(value);
    const longPressTimer = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isEditing && inputRef.current && !options) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing, options]);

    const handleStartPress = (e) => {
        if (e && e.cancelable) e.preventDefault(); // Prevent ghost clicks / double firing
        longPressTimer.current = setTimeout(() => {
            setIsEditing(true);
            setInputValue(value);
        }, 500); // 500ms for long press
    };

    const handleCancelPress = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            submitValue();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
        }
    };

    const submitValue = (val = inputValue) => {
        const num = parseInt(val);
        if (!isNaN(num) && onChange) {
            const clamped = Math.max(min, Math.min(max, num));
            onChange(clamped);
        }
        setIsEditing(false);
    };

    const handleStep = (direction) => {
        if (isEditing) return;

        if (allowedValues && allowedValues.length > 0) {
            const currentIndex = allowedValues.indexOf(value);
            let nextIndex = direction === 'inc' ? currentIndex + 1 : currentIndex - 1;

            if (nextIndex >= allowedValues.length) {
                nextIndex = shouldCycle ? 0 : allowedValues.length - 1;
            } else if (nextIndex < 0) {
                nextIndex = shouldCycle ? allowedValues.length - 1 : 0;
            }

            if (nextIndex !== currentIndex && nextIndex >= 0) {
                onChange(allowedValues[nextIndex]);
            }
        } else {
            if (direction === 'inc') {
                if (value < max) onChange(value + 1);
                else if (shouldCycle) onChange(min);
            } else {
                if (value > min) onChange(value - 1);
                else if (shouldCycle) onChange(max);
            }
        }
    };

    const canInc = shouldCycle || (allowedValues ? allowedValues.indexOf(value) < allowedValues.length - 1 : value < max);
    const canDec = shouldCycle || (allowedValues ? allowedValues.indexOf(value) > 0 : value > min);

    /**
     * Icon Color logic:
     * - Lowlighted (Pinned): #444
     * - Disabled (Min/Max reached): #444
     * - Normal/Active: #888
     */
    const iconColor = lowlighted ? '#444' : '#888';
    const finalDecColor = canDec ? iconColor : '#444';
    const finalIncColor = canInc ? iconColor : '#444';

    const renderPopup = () => {
        if (!isEditing) return null;

        return (
            <>
                <div className="gs-popup-overlay" onClick={() => setIsEditing(false)} />
                <div className="gs-popup">
                    {!options && <div className="gs-popup-hint">ENTER VALUE ({min}-{max})</div>}

                    {options ? (
                        <div className="gs-popup-options">
                            {options.map((opt, i) => {
                                const isSelected = value === opt.value || value === opt.label;
                                return (
                                    <button
                                        key={i}
                                        onClick={(e) => { e.stopPropagation(); onChange(opt.value); setIsEditing(false); }}
                                        className={`gs-popup-option${isSelected ? ' selected' : ''}`}
                                    >
                                        {opt.icon && (
                                            <div className="gs-popup-option-icon">
                                                {React.isValidElement(opt.icon) ? (
                                                    opt.icon.type && typeof opt.icon.type !== 'string' ?
                                                        React.cloneElement(opt.icon, { size: 18, color: isSelected ? 'black' : '#888' }) :
                                                        opt.icon
                                                ) : opt.icon}
                                            </div>
                                        )}
                                        <span>{opt.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <>
                            <input
                                ref={inputRef}
                                type="number"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="gs-popup-input"
                            />
                            <button onClick={() => submitValue()} className="gs-popup-ok">
                                OK
                            </button>
                        </>
                    )}
                </div>
            </>
        );
    };

    const centerClass = [
        'gs-center',
        options ? 'has-options' : '',
        (uppercase && fontFamily !== 'Maestro') ? 'uppercase' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className="generic-stepper" style={{ height: height }}>
            {renderPopup()}

            {/* Left Button (-) */}
            <div
                onMouseDown={handleStartPress}
                onMouseUp={(e) => { e.preventDefault(); handleCancelPress(); if (!isEditing) handleStep('dec'); }}
                onMouseLeave={handleCancelPress}
                onTouchStart={handleStartPress}
                onTouchEnd={(e) => { e.preventDefault(); handleCancelPress(); if (!isEditing) handleStep('dec'); }}
                className={`gs-hitzone gs-hitzone-left${lowlighted ? ' lowlighted' : ''}`}
                style={{ color: finalDecColor }}
            >
                <div className="gs-icon-left">
                    <Minus size={16} strokeWidth={3} />
                </div>
            </div>

            {/* Center Area (Label) */}
            <div
                onMouseDown={handleStartPress}
                onMouseUp={(e) => { e.preventDefault(); handleCancelPress(); }}
                onMouseLeave={handleCancelPress}
                onTouchStart={handleStartPress}
                onTouchEnd={(e) => { e.preventDefault(); handleCancelPress(); }}
                className={centerClass}
                style={{ fontSize, fontFamily, color }}
            >
                {icon && (
                    <span className="gs-center-icon">
                        {React.isValidElement(icon) ? React.cloneElement(icon, { color: color }) : icon}
                    </span>
                )}
                <span>{label !== undefined ? label : `${value}${suffix}`}</span>
            </div>

            {/* Right Button (+) */}
            <div
                onMouseDown={handleStartPress}
                onMouseUp={(e) => { e.preventDefault(); handleCancelPress(); if (!isEditing) handleStep('inc'); }}
                onMouseLeave={handleCancelPress}
                onTouchStart={handleStartPress}
                onTouchEnd={(e) => { e.preventDefault(); handleCancelPress(); if (!isEditing) handleStep('inc'); }}
                className={`gs-hitzone gs-hitzone-right${lowlighted ? ' lowlighted' : ''}`}
                style={{ color: finalIncColor }}
            >
                <div className="gs-icon-right">
                    <Plus size={16} strokeWidth={3} />
                </div>
            </div>
        </div>
    );
};

export default GenericStepper;
