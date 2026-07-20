import { describe, expect, it } from 'vitest';
import {
  buildHarmonyCatalog,
  createKeyContext,
  pitchClassForSpelling,
  type ScaleMode,
} from '../src/music/theory/harmony';

describe('key-aware harmony engine', () => {
  it.each([
    [5, 'major', ['F', 'G', 'A', 'B♭', 'C', 'D', 'E']],
    [6, 'major', ['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯']],
    [3, 'natural_minor', ['E♭', 'F', 'G♭', 'A♭', 'B♭', 'C♭', 'D♭']],
    [9, 'natural_minor', ['A', 'B', 'C', 'D', 'E', 'F', 'G']],
  ] as const)('spells pitch class %i %s correctly', (pitchClass, mode, expected) => {
    expect(createKeyContext(pitchClass, mode).scaleNoteNames).toEqual(expected);
  });

  it('builds the complete C-major core and explainable related chords', () => {
    const catalog = buildHarmonyCatalog(createKeyContext(0, 'major'), 'seventh');
    expect(catalog.diatonic.map((chord) => [chord.roman, chord.symbol])).toEqual([
      ['Imaj7', 'Cmaj7'],
      ['ii7', 'Dm7'],
      ['iii7', 'Em7'],
      ['IVmaj7', 'Fmaj7'],
      ['V7', 'G7'],
      ['vi7', 'Am7'],
      ['viiø7', 'Bm7♭5'],
    ]);
    expect(catalog.related.some((chord) => chord.roman === 'V/ii' && chord.symbol === 'A7')).toBe(true);
    expect(catalog.related.some((chord) => chord.roman === 'iv' && chord.symbol === 'Fm')).toBe(true);
    expect(catalog.related.some((chord) => chord.roman === '♭VII' && chord.symbol === 'B♭')).toBe(true);
  });

  it('uses the harmonic-minor leading tone for the minor dominant', () => {
    const catalog = buildHarmonyCatalog(createKeyContext(9, 'natural_minor'), 'seventh');
    const dominant = catalog.related.find((chord) => chord.roman === 'V7');
    expect(dominant).toMatchObject({ symbol: 'E7', noteNames: ['E', 'G♯', 'B', 'D'] });
  });

  it('creates color choices for the selected chord with valid note spellings', () => {
    const catalog = buildHarmonyCatalog(createKeyContext(0, 'major'), 'seventh');
    const tonic = catalog.diatonic[0];
    expect(tonic).toBeDefined();
    const colors = catalog.colorsFor(tonic!.id);
    expect(colors.map((chord) => chord.symbol)).toEqual(['Cmaj9', 'C6/9']);
    expect(colors[0]?.noteNames).toEqual(['C', 'E', 'G', 'B', 'D']);
  });

  it('covers 12 pitch classes in major and minor with internally consistent pitches', () => {
    for (const mode of ['major', 'natural_minor'] satisfies ScaleMode[]) {
      for (let tonic = 0; tonic < 12; tonic += 1) {
        const key = createKeyContext(tonic, mode);
        for (const view of ['triad', 'seventh'] as const) {
          const catalog = buildHarmonyCatalog(key, view);
          expect(catalog.diatonic).toHaveLength(7);
          expect(catalog.diatonic[0]?.pitchClasses[0]).toBe(tonic);
          for (const chord of [...catalog.diatonic, ...catalog.related]) {
            expect(chord.noteNames.map(pitchClassForSpelling)).toEqual(chord.pitchClasses);
            expect(chord.resolutionTargetIds.every((id) => catalog.diatonic.some((core) => core.id === id))).toBe(true);
          }
        }
      }
    }
  });
});
