import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { decodeMxl, parseMusicXml } from '../../src/score/musicxml-import';

const fixtureUrl = new URL('../fixtures/scores/satb.musicxml', import.meta.url);

describe('MusicXML import', () => {
  it('normalizes parts, voices, tempo, key, transpose, lyrics, and ties', async () => {
    const xml = await readFile(fixtureUrl, 'utf8');
    const score = parseMusicXml(xml, 'satb.musicxml');
    expect(score.title).toBe('Four Lines');
    expect(score.parts.map((part) => part.name)).toEqual(['Soprano', 'Alto', 'Tenor', 'Bass']);
    expect(score.tempoMap[0]).toMatchObject({ bpm: 100, beat: 0, measure: 1 });
    expect(score.keyMap[0]).toMatchObject({ fifths: 0, mode: 'major' });
    const soprano = score.parts[0]?.voices[0];
    expect(soprano?.events.map((event) => [event.measure, event.onsetBeat, event.durationBeats, event.writtenMidi])).toEqual([
      [1, 0, 1, 72],
      [1, 1, 1, 74],
      [1, 2, 3, 76],
      [2, 6, 2, 79],
    ]);
    expect(soprano?.events[0]?.lyric).toBe('Sing');
    const tenor = score.parts[2]?.voices[0]?.events[0];
    expect(tenor).toMatchObject({ writtenMidi: 64, soundingMidi: 52 });
    expect(score.durationBeats).toBe(8);
    expect(score.requiresReview).toBe(false);
  });

  it('decodes a bounded MXL container and rejects unsafe XML', async () => {
    const xml = await readFile(fixtureUrl, 'utf8');
    const container = `<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>`;
    const mxl = zipSync({
      'META-INF/container.xml': strToU8(container),
      'score.xml': strToU8(xml),
    });
    expect(decodeMxl(mxl)).toContain('<score-partwise');
    expect(() => parseMusicXml('<!ENTITY x SYSTEM "file:///etc/passwd"><score-partwise/>', 'bad.xml')).toThrow(/unsafe XML/i);
    expect(() => decodeMxl(zipSync({ '../score.xml': strToU8(xml) }))).toThrow(/unsafe path/i);
    const tooManyEntries = Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`empty-${index}.txt`, new Uint8Array()]));
    expect(() => decodeMxl(zipSync({ ...tooManyEntries, 'score.xml': strToU8(xml) }))).toThrow(/safe limit/i);
  });

  it('bounds out-of-range written pitches to the MIDI domain', async () => {
    const xml = (await readFile(fixtureUrl, 'utf8')).replace('<octave>5</octave>', '<octave>99</octave>');
    const event = parseMusicXml(xml, 'extreme.musicxml').parts[0]?.voices[0]?.events[0];
    expect(event).toMatchObject({ writtenMidi: 127, soundingMidi: 127 });
  });

  it('surfaces unsupported playback navigation as a blocking review instead of silently guessing', async () => {
    const xml = (await readFile(fixtureUrl, 'utf8')).replace(
      '</measure>',
      '<barline location="right"><repeat direction="backward"/></barline></measure>',
    );
    const score = parseMusicXml(xml, 'repeat.musicxml');
    expect(score.warnings).toContainEqual(expect.objectContaining({ code: 'REPEAT_REVIEW_REQUIRED', severity: 'blocking' }));
    expect(score.requiresReview).toBe(true);
  });
});
