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
3. The responsive instrument UI and 36-key reference keyboard work with mouse, physical keyboard, and touch.
4. Unit, integration, browser smoke, and asset-budget checks pass in a production build.
5. A release report clearly separates automated evidence from physical-device checks still required.

**Plans:**
- [x] 01-01 — Core audio, dual engines, instrument UI, and automated release verification

Physical iPhone/Android/desktop microphone verification remains the explicit release-candidate gate tracked by REL-03.

## Milestone 2 — Key-aware and score-guided practice

V2 is isolated on `feature/pitch-lab-v2`; `main` remains the V1 source rollback baseline, while the production route now serves the verified V2 build.

### Phase 2 / Product P1: Tuning + harmony practice
**Goal:** Separate TUNING and PRACTICE, then let a singer choose a key, understand usable harmony, audition it, and practice exact chord tones.
**Mode:** vertical slices
**Requirements:** MOD-01, MOD-02, KEY-01, HAR-01, HAR-02, HAR-03, AUD-01, PRA-01, UI2-01, WGT-01
**UI hint:** yes

**Success Criteria:**
1. TUNING remains a regression-safe V1 workspace while PRACTICE loads independently.
2. Every major/minor key produces correctly spelled core, color, and related chord lanes.
3. Root/arpeggio/chord audition is bounded, loud enough, clip-free, and detector-gated.
4. A singer receives stable chord-tone feedback on desktop and mobile.
5. Initial, practice, and neural graphs pass separate asset budgets.

**Plans:**
- [ ] 02-01 — Implementation, automated gates, separate preview, and `/pitchlab/` production cutover are complete; physical iPhone/Android release checks remain

### Phase 3 / Product P2: Score game + choir parts
**Goal:** Turn a structured or OMR-converted score into a clock-correct singing game with explicit choir-part selection and correction.
**Mode:** staged capability
**Requirements:** SCR-01, SCR-02, SCR-03, GAME-01, GAME-02, CHOIR-01, CHOIR-02, PDF-01, PRIV-02, WGT-02, REL2-01
**UI hint:** yes

**Success Criteria:**
1. MusicXML/MXL import, normalization, part selection, and score rendering stay local and lazy.
2. The game follows score keys, tempo, pickup, ties, and simple repeats from an AudioContext master clock.
3. Direct SATB parts work automatically; condensed voices expose confidence and manual mapping.
4. Printed PDF/image OMR requires explicit score-only upload and a correction gate before grading.
5. Unit, score-fixture, browser, asset, privacy, and physical-device gates pass.

**Plans:**
- [ ] 03-01 — Score contract, MusicXML game, choir extraction, optional PDF OMR, and P2 release gates

See `docs/v2-development-plan.md` for product layout, data flow, weight budgets, risks, and rollout policy.
