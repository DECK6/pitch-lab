import type { AudioSessionState, PitchFrame } from '../../audio/types';
import { extractVoiceLines, selectPrimaryVoiceLines } from '../../choir/part-extractor';
import { buildScorePlaybackPlan, ScoreAccompaniment } from '../../game/score-accompaniment';
import { scoreSecondsAtBeat, ScoreGameEngine, type GameSnapshot } from '../../game/score-game';
import { cloneEvents, noteNameForScoreMidi, type ChoirRole, type ScoreDocument, type TargetNoteEvent, type VoiceLine } from '../../score/contracts';
import { DEMO_SCORE_XML } from '../../score/demo-score';
import './score.css';

interface ScoreAudioBridge {
  ensureMicrophone: () => Promise<void>;
  nowSeconds: () => number | null;
  context: () => AudioContext | null;
}

const ROLE_OPTIONS: ChoirRole[] = ['S', 'A', 'T', 'B', 'LINE'];

export class ScoreWorkspace {
  private score: ScoreDocument | null = null;
  private lines: VoiceLine[] = [];
  private primaryLineIds: string[] = [];
  private showAllLines = false;
  private selectedLineId = '';
  private confirmed = false;
  private reviewAccepted = false;
  private statusMessage = 'SELECT A LOCAL SCORE FILE';
  private statusKind: 'idle' | 'busy' | 'ready' | 'error' = 'idle';
  private active = false;
  private game: ScoreGameEngine | null = null;
  private accompaniment: ScoreAccompaniment | null = null;
  private animationFrame = 0;
  private ignoredEvents = new Set<string>();
  private pdfFile: File | null = null;
  private pdfStavesPerSystem: 1 | 2 | 4 = 4;
  private loopEnabled = false;
  private lineOctaveShifts = new Map<string, number>();
  private playbackTempoScale = 1;
  private playbackCountInBeats = 2;
  private guideLevel = 0.85;
  private backingLevel = 0.35;

  constructor(private readonly root: HTMLElement, private readonly audio: ScoreAudioBridge) {
    this.render();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.pauseGame();
  }

  setMicrophoneState(state: AudioSessionState): void {
    if (state === 'running') return;
    if (this.game) this.pauseGame();
    this.setGameStatus(state === 'permission_denied' ? 'MIC PERMISSION REQUIRED' : 'MIC PAUSED');
  }

  updatePitch(frame: PitchFrame): void {
    if (!this.active || !this.game) return;
    const now = this.audio.nowSeconds();
    if (now === null) return;
    const snapshot = this.game.pushPitch(frame, now);
    this.updateGameUi(snapshot);
  }

  private render(): void {
    const selected = this.selectedLine();
    this.root.innerHTML = `
      <section class="panel score-import-panel" aria-labelledby="score-import-title">
        <div class="panel-head"><h2 id="score-import-title">07 / SCORE INPUT</h2><span aria-hidden="true">○</span></div>
        <div class="score-import-grid">
          <label id="score-drop-zone" class="score-drop-zone">
            <input id="score-file" type="file" accept=".musicxml,.xml,.mxl,.pdf,application/vnd.recordare.musicxml,application/vnd.recordare.musicxml+xml,application/pdf">
            <strong>DROP / CHOOSE SCORE</strong>
            <span>MUSICXML · MXL · PRINTED PDF</span>
            <small>LOCAL PROCESSING · NO SCORE OR MIC AUDIO UPLOAD</small>
          </label>
          <div class="score-source-actions">
            <button id="score-demo" type="button">LOAD SATB DEMO</button>
            <div><small>STRUCTURED</small><strong>MUSICXML / MXL</strong><span>exact parts · voices · rhythm</span></div>
            <div><small>EXPERIMENTAL</small><strong>PDF OMR</strong><span>clean print · review required</span></div>
          </div>
        </div>
        <div id="score-import-status" class="score-import-status" data-kind="${this.statusKind}" role="status">${escapeHtml(this.statusMessage)}</div>
      </section>
      ${this.score ? this.loadedScoreMarkup(this.score, selected) : ''}`;
    this.bindBaseControls();
    if (this.score) this.bindLoadedControls();
  }

  private loadedScoreMarkup(score: ScoreDocument, selected: VoiceLine | null): string {
    const events = selected ? selected.events.filter((event) => !this.ignoredEvents.has(event.id)) : [];
    const visibleLines = this.visibleLines();
    const initialKey = score.keyMap[0] ? scoreKeyName(score.keyMap[0].fifths, score.keyMap[0].mode) : 'C MAJOR';
    return `
      <section class="panel score-review-panel" aria-labelledby="score-review-title">
        <div class="panel-head"><h2 id="score-review-title">08 / RECOGNITION REVIEW</h2><span>${score.sourceKind.toUpperCase()}</span></div>
        <div class="score-summary-grid">
          ${score.previewDataUrl ? `<figure class="score-page-preview"><img src="${score.previewDataUrl}" alt="First recognized PDF page"><figcaption>PAGE 01 · LOCAL RASTER</figcaption></figure>` : ''}
          <div class="score-summary-copy">
            <small>${escapeHtml(score.fileName)}</small>
            <h3>${escapeHtml(score.title)}</h3>
            <div class="score-metrics">
              <span><small>MEASURES</small><strong>${score.measureCount}</strong></span>
              <span><small>SATB</small><strong>${this.primaryLineIds.length}</strong></span>
              <span><small>KEY</small><strong>${initialKey}</strong></span>
              <span><small>TEMPO</small><strong>${Math.round(score.tempoMap[0]?.bpm ?? 120)}</strong></span>
              <span><small>EVENTS</small><strong>${this.lines.reduce((sum, line) => sum + line.events.length, 0)}</strong></span>
            </div>
            ${score.sourceKind === 'pdf' ? `<label class="pdf-grouping-label"><span>STAVES / SYSTEM</span><select id="pdf-staves-per-system" aria-label="PDF staves per system">${[1, 2, 4].map((count) => `<option value="${count}"${count === this.pdfStavesPerSystem ? ' selected' : ''}>${count}</option>`).join('')}</select><button id="pdf-regroup" type="button">RECOGNIZE AGAIN</button></label>` : ''}
          </div>
        </div>
        ${score.warnings.length > 0 ? `<ul class="score-warnings">${score.warnings.map((warning) => `<li data-severity="${warning.severity}"><strong>${escapeHtml(warning.code)}</strong><span>${escapeHtml(warning.message)}</span></li>`).join('')}</ul>` : ''}
      </section>

      <section class="panel voice-map-panel" aria-labelledby="voice-map-title">
        <div class="panel-head"><h2 id="voice-map-title">09 / SELECT S · A · T · B</h2><span>ONE SINGER · ONE LINE</span></div>
        <div class="voice-line-list" role="radiogroup" aria-label="Choir voice">
          ${visibleLines.map((line) => this.voiceLineMarkup(line)).join('')}
        </div>
        ${this.lines.length > this.primaryLineIds.length ? `<button id="score-line-view-toggle" class="score-line-view-toggle" type="button">${this.showAllLines ? `SHOW PRIMARY SATB ${this.primaryLineIds.length}` : `SHOW ALL SOURCE CANDIDATES ${this.lines.length}`}</button>` : ''}
        ${selected ? `<div class="voice-confirm-row">
          <label><span>ROLE</span><select id="score-role" aria-label="Selected choir role">${ROLE_OPTIONS.map((role) => `<option value="${role}"${role === selected.suggestedRole ? ' selected' : ''}>${role}</option>`).join('')}</select></label>
          <div class="score-transpose-control"><span>OCTAVE</span><button type="button" data-line-transpose="-12" aria-label="Selected score line octave down">−</button><strong id="score-line-octave">${formatSigned(this.lineOctaveShifts.get(selected.id) ?? 0)}</strong><button type="button" data-line-transpose="12" aria-label="Selected score line octave up">+</button></div>
          <button id="confirm-score-line" class="score-confirm-button" type="button">${this.confirmed ? '✓ LINE CONFIRMED' : 'CONFIRM THIS LINE'}</button>
        </div>` : ''}
      </section>

      ${selected ? this.eventReviewMarkup(selected, events) : ''}
      ${selected ? this.gameMarkup(selected, events) : ''}`;
  }

  private voiceLineMarkup(line: VoiceLine): string {
    const selected = line.id === this.selectedLineId;
    return `<label class="voice-line-card${selected ? ' is-selected' : ''}" data-confidence="${line.confidence}">
      <input type="radio" name="score-line" value="${escapeHtml(line.id)}"${selected ? ' checked' : ''}>
      <span class="voice-role-badge">${line.suggestedRole}</span>
      <span class="voice-line-copy"><strong>${escapeHtml(line.label)}</strong><small>${noteNameForScoreMidi(line.minMidi)}–${noteNameForScoreMidi(line.maxMidi)} · ${line.events.length} NOTES</small><em>${line.confidence.toUpperCase()} · ${escapeHtml(line.reasons.join(' / '))}</em></span>
    </label>`;
  }

  private eventReviewMarkup(selected: VoiceLine, events: TargetNoteEvent[]): string {
    const reviewRows = selected.events.slice(0, 32).map((event) => {
      const ignored = this.ignoredEvents.has(event.id);
      return `<div class="score-event-row${ignored ? ' is-ignored' : ''}" data-score-event="${escapeHtml(event.id)}">
        <span><small>M${event.measure}</small><strong>${noteNameForScoreMidi(event.soundingMidi)}</strong></span>
        <span class="event-stepper"><small>PITCH</small><button type="button" data-event-edit="pitch" data-event-id="${escapeHtml(event.id)}" data-delta="-1" aria-label="${noteNameForScoreMidi(event.soundingMidi)} pitch down">−</button><b>${event.soundingMidi}</b><button type="button" data-event-edit="pitch" data-event-id="${escapeHtml(event.id)}" data-delta="1" aria-label="${noteNameForScoreMidi(event.soundingMidi)} pitch up">+</button></span>
        <span class="event-stepper"><small>BEAT</small><button type="button" data-event-edit="onset" data-event-id="${escapeHtml(event.id)}" data-delta="-0.5">−</button><b>${formatBeat(event.onsetBeat)}</b><button type="button" data-event-edit="onset" data-event-id="${escapeHtml(event.id)}" data-delta="0.5">+</button></span>
        <span class="event-stepper"><small>LENGTH</small><button type="button" data-event-edit="duration" data-event-id="${escapeHtml(event.id)}" data-delta="-0.5">−</button><b>${formatBeat(event.durationBeats)}</b><button type="button" data-event-edit="duration" data-event-id="${escapeHtml(event.id)}" data-delta="0.5">+</button></span>
        <button class="event-ignore-button" type="button" data-event-ignore="${escapeHtml(event.id)}">${ignored ? 'RESTORE' : 'IGNORE'}</button>
      </div>`;
    }).join('');
    return `<section class="panel score-event-review" aria-labelledby="score-event-title">
      <div class="panel-head"><h2 id="score-event-title">10 / NOTE CORRECTION</h2><span>FIRST ${Math.min(32, selected.events.length)} / ${selected.events.length}</span></div>
      <div class="score-event-table">${reviewRows || '<p>NO GRADABLE NOTES IN THIS LINE</p>'}</div>
      ${this.score?.requiresReview ? `<label class="score-review-ack"><input id="score-review-accepted" type="checkbox"${this.reviewAccepted ? ' checked' : ''}><span>${this.score.sourceKind === 'pdf' ? 'I CHECKED THE DETECTED LINE, PITCHES, BEATS, AND LENGTHS.' : 'I CHECKED THE IMPORT WARNINGS, NOTE ORDER, PITCHES, BEATS, AND LENGTHS.'}</span></label>` : '<p class="score-structured-note">STRUCTURED SCORE · PART AND VOICE DATA READ LOCALLY</p>'}
    </section>`;
  }

  private gameMarkup(selected: VoiceLine, events: TargetNoteEvent[]): string {
    const armed = this.confirmed && (!this.score?.requiresReview || this.reviewAccepted) && events.length > 0;
    const laneDuration = scoreLaneDuration(this.score, events);
    return `<section class="panel score-game-panel" aria-labelledby="score-game-title">
      <div class="panel-head"><h2 id="score-game-title">11 / VOICE RUN</h2><span>RHYTHM + PITCH</span></div>
      <div class="score-game-controls">
        <label><span>TEMPO</span><select id="score-tempo-scale" aria-label="Score tempo"><option value="0.5">50%</option><option value="0.75">75%</option><option value="1" selected>100%</option><option value="1.2">120%</option></select></label>
        <label><span>COUNT IN</span><select id="score-count-in" aria-label="Count in beats"><option value="1">1 BEAT</option><option value="2" selected>2 BEATS</option><option value="4">4 BEATS</option></select></label>
        <label class="score-loop-toggle"><input id="score-loop" type="checkbox"><span>LOOP FULL LINE</span></label>
        <label class="score-level-control"><span>SELECTED GUIDE <output id="score-guide-level-value">${Math.round(this.guideLevel * 100)}</output></span><input id="score-guide-level" type="range" min="0" max="100" value="${Math.round(this.guideLevel * 100)}" aria-label="Selected guide level"></label>
        <label class="score-level-control"><span>OTHER PARTS <output id="score-backing-level-value">${Math.round(this.backingLevel * 100)}</output></span><input id="score-backing-level" type="range" min="0" max="100" value="${Math.round(this.backingLevel * 100)}" aria-label="Other parts level"></label>
        <button id="score-game-start" type="button"${armed ? '' : ' disabled'}>${armed ? '▶ START + MIC' : 'CONFIRM LINE FIRST'}</button>
        <button id="score-game-pause" type="button" disabled>Ⅱ PAUSE</button>
        <button id="score-game-restart" type="button" disabled>↺ RESTART</button>
      </div>
      <div class="score-game-readout">
        <div><small>STATE</small><strong id="score-game-state">ARMED</strong></div>
        <div><small>TARGET</small><strong id="score-game-target">${events[0] ? noteNameForScoreMidi(events[0].soundingMidi) : '—'}</strong></div>
        <div><small>KEY</small><strong id="score-game-key">${this.score?.keyMap[0] ? scoreKeyName(this.score.keyMap[0].fifths, this.score.keyMap[0].mode) : 'C MAJOR'}</strong></div>
        <div><small>OFFSET</small><strong id="score-game-cents">— cent</strong></div>
        <div><small>SCORE</small><strong id="score-game-score">000</strong></div>
        <div><small>PERFECT</small><strong id="score-perfect">0</strong></div>
        <div><small>GOOD / MISS</small><strong id="score-good-miss">0 / 0</strong></div>
        <div><small>AUDIO</small><strong id="score-audio-state">GUIDE + BACKING</strong></div>
      </div>
      <div id="score-game-lane" class="score-game-lane" aria-label="Score rhythm game lane">
        <div class="score-lane-surface" style="--score-beats:${laneDuration}">
          ${events.map((event) => this.gameNoteMarkup(event, selected)).join('')}
          <span id="score-game-cursor" class="score-game-cursor" style="left:0%"></span>
        </div>
      </div>
      <p class="score-game-hint">LOCAL MIDI-STYLE SYNTH: THE SELECTED PART PLAYS LOUD AS YOUR GUIDE; OTHER SCORE PARTS PLAY SOFT AS ACCOMPANIMENT. USE HEADPHONES TO KEEP PLAYBACK OUT OF THE MICROPHONE.</p>
    </section>`;
  }

  private gameNoteMarkup(event: TargetNoteEvent, line: VoiceLine): string {
    const beats = scoreLaneDuration(this.score, line.events.filter((candidate) => !this.ignoredEvents.has(candidate.id)));
    const pitchRange = Math.max(12, line.maxMidi - line.minMidi + 6);
    const left = event.onsetBeat / beats * 100;
    const width = Math.max(0.7, event.durationBeats / beats * 100);
    const bottom = (event.soundingMidi - line.minMidi + 3) / pitchRange * 78 + 8;
    return `<span class="score-game-note" data-game-event="${escapeHtml(event.id)}" style="left:${left.toFixed(4)}%;width:${width.toFixed(4)}%;bottom:${bottom.toFixed(2)}%"><b>${noteNameForScoreMidi(event.soundingMidi)}</b><small>M${event.measure}</small></span>`;
  }

  private bindBaseControls(): void {
    const input = this.get<HTMLInputElement>('score-file');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void this.importFile(file);
    });
    this.get('score-demo').addEventListener('click', () => {
      const file = new File([DEMO_SCORE_XML], 'pitchlab-satb-demo.musicxml', { type: 'application/vnd.recordare.musicxml+xml' });
      void this.importFile(file);
    });
    const drop = this.get('score-drop-zone');
    drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('is-dragging'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'));
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      drop.classList.remove('is-dragging');
      const file = event.dataTransfer?.files[0];
      if (file) void this.importFile(file);
    });
  }

  private bindLoadedControls(): void {
    this.root.querySelector('#score-line-view-toggle')?.addEventListener('click', () => {
      this.showAllLines = !this.showAllLines;
      if (!this.showAllLines && !this.primaryLineIds.includes(this.selectedLineId)) {
        this.selectedLineId = this.primaryLineIds[0] ?? '';
        this.invalidateConfirmation();
      }
      this.render();
    });
    this.root.querySelectorAll<HTMLInputElement>('input[name="score-line"]').forEach((input) => {
      input.addEventListener('change', () => {
        this.stopGame();
        this.selectedLineId = input.value;
        this.invalidateConfirmation();
        this.render();
      });
    });
    this.root.querySelector<HTMLSelectElement>('#score-role')?.addEventListener('change', (event) => {
      const line = this.selectedLine();
      if (!line) return;
      line.suggestedRole = (event.currentTarget as HTMLSelectElement).value as ChoirRole;
      this.invalidateConfirmation();
      this.render();
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-line-transpose]').forEach((button) => {
      button.addEventListener('click', () => this.transposeSelectedLine(Number(button.dataset.lineTranspose)));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-event-edit]').forEach((button) => {
      button.addEventListener('click', () => this.editEvent(button.dataset.eventId ?? '', button.dataset.eventEdit ?? '', Number(button.dataset.delta)));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-event-ignore]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.eventIgnore ?? '';
        if (this.ignoredEvents.has(id)) this.ignoredEvents.delete(id); else this.ignoredEvents.add(id);
        this.invalidateConfirmation();
        this.render();
      });
    });
    this.root.querySelector<HTMLInputElement>('#score-review-accepted')?.addEventListener('change', (event) => {
      this.reviewAccepted = (event.currentTarget as HTMLInputElement).checked;
      this.confirmed = false;
      this.render();
    });
    this.root.querySelector('#confirm-score-line')?.addEventListener('click', () => {
      const line = this.selectedLine();
      if (!line || line.events.every((event) => this.ignoredEvents.has(event.id))) return;
      if (this.score?.requiresReview && !this.reviewAccepted) {
        this.statusMessage = 'CHECK THE PDF REVIEW CONFIRMATION FIRST';
        this.statusKind = 'error';
        this.render();
        return;
      }
      this.confirmed = true;
      this.statusMessage = `${line.suggestedRole} LINE ARMED FOR VOICE RUN`;
      this.statusKind = 'ready';
      this.render();
    });
    this.root.querySelector('#score-game-start')?.addEventListener('click', () => void this.startGame());
    this.root.querySelector('#score-game-pause')?.addEventListener('click', () => this.togglePause());
    this.root.querySelector('#score-game-restart')?.addEventListener('click', () => this.restartGame());
    this.root.querySelector<HTMLInputElement>('#score-guide-level')?.addEventListener('input', (event) => {
      this.guideLevel = Number((event.currentTarget as HTMLInputElement).value) / 100;
      this.setText('score-guide-level-value', String(Math.round(this.guideLevel * 100)));
      this.accompaniment?.setLevels({ guide: this.guideLevel, backing: this.backingLevel });
    });
    this.root.querySelector<HTMLInputElement>('#score-backing-level')?.addEventListener('input', (event) => {
      this.backingLevel = Number((event.currentTarget as HTMLInputElement).value) / 100;
      this.setText('score-backing-level-value', String(Math.round(this.backingLevel * 100)));
      this.accompaniment?.setLevels({ guide: this.guideLevel, backing: this.backingLevel });
    });
    this.root.querySelector<HTMLInputElement>('#score-loop')?.addEventListener('change', (event) => {
      this.loopEnabled = (event.currentTarget as HTMLInputElement).checked;
    });
    this.root.querySelector('#pdf-regroup')?.addEventListener('click', () => {
      const count = Number(this.root.querySelector<HTMLSelectElement>('#pdf-staves-per-system')?.value);
      if (!this.pdfFile || (count !== 1 && count !== 2 && count !== 4)) return;
      this.pdfStavesPerSystem = count;
      void this.importPdf(this.pdfFile, count);
    });
  }

  private async importFile(file: File): Promise<void> {
    this.stopGame();
    this.statusKind = 'busy';
    this.statusMessage = `READING ${file.name || 'LOCAL SCORE'}…`;
    this.render();
    try {
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        this.pdfFile = file;
        await this.importPdf(file, this.pdfStavesPerSystem);
        return;
      }
      this.pdfFile = null;
      const { importStructuredScore } = await import('../../score/musicxml-import');
      this.acceptScore(await importStructuredScore(file));
    } catch (error) {
      this.showImportError(error);
    }
  }

  private async importPdf(file: File, stavesPerSystem: 1 | 2 | 4): Promise<void> {
    this.stopGame();
    this.statusKind = 'busy';
    this.statusMessage = 'LOADING LOCAL PDF RECOGNITION…';
    this.render();
    try {
      const { recognizePdfScore } = await import('../../score/pdf-omr');
      const score = await recognizePdfScore(file, {
        stavesPerSystem,
        onProgress: (completed, total) => {
          this.statusMessage = `RECOGNIZING PDF PAGE ${completed} / ${total}`;
          this.setStatus();
        },
      });
      this.acceptScore(score);
    } catch (error) {
      this.showImportError(error);
    }
  }

  private acceptScore(score: ScoreDocument): void {
    this.stopGame();
    this.score = score;
    this.lines = extractVoiceLines(score);
    this.primaryLineIds = selectPrimaryVoiceLines(this.lines).map((line) => line.id);
    this.showAllLines = false;
    this.selectedLineId = this.primaryLineIds[0] ?? this.lines[0]?.id ?? '';
    this.confirmed = false;
    this.reviewAccepted = !score.requiresReview;
    this.ignoredEvents.clear();
    this.lineOctaveShifts.clear();
    this.statusKind = this.lines.length > 0 ? 'ready' : 'error';
    this.statusMessage = this.lines.length > this.primaryLineIds.length
      ? `${this.primaryLineIds.length} PRIMARY SATB LINES READY · ${this.lines.length - this.primaryLineIds.length} EXTRA CANDIDATES HIDDEN`
      : this.lines.length > 0
        ? `${this.lines.length} VOICE LINE${this.lines.length === 1 ? '' : 'S'} READY FOR REVIEW`
        : 'NO MONOPHONIC VOICE LINE FOUND';
    this.render();
  }

  private showImportError(error: unknown): void {
    this.stopGame();
    this.score = null;
    this.lines = [];
    this.primaryLineIds = [];
    this.showAllLines = false;
    this.selectedLineId = '';
    this.statusKind = 'error';
    this.statusMessage = error instanceof Error ? error.message : 'The score could not be recognized.';
    this.render();
  }

  private transposeSelectedLine(delta: number): void {
    const line = this.selectedLine();
    if (!line || !Number.isFinite(delta)) return;
    if (line.events.some((event) => event.writtenMidi + delta < 0 || event.writtenMidi + delta > 127 || event.soundingMidi + delta < 0 || event.soundingMidi + delta > 127)) {
      this.statusKind = 'error';
      this.statusMessage = 'OCTAVE SHIFT EXCEEDS THE MIDI NOTE RANGE';
      this.setStatus();
      return;
    }
    line.events.forEach((event) => {
      event.writtenMidi += delta;
      event.soundingMidi += delta;
    });
    line.minMidi += delta;
    line.maxMidi += delta;
    this.lineOctaveShifts.set(line.id, (this.lineOctaveShifts.get(line.id) ?? 0) + delta / 12);
    this.invalidateConfirmation();
    this.render();
  }

  private editEvent(eventId: string, kind: string, delta: number): void {
    const line = this.selectedLine();
    const event = line?.events.find((candidate) => candidate.id === eventId);
    if (!line || !event || !Number.isFinite(delta)) return;
    if (kind === 'pitch') {
      event.writtenMidi = Math.max(0, Math.min(127, event.writtenMidi + delta));
      event.soundingMidi = Math.max(0, Math.min(127, event.soundingMidi + delta));
      line.minMidi = Math.min(...line.events.map((item) => item.soundingMidi));
      line.maxMidi = Math.max(...line.events.map((item) => item.soundingMidi));
    } else if (kind === 'onset') {
      event.onsetBeat = Math.max(0, event.onsetBeat + delta);
      event.measure = Math.floor(event.onsetBeat / 4) + 1;
      line.events.sort((a, b) => a.onsetBeat - b.onsetBeat || b.soundingMidi - a.soundingMidi);
    } else if (kind === 'duration') {
      event.durationBeats = Math.max(0.25, Math.min(16, event.durationBeats + delta));
    } else return;
    this.invalidateConfirmation();
    this.render();
  }

  private async startGame(): Promise<void> {
    const line = this.selectedLine();
    if (!line || !this.confirmed || (this.score?.requiresReview && !this.reviewAccepted)) return;
    const events = cloneEvents(line.events.filter((event) => !this.ignoredEvents.has(event.id)));
    if (events.length === 0) return;
    this.setGameStatus('STARTING MICROPHONE…');
    try {
      await this.audio.ensureMicrophone();
      const now = this.audio.nowSeconds();
      if (now === null) throw new Error('Microphone audio clock is not available.');
      const tempoScale = Number(this.root.querySelector<HTMLSelectElement>('#score-tempo-scale')?.value ?? 1);
      const countInBeats = Number(this.root.querySelector<HTMLSelectElement>('#score-count-in')?.value ?? 2);
      this.playbackTempoScale = tempoScale;
      this.playbackCountInBeats = countInBeats;
      this.loopEnabled = this.root.querySelector<HTMLInputElement>('#score-loop')?.checked ?? false;
      this.game = new ScoreGameEngine(events, this.score?.tempoMap ?? [{ beat: 0, bpm: 120, measure: 1 }], { tempoScale, countInBeats });
      this.game.start(now);
      this.startScorePlayback(now);
      this.root.querySelector<HTMLButtonElement>('#score-game-pause')?.removeAttribute('disabled');
      this.root.querySelector<HTMLButtonElement>('#score-game-restart')?.removeAttribute('disabled');
      this.startAnimation();
    } catch (error) {
      this.setGameStatus(error instanceof Error ? error.message.toUpperCase() : 'MICROPHONE COULD NOT START');
    }
  }

  private togglePause(): void {
    if (!this.game) return;
    const now = this.audio.nowSeconds();
    if (now === null) return;
    const snapshot = this.game.snapshot(now);
    if (snapshot.phase === 'paused') {
      this.game.resume(now);
      this.startScorePlayback(now, snapshot.beat);
      this.startAnimation();
    } else {
      this.game.pause(now);
      this.accompaniment?.stop();
      this.stopAnimation();
      this.updateGameUi(this.game.snapshot(now));
    }
  }

  private restartGame(): void {
    if (!this.game) {
      void this.startGame();
      return;
    }
    const now = this.audio.nowSeconds();
    if (now === null) return;
    this.game.restart(now);
    this.startScorePlayback(now);
    this.startAnimation();
  }

  private pauseGame(): void {
    if (!this.game) return;
    const now = this.audio.nowSeconds();
    if (now !== null) this.game.pause(now);
    this.accompaniment?.stop();
    this.stopAnimation();
  }

  private stopGame(): void {
    this.game = null;
    this.accompaniment?.stop();
    this.accompaniment = null;
    this.stopAnimation();
  }

  private startAnimation(): void {
    this.stopAnimation();
    const draw = () => {
      if (!this.active || !this.game) return;
      const now = this.audio.nowSeconds();
      if (now === null) return;
      const snapshot = this.game.snapshot(now);
      this.updateGameUi(snapshot);
      if (snapshot.phase === 'finished' && this.loopEnabled) {
        this.game.restart(now);
        this.startScorePlayback(now);
      } else if (snapshot.phase === 'finished') {
        this.accompaniment?.stop();
      }
      if (snapshot.phase !== 'finished' || this.loopEnabled) this.animationFrame = requestAnimationFrame(draw);
    };
    this.animationFrame = requestAnimationFrame(draw);
  }

  private stopAnimation(): void {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
  }

  private updateGameUi(snapshot: GameSnapshot): void {
    const selected = this.selectedLine();
    const duration = selected ? scoreLaneDuration(this.score, selected.events.filter((event) => !this.ignoredEvents.has(event.id))) : Math.max(1, this.score?.durationBeats ?? 1);
    const progress = Math.max(0, Math.min(100, snapshot.beat / duration * 100));
    const cursor = this.root.querySelector<HTMLElement>('#score-game-cursor');
    if (cursor) cursor.style.left = `${progress}%`;
    this.root.querySelectorAll<HTMLElement>('[data-game-event]').forEach((element) => {
      element.classList.toggle('is-active', element.dataset.gameEvent === snapshot.activeEvent?.id);
      const sourceEvent = selected?.events.find((event) => event.id === element.dataset.gameEvent);
      element.classList.toggle('is-passed', Boolean(sourceEvent && snapshot.beat >= sourceEvent.onsetBeat + sourceEvent.durationBeats));
    });
    const state = snapshot.phase === 'count_in' ? `COUNT ${Math.max(1, Math.ceil(-snapshot.beat))}` : snapshot.phase.replace('_', ' ').toUpperCase();
    this.setText('score-game-state', state);
    this.setText('score-game-target', snapshot.activeEvent ? noteNameForScoreMidi(snapshot.activeEvent.soundingMidi) : snapshot.phase === 'finished' ? 'DONE' : '—');
    const currentKey = [...(this.score?.keyMap ?? [])].reverse().find((change) => change.beat <= Math.max(0, snapshot.beat));
    this.setText('score-game-key', currentKey ? scoreKeyName(currentKey.fifths, currentKey.mode) : 'C MAJOR');
    this.setText('score-game-cents', snapshot.activeCents === null ? '— cent' : `${snapshot.activeCents >= 0 ? '+' : '−'}${Math.abs(Math.round(snapshot.activeCents))} cent`);
    this.setText('score-game-score', String(snapshot.score).padStart(3, '0'));
    this.setText('score-perfect', String(snapshot.judgements.perfect));
    this.setText('score-good-miss', `${snapshot.judgements.good} / ${snapshot.judgements.miss}`);
    const pause = this.root.querySelector<HTMLButtonElement>('#score-game-pause');
    if (pause) pause.textContent = snapshot.phase === 'paused' ? '▶ RESUME' : 'Ⅱ PAUSE';
    const lane = this.root.querySelector<HTMLElement>('#score-game-lane');
    const active = this.root.querySelector<HTMLElement>('.score-game-note.is-active');
    if (lane && active) lane.scrollLeft = Math.max(0, active.offsetLeft - lane.clientWidth * 0.35);
  }

  private selectedLine(): VoiceLine | null {
    return this.lines.find((line) => line.id === this.selectedLineId) ?? null;
  }

  private visibleLines(): VoiceLine[] {
    if (this.showAllLines) return this.lines;
    const primaryIds = new Set(this.primaryLineIds);
    return this.lines.filter((line) => primaryIds.has(line.id)).sort((a, b) => this.primaryLineIds.indexOf(a.id) - this.primaryLineIds.indexOf(b.id));
  }

  private startScorePlayback(now: number, fromBeat?: number): void {
    const context = this.audio.context();
    const score = this.score;
    const selected = this.selectedLine();
    if (!context || !score || !selected) return;
    const plan = buildScorePlaybackPlan(score, selected, this.ignoredEvents, this.playbackTempoScale);
    this.accompaniment?.stop();
    this.accompaniment = new ScoreAccompaniment(plan, { guide: this.guideLevel, backing: this.backingLevel });
    const firstTempo = score.tempoMap.find((tempo) => tempo.beat === 0)?.bpm ?? score.tempoMap[0]?.bpm ?? 120;
    const countInSeconds = this.playbackCountInBeats * 60 / (firstTempo * this.playbackTempoScale);
    let scoreOriginTime = now + countInSeconds;
    let minimumScoreSeconds = 0;
    if (fromBeat !== undefined) {
      if (fromBeat < 0) {
        scoreOriginTime = now + -fromBeat * 60 / (firstTempo * this.playbackTempoScale);
      } else {
        minimumScoreSeconds = scoreSecondsAtBeat(fromBeat, score.tempoMap, this.playbackTempoScale);
        scoreOriginTime = now - minimumScoreSeconds;
      }
    }
    this.accompaniment.start(context, scoreOriginTime, minimumScoreSeconds);
    const guideCount = plan.filter((note) => note.kind === 'guide').length;
    const backingCount = plan.length - guideCount;
    this.setText('score-audio-state', `${selected.suggestedRole} GUIDE · ${backingCount} BACKING`);
  }

  private invalidateConfirmation(): void {
    this.stopGame();
    this.confirmed = false;
    if (this.score?.requiresReview) this.reviewAccepted = false;
  }

  private setStatus(): void {
    const status = this.root.querySelector<HTMLElement>('#score-import-status');
    if (!status) return;
    status.dataset.kind = this.statusKind;
    status.textContent = this.statusMessage;
  }

  private setGameStatus(message: string): void {
    const element = this.root.querySelector<HTMLElement>('#score-game-state');
    if (element) element.textContent = message;
  }

  private setText(id: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(`#${id}`);
    if (element) element.textContent = value;
  }

  private get<T extends Element = HTMLElement>(id: string): T {
    const element = this.root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`Missing Score element #${id}`);
    return element;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function formatBeat(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function scoreKeyName(fifths: number, mode: 'major' | 'minor'): string {
  const index = Math.max(-7, Math.min(7, Math.round(fifths))) + 7;
  const major = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];
  const minor = ['A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯'];
  return `${(mode === 'minor' ? minor : major)[index] ?? 'C'} ${mode.toUpperCase()}`;
}

function scoreLaneDuration(score: ScoreDocument | null, events: TargetNoteEvent[]): number {
  return Math.max(4, score?.durationBeats ?? 0, ...events.map((event) => event.onsetBeat + event.durationBeats));
}
