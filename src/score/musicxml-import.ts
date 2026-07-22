import { unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import type {
  ImportWarning,
  KeyChange,
  ScoreDocument,
  ScorePart,
  ScoreSourceKind,
  ScoreVoice,
  TargetNoteEvent,
  TempoChange,
  TimeChange,
} from './contracts';

const MAX_XML_BYTES = 16 * 1024 * 1024;
const MAX_MXL_BYTES = 8 * 1024 * 1024;
const MAX_MXL_EXPANDED_BYTES = 32 * 1024 * 1024;
const MAX_MXL_ENTRIES = 256;
const MAX_PARTS = 64;
const MAX_MEASURES_PER_PART = 5_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type XmlValue = string | number | XmlNode[] | Record<string, string | number>;
type XmlNode = Record<string, XmlValue>;
interface XmlElement {
  children: XmlNode[];
  attrs: Record<string, string | number>;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  trimValues: true,
  parseTagValue: true,
});

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function decodeMxl(bytes: Uint8Array): string {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_MXL_BYTES) throw new Error('MXL file is empty or exceeds the 8 MB limit.');
  let expandedBytes = 0;
  let unsafePath = '';
  let oversized = '';
  let entryCount = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      entryCount += 1;
      if (entryCount > MAX_MXL_ENTRIES) {
        oversized = 'too many archive entries';
        return false;
      }
      if (isUnsafeArchivePath(file.name)) {
        unsafePath = file.name;
        return false;
      }
      expandedBytes += file.originalSize;
      if (file.originalSize > MAX_XML_BYTES || expandedBytes > MAX_MXL_EXPANDED_BYTES) {
        oversized = file.name;
        return false;
      }
      return true;
    },
  });
  if (unsafePath) throw new Error(`MXL contains an unsafe path: ${unsafePath}`);
  if (oversized) throw new Error(`MXL expands beyond the safe limit near: ${oversized}`);
  const container = files['META-INF/container.xml'];
  let rootPath = '';
  if (container) {
    const containerXml = decoder.decode(container);
    rootPath = containerXml.match(/<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i)?.[1] ?? '';
  }
  if (!rootPath) rootPath = Object.keys(files).find((name) => /\.(?:musicxml|xml)$/i.test(name) && !/^META-INF\//i.test(name)) ?? '';
  if (!rootPath || isUnsafeArchivePath(rootPath)) throw new Error('MXL does not declare a safe MusicXML root file.');
  const root = files[rootPath];
  if (!root) throw new Error(`MXL root file is missing: ${rootPath}`);
  return decoder.decode(root);
}

export function parseMusicXml(xmlInput: string, fileName: string, sourceKind: ScoreSourceKind = 'musicxml'): ScoreDocument {
  if (!xmlInput.trim() || encoder.encode(xmlInput).byteLength > MAX_XML_BYTES) throw new Error('MusicXML is empty or exceeds the 16 MB limit.');
  if (/<!ENTITY\b/i.test(xmlInput) || /<!DOCTYPE[^>]*\[/i.test(xmlInput)) throw new Error('Unsafe XML entity declarations are not allowed.');
  const xml = xmlInput.replace(/<!DOCTYPE[^>]*>/i, '');
  const parsed = parser.parse(xml) as XmlNode[];
  const root = elements(parsed, 'score-partwise')[0];
  if (!root) throw new Error('Only MusicXML score-partwise documents are supported.');

  const warnings: ImportWarning[] = [];
  if (/<(?:repeat|ending)\b/i.test(xml)) {
    warnings.push({
      code: 'REPEAT_REVIEW_REQUIRED',
      severity: 'blocking',
      message: 'Repeats and endings are laid out once in this preview. Review the resulting note order before grading.',
    });
  }
  if (/<sound\b[^>]*(?:dacapo|dalsegno|tocoda|fine)\s*=|<(?:segno|coda)\b/i.test(xml)) {
    warnings.push({
      code: 'JUMP_NOT_EXPANDED',
      severity: 'blocking',
      message: 'D.C., D.S., Segno, Coda, and Fine navigation is not expanded. Review the linear note order before grading.',
    });
  }
  const tempoMap: TempoChange[] = [];
  const keyMap: KeyChange[] = [];
  const timeMap: TimeChange[] = [];
  const partDefinitions = readPartDefinitions(root.children);
  const partElements = elements(root.children, 'part');
  if (partElements.length === 0 || partElements.length > MAX_PARTS) throw new Error('MusicXML must contain between 1 and 64 parts.');

  let measureCount = 0;
  let durationBeats = 0;
  const parts: ScorePart[] = [];

  partElements.forEach((partElement, partIndex) => {
    const partId = stringAttr(partElement, 'id') || `P${partIndex + 1}`;
    const definition = partDefinitions.get(partId);
    const measureElements = elements(partElement.children, 'measure');
    if (measureElements.length > MAX_MEASURES_PER_PART) throw new Error(`${partId} exceeds the 5,000 measure limit.`);
    measureCount = Math.max(measureCount, measureElements.length);
    const voices = new Map<string, ScoreVoice>();
    const openTies = new Map<string, TargetNoteEvent>();
    let divisions = 1;
    let transpose = 0;
    let beatsPerMeasure = 4;
    let beatType = 4;
    let measureStartBeat = 0;

    measureElements.forEach((measureElement, measureIndex) => {
      const parsedMeasure = Number.parseInt(stringAttr(measureElement, 'number'), 10);
      const measure = Number.isFinite(parsedMeasure) ? parsedMeasure : measureIndex + 1;
      let cursor = 0;
      let maxCursor = 0;
      let lastOnset = 0;

      for (const node of measureElement.children) {
        const attributes = nodeElement(node, 'attributes');
        if (attributes) {
          const nextDivisions = numberText(attributes.children, 'divisions');
          if (nextDivisions !== null && nextDivisions > 0) divisions = nextDivisions;
          const key = elements(attributes.children, 'key')[0];
          if (key) {
            const fifths = numberText(key.children, 'fifths') ?? 0;
            const mode = text(key.children, 'mode')?.toLowerCase() === 'minor' ? 'minor' : 'major';
            pushUniqueChange(keyMap, { beat: measureStartBeat, fifths, mode, measure }, (item) => `${item.beat}:${item.fifths}:${item.mode}`);
          }
          const time = elements(attributes.children, 'time')[0];
          if (time) {
            beatsPerMeasure = Math.max(1, numberText(time.children, 'beats') ?? beatsPerMeasure);
            beatType = Math.max(1, numberText(time.children, 'beat-type') ?? beatType);
            pushUniqueChange(timeMap, { beat: measureStartBeat, beats: beatsPerMeasure, beatType, measure }, (item) => `${item.beat}:${item.beats}:${item.beatType}`);
          }
          const transposition = elements(attributes.children, 'transpose')[0];
          if (transposition) transpose = numberText(transposition.children, 'chromatic') ?? 0;
          continue;
        }

        const direction = nodeElement(node, 'direction');
        const directSound = nodeElement(node, 'sound');
        if (direction || directSound) {
          const sound = directSound ?? elements(direction?.children ?? [], 'sound')[0];
          const bpm = sound ? numberAttr(sound, 'tempo') : null;
          if (bpm !== null && bpm >= 20 && bpm <= 400) {
            pushUniqueChange(tempoMap, { beat: measureStartBeat + cursor, bpm, measure }, (item) => `${item.beat}:${item.bpm}`);
          }
          continue;
        }

        const backup = nodeElement(node, 'backup');
        if (backup) {
          cursor = Math.max(0, cursor - (numberText(backup.children, 'duration') ?? 0) / divisions);
          continue;
        }
        const forward = nodeElement(node, 'forward');
        if (forward) {
          cursor += (numberText(forward.children, 'duration') ?? 0) / divisions;
          maxCursor = Math.max(maxCursor, cursor);
          continue;
        }

        const note = nodeElement(node, 'note');
        if (!note) continue;
        const isChord = hasElement(note.children, 'chord');
        const isGrace = hasElement(note.children, 'grace');
        const duration = isGrace ? 0 : Math.max(0, (numberText(note.children, 'duration') ?? 0) / divisions);
        const onset = isChord ? lastOnset : cursor;
        if (!isChord) {
          lastOnset = onset;
          cursor += duration;
          maxCursor = Math.max(maxCursor, cursor);
        }
        if (hasElement(note.children, 'rest') || isGrace) {
          if (isGrace) warnings.push({ code: 'GRACE_SKIPPED', severity: 'warning', message: 'Grace notes are shown but not graded in this preview.', measure, partId });
          continue;
        }
        const pitch = elements(note.children, 'pitch')[0];
        if (!pitch) continue;
        const step = (text(pitch.children, 'step') ?? '').toUpperCase();
        const octave = numberText(pitch.children, 'octave');
        if (!(step in STEP_SEMITONES) || octave === null) {
          warnings.push({ code: 'PITCH_SKIPPED', severity: 'warning', message: 'A note with an unsupported pitch was skipped.', measure, partId });
          continue;
        }
        const alter = numberText(pitch.children, 'alter') ?? 0;
        const writtenMidi = Math.max(0, Math.min(127, Math.round((octave + 1) * 12 + (STEP_SEMITONES[step] ?? 0) + alter)));
        const staff = Math.max(1, Math.round(numberText(note.children, 'staff') ?? 1));
        const voiceName = text(note.children, 'voice') ?? '1';
        const voiceId = `${partId}:s${staff}:v${voiceName}`;
        let voice = voices.get(voiceId);
        if (!voice) {
          voice = { id: voiceId, partId, staff, voice: voiceName, events: [] };
          voices.set(voiceId, voice);
        }
        const tieTypes = elements(note.children, 'tie').map((tie) => stringAttr(tie, 'type'));
        const tieKey = `${voiceId}:${writtenMidi}`;
        const existingTie = tieTypes.includes('stop') ? openTies.get(tieKey) : undefined;
        if (existingTie) {
          existingTie.durationBeats += duration;
          if (!tieTypes.includes('start')) openTies.delete(tieKey);
          continue;
        }
        const lyric = elements(note.children, 'lyric').map((item) => text(item.children, 'text')).find(Boolean);
        const event: TargetNoteEvent = {
          id: `${voiceId}:m${measure}:n${voice.events.length + 1}`,
          measure,
          onsetBeat: measureStartBeat + onset,
          durationBeats: Math.max(duration, 0.125),
          writtenMidi,
          soundingMidi: Math.max(0, Math.min(127, writtenMidi + transpose)),
          confidence: 'high',
          ...(lyric ? { lyric } : {}),
        };
        voice.events.push(event);
        if (tieTypes.includes('start')) openTies.set(tieKey, event);
      }

      const expectedDuration = beatsPerMeasure * 4 / beatType;
      const implicit = stringAttr(measureElement, 'implicit') === 'yes' || (measureIndex === 0 && maxCursor > 0 && maxCursor < expectedDuration);
      measureStartBeat += implicit ? maxCursor : Math.max(expectedDuration, maxCursor);
    });

    if (openTies.size > 0) warnings.push({ code: 'OPEN_TIE', severity: 'warning', message: 'One or more ties do not have a matching stop.', partId });
    durationBeats = Math.max(durationBeats, measureStartBeat);
    const sortedVoices = [...voices.values()]
      .map((voice) => ({ ...voice, events: voice.events.sort((a, b) => a.onsetBeat - b.onsetBeat || b.soundingMidi - a.soundingMidi) }))
      .filter((voice) => voice.events.length > 0);
    parts.push({
      id: partId,
      name: definition?.name || partId,
      ...(definition?.abbreviation ? { abbreviation: definition.abbreviation } : {}),
      voices: sortedVoices,
    });
  });

  if (tempoMap.length === 0) tempoMap.push({ beat: 0, bpm: 120, measure: 1 });
  if (keyMap.length === 0) keyMap.push({ beat: 0, fifths: 0, mode: 'major', measure: 1 });
  if (timeMap.length === 0) timeMap.push({ beat: 0, beats: 4, beatType: 4, measure: 1 });
  tempoMap.sort((a, b) => a.beat - b.beat);
  keyMap.sort((a, b) => a.beat - b.beat);
  timeMap.sort((a, b) => a.beat - b.beat);

  const work = elements(root.children, 'work')[0];
  const identification = elements(root.children, 'identification')[0];
  const composer = elements(identification?.children ?? [], 'creator')
    .find((creator) => stringAttr(creator, 'type').toLowerCase() === 'composer');
  return {
    sourceKind,
    fileName,
    title: text(work?.children ?? [], 'work-title') ?? fileName.replace(/\.[^.]+$/, ''),
    ...(composer ? { composer: ownText(composer.children) } : {}),
    measureCount,
    durationBeats,
    parts,
    tempoMap,
    keyMap,
    timeMap,
    warnings,
    requiresReview: warnings.some((warning) => warning.severity === 'blocking'),
  };
}

export async function importStructuredScore(file: File): Promise<ScoreDocument> {
  const name = file.name || 'score.musicxml';
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'mxl') {
    const xml = decodeMxl(new Uint8Array(await file.arrayBuffer()));
    return parseMusicXml(xml, name, 'mxl');
  }
  if (extension !== 'xml' && extension !== 'musicxml') throw new Error('Choose a MusicXML, XML, MXL, or PDF score.');
  return parseMusicXml(await file.text(), name, 'musicxml');
}

function readPartDefinitions(nodes: XmlNode[]): Map<string, { name: string; abbreviation?: string }> {
  const definitions = new Map<string, { name: string; abbreviation?: string }>();
  const partList = elements(nodes, 'part-list')[0];
  elements(partList?.children ?? [], 'score-part').forEach((part, index) => {
    const id = stringAttr(part, 'id') || `P${index + 1}`;
    const name = text(part.children, 'part-name') ?? id;
    const abbreviation = text(part.children, 'part-abbreviation');
    definitions.set(id, { name, ...(abbreviation ? { abbreviation } : {}) });
  });
  return definitions;
}

function elements(nodes: XmlNode[], name: string): XmlElement[] {
  const result: XmlElement[] = [];
  for (const node of nodes) {
    const value = node[name];
    if (!Array.isArray(value)) continue;
    const rawAttrs = node[':@'];
    result.push({ children: value as XmlNode[], attrs: isRecord(rawAttrs) ? rawAttrs : {} });
  }
  return result;
}

function nodeElement(node: XmlNode, name: string): XmlElement | null {
  return elements([node], name)[0] ?? null;
}

function hasElement(nodes: XmlNode[], name: string): boolean {
  return elements(nodes, name).length > 0;
}

function text(nodes: XmlNode[], name: string): string | undefined {
  const element = elements(nodes, name)[0];
  return element ? ownText(element.children) : undefined;
}

function ownText(nodes: XmlNode[]): string | undefined {
  for (const node of nodes) {
    const value = node['#text'];
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  }
  return undefined;
}

function numberText(nodes: XmlNode[], name: string): number | null {
  const value = Number(text(nodes, name));
  return Number.isFinite(value) ? value : null;
}

function stringAttr(element: XmlElement, name: string): string {
  const value = element.attrs[`@_${name}`];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function numberAttr(element: XmlElement, name: string): number | null {
  const value = Number(stringAttr(element, name));
  return Number.isFinite(value) ? value : null;
}

function isRecord(value: XmlValue | undefined): value is Record<string, string | number> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnsafeArchivePath(path: string): boolean {
  return path.startsWith('/') || path.includes('\\') || /(^|\/)\.\.(\/|$)/.test(path);
}

function pushUniqueChange<T>(items: T[], value: T, key: (item: T) => string): void {
  const valueKey = key(value);
  if (!items.some((item) => key(item) === valueKey)) items.push(value);
}
