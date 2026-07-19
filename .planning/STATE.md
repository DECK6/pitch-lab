# Project State

## Project Reference

See `.planning/PROJECT.md` and `docs/product-spec.md`.

**Core value:** A singer immediately understands the current note and tuning direction.  
**Current focus:** Phase 1 — Browser pitch instrument.

## Status

- Phase: 1 of 1 in Milestone 1
- State: Release candidate; physical-device verification pending
- Plan: `.planning/phases/01-browser-pitch-instrument/01-01-PLAN.md`
- Last activity: 2026-07-19 — implementation, automated QA, bundle gates, and review fixes completed

## Known Release Gates

- Gate 0A: streaming correctness passed in automated Chromium; real iPhone 12-class performance remains pending.
- Gate 0B: passed — production neural asset graph is 13.96 MB raw / 2.59 MB Brotli and initial graph is 55 KB raw / 17 KB Brotli.
- Label gate: keep `NEURAL` unless comparative accuracy evidence permits `AI PRECISION`.
