import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { extractVoiceLines } from '../../src/choir/part-extractor';
import type { ScoreDocument } from '../../src/score/contracts';
import { parseMusicXml } from '../../src/score/musicxml-import';

const fixtureUrl = new URL('../fixtures/scores/satb.musicxml', import.meta.url);

describe('choir part extraction', () => {
  it('maps separately named SATB parts with high confidence', async () => {
    const score = parseMusicXml(await readFile(fixtureUrl, 'utf8'), 'satb.musicxml');
    const lines = extractVoiceLines(score);
    expect(lines.map((line) => [line.suggestedRole, line.confidence])).toEqual([
      ['S', 'high'],
      ['A', 'high'],
      ['T', 'high'],
      ['B', 'high'],
    ]);
    expect(lines[0]?.label).toContain('Soprano');
    expect(lines[3]?.minMidi).toBe(48);
  });

  it('splits simultaneous harmony into separate rank lines without dropping notes', () => {
    const score: ScoreDocument = {
      sourceKind: 'musicxml', fileName: 'chord.musicxml', title: 'Chord', measureCount: 1, durationBeats: 4,
      tempoMap: [{ beat: 0, bpm: 120, measure: 1 }], keyMap: [{ beat: 0, fifths: 0, mode: 'major', measure: 1 }],
      timeMap: [{ beat: 0, beats: 4, beatType: 4, measure: 1 }], warnings: [], requiresReview: false,
      parts: [{ id: 'P1', name: 'Choir', voices: [{ id: 'P1:s1:v1', partId: 'P1', staff: 1, voice: '1', events: [
        { id: 'n1', measure: 1, onsetBeat: 0, durationBeats: 1, writtenMidi: 72, soundingMidi: 72, confidence: 'high' },
        { id: 'n2', measure: 1, onsetBeat: 0, durationBeats: 1, writtenMidi: 67, soundingMidi: 67, confidence: 'high' },
        { id: 'n3', measure: 1, onsetBeat: 1, durationBeats: 1, writtenMidi: 74, soundingMidi: 74, confidence: 'high' },
        { id: 'n4', measure: 1, onsetBeat: 1, durationBeats: 1, writtenMidi: 69, soundingMidi: 69, confidence: 'high' },
      ] }] }],
    };
    const lines = extractVoiceLines(score);
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.events.map((event) => event.soundingMidi))).toEqual([[72, 74], [67, 69]]);
    expect(lines.every((line) => line.reasons.includes('polyphonic-rank-split'))).toBe(true);
    expect(lines.every((line) => line.confidence === 'low')).toBe(true);
  });
});
