/// <reference lib="webworker" />
import { StreamingSincResampler } from './resample';
import { clippingRatio, rmsDb } from './signal';
import type { EngineWorkerInput, EngineWorkerOutput } from './protocol';

interface AssetRecord {
  path: string;
  sha256: string;
  rawBytes: number;
}

interface AiManifest {
  model: AssetRecord & {
    input: { name: string; dtype: string; shape: number[] };
    outputs: Array<{ name: string; dtype: string }>;
  };
  runtime: {
    mjs: AssetRecord;
    wasm: AssetRecord;
  };
}

const scope = self as DedicatedWorkerGlobalScope;
let session: import('onnxruntime-web/wasm').InferenceSession | null = null;
let ort: typeof import('onnxruntime-web/wasm') | null = null;
let resampler: StreamingSincResampler | null = null;
let rolling = new Float32Array(4096);
let rollingFilled = 0;
let samplesSinceInference = 0;
let loadAbort: AbortController | null = null;
let cancelled = false;

function post(message: EngineWorkerOutput, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

function resolveAsset(manifestUrl: string, path: string): string {
  return new URL(path, manifestUrl).href;
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchWithProgress(
  url: string,
  expectedBytes: number,
  stage: 'runtime' | 'model',
  signal: AbortSignal,
  started: number,
): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal, cache: 'default' });
  if (!response.ok) throw new Error(`${stage} HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) return response.arrayBuffer();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      post({ type: 'progress', stage, loaded, total: expectedBytes, elapsedMs: performance.now() - started });
    }
  }
  const joined = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined.buffer;
}

async function loadNeural(sampleRate: number, manifestUrl: string): Promise<void> {
  const started = performance.now();
  cancelled = false;
  loadAbort = new AbortController();
  post({ type: 'progress', stage: 'manifest', loaded: 0, total: 1, elapsedMs: 0 });
  const manifestResponse = await fetch(manifestUrl, { signal: loadAbort.signal, cache: 'no-cache' });
  if (!manifestResponse.ok) throw new Error(`manifest HTTP ${manifestResponse.status}`);
  const manifest = await manifestResponse.json() as AiManifest;
  post({ type: 'progress', stage: 'manifest', loaded: 1, total: 1, elapsedMs: performance.now() - started });

  const wasmUrl = resolveAsset(manifestUrl, manifest.runtime.wasm.path);
  const modelUrl = resolveAsset(manifestUrl, manifest.model.path);
  const mjsUrl = resolveAsset(manifestUrl, manifest.runtime.mjs.path);

  const wasmBuffer = await fetchWithProgress(wasmUrl, manifest.runtime.wasm.rawBytes, 'runtime', loadAbort.signal, started);
  const modelBuffer = await fetchWithProgress(modelUrl, manifest.model.rawBytes, 'model', loadAbort.signal, started);
  if (await sha256(wasmBuffer) !== manifest.runtime.wasm.sha256) throw new Error('runtime checksum mismatch');
  if (await sha256(modelBuffer) !== manifest.model.sha256) throw new Error('model checksum mismatch');
  if (cancelled) throw new DOMException('Cancelled', 'AbortError');

  post({ type: 'progress', stage: 'engine_code', loaded: 0, total: 1, elapsedMs: performance.now() - started });
  ort = await import('onnxruntime-web/wasm');
  post({ type: 'progress', stage: 'engine_code', loaded: 1, total: 1, elapsedMs: performance.now() - started });
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = { mjs: mjsUrl, wasm: wasmUrl };
  ort.env.wasm.wasmBinary = wasmBuffer;

  post({ type: 'progress', stage: 'initializing', loaded: 0, total: 1, elapsedMs: performance.now() - started });
  session = await ort.InferenceSession.create(modelBuffer, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  if (!session.inputNames.includes(manifest.model.input.name)) throw new Error(`missing input ${manifest.model.input.name}`);
  for (const output of manifest.model.outputs) if (!session.outputNames.includes(output.name)) throw new Error(`missing output ${output.name}`);
  if (cancelled) {
    await session.release();
    session = null;
    throw new DOMException('Cancelled', 'AbortError');
  }

  post({ type: 'progress', stage: 'warmup', loaded: 0, total: 1, elapsedMs: performance.now() - started });
  const warmup = new Float32Array(4096);
  for (let index = 0; index < warmup.length; index += 1) warmup[index] = 0.2 * Math.sin(2 * Math.PI * 440 * index / 16_000);
  const outputs = await session.run({ input_audio: new ort.Tensor('float32', warmup, [1, warmup.length]) });
  validateOutputs(outputs);
  post({ type: 'progress', stage: 'warmup', loaded: 1, total: 1, elapsedMs: performance.now() - started });

  resampler = new StreamingSincResampler(sampleRate, 16_000, 32);
  rolling = new Float32Array(4096);
  rollingFilled = 0;
  samplesSinceInference = 0;
  post({ type: 'ready', source: 'neural', warmupMs: performance.now() - started });
}

function appendRolling(samples: Float32Array): void {
  if (samples.length >= rolling.length) {
    rolling.set(samples.subarray(samples.length - rolling.length));
    rollingFilled = rolling.length;
    return;
  }
  rolling.copyWithin(0, samples.length);
  rolling.set(samples, rolling.length - samples.length);
  rollingFilled = Math.min(rolling.length, rollingFilled + samples.length);
}

function validateOutputs(outputs: import('onnxruntime-web/wasm').InferenceSession.OnnxValueMapType): void {
  const pitch = outputs.pitch_hz?.data;
  const confidence = outputs.confidence?.data;
  if (!(pitch instanceof Float32Array) || !(confidence instanceof Float32Array) || pitch.length !== confidence.length || pitch.length === 0) {
    throw new Error('SwiftF0 output contract mismatch');
  }
}

async function processPcm(message: Extract<EngineWorkerInput, { type: 'pcm' }>): Promise<void> {
  const started = performance.now();
  const source = new Float32Array(message.buffer);
  const level = rmsDb(source);
  const clipping = clippingRatio(source) >= 0.01;
  let frequencyHz: number | null = null;
  let confidence = 0;

  if (session && ort && resampler) {
    const converted = resampler.push(source);
    appendRolling(converted);
    samplesSinceInference += converted.length;
    if (rollingFilled === rolling.length && samplesSinceInference >= 512) {
      samplesSinceInference %= 512;
      const outputs = await session.run({ input_audio: new ort.Tensor('float32', rolling.slice(), [1, rolling.length]) });
      validateOutputs(outputs);
      const pitch = outputs.pitch_hz?.data as Float32Array;
      const confidences = outputs.confidence?.data as Float32Array;
      const index = Math.max(0, pitch.length - 2);
      const candidate = pitch[index] ?? 0;
      confidence = confidences[index] ?? 0;
      frequencyHz = Number.isFinite(candidate) && candidate > 0 && confidence >= 0.75 ? candidate : null;
      outputs.pitch_hz?.dispose();
      outputs.confidence?.dispose();
    }
  }

  post({
    type: 'processed',
    result: {
      frequencyHz,
      confidence,
      processingMs: performance.now() - started,
      audioTimeMs: message.audioTimeMs,
      rmsDb: level,
      clipping,
      source: 'neural',
    },
    buffer: message.buffer,
  }, [message.buffer]);
}

scope.onmessage = (event: MessageEvent<EngineWorkerInput>) => {
  const message = event.data;
  if (message.type === 'load' && message.source === 'neural') {
    loadNeural(message.sampleRate, message.manifestUrl).catch((error: unknown) => {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      post({ type: 'error', code: aborted ? 'cancelled' : 'neural-load-failed', message: aborted ? 'Neural loading cancelled' : String(error instanceof Error ? error.message : error) });
    });
    return;
  }
  if (message.type === 'cancel-load') {
    cancelled = true;
    loadAbort?.abort();
    return;
  }
  if (message.type === 'dispose') {
    cancelled = true;
    loadAbort?.abort();
    void session?.release().finally(() => {
      session = null;
      post({ type: 'disposed' });
      scope.close();
    });
    return;
  }
  if (message.type === 'pcm') {
    void processPcm(message).catch((error: unknown) => {
      post({ type: 'error', code: 'neural-inference-failed', message: String(error instanceof Error ? error.message : error) });
      post({
        type: 'processed',
        result: { frequencyHz: null, confidence: 0, processingMs: 0, audioTimeMs: message.audioTimeMs, rmsDb: -Infinity, clipping: false, source: 'neural' },
        buffer: message.buffer,
      }, [message.buffer]);
    });
  }
};

