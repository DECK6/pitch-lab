import { midiToFrequency, noteNameForMidi } from '../music/pitch-math';
import { ReferenceTone } from '../piano/reference-tone';

const WHITE_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);

export class PianoView {
  private startMidi = 48;
  private activeMidi: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly tone: ReferenceTone,
    private readonly onRange: (range: string) => void,
  ) {
    this.render();
  }

  cycleOctave(): string {
    this.startMidi = this.startMidi === 36 ? 48 : this.startMidi === 48 ? 60 : 36;
    this.releaseActive();
    this.render();
    const range = `${noteNameForMidi(this.startMidi)}–${noteNameForMidi(this.startMidi + 23)}`;
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
    const endMidi = this.startMidi + 23;
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
  }

  private keyMarkup(midi: number, black: boolean): string {
    const label = noteNameForMidi(midi);
    return `<button class="piano-key ${black ? 'black-key' : 'white-key'}" type="button" data-midi="${midi}" aria-label="${label}, ${midiToFrequency(midi).toFixed(2)} hertz"><span>${label}</span></button>`;
  }

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
