# Project State

## Project Reference

See `.planning/PROJECT.md` and `docs/product-spec.md`.

**Core value:** A singer immediately understands the current note and tuning direction.
**Current focus:** P1 release-candidate validation on `feature/pitch-lab-v2` while V1 remains preserved on `main`.

## Status

- Phase: Product P1 / internal Phase 2 implemented; Product P2 / internal Phase 3 follows
- State: P1 automated implementation complete; preview deployment and physical-device release gates pending
- Plan: `.planning/phases/02-p1-practice-harmony/02-01-PLAN.md`
- Next plan: `.planning/phases/03-p2-score-game/03-01-PLAN.md`
- Last activity: 2026-07-20 — P1 modes, harmony, audition, grading, responsive UI, and split asset graphs implemented

## Known Release Gates

- Gate 0A: streaming correctness passed in automated Chromium; real iPhone 12-class performance remains pending.
- Gate 0B: passed — production neural asset graph is 13.96 MB raw / 2.59 MB Brotli and initial graph is 55 KB raw / 17 KB Brotli.
- Label gate: keep `NEURAL` unless comparative accuracy evidence permits `AI PRECISION`.

## V2 Gates

- V1 preservation: do not change or deploy from `main` while V2 is under development.
- P1 initial graph: target 75 KB raw / 25 KB Brotli; hard cap 110 KB raw / 40 KB Brotli.
- P1 practice graph: hard cap 140 KB raw / 50 KB Brotli.
- P1 measured graphs: initial 66 KB raw / 20 KB Brotli; Practice 27 KB raw / 7 KB Brotli; Neural 13,969 KB raw / 2,587 KB Brotli.
- P2 score graph: provisional hard cap 2.5 MB raw / 800 KB Brotli, measured in the renderer spike.
- PDF OMR: disabled in production until accuracy, temporary-file deletion, privacy disclosure, and license review pass.
