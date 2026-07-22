# Requirements: PITCH/LAB 01

**Defined:** 2026-07-19
**Core Value:** A singer immediately sees the note and tuning direction of a clean monophonic input.

## v1 Requirements

### Capture and Light detection

- [x] **CAP-01**: User can start and stop microphone capture from an explicit control on desktop and mobile.
- [x] **CAP-02**: User receives actionable states for permission, missing device, interruption, clipping, quiet input, and unstable pitch.
- [x] **DSP-01**: User gets local Light pitch detection without any neural asset request.
- [x] **DSP-02**: User sees note name with octave, frequency, cents, confidence band, input level, processing age, and a four-second contour.

### Neural detection

- [x] **NEU-01**: User can explicitly select Neural and see its transfer size, load stage, progress, cancel, and retry states.
- [x] **NEU-02**: Neural uses the pinned SwiftF0 model through worker-hosted ONNX Runtime WASM and returns normalized pitch frames.
- [x] **NEU-03**: Any neural download, initialization, contract, or performance failure returns to working Light mode with a reason.
- [x] **NEU-04**: No ONNX Runtime or model asset is requested before Neural selection.

### Reference instrument and interface

- [x] **PIA-01**: User can play a selectable 36-key chromatic triangle reference range using pointer/touch, with ASDF-style physical controls for the center octave.
- [x] **PIA-02**: Reference playback is monophonic, click-free, correctly tuned, and gates microphone grading until its release tail ends.
- [x] **UI-01**: The interface is responsive, keyboard-accessible, reduced-motion aware, and readable without relying on color alone.
- [x] **UI-02**: The interface uses the approved playful retro-industrial instrument direction without copied brand assets.

### Release quality

- [x] **REL-01**: Production output passes separate initial and optional-neural asset budgets.
- [x] **REL-02**: Automated tests cover pitch math, smoothing, resampling, engine fallbacks, keyboard lifecycle, and browser smoke flows.
- [ ] **REL-03**: Release notes record physical-device checks for current desktop browsers, Android Chrome, and an iPhone 12-class iOS Safari device.

## v2 Requirements

### P1 — Modes, harmony, and guided practice

- [x] **MOD-01**: User can switch between TUNING and PRACTICE without restarting a running microphone or pitch engine.
- [x] **MOD-02**: TUNING retains the current V1 pitch, contour, engine, piano, keyboard, and mobile behavior.
- [x] **KEY-01**: User can select all 12 tonics in major or minor with key-correct enharmonic spelling.
- [x] **HAR-01**: User sees seven diatonic triads or seventh chords with Roman numerals, note names, and function labels.
- [x] **HAR-02**: User sees explainable color/tension options above the core lane and secondary-dominant/borrowed options below it.
- [x] **HAR-03**: User can select a chord and see its notes, role, suggested resolution, and highlighted piano keys.
- [x] **AUD-01**: User can audition a root, arpeggio, or bounded polyphonic chord without clipping, stuck voices, or microphone self-grading.
- [x] **PRA-01**: User can select a chord tone, sing it, and receive target note, actual note, cents, stability, and pass/close/retry feedback.
- [x] **UI2-01**: Practice controls and chord lanes work with touch, pointer, keyboard, 320 px mobile width, and 200% zoom.
- [x] **WGT-01**: P1 preserves the default TUNING boot budget and loads the PRACTICE graph separately.

### P2 — Structured score game and choir parts

- [x] **SCR-01**: User can import `.musicxml`, `.xml`, and `.mxl` locally and see a validation report before practice.
- [ ] **SCR-02**: The normalized score preserves parts, voices, staves, written/sounding pitch, keys, meter, tempo, pickup, ties, tuplets, lyrics, and simple repeats.
- [x] **SCR-03**: Unsupported or ambiguous jumps and polyphonic target moments are visible warnings, never silent guesses.
- [ ] **GAME-01**: User can count in, change tempo, loop measures, and follow a score cursor and game lane driven by the Web Audio clock.
- [ ] **GAME-02**: User receives latency-compensated per-note pitch, onset, sustain, and phrase feedback from the existing monophonic detector.
- [x] **CHOIR-01**: User can directly choose separately encoded S/A/T/B parts.
- [ ] **CHOIR-02**: User can inspect and correct staff/voice-based SATB suggestions with confidence and range/lyric previews.
- [ ] **PDF-01**: User can opt in to printed PDF/image OMR, review/correct the MusicXML result, and only then start grading.
- [x] **PRIV-02**: MusicXML and PDF recognition remain local; the OMR path never receives microphone audio or creates a server-side temporary score file.
- [x] **WGT-02**: Score renderer, MXL decoder, and OMR assets are absent from initial TUNING and PRACTICE network graphs.
- [ ] **REL2-01**: Unit, fixture, E2E, asset, and physical iPhone/Android checks cover practice and score flows.

## Out of Scope

| Feature | Reason |
|---|---|
| Polyphonic microphone analysis | Requires source separation and is not needed to prove the singing tuner wedge |
| Audio uploads or cloud inference | Conflicts with privacy and adds backend weight |
| Sampled piano and sustain | Exact monophonic reference tones meet the first-use need |
| Polyphonic microphone grading | One singer/voice line is the supported target |
| Handwritten OMR | Printed common Western notation is the P2 PDF target |
| Full notation editor | P2 corrects target events and part mappings, not page engraving |

## Traceability

| Requirement | Phase | Status |
|---|---|---|
| CAP-01, CAP-02, DSP-01, DSP-02 | Phase 1 | Complete |
| NEU-01, NEU-02, NEU-03, NEU-04 | Phase 1 | Complete |
| PIA-01, PIA-02, UI-01, UI-02 | Phase 1 | Complete |
| REL-01, REL-02 | Phase 1 | Complete |
| REL-03 | Phase 1 | Pending physical-device matrix |
| MOD-01, MOD-02, KEY-01, HAR-01, HAR-02, HAR-03 | Phase 2 / Product P1 | Implemented; physical release gate pending |
| AUD-01, PRA-01, UI2-01, WGT-01 | Phase 2 / Product P1 | Implemented; physical release gate pending |
| SCR-01, SCR-02, SCR-03, GAME-01, GAME-02 | Phase 3 / Product P2 | Planned |
| CHOIR-01, CHOIR-02, PDF-01, PRIV-02, WGT-02, REL2-01 | Phase 3 / Product P2 | Planned |

**Coverage:** all V1 and V2 requirements are mapped; P1 is implemented on `feature/pitch-lab-v2`, while P2 remains planned.

---
*Last updated: 2026-07-20 for the V2 P1/P2 plan*
