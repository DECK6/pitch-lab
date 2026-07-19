import { PitchDetector } from 'pitchy';
import { describe, expect, it } from 'vitest';
import { centsBetween } from '../src/music/pitch-math';
import { analyzePitchWindow, LIGHT_FRAME_SIZE } from '../src/audio/signal';

const fixture = (frequency: number, sampleRate = 48_000, harmonic = false) => {
  const frame = new Float32Array(LIGHT_FRAME_SIZE);
  for (let index = 0; index < frame.length; index += 1) {
    const phase = 2 * Math.PI * frequency * index / sampleRate;
    frame[index] = 0.22 * Math.sin(phase) + (harmonic ? 0.08 * Math.sin(2 * phase) + 0.04 * Math.sin(3 * phase) : 0);
  }
  return frame;
};

describe('Light pitch detector', () => {
  const detector = PitchDetector.forFloat32Array(LIGHT_FRAME_SIZE);

  it.each([110, 220, 440, 880])('detects %i Hz within five cents', (frequency) => {
    const result = analyzePitchWindow(fixture(frequency), 48_000, detector);
    expect(result.frequencyHz).not.toBeNull();
    expect(Math.abs(centsBetween(result.frequencyHz ?? 1, frequency) ?? 100)).toBeLessThan(5);
    expect(result.confidence).toBeGreaterThan(0.82);
  });

  it('handles a harmonic-rich fixture without an octave error', () => {
    const result = analyzePitchWindow(fixture(196, 48_000, true), 48_000, detector);
    expect(Math.abs(centsBetween(result.frequencyHz ?? 1, 196) ?? 100)).toBeLessThan(5);
  });

  it('does not pin silence or out-of-range ultrasound', () => {
    expect(analyzePitchWindow(new Float32Array(LIGHT_FRAME_SIZE), 48_000, detector).frequencyHz).toBeNull();
    expect(analyzePitchWindow(fixture(2000), 48_000, detector).frequencyHz).toBeNull();
  });
});
