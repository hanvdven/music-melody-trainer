import React from 'react';

// #UI-overhaul Stap 3 (Han 2026-08-27, "in debug mode: maak kaders rond de blokken ... met hun
// gpx-dimensie"): a debugMode-only overlay outlining the four blocks computeWorldLayout produces
// (world, nav, content 1, content 2), each labelled `W×H gpx  ×N`. All rects are already in viewport
// coordinates. pointerEvents:none — never intercepts (CLAUDE.md §3a). Monospace, never inherited (§1a).
const LABEL_STYLE = {
    position: 'absolute', top: 2, left: 4, font: '11px monospace', lineHeight: 1.3,
    background: 'rgba(0,0,0,0.6)', padding: '1px 4px', borderRadius: 3, whiteSpace: 'pre', pointerEvents: 'none',
};

function Frame({ r, color, label }) {
    return (
        <div style={{
            position: 'absolute', left: r.x, top: r.y, width: Math.max(0, r.screenW), height: Math.max(0, r.screenH),
            border: `1px dashed ${color}`, boxSizing: 'border-box', pointerEvents: 'none',
        }}>
            <span style={{ ...LABEL_STYLE, color }}>{label}</span>
        </div>
    );
}

export default function WorldLayoutDebugFrames({ layout }) {
    if (!layout) return null;
    const { scale, arrangement, world, nav, content } = layout;
    const crop = (world.topCropGpx || world.bottomCropGpx)
        ? `  crop −${world.topCropGpx}↑ −${world.bottomCropGpx}↓` : '';

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99998, pointerEvents: 'none' }}>
            <Frame r={world} color="#ff9800"
                label={`world  ${world.gpxW}×${world.gpxH} gpx   ×${scale}   [${arrangement}]${crop}`} />
            <Frame r={nav} color="#8bc34a"
                label={`nav  ${nav.gpxW}×${nav.gpxH} gpx  (${nav.cols}×${nav.rows} icons)   ×${scale}`} />
            <Frame r={content.block1} color="#03a9f4"
                label={`content 1 · conversation  ${content.block1.gpxW}×${content.block1.gpxH} gpx   ×${scale}`} />
            <Frame r={content.block2} color="#03a9f4"
                label={`content 2  ${content.block2.gpxW}×${content.block2.gpxH} gpx   ×${scale}`} />
        </div>
    );
}
