import { describe, expect, it } from 'vitest';
import { centsBetween, frequencyToMidi, frequencyToNote, midiToFrequency, noteNameForMidi } from '../src/music/pitch-math';

describe('pitch math', () => {
  it('maps A4 exactly', () => {
    expect(frequencyToMidi(440)).toBe(69);
    expect(frequencyToNote(440)).toMatchObject({ label: 'A4', midi: 69, cents: 0 });
  });

  it('maps middle C and every reference frequency consistently', () => {
    expect(frequencyToNote(261.625565)?.label).toBe('C4');
    for (let midi = 36; midi <= 83; midi += 1) {
      const frequency = midiToFrequency(midi);
      expect(frequencyToNote(frequency)?.midi).toBe(midi);
      expect(noteNameForMidi(midi)).toBe(frequencyToNote(frequency)?.label);
    }
  });

  it('returns signed cents and rejects invalid frequencies', () => {
    expect(centsBetween(445, 440)).toBeGreaterThan(0);
    expect(centsBetween(435, 440)).toBeLessThan(0);
    expect(frequencyToNote(0)).toBeNull();
    expect(frequencyToNote(Number.NaN)).toBeNull();
  });
});
