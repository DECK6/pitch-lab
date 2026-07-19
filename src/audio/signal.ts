import { PitchDetector } from 'pitchy';
import type { RawPitchResult } from './types';

export const LIGHT_FRAME_SIZE = 4096;
export const LIGHT_HOP_SIZE = 1024;
export const LIGHT_MIN_HZ = 65.406;
export const LIGHT_MAX_HZ = 1046.502;
export const RMS_GATE_DB = -55;

type FloatPitchDetector = ReturnType<typeof PitchDetector.forFloat32Array>;

export function rmsDb(frame: Float32Array): number {
  let sum = 0;
  for (const sample of frame) sum += sample * sample;
  const rms = Math.sqrt(sum / Math.max(1, frame.length));
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

export function clippingRatio(frame: Float32Array): number {
  let clipped = 0;
  for (const sample of frame) if (Math.abs(sample) >= 0.98) clipped += 1;
  return clipped / Math.max(1, frame.length);
}

export function analyzePitchWindow(
  frame: Float32Array,
  sampleRate: number,
  detector: FloatPitchDetector = PitchDetector.forFloat32Array(frame.length),
): Omit<RawPitchResult, 'audioTimeMs' | 'processingMs' | 'source'> {
  const level = rmsDb(frame);
  const clipping = clippingRatio(frame) >= 0.01;
  if (level < RMS_GATE_DB) return { frequencyHz: null, confidence: 0, rmsDb: level, clipping };
  const [frequency, clarity] = detector.findPitch(frame, sampleRate);
  const displayBoundaryRatio = 2 ** (50 / 1200);
  const frequencyHz = Number.isFinite(frequency)
    && frequency >= LIGHT_MIN_HZ / displayBoundaryRatio
    && frequency <= LIGHT_MAX_HZ * displayBoundaryRatio
    ? frequency
    : null;
  return {
    frequencyHz,
    confidence: frequencyHz === null ? 0 : Math.max(0, Math.min(1, clarity)),
    rmsDb: level,
    clipping,
  };
}

export function refinePitchCandidate(
  frame: Float32Array,
  sampleRate: number,
  candidate: number,
  confidence: number,
  detector: FloatPitchDetector = PitchDetector.forFloat32Array(frame.length),
  maxDistanceCents = 80,
): { frequencyHz: number | null; confidence: number } {
  const displayBoundaryRatio = 2 ** (50 / 1200);
  const minimumDisplayHz = LIGHT_MIN_HZ / displayBoundaryRatio;
  const maximumDisplayHz = LIGHT_MAX_HZ * displayBoundaryRatio;
  const candidateInRange = Number.isFinite(candidate) && candidate >= minimumDisplayHz && candidate <= maximumDisplayHz;
  const boundaryRatio = 2 ** (maxDistanceCents / 1200);
  const candidateNearRange = Number.isFinite(candidate)
    && candidate >= LIGHT_MIN_HZ / boundaryRatio
    && candidate <= LIGHT_MAX_HZ * boundaryRatio;
  const [refined, clarity] = detector.findPitch(frame, sampleRate);
  const dspFallback = Number.isFinite(refined)
    && refined >= minimumDisplayHz
    && refined <= maximumDisplayHz
    && clarity >= 0.9;
  if (!candidateNearRange || confidence < 0.75) {
    return dspFallback
      ? { frequencyHz: refined, confidence: clarity }
      : { frequencyHz: null, confidence };
  }
  const distanceCents = Number.isFinite(refined) && refined > 0
    ? Math.abs(1200 * Math.log2(refined / candidate))
    : Infinity;
  if (refined >= minimumDisplayHz
    && refined <= maximumDisplayHz
    && clarity >= 0.8
    && distanceCents <= maxDistanceCents) {
    return { frequencyHz: refined, confidence: Math.min(confidence, clarity) };
  }
  return { frequencyHz: candidateInRange ? candidate : null, confidence };
}
