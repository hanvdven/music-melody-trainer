import React from 'react';
import { Shuffle } from 'lucide-react';

// SVG group that renders a shuffle icon for per-measure randomization.
// Must be placed inside an <svg> element; caller wraps with a <g transform> for positioning.
const RandomizeIcon = ({ onClick, debugMode }) => (
    <g onClick={(e) => { e.stopPropagation(); onClick(); }} style={{ cursor: 'pointer' }}>
        {debugMode && <rect x="-10" y="-10" width="20" height="20" fill="yellow" fillOpacity={0.4} stroke="yellow" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
        <rect x="-10" y="-10" width="20" height="20" fill="transparent" />
        <g transform="translate(-8, -8)">
            <Shuffle size={16} color="var(--accent-yellow)" strokeWidth={3} />
        </g>
    </g>
);

export default RandomizeIcon;
