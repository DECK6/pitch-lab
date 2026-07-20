export type ScaleMode = 'major' | 'natural_minor';
export type ChordView = 'triad' | 'seventh';
export type ChordCategory = 'diatonic' | 'color' | 'secondary_dominant' | 'borrowed';

export interface KeyContext {
  tonicPitchClass: number;
  tonicName: string;
  mode: ScaleMode;
  fifths: number;
  scalePitchClasses: number[];
  scaleNoteNames: string[];
}

export interface ChordSuggestion {
  id: string;
  degreeIndex: number;
  roman: string;
  symbol: string;
  category: ChordCategory;
  pitchClasses: number[];
  noteNames: string[];
  functionLabel: string;
  resolutionTargetIds: string[];
  usageHint: string;
  quality: ChordQuality;
}

export interface HarmonyCatalog {
  key: KeyContext;
  view: ChordView;
  diatonic: ChordSuggestion[];
  related: ChordSuggestion[];
  colorsFor: (coreChordId: string) => ChordSuggestion[];
}

type ChordQuality = 'major' | 'minor' | 'diminished' | 'major7' | 'minor7' | 'dominant7' | 'half_diminished7';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const NATURAL_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11] as const;
const MAJOR_TONICS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;
const MINOR_TONICS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'] as const;
const SCALE_INTERVALS: Record<ScaleMode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natural_minor: [0, 2, 3, 5, 7, 8, 10],
};
const FIFTHS: Record<string, number> = {
  'C major': 0, 'D♭ major': -5, 'D major': 2, 'E♭ major': -3, 'E major': 4, 'F major': -1,
  'F♯ major': 6, 'G major': 1, 'A♭ major': -4, 'A major': 3, 'B♭ major': -2, 'B major': 5,
  'C natural_minor': -3, 'C♯ natural_minor': 4, 'D natural_minor': -1, 'E♭ natural_minor': -6,
  'E natural_minor': 1, 'F natural_minor': -4, 'F♯ natural_minor': 3, 'G natural_minor': -2,
  'G♯ natural_minor': 5, 'A natural_minor': 0, 'B♭ natural_minor': -5, 'B natural_minor': 2,
};

const TRIAD_QUALITIES: Record<ScaleMode, readonly ChordQuality[]> = {
  major: ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'],
  natural_minor: ['minor', 'diminished', 'major', 'minor', 'minor', 'major', 'major'],
};
const SEVENTH_QUALITIES: Record<ScaleMode, readonly ChordQuality[]> = {
  major: ['major7', 'minor7', 'minor7', 'major7', 'dominant7', 'minor7', 'half_diminished7'],
  natural_minor: ['minor7', 'half_diminished7', 'major7', 'minor7', 'minor7', 'major7', 'dominant7'],
};
const MAJOR_TRIAD_ROMANS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'] as const;
const MAJOR_SEVENTH_ROMANS = ['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7'] as const;
const MINOR_TRIAD_ROMANS = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'] as const;
const MINOR_SEVENTH_ROMANS = ['i7', 'iiø7', 'IIImaj7', 'iv7', 'v7', 'VImaj7', 'VII7'] as const;
const FUNCTION_LABELS_MAJOR = ['TONIC', 'PREDOMINANT', 'TONIC COLOR', 'PREDOMINANT', 'DOMINANT', 'TONIC RELATIVE', 'LEADING TONE'] as const;
const FUNCTION_LABELS_MINOR = ['TONIC', 'PREDOMINANT', 'RELATIVE MAJOR', 'PREDOMINANT', 'MINOR DOMINANT', 'COLOR', 'SUBTONIC'] as const;

function normalizePitchClass(value: number): number {
  return ((Math.round(value) % 12) + 12) % 12;
}

function accidentalForDelta(delta: number): string {
  if (delta === 0) return '';
  if (delta === 1) return '♯';
  if (delta === 2) return '𝄪';
  if (delta === -1) return '♭';
  if (delta === -2) return '𝄫';
  throw new Error(`Unsupported spelling delta ${delta}`);
}

function shortestAccidentalDelta(target: number, natural: number): number {
  let delta = normalizePitchClass(target - natural);
  if (delta > 6) delta -= 12;
  return delta;
}

function letterIndexForName(name: string): number {
  const index = LETTERS.indexOf(name[0] as typeof LETTERS[number]);
  if (index < 0) throw new Error(`Invalid note spelling ${name}`);
  return index;
}

function spellPitchClass(pitchClass: number, letterIndex: number): string {
  const normalizedLetter = ((letterIndex % 7) + 7) % 7;
  const natural = NATURAL_PITCH_CLASSES[normalizedLetter] ?? 0;
  const delta = shortestAccidentalDelta(pitchClass, natural);
  return `${LETTERS[normalizedLetter]}${accidentalForDelta(delta)}`;
}

export function pitchClassForSpelling(spelling: string): number {
  return normalizePitchClass(semitoneForSpelling(spelling));
}

export function midiForSpelling(spelling: string, octave: number): number {
  return (Math.round(octave) + 1) * 12 + semitoneForSpelling(spelling);
}

export function octaveForMidiSpelling(midi: number, spelling: string): number {
  return Math.round((Math.round(midi) - semitoneForSpelling(spelling)) / 12) - 1;
}

function semitoneForSpelling(spelling: string): number {
  const letterIndex = letterIndexForName(spelling);
  let semitone = NATURAL_PITCH_CLASSES[letterIndex] ?? 0;
  for (const accidental of spelling.slice(1)) {
    if (accidental === '♯' || accidental === '#') semitone += 1;
    else if (accidental === '♭' || accidental === 'b') semitone -= 1;
    else if (accidental === '𝄪') semitone += 2;
    else if (accidental === '𝄫') semitone -= 2;
  }
  return semitone;
}

export function createKeyContext(tonicPitchClass: number, mode: ScaleMode): KeyContext {
  const tonic = normalizePitchClass(tonicPitchClass);
  const tonicName = (mode === 'major' ? MAJOR_TONICS : MINOR_TONICS)[tonic] ?? 'C';
  const tonicLetter = letterIndexForName(tonicName);
  const scalePitchClasses = SCALE_INTERVALS[mode].map((interval) => normalizePitchClass(tonic + interval));
  const scaleNoteNames = scalePitchClasses.map((pitchClass, degree) => spellPitchClass(pitchClass, tonicLetter + degree));
  return {
    tonicPitchClass: tonic,
    tonicName,
    mode,
    fifths: FIFTHS[`${tonicName} ${mode}`] ?? 0,
    scalePitchClasses,
    scaleNoteNames,
  };
}

function suffixForQuality(quality: ChordQuality): string {
  switch (quality) {
    case 'major': return '';
    case 'minor': return 'm';
    case 'diminished': return 'dim';
    case 'major7': return 'maj7';
    case 'minor7': return 'm7';
    case 'dominant7': return '7';
    case 'half_diminished7': return 'm7♭5';
  }
}

function notesFromScale(key: KeyContext, degreeIndex: number, offsets: number[]): { pitchClasses: number[]; noteNames: string[] } {
  return {
    pitchClasses: offsets.map((offset) => key.scalePitchClasses[(degreeIndex + offset) % 7] ?? 0),
    noteNames: offsets.map((offset) => key.scaleNoteNames[(degreeIndex + offset) % 7] ?? 'C'),
  };
}

function spellChord(rootPitchClass: number, rootLetterIndex: number, intervals: number[]): { pitchClasses: number[]; noteNames: string[] } {
  const pitchClasses = intervals.map((interval) => normalizePitchClass(rootPitchClass + interval));
  return {
    pitchClasses,
    noteNames: pitchClasses.map((pitchClass, chordDegree) => spellPitchClass(pitchClass, rootLetterIndex + chordDegree * 2)),
  };
}

function makeDiatonic(key: KeyContext, view: ChordView): ChordSuggestion[] {
  const qualities = view === 'triad' ? TRIAD_QUALITIES[key.mode] : SEVENTH_QUALITIES[key.mode];
  const romans = key.mode === 'major'
    ? view === 'triad' ? MAJOR_TRIAD_ROMANS : MAJOR_SEVENTH_ROMANS
    : view === 'triad' ? MINOR_TRIAD_ROMANS : MINOR_SEVENTH_ROMANS;
  const functions = key.mode === 'major' ? FUNCTION_LABELS_MAJOR : FUNCTION_LABELS_MINOR;
  const offsets = view === 'triad' ? [0, 2, 4] : [0, 2, 4, 6];
  return Array.from({ length: 7 }, (_, degreeIndex) => {
    const quality = qualities[degreeIndex] ?? 'major';
    const notes = notesFromScale(key, degreeIndex, offsets);
    const id = `core-${degreeIndex + 1}`;
    return {
      id,
      degreeIndex,
      roman: romans[degreeIndex] ?? '',
      symbol: `${notes.noteNames[0]}${suffixForQuality(quality)}`,
      category: 'diatonic',
      ...notes,
      functionLabel: functions[degreeIndex] ?? 'COLOR',
      resolutionTargetIds: degreeIndex === 4 || degreeIndex === 6 ? ['core-1'] : [id],
      usageHint: degreeIndex === 4 ? 'TONIC으로 돌아가는 힘이 가장 강합니다.' : `${functions[degreeIndex] ?? 'COLOR'} 역할의 기본 코드입니다.`,
      quality,
    };
  });
}

function makeRelated(key: KeyContext, diatonic: ChordSuggestion[]): ChordSuggestion[] {
  const tonicLetter = letterIndexForName(key.tonicName);
  if (key.mode === 'major') {
    const secondaryTargets = [1, 2, 3, 4, 5];
    const secondary = secondaryTargets.map((targetDegree) => {
      const targetPitch = key.scalePitchClasses[targetDegree] ?? 0;
      const rootPitch = normalizePitchClass(targetPitch + 7);
      const targetLetter = tonicLetter + targetDegree;
      const rootLetter = targetLetter + 4;
      const notes = spellChord(rootPitch, rootLetter, [0, 4, 7, 10]);
      return {
        id: `secondary-${targetDegree + 1}`,
        degreeIndex: targetDegree,
        roman: `V/${['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'][targetDegree] ?? ''}`,
        symbol: `${notes.noteNames[0]}7`,
        category: 'secondary_dominant' as const,
        ...notes,
        functionLabel: 'SECONDARY DOMINANT',
        resolutionTargetIds: [diatonic[targetDegree]?.id ?? 'core-1'],
        usageHint: `${diatonic[targetDegree]?.symbol ?? '목표 코드'}로 강하게 연결합니다.`,
        quality: 'dominant7' as const,
      };
    });
    const borrowedSpecs = [
      { id: 'borrowed-iv', degreeIndex: 3, roman: 'iv', interval: 5, quality: 'minor' as const, suffix: 'm', resolution: 'core-1', hint: '메이저 키에 서정적인 어두움을 더한 뒤 I로 돌아갑니다.' },
      { id: 'borrowed-flat-vi', degreeIndex: 5, roman: '♭VI', interval: 8, quality: 'major' as const, suffix: '', resolution: 'core-5', hint: '강한 색채를 만든 뒤 V 또는 I로 연결합니다.' },
      { id: 'borrowed-flat-vii', degreeIndex: 6, roman: '♭VII', interval: 10, quality: 'major' as const, suffix: '', resolution: 'core-1', hint: '록·팝의 넓은 종지감을 만들고 I로 돌아갑니다.' },
    ];
    const borrowed = borrowedSpecs.map((spec) => {
      const rootPitch = normalizePitchClass(key.tonicPitchClass + spec.interval);
      const rootLetter = tonicLetter + spec.degreeIndex;
      const notes = spellChord(rootPitch, rootLetter, spec.quality === 'minor' ? [0, 3, 7] : [0, 4, 7]);
      return {
        id: spec.id,
        degreeIndex: spec.degreeIndex,
        roman: spec.roman,
        symbol: `${notes.noteNames[0]}${spec.suffix}`,
        category: 'borrowed' as const,
        ...notes,
        functionLabel: 'BORROWED',
        resolutionTargetIds: [spec.resolution],
        usageHint: spec.hint,
        quality: spec.quality,
      };
    });
    return [...secondary, ...borrowed];
  }

  const dominantRoot = key.scalePitchClasses[4] ?? normalizePitchClass(key.tonicPitchClass + 7);
  const dominant = spellChord(dominantRoot, tonicLetter + 4, [0, 4, 7, 10]);
  const fourthRoot = key.scalePitchClasses[3] ?? normalizePitchClass(key.tonicPitchClass + 5);
  const fourth = spellChord(fourthRoot, tonicLetter + 3, [0, 4, 7]);
  const picardy = spellChord(key.tonicPitchClass, tonicLetter, [0, 4, 7]);
  return [
    {
      id: 'harmonic-dominant', degreeIndex: 4, roman: 'V7', symbol: `${dominant.noteNames[0]}7`, category: 'secondary_dominant',
      ...dominant, functionLabel: 'HARMONIC MINOR DOMINANT', resolutionTargetIds: ['core-1'],
      usageHint: '올린 7음을 사용해 단조의 i로 강하게 해결합니다.', quality: 'dominant7',
    },
    {
      id: 'borrowed-major-iv', degreeIndex: 3, roman: 'IV', symbol: fourth.noteNames[0] ?? 'IV', category: 'borrowed',
      ...fourth, functionLabel: 'BORROWED MAJOR IV', resolutionTargetIds: ['core-5', 'core-1'],
      usageHint: '도리안 색채를 더해 V 또는 i로 움직입니다.', quality: 'major',
    },
    {
      id: 'picardy-third', degreeIndex: 0, roman: 'I', symbol: picardy.noteNames[0] ?? 'I', category: 'borrowed',
      ...picardy, functionLabel: 'PICARDY THIRD', resolutionTargetIds: ['core-1'],
      usageHint: '마지막 으뜸화음을 장화음으로 밝혀 마무리합니다.', quality: 'major',
    },
  ];
}

function makeColors(key: KeyContext, chord: ChordSuggestion): ChordSuggestion[] {
  const degree = chord.degreeIndex;
  const baseSeventh = notesFromScale(key, degree, [0, 2, 4, 6]);
  const ninth = notesFromScale(key, degree, [0, 2, 4, 6, 1]);
  const root = baseSeventh.noteNames[0] ?? key.tonicName;
  const common = {
    degreeIndex: degree,
    category: 'color' as const,
    functionLabel: 'COLOR / TENSION',
    resolutionTargetIds: [chord.id],
  };

  if (chord.quality === 'major' || chord.quality === 'major7') {
    const sixNine = notesFromScale(key, degree, [0, 2, 4, 5, 1]);
    return [
      { id: `color-${chord.id}-9`, roman: `${chord.roman}(9)`, symbol: `${root}maj9`, ...common, ...ninth, usageHint: '장7화음의 투명함을 유지하며 9도를 더합니다.', quality: 'major7' },
      { id: `color-${chord.id}-69`, roman: `${chord.roman}(6/9)`, symbol: `${root}6/9`, ...common, ...sixNine, usageHint: '7도 대신 6도와 9도를 사용해 열린 소리를 냅니다.', quality: 'major' },
    ];
  }
  if (chord.quality === 'dominant7') {
    const thirteen = notesFromScale(key, degree, [0, 2, 4, 6, 1, 5]);
    return [
      { id: `color-${chord.id}-9`, roman: `${chord.roman}(9)`, symbol: `${root}9`, ...common, ...ninth, usageHint: '도미넌트의 해결감을 유지하며 9도를 더합니다.', quality: 'dominant7' },
      { id: `color-${chord.id}-13`, roman: `${chord.roman}(13)`, symbol: `${root}13`, ...common, ...thirteen, usageHint: '13도로 밝은 추진력을 더한 뒤 목표 코드로 해결합니다.', quality: 'dominant7' },
    ];
  }
  if (chord.quality === 'half_diminished7' || chord.quality === 'diminished') {
    const eleven = notesFromScale(key, degree, [0, 2, 4, 6, 3]);
    return [
      { id: `color-${chord.id}-11`, roman: `${chord.roman}(11)`, symbol: `${root}m7♭5(add11)`, ...common, ...eleven, usageHint: '반감7의 긴장을 유지하며 다음 코드로 부드럽게 연결합니다.', quality: 'half_diminished7' },
    ];
  }
  const eleven = notesFromScale(key, degree, [0, 2, 4, 6, 1, 3]);
  return [
    { id: `color-${chord.id}-9`, roman: `${chord.roman}(9)`, symbol: `${root}m9`, ...common, ...ninth, usageHint: '단화음의 성격을 유지하며 9도로 공간을 넓힙니다.', quality: 'minor7' },
    { id: `color-${chord.id}-11`, roman: `${chord.roman}(11)`, symbol: `${root}m11`, ...common, ...eleven, usageHint: '9도와 11도를 쌓아 부드러운 확장음을 만듭니다.', quality: 'minor7' },
  ];
}

export function buildHarmonyCatalog(key: KeyContext, view: ChordView): HarmonyCatalog {
  const diatonic = makeDiatonic(key, view);
  const related = makeRelated(key, diatonic);
  return {
    key,
    view,
    diatonic,
    related,
    colorsFor(coreChordId: string): ChordSuggestion[] {
      const chord = diatonic.find((candidate) => candidate.id === coreChordId);
      return chord ? makeColors(key, chord) : [];
    },
  };
}

export const KEY_OPTIONS = Array.from({ length: 12 }, (_, pitchClass) => ({
  pitchClass,
  major: MAJOR_TONICS[pitchClass] ?? 'C',
  minor: MINOR_TONICS[pitchClass] ?? 'C',
}));
