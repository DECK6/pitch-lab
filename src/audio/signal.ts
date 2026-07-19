import { PitchDetector } from 'pitchy';
import type { RawPitchResult } from './types';

export const LIGHT_FRAME_SIZE = 4096;
export const LIGHT_HOP_SIZE = 1024;
export const LIGHT_MIN_HZ = 65.406;
export const LIGHT_MAX_HZ = 1046.502;
export const RMS_GATE_DB = -55;

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
  detector = PitchDetector.forFloat32Array(frame.length),
): Omit<RawPitchResult, 'audioTimeMs' | 'processingMs' | 'source'> {
  const level = rmsDb(frame);
  const clipping = clippingRatio(frame) >= 0.01;
  if (level < RMS_GATE_DB) return { frequencyHz: null, confidence: 0, rmsDb: level, clipping };
  const [frequency, clarity] = detector.findPitch(frame, sampleRate);
  const frequencyHz = Number.isFinite(frequency) && frequency >= LIGHT_MIN_HZ && frequency <= LIGHT_MAX_HZ ? frequency : null;
  return {
    frequencyHz,
    confidence: frequencyHz === null ? 0 : Math.max(0, Math.min(1, clarity)),
    rmsDb: level,
    clipping,
  };
}

