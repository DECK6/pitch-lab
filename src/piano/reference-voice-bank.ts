import { midiToFrequency } from '../music/pitch-math';

interface Voice {
  midi: number;
  oscillator: OscillatorNode;
  gain: GainNode;
  held: boolean;
}

export const MAX_REFERENCE_VOICES = 6;
export const REFERENCE_TONE_GAIN = 0.9;
export const REFERENCE_TONE_WAVEFORM: OscillatorType = 'triangle';
const REFERENCE_TONE_SWITCH_SECONDS = 0.02;
const RELEASE_SECONDS = 0.2;
export const REFERENCE_GATE_TAIL_MS = 300;
const MAX_TONE_MS = 10_000;

export function referenceToneStartDelay(hadCurrentVoice: boolean): number {
  return hadCurrentVoice ? REFERENCE_TONE_SWITCH_SECONDS : 0;
}

export function normalizedVoiceGain(voiceCount: number): number {
  const bounded = Math.max(1, Math.min(MAX_REFERENCE_VOICES, Math.round(voiceCount)));
  return REFERENCE_TONE_GAIN / Math.sqrt(bounded);
}

export function pitchClassesToVoicing(pitchClasses: number[]): number[] {
  const unique: number[] = [];
  for (const pitchClass of pitchClasses) {
    const normalized = ((Math.round(pitchClass) % 12) + 12) % 12;
    if (!unique.includes(normalized)) unique.push(normalized);
    if (unique.length === MAX_REFERENCE_VOICES) break;
  }
  if (unique.length === 0) return [];
  const rootMidi = 48 + (unique[0] ?? 0);
  let previous = rootMidi - 1;
  return unique.map((pitchClass) => {
    let midi = 48 + pitchClass;
    while (midi <= previous) midi += 12;
    previous = midi;
    return midi;
  });
}

export class ReferenceVoiceBank {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private readonly voices = new Set<Voice>();
  private readonly pendingMidis = new Set<number>();
  private readonly pendingHeldNotes = new Map<number, number>();
  private readonly heldSafetyTimers = new Map<number, number>();
  private gateTimer: number | null = null;
  private safetyTimer: number | null = null;
  private generation = 0;
  private heldToken = 0;
  private gated = false;
  private pitchBendCents = 0;

  constructor(private readonly onGate: (gated: boolean) => void) {}

  async play(midi: number): Promise<void> {
    const roundedMidi = Math.round(midi);
    if (this.pendingHeldNotes.has(roundedMidi) || [...this.voices].some((voice) => voice.held && voice.midi === roundedMidi)) return;
    this.interruptAudition();
    if (this.voices.size + this.pendingHeldNotes.size >= MAX_REFERENCE_VOICES) return;
    const token = ++this.heldToken;
    this.pendingHeldNotes.set(roundedMidi, token);
    try {
      const context = await this.ensureContext();
      if (this.pendingHeldNotes.get(roundedMidi) !== token) return;
      if (context.state === 'suspended') await context.resume();
      if (this.pendingHeldNotes.get(roundedMidi) !== token) return;
      this.pendingHeldNotes.delete(roundedMidi);
      if (this.voices.size >= MAX_REFERENCE_VOICES) return;
      this.cancelGateOff();
      this.setGate(true);
      this.startVoice(context, roundedMidi, context.currentTime, null, normalizedVoiceGain(this.voices.size + 1), true);
      this.clearHeldSafetyTimer(roundedMidi);
      this.heldSafetyTimers.set(roundedMidi, window.setTimeout(() => this.release(roundedMidi), MAX_TONE_MS));
    } catch (error) {
      if (this.pendingHeldNotes.get(roundedMidi) === token) this.pendingHeldNotes.delete(roundedMidi);
      this.release(roundedMidi);
      throw error;
    }
  }

  setPitchBend(cents: number): void {
    this.pitchBendCents = Math.max(-1_200, Math.min(1_200, Number.isFinite(cents) ? cents : 0));
    const now = this.context?.currentTime ?? 0;
    this.voices.forEach((voice) => voice.oscillator.detune.setValueAtTime(this.pitchBendCents, now));
  }

  async playRoot(midi: number, durationMs = 900): Promise<void> {
    await this.playVoicing([midi], durationMs);
  }

  async playChord(midis: number[], durationMs = 1_100): Promise<void> {
    await this.playVoicing(midis.slice(0, MAX_REFERENCE_VOICES), durationMs);
  }

  async playArpeggio(midis: number[], stepMs = 145, durationMs = 1_350): Promise<void> {
    const selected = midis.slice(0, MAX_REFERENCE_VOICES);
    if (selected.length === 0) return;
    const generation = this.beginPlayback(selected);
    try {
      const context = await this.ensureContext();
      if (generation !== this.generation) return;
      if (context.state === 'suspended') await context.resume();
      if (generation !== this.generation) return;
      this.pendingMidis.clear();
      this.setGate(true);
      const startAt = context.currentTime;
      const releaseAt = startAt + durationMs / 1000;
      const gain = normalizedVoiceGain(Math.min(3, selected.length));
      selected.forEach((midi, index) => this.startVoice(context, midi, startAt + index * stepMs / 1000, releaseAt, gain, false));
      this.scheduleTimedRelease(durationMs + RELEASE_SECONDS * 1000);
    } catch (error) {
      this.release();
      throw error;
    }
  }

  release(midi?: number): void {
    if (midi !== undefined) {
      const roundedMidi = Math.round(midi);
      const matching = [...this.voices].filter((voice) => voice.held && voice.midi === roundedMidi);
      const pending = this.pendingHeldNotes.delete(roundedMidi);
      this.clearHeldSafetyTimer(roundedMidi);
      if (matching.length === 0 && !pending) return;
      const context = this.context;
      if (context) matching.forEach((voice) => this.releaseVoice(voice, context.currentTime));
      if (!this.hasSoundOrPending()) this.scheduleGateOff(REFERENCE_GATE_TAIL_MS);
      return;
    }

    const hadSound = this.gated || this.hasSoundOrPending();
    this.generation += 1;
    this.pendingMidis.clear();
    this.pendingHeldNotes.clear();
    this.clearTimers();
    const context = this.context;
    if (context) [...this.voices].forEach((voice) => this.releaseVoice(voice, context.currentTime));
    if (hadSound) this.scheduleGateOff(REFERENCE_GATE_TAIL_MS);
  }

  stopAll(): void {
    this.release();
  }

  async dispose(): Promise<void> {
    this.generation += 1;
    this.pendingMidis.clear();
    this.pendingHeldNotes.clear();
    this.clearTimers();
    const context = this.context;
    if (context) [...this.voices].forEach((voice) => this.releaseVoice(voice, context.currentTime, 0.01));
    this.voices.clear();
    this.setGate(false);
    this.master?.disconnect();
    this.limiter?.disconnect();
    this.master = null;
    this.limiter = null;
    this.context = null;
    this.pitchBendCents = 0;
    if (context && context.state !== 'closed') await context.close().catch(() => undefined);
  }

  private async playVoicing(midis: number[], durationMs: number): Promise<void> {
    const selected = [...new Set(midis.map(Math.round))].slice(0, MAX_REFERENCE_VOICES);
    if (selected.length === 0) return;
    const hadVoices = this.voices.size > 0;
    const generation = this.beginPlayback(selected);
    try {
      const context = await this.ensureContext();
      if (generation !== this.generation) return;
      if (context.state === 'suspended') await context.resume();
      if (generation !== this.generation) return;
      this.pendingMidis.clear();
      this.setGate(true);
      const startAt = context.currentTime + referenceToneStartDelay(hadVoices);
      const releaseAt = durationMs > 0 ? startAt + durationMs / 1000 : null;
      const gain = normalizedVoiceGain(selected.length);
      selected.forEach((midi) => this.startVoice(context, midi, startAt, releaseAt, gain, false));
      if (durationMs > 0) this.scheduleTimedRelease(durationMs + REFERENCE_TONE_SWITCH_SECONDS * 1000 + RELEASE_SECONDS * 1000);
    } catch (error) {
      this.release();
      throw error;
    }
  }

  private beginPlayback(midis: number[]): number {
    const generation = ++this.generation;
    this.pendingMidis.clear();
    this.pendingHeldNotes.clear();
    midis.forEach((midi) => this.pendingMidis.add(midi));
    this.clearTimers();
    const context = this.context;
    if (context) [...this.voices].forEach((voice) => this.releaseVoice(voice, context.currentTime, REFERENCE_TONE_SWITCH_SECONDS));
    return generation;
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.context) {
      const context = new AudioContext({ latencyHint: 'interactive' });
      const master = context.createGain();
      const limiter = context.createDynamicsCompressor();
      master.gain.value = 0.95;
      limiter.threshold.value = -8;
      limiter.knee.value = 5;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.12;
      master.connect(limiter).connect(context.destination);
      this.context = context;
      this.master = master;
      this.limiter = limiter;
    }
    return this.context;
  }

  private startVoice(context: AudioContext, midi: number, startAt: number, releaseAt: number | null, peakGain: number, held: boolean): void {
    const master = this.master;
    if (!master) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const voice = { midi, oscillator, gain, held };
    oscillator.type = REFERENCE_TONE_WAVEFORM;
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), startAt);
    oscillator.detune.setValueAtTime(this.pitchBendCents, startAt);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(peakGain, startAt + 0.008);
    if (releaseAt !== null) {
      gain.gain.setValueAtTime(peakGain, releaseAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + RELEASE_SECONDS);
    }
    oscillator.connect(gain).connect(master);
    oscillator.addEventListener('ended', () => {
      this.voices.delete(voice);
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
    this.voices.add(voice);
    oscillator.start(startAt);
    if (releaseAt !== null) oscillator.stop(releaseAt + RELEASE_SECONDS + 0.01);
  }

  private releaseVoice(voice: Voice, now: number, seconds = RELEASE_SECONDS): void {
    if (!this.voices.delete(voice)) return;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    try {
      voice.oscillator.stop(now + seconds + 0.01);
    } catch {
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }
  }

  private scheduleTimedRelease(delayMs: number): void {
    this.safetyTimer = window.setTimeout(() => {
      this.safetyTimer = null;
      this.voices.clear();
      this.scheduleGateOff(REFERENCE_GATE_TAIL_MS);
    }, delayMs);
  }

  private scheduleGateOff(delayMs: number): void {
    const generation = this.generation;
    this.gateTimer = window.setTimeout(() => {
      if (generation !== this.generation) return;
      this.gateTimer = null;
      if (this.hasSoundOrPending()) return;
      this.setGate(false);
    }, delayMs);
  }

  private clearTimers(): void {
    if (this.gateTimer !== null) window.clearTimeout(this.gateTimer);
    if (this.safetyTimer !== null) window.clearTimeout(this.safetyTimer);
    this.gateTimer = null;
    this.safetyTimer = null;
    this.heldSafetyTimers.forEach((timer) => window.clearTimeout(timer));
    this.heldSafetyTimers.clear();
  }

  private interruptAudition(): void {
    const auditionVoices = [...this.voices].filter((voice) => !voice.held);
    if (this.pendingMidis.size === 0 && auditionVoices.length === 0) return;
    this.generation += 1;
    this.pendingMidis.clear();
    if (this.safetyTimer !== null) window.clearTimeout(this.safetyTimer);
    this.safetyTimer = null;
    const context = this.context;
    if (context) auditionVoices.forEach((voice) => this.releaseVoice(voice, context.currentTime, REFERENCE_TONE_SWITCH_SECONDS));
  }

  private clearHeldSafetyTimer(midi: number): void {
    const timer = this.heldSafetyTimers.get(midi);
    if (timer !== undefined) window.clearTimeout(timer);
    this.heldSafetyTimers.delete(midi);
  }

  private cancelGateOff(): void {
    if (this.gateTimer !== null) window.clearTimeout(this.gateTimer);
    this.gateTimer = null;
  }

  private hasSoundOrPending(): boolean {
    return this.voices.size > 0 || this.pendingMidis.size > 0 || this.pendingHeldNotes.size > 0;
  }

  private setGate(gated: boolean): void {
    if (gated === this.gated) return;
    this.gated = gated;
    this.onGate(gated);
  }
}
