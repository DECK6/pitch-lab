import { brotliCompressSync, gzipSync } from 'node:zlib';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const dist = join(root, 'dist');
const limits = {
  initialRaw: 110_000,
  initialCompressed: 40_000,
  practiceRaw: 140_000,
  practiceCompressed: 50_000,
  scoreRaw: 180_000,
  scoreCompressed: 60_000,
  omrRaw: 1_800_000,
  omrCompressed: 600_000,
  neuralRaw: 15_000_000,
  neuralCompressed: 12_000_000,
};

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  }));
  return nested.flat();
}

const files = await filesUnder(dist);
const rows = [];
for (const path of files) {
  if (path.endsWith('.map')) continue;
  const data = await readFile(path);
  const name = relative(dist, path);
  rows.push({
    name,
    raw: (await stat(path)).size,
    gzip: gzipSync(data, { level: 9 }).byteLength,
    brotli: brotliCompressSync(data).byteLength,
  });
}

const isNeural = ({ name }) => /(^|\/)(ort|models)\/|ai-manifest|neural-worker|ort[.-]wasm|onnxruntime/i.test(name);
const isPractice = ({ name }) => /(^|\/)practice-workspace[^/]*\.(?:js|css)$/i.test(name);
const isOmr = ({ name }) => /(^|\/)(pdf-omr|pdf\.worker\.min)[^/]*\.js$/i.test(name);
const isScore = ({ name }) => /(^|\/)(score-workspace|musicxml-import)[^/]*\.(?:js|css)$/i.test(name);
const neural = rows.filter(isNeural);
const omr = rows.filter((row) => !isNeural(row) && isOmr(row));
const score = rows.filter((row) => !isNeural(row) && !isOmr(row) && isScore(row));
const practice = rows.filter((row) => !isNeural(row) && !isOmr(row) && !isScore(row) && isPractice(row));
const initial = rows.filter((row) => !isNeural(row) && !isOmr(row) && !isScore(row) && !isPractice(row));
const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);
const report = {
  generatedAt: new Date().toISOString(),
  initial: { rawBytes: sum(initial, 'raw'), gzipBytes: sum(initial, 'gzip'), brotliBytes: sum(initial, 'brotli'), files: initial },
  practice: { rawBytes: sum(practice, 'raw'), gzipBytes: sum(practice, 'gzip'), brotliBytes: sum(practice, 'brotli'), files: practice },
  score: { rawBytes: sum(score, 'raw'), gzipBytes: sum(score, 'gzip'), brotliBytes: sum(score, 'brotli'), files: score },
  omr: { rawBytes: sum(omr, 'raw'), gzipBytes: sum(omr, 'gzip'), brotliBytes: sum(omr, 'brotli'), files: omr },
  neural: { rawBytes: sum(neural, 'raw'), gzipBytes: sum(neural, 'gzip'), brotliBytes: sum(neural, 'brotli'), files: neural },
  limits,
};

await writeFile(join(dist, 'bundle-report.json'), `${JSON.stringify(report, null, 2)}\n`);

const compressedInitial = Math.min(report.initial.gzipBytes, report.initial.brotliBytes);
const compressedPractice = Math.min(report.practice.gzipBytes, report.practice.brotliBytes);
const compressedScore = Math.min(report.score.gzipBytes, report.score.brotliBytes);
const compressedOmr = Math.min(report.omr.gzipBytes, report.omr.brotliBytes);
const compressedNeural = Math.min(report.neural.gzipBytes, report.neural.brotliBytes);
const failures = [];
if (report.initial.rawBytes > limits.initialRaw) failures.push(`initial raw ${report.initial.rawBytes} > ${limits.initialRaw}`);
if (compressedInitial > limits.initialCompressed) failures.push(`initial compressed ${compressedInitial} > ${limits.initialCompressed}`);
if (report.practice.rawBytes > limits.practiceRaw) failures.push(`practice raw ${report.practice.rawBytes} > ${limits.practiceRaw}`);
if (compressedPractice > limits.practiceCompressed) failures.push(`practice compressed ${compressedPractice} > ${limits.practiceCompressed}`);
if (report.score.rawBytes > limits.scoreRaw) failures.push(`score raw ${report.score.rawBytes} > ${limits.scoreRaw}`);
if (compressedScore > limits.scoreCompressed) failures.push(`score compressed ${compressedScore} > ${limits.scoreCompressed}`);
if (report.omr.rawBytes > limits.omrRaw) failures.push(`OMR raw ${report.omr.rawBytes} > ${limits.omrRaw}`);
if (compressedOmr > limits.omrCompressed) failures.push(`OMR compressed ${compressedOmr} > ${limits.omrCompressed}`);
if (report.neural.rawBytes > limits.neuralRaw) failures.push(`neural raw ${report.neural.rawBytes} > ${limits.neuralRaw}`);
if (compressedNeural > limits.neuralCompressed) failures.push(`neural compressed ${compressedNeural} > ${limits.neuralCompressed}`);

const unexpectedOrt = neural.filter(({ name }) => /jsep|asyncify|jspi|webgpu|webgl|training/i.test(name));
if (unexpectedOrt.length) failures.push(`unexpected ORT backends: ${unexpectedOrt.map(({ name }) => name).join(', ')}`);

console.table([
  { graph: 'initial', rawKB: Math.round(report.initial.rawBytes / 1000), gzipKB: Math.round(report.initial.gzipBytes / 1000), brotliKB: Math.round(report.initial.brotliBytes / 1000) },
  { graph: 'practice', rawKB: Math.round(report.practice.rawBytes / 1000), gzipKB: Math.round(report.practice.gzipBytes / 1000), brotliKB: Math.round(report.practice.brotliBytes / 1000) },
  { graph: 'score', rawKB: Math.round(report.score.rawBytes / 1000), gzipKB: Math.round(report.score.gzipBytes / 1000), brotliKB: Math.round(report.score.brotliBytes / 1000) },
  { graph: 'pdf-omr', rawKB: Math.round(report.omr.rawBytes / 1000), gzipKB: Math.round(report.omr.gzipBytes / 1000), brotliKB: Math.round(report.omr.brotliBytes / 1000) },
  { graph: 'neural', rawKB: Math.round(report.neural.rawBytes / 1000), gzipKB: Math.round(report.neural.gzipBytes / 1000), brotliKB: Math.round(report.neural.brotliBytes / 1000) },
]);

if (failures.length) {
  throw new Error(`Bundle budget failed:\n- ${failures.join('\n- ')}`);
}
