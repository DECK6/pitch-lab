import { describe, expect, it } from 'vitest';
import type { PitchFrame } from '../src/audio/types';
import { midiToFrequency } from '../src/music/pitch-math';
import { TargetComparator } from '../src/practice/target-comparator';

function frame(timestampMs: number, cents: number | null, overrides: Partial<PitchFrame> = {}): PitchFrame {
  const frequencyHz = cents === null ? null : midiToFrequency(60) * 2 ** (cents / 1200);
  return {
    sessionId: 'test',
    sequence: Math.round(timestampMs / 50),
    timestampMs,
    frequencyHz,
    confidenceRaw: frequencyHz === null ? 0 : 0.99,
    confidenceBand: frequencyHz === null ? 'none' : 'high',
    voiced: frequencyHz !== null,
    source: 'light',
    processingMs: 1,
    frameAgeMs: 10,
    droppedSinceLast: 0,
    discontinuity: false,
    rmsDb: -20,
    clipping: false,
    ...overrides,
  };
}

function fill(comparator: TargetComparator, cents: number | null, coverage = 1): ReturnType<TargetComparator['push']> {
  let result = comparator.current;
  for (let index = 0; index <= 12; index += 1) {
    const voiced = index / 12 < coverage;
    result = comparator.push(frame(index * 50, voiced ? cents : null));
  }
  return result;
}

describe('TargetComparator', () => {
  it.each([
    [5, 'locked'],
    [-15, 'locked'],
    [16, 'close'],
    [-35, 'close'],
    [36, 'retry'],
    [50, 'retry'],
  ] as const)('classifies %i cents as %s', (cents, expected) => {
    const comparator = new TargetComparator(60);
    expect(fill(comparator, cents).status).toBe(expected);
  });

  it('uses median error so centered vibrato can lock', () => {
    const comparator = new TargetComparator(60);
    const vibrato = [-20, -12, -5, 0, 5, 12, 20, 12, 5, 0, -5, -12, -20];
    let result = comparator.current;
    vibrato.forEach((cents, index) => { result = comparator.push(frame(index * 50, cents)); });
    expect(result.status).toBe('locked');
    expect(result.medianAbsoluteCents).toBeLessThanOrEqual(12);
  });

  it('completes a window at real 48 kHz audio-hop intervals', () => {
    const comparator = new TargetComparator(60);
    let result = comparator.current;
    const hopMs = 1024 / 48_000 * 1000;
    for (let index = 0; index <= 30; index += 1) {
      result = comparator.push(frame(index * hopMs, 0));
    }
    expect(result.windowDurationMs).toBeGreaterThanOrEqual(600);
    expect(result.status).toBe('locked');
  });

  it('waits when voiced coverage is insufficient or reference audio is gated', () => {
    const comparator = new TargetComparator(60);
    expect(fill(comparator, 0, 0.5).status).toBe('waiting');
    expect(comparator.push(frame(700, 0), true).status).toBe('waiting');
    expect(comparator.current.sampleCount).toBe(0);
  });

  it('clears stale frames on clipping, discontinuity, and target changes', () => {
    const comparator = new TargetComparator(60);
    expect(fill(comparator, 0).status).toBe('locked');
    expect(comparator.push(frame(700, 0, { clipping: true })).status).toBe('waiting');
    fill(comparator, 0);
    expect(comparator.push(frame(1_400, 0, { discontinuity: true })).status).toBe('waiting');
    comparator.setTarget(64);
    expect(comparator.current).toMatchObject({ targetMidi: 64, status: 'waiting', sampleCount: 0 });
  });

  it('clears a stale pass when the same target is explicitly reselected', () => {
    const comparator = new TargetComparator(60);
    expect(fill(comparator, 0).status).toBe('locked');
    comparator.setTarget(60);
    expect(comparator.current).toMatchObject({ targetMidi: 60, status: 'waiting', sampleCount: 0 });
  });
});
