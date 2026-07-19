declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void;
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

interface CaptureProcessorOptions extends AudioWorkletNodeOptions {
  processorOptions?: {
    hopSize?: number;
    poolSize?: number;
  };
}

class PitchCaptureProcessor extends AudioWorkletProcessor {
  private readonly hopSize: number;
  private readonly available: Float32Array[] = [];
  private current: Float32Array | null = null;
  private offset = 0;
  private bufferStartTime = 0;
  private droppedSamples = 0;

  constructor(options?: CaptureProcessorOptions) {
    super(options);
    this.hopSize = options?.processorOptions?.hopSize ?? 1024;
    const poolSize = options?.processorOptions?.poolSize ?? 4;
    for (let index = 0; index < poolSize; index += 1) this.available.push(new Float32Array(this.hopSize));
    this.current = this.available.pop() ?? null;
    this.port.onmessage = (event: MessageEvent<{ type: string; buffer?: ArrayBuffer }>) => {
      if (event.data.type === 'recycle' && event.data.buffer) this.available.push(new Float32Array(event.data.buffer));
      if (event.data.type === 'reset') {
        this.offset = 0;
        this.droppedSamples = 0;
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const firstChannel = inputs[0]?.[0];
    if (!firstChannel?.length) return true;
    let sourceOffset = 0;

    while (sourceOffset < firstChannel.length) {
      if (!this.current) this.current = this.available.pop() ?? null;
      if (!this.current) {
        this.droppedSamples += firstChannel.length - sourceOffset;
        break;
      }
      if (this.offset === 0) this.bufferStartTime = currentTime + sourceOffset / sampleRate;
      const copyLength = Math.min(this.hopSize - this.offset, firstChannel.length - sourceOffset);
      this.current.set(firstChannel.subarray(sourceOffset, sourceOffset + copyLength), this.offset);
      this.offset += copyLength;
      sourceOffset += copyLength;

      if (this.offset === this.hopSize) {
        const buffer = this.current.buffer;
        this.port.postMessage({
          type: 'pcm',
          buffer,
          audioTimeMs: this.bufferStartTime * 1000,
          sampleRate,
          droppedSinceLast: Math.floor(this.droppedSamples / this.hopSize),
        }, [buffer]);
        this.current = null;
        this.offset = 0;
        this.droppedSamples = 0;
      }
    }
    return true;
  }
}

registerProcessor('pitch-capture', PitchCaptureProcessor);

