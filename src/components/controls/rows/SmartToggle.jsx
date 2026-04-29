import React, { useState, useRef, useEffect } from 'react';
import { Pin, Dices, Disc } from 'lucide-react';
import { ShuffleIcon, NotesIcon, WheelIcon } from '../../common/CustomIcons';
import useLongPress from '../../../hooks/useLongPress';
import './SmartToggle.css';

const SmartToggle = ({
    label,
    value,
    state,
    onToggle,
    disabled,
    lowlighted,
    height = '77px', // Increased ~20% from 64px
    activeScale,
    playbackConfig,
    longPressOptions = [], // [{ label, value, iconType }]
    onOptionSelect
}) => {
    const isLongPressActive = useRef(false);
    const [showMenu, setShowMenu] = useState(false);
    const containerRef = useRef();

    const onLongPress = () => {
        if (!disabled && longPressOptions.length > 0) {
            setShowMenu(true);
            isLongPressActive.current = true;
        }
    };

    const longPress = useLongPress(onLongPress, 500);

    // Close menu on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setShowMenu(false);
            }
        };
        if (showMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showMenu]);

    const handleOptionClick = (e, opt) => {
        e.stopPropagation();
        onOptionSelect(opt);
        setShowMenu(false);
    };

    const activeColor = 'var(--accent-yellow)';
    const inactiveColor = '#888';
    const activeBg = 'rgba(255, 204, 0, 0.1)';
    const lowlightedOpacity = 0.5;

    const isRandom = state !== false;

    const isHeptatonicSubset = (family) => {
        return ['Diatonic', 'Melodic', 'Harmonic Minor', 'Harmonic Major', 'Double Harmonic'].includes(family);
    };

    const isHepta = label === 'FAMILY' && state === 'hepta';

    const renderIcon = (type, color, size = 18) => {
        if (type === 'wheel') return <WheelIcon size={size} color={color} />;
        if (type === 'dice') return <Dices size={size} color={color} />;
        if (type === 'pin') return <Pin size={size} color={color} />; // Removed opacity
        return null;
    };

    const renderStatusIcon = () => {
        const iconSize = 22; // Increased size for better visibility
        const iconColor = isRandom ? activeColor : inactiveColor;

        if (label === 'FAMILY') {
            if (state === 'hepta') return renderIcon('wheel', iconColor, iconSize);
            if (state === true) return renderIcon('dice', iconColor, iconSize);
            return renderIcon('pin', iconColor, iconSize);
        }

        if (isRandom) {
            return renderIcon('dice', iconColor, iconSize);
        }
        return renderIcon('pin', iconColor, iconSize);
    };

    return (
        <div ref={containerRef} className="st-container" style={{ height }}>
            <button
                {...longPress}
                onClick={(e) => {
                    if (isLongPressActive.current) {
                        isLongPressActive.current = false;
                        return;
                    }
                    if (showMenu) return;
                    if (!disabled) onToggle();
                }}
                disabled={disabled}
                className="st-btn"
                style={{
                    height: height || '42px',
                    backgroundColor: state ? '#333' : '#222',
                    boxShadow: state ? `inset 0 0 0 1px ${activeColor}` : 'none',
                    cursor: disabled ? 'default' : 'pointer',
                    color: isRandom ? activeColor : inactiveColor,
                    opacity: disabled ? 0.4 : lowlighted ? lowlightedOpacity : 1,
                }}
                title={typeof value === 'string' ? value : ''}
            >
                <div className="st-btn-icon">{renderStatusIcon()}</div>
                <span
                    className="st-btn-label"
                    style={{
                        fontSize: (label === 'TONIC' && !isRandom) ? '22px' : '11.5px',
                        fontFamily: (label === 'TONIC' && !isRandom) ? 'serif' : 'sans-serif',
                        textTransform: (label === 'TONIC' && !isRandom) ? 'none' : 'uppercase',
                        color: isRandom ? activeColor : '#eee',
                    }}
                >
                    {isRandom
                        ? (label === 'FAMILY' && state === 'hepta' ? 'Heptatonic' : 'RANDOM')
                        : value
                    }
                </span>
            </button>

            {showMenu && (
                <>
                    <div className="st-popup-overlay" onClick={() => setShowMenu(false)} />
                    <div className="st-popup">
                        <div className="st-popup-hint">Select {label}</div>
                        <div className="st-popup-options">
                            {longPressOptions.map((opt, idx) => {
                                const isSelected = value === opt.value || value === opt.label;
                                return (
                                    <button
                                        key={idx}
                                        onClick={(e) => handleOptionClick(e, opt)}
                                        className={`st-popup-option${isSelected ? ' selected' : ''}`}
                                    >
                                        {opt.iconType && (
                                            <div className="st-popup-option-icon">
                                                {renderIcon(opt.iconType, isSelected ? 'black' : '#888', 18)}
                                            </div>
                                        )}
                                        <span>{opt.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default SmartToggle;
