export class StreamingSincResampler {
  private readonly ratio: number;
  private readonly half: number;
  private readonly cutoff: number;
  private buffer = new Float32Array(0);
  private position: number;

  constructor(
    readonly sourceRate: number,
    readonly targetRate = 16_000,
    readonly taps = 32,
  ) {
    if (sourceRate <= 0 || targetRate <= 0 || taps < 8 || taps % 2 !== 0) throw new Error('Invalid resampler configuration');
    this.ratio = sourceRate / targetRate;
    this.half = taps / 2;
    this.cutoff = Math.min(1, targetRate / sourceRate) * 0.94;
    this.position = this.half;
  }

  push(input: Float32Array): Float32Array {
    if (input.length === 0) return new Float32Array(0);
    const joined = new Float32Array(this.buffer.length + input.length);
    joined.set(this.buffer);
    joined.set(input, this.buffer.length);
    this.buffer = joined;

    const output: number[] = [];
    while (this.position + this.half < this.buffer.length) {
      const center = Math.floor(this.position);
      const fraction = this.position - center;
      let value = 0;
      let normalization = 0;
      for (let tap = -this.half + 1; tap <= this.half; tap += 1) {
        const offset = tap - fraction;
        const windowPosition = (tap + this.half - 1) / (this.taps - 1);
        const window = 0.42 - 0.5 * Math.cos(2 * Math.PI * windowPosition) + 0.08 * Math.cos(4 * Math.PI * windowPosition);
        const kernel = this.cutoff * sinc(this.cutoff * offset) * window;
        value += (this.buffer[center + tap] ?? 0) * kernel;
        normalization += kernel;
      }
      output.push(normalization === 0 ? 0 : value / normalization);
      this.position += this.ratio;
    }

    const discard = Math.max(0, Math.floor(this.position) - this.half);
    if (discard > 0) {
      this.buffer = this.buffer.slice(discard);
      this.position -= discard;
    }
    return Float32Array.from(output);
  }

  reset(): void {
    this.buffer = new Float32Array(0);
    this.position = this.half;
  }
}

function sinc(value: number): number {
  if (Math.abs(value) < 1e-8) return 1;
  return Math.sin(Math.PI * value) / (Math.PI * value);
}
