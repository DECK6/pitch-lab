import { AudioSession } from '../audio/audio-session';
import type { NeuralProgress } from '../audio/engine-manager';
import type { AudioSessionState, DeviceDiagnostics, PitchFrame } from '../audio/types';
import { frequencyToNote } from '../music/pitch-math';
import { ReferenceTone } from '../piano/reference-tone';
import { PianoView } from './piano';
import { PitchTrail } from './trail';

const stateLabels: Record<AudioSessionState, string> = {
  idle: 'MIC OFF',
  requesting_permission: 'WAITING FOR PERMISSION',
  starting: 'STARTING',
  running: 'MIC ACTIVE',
  suspended: 'AUDIO SUSPENDED',
  needs_resume_tap: 'TAP TO RESUME MIC',
  needs_restart: 'RESTART MIC',
  permission_denied: 'MIC DENIED',
  stopping: 'STOPPING',
  error: 'MIC ERROR',
};

export class App {
  private readonly session: AudioSession;
  private readonly tone: ReferenceTone;
  private readonly piano: PianoView;
  private readonly trail: PitchTrail;
  private currentState: AudioSessionState = 'idle';
  private gated = false;
  private lastFrameAt = 0;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = shellMarkup();
    this.session = new AudioSession({
      onState: (state, message) => this.updateSessionState(state, message),
      onFrame: (frame) => this.updatePitch(frame),
      onDiagnostics: (diagnostics) => this.updateDiagnostics(diagnostics),
      onNeuralProgress: (progress) => this.updateNeural(progress),
      onEngine: (source, message) => this.updateEngine(source, message),
    });
    this.tone = new ReferenceTone((gated) => {
      this.gated = gated;
      this.session.setDetectorGated(gated);
      const listeningState = this.currentState === 'running' ? 'LISTENING' : stateLabels[this.currentState];
      this.setText('signal-state', gated ? 'REFERENCE PLAYING' : listeningState);
      this.root.classList.toggle('is-reference-playing', gated);
      if (gated) this.clearPitch('REFERENCE PLAYING');
      else this.clearPitch(listeningState);
    });
    this.piano = new PianoView(this.get('piano-keys'), this.tone, (range) => this.setText('octave-value', octaveSummary(range)));
    this.trail = new PitchTrail(this.get<HTMLCanvasElement>('pitch-trail'));
    this.bindControls();
    this.updateSessionState('idle', 'Microphone audio stays on this device.');
  }

  private bindControls(): void {
    this.get<HTMLButtonElement>('mic-button').addEventListener('click', () => {
      if (this.currentState === 'running') void this.session.stop();
      else if (this.currentState === 'requesting_permission' || this.currentState === 'starting') this.session.cancelStart();
      else if (this.currentState === 'suspended' || this.currentState === 'needs_resume_tap') void this.session.resume();
      else void this.session.start();
    });
    this.get<HTMLButtonElement>('engine-light').addEventListener('click', () => this.session.selectLight());
    this.get<HTMLButtonElement>('engine-neural').addEventListener('click', () => void this.session.selectNeural());
    this.get<HTMLButtonElement>('neural-cancel').addEventListener('click', () => this.session.cancelNeural());
    this.get<HTMLButtonElement>('octave-button').addEventListener('click', () => {
      const range = this.piano.cycleOctave();
      this.setText('reference-range', range);
    });
    window.addEventListener('pagehide', () => {
      void this.session.stop();
      void this.tone.dispose();
    });
  }

  private updateSessionState(state: AudioSessionState, message?: string): void {
    this.currentState = state;
    const button = this.get<HTMLButtonElement>('mic-button');
    button.dataset.state = state;
    button.classList.toggle('is-active', state === 'running');
    button.textContent = state === 'running' ? '● STOP MIC' : state === 'requesting_permission' || state === 'starting' ? '× CANCEL' : state === 'suspended' || state === 'needs_resume_tap' ? '▶ RESUME MIC' : '● MIC START';
    if (message) this.announce(message);
    if (state !== 'running' && state !== 'starting') this.clearPitch(message ?? stateLabels[state]);
  }

  private updatePitch(frame: PitchFrame): void {
    if (this.gated) return;
    this.lastFrameAt = performance.now();
    this.setText('signal-db', Number.isFinite(frame.rmsDb) ? `${Math.round(frame.rmsDb)} dB` : '— dB');
    this.setText('confidence-value', frame.confidenceBand.toUpperCase());
    this.setText('latency-value', `${Math.round(frame.frameAgeMs)} ms`);
    this.get<HTMLElement>('level-fill').style.width = `${Math.max(0, Math.min(100, (frame.rmsDb + 60) / 60 * 100))}%`;
    if (frame.clipping) {
      this.clearPitch('CLIPPING · MOVE BACK');
      return;
    }
    if (!frame.voiced || frame.frequencyHz === null) {
      this.clearPitch(frame.rmsDb < -55 ? 'INPUT TOO QUIET' : 'NO STABLE PITCH', false);
      this.trail.push(frame.timestampMs, null, frame.discontinuity);
      return;
    }
    const note = frequencyToNote(frame.frequencyHz);
    if (!note) return;
    this.setText('note-name', note.name);
    this.setText('note-octave', String(note.octave));
    this.setText('frequency-value', `${frame.frequencyHz.toFixed(1)} Hz`);
    const cents = Math.max(-50, Math.min(50, note.cents));
    const sign = cents > 0 ? '+' : cents < 0 ? '−' : '±';
    this.setText('cents-value', `${sign}${Math.abs(Math.round(cents))} cent`);
    const tuning = Math.abs(cents) <= 5 ? 'IN TUNE' : cents < 0 ? 'FLAT' : 'SHARP';
    this.setText('tuning-state', tuning);
    this.setText('signal-state', 'STABLE PITCH');
    this.get<SVGLineElement>('meter-needle').setAttribute('transform', `rotate(${cents * 1.55} 200 158)`);
    this.root.classList.toggle('is-in-tune', tuning === 'IN TUNE');
    this.trail.push(frame.timestampMs, frame.frequencyHz, frame.discontinuity);
  }

  private clearPitch(reason: string, clearTrail = true): void {
    this.setText('note-name', '—');
    this.setText('note-octave', '');
    this.setText('frequency-value', '— Hz');
    this.setText('cents-value', '— cent');
    this.setText('tuning-state', reason);
    this.get<SVGLineElement>('meter-needle').setAttribute('transform', 'rotate(0 200 158)');
    this.root.classList.remove('is-in-tune');
    if (clearTrail && performance.now() - this.lastFrameAt > 300) this.trail?.clear();
  }

  private updateDiagnostics(diagnostics: DeviceDiagnostics): void {
    this.setText('device-name', diagnostics.label);
    this.setText('sample-rate', `${(diagnostics.sampleRate / 1000).toFixed(1)} kHz`);
    this.setText('device-processing', diagnostics.processingActive ? 'DEVICE PROCESSING ACTIVE' : 'RAW REQUESTED');
  }

  private updateEngine(source: 'light' | 'neural', message?: string): void {
    this.get('engine-light').classList.toggle('is-selected', source === 'light');
    this.get('engine-neural').classList.toggle('is-selected', source === 'neural');
    this.setText('engine-value', source === 'light' ? 'LIGHT DSP' : 'NEURAL');
    this.setText('footer-engine', `ENGINE: ${source === 'light' ? 'LIGHT DSP' : 'NEURAL'}`);
    if (message) {
      this.clearPitch(source === 'light' ? 'LIGHT ACTIVE' : 'NEURAL ACTIVE');
      this.announce(message);
    }
  }

  private updateNeural(progress: NeuralProgress): void {
    const panel = this.get('neural-progress');
    panel.hidden = progress.state === 'idle';
    const percent = progress.total > 0 ? Math.round(progress.loaded / progress.total * 100) : 0;
    this.get<HTMLElement>('neural-progress-fill').style.width = `${Math.max(0, Math.min(100, percent))}%`;
    this.setText('neural-stage', progress.state === 'ready' ? 'NEURAL READY' : progress.stage.replaceAll('_', ' ').toUpperCase());
    this.setText('neural-progress-text', progress.state === 'loading' ? `${percent}% · ${Math.round(progress.elapsedMs)} ms` : progress.message ?? `READY · ${Math.round(progress.elapsedMs)} ms`);
    this.get<HTMLButtonElement>('neural-cancel').hidden = progress.state !== 'loading';
    if (progress.state === 'ready') this.updateEngine('neural');
  }

  private announce(message: string): void {
    this.setText('app-message', message);
  }

  private setText(id: string, value: string): void {
    this.get(id).textContent = value;
  }

  private get<T extends Element = HTMLElement>(id: string): T {
    const element = this.root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`Missing UI element #${id}`);
    return element;
  }
}

function octaveSummary(range: string): string {
  return range.match(/\d+/g)?.join('–') ?? range;
}

function shellMarkup(): string {
  return `
    <div class="instrument-shell">
      <header class="topbar">
        <div class="brand-block">
          <span class="brand">PITCH/LAB 01</span>
          <span class="descriptor">VOICE CALIBRATION INSTRUMENT</span>
        </div>
        <button id="mic-button" class="mic-button" type="button">● MIC START</button>
      </header>

      <div class="function-row" aria-label="Instrument status">
        <div class="input-label"><strong>VOICE INPUT / 01</strong><small>sing · see · tune</small></div>
        <div class="function-pad yellow"><strong>TUNER</strong><small>FREE INPUT</small></div>
        <div class="function-pad orange"><strong>METER</strong><small>CENTS</small></div>
        <div class="function-pad blue"><strong>ENGINE</strong><small id="engine-value">LIGHT DSP</small></div>
        <button id="octave-button" class="function-pad mint" type="button"><strong>OCTAVE</strong><small id="octave-value">3–4</small></button>
        <div class="function-pad pink"><strong>TRAIL</strong><small>4 SEC</small></div>
      </div>

      <section class="panel piano-panel" aria-labelledby="piano-title">
        <div class="panel-head"><strong id="piano-title">03 / REFERENCE PIANO</strong><span aria-hidden="true">○</span></div>
        <div class="piano-meta"><div><strong id="reference-range">C3–B4</strong><small>TWO OCTAVE · PURE SINE · USE HEADPHONES TO SING ALONG</small></div><span class="pill">PURE TONE</span></div>
        <div id="piano-keys" class="piano-scroll" aria-label="Two octave reference keyboard"></div>
      </section>

      <div class="main-grid">
        <section class="panel pitch-panel" aria-labelledby="pitch-title">
          <div class="panel-head"><strong id="pitch-title">01 / LIVE PITCH</strong><span aria-hidden="true">○</span></div>
          <div class="pitch-display">
            <div class="note-readout" aria-live="polite"><span id="note-name">—</span><sup id="note-octave"></sup></div>
            <div class="meter-wrap">
              <span id="tuning-state" class="tuning-state">MIC OFF</span>
              <svg class="meter" viewBox="0 0 400 180" role="img" aria-label="Tuning meter from 50 cents flat to 50 cents sharp">
                <path d="M32 158 A168 142 0 0 1 368 158" fill="none" stroke="currentColor" stroke-width="3"/>
                <g class="meter-ticks" stroke="currentColor">
                  <path d="M32 158l10-5M66 88l10 6M126 42l5 11M200 24v14M274 42l-5 11M334 88l-10 6M368 158l-10-5"/>
                </g>
                <line id="meter-needle" class="meter-needle" x1="200" y1="158" x2="200" y2="48"/>
                <text x="24" y="176">♭ −50</text><text x="194" y="176">0</text><text x="340" y="176">+50 ♯</text>
              </svg>
            </div>
            <dl class="pitch-numbers">
              <div><dt>INPUT</dt><dd id="frequency-value">— Hz</dd></div>
              <div><dt>OFFSET</dt><dd id="cents-value">— cent</dd></div>
            </dl>
          </div>
          <div class="trail-block"><span>PITCH TRAIL / LAST 4 SECONDS</span><canvas id="pitch-trail" aria-label="Recent pitch contour"></canvas><div class="trail-axis"><small>−4.0s</small><small>−2.0s</small><small>NOW</small></div></div>
        </section>

        <aside class="panel engine-panel" aria-labelledby="engine-title">
          <div class="panel-head"><strong id="engine-title">02 / DETECTION ENGINE</strong><span aria-hidden="true">○</span></div>
          <div class="engine-controls">
            <button id="engine-light" class="engine-button light is-selected" type="button"><strong>LIGHT DSP</strong><small>default · instant · local</small></button>
            <button id="engine-neural" class="engine-button neural" type="button"><strong>NEURAL</strong><small>optional · up to 15 MB raw</small></button>
          </div>
          <div id="neural-progress" class="neural-progress" hidden>
            <div class="progress-head"><strong id="neural-stage">MODEL READYING</strong><button id="neural-cancel" type="button">CANCEL</button></div>
            <div class="progress-track"><span id="neural-progress-fill"></span></div>
            <small id="neural-progress-text">BROWSER CACHE MAY REUSE</small>
          </div>
          <div class="level-block"><div class="level-label"><span id="signal-state">MIC OFF</span><span id="signal-db">— dB</span></div><div class="level-track"><span id="level-fill"></span></div></div>
          <dl class="diagnostic-grid">
            <div><dt>CONFIDENCE</dt><dd id="confidence-value">NONE</dd></div>
            <div><dt>LATENCY</dt><dd id="latency-value">— ms</dd></div>
            <div><dt>DEVICE</dt><dd id="device-name">NOT CONNECTED</dd></div>
            <div><dt>SAMPLE RATE</dt><dd id="sample-rate">— kHz</dd></div>
          </dl>
          <div class="processing-note" id="device-processing">RAW PROCESSING REQUESTED</div>
          <p class="privacy-copy">AUDIO IS PROCESSED ON THIS DEVICE. PCM IS NOT UPLOADED OR SAVED.</p>
          <p class="model-copy">NEURAL: SwiftF0 v0.1.1 · DSP REFINE · ONNX Runtime Web · MIT</p>
        </aside>
      </div>

      <footer><span>ALL AUDIO PROCESSED ON THIS DEVICE</span><span id="footer-engine">ENGINE: LIGHT DSP</span></footer>
      <div id="app-message" class="sr-status" role="status" aria-live="polite">Microphone audio stays on this device.</div>
    </div>`;
}
