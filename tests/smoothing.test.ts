import { describe, expect, it } from 'vitest';
import { PitchSmoother, confidenceBand } from '../src/audio/smoothing';
import type { RawPitchResult } from '../src/audio/types';

const raw = (frequencyHz: number | null, confidence = 0.9, audioTimeMs = 0): RawPitchResult => ({
  frequencyHz,
  confidence,
  audioTimeMs,
  processingMs: 2,
  rmsDb: -20,
  clipping: false,
  source: 'light',
});

describe('pitch smoothing', () => {
  it('uses engine-local confidence bands', () => {
    expect(confidenceBand('light', 0.81)).toBe('low');
    expect(confidenceBand('light', 0.82)).toBe('medium');
    expect(confidenceBand('neural', 0.84)).toBe('low');
  });

  it('requires two medium frames and never emits a stale invalid frequency', () => {
    const smoother = new PitchSmoother();
    const meta = (sequence: number) => ({ sessionId: 's', sequence, nowMs: sequence * 20, dropped: 0, discontinuity: false });
    expect(smoother.push(raw(440, 0.9), meta(1)).frequencyHz).toBeNull();
    expect(smoother.push(raw(440, 0.9), meta(2)).frequencyHz).toBeCloseTo(440);
    smoother.push(raw(null, 0), meta(3));
    smoother.push(raw(null, 0), meta(4));
    expect(smoother.push(raw(null, 0), meta(5)).frequencyHz).toBeNull();
  });

  it('resets across discontinuities', () => {
    const smoother = new PitchSmoother();
    smoother.push(raw(440), { sessionId: 's', sequence: 1, nowMs: 10, dropped: 0, discontinuity: false });
    expect(smoother.push(raw(440), { sessionId: 's', sequence: 2, nowMs: 20, dropped: 0, discontinuity: false }).voiced).toBe(true);
    expect(smoother.push(raw(440), { sessionId: 's', sequence: 3, nowMs: 30, dropped: 0, discontinuity: true }).voiced).toBe(false);
  });
});

