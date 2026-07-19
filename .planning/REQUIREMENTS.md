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

- [x] **PIA-01**: User can play 24 chromatic sine reference tones over a selectable two-octave range using pointer or touch.
- [x] **PIA-02**: Reference playback is monophonic, click-free, correctly tuned, and gates microphone grading until its release tail ends.
- [x] **UI-01**: The interface is responsive, keyboard-accessible, reduced-motion aware, and readable without relying on color alone.
- [x] **UI-02**: The interface uses the approved playful retro-industrial instrument direction without copied brand assets.

### Release quality

- [x] **REL-01**: Production output passes separate initial and optional-neural asset budgets.
- [x] **REL-02**: Automated tests cover pitch math, smoothing, resampling, engine fallbacks, keyboard lifecycle, and browser smoke flows.
- [ ] **REL-03**: Release notes record physical-device checks for current desktop browsers, Android Chrome, and an iPhone 12-class iOS Safari device.

## v2 Requirements

### Score practice

- **SCORE-01**: User can import a PDF score and compare sung notes with a selected target line.
- **CHOIR-01**: User can select or extract a choir part from a multi-part score.

## Out of Scope

| Feature | Reason |
|---|---|
| Polyphonic microphone analysis | Requires source separation and is not needed to prove the singing tuner wedge |
| Audio uploads or cloud inference | Conflicts with privacy and adds backend weight |
| Sampled piano and sustain | Exact monophonic reference tones meet the first-use need |

## Traceability

| Requirement | Phase | Status |
|---|---|---|
| CAP-01, CAP-02, DSP-01, DSP-02 | Phase 1 | Complete |
| NEU-01, NEU-02, NEU-03, NEU-04 | Phase 1 | Complete |
| PIA-01, PIA-02, UI-01, UI-02 | Phase 1 | Complete |
| REL-01, REL-02 | Phase 1 | Complete |
| REL-03 | Phase 1 | Pending physical-device matrix |

**Coverage:** 15 v1 requirements, 15 mapped, 0 unmapped.

---
*Last updated: 2026-07-19 after implementation and automated verification*
