import React, { useState, useEffect } from 'react';
import '../../styles/App.css';
import { modes, getModeIndex, getModeDisplayName, scaleDefinitions } from '../../theory/scaleHandler';

// Use CSS variables directly for theme reactivity
const COLORS = {
    tonic: 'var(--wheel-color-tonic)',
    highlight: 'var(--wheel-color-highlight)',
    lowlight: 'var(--wheel-color-lowlight)',
    textTonic: 'var(--text-primary)',
    textHighlight: 'var(--text-primary)',
    textLowlight: 'var(--text-dim)',
};

// Calculate which of the 12 chromatic positions are active for this scale family,
// derived from the first mode's intervals (starting at 0).
const calculateActiveIndices = (intervals) => {
    const indices = [0];
    let current = 0;
    for (let i = 0; i < intervals.length - 1; i++) {
        current += intervals[i];
        indices.push(current % 12);
    }
    return indices;
};

// Build an SVG donut-slice path with slightly rounded outer corners.
// cornerDeg controls how many degrees of arc are "consumed" by each bezier curve at the outer edge.
const getPathForSlice = (i, allSlices, cx, cy, innerR, outerR, cornerDeg = 4) => {
    const angle = 360 / allSlices;
    const degToRad = (deg) => (deg * Math.PI) / 180;
    const polar = (r, a) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    const alpha = degToRad(cornerDeg);

    const start = degToRad(i * angle - 90);
    const end = degToRad((i + 1) * angle - 90);

    const arcStart = start + alpha;
    const arcEnd = end - alpha;

    // Slightly inset the outer corner points so the bezier curve meets the arc smoothly
    const outerInset = outerR - alpha * outerR;
    const cInset = outerR - (alpha * outerR) / 3;

    const p0 = polar(innerR, start);
    const p1 = polar(outerInset, start);
    const c1 = polar(cInset, start);
    const c2 = polar(outerR, start + alpha / 2);
    const p2 = polar(outerR, arcStart);

    const p3 = polar(outerR, arcEnd);
    const c3 = polar(outerR, end - alpha / 2);
    const c4 = polar(cInset, end);
    const p4 = polar(outerInset, end);
    const p5 = polar(innerR, end);

    const largeArc = angle > 180 ? 1 : 0;

    return `
        M ${p0.x} ${p0.y}
        L ${p1.x} ${p1.y}
        C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}
        A ${outerR} ${outerR} 0 ${largeArc} 1 ${p3.x} ${p3.y}
        C ${c3.x} ${c3.y} ${c4.x} ${c4.y} ${p4.x} ${p4.y}
        L ${p5.x} ${p5.y}
        A ${innerR} ${innerR} 0 ${largeArc} 0 ${p0.x} ${p0.y}
        Z
    `;
};

const ScaleSelectorWheel = ({ family = 'Diatonic', activeMode = null, onSelect, size = 200 }) => {
    const allSlices = 12; // fixed: one slice per chromatic semitone
    const angle = 360 / allSlices;

    const familyModes = modes[family] || modes.Diatonic;
    const modeNames = Object.keys(familyModes);

    // Derive which chromatic positions belong to this scale family from the first mode
    const firstModeIntervals = familyModes[modeNames[0]];
    const activeIndices = calculateActiveIndices(firstModeIntervals);

    const getModeLabel = (modeName) => getModeIndex(family, modeName) || '';

    // Wheel geometry
    const cx = size / 2;
    const cy = size / 2;
    const outerRadius = size / 2 - 4; // small padding from SVG edge
    const innerRadius = outerRadius * 0.35;

    // Robust active-mode lookup: handles clean names, prefixed keys, wheelName, and aliases.
    const findActiveIndex = (targetMode) => {
        if (!targetMode) return -1;
        const normalize = (str) => str ? str.replace(/^[IVX]+\.\s*/, '').trim().toLowerCase() : '';
        const targetNormalized = normalize(targetMode);

        for (let i = 0; i < modeNames.length; i++) {
            const wheelModeName = modeNames[i];
            const wheelModeNormalized = normalize(wheelModeName);

            // 1. Direct string match
            if (wheelModeNormalized === targetNormalized) return i;

            // 2. Match via scaleDefinitions (covers wheelName, preferredName, aliases)
            if (scaleDefinitions[family]) {
                const def = scaleDefinitions[family].find(d =>
                    normalize(d.name) === wheelModeNormalized ||
                    normalize(d.wheelName) === wheelModeNormalized ||
                    (d.index && normalize(`${d.index}. ${d.name}`) === wheelModeNormalized)
                );
                if (def) {
                    if (normalize(def.name) === targetNormalized) return i;
                    if (normalize(def.preferredName) === targetNormalized) return i;
                    if (normalize(def.wheelName) === targetNormalized) return i;
                    if (def.aliases && def.aliases.some(alias => normalize(alias) === targetNormalized)) return i;
                }
            }
        }
        return -1;
    };

    const getInitialIndex = () => findActiveIndex(activeMode);

    const [selectedIndex, setSelectedIndex] = useState(getInitialIndex);
    const [currentRotation, setCurrentRotation] = useState(() => {
        const idx = getInitialIndex();
        const effectiveIdx = idx === -1 ? 0 : idx;
        return -(activeIndices[effectiveIdx] + 0.5) * angle;
    });

    // Sync rotation when activeMode or family changes from outside
    useEffect(() => {
        if (activeMode) {
            const newIndex = findActiveIndex(activeMode);
            if (newIndex !== -1) {
                setSelectedIndex(newIndex);
                const baseTarget = -(activeIndices[newIndex] + 0.5) * angle;
                setCurrentRotation((prev) => {
                    const delta = baseTarget - prev;
                    const shortest = ((delta % 360) + 540) % 360 - 180;
                    return prev + shortest;
                });
            }
        } else {
            setSelectedIndex(-1);
            const baseTarget = -(activeIndices[0] + 0.5) * angle;
            setCurrentRotation((prev) => {
                const delta = baseTarget - prev;
                const shortest = ((delta % 360) + 540) % 360 - 180;
                return prev + shortest;
            });
        }
    }, [activeMode, family]);

    const handleClick = (i) => {
        if (!activeIndices.includes(i)) return;
        const newIndex = activeIndices.indexOf(i);
        const baseTarget = -(activeIndices[newIndex] + 0.5) * angle;
        setCurrentRotation((prev) => {
            const delta = baseTarget - prev;
            const shortest = ((delta % 360) + 540) % 360 - 180;
            return prev + shortest;
        });
        setSelectedIndex(newIndex);
        onSelect && onSelect(modeNames[newIndex]);
    };

    return (
        <svg
            viewBox={`0 0 ${size} ${size}`}
            style={{ width: size, height: size, display: 'block', margin: '0 auto' }}
        >
            <g
                style={{
                    transition: 'transform 0.5s ease',
                    transform: `rotate(${currentRotation}deg)`,
                    transformOrigin: `${cx}px ${cy}px`,
                }}
            >
                {Array.from({ length: allSlices }).map((_, i) => {
                    const isActive = activeIndices.includes(i);
                    const activeIndex = activeIndices.indexOf(i); // -1 for inactive
                    const midAngle = ((i + 0.5) * angle - 90) * (Math.PI / 180);
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
                                d={getPathForSlice(i, allSlices, cx, cy, innerRadius, outerRadius, 4)}
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
                            {isActive && activeIndex >= 0 && activeIndex < modeNames.length && (() => {
                                const modeName = modeNames[activeIndex];
                                const fullName = getModeDisplayName(family, modeName);

                                // Wrap words into lines that fit within the wedge radial width
                                const wedgeWidth = outerRadius - innerRadius;
                                const estimatedCharWidth = 6.5;
                                const charsPerLine = Math.max(10, Math.floor((wedgeWidth - 10) / estimatedCharWidth));
                                const rawWords = fullName.split(' ');
                                const lines = [];
                                let currentLine = rawWords[0];
                                for (let w = 1; w < rawWords.length; w++) {
                                    const word = rawWords[w];
                                    const isShortModifier = /^([b#]?\d+|Major|Minor)$/.test(word) || word.length <= 2;
                                    const canAppend = currentLine.length + word.length + 1 <= charsPerLine;
                                    const canAppendShort = isShortModifier && currentLine.length + word.length + 1 <= charsPerLine + 3;
                                    if (canAppend || canAppendShort) {
                                        currentLine += ' ' + word;
                                    } else {
                                        lines.push(currentLine);
                                        currentLine = word;
                                    }
                                }
                                lines.push(currentLine);

                                // Only show edge labels when the wheel is large enough
                                const arcLen = (angle * Math.PI / 180) * outerRadius;
                                const hasEnoughSpace = size >= 150 && arcLen > lines.length * 11 + 10;

                                const startA = i * angle - 90;
                                const endA = (i + 1) * angle - 90;
                                const edgePadding = 3;
                                const textRadius = (innerRadius + outerRadius) / 2;

                                const lxMid = cx + textRadius * Math.cos((startA + edgePadding) * Math.PI / 180);
                                const lyMid = cy + textRadius * Math.sin((startA + edgePadding) * Math.PI / 180);
                                const rxMid = cx + textRadius * Math.cos((endA - edgePadding) * Math.PI / 180);
                                const ryMid = cy + textRadius * Math.sin((endA - edgePadding) * Math.PI / 180);

                                return (
                                    <>
                                        {/* Roman numeral in center of slice — counter-rotates so it stays upright */}
                                        <text
                                            x={labelX}
                                            y={labelY}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            fontSize="14"
                                            fontFamily="sans-serif"
                                            fill={activeIndex === selectedIndex ? COLORS.textTonic : COLORS.textHighlight}
                                            style={{
                                                transform: `rotate(${-currentRotation}deg)`,
                                                transformOrigin: `${labelX}px ${labelY}px`,
                                                transition: 'transform 0.5s ease',
                                                pointerEvents: 'none',
                                            }}
                                        >
                                            {getModeLabel(modeName)}
                                        </text>

                                        {/* Left edge label — scale mode name, runs along radial edge */}
                                        {hasEnoughSpace && (
                                            <text
                                                x={lxMid}
                                                y={lyMid}
                                                textAnchor="middle"
                                                dominantBaseline="auto"
                                                fontSize="10"
                                                fontFamily="sans-serif"
                                                fill={COLORS.textLowlight}
                                                transform={`rotate(${startA + edgePadding + 180} ${lxMid} ${lyMid})`}
                                                style={{ pointerEvents: 'none', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                                            >
                                                {lines.map((line, idx) => (
                                                    <tspan key={idx} x={lxMid} dy={idx === 0 ? -((lines.length - 1) * 11 + 2) + 4 : 11}>
                                                        {line}
                                                    </tspan>
                                                ))}
                                            </text>
                                        )}

                                        {/* Right edge label — mirrors left */}
                                        {hasEnoughSpace && (
                                            <text
                                                x={rxMid}
                                                y={ryMid}
                                                textAnchor="middle"
                                                dominantBaseline="auto"
                                                fontSize="10"
                                                fontFamily="sans-serif"
                                                fill={COLORS.textLowlight}
                                                transform={`rotate(${endA - edgePadding} ${rxMid} ${ryMid})`}
                                                style={{ pointerEvents: 'none', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                                            >
                                                {lines.map((line, idx) => (
                                                    <tspan key={idx} x={rxMid} dy={idx === 0 ? -((lines.length - 1) * 11 + 2) + 4 : 11}>
                                                        {line}
                                                    </tspan>
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
