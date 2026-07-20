import { midiToFrequency, noteNameForMidi } from '../music/pitch-math';
import { ReferenceTone } from '../piano/reference-tone';

const WHITE_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const PIANO_SEMITONES = 36;
const COMPUTER_KEY_START_OFFSET = 12;
const WHITE_KEY_WIDTH = 68;
const WHITE_KEYS_PER_OCTAVE = 7;

interface ComputerKeyBinding {
  code: string;
  label: string;
  offset: number;
}

const COMPUTER_KEY_PAIRS = [
  ['KeyA', 'A'], ['KeyW', 'W'], ['KeyS', 'S'], ['KeyE', 'E'], ['KeyD', 'D'],
  ['KeyF', 'F'], ['KeyT', 'T'], ['KeyG', 'G'], ['KeyY', 'Y'], ['KeyH', 'H'],
  ['KeyU', 'U'], ['KeyJ', 'J'], ['KeyK', 'K'], ['KeyO', 'O'], ['KeyL', 'L'],
  ['KeyP', 'P'], ['Semicolon', ';'],
] as const;

const COMPUTER_KEY_BINDINGS: ComputerKeyBinding[] = COMPUTER_KEY_PAIRS
  .map(([code, label], offset) => ({ code, label, offset }));

const COMPUTER_KEY_BY_CODE = new Map(COMPUTER_KEY_BINDINGS.map((binding) => [binding.code, binding]));

export class PianoView {
  private startMidi = 48;
  private highlightedPitchClasses = new Set<number>();
  private rootPitchClass: number | null = null;
  private readonly pressedComputerKeys = new Map<string, number>();
  private readonly pressedPitchModKeys = new Set<string>();
  private readonly activeSources = new Map<string, number>();
  private readonly midiHoldCounts = new Map<number, number>();
  private pitchModRangeSemitones = 2;
  private pitchModNormalized = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly tone: ReferenceTone,
    private readonly onRange: (range: string) => void,
  ) {
    this.render();
    this.bindPitchModulation();
    window.addEventListener('keydown', this.handleComputerKeyDown);
    window.addEventListener('keyup', this.handleComputerKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
  }

  shiftOctave(direction: -1 | 1): string {
    const nextStartMidi = Math.max(36, Math.min(60, this.startMidi + direction * 12));
    if (nextStartMidi === this.startMidi) return this.currentRange();
    this.pressedComputerKeys.clear();
    this.releaseActive();
    this.startMidi = nextStartMidi;
    this.render();
    const range = this.currentRange();
    this.onRange(range);
    return range;
  }

  releaseActive(): void {
    const midis = new Set(this.activeSources.values());
    this.activeSources.clear();
    this.midiHoldCounts.clear();
    this.root.querySelectorAll('.piano-key.is-active').forEach((button) => button.classList.remove('is-active'));
    midis.forEach((midi) => this.tone.release(midi));
  }

  setHighlights(pitchClasses: number[], rootPitchClass: number | null): void {
    this.highlightedPitchClasses = new Set(pitchClasses.map((pitchClass) => ((pitchClass % 12) + 12) % 12));
    this.rootPitchClass = rootPitchClass === null ? null : ((rootPitchClass % 12) + 12) % 12;
    this.applyHighlights();
  }

  clearHighlights(): void {
    this.highlightedPitchClasses.clear();
    this.rootPitchClass = null;
    this.applyHighlights();
  }

  private render(): void {
    const endMidi = this.startMidi + PIANO_SEMITONES - 1;
    const whiteMidis: number[] = [];
    const blackNotes: Array<{ midi: number; left: number }> = [];
    let whiteIndex = 0;
    for (let midi = this.startMidi; midi <= endMidi; midi += 1) {
      const pitchClass = ((midi % 12) + 12) % 12;
      if (WHITE_CLASSES.has(pitchClass)) {
        whiteMidis.push(midi);
        whiteIndex += 1;
      } else {
        blackNotes.push({ midi, left: whiteIndex * 68 - 20 });
      }
    }

    this.root.innerHTML = `
      <div class="piano-surface" style="--white-count:${whiteMidis.length}">
        <div class="white-keys">
          ${whiteMidis.map((midi) => this.keyMarkup(midi, false)).join('')}
        </div>
        ${blackNotes.map(({ midi, left }) => `<div class="black-key-slot" style="left:${left}px">${this.keyMarkup(midi, true)}</div>`).join('')}
      </div>`;

    this.root.querySelectorAll<HTMLButtonElement>('.piano-key').forEach((button) => {
      const midi = Number(button.dataset.midi);
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        void this.press(`pointer:${event.pointerId}`, midi, button);
      });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
        button.addEventListener(name, (event) => this.release(`pointer:${event.pointerId}`));
      }
      button.addEventListener('keydown', (event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault();
          void this.press(`button:${midi}:${event.key}`, midi, button);
        }
      });
      button.addEventListener('keyup', (event) => {
        if (event.key === ' ' || event.key === 'Enter') this.release(`button:${midi}:${event.key}`);
      });
      button.addEventListener('blur', () => {
        this.release(`button:${midi}: `);
        this.release(`button:${midi}:Enter`);
      });
    });
    this.applyHighlights();
    this.root.scrollLeft = WHITE_KEY_WIDTH * WHITE_KEYS_PER_OCTAVE;
  }

  private applyHighlights(): void {
    this.root.querySelectorAll<HTMLButtonElement>('.piano-key').forEach((button) => {
      const pitchClass = ((Number(button.dataset.midi) % 12) + 12) % 12;
      const highlighted = this.highlightedPitchClasses.has(pitchClass);
      const root = highlighted && pitchClass === this.rootPitchClass;
      button.classList.toggle('is-chord-tone', highlighted);
      button.classList.toggle('is-chord-root', root);
      if (root) button.dataset.harmony = 'root';
      else if (highlighted) button.dataset.harmony = 'tone';
      else delete button.dataset.harmony;
    });
  }

  private keyMarkup(midi: number, black: boolean): string {
    const label = noteNameForMidi(midi);
    const shortcut = COMPUTER_KEY_BINDINGS.find((binding) => binding.offset === midi - this.startMidi - COMPUTER_KEY_START_OFFSET);
    const shortcutLabel = shortcut ? `, keyboard ${shortcut.label}` : '';
    const shortcutMarkup = shortcut ? `<kbd aria-hidden="true">${shortcut.label}</kbd>` : '';
    return `<button class="piano-key ${black ? 'black-key' : 'white-key'}" type="button" data-midi="${midi}" aria-label="${label}, ${midiToFrequency(midi).toFixed(2)} hertz${shortcutLabel}"><span>${label}</span>${shortcutMarkup}</button>`;
  }

  private readonly handleComputerKeyDown = (event: KeyboardEvent): void => {
    if (this.handlePitchModKeyDown(event)) return;
    if (this.handleOctaveShortcut(event)) return;
    const binding = COMPUTER_KEY_BY_CODE.get(event.code);
    if (!binding || event.repeat || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return;
    const midi = this.startMidi + COMPUTER_KEY_START_OFFSET + binding.offset;
    const button = this.root.querySelector<HTMLButtonElement>(`[data-midi="${midi}"]`);
    if (!button) return;
    event.preventDefault();
    this.pressedComputerKeys.set(event.code, midi);
    void this.press(`computer:${event.code}`, midi, button);
  };

  private readonly handleComputerKeyUp = (event: KeyboardEvent): void => {
    if (this.handlePitchModKeyUp(event)) return;
    const midi = this.pressedComputerKeys.get(event.code);
    if (midi === undefined) return;
    event.preventDefault();
    this.pressedComputerKeys.delete(event.code);
    this.release(`computer:${event.code}`);
  };

  private readonly handleWindowBlur = (): void => {
    this.pressedComputerKeys.clear();
    this.pressedPitchModKeys.clear();
    this.resetPitchMod();
    this.releaseActive();
  };

  private async press(source: string, midi: number, button: HTMLButtonElement): Promise<void> {
    if (this.activeSources.has(source)) return;
    this.activeSources.set(source, midi);
    const holdCount = (this.midiHoldCounts.get(midi) ?? 0) + 1;
    this.midiHoldCounts.set(midi, holdCount);
    if (holdCount > 1) return;
    button.classList.add('is-active');
    try {
      await this.tone.play(midi);
    } catch {
      this.releaseMidi(midi);
    }
  }

  private release(source: string): void {
    const midi = this.activeSources.get(source);
    if (midi === undefined) return;
    this.activeSources.delete(source);
    const holdCount = (this.midiHoldCounts.get(midi) ?? 1) - 1;
    if (holdCount > 0) {
      this.midiHoldCounts.set(midi, holdCount);
      return;
    }
    this.midiHoldCounts.delete(midi);
    this.root.querySelector(`[data-midi="${midi}"]`)?.classList.remove('is-active');
    this.tone.release(midi);
  }

  private releaseMidi(midi: number): void {
    for (const [source, heldMidi] of this.activeSources) {
      if (heldMidi === midi) this.activeSources.delete(source);
    }
    for (const [code, heldMidi] of this.pressedComputerKeys) {
      if (heldMidi === midi) this.pressedComputerKeys.delete(code);
    }
    this.midiHoldCounts.delete(midi);
    this.root.querySelector(`[data-midi="${midi}"]`)?.classList.remove('is-active');
    this.tone.release(midi);
  }

  private handleOctaveShortcut(event: KeyboardEvent): boolean {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return false;
    const direction = event.key === '+' || event.code === 'Equal' || event.code === 'NumpadAdd'
      ? 1
      : event.key === '-' || event.code === 'NumpadSubtract'
        ? -1
        : 0;
    if (direction === 0) return false;
    event.preventDefault();
    this.shiftOctave(direction);
    return true;
  }

  private handlePitchModKeyDown(event: KeyboardEvent): boolean {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return false;
    const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
    if (direction === 0) return false;
    const slider = this.pitchModSlider();
    if (!slider) return false;
    event.preventDefault();
    this.pressedPitchModKeys.add(event.code);
    slider.value = String(Math.max(-100, Math.min(100, Number(slider.value) + direction * 10)));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  private handlePitchModKeyUp(event: KeyboardEvent): boolean {
    if (!this.pressedPitchModKeys.delete(event.code)) return false;
    event.preventDefault();
    if (this.pressedPitchModKeys.size === 0) this.resetPitchMod();
    return true;
  }

  private bindPitchModulation(): void {
    const panel = this.root.closest<HTMLElement>('#reference-piano-panel');
    const slider = panel?.querySelector<HTMLInputElement>('#pitch-mod-control');
    const output = panel?.querySelector<HTMLOutputElement>('#pitch-mod-value');
    const rangeButtons = panel?.querySelectorAll<HTMLButtonElement>('[data-pitch-range]');
    if (!slider || !output || !rangeButtons?.length) return;

    const apply = (): void => {
      this.pitchModNormalized = Number(slider.value);
      const cents = Math.round(this.pitchModNormalized * this.pitchModRangeSemitones);
      const sign = cents > 0 ? '+' : cents < 0 ? '−' : '±';
      output.value = `${sign}${Math.abs(cents)} cent`;
      slider.setAttribute('aria-valuetext', output.value);
      const position = (this.pitchModNormalized + 100) / 2;
      slider.style.setProperty('--pitch-mod-low', `${Math.min(50, position)}%`);
      slider.style.setProperty('--pitch-mod-high', `${Math.max(50, position)}%`);
      this.tone.setPitchBend(cents);
    };
    const reset = (): void => this.resetPitchMod();

    slider.addEventListener('input', apply);
    slider.addEventListener('pointerup', reset);
    slider.addEventListener('pointercancel', reset);
    slider.addEventListener('lostpointercapture', reset);
    slider.addEventListener('blur', reset);
    slider.addEventListener('keyup', (event) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) reset();
    });
    rangeButtons.forEach((button) => button.addEventListener('click', () => {
      this.pitchModRangeSemitones = Number(button.dataset.pitchRange) === 12 ? 12 : 2;
      rangeButtons.forEach((candidate) => candidate.setAttribute('aria-pressed', String(candidate === button)));
      apply();
    }));
    apply();
  }

  private currentRange(): string {
    return `${noteNameForMidi(this.startMidi)}–${noteNameForMidi(this.startMidi + PIANO_SEMITONES - 1)}`;
  }

  private pitchModSlider(): HTMLInputElement | null {
    return this.root.closest<HTMLElement>('#reference-piano-panel')?.querySelector<HTMLInputElement>('#pitch-mod-control') ?? null;
  }

  private resetPitchMod(): void {
    const slider = this.pitchModSlider();
    if (!slider || slider.value === '0') return;
    slider.value = '0';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement && target.id === 'pitch-mod-control') return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
