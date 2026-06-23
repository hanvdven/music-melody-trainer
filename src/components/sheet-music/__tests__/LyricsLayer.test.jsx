import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import LyricsLayer from '../LyricsLayer';

const svg = (ui) => render(<svg>{ui}</svg>);

// getLyricFill / getSolfegeForNote capture a large slice of SheetMusic state in
// production, so they are passed in as props. Here we stub them — the layer only
// cares that they are called and their return value is placed into the SVG.
const fill = () => 'var(--text-primary)';
const solfege = () => ({ base: 'Do', acc: '' });

const GEO = { offsets: [0, 24, 48, 72], nw: 10, startX: 0 };

describe('LyricsLayer', () => {
  it('returns null for an unknown variant', () => {
    const { container } = svg(<LyricsLayer variant="nope" />);
    expect(container.querySelector('text')).toBeNull();
  });

  describe('variant="text"', () => {
    it('renders nothing when textLyricsActive is false', () => {
      const { container } = svg(
        <LyricsLayer
          variant="text"
          melody={{ notes: ['C4'], offsets: [0], lyrics: ['la'] }}
          lyricsY={5}
          textLyricsActive={false}
          getLyricFill={fill}
          {...GEO}
        />
      );
      expect(container.querySelector('text')).toBeNull();
    });

    it('renders one syllable per note that has lyrics, at the resolved x', () => {
      const { container } = svg(
        <LyricsLayer
          variant="text"
          melody={{ notes: ['C4', 'D4'], offsets: [0, 24], lyrics: ['Hap', 'py'] }}
          lyricsY={5}
          textLyricsActive={true}
          getLyricFill={fill}
          {...GEO}
        />
      );
      const texts = [...container.querySelectorAll('text')];
      expect(texts.map(t => t.textContent)).toEqual(['Hap', 'py']);
      // index 0 → x = (0 - 1) * 10 + 5 = -5 ; index 1 → x = (1 - 1) * 10 + 5 = 5
      expect(texts[0].getAttribute('x')).toBe('-5');
      expect(texts[1].getAttribute('x')).toBe('5');
    });
  });

  describe('variant="melodic"', () => {
    it('renders nothing without a tonic', () => {
      const { container } = svg(
        <LyricsLayer
          variant="melodic"
          melody={{ notes: ['C4'], offsets: [0] }}
          lyricsY={5}
          tonic={null}
          melodicLyricsActive={true}
          getLyricFill={fill}
          getSolfegeForNote={solfege}
          LYRIC_FONT_SIZE={16}
          LYRIC_CHORD_FONT_SIZE={13}
          {...GEO}
        />
      );
      expect(container.querySelector('text')).toBeNull();
    });

    it('renders a clickable solfège syllable group for a single note', () => {
      const { container } = svg(
        <LyricsLayer
          variant="melodic"
          melody={{ notes: ['C4'], offsets: [24] }}
          lyricsY={5}
          tonic="C"
          melodicLyricsActive={true}
          getLyricFill={fill}
          getSolfegeForNote={solfege}
          LYRIC_FONT_SIZE={16}
          LYRIC_CHORD_FONT_SIZE={13}
          {...GEO}
        />
      );
      const t = container.querySelector('text');
      expect(t).not.toBeNull();
      // base is lower-cased by the renderer
      expect(t.textContent).toBe('do');
    });
  });

  describe('variant="rhythmic"', () => {
    it('renders nothing when rhythmicLyricsActive is false', () => {
      const { container } = svg(
        <LyricsLayer
          variant="rhythmic"
          melody={{ notes: ['k'], offsets: [0] }}
          lyricsY={5}
          rhythmicLyricsActive={false}
          timeSignature={[4, 4]}
          measureLengthSlots={48}
          getLyricFill={fill}
          LYRIC_FONT_SIZE={16}
          {...GEO}
        />
      );
      expect(container.querySelector('text')).toBeNull();
    });

    it('annotates a downbeat drum hit with a Takadimi syllable', () => {
      const { container } = svg(
        <LyricsLayer
          variant="rhythmic"
          melody={{ notes: ['k'], offsets: [0], durations: [12] }}
          lyricsY={5}
          rhythmicLyricsActive={true}
          timeSignature={[4, 4]}
          measureLengthSlots={48}
          getLyricFill={fill}
          LYRIC_FONT_SIZE={16}
          {...GEO}
        />
      );
      const t = container.querySelector('text');
      expect(t).not.toBeNull();
      // The first hit of a 4/4 beat is "ta".
      expect(t.textContent).toBe('ta');
    });
  });
});
