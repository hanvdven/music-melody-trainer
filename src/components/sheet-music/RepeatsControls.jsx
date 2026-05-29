import React from 'react';

/**
 * SVG <g> sub-component for the repeat-count display in the sheet music header.
 * When showSettings is false: renders a right-aligned "NÀ" glyph (Maestro font).
 * When showSettings is true: returns null (the PlaybackSettings panel handles repeat editing).
 * `showRepeatsControls` and `onResetRepeatsTimer` are lifted to SheetMusic so that
 * handleSheetMusicClick and the number picker form can read/trigger them.
 */
const RepeatsControls = ({
    numRepeats,
    trebleStart,
    systemEndX,
    showSettings,
    debugMode,
    onResetRepeatsTimer,
}) => {
    if (!showSettings) {
        return (
            <g data-settings-keepalive="" onClick={(e) => { e.stopPropagation(); onResetRepeatsTimer(); }} style={{ cursor: 'pointer' }}>
                {debugMode && <rect x={systemEndX - 55} y={trebleStart - 50} width={55} height={30} fill="magenta" fillOpacity={0.4} stroke="magenta" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
                <rect x={systemEndX - 55} y={trebleStart - 50} width={55} height={30} fill="transparent" />
                <text
                    x={systemEndX}
                    y={trebleStart - 25}
                    fontFamily="Maestro"
                    fontWeight="normal"
                    textAnchor="end"
                    style={{ pointerEvents: 'none' }}
                >
                    {numRepeats === -1 ? '' : (
                        <>
                            <tspan fontSize="32" fill="var(--text-dim)">{numRepeats}</tspan>
                            <tspan fontSize="26" fill="var(--text-dim)"> À</tspan>
                        </>
                    )}
                </text>
            </g>
        );
    }

    return null;
};

export default RepeatsControls;
