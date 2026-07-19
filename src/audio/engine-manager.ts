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

class WorkerChannel {
  private inFlight: PendingPacket | null = null;
  private pending: PendingPacket | null = null;
  private dropped = 0;

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
      this.pending.recycle(this.pending.packet.buffer);
      this.dropped += 1 + this.pending.packet.droppedSinceLast;
    }
    this.pending = value;
  }

  dispose(recycleOnly = false): void {
    if (this.pending) this.pending.recycle(this.pending.packet.buffer);
    this.pending = null;
    if (this.inFlight && recycleOnly) this.inFlight.recycle(this.inFlight.packet.buffer);
    this.send({ type: 'dispose' });
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
    const dropped = this.dropped + (current?.packet.droppedSinceLast ?? 0);
    this.dropped = 0;
    this.onResult(message.result, dropped);
    if (this.pending) {
      const next = this.pending;
      this.pending = null;
      this.dispatch(next);
    }
  }
}

export class EngineManager {
  private readonly sessionId = crypto.randomUUID();
  private readonly smoother = new PitchSmoother();
  private light: WorkerChannel;
  private neural: WorkerChannel | null = null;
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
    const worker = new Worker(new URL('./light-worker.ts', import.meta.url), { type: 'module', name: 'pitch-light' });
    this.light = new WorkerChannel('light', worker, (result, dropped) => this.handleResult(result, dropped), (event) => this.handleLightEvent(event));
    this.light.send({ type: 'init', source: 'light', sampleRate });
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
    if (this.neural || this.active === 'neural') return;
    this.onNeuralProgress({ state: 'loading', stage: 'manifest', loaded: 0, total: 1, elapsedMs: 0 });
    const worker = new Worker(new URL('./neural-worker.ts', import.meta.url), { type: 'module', name: 'pitch-neural' });
    const channel = new WorkerChannel('neural', worker, (result, dropped) => this.handleResult(result, dropped), (event) => this.handleNeuralEvent(event));
    this.neural = channel;
    channel.send({ type: 'load', source: 'neural', sampleRate: this.sampleRate, manifestUrl });
  }

  selectLight(reason?: string): void {
    if (this.active !== 'light') {
      this.active = 'light';
      this.discontinuity = true;
      this.smoother.reset();
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
  }

  private handleResult(result: RawPitchResult, dropped: number): void {
    if (result.source !== this.active) return;
    const processingTooSlow = result.source === 'neural' && result.processingMs > 220;
    if (processingTooSlow) {
      this.selectLight(`Neural processing took ${Math.round(result.processingMs)} ms; this device is better suited to Light.`);
      return;
    }
    this.sequence += 1;
    const frame = this.smoother.push(result, {
      sessionId: this.sessionId,
      sequence: this.sequence,
      nowMs: this.clockMs(),
      dropped,
      discontinuity: this.discontinuity,
    });
    this.discontinuity = false;
    this.onFrame(frame);
  }

  private handleLightEvent(event: EngineWorkerOutput): void {
    if (event.type === 'error') this.onFallback(event.message);
  }

  private handleNeuralEvent(event: EngineWorkerOutput): void {
    if (event.type === 'progress') {
      this.onNeuralProgress({ state: 'loading', ...event });
      return;
    }
    if (event.type === 'ready') {
      this.active = 'neural';
      this.discontinuity = true;
      this.smoother.reset();
      this.onNeuralProgress({ state: 'ready', stage: 'ready', loaded: 1, total: 1, elapsedMs: event.warmupMs ?? 0 });
      return;
    }
    if (event.type === 'error') {
      const cancelled = event.code === 'cancelled';
      this.neural?.dispose();
      this.neural = null;
      this.selectLight(cancelled ? 'Neural loading cancelled. Light stayed active.' : event.message);
      this.onNeuralProgress({ state: cancelled ? 'cancelled' : 'error', stage: 'error', loaded: 0, total: 1, elapsedMs: 0, message: event.message });
    }
  }
}

