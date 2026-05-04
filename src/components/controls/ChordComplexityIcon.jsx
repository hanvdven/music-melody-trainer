import React from 'react';

// Renders stacked Maestro noteheads to visually represent chord complexity types.
const ChordComplexityIcon = ({ type }) => {
    const STEP   = 7;
    const OFFSET = 3.5;

    const Note = ({ x = 0, y = 0, char = 'w', lowlight = false }) => (
        <span style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y + OFFSET}px))`,
            fontFamily: 'Maestro',
            fontSize: '24px',
            lineHeight: 1,
            color: lowlight ? '#666' : 'var(--text-primary)',
            fontWeight: 'normal', // Maestro glyphs MUST be normal weight
            textTransform: 'none',
        }}>
            {char}
        </span>
    );

    return (
        <div style={{ position: 'relative', width: '24px', height: '20px', margin: '0 auto' }}>
            {type === 'root' && <Note y={0} />}
            {type === 'power' && (<><Note y={-2 * STEP} /><Note y={0} /></>)}
            {type === 'triad' && (<><Note y={-2 * STEP} /><Note y={-STEP} /><Note y={0} /></>)}
            {type === 'seventh' && (
                <><Note y={-3 * STEP} /><Note y={-2 * STEP} /><Note y={-STEP} /><Note y={0} /></>
            )}
            {type === 'sus' && (
                <>
                    <Note x={-12} y={-2.5 * STEP} char="b" lowlight />
                    <Note x={-12} y={-0.5 * STEP} char="#" lowlight />
                    <Note x={0}   y={-3   * STEP} lowlight />
                    <Note x={0}   y={-2   * STEP} />
                    <Note x={0}   y={-STEP} lowlight />
                    <Note x={0}   y={0} />
                    <Note x={12}  y={-2.5 * STEP} lowlight />
                    <Note x={12}  y={-1.5 * STEP} lowlight />
                    <Note x={12}  y={-0.5 * STEP} lowlight />
                </>
            )}
            {type === 'exotic' && (
                <>
                    <Note x={-11} y={-2.5 * STEP} char="b" lowlight />
                    <Note x={-11} y={-0.5 * STEP} char="#" lowlight />
                    <Note x={2}   y={-3 * STEP} />
                    <Note x={2}   y={-2 * STEP} />
                    <Note x={2}   y={-STEP} />
                    <Note x={2}   y={0} />
                </>
            )}
        </div>
    );
};

export default ChordComplexityIcon;
