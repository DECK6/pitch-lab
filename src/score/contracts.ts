export type ScoreSourceKind = 'musicxml' | 'mxl' | 'pdf';
export type ImportConfidence = 'high' | 'medium' | 'low';
export type ChoirRole = 'S' | 'A' | 'T' | 'B' | 'LINE';

export interface ImportWarning {
  code: string;
  severity: 'info' | 'warning' | 'blocking';
  message: string;
  measure?: number;
  partId?: string;
}

export interface TempoChange {
  beat: number;
  bpm: number;
  measure: number;
}

export interface KeyChange {
  beat: number;
  fifths: number;
  mode: 'major' | 'minor';
  measure: number;
}

export interface TimeChange {
  beat: number;
  beats: number;
  beatType: number;
  measure: number;
}

export interface TargetNoteEvent {
  id: string;
  measure: number;
  onsetBeat: number;
  durationBeats: number;
  writtenMidi: number;
  soundingMidi: number;
  lyric?: string;
  confidence: ImportConfidence;
  sourceX?: number;
  sourceY?: number;
}

export interface ScoreVoice {
  id: string;
  partId: string;
  staff: number;
  voice: string;
  events: TargetNoteEvent[];
}

export interface ScorePart {
  id: string;
  name: string;
  abbreviation?: string;
  voices: ScoreVoice[];
}

export interface ScoreDocument {
  sourceKind: ScoreSourceKind;
  fileName: string;
  title: string;
  composer?: string;
  measureCount: number;
  durationBeats: number;
  parts: ScorePart[];
  tempoMap: TempoChange[];
  keyMap: KeyChange[];
  timeMap: TimeChange[];
  warnings: ImportWarning[];
  requiresReview: boolean;
  previewDataUrl?: string;
}

export interface VoiceLine {
  id: string;
  label: string;
  sourcePartId: string;
  sourceStaff: number;
  sourceVoice: string;
  suggestedRole: ChoirRole;
  confidence: ImportConfidence;
  reasons: string[];
  minMidi: number;
  maxMidi: number;
  events: TargetNoteEvent[];
}

export function cloneEvents(events: TargetNoteEvent[]): TargetNoteEvent[] {
  return events.map((event) => ({ ...event }));
}

export function noteNameForScoreMidi(midi: number): string {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const rounded = Math.round(midi);
  return `${names[((rounded % 12) + 12) % 12] ?? 'C'}${Math.floor(rounded / 12) - 1}`;
}
