import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_REFERENCE_VOICES,
  REFERENCE_GATE_TAIL_MS,
  ReferenceVoiceBank,
  normalizedVoiceGain,
  pitchClassesToVoicing,
} from '../src/piano/reference-voice-bank';

class FakeAudioParam {
  value = 0;
  setValueAtTime(value: number): this { this.value = value; return this; }
  linearRampToValueAtTime(value: number): this { this.value = value; return this; }
  exponentialRampToValueAtTime(value: number): this { this.value = value; return this; }
  cancelScheduledValues(): this { return this; }
}

class FakeNode {
  connect(): this { return this; }
  disconnect(): void {}
}

class FakeOscillator extends FakeNode {
  readonly frequency = new FakeAudioParam();
  type: OscillatorType = 'sine';
  started = false;
  readonly stopTimes: number[] = [];
  addEventListener(): void {}
  start(): void { this.started = true; }
  stop(time = 0): void {
    if (!this.started) throw new DOMException('stop before start', 'InvalidStateError');
    this.stopTimes.push(time);
  }
}

class FakeAudioContext {
  readonly currentTime = 1;
  readonly destination = new FakeNode();
  readonly oscillators: FakeOscillator[] = [];
  state: AudioContextState = 'running';
  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createGain(): FakeNode & { gain: FakeAudioParam } {
    return Object.assign(new FakeNode(), { gain: new FakeAudioParam() });
  }
  createDynamicsCompressor(): FakeNode & Record<'threshold' | 'knee' | 'ratio' | 'attack' | 'release', FakeAudioParam> {
    return Object.assign(new FakeNode(), {
      threshold: new FakeAudioParam(), knee: new FakeAudioParam(), ratio: new FakeAudioParam(),
      attack: new FakeAudioParam(), release: new FakeAudioParam(),
    });
  }
  async resume(): Promise<void> { this.state = 'running'; }
  async close(): Promise<void> { this.state = 'closed'; }
}

class SuspendedFakeAudioContext extends FakeAudioContext {
  state: AudioContextState = 'suspended';
  private finishResume!: () => void;
  private markResumeRequested!: () => void;
  readonly resumeRequested = new Promise<void>((resolve) => { this.markResumeRequested = resolve; });
  private readonly resumeFinished = new Promise<void>((resolve) => { this.finishResume = resolve; });

  async resume(): Promise<void> {
    this.markResumeRequested();
    await this.resumeFinished;
    this.state = 'running';
  }

  resolveResume(): void {
    this.finishResume();
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('reference voice-bank helpers', () => {
  it('keeps mono loud and reduces each voice as polyphony grows', () => {
    expect(normalizedVoiceGain(1)).toBeCloseTo(0.9);
    expect(normalizedVoiceGain(3)).toBeLessThan(normalizedVoiceGain(2));
    expect(normalizedVoiceGain(6)).toBeLessThan(normalizedVoiceGain(3));
    expect(normalizedVoiceGain(99)).toBe(normalizedVoiceGain(MAX_REFERENCE_VOICES));
  });

  it('creates an ascending compact voicing from ordered pitch classes', () => {
    expect(pitchClassesToVoicing([0, 4, 7, 11])).toEqual([48, 52, 55, 59]);
    expect(pitchClassesToVoicing([9, 0, 4, 7])).toEqual([57, 60, 64, 67]);
  });

  it('deduplicates and caps voices without changing chord order', () => {
    const result = pitchClassesToVoicing([0, 4, 7, 11, 2, 5, 0, 4]);
    expect(result).toEqual([48, 52, 55, 59, 62, 65]);
    expect(result).toHaveLength(MAX_REFERENCE_VOICES);
  });

  it('keeps detector grading gated for a short fixed release tail', () => {
    expect(REFERENCE_GATE_TAIL_MS).toBe(300);
  });

  it('starts every browser oscillator before scheduling its stop', async () => {
    const context = new FakeAudioContext();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('AudioContext', class { constructor() { return context; } });
    const gates: boolean[] = [];
    const bank = new ReferenceVoiceBank((gated) => gates.push(gated));

    await expect(bank.playChord([48, 52, 55, 59], 50)).resolves.toBeUndefined();
    expect(context.oscillators).toHaveLength(4);
    expect(context.oscillators.every((oscillator) => oscillator.started && oscillator.stopTimes.length === 1)).toBe(true);
    expect(gates).toEqual([true]);

    await bank.dispose();
    expect(gates.at(-1)).toBe(false);
  });

  it('does not start a tone after the key is released during context resume', async () => {
    const context = new SuspendedFakeAudioContext();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('AudioContext', class { constructor() { return context; } });
    const gates: boolean[] = [];
    const bank = new ReferenceVoiceBank((gated) => gates.push(gated));

    const playback = bank.play(60);
    await context.resumeRequested;
    bank.release(60);
    context.resolveResume();
    await playback;

    expect(context.oscillators).toHaveLength(0);
    expect(gates).toEqual([]);
    await bank.dispose();
  });
});
