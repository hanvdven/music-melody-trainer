import React from 'react';
import { CHORD_COMPLEXITY, CHORD_STRATEGIES } from '../../constants/generationFields';
import { DEFAULT_BPM, DEFAULT_TIME_SIG, DEFAULT_SCALE_TONIC, DEFAULT_SCALE_MODE } from '../../constants/generatorDefaults';

// Passing-chord type keys (Han 2026-08-06, "instelbaar: ... passing chords") — same enum
// InstrumentSettings.defaultChordInstrumentSettings's own comment documents for `passingChordTypes`
// (§6c: reuse the real list, don't invent a second one).
const PASSING_CHORD_TYPES = [
    'secondary-dominant', 'secondary-dim', 'tritone-sub', 'diatonic', 'sus4',
    'subdominant-approach', 'borrowed-parallel',
];

// Level 0 (Han 2026-08-06, "hoe kan ik level 0 aanpassen? dat wil ik in de 'config' voor het begin van
// het level doen, dus voordat het start, dus niet via instelling overlay"): a PRE-START editable form for
// every schema field (see levels.js's SCHEMA REFERENCE) — replaces the earlier "unhide the in-game
// settings overlay during Level 0" approach (which edited the RUNNING session instead of a fresh config).
// `draft` is the level object being built; `set`/`setTrack`/`setNested` are small immutable-update
// helpers so every field below stays a one-line row. Grouped to roughly mirror the schema reference's own
// section order (tempo/structure, enemy, key/theme, per-track).
const THEME_IDS = [
    'default', 'classical', 'paper', 'barley', 'cloudy-day', 'marble', 'marble-dark', 'sunset', 'stars',
    'museum', 'clover', 'river', 'lava', 'rock', 'pride-light', 'pride-dark', 'vapourwave', 'disco',
    'royal', 'cat', 'dog', 'ram',
];
const NOTE_POOLS = ['scale', 'chord', 'all', 'metronome'];
const RULES = ['uniform', 'emphasize_roots', 'weighted', 'arp', 'arp_var', 'arp_group', 'fixed'];
const VOICES = [1, 2, 3, 'var'];
const DENOMS = [1, 2, 4, 8, 16];
const VOLUMES = ['silent', 'pp', 'p', 'mp', 'mf', 'f'];
const MODES = ['Major', 'Minor', 'Dorian', 'Mixolydian', 'Harmonic Minor', 'Harmonic Major'];

function Row({ label, children }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
            <span style={{ opacity: 0.75 }}>{label}</span>
            {children}
        </label>
    );
}

function Section({ title, children }) {
    return (
        <div style={{ textAlign: 'left', marginBottom: 10 }}>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                {title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
        </div>
    );
}

export default function LevelZeroConfigForm({ draft, onChange }) {
    const set = (key, value) => onChange({ ...draft, [key]: value });
    const setNested = (group, key, value) => onChange({ ...draft, [group]: { ...draft[group], [key]: value } });
    const setTrack = (track, key, value) => onChange({
        ...draft, tracks: { ...draft.tracks, [track]: { ...draft.tracks?.[track], [key]: value } },
    });
    const num = (v, fallback = 0) => (v === '' ? fallback : Number(v));

    const t = draft.tracks?.treble || {};
    const b = draft.tracks?.bass || {};
    const p = draft.tracks?.percussion || {};

    return (
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '4px 2px', marginBottom: 14 }}>
            <Section title="Tempo & structuur">
                <Row label="bpm"><input type="number" value={draft.bpm ?? DEFAULT_BPM} style={{ width: 56 }}
                    onChange={(e) => set('bpm', num(e.target.value, DEFAULT_BPM))} /></Row>
                <Row label="maatsoort">
                    <span style={{ display: 'flex', gap: 4 }}>
                        <input type="number" value={draft.timeSignature?.[0] ?? DEFAULT_TIME_SIG[0]} style={{ width: 36 }}
                            onChange={(e) => set('timeSignature', [num(e.target.value, DEFAULT_TIME_SIG[0]), draft.timeSignature?.[1] ?? DEFAULT_TIME_SIG[1]])} />
                        /
                        <input type="number" value={draft.timeSignature?.[1] ?? DEFAULT_TIME_SIG[1]} style={{ width: 36 }}
                            onChange={(e) => set('timeSignature', [draft.timeSignature?.[0] ?? DEFAULT_TIME_SIG[0], num(e.target.value, DEFAULT_TIME_SIG[1])])} />
                    </span>
                </Row>
                <Row label="numMeasures (per blok)"><input type="number" value={draft.numMeasures} style={{ width: 56 }}
                    onChange={(e) => set('numMeasures', num(e.target.value, draft.numMeasures))} /></Row>
                <Row label="numBlocks"><input type="number" value={draft.numBlocks ?? ''} style={{ width: 56 }}
                    onChange={(e) => set('numBlocks', num(e.target.value, 1))} /></Row>
                <Row label="sideScroll"><input type="checkbox" checked={!!draft.sideScroll}
                    onChange={(e) => set('sideScroll', e.target.checked)} /></Row>
                <Row label="beatsOnScreen"><input type="number" value={draft.beatsOnScreen} style={{ width: 56 }}
                    onChange={(e) => set('beatsOnScreen', num(e.target.value, draft.beatsOnScreen))} /></Row>
                <Row label="debugOnlyLines"><input type="checkbox" checked={!!draft.debugOnlyLines}
                    onChange={(e) => set('debugOnlyLines', e.target.checked)} /></Row>
            </Section>

            <Section title="Vijand">
                <Row label="enemyType">
                    <select value={draft.enemyType} onChange={(e) => set('enemyType', e.target.value)}>
                        <option value="Slime">Slime</option>
                        <option value="Wizard">Wizard</option>
                        <option value="Mixed">Mixed (Level 10)</option>
                    </select>
                </Row>
                {(draft.enemyType === 'Wizard' || draft.enemyType === 'Mixed') && (
                    <Row label="wizardSpawnLeadMeasures">
                        <input type="number" value={draft.wizardSpawnLeadMeasures ?? 1} style={{ width: 56 }}
                            onChange={(e) => set('wizardSpawnLeadMeasures', num(e.target.value, 1))} />
                    </Row>
                )}
                <Row label="decorativeWizard (Level 11)"><input type="checkbox" checked={!!draft.decorativeWizard}
                    onChange={(e) => set('decorativeWizard', e.target.checked)} /></Row>
            </Section>

            <Section title="Toonsoort & thema">
                <Row label="tonic"><input type="text" value={draft.key?.tonic ?? DEFAULT_SCALE_TONIC} style={{ width: 56 }}
                    onChange={(e) => setNested('key', 'tonic', e.target.value)} /></Row>
                <Row label="mode">
                    <select value={draft.key?.mode ?? DEFAULT_SCALE_MODE} onChange={(e) => setNested('key', 'mode', e.target.value)}>
                        {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                </Row>
                <Row label="theme">
                    <select value={draft.theme ?? 'default'} onChange={(e) => set('theme', e.target.value)}>
                        {THEME_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
                    </select>
                </Row>
            </Section>

            <Section title="Treble">
                <Row label="range"><span style={{ display: 'flex', gap: 4 }}>
                    <input type="text" value={draft.range?.min ?? ''} style={{ width: 40 }}
                        onChange={(e) => setNested('range', 'min', e.target.value)} />
                    <input type="text" value={draft.range?.max ?? ''} style={{ width: 40 }}
                        onChange={(e) => setNested('range', 'max', e.target.value)} />
                </span></Row>
                <Row label="notesPerMeasure"><input type="number" value={draft.notesPerMeasure} style={{ width: 56 }}
                    onChange={(e) => set('notesPerMeasure', num(e.target.value, draft.notesPerMeasure))} /></Row>
                <Row label="variability"><input type="number" value={draft.variability} style={{ width: 56 }}
                    onChange={(e) => set('variability', num(e.target.value, draft.variability))} /></Row>
                <Row label="smallestNoteDenom">
                    <select value={draft.smallestNoteDenom} onChange={(e) => set('smallestNoteDenom', num(e.target.value, 8))}>
                        {DENOMS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                </Row>
                <Row label="insertBeatRests"><input type="checkbox" checked={!!draft.insertBeatRests}
                    onChange={(e) => set('insertBeatRests', e.target.checked)} /></Row>
                <Row label="polyMultiplier (tuplets)"><input type="number" value={draft.polyMultiplier ?? 1} style={{ width: 56 }}
                    onChange={(e) => set('polyMultiplier', num(e.target.value, 1))} /></Row>
                <Row label="notePool">
                    <select value={t.notePool ?? 'scale'} onChange={(e) => setTrack('treble', 'notePool', e.target.value)}>
                        {NOTE_POOLS.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                </Row>
                <Row label="melody type">
                    <select value={t.randomizationRule ?? 'uniform'} onChange={(e) => setTrack('treble', 'randomizationRule', e.target.value)}>
                        {RULES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                </Row>
                <Row label="voices">
                    <select value={t.voices ?? 1} onChange={(e) => setTrack('treble', 'voices', e.target.value === 'var' ? 'var' : Number(e.target.value))}>
                        {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                </Row>
                <Row label="maxLeap (span)"><input type="number" value={t.maxLeap ?? ''} placeholder="∞" style={{ width: 56 }}
                    onChange={(e) => setTrack('treble', 'maxLeap', e.target.value === '' ? null : num(e.target.value))} /></Row>
                <Row label="volume">
                    <select value={t.volume ?? 'f'} onChange={(e) => setTrack('treble', 'volume', e.target.value)}>
                        {VOLUMES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                </Row>
                <Row label="visible"><input type="checkbox" checked={t.visible !== false}
                    onChange={(e) => setTrack('treble', 'visible', e.target.checked)} /></Row>
            </Section>

            {draft.sideScroll && (
                <Section title="Bass">
                    <Row label="fixedBass"><input type="checkbox" checked={!!draft.fixedBass}
                        onChange={(e) => set('fixedBass', e.target.checked)} /></Row>
                    <Row label="notesPerMeasure"><input type="number" value={b.notesPerMeasure ?? ''} style={{ width: 56 }}
                        onChange={(e) => setTrack('bass', 'notesPerMeasure', num(e.target.value))} /></Row>
                    <Row label="smallestNoteDenom">
                        <select value={b.smallestNoteDenom ?? 4} onChange={(e) => setTrack('bass', 'smallestNoteDenom', num(e.target.value, 4))}>
                            {DENOMS.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </Row>
                    <Row label="rhythmVariability"><input type="number" value={b.rhythmVariability ?? ''} style={{ width: 56 }}
                        onChange={(e) => setTrack('bass', 'rhythmVariability', num(e.target.value))} /></Row>
                    <Row label="notePool">
                        <select value={b.notePool ?? 'chord'} onChange={(e) => setTrack('bass', 'notePool', e.target.value)}>
                            {NOTE_POOLS.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </Row>
                    <Row label="melody type">
                        <select value={b.randomizationRule ?? 'uniform'} onChange={(e) => setTrack('bass', 'randomizationRule', e.target.value)}>
                            {RULES.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </Row>
                    <Row label="range"><span style={{ display: 'flex', gap: 4 }}>
                        <input type="text" value={b.range?.min ?? ''} placeholder="C2" style={{ width: 40 }}
                            onChange={(e) => setTrack('bass', 'range', { ...b.range, min: e.target.value })} />
                        <input type="text" value={b.range?.max ?? ''} placeholder="C3" style={{ width: 40 }}
                            onChange={(e) => setTrack('bass', 'range', { ...b.range, max: e.target.value })} />
                    </span></Row>
                    <Row label="volume">
                        <select value={b.volume ?? 'mf'} onChange={(e) => setTrack('bass', 'volume', e.target.value)}>
                            {VOLUMES.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </Row>
                    <Row label="visible"><input type="checkbox" checked={b.visible !== false}
                        onChange={(e) => setTrack('bass', 'visible', e.target.checked)} /></Row>
                </Section>
            )}

            {draft.sideScroll && (
                <Section title="Percussie (alleen volume/visible — geen generator, §169)">
                    <Row label="volume">
                        <select value={p.volume ?? 'mp'} onChange={(e) => setTrack('percussion', 'volume', e.target.value)}>
                            {VOLUMES.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </Row>
                    <Row label="visible"><input type="checkbox" checked={p.visible !== false}
                        onChange={(e) => setTrack('percussion', 'visible', e.target.checked)} /></Row>
                </Section>
            )}

            <Section title="Akkoorden">
                <Row label="progression type (strategy)">
                    <select value={draft.chords?.strategy ?? 'tonic-tonic-tonic'} onChange={(e) => setNested('chords', 'strategy', e.target.value)}>
                        <option value="tonic-tonic-tonic">tonic-tonic-tonic</option>
                        {CHORD_STRATEGIES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                </Row>
                <Row label="complexity">
                    <select value={draft.chords?.complexity ?? 'triad'} onChange={(e) => setNested('chords', 'complexity', e.target.value)}>
                        {CHORD_COMPLEXITY.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                </Row>
                <Row label="chords/measure (chordCount)"><input type="number" value={draft.chords?.chordCount ?? 1} style={{ width: 56 }}
                    onChange={(e) => setNested('chords', 'chordCount', num(e.target.value, 1))} /></Row>
                <Row label="variability (rhythmVariability)"><input type="number" value={draft.chords?.rhythmVariability ?? 0} style={{ width: 56 }}
                    onChange={(e) => setNested('chords', 'rhythmVariability', num(e.target.value, 0))} /></Row>
                <div style={{ fontSize: 12 }}>
                    <div style={{ opacity: 0.75, marginBottom: 2 }}>passing chords</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px' }}>
                        {PASSING_CHORD_TYPES.map((pt) => {
                            const enabled = (draft.chords?.passingChordTypes ?? []).includes(pt);
                            return (
                                <label key={pt} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                                    <input type="checkbox" checked={enabled} onChange={(e) => {
                                        const cur = draft.chords?.passingChordTypes ?? [];
                                        const next = e.target.checked ? [...cur, pt] : cur.filter((x) => x !== pt);
                                        setNested('chords', 'passingChordTypes', next);
                                    }} />
                                    {pt}
                                </label>
                            );
                        })}
                    </div>
                </div>
                <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
                    tonic (fixedTonic) volgt automatisch de Toonsoort-sectie hierboven — geen apart veld nodig.
                </div>
            </Section>
        </div>
    );
}
