import { midiToFrequency } from '../music/pitch-math';

interface Voice {
  midi: number;
  oscillator: OscillatorNode;
  gain: GainNode;
}

export class ReferenceTone {
  private context: AudioContext | null = null;
  private current: Voice | null = null;
  private gateTimer: number | null = null;
  private gateGeneration = 0;

  constructor(private readonly onGate: (gated: boolean) => void) {}

  async play(midi: number): Promise<void> {
    const context = this.context ?? new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    if (context.state === 'suspended') await context.resume();
    this.gateGeneration += 1;
    if (this.gateTimer !== null) window.clearTimeout(this.gateTimer);
    this.onGate(true);
    this.fadeCurrent(0.02);

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.005);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    this.current = { midi, oscillator, gain };
  }

  release(midi?: number): void {
    if (!this.current || (midi !== undefined && this.current.midi !== midi)) return;
    const generation = ++this.gateGeneration;
    const voice = this.current;
    this.current = null;
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    voice.oscillator.stop(now + 0.205);
    voice.oscillator.addEventListener('ended', () => {
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }, { once: true });
    this.gateTimer = window.setTimeout(() => {
      if (generation === this.gateGeneration) this.onGate(false);
    }, 500);
  }

  async dispose(): Promise<void> {
    this.gateGeneration += 1;
    if (this.gateTimer !== null) window.clearTimeout(this.gateTimer);
    this.fadeCurrent(0.01);
    this.current = null;
    this.onGate(false);
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') await context.close().catch(() => undefined);
  }

  private fadeCurrent(seconds: number): void {
    const voice = this.current;
    const context = this.context;
    if (!voice || !context) return;
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    voice.oscillator.stop(now + seconds + 0.005);
    voice.oscillator.addEventListener('ended', () => {
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }, { once: true });
  }
}

