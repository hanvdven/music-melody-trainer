import React, { useState, useEffect } from 'react';
import '../../styles/App.css'
import { modes, getModeIndex } from '../../utils/scaleHandler';

const rootStyles = getComputedStyle(document.documentElement);
const COLORS = {
    tonic: rootStyles.getPropertyValue('--white-key-color-tonic').trim(),
    highlight: rootStyles.getPropertyValue('--white-key-color-highlight').trim(),
    lowlight: rootStyles.getPropertyValue('--wheel-color-lowlight').trim(),
    textTonic: rootStyles.getPropertyValue('--text-color-tonic').trim(),
    textHighlight: rootStyles.getPropertyValue('--text-color-highlight').trim(),
    textLowlight: rootStyles.getPropertyValue('--text-color-lowlight').trim(),
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

const ScaleSelectorWheel = ({ family = 'Diatonic', activeMode = null, onSelect }) => {
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
    const outerRadius = 100;
    const innerRadius = 50; // Inner radius for donut shape
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
        return `M ${innerX1} ${innerY1} L ${outerX1} ${outerY1} A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerX2} ${outerY2} L ${innerX2} ${innerY2} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerX1} ${innerY1} Z`;
    };

    return (
        <svg viewBox="0 0 200 200" style={{ width: 200, height: 200, display: 'block', margin: '0 auto' }}>
            <g
                style={{
                    transition: 'transform 0.5s ease',
                    transform: `rotate(${currentRotation}deg)`,
                    transformOrigin: '100px 100px',
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
                        <g key={i}>
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
                                strokeWidth="1"
                                onClick={() => handleClick(i)}
                                style={{ cursor: isActive ? 'pointer' : 'default' }}
                            />
                            {isActive && activeIndex < modeNames.length && (
                                <text
                                    x={labelX}
                                    y={labelY}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fontSize="14"
                                    fontFamily="sans-serif"
                                    fill={
                                        activeIndex === selectedIndex
                                            ? COLORS.textTonic
                                            : COLORS.textHighlight
                                    }
                                    transform={`rotate(${-currentRotation} ${labelX} ${labelY})`}
                                >
                                    {getModeLabel(modeNames[activeIndex])}
                                </text>
                            )}
                        </g>
                    );
                })}
            </g>
        </svg>
    );
};

export default ScaleSelectorWheel;
