# Project State

## Project Reference

See `.planning/PROJECT.md` and `docs/product-spec.md`.

**Core value:** A singer immediately understands the current note and tuning direction.
**Current focus:** P2 score-game preview feedback and physical-device validation while the production `/pitchlab/` route remains unchanged.

## Status

- Phase: Product P2 / internal Phase 3 preview implemented
- State: Local MusicXML/MXL, experimental printed-PDF review, primary SATB selection, selected-line guide + score backing synth, and audio-clock rhythm lane implemented for the V2-only route; full P2 and physical-device release gates remain pending
- Plan: `.planning/phases/02-p1-practice-harmony/02-01-PLAN.md`
- Next plan: `.planning/phases/03-p2-score-game/03-01-PLAN.md`
- Last activity: 2026-07-22 — P2 preview gained primary SATB filtering plus local guide/backing synth; V2 redeployment pending, with `https://dexa.art/pitchlab/` retained unchanged

## Known Release Gates

- Gate 0A: streaming correctness passed in automated Chromium; real iPhone 12-class performance remains pending.
- Gate 0B: passed — production neural asset graph is 13.96 MB raw / 2.59 MB Brotli and initial graph is 67 KB raw / 20 KB Brotli.
- Label gate: keep `NEURAL` unless comparative accuracy evidence permits `AI PRECISION`.

## V2 Gates

- V1 preservation: `main` remains at the V1 rollback baseline; production deployment does not rewrite that branch.
- V2 routes: production is live at `https://dexa.art/pitchlab/` and the separate copy remains at `https://dexa.art/pitch-lab-v2/`.
- P1 initial graph: target 75 KB raw / 25 KB Brotli; hard cap 110 KB raw / 40 KB Brotli.
- P1 practice graph: hard cap 140 KB raw / 50 KB Brotli.
- P1 measured graphs: initial 67 KB raw / 20 KB Brotli; Practice 27 KB raw / 7 KB Brotli; Neural 13,969 KB raw / 2,587 KB Brotli.
- P2 measured graphs: SCORE 125 KB raw / 36 KB Brotli; local PDF OMR 1,596 KB raw / 404 KB Brotli; both remain outside initial TUNING/PRACTICE loads.
- PDF OMR: experimental on the V2-only route, local to the browser, and blocked by a correction-confirmation gate; production-grade accuracy and physical-device validation remain pending.
