import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const output = resolve('.cache/fixtures/a4-440hz.wav');
const sampleRate = 48_000;
const seconds = 8;
const samples = sampleRate * seconds;
const dataBytes = samples * 2;
const buffer = Buffer.alloc(44 + dataBytes);

buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataBytes, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(dataBytes, 40);

for (let index = 0; index < samples; index += 1) {
  const time = index / sampleRate;
  const fadeIn = Math.min(1, time / 0.15);
  const fadeOut = Math.min(1, (seconds - time) / 0.15);
  const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
  const voiceLike = 0.2 * Math.sin(2 * Math.PI * 440 * time) + 0.06 * Math.sin(2 * Math.PI * 880 * time) + 0.025 * Math.sin(2 * Math.PI * 1320 * time);
  buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, voiceLike * envelope)) * 32767), 44 + index * 2);
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, buffer);
console.log(`Generated ${output}`);

