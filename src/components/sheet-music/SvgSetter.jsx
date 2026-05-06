import React from 'react';
import './SheetMusic.css';

/**
 * A reusable native-SVG component for numeric (or string) setting.
 * Renders an inline - [value] + interface with hitboxes.
 */
const SvgSetter = ({
    x,
    y,
    value,
    label,
    onDecrement,
    onIncrement,
    onValueClick,
    onValueLongPress,
    valueFontFamily = 'Maestro',
    valueFontSize = 24,
    labelFontFamily = 'serif',
    labelFontStyle = 'italic',
    labelFontSize = 12,
    labelOffsetY = -25,
    showLabel = true,
    labelClassName,
    leftBoxWidth = 26,
    rightBoxWidth = 26,
    boxHeight = 26,
    centerBoxWidth = 24,
    spacing = 15,
    showControls = true,
    valueDy = 0,   // extra y offset for the value glyph (Maestro baseline correction)
    onInteraction // e.g. reset timers
}) => {
    const timerRef = React.useRef(null);
    const isLongPress = React.useRef(false);

    const startLongPress = () => {
        if (!onValueLongPress) return;
        isLongPress.current = false;
        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            onValueLongPress();
        }, 500);
    };

    const cancelLongPress = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        isLongPress.current = false;
    };

    // Returns event handler props for a hitbox zone. shortClickFn is called on short press.
    const makeHandlers = (shortClickFn) => ({
        onMouseDown: () => { onInteraction?.(); startLongPress(); },
        onMouseUp: (e) => {
            if (timerRef.current) clearTimeout(timerRef.current);
            if (!isLongPress.current) { e.stopPropagation(); shortClickFn?.(); }
            isLongPress.current = false;
        },
        onMouseLeave: cancelLongPress,
        onTouchStart: () => { onInteraction?.(); startLongPress(); },
        onTouchEnd: (e) => {
            e.preventDefault(); // prevent browser from synthesizing mouse events (avoids double-trigger)
            if (timerRef.current) clearTimeout(timerRef.current);
            if (!isLongPress.current) { e.stopPropagation(); shortClickFn?.(); }
            isLongPress.current = false;
        },
        onTouchCancel: cancelLongPress,
        onMouseEnter: () => onInteraction?.(),
    });

    return (
        <g>
            {/* Label */}
            {showLabel && label && (
                <text
                    x={x}
                    y={y + labelOffsetY}
                    className={`svg-no-interact${labelClassName ? ' ' + labelClassName : ''}`}
                    textAnchor="middle"
                    fontFamily={labelFontFamily}
                    fontStyle={labelFontStyle}
                    fontSize={labelFontSize}
                    fontWeight="normal"
                    fill="var(--text-primary)"
                >
                    {label}
                </text>
            )}

            {/* Value */}
            <text
                x={x}
                y={y + valueDy}
                className="bpm-value svg-no-interact"
                textAnchor="middle"
                fontFamily={valueFontFamily}
                fontSize={valueFontSize}
                fill="var(--text-primary)"
            >
                {value}
            </text>

            {/* - / + Indicators */}
            {showControls && (
                <>
                    <text x={x - spacing} y={y - 2} className="measure-indicator" textAnchor="end">
                        -
                    </text>
                    <text x={x + spacing} y={y - 2} className="measure-indicator" textAnchor="start">
                        +
                    </text>

                    {/* Left Hitbox (Decrement / long-press opens picker) */}
                    <rect
                        x={x - spacing - leftBoxWidth + 5}
                        y={y - boxHeight - Math.abs(labelOffsetY) / 3}
                        width={leftBoxWidth}
                        height={boxHeight + 10}
                        fill="transparent"
                        className="svg-pointer"
                        {...makeHandlers(() => { onInteraction?.(); onDecrement?.(); })}
                    />

                    {/* Right Hitbox (Increment / long-press opens picker) */}
                    <rect
                        x={x + spacing - 5}
                        y={y - boxHeight - Math.abs(labelOffsetY) / 3}
                        width={rightBoxWidth}
                        height={boxHeight + 10}
                        fill="transparent"
                        className="svg-pointer"
                        {...makeHandlers(() => { onInteraction?.(); onIncrement?.(); })}
                    />
                </>
            )}

            {/* Center Hitbox (Value Click / Long Press) */}
            {showControls && (onValueClick || onValueLongPress) && (
                <rect
                    x={x - centerBoxWidth / 2}
                    y={y - boxHeight + 5}
                    width={centerBoxWidth}
                    height={boxHeight}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    {...makeHandlers(onValueClick)}
                />
            )}
        </g>
    );
};

export default SvgSetter;
