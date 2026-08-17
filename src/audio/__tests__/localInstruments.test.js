// #988: guards the SplendidGrandPiano branch in createMelodicInstrument — in particular its
// ORDER (it must win over the still-present generated acoustic_grand_piano local buffers) and
// that no other slug's behaviour changed.
// #889 follow-up: local instruments now build via `Smplr` directly (loop-region support) instead
// of the plain `Sampler` class — see localInstruments.js's buildLocalSmplrJson.
import { describe, it, expect, vi } from 'vitest';

class FakeSoundfont {
    constructor(context, options) { this.context = context; this.options = options; }
}
class FakeSmplr {
    constructor(context, json, options) { this.context = context; this.json = json; this.options = options; }
}
class FakeSplendidGrandPiano {
    constructor(context, options) { this.context = context; this.options = options; }
}
const fakeSoundfontToSmplrJson = (noteNames, loopData) => ({
    samples: { baseUrl: '', formats: ['ogg'] },
    groups: [{ regions: noteNames.map((n) => ({ sample: n, loopData: loopData?.[n] })) }],
});

vi.mock('smplr', () => ({
    Soundfont: FakeSoundfont,
    Smplr: FakeSmplr,
    SplendidGrandPiano: FakeSplendidGrandPiano,
    soundfontToSmplrJson: fakeSoundfontToSmplrJson,
}));

const { createMelodicInstrument, LOCAL_INSTRUMENT_BUFFERS } = await import('../localInstruments.js');
const { SPLENDID_LOCAL_BASE_URL, splendidPianoStorage } = await import('../splendidPianoStorage.js');

const context = { destination: { id: 'ctx-destination' } };

describe('createMelodicInstrument', () => {
    it('builds a SplendidGrandPiano for the piano slug, pointed at the local mirror', () => {
        const inst = createMelodicInstrument(context, 'acoustic_grand_piano');
        expect(inst).toBeInstanceOf(FakeSplendidGrandPiano);
        expect(inst.options.baseUrl).toBe(SPLENDID_LOCAL_BASE_URL);
        expect(inst.options.storage).toBe(splendidPianoStorage);
        expect(inst.options.formats).toEqual(['wav']);
    });

    it('prefers the piano branch over the generated local buffers (branch-order regression)', () => {
        // The #955 extraction still ships an acoustic_grand_piano entry; the piano branch must
        // shadow it rather than falling through to a Smplr-backed local instrument.
        expect(LOCAL_INSTRUMENT_BUFFERS.acoustic_grand_piano).toBeTruthy();
        expect(createMelodicInstrument(context, 'acoustic_grand_piano')).not.toBeInstanceOf(FakeSmplr);
    });

    it('forwards an explicit destination on the piano branch', () => {
        const destination = { id: 'fader' };
        const inst = createMelodicInstrument(context, 'acoustic_grand_piano', { destination });
        expect(inst.options.destination).toBe(destination);
    });

    it('defaults the piano destination to context.destination', () => {
        expect(createMelodicInstrument(context, 'acoustic_grand_piano').options.destination)
            .toBe(context.destination);
    });

    it('still returns a Smplr-backed instrument for a slug with local buffers, tagged with its slug', () => {
        const slug = Object.keys(LOCAL_INSTRUMENT_BUFFERS).find((s) => s !== 'acoustic_grand_piano');
        const inst = createMelodicInstrument(context, slug);
        expect(inst).toBeInstanceOf(FakeSmplr);
        expect(inst.instrumentSlug).toBe(slug);
        expect(inst.json.samples.baseUrl).toBe(`/samples/Instruments/${slug}`);
        expect(inst.json.samples.formats).toEqual(['wav']);
    });

    it('still returns a CDN Soundfont for a slug without local buffers', () => {
        const inst = createMelodicInstrument(context, 'definitely_not_extracted');
        expect(inst).toBeInstanceOf(FakeSoundfont);
        expect(inst.options.instrument).toBe('definitely_not_extracted');
    });
});
