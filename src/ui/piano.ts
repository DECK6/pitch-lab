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
  private activeMidi: number | null = null;
  private readonly pressedComputerKeys = new Map<string, number>();

  constructor(
    private readonly root: HTMLElement,
    private readonly tone: ReferenceTone,
    private readonly onRange: (range: string) => void,
  ) {
    this.render();
    window.addEventListener('keydown', this.handleComputerKeyDown);
    window.addEventListener('keyup', this.handleComputerKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
  }

  cycleOctave(): string {
    this.startMidi = this.startMidi === 36 ? 48 : this.startMidi === 48 ? 60 : 36;
    this.pressedComputerKeys.clear();
    this.releaseActive();
    this.render();
    const range = `${noteNameForMidi(this.startMidi)}–${noteNameForMidi(this.startMidi + PIANO_SEMITONES - 1)}`;
    this.onRange(range);
    return range;
  }

  releaseActive(): void {
    if (this.activeMidi === null) return;
    this.tone.release(this.activeMidi);
    this.root.querySelector(`[data-midi="${this.activeMidi}"]`)?.classList.remove('is-active');
    this.activeMidi = null;
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
        void this.press(midi, button);
      });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
        button.addEventListener(name, () => this.release(midi, button));
      }
      button.addEventListener('keydown', (event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault();
          void this.press(midi, button);
        }
      });
      button.addEventListener('keyup', (event) => {
        if (event.key === ' ' || event.key === 'Enter') this.release(midi, button);
      });
      button.addEventListener('blur', () => this.release(midi, button));
    });
    this.root.scrollLeft = WHITE_KEY_WIDTH * WHITE_KEYS_PER_OCTAVE;
  }

  private keyMarkup(midi: number, black: boolean): string {
    const label = noteNameForMidi(midi);
    const shortcut = COMPUTER_KEY_BINDINGS.find((binding) => binding.offset === midi - this.startMidi - COMPUTER_KEY_START_OFFSET);
    const shortcutLabel = shortcut ? `, keyboard ${shortcut.label}` : '';
    const shortcutMarkup = shortcut ? `<kbd aria-hidden="true">${shortcut.label}</kbd>` : '';
    return `<button class="piano-key ${black ? 'black-key' : 'white-key'}" type="button" data-midi="${midi}" aria-label="${label}, ${midiToFrequency(midi).toFixed(2)} hertz${shortcutLabel}"><span>${label}</span>${shortcutMarkup}</button>`;
  }

  private readonly handleComputerKeyDown = (event: KeyboardEvent): void => {
    const binding = COMPUTER_KEY_BY_CODE.get(event.code);
    if (!binding || event.repeat || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return;
    const midi = this.startMidi + COMPUTER_KEY_START_OFFSET + binding.offset;
    const button = this.root.querySelector<HTMLButtonElement>(`[data-midi="${midi}"]`);
    if (!button) return;
    event.preventDefault();
    this.pressedComputerKeys.set(event.code, midi);
    void this.press(midi, button);
  };

  private readonly handleComputerKeyUp = (event: KeyboardEvent): void => {
    const midi = this.pressedComputerKeys.get(event.code);
    if (midi === undefined) return;
    event.preventDefault();
    this.pressedComputerKeys.delete(event.code);
    const button = this.root.querySelector<HTMLButtonElement>(`[data-midi="${midi}"]`);
    if (button) this.release(midi, button);
  };

  private readonly handleWindowBlur = (): void => {
    this.pressedComputerKeys.clear();
    this.releaseActive();
  };

  private async press(midi: number, button: HTMLButtonElement): Promise<void> {
    if (this.activeMidi !== null && this.activeMidi !== midi) {
      this.root.querySelector(`[data-midi="${this.activeMidi}"]`)?.classList.remove('is-active');
    }
    this.activeMidi = midi;
    button.classList.add('is-active');
    try {
      await this.tone.play(midi);
    } catch {
      this.tone.release(midi);
      button.classList.remove('is-active');
      if (this.activeMidi === midi) this.activeMidi = null;
    }
  }

  private release(midi: number, button: HTMLButtonElement): void {
    if (this.activeMidi !== midi) return;
    button.classList.remove('is-active');
    this.tone.release(midi);
    this.activeMidi = null;
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
