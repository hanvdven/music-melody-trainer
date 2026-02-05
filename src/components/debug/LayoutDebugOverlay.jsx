// Temporary debug overlay to visualize layout boundaries
import React from 'react';

const LayoutDebugOverlay = () => {
    // const overlayStyle = {
    //     position: 'fixed',
    //     top: 0,
    //     left: 0,
    //     right: 0,
    //     bottom: 0,
    //     pointerEvents: 'none',
    //     zIndex: 9999,
    //     fontFamily: 'monospace',
    //     fontSize: '11px',
    //     fontWeight: 'bold'
    // };
    //
    // const labelStyle = {
    //     position: 'absolute',
    //     backgroundColor: 'rgba(255, 255, 0, 0.9)',
    //     color: 'black',
    //     padding: '2px 6px',
    //     borderRadius: '3px',
    //     whiteSpace: 'nowrap'
    // };
    //
    // const borderStyle = {
    //     position: 'absolute',
    //     border: '2px solid yellow',
    //     boxSizing: 'border-box'
    // };
    //
    // return (
    //     <div style={overlayStyle}>
    //         {/* Top Section - Sheet Music Area */}
    //         <div style={{ ...borderStyle, top: '20px', left: 0, right: 0, height: '44vh' }}>
    //             <div style={{ ...labelStyle, top: 4, left: 4 }}>SHEET MUSIC AREA</div>
    //         </div>
    //
    //         {/* Sheet Music Content (with 20px margins) */}
    //         <div style={{ ...borderStyle, top: '20px', left: '20px', right: '20px', height: '44vh', borderColor: 'rgba(0, 255, 0, 0.8)' }}>
    //             <div style={{ ...labelStyle, top: 24, left: 4, backgroundColor: 'rgba(0, 255, 0, 0.9)' }}>Content (20px margins)</div>
    //         </div>
    //
    //         {/* Playback Controls */}
    //         <div style={{ ...borderStyle, top: 'calc(20px + 44vh)', left: '20px', right: '20px', height: '40px', borderColor: 'orange' }}>
    //             <div style={{ ...labelStyle, top: 4, left: 4, backgroundColor: 'rgba(255, 165, 0, 0.9)' }}>PLAYBACK CONTROLS</div>
    //         </div>
    //
    //         {/* Bottom Panel */}
    //         <div style={{ ...borderStyle, top: 'calc(20px + 44vh)', left: 0, right: 0, bottom: '20px', borderColor: 'yellow' }}>
    //             <div style={{ ...labelStyle, top: 4, left: 4 }}>BOTTOM PANEL (56vh)</div>
    //         </div>
    //
    //         {/* Menu Selector */}
    //         <div style={{ ...borderStyle, top: 'calc(20px + 44vh)', left: 0, right: 0, height: '54px', borderColor: 'rgba(255, 255, 0, 0.8)' }}>
    //             <div style={{ ...labelStyle, top: 4, left: 4, backgroundColor: 'rgba(255, 255, 0, 0.9)' }}>MENU SELECTOR (centered)</div>
    //         </div>
    //
    //         {/* Content Area */}
    //         <div style={{ ...borderStyle, top: 'calc(20px + 44vh + 54px)', left: '20px', right: '20px', bottom: '20px', borderColor: 'rgba(255, 0, 255, 0.8)' }}>
    //             <div style={{ ...labelStyle, top: 4, left: 4, backgroundColor: 'rgba(255, 0, 255, 0.9)' }}>CONTENT AREA (20px margins)</div>
    //         </div>
    //
    //         {/* Scale Selector - Mode Buttons */}
    //         <div style={{ ...borderStyle, top: 'calc(20px + 44vh + 54px)', left: '20px', right: '20px', height: '40px', borderColor: 'rgba(255, 165, 0, 0.8)' }}>
    //             <div style={{ ...labelStyle, top: 4, left: 4, backgroundColor: 'rgba(255, 165, 0, 0.9)' }}>MODE SELECTOR</div>
    //         </div>
    //
    //         {/* Scale Selector - Main Content */}
    //         <div style={{ ...borderStyle, top: 'calc(20px + 44vh + 54px + 40px + 30px)', left: '20px', right: '20px', bottom: 'calc(20px + 140px)', borderColor: 'rgba(0, 255, 255, 0.8)' }}>
    //             <div style={{ ...labelStyle, top: 4, left: 4, backgroundColor: 'rgba(0, 255, 255, 0.9)' }}>SCALE CONTENT</div>
    //         </div>
    //
    //         {/* Family Buttons Column (30%) */}
    //         <div style={{ ...borderStyle, top: 'calc(20px + 44vh + 54px + 40px + 30px + 20px)', left: '20px', width: 'calc(30% - 20px)', bottom: 'calc(20px + 140px)', borderColor: 'rgba(255, 0, 0, 0.8)' }}>
    //             <div style={{ ...labelStyle, top: 4, left: 4, backgroundColor: 'rgba(255, 0, 0, 0.9)' }}>FAMILIES (30%)</div>
    //         </div>
    //
    //         {/* Wheel/List Area */}
    //         <div style={{ ...borderStyle, top: 'calc(20px + 44vh + 54px + 40px + 30px + 20px)', left: 'calc(30% + 12px)', right: '20px', bottom: 'calc(20px + 140px)', borderColor: 'rgba(255, 165, 0, 0.8)' }}>
    //             <div style={{ ...labelStyle, top: 4, left: 4, backgroundColor: 'rgba(255, 165, 0, 0.9)' }}>WHEEL/LIST AREA</div>
    //         </div>
    //
    //         {/* Piano View (SELECT TONIC) */}
    //         <div style={{ ...borderStyle, bottom: '20px', left: '20px', right: '20px', height: '140px', borderColor: 'rgba(173, 255, 47, 0.8)' }}>
    //             <div style={{ ...labelStyle, top: 4, left: 4, backgroundColor: 'rgba(173, 255, 47, 0.9)' }}>SELECT TONIC (140px)</div>
    //         </div>
    //     </div>
    // );
};

export default LayoutDebugOverlay;
