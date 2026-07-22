import type { PitchFrame } from '../audio/types';
import type { TargetNoteEvent, TempoChange } from '../score/contracts';

export type GamePhase = 'idle' | 'count_in' | 'playing' | 'paused' | 'finished';
export type NoteJudgement = 'perfect' | 'good' | 'miss';

export interface GameSnapshot {
  phase: GamePhase;
  beat: number;
  activeEvent: TargetNoteEvent | null;
  activeCents: number | null;
  activeCoverage: number;
  judgements: Record<NoteJudgement, number>;
  score: number;
  completed: number;
  total: number;
}

interface EventStats {
  totalFrames: number;
  voicedFrames: number;
  absoluteCents: number[];
  firstVoicedBeat: number | null;
}

interface GameOptions {
  countInBeats?: number;
  tempoScale?: number;
}

export class ScoreGameEngine {
  private phase: GamePhase = 'idle';
  private startClockSeconds = 0;
  private pausedElapsedSeconds = 0;
  private readonly stats = new Map<string, EventStats>();
  private readonly completed = new Map<string, NoteJudgement>();
  private readonly judgements: Record<NoteJudgement, number> = { perfect: 0, good: 0, miss: 0 };
  private activeCents: number | null = null;
  private readonly countInBeats: number;
  private readonly tempoScale: number;
  private readonly countInSeconds: number;
  private readonly endBeat: number;

  constructor(
    private readonly events: TargetNoteEvent[],
    private readonly tempoMap: TempoChange[],
    options: GameOptions = {},
  ) {
    this.events = [...events].sort((a, b) => a.onsetBeat - b.onsetBeat || a.soundingMidi - b.soundingMidi);
    this.countInBeats = Math.max(0, options.countInBeats ?? 4);
    this.tempoScale = Math.max(0.5, Math.min(1.2, options.tempoScale ?? 1));
    const firstTempo = normalizedTempoMap(tempoMap)[0]?.bpm ?? 120;
    this.countInSeconds = this.countInBeats * 60 / (firstTempo * this.tempoScale);
    this.endBeat = this.events.reduce((end, event) => Math.max(end, event.onsetBeat + event.durationBeats), 0);
  }

  start(nowSeconds: number): void {
    this.resetScores();
    this.startClockSeconds = nowSeconds;
    this.pausedElapsedSeconds = 0;
    this.phase = this.countInBeats > 0 ? 'count_in' : 'playing';
  }

  restart(nowSeconds: number): void {
    this.start(nowSeconds);
  }

  pause(nowSeconds: number): void {
    if (this.phase !== 'playing' && this.phase !== 'count_in') return;
    this.snapshot(nowSeconds);
    this.pausedElapsedSeconds = Math.max(0, nowSeconds - this.startClockSeconds);
    this.phase = 'paused';
  }

  resume(nowSeconds: number): void {
    if (this.phase !== 'paused') return;
    this.startClockSeconds = nowSeconds - this.pausedElapsedSeconds;
    this.phase = this.pausedElapsedSeconds < this.countInSeconds ? 'count_in' : 'playing';
  }

  pushPitch(frame: PitchFrame, nowSeconds: number): GameSnapshot {
    const snapshot = this.snapshot(nowSeconds);
    const event = snapshot.activeEvent;
    if (snapshot.phase !== 'playing' || !event) return snapshot;
    const stats = this.statsFor(event.id);
    stats.totalFrames += 1;
    if (!frame.voiced || frame.frequencyHz === null || !Number.isFinite(frame.frequencyHz) || frame.frequencyHz <= 0
      || frame.clipping || frame.discontinuity || frame.frameAgeMs > 250) return this.snapshot(nowSeconds);
    const cents = 1200 * Math.log2(frame.frequencyHz / midiToFrequency(event.soundingMidi));
    stats.voicedFrames += 1;
    stats.absoluteCents.push(Math.abs(cents));
    if (stats.firstVoicedBeat === null) stats.firstVoicedBeat = snapshot.beat;
    this.activeCents = cents;
    return this.snapshot(nowSeconds);
  }

  snapshot(nowSeconds: number): GameSnapshot {
    const beat = this.beatAt(nowSeconds);
    if (this.phase === 'count_in' && nowSeconds - this.startClockSeconds >= this.countInSeconds) this.phase = 'playing';
    if (this.phase === 'playing') {
      this.events.forEach((event) => {
        if (event.onsetBeat + event.durationBeats <= beat + 1e-7) this.finalize(event);
      });
      if (beat >= this.endBeat && this.events.length > 0) {
        this.events.forEach((event) => this.finalize(event));
        this.phase = 'finished';
        this.activeCents = null;
      }
    }
    const activeEvent = this.phase === 'playing'
      ? this.events.find((event) => beat >= event.onsetBeat && beat < event.onsetBeat + event.durationBeats) ?? null
      : null;
    if (!activeEvent) this.activeCents = null;
    const activeStats = activeEvent ? this.stats.get(activeEvent.id) : undefined;
    const completed = this.completed.size;
    const points = this.judgements.perfect * 100 + this.judgements.good * 65;
    return {
      phase: this.phase,
      beat,
      activeEvent,
      activeCents: this.activeCents,
      activeCoverage: activeStats && activeStats.totalFrames > 0 ? activeStats.voicedFrames / activeStats.totalFrames : 0,
      judgements: { ...this.judgements },
      score: completed > 0 ? Math.round(points / completed) : 0,
      completed,
      total: this.events.length,
    };
  }

  private beatAt(nowSeconds: number): number {
    if (this.phase === 'idle') return -this.countInBeats;
    const elapsed = this.phase === 'paused'
      ? this.pausedElapsedSeconds
      : Math.max(0, nowSeconds - this.startClockSeconds);
    if (elapsed < this.countInSeconds) {
      const firstTempo = normalizedTempoMap(this.tempoMap)[0]?.bpm ?? 120;
      return -(this.countInSeconds - elapsed) * firstTempo * this.tempoScale / 60;
    }
    return beatAtScoreSeconds(elapsed - this.countInSeconds, this.tempoMap, this.tempoScale);
  }

  private finalize(event: TargetNoteEvent): void {
    if (this.completed.has(event.id)) return;
    const stats = this.statsFor(event.id);
    const coverage = stats.totalFrames > 0 ? stats.voicedFrames / stats.totalFrames : 0;
    const medianCents = median(stats.absoluteCents);
    const onsetError = stats.firstVoicedBeat === null ? Number.POSITIVE_INFINITY : Math.max(0, stats.firstVoicedBeat - event.onsetBeat);
    const judgement: NoteJudgement = coverage >= 0.55 && medianCents !== null && medianCents <= 15 && onsetError <= 0.3
      ? 'perfect'
      : coverage >= 0.45 && medianCents !== null && medianCents <= 35 && onsetError <= 0.5
        ? 'good'
        : 'miss';
    this.completed.set(event.id, judgement);
    this.judgements[judgement] += 1;
  }

  private statsFor(eventId: string): EventStats {
    let stats = this.stats.get(eventId);
    if (!stats) {
      stats = { totalFrames: 0, voicedFrames: 0, absoluteCents: [], firstVoicedBeat: null };
      this.stats.set(eventId, stats);
    }
    return stats;
  }

  private resetScores(): void {
    this.stats.clear();
    this.completed.clear();
    this.judgements.perfect = 0;
    this.judgements.good = 0;
    this.judgements.miss = 0;
    this.activeCents = null;
  }
}

export function scoreSecondsAtBeat(beat: number, tempoMap: TempoChange[], tempoScale = 1): number {
  const target = Math.max(0, beat);
  const tempos = normalizedTempoMap(tempoMap);
  let seconds = 0;
  for (let index = 0; index < tempos.length; index += 1) {
    const current = tempos[index];
    if (!current) continue;
    const nextBeat = tempos[index + 1]?.beat ?? target;
    const segmentEnd = Math.min(target, nextBeat);
    if (segmentEnd > current.beat) seconds += (segmentEnd - current.beat) * 60 / (current.bpm * tempoScale);
    if (target <= nextBeat) break;
  }
  return seconds;
}

export function beatAtScoreSeconds(seconds: number, tempoMap: TempoChange[], tempoScale = 1): number {
  let remaining = Math.max(0, seconds);
  const tempos = normalizedTempoMap(tempoMap);
  for (let index = 0; index < tempos.length; index += 1) {
    const current = tempos[index];
    if (!current) continue;
    const next = tempos[index + 1];
    if (!next) return current.beat + remaining * current.bpm * tempoScale / 60;
    const segmentSeconds = (next.beat - current.beat) * 60 / (current.bpm * tempoScale);
    if (remaining <= segmentSeconds) return current.beat + remaining * current.bpm * tempoScale / 60;
    remaining -= segmentSeconds;
  }
  return 0;
}

function normalizedTempoMap(tempoMap: TempoChange[]): TempoChange[] {
  const sorted = tempoMap
    .filter((tempo) => Number.isFinite(tempo.beat) && Number.isFinite(tempo.bpm) && tempo.bpm > 0)
    .sort((a, b) => a.beat - b.beat);
  if (sorted[0]?.beat === 0) return sorted;
  return [{ beat: 0, bpm: sorted[0]?.bpm ?? 120, measure: 1 }, ...sorted];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? null;
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
