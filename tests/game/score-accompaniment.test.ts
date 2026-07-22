import { describe, expect, it } from 'vitest';
import { backingPolyphonyNormalization, buildScorePlaybackPlan, type ScorePlaybackNote } from '../../src/game/score-accompaniment';
import type { ScoreDocument, VoiceLine } from '../../src/score/contracts';

describe('score accompaniment plan', () => {
  it('plays the selected part as the loud guide and keeps the other parts as backing', () => {
    const score: ScoreDocument = {
      sourceKind: 'musicxml', fileName: 'satb.musicxml', title: 'SATB', measureCount: 1, durationBeats: 4,
      tempoMap: [{ beat: 0, bpm: 120, measure: 1 }], keyMap: [{ beat: 0, fifths: 0, mode: 'major', measure: 1 }],
      timeMap: [{ beat: 0, beats: 4, beatType: 4, measure: 1 }], warnings: [], requiresReview: false,
      parts: [
        { id: 'S', name: 'Soprano', voices: [{ id: 'S:v1', partId: 'S', staff: 1, voice: '1', events: [
          { id: 's1', measure: 1, onsetBeat: 1, durationBeats: 2, writtenMidi: 72, soundingMidi: 72, confidence: 'high' },
        ] }] },
        { id: 'A', name: 'Alto', voices: [{ id: 'A:v1', partId: 'A', staff: 1, voice: '1', events: [
          { id: 'a1', measure: 1, onsetBeat: 0, durationBeats: 1, writtenMidi: 64, soundingMidi: 64, confidence: 'high' },
        ] }] },
      ],
    };
    const selected: VoiceLine = {
      id: 'S:v1', label: 'Soprano', sourcePartId: 'S', sourceStaff: 1, sourceVoice: '1', suggestedRole: 'S',
      confidence: 'high', reasons: ['part-name'], minMidi: 72, maxMidi: 72,
      events: [{ ...score.parts[0]!.voices[0]!.events[0]!, soundingMidi: 74, writtenMidi: 74 }],
    };

    const plan = buildScorePlaybackPlan(score, selected, new Set<string>(), 1);

    expect(plan.filter((note) => note.kind === 'guide')).toMatchObject([
      { id: 'guide:s1', midi: 74, startSeconds: 0.5, durationSeconds: 1 },
    ]);
    expect(plan.filter((note) => note.kind === 'backing')).toMatchObject([
      { id: 'backing:a1', midi: 64, startSeconds: 0, durationSeconds: 0.5 },
    ]);
    expect(plan.some((note) => note.id === 'backing:s1')).toBe(false);
  });

  it('omits ignored guide notes and follows tempo-map scaling for remaining backing', () => {
    const event = { id: 's1', measure: 1, onsetBeat: 2, durationBeats: 1, writtenMidi: 72, soundingMidi: 72, confidence: 'high' as const };
    const backing = { id: 'a1', measure: 1, onsetBeat: 3, durationBeats: 2, writtenMidi: 64, soundingMidi: 64, confidence: 'high' as const };
    const score: ScoreDocument = {
      sourceKind: 'musicxml', fileName: 'solo.musicxml', title: 'Solo', measureCount: 1, durationBeats: 4,
      tempoMap: [{ beat: 0, bpm: 120, measure: 1 }, { beat: 4, bpm: 60, measure: 2 }], keyMap: [], timeMap: [], warnings: [], requiresReview: false,
      parts: [
        { id: 'S', name: 'Soprano', voices: [{ id: 'S:v1', partId: 'S', staff: 1, voice: '1', events: [event] }] },
        { id: 'A', name: 'Alto', voices: [{ id: 'A:v1', partId: 'A', staff: 1, voice: '1', events: [backing] }] },
      ],
    };
    const selected: VoiceLine = {
      id: 'S:v1', label: 'Soprano', sourcePartId: 'S', sourceStaff: 1, sourceVoice: '1', suggestedRole: 'S',
      confidence: 'high', reasons: [], minMidi: 72, maxMidi: 72, events: [{ ...event }],
    };

    expect(buildScorePlaybackPlan(score, selected, new Set(['s1']), 0.5)).toMatchObject([
      { id: 'backing:a1', startSeconds: 3, durationSeconds: 3 },
    ]);
  });

  it('normalizes dense backing by its maximum simultaneous note count', () => {
    const plan: ScorePlaybackNote[] = Array.from({ length: 4 }, (_, index) => ({
      id: `backing:${index}`, kind: 'backing' as const, midi: 60 + index,
      onsetBeat: 0, endBeat: 2, startSeconds: 0, durationSeconds: 1,
    }));
    plan.push({ id: 'guide:1', kind: 'guide', midi: 72, onsetBeat: 0, endBeat: 2, startSeconds: 0, durationSeconds: 1 });
    expect(backingPolyphonyNormalization(plan)).toBe(0.25);
  });
});
