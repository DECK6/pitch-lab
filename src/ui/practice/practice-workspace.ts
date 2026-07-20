import './practice.css';
import type { PitchFrame } from '../../audio/types';
import {
  buildHarmonyCatalog,
  createKeyContext,
  KEY_OPTIONS,
  type ChordSuggestion,
  type ChordView,
  type HarmonyCatalog,
  type ScaleMode,
} from '../../music/theory/harmony';
import { noteNameForMidi } from '../../music/pitch-math';
import { pitchClassesToVoicing, type ReferenceVoiceBank } from '../../piano/reference-voice-bank';
import { TargetComparator, type PracticeEvaluation } from '../../practice/target-comparator';
import type { PianoView } from '../piano';

interface PracticeSettings {
  tonicPitchClass: number;
  mode: ScaleMode;
  view: ChordView;
  selectedCoreId: string;
  selectedChordId: string;
  targetToneIndex: number;
  targetOctave: number;
}

const STORAGE_KEY = 'pitch-lab-practice-v1';
const DEFAULT_SETTINGS: PracticeSettings = {
  tonicPitchClass: 0,
  mode: 'major',
  view: 'seventh',
  selectedCoreId: 'core-1',
  selectedChordId: 'core-1',
  targetToneIndex: 0,
  targetOctave: 4,
};

export class PracticeWorkspace {
  private settings = loadSettings();
  private catalog: HarmonyCatalog;
  private selectedChord: ChordSuggestion;
  private comparator: TargetComparator;
  private active = false;
  private gated = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly tone: ReferenceVoiceBank,
    private readonly piano: PianoView,
  ) {
    this.catalog = this.createCatalog();
    this.selectedChord = this.resolveSelectedChord();
    this.comparator = new TargetComparator(this.targetMidi());
    this.render();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.tone.stopAll();
      this.piano.clearHighlights();
      return;
    }
    this.applyPianoHighlights();
  }

  setGated(gated: boolean): void {
    this.gated = gated;
    if (!gated) return;
    this.comparator.reset();
    this.updateEvaluation(this.comparator.current, 'REFERENCE PLAYING');
  }

  updatePitch(frame: PitchFrame): void {
    if (!this.active) return;
    this.updateEvaluation(this.comparator.push(frame, this.gated));
  }

  reset(status = 'WAITING'): void {
    this.comparator.reset();
    this.updateEvaluation(this.comparator.current, status);
  }

  private createCatalog(): HarmonyCatalog {
    return buildHarmonyCatalog(createKeyContext(this.settings.tonicPitchClass, this.settings.mode), this.settings.view);
  }

  private resolveSelectedChord(): ChordSuggestion {
    const core = this.catalog.diatonic.find((chord) => chord.id === this.settings.selectedCoreId) ?? this.catalog.diatonic[0];
    if (!core) throw new Error('Harmony catalog has no diatonic chords.');
    const all = [...this.catalog.diatonic, ...this.catalog.colorsFor(core.id), ...this.catalog.related];
    const selected = all.find((chord) => chord.id === this.settings.selectedChordId) ?? core;
    this.settings.selectedCoreId = core.id;
    this.settings.selectedChordId = selected.id;
    this.settings.targetToneIndex = Math.min(this.settings.targetToneIndex, selected.pitchClasses.length - 1);
    return selected;
  }

  private render(): void {
    const core = this.catalog.diatonic.find((chord) => chord.id === this.settings.selectedCoreId) ?? this.catalog.diatonic[0];
    if (!core) return;
    const sharedPiano = this.root.querySelector<HTMLElement>('#reference-piano-panel');
    sharedPiano?.remove();
    const colors = this.catalog.colorsFor(core.id);
    const key = this.catalog.key;
    const selectedTargetName = this.selectedChord.noteNames[this.settings.targetToneIndex] ?? this.selectedChord.noteNames[0] ?? key.tonicName;
    this.root.innerHTML = `
      <section class="panel practice-key-panel" aria-labelledby="practice-title">
        <div class="panel-head"><h2 id="practice-title">04 / KEY & HARMONY</h2><span aria-hidden="true">○</span></div>
        <div class="practice-controls">
          <label class="key-select-label"><span>KEY</span><select id="practice-key" aria-label="KEY">
            ${KEY_OPTIONS.map((option) => `<option value="${option.pitchClass}"${option.pitchClass === key.tonicPitchClass ? ' selected' : ''}>${this.settings.mode === 'major' ? option.major : option.minor}</option>`).join('')}
          </select></label>
          <div class="segmented-control" role="group" aria-label="Scale mode">
            <button id="practice-major" type="button" aria-pressed="${this.settings.mode === 'major'}">MAJOR</button>
            <button id="practice-minor" type="button" aria-pressed="${this.settings.mode === 'natural_minor'}">MINOR</button>
          </div>
          <div class="segmented-control" role="group" aria-label="Chord detail">
            <button id="practice-triad" type="button" aria-pressed="${this.settings.view === 'triad'}">TRIAD</button>
            <button id="practice-seventh" type="button" aria-pressed="${this.settings.view === 'seventh'}">7TH</button>
          </div>
          <div class="key-signature-card"><small>ACTIVE KEY</small><strong>${key.tonicName} ${this.settings.mode === 'major' ? 'MAJOR' : 'MINOR'}</strong><span>${key.scaleNoteNames.join(' · ')}</span></div>
        </div>
      </section>

      ${this.laneMarkup('COLOR / TENSION', 'Uses notes from the active key', colors, 'color')}
      ${this.laneMarkup('DIATONIC CORE', 'Seven chords built inside the key', this.catalog.diatonic, 'core')}
      ${this.laneMarkup('RELATED / BORROWED', 'Functional movement and controlled outside color', this.catalog.related, 'related')}

      <div class="practice-detail-grid">
        <section class="panel selected-chord-panel" aria-labelledby="selected-chord-title">
          <div class="panel-head"><h2 id="selected-chord-title">05 / SELECTED CHORD</h2><span aria-hidden="true">○</span></div>
          <div class="selected-chord-body">
            <div class="selected-chord-symbol"><small>${this.selectedChord.roman}</small><strong>${this.selectedChord.symbol}</strong><span>${this.selectedChord.functionLabel}</span></div>
            <div class="selected-chord-copy">
              <div><small>NOTES</small><strong id="selected-chord-notes">${this.selectedChord.noteNames.join(' · ')}</strong></div>
              <div><small>USE</small><p>${this.selectedChord.usageHint}</p></div>
              <div><small>RESOLVE</small><strong>${this.resolutionLabels()}</strong></div>
            </div>
            <div class="audition-controls" aria-label="Chord audition">
              <button id="play-root" type="button">▶ ROOT</button>
              <button id="play-arpeggio" type="button">▶ ARPEGGIO</button>
              <button id="play-chord" type="button">▶ CHORD</button>
            </div>
          </div>
        </section>

        <section class="panel target-panel" aria-labelledby="target-title">
          <div class="panel-head"><h2 id="target-title">06 / CHORD-TONE TARGET</h2><span aria-hidden="true">○</span></div>
          <div class="target-body">
            <div class="target-tone-buttons" role="group" aria-label="Target chord tone">
              ${this.selectedChord.noteNames.map((name, index) => `<button type="button" data-target-index="${index}" aria-pressed="${index === this.settings.targetToneIndex}" aria-label="TARGET ${name}">${name}</button>`).join('')}
            </div>
            <div class="octave-controls"><span>OCTAVE</span><button id="octave-down" type="button" aria-label="Target octave down">−</button><strong id="target-octave">${this.settings.targetOctave}</strong><button id="octave-up" type="button" aria-label="Target octave up">+</button></div>
            <div class="target-readout">
              <div><small>TARGET</small><strong id="practice-target">${selectedTargetName}${this.settings.targetOctave}</strong></div>
              <div><small>ACTUAL</small><strong id="practice-actual">—</strong></div>
              <div><small>OFFSET</small><strong id="practice-cents">— cent</strong></div>
              <div><small>VOICED</small><strong id="practice-coverage">0%</strong></div>
            </div>
            <div id="practice-result" class="practice-result" data-status="waiting" role="status">WAITING</div>
            <p class="practice-hint">Sing one selected chord tone. LOCKED ≤ 15 cent · CLOSE ≤ 35 cent · 600 ms stable window.</p>
          </div>
        </section>
      </div>
      <div id="practice-piano-anchor" class="practice-piano-anchor"></div>`;
    if (sharedPiano) this.get('practice-piano-anchor').append(sharedPiano);
    this.bindControls();
    this.applyPianoHighlights();
    this.updateEvaluation(this.comparator.current);
  }

  private laneMarkup(title: string, description: string, chords: ChordSuggestion[], kind: string): string {
    return `<section class="panel harmony-lane-panel">
      <div class="harmony-lane-head"><div><strong>${title}</strong><small>${description}</small></div><span>${String(chords.length).padStart(2, '0')}</span></div>
      <div class="harmony-lane" data-lane="${kind}">
        ${chords.map((chord) => `<button type="button" class="chord-card${chord.id === this.selectedChord.id ? ' is-selected' : ''}" data-chord-id="${chord.id}" aria-pressed="${chord.id === this.selectedChord.id}" aria-label="${chord.roman} ${chord.symbol}"><small>${chord.roman}</small><strong>${chord.symbol}</strong><span>${chord.noteNames.join(' ')}</span></button>`).join('')}
      </div>
    </section>`;
  }

  private bindControls(): void {
    this.get<HTMLSelectElement>('practice-key').addEventListener('change', (event) => {
      this.settings.tonicPitchClass = Number((event.currentTarget as HTMLSelectElement).value);
      this.resetCatalog();
    });
    this.get('practice-major').addEventListener('click', () => this.changeMode('major'));
    this.get('practice-minor').addEventListener('click', () => this.changeMode('natural_minor'));
    this.get('practice-triad').addEventListener('click', () => this.changeView('triad'));
    this.get('practice-seventh').addEventListener('click', () => this.changeView('seventh'));
    this.root.querySelectorAll<HTMLButtonElement>('[data-chord-id]').forEach((button) => {
      button.addEventListener('click', () => this.selectChord(button.dataset.chordId ?? ''));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-target-index]').forEach((button) => {
      button.addEventListener('click', () => this.selectTarget(Number(button.dataset.targetIndex)));
    });
    this.get('octave-down').addEventListener('click', () => this.changeOctave(-1));
    this.get('octave-up').addEventListener('click', () => this.changeOctave(1));
    this.get('play-root').addEventListener('click', () => void this.playRoot());
    this.get('play-arpeggio').addEventListener('click', () => void this.playArpeggio());
    this.get('play-chord').addEventListener('click', () => void this.playChord());
  }

  private changeMode(mode: ScaleMode): void {
    if (mode === this.settings.mode) return;
    this.settings.mode = mode;
    this.resetCatalog();
  }

  private changeView(view: ChordView): void {
    if (view === this.settings.view) return;
    this.settings.view = view;
    this.resetCatalog();
  }

  private resetCatalog(): void {
    this.settings.selectedCoreId = 'core-1';
    this.settings.selectedChordId = 'core-1';
    this.settings.targetToneIndex = 0;
    this.catalog = this.createCatalog();
    this.selectedChord = this.resolveSelectedChord();
    this.comparator.setTarget(this.targetMidi());
    saveSettings(this.settings);
    this.render();
  }

  private selectChord(chordId: string): void {
    const core = this.catalog.diatonic.find((chord) => chord.id === chordId);
    if (core) this.settings.selectedCoreId = core.id;
    const currentCore = this.catalog.diatonic.find((chord) => chord.id === this.settings.selectedCoreId) ?? this.catalog.diatonic[0];
    if (!currentCore) return;
    const candidates = [...this.catalog.diatonic, ...this.catalog.colorsFor(currentCore.id), ...this.catalog.related];
    const selected = candidates.find((chord) => chord.id === chordId);
    if (!selected) return;
    this.selectedChord = selected;
    this.settings.selectedChordId = selected.id;
    this.settings.targetToneIndex = 0;
    this.comparator.setTarget(this.targetMidi());
    saveSettings(this.settings);
    this.render();
  }

  private selectTarget(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.selectedChord.pitchClasses.length) return;
    this.settings.targetToneIndex = index;
    this.comparator.setTarget(this.targetMidi());
    saveSettings(this.settings);
    this.render();
  }

  private changeOctave(delta: number): void {
    this.settings.targetOctave = Math.max(2, Math.min(5, this.settings.targetOctave + delta));
    this.comparator.setTarget(this.targetMidi());
    saveSettings(this.settings);
    this.render();
  }

  private async playRoot(): Promise<void> {
    await this.tone.playRoot(this.rootMidi()).catch(() => this.showAudioError());
  }

  private async playArpeggio(): Promise<void> {
    await this.tone.playArpeggio(pitchClassesToVoicing(this.selectedChord.pitchClasses)).catch(() => this.showAudioError());
  }

  private async playChord(): Promise<void> {
    await this.tone.playChord(pitchClassesToVoicing(this.selectedChord.pitchClasses)).catch(() => this.showAudioError());
  }

  private rootMidi(): number {
    const pitchClass = this.selectedChord.pitchClasses[0] ?? 0;
    return (this.settings.targetOctave + 1) * 12 + pitchClass;
  }

  private targetMidi(): number {
    const pitchClass = this.selectedChord.pitchClasses[this.settings.targetToneIndex] ?? this.selectedChord.pitchClasses[0] ?? 0;
    return (this.settings.targetOctave + 1) * 12 + pitchClass;
  }

  private applyPianoHighlights(): void {
    if (!this.active) return;
    this.piano.setHighlights(this.selectedChord.pitchClasses, this.selectedChord.pitchClasses[0] ?? null);
  }

  private resolutionLabels(): string {
    return this.selectedChord.resolutionTargetIds
      .map((id) => this.catalog.diatonic.find((chord) => chord.id === id)?.symbol)
      .filter((value): value is string => Boolean(value))
      .join(' / ') || 'COLOR TONE';
  }

  private updateEvaluation(evaluation: PracticeEvaluation, forcedStatus?: string): void {
    const result = this.root.querySelector<HTMLElement>('#practice-result');
    if (!result) return;
    result.dataset.status = forcedStatus ? 'waiting' : evaluation.status;
    result.textContent = forcedStatus ?? evaluation.status.toUpperCase();
    this.setText('practice-coverage', `${Math.round(evaluation.voicedCoverage * 100)}%`);
    this.setText('practice-actual', evaluation.medianFrequencyHz === null ? '—' : this.actualNoteLabel(evaluation.medianFrequencyHz));
    if (evaluation.medianCents === null) {
      this.setText('practice-cents', '— cent');
    } else {
      const rounded = Math.round(evaluation.medianCents);
      const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±';
      this.setText('practice-cents', `${sign}${Math.abs(rounded)} cent`);
    }
  }

  private actualNoteLabel(frequencyHz: number): string {
    const midi = Math.round(69 + 12 * Math.log2(frequencyHz / 440));
    const pitchClass = ((midi % 12) + 12) % 12;
    const chordIndex = this.selectedChord.pitchClasses.indexOf(pitchClass);
    const scaleIndex = this.catalog.key.scalePitchClasses.indexOf(pitchClass);
    const spelling = this.selectedChord.noteNames[chordIndex]
      ?? this.catalog.key.scaleNoteNames[scaleIndex];
    if (!spelling) return noteNameForMidi(midi);
    return `${spelling}${Math.floor(midi / 12) - 1}`;
  }

  private showAudioError(): void {
    const result = this.root.querySelector<HTMLElement>('#practice-result');
    if (result) result.textContent = 'AUDIO ERROR · TAP AGAIN';
  }

  private setText(id: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(`#${id}`);
    if (element) element.textContent = value;
  }

  private get<T extends Element = HTMLElement>(id: string): T {
    const element = this.root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`Missing Practice element #${id}`);
    return element;
  }
}

function loadSettings(): PracticeSettings {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<PracticeSettings> | null;
    if (!parsed) return { ...DEFAULT_SETTINGS };
    return {
      tonicPitchClass: Number.isInteger(parsed.tonicPitchClass) && (parsed.tonicPitchClass ?? -1) >= 0 && (parsed.tonicPitchClass ?? 12) < 12 ? parsed.tonicPitchClass as number : DEFAULT_SETTINGS.tonicPitchClass,
      mode: parsed.mode === 'natural_minor' || parsed.mode === 'major' ? parsed.mode : DEFAULT_SETTINGS.mode,
      view: parsed.view === 'triad' || parsed.view === 'seventh' ? parsed.view : DEFAULT_SETTINGS.view,
      selectedCoreId: typeof parsed.selectedCoreId === 'string' ? parsed.selectedCoreId : DEFAULT_SETTINGS.selectedCoreId,
      selectedChordId: typeof parsed.selectedChordId === 'string' ? parsed.selectedChordId : DEFAULT_SETTINGS.selectedChordId,
      targetToneIndex: Number.isInteger(parsed.targetToneIndex) && (parsed.targetToneIndex ?? -1) >= 0 ? parsed.targetToneIndex as number : 0,
      targetOctave: Number.isInteger(parsed.targetOctave) && (parsed.targetOctave ?? 0) >= 2 && (parsed.targetOctave ?? 9) <= 5 ? parsed.targetOctave as number : 4,
    };
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable in private or embedded browser contexts.
    }
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: PracticeSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Practice remains fully usable when storage is unavailable.
  }
}
