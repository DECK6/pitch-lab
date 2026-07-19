import type { RawPitchResult } from './types';

export interface CapturePacket {
  type: 'pcm';
  buffer: ArrayBuffer;
  audioTimeMs: number;
  sampleRate: number;
  droppedSinceLast: number;
}

export type EngineWorkerInput =
  | { type: 'init'; source: 'light'; sampleRate: number }
  | { type: 'load'; source: 'neural'; sampleRate: number; manifestUrl: string }
  | { type: 'cancel-load' }
  | { type: 'pcm'; buffer: ArrayBuffer; audioTimeMs: number; droppedSinceLast: number }
  | { type: 'dispose' };

export type EngineWorkerOutput =
  | { type: 'ready'; source: 'light' | 'neural'; warmupMs?: number }
  | { type: 'progress'; stage: 'manifest' | 'engine_code' | 'runtime' | 'model' | 'initializing' | 'warmup'; loaded: number; total: number; elapsedMs: number }
  | { type: 'processed'; result: RawPitchResult; buffer: ArrayBuffer }
  | { type: 'error'; message: string; code: string }
  | { type: 'disposed' };
