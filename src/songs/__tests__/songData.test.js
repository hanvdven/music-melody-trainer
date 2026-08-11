import { describe, it, expect } from 'vitest';
import SONGS from '../songIndex.js';
import { loadSong } from '../loadSong.js';
import { TICKS_PER_WHOLE } from '../../constants/timing';

// #871 (Han 2026-08-11, "abc music en level namen"): 7 songs converted offline from src/songs/abc/*.abc
// via scripts/abc-to-song.mjs. These tests validate the SHAPE every one of them must have (not the exact
// musical content — a per-note correctness check belongs to manual UAT, not an automated test) so a
// future re-run of the conversion script (more abc imports are coming, per Han) can't silently ship a
// malformed song: mismatched array lengths, non-monotonic offsets, or a measure that doesn't sum exactly.
const NEW_SONG_IDS = ['arirang', 'frere-jacques', 'kalinka', 'kangding-qingge', 'la-bamba', 'sakura', 'scarborough-fair'];
const newSongs = () => SONGS.filter((s) => NEW_SONG_IDS.includes(s.id));

describe('songs — abc-derived songs (#871)', () => {
    it('all 7 abc songs are registered exactly once', () => {
        expect(newSongs().length).toBe(7);
        NEW_SONG_IDS.forEach((id) => {
            expect(SONGS.filter((s) => s.id === id).length).toBe(1);
        });
    });

    it('each song has exactly one difficulty tier ("easy") — no medium/hard', () => {
        newSongs().forEach((song) => {
            expect(Object.keys(song.difficulties)).toEqual(['easy']);
        });
    });

    it('does NOT set randomizationRule:"fixed" on trebleSettings (would drop lyrics/fermatas on randomizeAll)', () => {
        newSongs().forEach((song) => {
            expect(song.generator.trebleSettings.randomizationRule).not.toBe('fixed');
        });
    });

    it('treble notes/durations/offsets are equal-length, non-empty, and (when present) lyrics is parallel-length', () => {
        newSongs().forEach((song) => {
            const t = song.difficulties.easy.treble;
            expect(t.notes.length).toBeGreaterThan(0);
            expect(t.durations.length).toBe(t.notes.length);
            expect(t.offsets.length).toBe(t.notes.length);
            if (t.lyrics) expect(t.lyrics.length).toBe(t.notes.length);
        });
    });

    it('offsets are strictly increasing and start at or after 0 (pickup measures offset within the bar, not before it)', () => {
        newSongs().forEach((song) => {
            const { offsets } = song.difficulties.easy.treble;
            expect(offsets[0]).toBeGreaterThanOrEqual(0);
            for (let i = 1; i < offsets.length; i++) {
                expect(offsets[i], `${song.id}: offsets not increasing at index ${i}`).toBeGreaterThan(offsets[i - 1]);
            }
        });
    });

    it('the treble line exactly fills numMeasures * measureTicks (no dangling partial measure)', () => {
        newSongs().forEach((song) => {
            const { offsets, durations } = song.difficulties.easy.treble;
            const lastEnd = offsets[offsets.length - 1] + durations[durations.length - 1];
            const measureTicks = TICKS_PER_WHOLE * song.timeSignature[0] / song.timeSignature[1];
            expect(lastEnd, `${song.id}: last note end (${lastEnd}) != numMeasures*measureTicks (${song.numMeasures * measureTicks})`)
                .toBe(song.numMeasures * measureTicks);
        });
    });

    it('every chord has a positive duration and an offset within the song timeline', () => {
        newSongs().forEach((song) => {
            const { chords } = song.difficulties.easy;
            expect(chords.length).toBeGreaterThan(0);
            const { offsets, durations } = song.difficulties.easy.treble;
            const totalTicks = offsets[offsets.length - 1] + durations[durations.length - 1];
            chords.forEach((c) => {
                expect(c.duration).toBeGreaterThan(0);
                expect(c.offset).toBeGreaterThanOrEqual(0);
                expect(c.offset).toBeLessThan(totalTicks);
            });
        });
    });

    it('defaultTonic is a bare pitch class and scaleMode/timeSignature are well-formed', () => {
        newSongs().forEach((song) => {
            expect(song.defaultTonic).toMatch(/^[A-G][#♯b♭]?$/);
            expect(typeof song.generator.scaleMode).toBe('string');
            expect(song.timeSignature.length).toBe(2);
        });
    });

    it('loadSong("easy") preserves .lyrics on the returned treble Melody (regression guard for the randomizationRule decision)', () => {
        newSongs().forEach((song) => {
            const loaded = loadSong(song, 'easy', null);
            expect(loaded.treble).toBeTruthy();
            const sourceLyrics = song.difficulties.easy.treble.lyrics;
            if (sourceLyrics) {
                expect(loaded.treble.lyrics).toEqual(sourceLyrics);
            }
        });
    });
});
