import { describe, expect, it } from 'vitest';
import { ScoreGameEngine, beatAtScoreSeconds, scoreSecondsAtBeat } from '../../src/game/score-game';
import type { PitchFrame } from '../../src/audio/types';
import type { TargetNoteEvent, TempoChange } from '../../src/score/contracts';

const tempos: TempoChange[] = [
  { beat: 0, bpm: 120, measure: 1 },
  { beat: 4, bpm: 60, measure: 2 },
];
const events: TargetNoteEvent[] = [
  { id: 'a', measure: 1, onsetBeat: 0, durationBeats: 1, writtenMidi: 69, soundingMidi: 69, confidence: 'high' },
  { id: 'b', measure: 1, onsetBeat: 1, durationBeats: 1, writtenMidi: 71, soundingMidi: 71, confidence: 'high' },
];

function frame(frequencyHz: number | null): PitchFrame {
  return {
    sessionId: 's', sequence: 1, timestampMs: 0, frequencyHz, confidenceRaw: 1, confidenceBand: 'high',
    voiced: frequencyHz !== null, source: 'light', processingMs: 1, frameAgeMs: 5, droppedSinceLast: 0,
    discontinuity: false, rmsDb: -12, clipping: false,
  };
}

describe('score game clock and grading', () => {
  it('converts beats through tempo changes in both directions', () => {
    expect(scoreSecondsAtBeat(4, tempos, 1)).toBeCloseTo(2);
    expect(scoreSecondsAtBeat(6, tempos, 1)).toBeCloseTo(4);
    expect(beatAtScoreSeconds(4, tempos, 1)).toBeCloseTo(6);
    expect(scoreSecondsAtBeat(4, tempos, 0.5)).toBeCloseTo(4);
  });

  it('uses an injected audio clock, counts in, grades notes, and pauses fairly', () => {
    const game = new ScoreGameEngine(events, tempos, { countInBeats: 4 });
    game.start(10);
    expect(game.snapshot(10).phase).toBe('count_in');
    expect(game.snapshot(12).phase).toBe('playing');
    expect(game.snapshot(12).activeEvent?.id).toBe('a');

    [12.02, 12.12, 12.22, 12.32, 12.42].forEach((now) => game.pushPitch(frame(440), now));
    expect(game.snapshot(12.55).judgements.perfect).toBe(1);
    game.pause(12.6);
    expect(game.snapshot(20).phase).toBe('paused');
    expect(game.snapshot(20).beat).toBeCloseTo(1.2);
    game.resume(20);
    expect(game.snapshot(20).beat).toBeCloseTo(1.2);

    [20.05, 20.15, 20.25].forEach((now) => game.pushPitch(frame(440), now));
    const finished = game.snapshot(21);
    expect(finished.phase).toBe('finished');
    expect(finished.judgements).toEqual({ perfect: 1, good: 0, miss: 1 });
    expect(finished.score).toBe(50);
  });

  it('rejects clipped, stale, discontinuous, and unvoiced frames', () => {
    const game = new ScoreGameEngine(events.slice(0, 1), [{ beat: 0, bpm: 120, measure: 1 }], { countInBeats: 0 });
    game.start(0);
    const invalid = [
      { ...frame(440), clipping: true },
      { ...frame(440), discontinuity: true },
      { ...frame(440), frameAgeMs: 400 },
      frame(null),
    ];
    invalid.forEach((item, index) => game.pushPitch(item, index * 0.05));
    expect(game.snapshot(0.6).judgements.miss).toBe(1);
  });
});
