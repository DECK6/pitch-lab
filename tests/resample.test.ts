import { describe, expect, it } from 'vitest';
import { StreamingSincResampler } from '../src/audio/resample';

const sine = (frequency: number, sampleRate: number, seconds: number, amplitude = 0.5) => {
  const samples = new Float32Array(Math.floor(sampleRate * seconds));
  for (let index = 0; index < samples.length; index += 1) samples[index] = amplitude * Math.sin(2 * Math.PI * frequency * index / sampleRate);
  return samples;
};

const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);

describe('streaming sinc resampler', () => {
  it.each([44_100, 48_000])('preserves a 440 Hz passband tone from %i Hz', (sourceRate) => {
    const resampler = new StreamingSincResampler(sourceRate);
    const input = sine(440, sourceRate, 1);
    const chunks: Float32Array[] = [];
    for (let offset = 0; offset < input.length; offset += 731) chunks.push(resampler.push(input.subarray(offset, offset + 731)));
    const output = Float32Array.from(chunks.flatMap((chunk) => [...chunk]));
    expect(output.length).toBeGreaterThan(15_900);
    expect(rms(output)).toBeCloseTo(0.5 / Math.sqrt(2), 2);
  });

  it('strongly attenuates content above the 16 kHz Nyquist limit', () => {
    const resampler = new StreamingSincResampler(48_000);
    const output = resampler.push(sine(12_000, 48_000, 1));
    expect(rms(output.subarray(200))).toBeLessThan(0.03);
  });

  it('keeps phase continuity across arbitrary chunk boundaries', () => {
    const input = sine(1000, 48_000, 0.5);
    const single = new StreamingSincResampler(48_000).push(input);
    const chunkedResampler = new StreamingSincResampler(48_000);
    const pieces: number[] = [];
    for (let offset = 0; offset < input.length; offset += 257) pieces.push(...chunkedResampler.push(input.subarray(offset, offset + 257)));
    const chunked = Float32Array.from(pieces);
    expect(chunked.length).toBe(single.length);
    let maxError = 0;
    for (let index = 0; index < single.length; index += 1) maxError = Math.max(maxError, Math.abs((single[index] ?? 0) - (chunked[index] ?? 0)));
    expect(maxError).toBeLessThan(1e-5);
  });
});
