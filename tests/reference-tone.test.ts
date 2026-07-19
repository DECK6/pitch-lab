import { describe, expect, it } from 'vitest';
import { centsBetween, midiToFrequency } from '../src/music/pitch-math';

describe('reference keyboard frequencies', () => {
  it.each([36, 48, 57, 69, 83])('maps MIDI %i within 0.1 cent of 12-TET', (midi) => {
    const expected = 440 * 2 ** ((midi - 69) / 12);
    expect(Math.abs(centsBetween(midiToFrequency(midi), expected) ?? 1)).toBeLessThan(0.1);
  });
});

