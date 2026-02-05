import React, { useState, useEffect } from 'react';
import '../../styles/App.css'
import { modes, getModeIndex, getModeDisplayName } from '../../utils/scaleHandler';

const rootStyles = getComputedStyle(document.documentElement);
const COLORS = {
    tonic: rootStyles.getPropertyValue('--wheel-color-tonic').trim(),
    highlight: rootStyles.getPropertyValue('--wheel-color-highlight').trim(),
    lowlight: rootStyles.getPropertyValue('--wheel-color-lowlight').trim(),
    textTonic: rootStyles.getPropertyValue('--wheel-text-color-tonic').trim(),
    textHighlight: rootStyles.getPropertyValue('--wheel-text-color-highlight').trim(),
    textLowlight: rootStyles.getPropertyValue('--wheel-text-color-lowlight').trim(),
};

// Calculate active indices from scale intervals (starting from 0)
const calculateActiveIndices = (intervals) => {
    const indices = [0];
    let current = 0;
    for (let i = 0; i < intervals.length - 1; i++) {
        current += intervals[i];
        indices.push(current % 12);
    }
    return indices;
};

const ScaleSelectorWheel = ({ family = 'Diatonic', activeMode = null, onSelect, size = 200 }) => {
    const allSlices = 12; // 12 chromatic notes
    const angle = 360 / allSlices;

    // Get modes for the selected family from scaleHandler
    const familyModes = modes[family] || modes.Diatonic;
    const modeNames = Object.keys(familyModes);

    // Get the first mode's intervals to determine which chromatic positions are active
    const firstModeName = modeNames[0];
    const firstModeIntervals = familyModes[firstModeName];

    // Calculate active indices based on the first mode's intervals
    const activeIndices = calculateActiveIndices(firstModeIntervals);

    // Get mode index (Roman numeral) using helper function
    const getModeLabel = (modeName) => {
        return getModeIndex(family, modeName) || '';
    };
    const outerRadius = size / 2;
    const innerRadius = outerRadius * 0.5; // Inner radius for donut shape
    const cx = outerRadius;
    const cy = outerRadius;

    // Initial selectedIndex based on activeMode
    const getInitialIndex = () => {
        if (activeMode) {
            const index = modeNames.indexOf(activeMode);
            return index !== -1 ? index : 0;
        }
        return 0;
    };

    const [selectedIndex, setSelectedIndex] = useState(getInitialIndex);

    const [currentRotation, setCurrentRotation] = useState(
        -(activeIndices[getInitialIndex()] + 0.5) * angle
    );

    // Update rotation when activeMode or family changes externally
    useEffect(() => {
        if (activeMode) {
            const newIndex = modeNames.indexOf(activeMode);
            if (newIndex !== -1) {
                setSelectedIndex(newIndex);
                const targetRotation = -(activeIndices[newIndex] + 0.5) * angle;
                setCurrentRotation(targetRotation);
            }
        } else {
            // Reset to first mode if no active mode
            setSelectedIndex(0);
            setCurrentRotation(-(activeIndices[0] + 0.5) * angle);
        }
    }, [activeMode, family]);

    const handleClick = (i) => {
        if (!activeIndices.includes(i)) return;
        const newIndex = activeIndices.indexOf(i);

        const targetRotation = -(activeIndices[newIndex] + 0.5) * angle;
        let delta = targetRotation - currentRotation;

        // Shortest rotation
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        setCurrentRotation(currentRotation + delta);
        setSelectedIndex(newIndex);
        onSelect && onSelect(modeNames[newIndex]);
    };

    const getPathForSlice = (i) => {
        const startAngle = (i * angle - 90) * (Math.PI / 180);
        const endAngle = ((i + 1) * angle - 90) * (Math.PI / 180);

        // Outer arc points
        const outerX1 = cx + outerRadius * Math.cos(startAngle);
        const outerY1 = cy + outerRadius * Math.sin(startAngle);
        const outerX2 = cx + outerRadius * Math.cos(endAngle);
        const outerY2 = cy + outerRadius * Math.sin(endAngle);

        // Inner arc points
        const innerX1 = cx + innerRadius * Math.cos(startAngle);
        const innerY1 = cy + innerRadius * Math.sin(startAngle);
        const innerX2 = cx + innerRadius * Math.cos(endAngle);
        const innerY2 = cy + innerRadius * Math.sin(endAngle);

        // Create donut slice path: start at inner point, line to outer, arc outer edge, line to inner end, arc inner edge back
        const largeArcFlag = angle > 180 ? 1 : 0;
        return `
            M ${innerX1} ${innerY1} 
            L ${outerX1} ${outerY1} 
            A ${outerRadius} ${outerRadius} 
            0 ${largeArcFlag} 
            1 ${outerX2} ${outerY2} 
            L ${innerX2} ${innerY2} 
            A ${innerRadius} ${innerRadius} 
            0 ${largeArcFlag} 
            0 ${innerX1} ${innerY1} 
            Z
        `;
    };

    return (
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, display: 'block', margin: '0 auto' }}>
            <g
                style={{
                    transition: 'transform 0.5s ease',
                    transform: `rotate(${currentRotation}deg)`,
                    transformOrigin: `${cx}px ${cy}px`,
                }}
            >
                {Array.from({ length: allSlices }).map((_, i) => {
                    const isActive = activeIndices.includes(i);
                    const activeIndex = activeIndices.indexOf(i);
                    const midAngle = ((i + 0.5) * angle - 90) * (Math.PI / 180);
                    // Position labels between inner and outer radius
                    const labelRadius = (innerRadius + outerRadius) / 2;
                    const labelX = cx + labelRadius * Math.cos(midAngle);
                    const labelY = cy + labelRadius * Math.sin(midAngle);

                    return (
                        <g
                            key={i}
                            onClick={() => handleClick(i)}
                            style={{ cursor: isActive ? 'pointer' : 'default' }}
                        >
                            <path
                                tabIndex={-1}
                                d={getPathForSlice(i)}
                                fill={
                                    isActive
                                        ? activeIndex === selectedIndex
                                            ? COLORS.tonic
                                            : COLORS.highlight
                                        : COLORS.lowlight
                                }
                                stroke="#222"
                                strokeWidth="2"
                            />
                            {isActive && activeIndex < modeNames.length && (() => {
                                const modeName = modeNames[activeIndex];
                                const fullName = getModeDisplayName(family, modeName);
                                const words = fullName.split(' ');

                                // Calculate if there's enough space
                                const sliceAngleDegrees = angle;
                                const arcLengthAtRadius = (sliceAngleDegrees * Math.PI / 180) * ((innerRadius + outerRadius) / 2);
                                const estimatedTextHeight = words.length * 11;
                                const hasEnoughSpace = arcLengthAtRadius > estimatedTextHeight + 10;

                                // Edge angles (relative to slices)
                                const startA = i * angle - 90;
                                const endA = (i + 1) * angle - 90;

                                // Positions for edge labels
                                // Offset slightly from the exact edge to avoid overlapping stroke
                                const edgeLabelRadius = (innerRadius + outerRadius) / 2;
                                const edgePadding = 3; // degrees offset from radial line

                                const leftAngle = startA + edgePadding;
                                const rightAngle = endA - edgePadding;

                                const lx = cx + edgeLabelRadius * Math.cos(leftAngle * Math.PI / 180);
                                const ly = cy + edgeLabelRadius * Math.sin(leftAngle * Math.PI / 180);
                                const rx = cx + edgeLabelRadius * Math.cos(rightAngle * Math.PI / 180);
                                const ry = cy + edgeLabelRadius * Math.sin(rightAngle * Math.PI / 180);

                                return (
                                    <>
                                        {/* Center Label (Roman Numeral) */}
                                        <text
                                            x={labelX}
                                            y={labelY}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            fontSize="14"
                                            fontFamily="sans-serif"
                                            fill={activeIndex === selectedIndex ? COLORS.textTonic : COLORS.textHighlight}
                                            transform={`rotate(${-currentRotation} ${labelX} ${labelY})`}
                                            style={{ pointerEvents: 'none' }}
                                        >
                                            {getModeLabel(modeName)}
                                        </text>

                                        {/* Left Edge Label (multiline, conditional) */}
                                        {hasEnoughSpace && (
                                            <text
                                                x={lx}
                                                y={ly}
                                                textAnchor="middle"
                                                dominantBaseline="text-after-edge"
                                                fontSize="10"
                                                fontFamily="sans-serif"
                                                fill="rgba(255, 255, 255, 0.4)"
                                                transform={`rotate(${leftAngle + 180} ${lx} ${ly})`}
                                                style={{ pointerEvents: 'none', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                                            >
                                                {words.map((word, idx) => (
                                                    <tspan key={idx} x={lx} dy={idx === 0 ? 0 : 11}>{word}</tspan>
                                                ))}
                                            </text>
                                        )}

                                        {/* Right Edge Label (multiline, conditional) */}
                                        {hasEnoughSpace && (
                                            <text
                                                x={rx}
                                                y={ry}
                                                textAnchor="middle"
                                                dominantBaseline="text-after-edge"
                                                fontSize="10"
                                                fontFamily="sans-serif"
                                                fill="rgba(255, 255, 255, 0.4)"
                                                transform={`rotate(${rightAngle + 0} ${rx} ${ry})`}
                                                style={{ pointerEvents: 'none', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                                            >
                                                {words.map((word, idx) => (
                                                    <tspan key={idx} x={rx} dy={idx === 0 ? 0 : 11}>{word}</tspan>
                                                ))}
                                            </text>
                                        )}
                                    </>
                                );
                            })()}
                        </g>
                    );
                })}
            </g>
        </svg>
    );
};

export default ScaleSelectorWheel;
