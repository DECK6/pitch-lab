import { describe, expect, it } from 'vitest';
import { PitchSmoother, confidenceBand } from '../src/audio/smoothing';
import type { RawPitchResult } from '../src/audio/types';
import { meterNeedleEndpoint } from '../src/ui/app';
import { makeTrailPoint, projectTrail, smoothTrailPoints } from '../src/ui/trail';

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

  it('keeps a stable pitch across skipped capture hops', () => {
    const smoother = new PitchSmoother();
    smoother.push(raw(440), { sessionId: 's', sequence: 1, nowMs: 10, dropped: 0, discontinuity: false });
    expect(smoother.push(raw(440), { sessionId: 's', sequence: 2, nowMs: 90, dropped: 3, discontinuity: false }).voiced).toBe(true);
    expect(smoother.push(raw(440), { sessionId: 's', sequence: 3, nowMs: 170, dropped: 2, discontinuity: false }).voiced).toBe(true);
  });
});

describe('mobile pitch display regressions', () => {
  it('uses direct SVG endpoints for flat and sharp meter positions', () => {
    expect(meterNeedleEndpoint(0)).toEqual({ x: 200, y: 48 });
    expect(meterNeedleEndpoint(39).x).toBeGreaterThan(290);
    expect(meterNeedleEndpoint(-43).x).toBeLessThan(110);
  });

  it('keeps trail coordinates bounded and breaks implausible vertical jumps', () => {
    const frequency = (base: number, cents: number) => base * 2 ** (cents / 1200);
    const points = [
      makeTrailPoint(0, frequency(138.591, -43)),
      makeTrailPoint(20, frequency(138.591, 39)),
      makeTrailPoint(40, frequency(138.591, 38)),
      makeTrailPoint(300, null),
      makeTrailPoint(320, frequency(146.832, -12)),
    ];
    const plot = projectTrail(points, 320, 400, 160);
    const visibleSegments = plot.segments.filter((segment) => segment.length > 0);
    expect(visibleSegments.map((segment) => segment.length)).toEqual([1, 2, 1]);
    expect(visibleSegments.flat().every(({ y }) => y >= 0 && y <= 160)).toBe(true);
  });

  it('calms frame-to-frame jitter without smearing across note changes', () => {
    const jitter = [-10, 10, -10, 10, -10, 10].map((cents, index) => ({
      time: index * 20,
      midi: 57,
      cents,
      breakBefore: false,
    }));
    const smoothed = smoothTrailPoints(jitter);
    const smoothedCents = smoothed.map((point) => point.cents ?? 0);
    const smoothedSpan = Math.max(...smoothedCents) - Math.min(...smoothedCents);
    expect(smoothedSpan).toBeLessThan(6);

    const noteChange = smoothTrailPoints([
      ...jitter,
      { time: 120, midi: 58, cents: 20, breakBefore: false },
    ]).at(-1);
    expect(noteChange?.cents).toBe(20);
    expect(noteChange?.breakBefore).toBe(true);
  });
});
