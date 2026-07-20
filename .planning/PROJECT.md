# PITCH/LAB

## What This Is

A lightweight, privacy-first web instrument for singers and monophonic instruments. V1 identifies a live note and tuning offset. V2 adds key-aware practice and score-guided singing while reusing the same local audio pipeline.

## Core Value

A person can sing one note and immediately understand what it is, how accurately it is tuned, and how it fits a chosen key, chord, or score part.

## Requirements

### Validated

- [x] Detect monophonic pitch locally with Light DSP by default.
- [x] Let the user select a real, lazy-loaded SwiftF0 neural engine in the first release.
- [x] Show note, octave, cents, frequency, confidence, level, latency, and recent contour.
- [x] Produce exact monophonic triangle reference notes from a touch-friendly three-octave keyboard with center-octave physical-key controls.
- [x] Keep the initial app shell under 250 KB compressed and optional neural assets under 15 MB raw.

### Active

- [ ] Run on current desktop and mobile browsers, including iOS Safari.
- [ ] Separate the interface into TUNING and PRACTICE without regressing V1 behavior.
- [ ] Show key-aware diatonic, color/tension, and related/borrowed chord choices.
- [ ] Grade selected chord tones using the existing monophonic microphone pipeline.
- [ ] Import structured scores, select choir parts, and run a score-synchronized practice game.

### Out of Scope for V1

- PDF score ingestion and note-by-note grading — follow-up milestone after live pitch is proven.
- Choir part extraction — depends on the score pipeline and needs a separate music-notation design.
- Polyphonic or accompaniment-separated pitch detection — v1 is intentionally monophonic.
- Accounts, cloud sync, server inference, and audio upload — conflict with the local-first wedge.
- Sampled piano, chord polyphony, sustain, and MIDI — exact oscillator reference tones are sufficient for v1.

### Out of Scope for V2 P1/P2

- Polyphonic microphone recognition and accompaniment separation.
- Handwritten-score recognition.
- Full notation editing, social accounts, leaderboards, and cloud audio storage.

## Context

The approved design deliberately exposes the trade between a tiny, immediate DSP path and a heavier optional neural module. The initial screen must remain useful offline after load. Neural mode exists in the current release, but its product label stays neutral until a fixed benchmark proves an accuracy advantage.

V2 preserves `main` at the V1 baseline and is planned on `feature/pitch-lab-v2`. P1 adds no production dependency. P2 score and OMR capabilities are optional graphs that never load in the default TUNING path.

## Constraints

- **Privacy**: PCM never leaves the browser and is never persisted.
- **Compatibility**: modern desktop browsers plus iOS Safari and Android Chrome.
- **Performance**: Light p95 end-to-end latency at most 120 ms; Neural at most 250 ms on target mobile.
- **Weight**: initial transfer at most 250 KB compressed; neural payload at most 15 MB raw and 12 MB compressed.
- **Design**: clean retro-industrial instrument feel without copied branding or trade dress.

## Key Decisions

| Decision | Rationale | Outcome |
|---|---|---|
| Vanilla TypeScript + Vite | Avoid a framework runtime and keep the shell small | Validated by 17 KB Brotli initial graph |
| Pitchy/McLeod default engine | Proven small browser DSP with confidence output | Validated on deterministic fixtures and browser fake mic |
| SwiftF0 v0.1.1 + ORT WASM optional engine | Small model, local inference, iOS-compatible CPU backend | Automated browser passed; physical iPhone pending |
| Dynamic import after explicit selection | Prevent any neural request in the default flow | Validated by browser request inspection |
| Neutral `NEURAL` label | Avoid accuracy claims before comparative evidence | Retained after measured model bias |
| V2 feature branch | Preserve the shipped V1 and provide a clean rollback point | Active on `feature/pitch-lab-v2` |
| Canonical score model | Keep rendering, choir extraction, and scoring independent | Planned for P2 |
| MusicXML before PDF OMR | Use semantic score data when available; require correction after uncertain OMR | Planned for P2 |

## Evolution

This document evolves at phase transitions and milestone boundaries. Validated requirements move above only after implementation and browser verification.

---
*Last updated: 2026-07-20 for the V2 P1/P2 plan*
