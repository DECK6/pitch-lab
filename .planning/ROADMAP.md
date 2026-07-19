# Roadmap: PITCH/LAB 01

## Milestone 1 — Working pitch instrument

### Phase 1: Browser pitch instrument
**Goal:** Ship a lightweight local microphone tuner with exact reference tones and a real lazy-loaded SwiftF0 option.
**Mode:** mvp
**Requirements:** CAP-01, CAP-02, DSP-01, DSP-02, NEU-01, NEU-02, NEU-03, NEU-04, PIA-01, PIA-02, UI-01, UI-02, REL-01, REL-02, REL-03
**UI hint:** yes

**Success Criteria:**
1. Light detects deterministic fixtures and a live clean voice without requesting neural assets.
2. Neural loads only on selection, validates the pinned model, produces pitch frames, and falls back safely.
3. The responsive instrument UI and 24-key reference keyboard work with mouse, keyboard, and touch.
4. Unit, integration, browser smoke, and asset-budget checks pass in a production build.
5. A release report clearly separates automated evidence from physical-device checks still required.

**Plans:**
- [x] 01-01 — Core audio, dual engines, instrument UI, and automated release verification

Physical iPhone/Android/desktop microphone verification remains the explicit release-candidate gate tracked by REL-03.

## Future milestone — Score-guided practice

PDF score ingestion, note grading, and choir-part extraction remain intentionally outside the current milestone.
