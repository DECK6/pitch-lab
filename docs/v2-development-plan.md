# PITCH/LAB V2 development plan

**Branch:** `feature/pitch-lab-v2`

**V1 baseline:** `main` at `b490341`

**Plan date:** 2026-07-20

**Product priority:** P1 = practice and harmony, P2 = score game and choir parts

## Outcome

V2 turns the current free-running tuner into two clearly separated instruments:

1. **TUNING** keeps the current note, cents, contour, engine controls, and three-octave piano.
2. **PRACTICE** adds a key-aware harmony map, chord audition, target-note exercises, and feedback.
3. **SCORE** arrives in P2. It converts a structured score into a timed target lane, lets a singer choose a choir part, and grades pitch and rhythm.

The current production app stays intact on `main` and `dexa.art/pitchlab/`. V2 work stays on `feature/pitch-lab-v2`; the live preview uses the separate `dexa.art/pitch-lab-v2/` path until all cutover gates pass.

## Product layout

```text
┌─────────────────────────────────────────────────────────────┐
│ PITCH/LAB 02       [ TUNING ] [ PRACTICE ] [ SCORE · P2 ] │
├─────────────────────────────────────────────────────────────┤
│ shared: MIC / LIGHT / NEURAL / input level / device state  │
├─────────────────────────────────────────────────────────────┤
│ TUNING                  │ PRACTICE                          │
│ current V1 layout       │ KEY + MODE + TEMPO               │
│ note + cents + trail    │ COLOR / TENSION      (top lane)  │
│ 3-octave piano          │ DIATONIC CORE         (main lane) │
│                         │ RELATED / BORROWED   (bottom lane)│
│                         │ selected chord + target feedback  │
├─────────────────────────────────────────────────────────────┤
│ shared 3-octave piano; key/chord tones highlighted         │
└─────────────────────────────────────────────────────────────┘

Mobile:
[sticky mode switch]
[key controls]
[horizontally scrolling chord lanes]
[selected chord / target feedback]
[horizontally scrolling piano]
```

Mode switching changes the visible workspace, not the microphone session. A running mic and selected pitch engine survive a TUNING ↔ PRACTICE switch.

## What already exists and will be reused

| Existing capability | V2 use |
|---|---|
| `AudioSession` and normalized `PitchFrame` | One shared input pipeline for tuning, practice, and score grading |
| Light / Neural engine manager | No second detector and no new model download for P1/P2 |
| `frequencyToNote`, MIDI/frequency math | Extended with key-aware spelling and target-note comparison |
| `ReferenceTone` and `PianoView` | Kept for TUNING; generalized into a bounded voice bank for chord audition |
| `PitchTrail` | Remains in TUNING and becomes an optional detail in PRACTICE |
| Vite dynamic imports and budget script | Separate initial, practice, score, neural, and OMR graphs |
| Playwright desktop/mobile projects | Mode, chord, score, and iPhone layout regression coverage |

No UI framework or second audio stack is introduced.

## P1 — Tuning + key-aware practice

### P1 user flow

1. Open the app. TUNING is selected and behaves like V1.
2. Select PRACTICE.
3. Pick a tonic and `MAJOR` or `MINOR`.
4. See three harmony lanes:
   - **COLOR / TENSION:** diatonic extensions available over the selected chord.
   - **DIATONIC CORE:** seven triads or seventh chords with Roman numerals.
   - **RELATED / BORROWED:** secondary dominants and a conservative set of modal-interchange chords.
5. Select a chord to see its notes, role, suggested resolution, and playable voicing.
6. Play `ROOT`, `ARPEGGIO`, or `CHORD`, then sing the selected root/third/fifth/seventh.
7. See target note, actual note, cents, stability, and a pass/close/retry result.

### P1 music rules

- Key space: all 12 tonics, major and natural minor.
- Minor-key dominant recommendations use harmonic-minor leading tone where function requires it.
- Enharmonic spelling follows the selected key signature. Examples: F major uses B♭; F♯ major uses E♯.
- Core defaults to seventh chords; a TRIAD / 7TH toggle changes the center lane.
- Color chords are generated from in-key stacked thirds and explicit function rules. Each card shows chord symbol, notes, and one short usage hint.
- Related chords are intentionally limited in P1:
  - secondary dominants `V/ii`, `V/iii`, `V/IV`, `V/V`, `V/vi` where valid;
  - major-key borrowed `iv`, `♭VI`, `♭VII`;
  - minor-key borrowed/functional major IV, Picardy I, and dominant V7.
- Tritone substitution, altered dominants, diminished passing systems, modal keys, and jazz reharmonization presets wait for a later harmony pack. This keeps recommendations explainable instead of presenting a random chord cloud.

### P1 interaction details

- A chord card includes: Roman numeral, chord symbol, note spellings, function tag, and `→ resolution` hint.
- Selecting a chord highlights all chord tones on the three-octave piano; the root receives a distinct non-color-only marker.
- `ROOT` and individual piano keys remain monophonic. `ARPEGGIO` and `CHORD` use at most six oscillator voices with gain normalized by voice count and a master limiter.
- Any reference playback gates mic grading through its release tail, preserving the current anti-feedback behavior.
- Practice scoring uses the already-smoothed pitch frames. Initial thresholds:
  - `LOCKED`: median absolute error ≤ 15 cents and voiced coverage ≥ 70% over 600 ms;
  - `CLOSE`: ≤ 35 cents;
  - `RETRY`: > 35 cents or insufficient voiced coverage.
- Thresholds are constants backed by deterministic fixtures, not scattered UI numbers.
- Settings persist locally: mode, tonic, scale mode, triad/seventh view, tempo, last exercise, and accidental preference. Microphone PCM is never persisted.

### P1 architecture

```text
ModeStore ───────────────────────────────► AppShell
   │                                        ├─ TuningWorkspace (existing)
   │                                        └─ lazy PracticeWorkspace
   │                                                   │
KeyContext ─► HarmonyEngine ─► ChordCatalog ───────────┤
                         │                              ├─ chord lanes
                         └─ TargetExercise ─────────────┤
                                                       ▼
ReferenceVoiceBank ◄─ root / arp / chord          TargetComparator
       │                                               ▲
       └──────── detector gate                         │
AudioSession ─► PitchFrame ────────────────────────────┘
```

### P1 module boundaries

```text
src/app/                 mode state and workspace lifecycle
src/music/theory/        pure note spelling, key, scale, chord, suggestion logic
src/practice/            exercise state, target comparison, session summaries
src/piano/               monophonic key tone + bounded chord voice bank
src/ui/tuning/           extracted V1 workspace
src/ui/practice/         key controls, chord lanes, selected chord, target meter
tests/                   exhaustive theory, comparator, synth, and browser flows
```

P1 does not add a production dependency. The theory surface is small enough to implement as typed, tested functions; pulling a general music-theory package would increase initial supply-chain and bundle cost for unused APIs.

### P1 delivery waves

| Wave | Deliverable | Depends on | Release evidence |
|---|---|---|---|
| 1 | Extract shared app shell; add TUNING/PRACTICE state without changing TUNING behavior | V1 baseline | Existing 39 tests + new mode persistence/E2E tests |
| 2 | Key spelling and harmony engine for 24 major/minor contexts | Wave 1 contracts | Exhaustive golden tests for every key and degree |
| 3 | Three chord lanes and mobile/desktop practice layout | Waves 1–2 | Visual/E2E tests at 320 px, desktop, 200% zoom |
| 4 | Bounded polyphonic audition, arpeggiator, gain normalization, detector gate | Wave 2 | OfflineAudioContext frequency/gain/lifecycle tests |
| 5 | Chord-tone exercises, target comparator, local preferences, session feedback | Waves 2–4 | Synthetic pitch-frame tests + complete practice E2E |
| 6 | Physical mobile QA and preview deployment | Waves 1–5 | iPhone Safari + Android Chrome matrix and asset report |

### P1 acceptance gates

- TUNING screenshots and interactions remain functionally equivalent to V1.
- Switching modes never restarts a live mic or downloads Neural assets.
- All 24 major/minor key contexts produce correct note spelling, seven core chords, color options, and related options.
- Chord playback has no clipping, stuck voices, or mic self-grading.
- A singer can select any chord tone and receive stable target/actual/cents feedback.
- Keyboard and chord lanes scroll horizontally on mobile without blocking vertical page scroll.
- Initial TUNING graph: target ≤ 75 KB raw / 25 KB Brotli; hard cap ≤ 110 KB raw / 40 KB Brotli.
- Lazy PRACTICE graph: target ≤ 90 KB raw / 30 KB Brotli; hard cap ≤ 140 KB raw / 50 KB Brotli.
- Existing optional Neural cap remains 15 MB raw / 12 MB compressed.

## P2 — Score-guided rhythm game + choir parts

### Key decision: structured score first, PDF through OMR second

MusicXML/MXL contains parts, voices, staves, notes, rests, key signatures, tempo, and repeat instructions. PDF only describes rendered pages; it does not reliably contain those musical relationships. Therefore P2 uses one canonical pipeline:

```text
.musicxml/.xml/.mxl ── local parser ───────────────┐
                                                   ▼
.pdf/.png/.jpg ── explicit OMR conversion ──► MusicXML validator
                                                   │
                                                   ▼
                                    correction / confirmation gate
                                                   │
                                                   ▼
                                      normalized ScoreDocument
```

The rhythm game never grades directly from raw OMR output. The singer sees the detected key, part, first measures, and suspicious measures before confirming. This is required because OMR errors in accidentals, ties, and voice assignment would otherwise produce confident but wrong feedback.

### P2A — MusicXML/MXL score game

1. Import `.musicxml`, `.xml`, or compressed `.mxl` locally with browser File APIs.
2. Parse into a renderer-independent `ScoreDocument`:
   - metadata and ordered parts;
   - measures and divisions;
   - written and concert pitch;
   - key, time, and tempo maps;
   - notes, rests, ties, tuplets, lyrics, and pickup duration;
   - forward/back repeats and first/second endings.
3. Show an import report. Unsupported jumps such as ambiguous D.S./D.C./Coda are called out instead of silently linearized.
4. Select a part or extracted voice.
5. Start with count-in, tempo 50–120%, measure loop, metronome, and optional reference melody.
6. The score cursor and game lane follow the `AudioContext.currentTime` clock. `requestAnimationFrame` only draws the current position.
7. The active key card follows key-signature changes in the score.
8. Score each note from a latency-compensated window using median cents, voiced coverage, onset error, and sustain coverage. Rests are checked only for voiced leakage, not exact silence level.

### P2B — Choir part separation

Part extraction has three confidence levels:

| Input structure | Default action | Confidence |
|---|---|---|
| Separate Soprano/Alto/Tenor/Bass `score-part` entries | Use named parts directly | High |
| Combined staves with distinct `staff` + `voice` values | Build candidate lines and suggest SATB mapping | Medium |
| Condensed/crossing voices or ambiguous OMR output | Show candidates and require manual mapping | Low |

Automatic SATB labels use part names first, then staff/voice structure, then observed range as a hint. Range alone never finalizes a part because voice ranges overlap. The user can always rename, merge, split, or disable a candidate line before play.

The part selector previews:

- part/voice name and confidence;
- written range and sounding range;
- first eight note names with measure numbers;
- associated lyric line;
- measures with chords or overlapping simultaneous pitches that cannot be graded monophonically.

### P2C — PDF/image import

- PDF/image OMR is a separately deployed optional service or local converter, never part of the initial web bundle.
- The browser explicitly discloses that the score file, but never microphone audio, will be sent for conversion.
- The service accepts one job, uses an isolated temporary directory, returns MusicXML/MXL, and deletes input/output after completion or a short TTL.
- Audiveris is the first candidate because it outputs MusicXML and includes an interactive-correction workflow. Its AGPLv3 obligations and deployment model require a license review before production use.
- Printed common Western notation is the supported target. Handwritten scores are rejected with a clear message.
- P2 is not considered complete until the correction gate, file deletion evidence, failure recovery, and representative SATB PDF fixtures pass.

### P2 architecture

```text
File picker
    │
    ├─ XML/MXL ─► ImportWorker ─┐
    │                           │
    └─ PDF/image ─► OMR API ────┤
                                ▼
                      MusicXmlValidator
                                │
                                ▼
                      ScoreNormalizer
             ┌──────────────────┼───────────────────┐
             ▼                  ▼                   ▼
       PartExtractor       ScoreRenderer       TimelineEngine
             │                  │                   │
             └──────────── selected line ───────────┤
                                                    ▼
AudioContext clock ─► Scheduler ─► cursor + target window
AudioSession ─► PitchFrame ─► LatencyCompensator ─► NoteScorer
                                                    │
                                                    ▼
                                     per-note + phrase summary
```

### P2 renderer and weight policy

- Use OpenSheetMusicDisplay as the leading renderer candidate because it accepts MusicXML in a browser, exposes a cursor, and can hide parts. Pin the exact version after a one-day spike.
- Keep the renderer behind `import()` and load it only after SCORE mode or a score file is selected.
- Keep the canonical timeline parser independent of renderer internals. The game must remain testable if the renderer is upgraded or replaced.
- Use a small direct ZIP decoder for `.mxl`; do not depend on a renderer's transitive package API.
- Provisional lazy SCORE graph hard cap: 2.5 MB raw / 800 KB Brotli, including renderer, music font assets, and MXL decoder.
- Verovio remains a measured fallback only if OSMD fails part hiding, cursor, or rendering correctness; its current npm package is materially larger and should not be bundled speculatively.
- No client-side OMR model is bundled in P2. PDF conversion stays a separate deployment graph.

### P2 delivery waves

| Wave | Deliverable | Depends on | Release evidence |
|---|---|---|---|
| 1 | Score contract, fixtures, renderer spike, bundle measurements | P1 target comparator | Written decision record and measured chunk report |
| 2 | Local MusicXML/MXL import and normalized timeline | Wave 1 | Golden fixtures for keys, meter, ties, tuplets, pickup, repeats |
| 3 | Lazy score renderer, part visibility, cursor, mobile paging | Waves 1–2 | Desktop/mobile visual and long-score memory tests |
| 4 | Audio-clock scheduler, count-in, tempo/loop controls, note scoring | Waves 2–3 | Fake-clock and synthetic-pitch integration tests |
| 5 | Choir candidate extraction, SATB suggestion, manual mapping | Wave 2 | Separate-part, condensed-staff, voice-crossing fixtures |
| 6 | PDF/image OMR service, correction gate, deletion and error handling | Waves 2 and 5 | Printed-score corpus, security/privacy and cleanup tests |
| 7 | Physical-device rhythm latency and production preview | Waves 1–6 | iPhone/Android/desktop matrix and P2 asset report |

### P2 acceptance gates

- MusicXML/MXL files never leave the device.
- PDF/image upload happens only after explicit disclosure; microphone PCM never shares that path.
- The game follows score key changes, tempo changes, pickup measures, ties, and simple repeats.
- The visual cursor never serves as the master clock.
- A user can select S/A/T/B directly when encoded as parts and can correct medium/low-confidence mappings.
- Polyphonic target moments are either reduced by the confirmed voice mapping or marked ungradable; the app never chooses an arbitrary simultaneous pitch.
- Synthetic scoring tests cover ±5, ±15, ±35, and ±50 cents; onset boundaries; vibrato; unvoiced gaps; ties; and device-latency compensation.
- A 100-page score does not freeze the main thread: parse in a Worker, render incrementally, and retain only the active page window where supported.
- SCORE and OMR assets are absent from the initial TUNING and PRACTICE network graphs.

## Shared domain contracts

```ts
type AppMode = 'tuning' | 'practice' | 'score';

interface KeyContext {
  tonicPitchClass: number;
  tonicName: string;
  mode: 'major' | 'natural_minor';
  fifths: number;
  accidentalPolicy: 'key_signature' | 'sharps' | 'flats';
}

interface ChordSuggestion {
  id: string;
  roman: string;
  symbol: string;
  category: 'diatonic' | 'color' | 'secondary_dominant' | 'borrowed';
  pitchClasses: number[];
  noteNames: string[];
  resolutionTargetIds: string[];
  usageHint: string;
}

interface ScoreDocument {
  metadata: ScoreMetadata;
  parts: ScorePart[];
  keyMap: KeyChange[];
  tempoMap: TempoChange[];
  timeMap: TimeChange[];
  playbackOrder: MeasureVisit[];
  warnings: ImportWarning[];
}

interface VoiceLine {
  id: string;
  sourcePartId: string;
  sourceStaff?: number;
  sourceVoice?: string;
  suggestedRole?: 'S' | 'A' | 'T' | 'B';
  confidence: 'high' | 'medium' | 'low';
  events: TargetNoteEvent[];
}

interface TargetNoteEvent {
  id: string;
  measure: number;
  onsetBeat: number;
  durationBeats: number;
  writtenMidi: number;
  soundingMidi: number;
  lyric?: string;
  tieGroupId?: string;
}
```

These are intent-level contracts. Exact field names may change during implementation, but renderer-specific classes may not leak into practice scoring.

## Test strategy

```text
PURE DOMAIN                                BROWSER / DEVICE
HarmonyEngine                              mode switch
├─ 24 key contexts [UNIT]                  ├─ TUNING regression [E2E]
├─ 7 degrees × triad/7th [UNIT]            ├─ PRACTICE mobile lanes [E2E]
├─ enharmonic spellings [UNIT]             └─ no unwanted lazy requests [E2E]
└─ suggestions/resolutions [UNIT]

TargetComparator                           reference playback
├─ cents/coverage windows [UNIT]            ├─ root/arp/chord lifecycle [E2E]
├─ vibrato/unvoiced gaps [UNIT]             ├─ normalized gain [AUDIO]
└─ latency offset [UNIT]                    └─ detector gate [E2E]

ScoreNormalizer                            score game
├─ key/time/tempo changes [FIXTURE]         ├─ import → select part [E2E]
├─ pickup/tie/tuplet/repeat [FIXTURE]       ├─ count-in → loop → result [E2E]
├─ part/staff/voice [FIXTURE]               ├─ iPhone interruption [DEVICE]
└─ unsupported jump warnings [FIXTURE]      └─ long-score memory [PERF]

OMR boundary                               choir workflow
├─ timeout/bad output/cleanup [INTEGRATION] ├─ direct SATB [E2E]
├─ accidental/tie confidence [CORPUS]       ├─ manual voice mapping [E2E]
└─ handwritten rejection [INTEGRATION]      └─ ambiguous polyphony warning [E2E]
```

Pure music-theory and score-normalization modules target 100% branch coverage. Browser tests cover complete user flows, and physical iPhone checks remain explicit because WebKit emulation cannot prove mic latency or memory behavior.

## Main risks and controls

| Risk | Impact | Control |
|---|---|---|
| Harmony suggestions feel arbitrary | Users do not trust the practice view | Small explainable rule set, role/resolution hint, exhaustive golden tests |
| Polyphonic chord audition clips or feeds back | Bad sound and false pitch grading | Six-voice cap, gain normalization, limiter, existing detector gate |
| Score renderer dominates bundle | Slow mobile load | SCORE-only dynamic import and independent bundle cap |
| MusicXML exports differ across notation apps | Import failures | Canonical parser, fixture corpus from MuseScore/Finale/Sibelius-style exports, explicit warnings |
| Repeats and jumps create the wrong timeline | Cursor and grading drift | Playback-order model; support simple repeats first; never silently flatten unsupported jumps |
| Choir voices are condensed or crossing | Wrong SATB target | Confidence levels, structure-first inference, manual mapping, ungradable markers |
| PDF OMR misreads accidentals/ties | Confidently wrong grading | Mandatory correction/confirmation gate and corpus thresholds |
| OMR service weakens privacy/local-first promise | Trust loss | Separate opt-in score-only upload, short TTL deletion, no audio route, self-host/license gate |
| iOS suspends audio or falls behind | Rhythm score becomes unfair | Audio clock, latency calibration, interruption states, physical device gate |

## NOT in scope for P1/P2

- Polyphonic microphone recognition or source separation. A singer is graded as one monophonic line.
- Automatic vocal-range classification as identity. Range is only an SATB suggestion hint.
- Handwritten-score OMR.
- Full notation editing. The correction gate edits target events and mappings, not engraving.
- Automatic accompaniment generation, MIDI input/output, sampled grand-piano libraries, cloud accounts, or social leaderboards.
- Silent production replacement of V1. Cutover requires a separate decision after preview QA.

## Release sequence

1. Keep `main` and `dexa.art/pitchlab/` on V1.
2. Implement P1 on `feature/pitch-lab-v2`; keep the live preview at `dexa.art/pitch-lab-v2/` on a separate path.
3. Pass P1 unit, browser, bundle, and physical-device gates.
4. Add P2A/P2B behind the SCORE mode flag; keep PDF import disabled until P2C privacy/license/accuracy gates pass.
5. Run side-by-side V1/V2 regression QA.
6. Only then merge or retarget the production route. Preserve the V1 commit/tag for instant rollback.

## Evidence used for this plan

- Local baseline on 2026-07-20: 39 unit tests pass; production build passes.
- Local asset baseline: initial 58 KB raw / 18 KB Brotli; optional Neural 13,969 KB raw / 2,587 KB Brotli.
- MusicXML 4.0 defines ordered parts plus note-level voice/staff information, key signatures, tempo, and repeats.
- OpenSheetMusicDisplay can load/render MusicXML, expose a cursor, and hide parts; it remains a P2-only lazy dependency.
- Audiveris converts printed score images to MusicXML but documents imperfect OMR accuracy and the need for manual correction.

## Source references

- [MusicXML 4.0 structure and parts](https://www.w3.org/2021/06/musicxml40/tutorial/structure-of-musicxml-files/)
- [MusicXML voice and staff model](https://www.w3.org/2021/06/musicxml40/tutorial/notation-basics/)
- [MusicXML key, time, transpose, and repeat semantics](https://www.w3.org/2021/06/musicxml40/tutorial/midi-compatible-part/)
- [OpenSheetMusicDisplay browser renderer](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay)
- [OpenSheetMusicDisplay API](https://opensheetmusicdisplay.github.io/classdoc/classes/OpenSheetMusicDisplay.html)
- [Audiveris OMR limits and MusicXML output](https://audiveris.github.io/audiveris/_pages/handbook/)
- [Web Audio scheduling clock](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/currentTime)
