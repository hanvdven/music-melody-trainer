import React, { useState, useEffect, useRef } from 'react';
import playSound from '../../audio/playSound';
import { PADS, DRUM_KITS, KIT_NOTE_MAPPINGS } from '../../audio/drumKits';

const DrumPad = ({ instruments, context, customMapping = {}, setCustomMapping, percussionSettings, setPercussionSettings, onNoteInput, qwertyKeyboardActive, theme }) => {
    const isLightMode = theme === 'light' || theme === 'meridienne';
    const subtleMix = (color) => {
        return `color-mix(in srgb, ${color} 65%, var(--soft-mix-target) 35%)`;
    };
    const [lastPlayed, setLastPlayed] = useState(null);
    const [kitPickerOpen, setKitPickerOpen] = useState(false);
    const activeStopsRef = useRef({});

    const activeKit = percussionSettings?.instrument || 'TR-808';
    const activeKitBase = KIT_NOTE_MAPPINGS[activeKit] || {};
    const effectiveMapping = { ...activeKitBase, ...customMapping };

    const play = (note) => {
        setLastPlayed(note);
        onNoteInput?.(note);

        // Choke Groups mapping
        const CHOKE_GROUPS = {
            ho: 'hihat', hh: 'hihat', hp: 'hihat',
            s: 'snare', sr: 'snare', sg: 'snare',
            cc: 'crash', cct: 'crash',
            cr: 'ride', crt: 'ride', cr_bell: 'ride'
        };
        const groupId = CHOKE_GROUPS[note] || note; // Self-choke if not in a group

        // Stop previous sound in the same group (including self)
        if (activeStopsRef.current[groupId]) {
            try {
                activeStopsRef.current[groupId]();
                delete activeStopsRef.current[groupId];
            } catch (e) { }
        }

        const inst = ['wh', 'wm', 'wl'].includes(note) ? instruments?.metronome : instruments?.percussion;

        // Ghost snare (sg) should be at 70% volume
        const vol = note === 'sg' ? 0.7 : 1;

        if (inst && context) {
            const stopFn = playSound(note, inst, context, context.currentTime, 0.25, vol, effectiveMapping);
            if (stopFn) {
                activeStopsRef.current[groupId] = stopFn;
            }
        }

        // Reset lastPlayed highlight after a short delay
        setTimeout(() => setLastPlayed(null), 150);
    };

    // Keyboard controls for drum pads
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Avoid triggering when user is typing in an input or if keyboard is disabled
            if (!qwertyKeyboardActive) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const keyMap = {
                ' ': 'k',
                'f': 's',
                't': 'hh',
                '5': 'ho',
                'y': 'cct',
                '6': 'cc',
                'u': 'crt',
                '7': 'cr_bell',
                '8': 'cr',
                'g': 'th',
                'h': 'tm',
                'j': 'tl',
                'd': 'sg',
                's': 'sr',
                'r': 'hp',
                'c': 'wh',
                'v': 'wm',
                'b': 'wl',
                'n': 'cb',
                'm': 'other'
            };

            const note = keyMap[e.key.toLowerCase()];
            if (note) {
                e.preventDefault();
                play(note);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [instruments, context, effectiveMapping, qwertyKeyboardActive]);

    const styles = {
        container: { width: '100%', height: '100%', position: 'relative', display: 'flex', boxSizing: 'border-box', borderRadius: '12px', overflow: 'hidden' },
        mainArea: { flex: 1, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' },
        kitSelector: { position: 'absolute', top: '10px', left: '10px', zIndex: 10 },
        svg: { width: '100%', height: '100%', filter: 'drop-shadow(0px 4px 8px rgba(0,0,0,0.5))' },
        pad: { cursor: 'pointer', transition: 'filter 0.1s ease' },
        shortcutText: { fontFamily: 'monospace', fontSize: 'clamp(14px, 2.4vw, 22px)', fontWeight: 'bold', fill: 'rgba(128,128,128,0.85)', textAnchor: 'middle', pointerEvents: 'none', userSelect: 'none' },
        label: { fontFamily: 'Arial, sans-serif', fontSize: 'clamp(9px, 1.5vw, 13px)', fontWeight: 'bold', fill: 'rgba(0,0,0,0.85)', textAnchor: 'middle', pointerEvents: 'none', userSelect: 'none' }
    };

    const ShortcutLabel = ({ x, y, shortcut }) => {
        if (!qwertyKeyboardActive || !shortcut) return null;
        const displayKey = shortcut === ' ' ? '␣' : shortcut.toUpperCase();
        return (
            <text x={x} y={y} style={styles.shortcutText}>{displayKey}</text>
        );
    };

    const CirclePad = ({ cx, cy, r, note, label, color, shortcut }) => (
        <g onClick={() => play(note)} style={styles.pad}>
            <circle cx={cx} cy={cy} r={r} fill={subtleMix(color)} stroke={lastPlayed === note ? 'white' : 'rgba(0,0,0,0.2)'} strokeWidth={lastPlayed === note ? 3 : 2} />
            <text x={cx} y={cy + 12} style={styles.label}>{label}</text>
            <ShortcutLabel x={cx} y={cy - 2} shortcut={shortcut} />
        </g>
    );

    const RectPad = ({ x, y, width, height, rx, note, label, color, shortcut }) => (
        <g onClick={() => play(note)} style={styles.pad}>
            <rect x={x} y={y} width={width} height={height} rx={rx} fill={subtleMix(color)} stroke={lastPlayed === note ? 'white' : 'rgba(0,0,0,0.2)'} strokeWidth={lastPlayed === note ? 3 : 2} />
            <text x={x + width / 2} y={y + height / 2 + 12} style={styles.label}>{label}</text>
            <ShortcutLabel x={x + width / 2} y={y + height / 2 - 2} shortcut={shortcut} />
        </g>
    );

    const SemiCircle = ({ cx, cy, r, side, note, label, color, labelYOffset = 0, shortcut }) => {
        const d = side === 'top'
            ? `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z`
            : `M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy} Z`;
        const labelY = side === 'top' ? cy - r / 2 : cy + r / 2 + 12;
        const shortcutX = cx;
        const shortcutY = side === 'top' ? labelY - 14 : labelY - 14;
        return (
            <g onClick={() => play(note)} style={styles.pad}>
                <path d={d} fill={subtleMix(color)} stroke={lastPlayed === note ? 'white' : 'rgba(0,0,0,0.2)'} strokeWidth={lastPlayed === note ? 3 : 2} />
                <text x={cx} y={labelY + labelYOffset} style={styles.label}>{label}</text>
                <ShortcutLabel x={shortcutX} y={shortcutY + labelYOffset} shortcut={shortcut} />
            </g>
        );
    };

    const activeKitName = Object.keys(DRUM_KITS).find(k => DRUM_KITS[k] === activeKit) || activeKit;

    return (
        <div style={styles.container}>
            <div style={styles.kitSelector}>
                <button
                    onClick={() => setKitPickerOpen(true)}
                    style={{ padding: '6px 12px', backgroundColor: 'var(--accent-yellow)', border: 'none', borderRadius: '6px', color: '#000', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
                >
                    {activeKitName}
                </button>
            </div>

            <div style={styles.mainArea}>
                <svg viewBox="0 0 800 600" style={styles.svg} preserveAspectRatio="xMidYMid meet">

                    {/* Vertical middle line for reference */}
                    <line x1={400} y1={0} x2={400} y2={500} stroke="#555" strokeWidth="1" strokeDasharray="4 4" />

                    {/* Bass Drum */}
                    <CirclePad cx={400} cy={420} r={140} note="k" label="bass drum" color="var(--chromatone-percussion-kick)" shortcut=" " />

                    {/* TOMS */}
                    <CirclePad cx={320} cy={280} r={80} note="th" label="tom high" color="var(--chromatone-percussion-tom-high)" shortcut="g" />
                    <CirclePad cx={480} cy={280} r={80} note="tm" label="mid tom" color="var(--chromatone-percussion-tom-mid)" shortcut="h" />
                    <CirclePad cx={620} cy={400} r={100} note="tl" label="floor tom" color="var(--chromatone-percussion-tom-floor)" shortcut="j" />

                    {/* SNARE — full circle base, rim + ghost wedges overlaid on top */}
                    {/* cx=180, cy=400, r=100 */}
                    {/* chord x=140: top=(140,308.35), bottom=(140,491.65) */}
                    {/* horizontal y=400: left-edge=(80,400), chord-cross=(140,400) */}
                    <g>
                        {/* Snare: full circle */}
                        <circle cx={180} cy={400} r={100}
                            fill={subtleMix('var(--chromatone-percussion-snare)')}
                            stroke={lastPlayed === 's' ? 'white' : 'rgba(0,0,0,0.2)'}
                            strokeWidth={lastPlayed === 's' ? 3 : 2}
                            onClick={() => play('s')} style={styles.pad} />
                        {/* Rim click: top-left wedge */}
                        <path d="M 140 308.35 A 100 100 0 0 0 80 400 L 140 400 Z"
                            fill={subtleMix('var(--chromatone-percussion-snare-rim)')}
                            stroke={lastPlayed === 'sr' ? 'white' : 'rgba(0,0,0,0.2)'}
                            strokeWidth={lastPlayed === 'sr' ? 3 : 2}
                            onClick={e => { e.stopPropagation(); play('sr'); }} style={styles.pad} />
                        {/* Ghost snare: bottom-left wedge */}
                        <path d="M 80 400 A 100 100 0 0 0 140 491.65 L 140 400 Z"
                            fill={subtleMix('var(--chromatone-percussion-snare-ghost)')}
                            stroke={lastPlayed === 'sg' ? 'white' : 'rgba(0,0,0,0.2)'}
                            strokeWidth={lastPlayed === 'sg' ? 3 : 2}
                            onClick={e => { e.stopPropagation(); play('sg'); }} style={styles.pad} />
                        {/* Dividing lines */}
                        <line x1="140" y1="308.35" x2="140" y2="491.65" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" pointerEvents="none" />
                        <line x1="80" y1="400" x2="140" y2="400" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" pointerEvents="none" />
                        {/* Labels */}
                        <text x={110} y={348} style={{ ...styles.label, fontSize: '10px' }} pointerEvents="none">rim</text>
                        <text x={110} y={448} style={{ ...styles.label, fontSize: '10px' }} pointerEvents="none">ghost</text>
                        <text x={205} y={405} style={styles.label} pointerEvents="none">snare</text>
                        {/* Shortcuts */}
                        <ShortcutLabel x={205} y={405 - 2} shortcut="f" />
                        <ShortcutLabel x={110} y={348 - 2} shortcut="s" />
                        <ShortcutLabel x={110} y={448 - 2} shortcut="d" />
                    </g>

                    {/* CYMBALS */}
                    <SemiCircle cx={270} cy={130} r={90} side="top" note="cc" label="crash" color="var(--chromatone-percussion-crash)" shortcut="6" />
                    <SemiCircle cx={270} cy={130} r={90} side="bottom" note="cct" label="crash tip" color="var(--chromatone-percussion-crash-tip)" shortcut="y" />

                    <SemiCircle cx={530} cy={130} r={90} side="top" note="cr" label="ride" color="var(--chromatone-percussion-ride)" shortcut="8" />
                    <SemiCircle cx={530} cy={130} r={90} side="bottom" note="crt" label="ride tip" color="var(--chromatone-percussion-ride-tip)" shortcut="u" />
                    <g style={styles.pad} onClick={e => { e.stopPropagation(); play('cr_bell') }}>
                        <circle cx={530} cy={130} r={25} fill={subtleMix('var(--chromatone-percussion-ride-bell)')} stroke={lastPlayed === 'cr_bell' ? 'white' : 'rgba(0,0,0,0.3)'} strokeWidth={lastPlayed === 'cr_bell' ? 3 : 2} />
                        <ShortcutLabel x={530} y={130} shortcut="7" />
                    </g>

                    {/* HI-HAT — r=100, cx=140, cy=215; diagonal endpoints at cx±71, cy∓71 */}
                    <g style={styles.pad}>
                        <circle cx={140} cy={215} r={100} fill={subtleMix('var(--chromatone-percussion-hihat-closed)')} stroke={lastPlayed === 'hh' || lastPlayed === 'ho' ? 'white' : 'rgba(0,0,0,0.2)'} strokeWidth={lastPlayed === 'hh' || lastPlayed === 'ho' ? 3 : 2} />
                        <path d="M 211 144 A 100 100 0 0 0 69 286 Z" fill={subtleMix('var(--chromatone-percussion-hihat-open)')} onClick={e => { e.stopPropagation(); play('ho') }} pointerEvents="all" />
                        <path d="M 211 144 A 100 100 0 0 1 69 286 Z" fill="transparent" onClick={e => { e.stopPropagation(); play('hh') }} pointerEvents="all" />
                        <line x1="69" y1="286" x2="211" y2="144" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
                        <text x={100} y={175} style={styles.label}><tspan x={100} dy="0">hi-hat</tspan><tspan x={100} dy="14">open</tspan></text>
                        <text x={175} y={250} style={styles.label}><tspan x={180} dy="0">hi-hat</tspan><tspan x={180} dy="14">closed</tspan></text>
                        <ShortcutLabel x={100} y={175 - 2} shortcut="5" />
                        <ShortcutLabel x={175} y={250 - 2} shortcut="t" />
                    </g>
                    <RectPad x={80} y={500} width={200} height={60} rx={15} note="hp" label="hi-hat pedal" color="var(--chromatone-percussion-hihat-pedal)" shortcut="r" />

                    {/* WOODBLOCKS & COWBELL & OTHER */}
                    <RectPad x={650} y={30} width={120} height={40} rx={10} note="wh" label="woodblock hi" color="var(--chromatone-percussion-woodblock-hi)" shortcut="c" />
                    <RectPad x={650} y={80} width={120} height={40} rx={10} note="wm" label="woodblock mid" color="var(--chromatone-percussion-woodblock-mid)" shortcut="v" />
                    <RectPad x={650} y={130} width={120} height={40} rx={10} note="wl" label="woodblock lo" color="var(--chromatone-percussion-woodblock-lo)" shortcut="b" />
                    <RectPad x={650} y={180} width={120} height={40} rx={10} note="cb" label="cowbell" color="var(--chromatone-percussion-cowbell)" shortcut="n" />
                    <RectPad x={650} y={230} width={120} height={40} rx={10} note="other" label="other" color="var(--chromatone-percussion-other)" shortcut="m" />
                </svg>
            </div>

            {/* Kit picker modal */}
            {kitPickerOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>
                    <div onClick={() => setKitPickerOpen(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} />
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: '#222', border: '2px solid var(--text-primary)', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div style={{ color: '#888', fontSize: '10px', textAlign: 'center', fontWeight: 'bold', marginBottom: '5px' }}>SELECT DRUM KIT</div>
                        {Object.keys(DRUM_KITS).map(name => (
                            <button key={name}
                                onClick={() => { const kitId = DRUM_KITS[name]; setPercussionSettings?.(p => ({ ...p, instrument: kitId })); setCustomMapping?.({}); setKitPickerOpen(false); }}
                                style={{ padding: '10px', backgroundColor: activeKit === DRUM_KITS[name] ? 'var(--accent-yellow)' : '#333', color: activeKit === DRUM_KITS[name] ? 'black' : 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                {name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DrumPad;
