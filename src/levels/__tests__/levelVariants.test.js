import { describe, it, expect } from 'vitest';
import { LEVELS, LEVEL_MODE_VARIANTS, applyLevelVariant, availableVariantLetters, wavesForLevel } from '../levels';
import { COLOR_SCHEMES, COLOR_SCOPES } from '../../components/sheet-music/overlays/NoteColoringStaffOverlay';
import { baselineAdaptiveBpm, ADAPTIVE_LEVEL_REPEATS, NO_ANPM_BASELINE_FACTOR } from '../adaptiveTempo';
import { blockCountFor } from '../levelBlockPlan';
import { deriveLevelSpan } from '../levels';

// #1100 (split from #1087, Han 2026-08-22 chat interview): a/b/c/f mode-variant picker. `applyLevelVariant`
// is the one place speed multipliers + colorScheme/colorScope overrides + the rubato gatedScroll flip are
// computed — see its own comment in levels.js for the full rationale (never mutates the shared LEVELS[id]
// object, `letter == null` is a pure passthrough).
// #1103 follow-up (Han 2026-08-22, coloring 2.0): variant colors re-specified as colorScheme+colorScope
// (a,b=chroma+scale; c=subtle-chroma+scale; f=none) — the old single `colorMode` field is gone.
describe('levels.js — applyLevelVariant (#1100/#1103)', () => {
    // Level 4 is a plain sideScroll, non-gated, fixed-tempo level — a good neutral base for the speed math.
    const base = LEVELS[4];

    it('letter == null returns the level UNCHANGED (same object identity)', () => {
        expect(applyLevelVariant(base, null)).toBe(base);
        expect(applyLevelVariant(base, undefined)).toBe(base);
    });

    it('variant f (full tempo) keeps bpm as-is and forces colorScheme to none', () => {
        const v = applyLevelVariant(base, 'f');
        expect(v.bpm).toBe(base.bpm);
        expect(v.colorScheme).toBe('none');
        expect(v).not.toBe(base);   // never mutates the shared object
    });

    it('variant b (slow) halves bpm and recomputes the bpm-derived span bundle', () => {
        const v = applyLevelVariant(base, 'b');
        expect(v.bpm).toBe(Math.round(base.bpm * 0.5));
        expect(v.colorScheme).toBe('chroma');
        expect(v.colorScope).toBe('scale');
        // beatsOnScreen is BPM-derived (levels.js #994) — must be RECOMPUTED from the new bpm, not
        // carried stale from the base. (It may still land on the same value once the tempo drop hits
        // the #1102 readability floor of 2 visible measures — so assert "recomputed", not "differs".)
        expect(v.beatsOnScreen).toBe(deriveLevelSpan({ bpm: v.bpm, timeSignature: v.timeSignature ?? [4, 4] }).beatsOnScreen);
    });

    it('variant c (medium) applies a 0.75x multiplier and subtle chroma', () => {
        const v = applyLevelVariant(base, 'c');
        expect(v.bpm).toBe(Math.round(base.bpm * 0.75));
        expect(v.colorScheme).toBe('subtle-chroma');
        expect(v.colorScope).toBe('scale');
    });

    it('variant a (rubato) flips gatedScroll on and forces chroma+scale, without touching bpm', () => {
        expect(base.gatedScroll).toBeFalsy();   // Level 4 is not gated by default
        const v = applyLevelVariant(base, 'a');
        expect(v.gatedScroll).toBe(true);
        expect(v.colorScheme).toBe('chroma');
        expect(v.colorScope).toBe('scale');
        expect(v.bpm).toBe(base.bpm);   // rubato has no fixed tempo — bpm left as authored, per SheetRpgLayer
    });

    // #1101 (split from #1087, Han 2026-08-23, "call response is altijd black wizard — dus slime is
    // thans een MODE van een level"): d/e force enemyType:'Wizard' + gatedScroll:false on WHATEVER level
    // they're applied to, and set numMeasures/numRepeats so wavesForLevel's discrete wave-count model
    // stays correct regardless of the base level's own authored wave shape.
    it('variant d (call-response, 1 measure) forces Wizard + gatedScroll off + numMeasures=1/numRepeats=2', () => {
        expect(base.enemyType).not.toBe('Wizard');   // Level 4 is a plain Slime level by default
        const v = applyLevelVariant(base, 'd');
        expect(v.enemyType).toBe('Wizard');
        expect(v.gatedScroll).toBe(false);
        expect(v.callResponseMeasures).toBe(1);
        expect(v.numMeasures).toBe(1);
        expect(v.numRepeats).toBe(2);
        expect(v.colorScheme).toBe('subtle-chroma');
        expect(v.colorScope).toBe('scale');
    });

    it('variant e (call-response, 2 measures) forces Wizard + numMeasures=2/numRepeats=2 + no coloring', () => {
        const v = applyLevelVariant(base, 'e');
        expect(v.enemyType).toBe('Wizard');
        expect(v.gatedScroll).toBe(false);
        expect(v.callResponseMeasures).toBe(2);
        expect(v.numMeasures).toBe(2);
        expect(v.numRepeats).toBe(2);
        expect(v.colorScheme).toBe('none');
    });

    it('call-response forces gatedScroll off even on an ALREADY-gated level (never combines with rubato)', () => {
        const gatedBase = LEVELS[1];   // Level 1 authors gatedScroll:true
        expect(gatedBase.gatedScroll).toBe(true);
        const v = applyLevelVariant(gatedBase, 'd');
        expect(v.gatedScroll).toBe(false);
    });

    // Bug fix (Han 2026-08-24 UAT, variant 'e': "de tijd tussen de call en response is nu nog steeds 1
    // maat; daardoor overlapt wat ik moet spelen met het luisteren naar de tovenaar"): the wizard cast's
    // lead time must equal the call's own length, or the cast is still audibly playing once the
    // response's gameplay window has already begun.
    it('sets wizardSpawnLeadMeasures = callResponseMeasures, so the cast never overlaps the response window', () => {
        const vd = applyLevelVariant(base, 'd');
        expect(vd.wizardSpawnLeadMeasures).toBe(1);
        const ve = applyLevelVariant(base, 'e');
        expect(ve.wizardSpawnLeadMeasures).toBe(2);
    });

    // Bug fix (Han 2026-08-25 UAT, Sakura d/e: "de lengte van het nummer is ook niet verdubbeld, dus
    // opeens, precies halverwege het nummer, zijn de akkoorden 'op'... en verschijnt de 'end of song'
    // maatstreep"): a SONG's `totalMeasures` must double for call-response (every real measure becomes a
    // call+response pair) — App.jsx's handleLoadSong doubles the chord progression to match, and
    // useLevelBackingStream.js's bass/cello generation reads this SAME `totalMeasures` value, so this one
    // fix corrects the "end of song" marker position, the chord supply, AND the bass together.
    it('doubles totalMeasures for a SONG level (call-response always doubles the true song length)', () => {
        const sakura = LEVELS[205];
        expect(sakura.songId).toBe('sakura');
        const vd = applyLevelVariant(sakura, 'd');
        expect(vd.totalMeasures).toBe(sakura.numMeasures * 2);
        const ve = applyLevelVariant(sakura, 'e');
        expect(ve.totalMeasures).toBe(sakura.numMeasures * 2);
    });

    it('does NOT touch totalMeasures for a procedural (non-song) level — its own numRepeats/numBlocks-derived semantics are unaffected', () => {
        const v = applyLevelVariant(base, 'e');
        expect(v.totalMeasures).toBe(base.totalMeasures);
    });

    // Feature (Han 2026-08-24, replacing the earlier exclusion: "why not have the wizard cast a
    // modulation spell before each call-response block?"): d/e are now AVAILABLE for a decorativeWizard
    // level (Level 15) — call-response's own block generation absorbs the modulation job instead of a
    // second stream fighting over it (see useLevelTrebleStream.js's `blockScale`).
    it('availableVariantLetters keeps d/e available for a decorativeWizard level (modulation is now merged in, not excluded)', () => {
        const modulationLvl = LEVELS[15];
        expect(modulationLvl.decorativeWizard).toBe(true);
        const letters = availableVariantLetters(modulationLvl, ['a', 'b', 'c', 'd', 'e', 'f']);
        expect(letters).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    });

    // #1153/#1154: g (Modulated) and h (Randomized Notes) are a DIFFERENT kind of variant than a-f —
    // a content transform, not a speed/color preset — so they deliberately carry no colorScheme/colorScope
    // of their own (applyLevelVariant's `?? lvl.colorScheme` fallback keeps whatever the level already
    // had, same as omitting the field on any other variant would). Only 'i' (still unimplemented) and a-f
    // (color presets by design) are checked against that requirement.
    // Yellow wizard (j, Han 2026-09-03): same category as g/h/i — a mechanic variant, no colour of its own.
    it('every LEVEL_MODE_VARIANTS entry has a label and an iconKey; color-preset ones also have a colorScheme/colorScope', () => {
        Object.values(LEVEL_MODE_VARIANTS).forEach((variant) => {
            expect(typeof variant.label).toBe('string');
            expect(typeof variant.iconKey).toBe('string');
            if (!variant.notYetImplemented && !variant.modulated && !variant.randomizedNotes && !variant.adaptive && !variant.yellowWizard) {
                expect(typeof variant.colorScheme).toBe('string');
                expect(typeof variant.colorScope).toBe('string');
            }
        });
    });

    // #1102 (Han 2026-08-23 interview, resumed 2026-08-28): 'i' (Adaptive speed) is now a REAL variant —
    // it derives the level's STARTING bpm from the player's own ANPM and marks the level for the live
    // tempo controller. It carries no colorScheme/colorScope of its own (a pacing variant, not a colour
    // preset), so the level's own colours must survive — the `?? lvl.colorScheme` fallback that #1102's
    // own paused round added to applyLevelVariant.
    it('variant i (adaptive) is functional — no longer a notYetImplemented reserved slot', () => {
        expect(LEVEL_MODE_VARIANTS.i.notYetImplemented).toBeUndefined();
        expect(LEVEL_MODE_VARIANTS.i.adaptive).toBe(true);
    });

    // Han 2026-08-28 (#1102 UAT bounce): the no-ANPM start is 0.7x the authored bpm, NOT the authored bpm
    // — which is the clamp ceiling, and left adaptive mode unable to ever speed up.
    it('variant i with NO anpm starts at 0.7x the authored bpm and keeps its colours', () => {
        const v = applyLevelVariant(base, 'i', null);
        expect(v.adaptive).toBe(true);
        expect(v.adaptiveBaseBpm).toBe(base.bpm);        // the clamp is expressed against the AUTHORED tempo
        expect(v.bpm).toBe(Math.round(base.bpm * NO_ANPM_BASELINE_FACTOR));
        expect(v.bpm).toBeLessThan(base.bpm);            // headroom to accelerate
        expect(v.bpm).toBeGreaterThan(base.bpm / 2);     // headroom to slow down
        expect(v.colorScheme).toBe(base.colorScheme);
        expect(v.colorScope).toBe(base.colorScope);
        expect(v.enemyType).toBe(base.enemyType);
        expect(v).not.toBe(base);   // never mutates the shared object
    });

    // #1102 (Han 2026-08-28, "niet oninteressant om het level te blijven herhalen. Bijvoorbeeld 3x"):
    // the evaluation runway. Expressed through the level's OWN `totalMeasures`, so every length consumer
    // (blockCountFor / wavesForLevel / totalNotesForLevel / the timpani span / the final barline) scales
    // uniformly and the level still ends through the paths that already exist.
    describe('variant i — the 3x evaluation runway (#1102, Han 2026-08-28)', () => {
        it('multiplies a PROCEDURAL level\'s totalMeasures by ADAPTIVE_LEVEL_REPEATS', () => {
            const v = applyLevelVariant(base, 'i', 60);
            expect(v.totalMeasures).toBe(base.totalMeasures * ADAPTIVE_LEVEL_REPEATS);
        });

        it('scales blockCountFor with it — ~3x the evaluation points, still FINITE, still ONE wave', () => {
            const v = applyLevelVariant(base, 'i', 60);
            expect(blockCountFor(v)).toBe(blockCountFor(base) * ADAPTIVE_LEVEL_REPEATS);
            // FINITE is half of the "level must still end" guarantee: the stream stops generating, so
            // `total` (slimeData.length) stops growing and cumulative kills CAN catch up to it.
            expect(Number.isFinite(blockCountFor(v))).toBe(true);
            // The other half, and the actual Han-2026-08-29 UAT bug: the wave target must NOT scale with
            // the runway. There is exactly one "cumulative kills caught up to cumulative content" event
            // per level (see wavesForLevel's comment), so a 12-wave target could never be reached and the
            // level never opened its result screen. One wave, at 1x and at 3x alike.
            expect(wavesForLevel(v)).toBe(1);
            expect(wavesForLevel(base)).toBe(1);
        });

        it('leaves the starting bpm untouched — totalMeasures cancels out of the baseline formula', () => {
            expect(applyLevelVariant(base, 'i', 60).bpm).toBe(baselineAdaptiveBpm(base, 60));
        });

        // #1168 (Han 2026-09-01) — THIS CASE IS THE INVERSION of the old "does NOT repeat a SONG level"
        // guard, kept (never deleted) with its reasoning. That exclusion existed because a song-backed
        // level's per-block treble slice is deliberately unwrapped (empty past the song's last measure,
        // useLevelContentStream's `songSlice`), so tripling its wave target while its slimes stopped at
        // the song's true end was the §289 "level never ends" bug class. #1168 removed the PREMISE
        // rather than the guard: the song SOURCE is now genuinely materialised 3x in the stream, so the
        // content really is as long as `totalMeasures` claims and the ONE wave is reachable. See §366.
        it('DOES repeat a song level (#1168) — the source is materialised 3x, so the one wave is reachable', () => {
            const sakura = LEVELS[205];
            expect(sakura.songId).toBe('sakura');
            const v = applyLevelVariant(sakura, 'i', 60);
            expect(v.adaptive).toBe(true);
            expect(v.totalMeasures).toBe(sakura.totalMeasures * ADAPTIVE_LEVEL_REPEATS);
            // The un-multiplied period survives the override — the stream needs it to know how long one
            // pass of the song is (the chord modulo, and how many passes of the source to materialise).
            expect(v.contentPeriodMeasures).toBe(sakura.totalMeasures);
            // Half 1 of "the level must still end": generation is FINITE, so `total` stops growing.
            expect(Number.isFinite(blockCountFor(v))).toBe(true);
            expect(blockCountFor(v)).toBe(blockCountFor(sakura) * ADAPTIVE_LEVEL_REPEATS);
            // Half 2: the wave target never scales with the runway — one cumulative clear, at 1x and 3x.
            expect(wavesForLevel(v)).toBe(1);
        });

        it('stamps contentPeriodMeasures ONLY for an adaptive letter (undefined everywhere else)', () => {
            const sakura = LEVELS[205];
            expect(applyLevelVariant(sakura, 'e').contentPeriodMeasures).toBeUndefined();
            expect(applyLevelVariant(sakura, null).contentPeriodMeasures).toBeUndefined();
            expect(applyLevelVariant(base, 'f').contentPeriodMeasures).toBeUndefined();
        });

        it('does NOT repeat a non-sideScroll level — the stream never evaluates the controller there', () => {
            const staticLvl = LEVELS[101];
            expect(staticLvl.sideScroll).toBeFalsy();
            expect(applyLevelVariant(staticLvl, 'i', 60).totalMeasures).toBe(staticLvl.totalMeasures);
        });

        it('a gated level still repeats — its wave count is 1 by construction, so nothing can strand it', () => {
            // Level 3 is gatedScroll + procedural → wavesForLevel 1 (as every level is since the
            // 2026-08-29 fix), and its content loops forever anyway; the level ends when the FINAL
            // BARLINE (now 3x further out) crosses the strike line. So the repeat simply makes it last
            // 3x longer.
            const gated = LEVELS[3];
            expect(gated.gatedScroll).toBe(true);
            const v = applyLevelVariant(gated, 'i', 60);
            expect(v.totalMeasures).toBe(gated.totalMeasures * ADAPTIVE_LEVEL_REPEATS);
            expect(wavesForLevel(v)).toBe(1);
        });

        it('changes NOTHING about a non-adaptive letter (guard: no level got longer by accident)', () => {
            ['a', 'b', 'c', 'f', 'g'].forEach((letter) => {
                expect(applyLevelVariant(base, letter).totalMeasures).toBe(base.totalMeasures);
            });
            expect(applyLevelVariant(base, null).totalMeasures).toBe(base.totalMeasures);
        });
    });

    it('variant i applies the ANPM baseline bpm and recomputes the bpm-derived span bundle', () => {
        // Han's locked formula: bpm = anpm * beatsInLevel / totalNotesInLevel. Reuses the SAME helper
        // App.jsx's #1099 ANPM update uses (totalNotesForLevel), so this asserts the wiring, not a
        // second copy of the arithmetic.
        const anpm = 60;
        const v = applyLevelVariant(base, 'i', anpm);
        expect(v.bpm).toBe(baselineAdaptiveBpm(base, anpm));
        expect(v.adaptiveBaseBpm).toBe(base.bpm);
        // #994's span bundle is bpm-derived — a variant that changes bpm must recompute it, exactly like
        // the speedMultiplier letters do.
        // Level 4 declares no timeSignature of its own — normalizeLevel/applyLevelVariant both fall back
        // to the app's DEFAULT_TIME_SIG, so the expectation must use the same fallback.
        const span = deriveLevelSpan({ bpm: v.bpm, timeSignature: base.timeSignature ?? [4, 4] });
        expect(v.beatsOnScreen).toBe(span.beatsOnScreen);
        expect(v.leadInBars).toBe(span.leadInBars);
    });

    it('variant i is offered by availableVariantLetters for every sideScroll level shape', () => {
        // #1102 covers all three content architectures (JIT gated, JIT Wizard call-response, classic
        // per-wave), so there is no per-level gating to assert an exception for — only that it is offered.
        [LEVELS[3], LEVELS[4], LEVELS[13]].forEach((lvl) => {
            expect(availableVariantLetters(lvl, ['i'])).toEqual(['i']);
        });
    });

    // #1153 (letter g "Modulated", chat interview: "kies voorlopig een random diatonische toonladder die
    // verschilt van de oorspronkelijke", "vast voor het hele level"): available for BOTH procedural and
    // song levels, picks a diatonic mode different from the level's own.
    // Bug fix (Han 2026-08-25 UAT: "Ik heb nog steeds ALTIJD E phrygian op sakura - lijkt deterministisch;
    // dus ja, ik wil elke keer dat je het level start een random diatonische toonladder"): the pick is now
    // TRUE `Math.random()` — the old "deterministic so the preview and actual start never disagree"
    // rationale didn't hold up: LevelStartSplash's preview never surfaces the specific mode name to the
    // player (only the letter's static label), so a fresh roll per `applyLevelVariant` call is safe (see
    // `pickModulatedMode`'s own comment in levels.js).
    // Also (same UAT): "Zorg bij G meteen dat er niet naar de diatonic 'parent' van de toonladder wordt
    // gemoduleerd - In -> Phrygisch is triviaal" — a scale's own `diatonic` field (scaleHandler.js) names
    // the mode it's an exact zero-offset subset of; modulating to it is a silent no-op (#1158's fix made
    // this provably true), so it must never be offered as a "Modulated" target.
    describe('variant g (Modulated, #1153)', () => {
        it('overrides key.mode to a DIFFERENT diatonic mode than the level\'s own, keeping the same tonic', () => {
            const v = applyLevelVariant(base, 'g');
            expect(v.key.family).toBe('Diatonic');
            expect(v.key.mode).not.toBe(base.key?.mode);
            expect(v.key.tonic).toBe(base.key?.tonic ?? 'C4');
            expect(v.modulateToMode).toBe(v.key.mode);
        });

        it('is genuinely random — repeated calls for the SAME level eventually pick DIFFERENT modes', () => {
            const seen = new Set();
            for (let i = 0; i < 40; i++) seen.add(applyLevelVariant(base, 'g').key.mode);
            expect(seen.size).toBeGreaterThan(1);
        });

        it('never picks the scale\'s own trivial diatonic parent (Pentatonic "In" -> Phrygian is a no-op, #1158)', () => {
            // Sakura (#205) uses Pentatonic "In", whose own `diatonic` field (scaleHandler.js) is
            // 'Phrygian' — every random roll across many trials must exclude it.
            const sakura = LEVELS[205];
            for (let i = 0; i < 60; i++) {
                expect(applyLevelVariant(sakura, 'g').modulateToMode).not.toBe('Phrygian');
            }
        });

        it('key.mode and modulateToMode always agree (single roll, not two independent ones)', () => {
            for (let i = 0; i < 20; i++) {
                const v = applyLevelVariant(base, 'g');
                expect(v.key.mode).toBe(v.modulateToMode);
            }
        });

        it('available for a song-based level too (Sakura, #205)', () => {
            const sakura = LEVELS[205];
            expect(sakura.songId).toBe('sakura');
            const letters = availableVariantLetters(sakura, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
            expect(letters).toContain('g');
            const v = applyLevelVariant(sakura, 'g');
            expect(v.modulateToMode).toBeTruthy();
        });
    });

    // #1154 (letter h "Randomized Notes", chat interview: "houd de akkoorden, genereer een andere
    // melodie... notesPerMeasure = totaal noten / totaal maten... gebruik altijd het liedje's eigen
    // generator settings"): only available for a songId level.
    describe('variant h (Randomized Notes, #1154)', () => {
        const sakura = LEVELS[205];

        it('is EXCLUDED for a procedural (non-song) level — "de al reeds random nummers hebben geen variant H"', () => {
            const letters = availableVariantLetters(base, ['a', 'b', 'c', 'd', 'e', 'f', 'h']);
            expect(letters).not.toContain('h');
        });

        it('is available for a song-based level and computes forceTrebleSettings from the song\'s own note density', () => {
            const letters = availableVariantLetters(sakura, ['a', 'b', 'c', 'd', 'e', 'f', 'h']);
            expect(letters).toContain('h');
            const v = applyLevelVariant(sakura, 'h');
            expect(v.randomizeSongMelody).toBe(true);
            expect(v.forceTrebleSettings).toEqual({
                notesPerMeasure: sakura.randomizedNotesPerMeasure,
                variability: 30,
                randomizationRule: 'arp_group',
            });
            expect(sakura.randomizedNotesPerMeasure).toBeGreaterThanOrEqual(1);
        });
    });

    describe('variant j (Yellow wizard, Han 2026-09-03)', () => {
        it('forces enemyType Wizard + wizardSilent onto any level, defaulting the cast lead to 1 measure', () => {
            const v = applyLevelVariant(base, 'j');
            expect(v.enemyType).toBe('Wizard');
            expect(v.wizardSilent).toBe(true);
            expect(v.wizardSpawnLeadMeasures).toBe(1);
            expect(v).not.toBe(base);   // never mutates the shared object
        });

        it('keeps a level\'s own authored wizardSpawnLeadMeasures if it has one', () => {
            const withLead = { ...base, wizardSpawnLeadMeasures: 2 };
            expect(applyLevelVariant(withLead, 'j').wizardSpawnLeadMeasures).toBe(2);
        });

        it('is offered for every sideScroll level shape — including gated ones (no cast audio → no desync)', () => {
            const gated = { ...base, gatedScroll: true };
            expect(availableVariantLetters(gated, ['j'])).toEqual(['j']);
            expect(availableVariantLetters(LEVELS[13], ['j'])).toEqual(['j']);   // even on the black-wizard level
        });

        it('carries no colour of its own — the level keeps whatever it already had', () => {
            const v = applyLevelVariant(base, 'j');
            expect(v.colorScheme).toBe(base.colorScheme);
            expect(v.colorScope).toBe(base.colorScope);
        });
    });

    // #1100 acceptance criterion ("colorMode per variant reuses the existing NoteColoringStaffOverlay
    // SCHEMES enum values"): levels.js's own comment on LEVEL_MODE_VARIANTS says values "must match
    // NoteColoringStaffOverlay.jsx's COLOR_SCHEMES/COLOR_SCOPES" but nothing enforced it — exactly the
    // class of bug §299/§301 (unenforced string-enum agreement between two files) already caught
    // elsewhere this session. Direct check against the canonical export, not eyeballing.
    it('every variant colorScheme/colorScope is one of NoteColoringStaffOverlay\'s canonical values', () => {
        const schemeValues = COLOR_SCHEMES.map((s) => s.value);
        const scopeValues = COLOR_SCOPES.map((s) => s.value);
        Object.entries(LEVEL_MODE_VARIANTS).forEach(([letter, variant]) => {
            if (variant.notYetImplemented || variant.modulated || variant.randomizedNotes || variant.adaptive || variant.yellowWizard) return;   // no color config of their own — nothing to check
            expect(schemeValues, `letter ${letter} colorScheme`).toContain(variant.colorScheme);
            expect(scopeValues, `letter ${letter} colorScope`).toContain(variant.colorScope);
        });
    });
});

// Audit fix (Han 2026-08-24, "ga kritisch door de level modi heen en los inconsistenties op") — two
// letter x level-shape combinations were offered by the picker without actually being supported by the
// underlying mechanism; see `availableVariantLetters`'s own comment in levels.js for the full root-cause
// trace (found by tracing every consumer of the fields a variant touches, the same method §299 used).
describe('levels.js — availableVariantLetters (audit fix, Han 2026-08-24)', () => {
    const ALL = ['a', 'b', 'c', 'd', 'e', 'f'];

    // #1155 (Han 2026-08-24, "waarom is er geen call-response optie bij de liederen?"): d/e used to be
    // dropped for songId levels because call-response's generation would silently replace the composed
    // song. Fixed properly instead (song's own measures are SLICED, sliceSongCallResponseBlock.js) — so
    // every letter is now available for a song, same as any other level.
    it('keeps every letter available for a songId level — call-response now slices the song, never replaces it', () => {
        const songLvl = LEVELS[1];   // songId: 'level1-intro'
        expect(songLvl.songId).toBeTruthy();
        const letters = availableVariantLetters(songLvl, ALL);
        expect(letters).toEqual(ALL);
    });

    it('drops a (rubato) for a native Wizard level — wizard cast audio has no gate-aware schedule', () => {
        const wizardLvl = LEVELS[13];   // enemyType: 'Wizard', not songId
        expect(wizardLvl.enemyType).toBe('Wizard');
        const letters = availableVariantLetters(wizardLvl, ALL);
        expect(letters).not.toContain('a');
        expect(letters).toContain('b');
        expect(letters).toContain('c');
        expect(letters).toContain('d');
        expect(letters).toContain('e');
        expect(letters).toContain('f');
    });

    it('drops a (rubato) for a native Mixed level too (same fixed-schedule wizard-cast mechanism)', () => {
        const mixedLvl = LEVELS[14];   // enemyType: 'Mixed'
        expect(mixedLvl.enemyType).toBe('Mixed');
        expect(availableVariantLetters(mixedLvl, ALL)).not.toContain('a');
    });

    it('a plain Slime, non-song level keeps every letter available', () => {
        const plainLvl = LEVELS[4];
        expect(availableVariantLetters(plainLvl, ALL)).toEqual(ALL);
    });
});
