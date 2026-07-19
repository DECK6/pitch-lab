const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;

export interface PitchNote {
  midi: number;
  midiFloat: number;
  name: string;
  octave: number;
  label: string;
  frequencyHz: number;
  cents: number;
}

export function midiToFrequency(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

export function frequencyToMidi(frequencyHz: number, a4 = 440): number | null {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0 || !Number.isFinite(a4) || a4 <= 0) return null;
  return 69 + 12 * Math.log2(frequencyHz / a4);
}

export function frequencyToNote(frequencyHz: number, a4 = 440): PitchNote | null {
  const midiFloat = frequencyToMidi(frequencyHz, a4);
  if (midiFloat === null) return null;
  const midi = Math.round(midiFloat);
  const index = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const noteFrequency = midiToFrequency(midi, a4);
  const cents = 1200 * Math.log2(frequencyHz / noteFrequency);
  const name = SHARP_NAMES[index] ?? '—';
  return { midi, midiFloat, name, octave, label: `${name}${octave}`, frequencyHz: noteFrequency, cents };
}

export function centsBetween(actualHz: number, targetHz: number): number | null {
  if (actualHz <= 0 || targetHz <= 0 || !Number.isFinite(actualHz) || !Number.isFinite(targetHz)) return null;
  return 1200 * Math.log2(actualHz / targetHz);
}

export function noteNameForMidi(midi: number): string {
  const index = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${SHARP_NAMES[index] ?? '—'}${octave}`;
}

