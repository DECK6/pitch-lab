import type { PitchFrame } from '../audio/types';
import { midiToFrequency } from '../music/pitch-math';

export type PracticeStatus = 'waiting' | 'locked' | 'close' | 'retry';

export interface PracticeEvaluation {
  targetMidi: number;
  status: PracticeStatus;
  medianCents: number | null;
  medianAbsoluteCents: number | null;
  medianFrequencyHz: number | null;
  voicedCoverage: number;
  sampleCount: number;
  windowDurationMs: number;
}

export const PRACTICE_WINDOW_MS = 600;
export const PRACTICE_LOCKED_CENTS = 15;
export const PRACTICE_CLOSE_CENTS = 35;
export const PRACTICE_MIN_COVERAGE = 0.7;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? null;
}

export class TargetComparator {
  private frames: PitchFrame[] = [];
  private evaluation: PracticeEvaluation;

  constructor(private targetMidi: number) {
    this.evaluation = this.emptyEvaluation();
  }

  get current(): PracticeEvaluation {
    return this.evaluation;
  }

  setTarget(targetMidi: number): void {
    this.targetMidi = targetMidi;
    this.reset();
  }

  reset(): void {
    this.frames = [];
    this.evaluation = this.emptyEvaluation();
  }

  push(frame: PitchFrame, gated = false): PracticeEvaluation {
    if (gated || frame.clipping || frame.discontinuity) {
      this.reset();
      return this.evaluation;
    }
    this.frames.push(frame);
    const cutoff = frame.timestampMs - PRACTICE_WINDOW_MS;
    // Keep the single frame immediately before the cutoff. Real audio hops
    // (for example 1024 / 48 kHz = 21.33 ms) rarely land on exactly 600 ms;
    // dropping every pre-cutoff frame would make the measured span permanently
    // shorter than the requested window and leave Practice stuck on WAITING.
    while (this.frames[1] && this.frames[1].timestampMs <= cutoff) this.frames.shift();
    this.evaluation = this.evaluate();
    return this.evaluation;
  }

  private evaluate(): PracticeEvaluation {
    const first = this.frames[0];
    const last = this.frames[this.frames.length - 1];
    const duration = first && last ? Math.max(0, last.timestampMs - first.timestampMs) : 0;
    const targetHz = midiToFrequency(this.targetMidi);
    const valid = this.frames.filter((frame) => frame.voiced
      && frame.frequencyHz !== null
      && Number.isFinite(frame.frequencyHz)
      && frame.frequencyHz > 0
      && frame.frameAgeMs <= 250
      && !frame.clipping);
    const coverage = this.frames.length > 0 ? valid.length / this.frames.length : 0;
    const signedCents = valid.map((frame) => 1200 * Math.log2((frame.frequencyHz as number) / targetHz));
    const medianCents = median(signedCents);
    const medianAbsoluteCents = median(signedCents.map(Math.abs));
    const medianFrequencyHz = median(valid.map((frame) => frame.frequencyHz as number));
    let status: PracticeStatus = 'waiting';
    if (duration >= PRACTICE_WINDOW_MS && coverage >= PRACTICE_MIN_COVERAGE && medianAbsoluteCents !== null) {
      if (medianAbsoluteCents <= PRACTICE_LOCKED_CENTS + 1e-6) status = 'locked';
      else if (medianAbsoluteCents <= PRACTICE_CLOSE_CENTS + 1e-6) status = 'close';
      else status = 'retry';
    }
    return {
      targetMidi: this.targetMidi,
      status,
      medianCents,
      medianAbsoluteCents,
      medianFrequencyHz,
      voicedCoverage: coverage,
      sampleCount: valid.length,
      windowDurationMs: duration,
    };
  }

  private emptyEvaluation(): PracticeEvaluation {
    return {
      targetMidi: this.targetMidi,
      status: 'waiting',
      medianCents: null,
      medianAbsoluteCents: null,
      medianFrequencyHz: null,
      voicedCoverage: 0,
      sampleCount: 0,
      windowDurationMs: 0,
    };
  }
}
