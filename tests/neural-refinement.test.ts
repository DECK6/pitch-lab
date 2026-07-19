import { PitchDetector } from 'pitchy';
import { describe, expect, it } from 'vitest';
import { centsBetween } from '../src/music/pitch-math';
import { LIGHT_FRAME_SIZE, refinePitchCandidate } from '../src/audio/signal';

const detector = PitchDetector.forFloat32Array(LIGHT_FRAME_SIZE);

function harmonicFrame(frequency: number): Float32Array {
  const frame = new Float32Array(LIGHT_FRAME_SIZE);
  for (let index = 0; index < frame.length; index += 1) {
    const phase = 2 * Math.PI * frequency * index / 16_000;
    frame[index] = 0.22 * Math.sin(phase) + 0.08 * Math.sin(2 * phase) + 0.04 * Math.sin(3 * phase);
  }
  return frame;
}

describe('Neural-guided frequency refinement', () => {
  it.each([
    [65.406, -8.7],
    [110, 10.7],
    [220, 2.5],
    [440, -9.5],
    [880, 13.3],
    [1046.502, 10.7],
  ])('refines model-biased %.3f Hz candidates within five cents', (frequency, modelBiasCents) => {
    const candidate = frequency * 2 ** (modelBiasCents / 1200);
    const result = refinePitchCandidate(harmonicFrame(frequency), 16_000, candidate, 0.99, detector);
    expect(result.frequencyHz).not.toBeNull();
    expect(Math.abs(centsBetween(result.frequencyHz ?? 1, frequency) ?? 100)).toBeLessThan(5);
  });

  it('does not replace a Neural candidate when the DSP estimate disagrees by more than 80 cents', () => {
    const candidate = 440;
    const result = refinePitchCandidate(harmonicFrame(220), 16_000, candidate, 0.99, detector);
    expect(result.frequencyHz).toBe(candidate);
  });
});
