import { describe, expect, it } from 'vitest';
import { centsBetween, midiToFrequency } from '../src/music/pitch-math';
import { REFERENCE_TONE_GAIN } from '../src/piano/reference-tone';

describe('reference keyboard frequencies', () => {
  it.each([36, 48, 57, 69, 83])('maps MIDI %i within 0.1 cent of 12-TET', (midi) => {
    const expected = 440 * 2 ** ((midi - 69) / 12);
    expect(Math.abs(centsBetween(midiToFrequency(midi), expected) ?? 1)).toBeLessThan(0.1);
  });

  it('keeps the single-voice sine loud with safe peak headroom', () => {
    const peakDbfs = 20 * Math.log10(REFERENCE_TONE_GAIN);
    expect(peakDbfs).toBeGreaterThan(-8);
    expect(peakDbfs).toBeLessThan(-6);
    expect(REFERENCE_TONE_GAIN).toBeLessThan(0.5);
  });
});
