import { frequencyToNote } from '../music/pitch-math';
import type { ConfidenceBand, EngineSource, PitchFrame, RawPitchResult } from './types';

const THRESHOLDS: Record<EngineSource, [number, number, number]> = {
  light: [0.72, 0.82, 0.92],
  neural: [0.75, 0.85, 0.95],
};

export function confidenceBand(source: EngineSource, confidence: number): ConfidenceBand {
  const [low, medium, high] = THRESHOLDS[source];
  if (!Number.isFinite(confidence) || confidence < low) return 'none';
  if (confidence < medium) return 'low';
  if (confidence < high) return 'medium';
  return 'high';
}

const median = (numbers: number[]): number => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0);
};

export class PitchSmoother {
  private recent: number[] = [];
  private candidateFrames = 0;
  private weakFrames = 0;
  private stable = false;
  private lastVoicedAt = -Infinity;
  private lastMidi: number | null = null;

  reset(): void {
    this.recent = [];
    this.candidateFrames = 0;
    this.weakFrames = 0;
    this.stable = false;
    this.lastVoicedAt = -Infinity;
    this.lastMidi = null;
  }

  push(raw: RawPitchResult, meta: { sessionId: string; sequence: number; nowMs: number; dropped: number; discontinuity: boolean }): PitchFrame {
    if (meta.discontinuity) this.reset();
    const band = confidenceBand(raw.source, raw.confidence);
    const validFrequency = raw.frequencyHz !== null && Number.isFinite(raw.frequencyHz) && raw.frequencyHz > 0;
    const candidate = validFrequency && (band === 'medium' || band === 'high');

    if (!this.stable) {
      this.candidateFrames = candidate ? this.candidateFrames + 1 : 0;
      this.stable = this.candidateFrames >= 2;
    } else if (!validFrequency || band === 'none') {
      this.weakFrames += 1;
      if (this.weakFrames > 2 || meta.nowMs - this.lastVoicedAt > 250) this.stable = false;
    } else {
      this.weakFrames = 0;
    }

    if (validFrequency && (candidate || this.stable)) {
      this.recent.push(raw.frequencyHz as number);
      if (this.recent.length > 3) this.recent.shift();
      this.lastVoicedAt = meta.nowMs;
    }

    let frequencyHz = this.stable && this.recent.length ? median(this.recent) : null;
    if (frequencyHz !== null) {
      const note = frequencyToNote(frequencyHz);
      if (note && this.lastMidi !== null && note.midi !== this.lastMidi) {
        const distanceFromPrevious = Math.abs(note.midiFloat - this.lastMidi);
        if (distanceFromPrevious < 0.58) frequencyHz = midiToStableFrequency(this.lastMidi, note.cents, frequencyHz);
        else this.lastMidi = note.midi;
      } else if (note) {
        this.lastMidi = note.midi;
      }
    }

    if (!this.stable) {
      frequencyHz = null;
      this.recent = [];
      this.lastMidi = null;
    }

    return {
      sessionId: meta.sessionId,
      sequence: meta.sequence,
      timestampMs: raw.audioTimeMs,
      frequencyHz,
      confidenceRaw: Math.max(0, Math.min(1, raw.confidence || 0)),
      confidenceBand: frequencyHz === null ? 'none' : band,
      voiced: frequencyHz !== null,
      source: raw.source,
      processingMs: Math.max(0, raw.processingMs),
      frameAgeMs: Math.max(0, meta.nowMs - raw.audioTimeMs),
      droppedSinceLast: Math.max(0, meta.dropped),
      discontinuity: meta.discontinuity,
      rmsDb: raw.rmsDb,
      clipping: raw.clipping,
    };
  }
}

function midiToStableFrequency(previousMidi: number, centsFromNew: number, measuredFrequency: number): number {
  void centsFromNew;
  const previousFrequency = 440 * 2 ** ((previousMidi - 69) / 12);
  const deltaCents = 1200 * Math.log2(measuredFrequency / previousFrequency);
  return Math.abs(deltaCents) < 58 ? measuredFrequency : previousFrequency;
}
