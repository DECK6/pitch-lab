import type { CapturePacket, EngineWorkerInput, EngineWorkerOutput } from './protocol';
import { PitchSmoother } from './smoothing';
import type { EngineSource, PitchFrame, RawPitchResult } from './types';

export interface NeuralProgress {
  state: 'idle' | 'loading' | 'ready' | 'error' | 'cancelled';
  stage: string;
  loaded: number;
  total: number;
  elapsedMs: number;
  message?: string;
}

interface PendingPacket {
  packet: CapturePacket;
  recycle: (buffer: ArrayBuffer) => void;
}

const MAX_PENDING_SAMPLES = 16_384;

class WorkerChannel {
  private inFlight: PendingPacket | null = null;
  private pending: PendingPacket | null = null;

  constructor(
    readonly source: EngineSource,
    readonly worker: Worker,
    private readonly onResult: (result: RawPitchResult, dropped: number) => void,
    private readonly onEvent: (event: EngineWorkerOutput) => void,
  ) {
    worker.onmessage = (event: MessageEvent<EngineWorkerOutput>) => this.handle(event.data);
    worker.onerror = (event) => this.onEvent({ type: 'error', code: `${source}-worker-crash`, message: event.message || `${source} worker crashed` });
  }

  send(message: EngineWorkerInput, transfer: Transferable[] = []): void {
    this.worker.postMessage(message, transfer);
  }

  push(value: PendingPacket): void {
    if (!this.inFlight) {
      this.dispatch(value);
      return;
    }
    if (this.pending) {
      this.pending = this.mergePending(this.pending, value);
      return;
    }
    this.pending = value;
  }

  dispose(recycleOnly = false): void {
    if (this.pending) this.pending.recycle(this.pending.packet.buffer);
    this.pending = null;
    if (this.inFlight && recycleOnly) this.inFlight.recycle(this.inFlight.packet.buffer);
    this.worker.onmessage = null;
    this.worker.onerror = null;
    try {
      this.send({ type: 'dispose' });
    } catch {
      this.worker.terminate();
      return;
    }
    setTimeout(() => this.worker.terminate(), 500);
  }

  private dispatch(value: PendingPacket): void {
    this.inFlight = value;
    this.send({
      type: 'pcm',
      buffer: value.packet.buffer,
      audioTimeMs: value.packet.audioTimeMs,
      droppedSinceLast: value.packet.droppedSinceLast,
    }, [value.packet.buffer]);
  }

  private handle(message: EngineWorkerOutput): void {
    if (message.type !== 'processed') {
      this.onEvent(message);
      return;
    }
    const current = this.inFlight;
    this.inFlight = null;
    current?.recycle(message.buffer);
    const dropped = current?.packet.droppedSinceLast ?? 0;
    this.onResult(message.result, dropped);
    if (this.pending) {
      const next = this.pending;
      this.pending = null;
      this.dispatch(next);
    }
  }

  private mergePending(previous: PendingPacket, next: PendingPacket): PendingPacket {
    const previousSamples = new Float32Array(previous.packet.buffer);
    const nextSamples = new Float32Array(next.packet.buffer);
    const totalSamples = previousSamples.length + nextSamples.length;
    const keptSamples = Math.min(MAX_PENDING_SAMPLES, totalSamples);
    const omittedSamples = totalSamples - keptSamples;
    const combined = new Float32Array(keptSamples);
    const previousStart = Math.min(previousSamples.length, omittedSamples);
    const keptPrevious = previousSamples.subarray(previousStart);
    combined.set(keptPrevious, 0);
    const nextStart = Math.max(0, omittedSamples - previousSamples.length);
    combined.set(nextSamples.subarray(nextStart), keptPrevious.length);
    previous.recycle(previous.packet.buffer);
    next.recycle(next.packet.buffer);
    return {
      packet: {
        type: 'pcm',
        buffer: combined.buffer,
        audioTimeMs: next.packet.audioTimeMs,
        sampleRate: next.packet.sampleRate,
        droppedSinceLast: previous.packet.droppedSinceLast
          + next.packet.droppedSinceLast
          + Math.ceil(omittedSamples / Math.max(1, nextSamples.length)),
      },
      recycle: () => undefined,
    };
  }
}

export class EngineManager {
  private readonly sessionId = crypto.randomUUID();
  private readonly smoother = new PitchSmoother();
  private light: WorkerChannel;
  private neural: WorkerChannel | null = null;
  private neuralReady = false;
  private neuralLatencySamples: number[] = [];
  private active: EngineSource = 'light';
  private sequence = 0;
  private discontinuity = true;
  private gated = false;

  constructor(
    private readonly sampleRate: number,
    private readonly clockMs: () => number,
    private readonly onFrame: (frame: PitchFrame) => void,
    private readonly onNeuralProgress: (progress: NeuralProgress) => void,
    private readonly onFallback: (reason: string) => void,
  ) {
    this.light = this.createLightChannel();
  }

  get activeSource(): EngineSource {
    return this.active;
  }

  push(packet: CapturePacket, recycle: (buffer: ArrayBuffer) => void): void {
    if (this.gated) {
      recycle(packet.buffer);
      return;
    }
    const channel = this.active === 'neural' ? this.neural : this.light;
    if (!channel) {
      recycle(packet.buffer);
      return;
    }
    channel.push({ packet, recycle });
  }

  async selectNeural(manifestUrl: string): Promise<void> {
    if (this.active === 'neural') return;
    if (this.neural) {
      if (this.neuralReady) this.activateNeural(0);
      return;
    }
    this.onNeuralProgress({ state: 'loading', stage: 'manifest', loaded: 0, total: 1, elapsedMs: 0 });
    const worker = new Worker(new URL('./neural-worker.ts', import.meta.url), { type: 'module', name: 'pitch-neural' });
    const channel = new WorkerChannel('neural', worker, (result, dropped) => this.handleResult(result, dropped), (event) => this.handleNeuralEvent(event));
    this.neural = channel;
    channel.send({ type: 'load', source: 'neural', sampleRate: this.sampleRate, manifestUrl });
  }

  selectLight(reason?: string): void {
    if (this.neural && !this.neuralReady) this.cancelNeural();
    if (this.active !== 'light') {
      this.active = 'light';
      this.discontinuity = true;
      this.smoother.reset();
      this.neuralLatencySamples = [];
    }
    if (reason) this.onFallback(reason);
  }

  cancelNeural(): void {
    if (!this.neural) return;
    this.neural.send({ type: 'cancel-load' });
  }

  setGated(gated: boolean): void {
    if (this.gated === gated) return;
    this.gated = gated;
    this.discontinuity = true;
    this.smoother.reset();
  }

  markDiscontinuity(): void {
    this.discontinuity = true;
    this.smoother.reset();
  }

  dispose(): void {
    this.light.dispose();
    this.neural?.dispose();
    this.neural = null;
    this.neuralReady = false;
    this.neuralLatencySamples = [];
  }

  private handleResult(result: RawPitchResult, dropped: number): void {
    if (result.source !== this.active) return;
    if (result.source === 'neural') {
      this.neuralLatencySamples.push(result.processingMs);
      if (this.neuralLatencySamples.length > 30) this.neuralLatencySamples.shift();
    }
    const neuralP95 = result.source === 'neural' && this.neuralLatencySamples.length >= 10
      ? percentile(this.neuralLatencySamples, 0.95)
      : 0;
    if (neuralP95 > 220) {
      this.selectLight(`Neural sustained processing reached ${Math.round(neuralP95)} ms; this device is better suited to Light.`);
      return;
    }
    this.sequence += 1;
    // Queue backpressure can skip capture hops on slower devices without
    // breaking the audio stream. Treat only explicit route/engine changes as
    // hard discontinuities; otherwise Neural would reset on every result.
    const discontinuity = this.discontinuity;
    const frame = this.smoother.push(result, {
      sessionId: this.sessionId,
      sequence: this.sequence,
      nowMs: this.clockMs(),
      dropped,
      discontinuity,
    });
    this.discontinuity = false;
    this.onFrame(frame);
  }

  private handleLightEvent(event: EngineWorkerOutput): void {
    if (event.type !== 'error') return;
    const failed = this.light;
    this.light = this.createLightChannel();
    failed.dispose();
    this.discontinuity = true;
    this.smoother.reset();
    if (this.active === 'light') this.onFallback(`Light engine restarted after an audio worker error: ${event.message}`);
  }

  private handleNeuralEvent(event: EngineWorkerOutput): void {
    if (event.type === 'progress') {
      this.onNeuralProgress({ state: 'loading', ...event });
      return;
    }
    if (event.type === 'ready') {
      this.neuralReady = true;
      this.activateNeural(event.warmupMs ?? 0);
      return;
    }
    if (event.type === 'error') {
      const cancelled = event.code === 'cancelled';
      this.neural?.dispose();
      this.neural = null;
      this.neuralReady = false;
      this.neuralLatencySamples = [];
      this.selectLight(cancelled ? 'Neural loading cancelled. Light stayed active.' : event.message);
      this.onNeuralProgress({ state: cancelled ? 'cancelled' : 'error', stage: 'error', loaded: 0, total: 1, elapsedMs: 0, message: event.message });
    }
  }

  private activateNeural(warmupMs: number): void {
    this.active = 'neural';
    this.discontinuity = true;
    this.smoother.reset();
    this.neuralLatencySamples = [];
    this.onNeuralProgress({ state: 'ready', stage: 'ready', loaded: 1, total: 1, elapsedMs: warmupMs });
  }

  private createLightChannel(): WorkerChannel {
    const worker = new Worker(new URL('./light-worker.ts', import.meta.url), { type: 'module', name: 'pitch-light' });
    const channel = new WorkerChannel('light', worker, (result, dropped) => this.handleResult(result, dropped), (event) => this.handleLightEvent(event));
    channel.send({ type: 'init', source: 'light', sampleRate: this.sampleRate });
    return channel;
  }
}

function percentile(values: number[], quantile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index] ?? 0;
}
