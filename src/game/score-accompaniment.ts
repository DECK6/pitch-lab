import { scoreSecondsAtBeat } from './score-game';
import type { ScoreDocument, TargetNoteEvent, VoiceLine } from '../score/contracts';

export type ScorePlaybackKind = 'guide' | 'backing';

export interface ScorePlaybackNote {
  id: string;
  kind: ScorePlaybackKind;
  midi: number;
  onsetBeat: number;
  endBeat: number;
  startSeconds: number;
  durationSeconds: number;
}

export interface ScorePlaybackLevels {
  guide: number;
  backing: number;
}

const LOOKAHEAD_SECONDS = 0.45;
const SCHEDULER_INTERVAL_MS = 80;

export function buildScorePlaybackPlan(
  score: ScoreDocument,
  selected: VoiceLine,
  ignoredEvents: ReadonlySet<string>,
  tempoScale = 1,
): ScorePlaybackNote[] {
  const selectedEventIds = new Set(selected.events.map((event) => event.id));
  const backing = score.parts.flatMap((part) => part.voices.flatMap((voice) => voice.events))
    .filter((event) => !selectedEventIds.has(event.id) && !ignoredEvents.has(event.id))
    .map((event) => playbackNote(event, 'backing', score, tempoScale));
  const guide = selected.events
    .filter((event) => !ignoredEvents.has(event.id))
    .map((event) => playbackNote(event, 'guide', score, tempoScale));
  return [...backing, ...guide]
    .filter((note) => note.durationSeconds > 0 && Number.isFinite(note.midi))
    .sort((a, b) => a.startSeconds - b.startSeconds || comparePlaybackKind(a.kind, b.kind) || a.midi - b.midi);
}

export class ScoreAccompaniment {
  private context: AudioContext | null = null;
  private scoreOriginTime = 0;
  private minimumScoreSeconds = 0;
  private timer = 0;
  private scheduled = new Set<string>();
  private sources = new Set<OscillatorNode>();
  private guideBus: GainNode | null = null;
  private backingBus: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private readonly backingNormalization: number;
  private levels: ScorePlaybackLevels;

  constructor(private readonly plan: ScorePlaybackNote[], levels: ScorePlaybackLevels = { guide: 0.85, backing: 0.35 }) {
    this.levels = clampLevels(levels);
    this.backingNormalization = backingPolyphonyNormalization(plan);
  }

  start(context: AudioContext, scoreOriginTime: number, fromScoreSeconds = 0): void {
    this.stop();
    this.context = context;
    this.scoreOriginTime = scoreOriginTime;
    this.minimumScoreSeconds = Math.max(0, fromScoreSeconds);
    this.guideBus = context.createGain();
    this.backingBus = context.createGain();
    this.limiter = context.createDynamicsCompressor();
    this.guideBus.gain.value = this.levels.guide;
    this.backingBus.gain.value = this.levels.backing * this.backingNormalization;
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.12;
    this.guideBus.connect(this.limiter);
    this.backingBus.connect(this.limiter);
    this.limiter.connect(context.destination);
    this.scheduleWindow();
    this.timer = window.setInterval(() => this.scheduleWindow(), SCHEDULER_INTERVAL_MS);
  }

  setLevels(levels: ScorePlaybackLevels): void {
    this.levels = clampLevels(levels);
    const now = this.context?.currentTime ?? 0;
    this.guideBus?.gain.setTargetAtTime(this.levels.guide, now, 0.02);
    this.backingBus?.gain.setTargetAtTime(this.levels.backing * this.backingNormalization, now, 0.02);
  }

  stop(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
    this.sources.forEach((source) => {
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
    });
    this.sources.clear();
    this.scheduled.clear();
    this.guideBus?.disconnect();
    this.backingBus?.disconnect();
    this.limiter?.disconnect();
    this.guideBus = null;
    this.backingBus = null;
    this.limiter = null;
    this.context = null;
  }

  private scheduleWindow(): void {
    const context = this.context;
    if (!context) return;
    const scoreNow = Math.max(this.minimumScoreSeconds, context.currentTime - this.scoreOriginTime);
    const horizon = scoreNow + LOOKAHEAD_SECONDS;
    this.plan.forEach((note) => {
      if (this.scheduled.has(note.id) || note.startSeconds > horizon || note.startSeconds + note.durationSeconds <= scoreNow) return;
      this.scheduled.add(note.id);
      this.scheduleNote(note, scoreNow);
    });
    const finalEnd = this.plan.reduce((end, note) => Math.max(end, note.startSeconds + note.durationSeconds), 0);
    if (scoreNow > finalEnd + LOOKAHEAD_SECONDS && this.timer) {
      window.clearInterval(this.timer);
      this.timer = 0;
    }
  }

  private scheduleNote(note: ScorePlaybackNote, scoreNow: number): void {
    const context = this.context;
    const bus = note.kind === 'guide' ? this.guideBus : this.backingBus;
    if (!context || !bus) return;
    const eventEnd = note.startSeconds + note.durationSeconds;
    const audibleStart = Math.max(note.startSeconds, scoreNow);
    const startAt = Math.max(context.currentTime + 0.006, this.scoreOriginTime + audibleStart);
    const duration = Math.max(0.025, eventEnd - audibleStart);
    const releaseSeconds = Math.min(0.08, duration * 0.22);
    const endAt = startAt + duration;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = note.kind === 'guide' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(midiToFrequency(note.midi), startAt);
    const peak = note.kind === 'guide' ? 0.26 : 0.12;
    envelope.gain.setValueAtTime(0.0001, context.currentTime);
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.linearRampToValueAtTime(peak, startAt + Math.min(0.012, duration * 0.2));
    envelope.gain.setValueAtTime(peak, Math.max(startAt + 0.012, endAt - releaseSeconds));
    envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);
    oscillator.connect(envelope).connect(bus);
    this.sources.add(oscillator);
    oscillator.addEventListener('ended', () => {
      this.sources.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    }, { once: true });
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.01);
  }
}

function playbackNote(event: TargetNoteEvent, kind: ScorePlaybackKind, score: ScoreDocument, tempoScale: number): ScorePlaybackNote {
  const endBeat = event.onsetBeat + event.durationBeats;
  const startSeconds = scoreSecondsAtBeat(event.onsetBeat, score.tempoMap, tempoScale);
  const endSeconds = scoreSecondsAtBeat(endBeat, score.tempoMap, tempoScale);
  return {
    id: `${kind}:${event.id}`,
    kind,
    midi: event.soundingMidi,
    onsetBeat: event.onsetBeat,
    endBeat,
    startSeconds,
    durationSeconds: Math.max(0, endSeconds - startSeconds),
  };
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function clampLevels(levels: ScorePlaybackLevels): ScorePlaybackLevels {
  return {
    guide: Math.max(0, Math.min(1, levels.guide)),
    backing: Math.max(0, Math.min(1, levels.backing)),
  };
}

export function backingPolyphonyNormalization(plan: readonly ScorePlaybackNote[]): number {
  const edges = plan
    .filter((note) => note.kind === 'backing')
    .flatMap((note) => [
      { time: note.startSeconds, delta: 1 },
      { time: note.startSeconds + note.durationSeconds, delta: -1 },
    ])
    .sort((a, b) => a.time - b.time || a.delta - b.delta);
  let active = 0;
  let maximum = 0;
  edges.forEach((edge) => {
    active += edge.delta;
    maximum = Math.max(maximum, active);
  });
  return 1 / Math.max(1, maximum);
}

function comparePlaybackKind(a: ScorePlaybackKind, b: ScorePlaybackKind): number {
  if (a === b) return 0;
  return a === 'guide' ? -1 : 1;
}
