/// <reference lib="webworker" />
import { PitchDetector } from 'pitchy';
import type { EngineWorkerInput, EngineWorkerOutput } from './protocol';
import { analyzePitchWindow, LIGHT_FRAME_SIZE } from './signal';

const scope = self as DedicatedWorkerGlobalScope;
let sampleRate = 48_000;
let detector = PitchDetector.forFloat32Array(LIGHT_FRAME_SIZE);
const frame = new Float32Array(LIGHT_FRAME_SIZE);
let filled = 0;

function post(message: EngineWorkerOutput, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

scope.onmessage = (event: MessageEvent<EngineWorkerInput>) => {
  const message = event.data;
  if (message.type === 'init' && message.source === 'light') {
    sampleRate = message.sampleRate;
    detector = PitchDetector.forFloat32Array(LIGHT_FRAME_SIZE);
    frame.fill(0);
    filled = 0;
    post({ type: 'ready', source: 'light' });
    return;
  }
  if (message.type === 'dispose') {
    post({ type: 'disposed' });
    scope.close();
    return;
  }
  if (message.type !== 'pcm') return;

  const started = performance.now();
  const chunk = new Float32Array(message.buffer);
  if (chunk.length >= frame.length) {
    frame.set(chunk.subarray(chunk.length - frame.length));
    filled = frame.length;
  } else {
    frame.copyWithin(0, chunk.length);
    frame.set(chunk, frame.length - chunk.length);
    filled = Math.min(frame.length, filled + chunk.length);
  }

  const analyzed = filled === frame.length
    ? analyzePitchWindow(frame, sampleRate, detector)
    : { frequencyHz: null, confidence: 0, rmsDb: -Infinity, clipping: false };

  post({
    type: 'processed',
    result: {
      ...analyzed,
      audioTimeMs: message.audioTimeMs,
      processingMs: performance.now() - started,
      source: 'light',
    },
    buffer: message.buffer,
  }, [message.buffer]);
};

