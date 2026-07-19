import { midiToFrequency } from '../music/pitch-math';

interface Voice {
  midi: number;
  oscillator: OscillatorNode;
  gain: GainNode;
}

const MAX_TONE_MS = 10_000;
const REFERENCE_TONE_SWITCH_SECONDS = 0.02;
export const REFERENCE_TONE_GAIN = 0.9;
export const REFERENCE_TONE_WAVEFORM: OscillatorType = 'triangle';

export function referenceToneStartDelay(hadCurrentVoice: boolean): number {
  return hadCurrentVoice ? REFERENCE_TONE_SWITCH_SECONDS : 0;
}

export class ReferenceTone {
  private context: AudioContext | null = null;
  private current: Voice | null = null;
  private pendingMidi: number | null = null;
  private gateTimer: number | null = null;
  private safetyTimer: number | null = null;
  private gateGeneration = 0;

  constructor(private readonly onGate: (gated: boolean) => void) {}

  async play(midi: number): Promise<void> {
    const generation = ++this.gateGeneration;
    this.pendingMidi = midi;
    if (this.gateTimer !== null) {
      window.clearTimeout(this.gateTimer);
      this.gateTimer = null;
    }
    if (this.safetyTimer !== null) {
      window.clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
    const context = this.context ?? new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    const hadCurrentVoice = this.fadeCurrent(REFERENCE_TONE_SWITCH_SECONDS);
    if (context.state === 'suspended') await context.resume();
    if (generation !== this.gateGeneration || this.pendingMidi !== midi) return;
    this.pendingMidi = null;
    this.onGate(true);

    const now = context.currentTime;
    const startAt = now + referenceToneStartDelay(hadCurrentVoice);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = REFERENCE_TONE_WAVEFORM;
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(REFERENCE_TONE_GAIN, startAt + 0.005);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(startAt);
    this.current = { midi, oscillator, gain };
    this.safetyTimer = window.setTimeout(() => this.release(midi), MAX_TONE_MS);
  }

  release(midi?: number): void {
    const pendingMatches = this.pendingMidi !== null && (midi === undefined || this.pendingMidi === midi);
    const currentMatches = this.current !== null && (midi === undefined || this.current.midi === midi);
    if (!pendingMatches && !currentMatches) return;
    const generation = ++this.gateGeneration;
    if (pendingMatches) this.pendingMidi = null;
    if (this.safetyTimer !== null) {
      window.clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
    const voice = this.current;
    const context = this.context;
    if (currentMatches && voice && context) {
      this.current = null;
      const now = context.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      voice.oscillator.stop(now + 0.205);
      voice.oscillator.addEventListener('ended', () => {
        voice.oscillator.disconnect();
        voice.gain.disconnect();
      }, { once: true });
    }
    this.gateTimer = window.setTimeout(() => {
      if (generation === this.gateGeneration) {
        this.gateTimer = null;
        this.onGate(false);
      }
    }, 500);
  }

  async dispose(): Promise<void> {
    this.gateGeneration += 1;
    if (this.gateTimer !== null) window.clearTimeout(this.gateTimer);
    if (this.safetyTimer !== null) window.clearTimeout(this.safetyTimer);
    this.pendingMidi = null;
    this.gateTimer = null;
    this.safetyTimer = null;
    this.fadeCurrent(0.01);
    this.current = null;
    this.onGate(false);
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') await context.close().catch(() => undefined);
  }

  private fadeCurrent(seconds: number): boolean {
    const voice = this.current;
    const context = this.context;
    if (!voice || !context) return false;
    this.current = null;
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    voice.oscillator.stop(now + seconds + 0.005);
    voice.oscillator.addEventListener('ended', () => {
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }, { once: true });
    return true;
  }
}
