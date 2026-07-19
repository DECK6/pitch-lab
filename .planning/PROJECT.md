# PITCH/LAB 01

## What This Is

A lightweight, privacy-first web instrument for singers and monophonic instruments. It uses the computer or phone microphone to identify the current note and tuning offset, and includes an exact two-octave reference keyboard.

## Core Value

A person can sing one note and immediately understand what note it is and whether it is flat, in tune, or sharp.

## Requirements

### Validated

(None yet — ship to validate.)

### Active

- [ ] Detect monophonic pitch locally with Light DSP by default.
- [ ] Let the user select a real, lazy-loaded SwiftF0 neural engine in the first release.
- [ ] Show note, octave, cents, frequency, confidence, level, latency, and recent contour.
- [ ] Produce exact monophonic sine reference notes from a touch-friendly two-octave keyboard.
- [ ] Run on current desktop and mobile browsers, including iOS Safari.
- [ ] Keep the initial app shell under 250 KB compressed and optional neural assets under 15 MB raw.

### Out of Scope

- PDF score ingestion and note-by-note grading — follow-up milestone after live pitch is proven.
- Choir part extraction — depends on the score pipeline and needs a separate music-notation design.
- Polyphonic or accompaniment-separated pitch detection — v1 is intentionally monophonic.
- Accounts, cloud sync, server inference, and audio upload — conflict with the local-first wedge.
- Sampled piano, polyphony, sustain, MIDI, and computer-keyboard mapping — exact sine reference tones are sufficient for v1.

## Context

The approved design deliberately exposes the trade between a tiny, immediate DSP path and a heavier optional neural module. The initial screen must remain useful offline after load. Neural mode exists in the current release, but its product label stays neutral until a fixed benchmark proves an accuracy advantage.

## Constraints

- **Privacy**: PCM never leaves the browser and is never persisted.
- **Compatibility**: modern desktop browsers plus iOS Safari and Android Chrome.
- **Performance**: Light p95 end-to-end latency at most 120 ms; Neural at most 250 ms on target mobile.
- **Weight**: initial transfer at most 250 KB compressed; neural payload at most 15 MB raw and 12 MB compressed.
- **Design**: clean retro-industrial instrument feel without copied branding or trade dress.

## Key Decisions

| Decision | Rationale | Outcome |
|---|---|---|
| Vanilla TypeScript + Vite | Avoid a framework runtime and keep the shell small | — Pending |
| Pitchy/McLeod default engine | Proven small browser DSP with confidence output | — Pending |
| SwiftF0 v0.1.1 + ORT WASM optional engine | Small model, local inference, iOS-compatible CPU backend | — Pending |
| Dynamic import after explicit selection | Prevent any neural request in the default flow | — Pending |
| Neutral `NEURAL` label | Avoid accuracy claims before comparative evidence | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries. Validated requirements move above only after implementation and browser verification.

---
*Last updated: 2026-07-19 after initialization*

