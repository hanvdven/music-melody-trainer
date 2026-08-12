// #924 (Han 2026-08-12, "ik heb een file toegevoegd: bird sounds.mid; daarin staan verschillende
// vogelzangs. kun je die random instarten... doe maar allemaal op shakuhachi"): one-time (re-runnable)
// generator that parses src/songs/world_midis/bird sounds.mid and produces a static manifest of the 3
// "bird song" layers (the file's own 3 musical tracks — confirmed with Han: "elke MIDI-track is 1 laag") as
// plain { notes, durations, offsets } triplets, in this app's OWN tick units (TICKS_PER_WHOLE=48,
// src/constants/timing.js) — NOT the MIDI file's native 960-ticks-per-quarter, so playback tempo comes
// entirely from whatever bpm useWorldAmbientMusic.js's playMelodies() call passes (Han: "herschaal naar de
// wereld-bpm"), exactly like every other generated melody in the app.
//
// #924 round 5 (Han: "kan het dat de vogels maar unisono zijn? Sommige midi's zijn akkoorden.. Ik wil dan
// beide/alle lijnen horen."): the source MIDI is polyphonic (multiple simultaneous notes per "chirp") — an
// earlier version of this script kept only the TOP note of each simultaneous onset group (reducing chords
// to a single melodic line). Now keeps EVERY note in a simultaneous group, as a CHORD slot — `notes[i]` is
// an array of note names when >1 note starts at that tick, a plain string otherwise. `playMelodies.js`
// already supports this natively (`const items = Array.isArray(rawNote) ? rawNote : [rawNote]`, same
// convention the generation pipeline's own chord-voicing modes use). All layers are meant to play on ONE
// fixed instrument (shakuhachi) at runtime, so no instrument/channel info is kept — only pitch/duration/
// offset.
//
// Run with: node scripts/generate-bird-sounds.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseMidi } from 'midi-file';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIDI_PATH = path.join(__dirname, '..', 'src', 'songs', 'world_midis', 'bird sounds.mid');
const OUT_PATH = path.join(__dirname, '..', 'src', 'model', 'birdSoundsManifest.generated.js');

const TICKS_PER_WHOLE = 48;   // src/constants/timing.js — kept in sync by hand (this script has no import access to it, being plain Node)
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

function midiNoteToName(midiNumber) {
    const octave = Math.floor(midiNumber / 12) - 1;
    const degree = midiNumber % 12;
    return `${NOTE_NAMES[degree]}${octave}`;
}

// Converts one MIDI track's events into a { notes, durations, offsets } triplet in APP ticks (not MIDI
// ticks) — `notes[i]` is a chord (array of note names) when multiple notes share an onset, a plain string
// otherwise (§924 round 5: keep ALL simultaneous lines, not just the top note).
function trackToLayer(events, midiTicksPerQuarter) {
    const ticksPerAppTick = midiTicksPerQuarter / (TICKS_PER_WHOLE / 4);   // MIDI ticks per ONE app tick
    const toAppTicks = (midiTicks) => Math.max(1, Math.round(midiTicks / ticksPerAppTick));

    // Pass 1: resolve each event's absolute MIDI-tick time, and pair noteOn->noteOff into raw notes.
    let cursor = 0;
    const openNotes = new Map();   // noteNumber -> { onset, velocity } (absolute MIDI ticks)
    const rawNotes = [];           // { onset, offset, noteNumber, velocity } in absolute MIDI ticks
    for (const ev of events) {
        cursor += ev.deltaTime;
        if (ev.type === 'noteOn' && ev.velocity > 0) {
            openNotes.set(ev.noteNumber, { onset: cursor, velocity: ev.velocity });
        } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) {
            const open = openNotes.get(ev.noteNumber);
            if (open != null) {
                rawNotes.push({ onset: open.onset, offset: cursor, noteNumber: ev.noteNumber, velocity: open.velocity });
                openNotes.delete(ev.noteNumber);
            }
        }
    }

    // Pass 2: group ALL notes sharing an onset into one chord slot — duration is the group's LONGEST
    // member (so a shorter note within the chord doesn't cut the slot short), pitches sorted low->high.
    const byOnset = new Map();
    for (const n of rawNotes) {
        if (!byOnset.has(n.onset)) byOnset.set(n.onset, []);
        byOnset.get(n.onset).push(n);
    }
    const slots = [...byOnset.entries()].sort(([a], [b]) => a - b);

    // #924 round 6 (Han: "maak alle muziek, en ook de tekst mf. (bij de midi files, gebruik gewoon de
    // velocities)"): each chord slot's own `volumes[i]` (0-1 fraction) is the AVERAGE of its member notes'
    // original MIDI velocities (0-127) — `playMelodies.js`'s gain formula reads `melody.volumes[i]` before
    // anything else, so this is the one correct place to carry velocity through. `useWorldAmbientMusic.js`
    // still applies MF_VOLUME as an overall scaling multiplier on top, same as every other RPG-world sound.
    const notes = [], durations = [], offsets = [], volumes = [];
    for (const [onset, group] of slots) {
        const startTick = toAppTicks(onset);
        const endTick = toAppTicks(Math.max(...group.map((n) => n.offset)));
        const pitches = group.map((n) => n.noteNumber).sort((a, b) => a - b).map(midiNoteToName);
        const avgVelocity = group.reduce((sum, n) => sum + n.velocity, 0) / group.length;
        notes.push(pitches.length > 1 ? pitches : pitches[0]);
        durations.push(Math.max(1, endTick - startTick));
        offsets.push(startTick);
        volumes.push(Math.round((avgVelocity / 127) * 1000) / 1000);
    }
    return { notes, durations, offsets, volumes };
}

function main() {
    const input = fs.readFileSync(MIDI_PATH);
    const parsed = parseMidi(input);
    // #924 round 2 (Han 2026-08-12, "ik heb de file geupdated. Speel altijd maximaal 3."): the file's own
    // track COUNT is no longer fixed at 3 (it now has 6 music tracks) — this generator exports ALL of them;
    // the runtime (useWorldAmbientMusic.js) is the one that picks a random 3-subset to actually play at a
    // time, so replacing the MIDI file with more/fewer tracks never requires a code change here.
    const musicTracks = parsed.tracks.slice(1).filter((t) => t.some((e) => e.type === 'noteOn' && e.velocity > 0));
    const layers = musicTracks.map((t) => trackToLayer(t, parsed.header.ticksPerBeat));

    const out = `// AUTO-GENERATED by scripts/generate-bird-sounds.mjs — do not hand-edit.
// Re-run the script after replacing src/songs/world_midis/bird sounds.mid.
// #924: the bird-song layers (one per real musical track in the source MIDI — currently ${layers.length}),
// as plain { notes, durations, offsets, volumes } quadruplets in this app's own tick units
// (TICKS_PER_WHOLE=48) — a \`notes[i]\` entry is a chord (array of note names) when the source has
// simultaneous notes there, a plain string otherwise (all lines kept, not reduced to unison). \`volumes[i]\`
// is the source MIDI's own velocity (0-1 fraction, averaged across a chord's members) — useWorldAmbientMusic.js
// applies MF_VOLUME as an overall multiplier on top. Tempo-agnostic (rescales automatically to whatever bpm
// useWorldAmbientMusic.js plays them at). useWorldAmbientMusic.js picks a random layer per trigger, at most
// 3 concurrent (Han: "speel altijd maximaal 3").
export const BIRD_SONG_LAYERS = ${JSON.stringify(layers, null, 2)};
`;
    fs.writeFileSync(OUT_PATH, out);
    console.log(`Wrote ${OUT_PATH} — ${layers.length} layers, ${layers.map((l) => l.notes.length).join('/')} notes.`);
}

main();
