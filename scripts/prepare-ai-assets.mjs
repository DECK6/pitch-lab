import { brotliCompressSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const cacheDir = join(root, '.cache', 'swiftf0');
const modelCachePath = join(cacheDir, 'model.onnx');

const MODEL = {
  version: 'v0.1.1',
  url: 'https://raw.githubusercontent.com/lars76/swift_f0/v0.1.1/swift_f0/model.onnx',
  sha256: 'fa91bb45512b90339cf4b00a599ba8fe3a253c46419fcfe6b46df77a8a8336a5',
  bytes: 399_114,
};

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

async function ensureModel() {
  let data;
  try {
    data = await readFile(modelCachePath);
  } catch {
    const response = await fetch(MODEL.url);
    if (!response.ok) throw new Error(`SwiftF0 download failed: HTTP ${response.status}`);
    data = Buffer.from(await response.arrayBuffer());
    await mkdir(cacheDir, { recursive: true });
    await writeFile(modelCachePath, data);
  }

  const checksum = sha256(data);
  if (checksum !== MODEL.sha256 || data.byteLength !== MODEL.bytes) {
    throw new Error(`SwiftF0 integrity mismatch: ${checksum}, ${data.byteLength} bytes`);
  }
  return data;
}

async function emitHashed(source, targetDirectory, baseName) {
  const data = await readFile(source);
  const hash = sha256(data);
  const extension = source.slice(source.lastIndexOf('.'));
  const fileName = `${baseName}.${hash.slice(0, 12)}${extension}`;
  const target = join(targetDirectory, fileName);
  await mkdir(targetDirectory, { recursive: true });
  await copyFile(source, target);
  return {
    fileName,
    sha256: hash,
    rawBytes: data.byteLength,
    gzipBytes: gzipSync(data, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(data).byteLength,
  };
}

async function emitBuffer(data, targetDirectory, baseName, extension) {
  const hash = sha256(data);
  const fileName = `${baseName}.${hash.slice(0, 12)}.${extension}`;
  await mkdir(targetDirectory, { recursive: true });
  await writeFile(join(targetDirectory, fileName), data);
  return {
    fileName,
    sha256: hash,
    rawBytes: data.byteLength,
    gzipBytes: gzipSync(data, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(data).byteLength,
  };
}

const modelData = await ensureModel();
const ortSource = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const ortTarget = join(publicDir, 'ort');
const modelTarget = join(publicDir, 'models');

const [mjs, wasm, model] = await Promise.all([
  emitHashed(join(ortSource, 'ort-wasm-simd-threaded.mjs'), ortTarget, 'ort-wasm-simd-threaded'),
  emitHashed(join(ortSource, 'ort-wasm-simd-threaded.wasm'), ortTarget, 'ort-wasm-simd-threaded'),
  emitBuffer(modelData, modelTarget, 'swiftf0-v0.1.1', 'onnx'),
]);

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  model: {
    version: MODEL.version,
    license: 'MIT',
    source: MODEL.url,
    path: `models/${model.fileName}`,
    ...model,
    input: { name: 'input_audio', dtype: 'float32', shape: [1, 4096] },
    outputs: [
      { name: 'pitch_hz', dtype: 'float32' },
      { name: 'confidence', dtype: 'float32' },
    ],
  },
  runtime: {
    package: 'onnxruntime-web',
    version: '1.27.0',
    backend: 'wasm',
    mjs: { path: `ort/${mjs.fileName}`, ...mjs },
    wasm: { path: `ort/${wasm.fileName}`, ...wasm },
  },
  total: {
    rawBytes: model.rawBytes + mjs.rawBytes + wasm.rawBytes,
    gzipBytes: model.gzipBytes + mjs.gzipBytes + wasm.gzipBytes,
    brotliBytes: model.brotliBytes + mjs.brotliBytes + wasm.brotliBytes,
  },
};

await mkdir(publicDir, { recursive: true });
await writeFile(join(publicDir, 'ai-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Neural assets: ${(manifest.total.rawBytes / 1_000_000).toFixed(2)} MB raw, ${(manifest.total.brotliBytes / 1_000_000).toFixed(2)} MB Brotli`);

