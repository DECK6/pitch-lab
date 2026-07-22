import captureWorkletUrl from './capture-worklet.ts?worker&url';
import { EngineManager, type NeuralProgress } from './engine-manager';
import { LIGHT_HOP_SIZE } from './signal';
import type { CapturePacket } from './protocol';
import type { AudioSessionState, DeviceDiagnostics, PitchFrame } from './types';

export interface AudioSessionCallbacks {
  onState: (state: AudioSessionState, message?: string) => void;
  onFrame: (frame: PitchFrame) => void;
  onDiagnostics: (diagnostics: DeviceDiagnostics) => void;
  onNeuralProgress: (progress: NeuralProgress) => void;
  onEngine: (source: 'light' | 'neural', message?: string) => void;
}

const preferredAudioConstraints: MediaTrackConstraints & { latency: { ideal: number } } = {
    channelCount: { ideal: 1 },
    echoCancellation: { ideal: false },
    noiseSuppression: { ideal: false },
    autoGainControl: { ideal: false },
    latency: { ideal: 0.02 },
};

const constraints: MediaStreamConstraints = {
  audio: preferredAudioConstraints,
  video: false,
};

export class AudioSession {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sinkGain: GainNode | null = null;
  private engines: EngineManager | null = null;
  private generation = 0;
  private state: AudioSessionState = 'idle';
  private resumeAttempted = false;

  constructor(private readonly callbacks: AudioSessionCallbacks) {
    document.addEventListener('visibilitychange', () => void this.handleVisibility());
  }

  get currentState(): AudioSessionState {
    return this.state;
  }

  get currentEngine(): 'light' | 'neural' {
    return this.engines?.activeSource ?? 'light';
  }

  get currentTimeSeconds(): number | null {
    return this.context?.currentTime ?? null;
  }

  get currentAudioContext(): AudioContext | null {
    return this.context;
  }

  async start(): Promise<void> {
    if (!['idle', 'permission_denied', 'error', 'needs_restart'].includes(this.state)) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      this.setState('error', 'A secure HTTPS page with Web Audio and microphone support is required.');
      return;
    }
    if (this.state === 'needs_restart') await this.stopResources();
    const generation = ++this.generation;
    this.setState('requesting_permission', 'Waiting for microphone permission…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.setState('starting', 'Starting local audio engine…');
      const context = new AudioContext({ latencyHint: 'interactive' });
      this.context = context;
      await context.audioWorklet.addModule(captureWorkletUrl);
      if (generation !== this.generation) return;
      if (context.state === 'suspended') await context.resume();
      if (generation !== this.generation) return;

      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error('No audio track was provided.');
      const settings = track.getSettings();
      const processingActive = settings.echoCancellation === true || settings.noiseSuppression === true || settings.autoGainControl === true;
      this.callbacks.onDiagnostics({
        label: track.label || 'Microphone',
        sampleRate: context.sampleRate,
        channelCount: settings.channelCount ?? null,
        echoCancellation: typeof settings.echoCancellation === 'boolean' ? settings.echoCancellation : null,
        noiseSuppression: typeof settings.noiseSuppression === 'boolean' ? settings.noiseSuppression : null,
        autoGainControl: typeof settings.autoGainControl === 'boolean' ? settings.autoGainControl : null,
        processingActive,
      });

      this.engines = new EngineManager(
        context.sampleRate,
        () => context.currentTime * 1000,
        this.callbacks.onFrame,
        this.callbacks.onNeuralProgress,
        (reason) => this.callbacks.onEngine('light', reason),
      );
      this.sourceNode = context.createMediaStreamSource(stream);
      this.workletNode = new AudioWorkletNode(context, 'pitch-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { hopSize: LIGHT_HOP_SIZE, poolSize: 4 },
      });
      this.sinkGain = context.createGain();
      this.sinkGain.gain.value = 0;
      this.workletNode.port.onmessage = (event: MessageEvent<CapturePacket>) => {
        if (event.data.type !== 'pcm') return;
        this.engines?.push(event.data, (buffer) => this.workletNode?.port.postMessage({ type: 'recycle', buffer }, [buffer]));
      };
      this.sourceNode.connect(this.workletNode).connect(this.sinkGain).connect(context.destination);
      track.addEventListener('ended', () => {
        if (this.state === 'running' || this.state === 'suspended') this.setState('needs_restart', 'The microphone route ended. Tap restart to reconnect.');
      });
      context.addEventListener('statechange', () => {
        if (context.state === 'suspended' && this.state === 'running') this.setState('suspended', 'Audio was suspended.');
      });
      this.resumeAttempted = false;
      this.callbacks.onEngine('light');
      this.setState('running');
    } catch (error) {
      if (generation !== this.generation) return;
      await this.stopResources();
      const domError = error as DOMException;
      if (domError?.name === 'NotAllowedError' || domError?.name === 'SecurityError') {
        this.setState('permission_denied', 'Microphone access was denied. Allow it in browser settings, then retry.');
      } else if (domError?.name === 'NotFoundError' || domError?.name === 'NotReadableError') {
        this.setState('error', 'No available microphone was found, or another app is using it.');
      } else {
        this.setState('error', error instanceof Error ? error.message : 'Could not start audio.');
      }
    }
  }

  cancelStart(): void {
    if (this.state !== 'requesting_permission' && this.state !== 'starting') return;
    this.generation += 1;
    void this.stop();
  }

  async stop(): Promise<void> {
    if (this.state === 'idle' || this.state === 'stopping') return;
    this.generation += 1;
    this.setState('stopping');
    await this.stopResources();
    this.setState('idle');
  }

  async resume(): Promise<void> {
    if (!this.context) return;
    try {
      await this.context.resume();
      this.engines?.markDiscontinuity();
      this.resumeAttempted = false;
      this.setState('running');
    } catch {
      this.setState('needs_resume_tap', 'Tap to resume microphone audio.');
    }
  }

  async selectNeural(): Promise<void> {
    if (!this.engines || this.state !== 'running') {
      this.callbacks.onNeuralProgress({ state: 'error', stage: 'start-mic', loaded: 0, total: 1, elapsedMs: 0, message: 'Start the microphone before loading Neural.' });
      return;
    }
    const manifestUrl = new URL('ai-manifest.json', document.baseURI).href;
    await this.engines.selectNeural(manifestUrl);
  }

  selectLight(): void {
    this.engines?.selectLight();
    this.callbacks.onEngine('light');
  }

  cancelNeural(): void {
    this.engines?.cancelNeural();
  }

  setDetectorGated(gated: boolean): void {
    this.engines?.setGated(gated);
  }

  private async handleVisibility(): Promise<void> {
    if (document.visibilityState !== 'visible' || !this.context || this.state !== 'suspended') return;
    if (this.resumeAttempted) {
      this.setState('needs_resume_tap', 'Tap to resume microphone audio.');
      return;
    }
    this.resumeAttempted = true;
    await this.resume();
  }

  private async stopResources(): Promise<void> {
    this.engines?.dispose();
    this.engines = null;
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.sinkGain?.disconnect();
    this.workletNode = null;
    this.sourceNode = null;
    this.sinkGain = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') await context.close().catch(() => undefined);
  }

  private setState(state: AudioSessionState, message?: string): void {
    this.state = state;
    this.callbacks.onState(state, message);
  }
}
