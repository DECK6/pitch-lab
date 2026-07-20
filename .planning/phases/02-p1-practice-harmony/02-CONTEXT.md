# Phase 2 Context — Product P1 practice and harmony

<domain>
Preserve the current free tuner as TUNING and add a key-aware PRACTICE workspace. The singer should understand the selected key's core chords, useful color/related choices, hear them clearly, and practice individual chord tones with live pitch feedback.
</domain>

<decisions>
- D-201: V1 remains preserved on `main` at `b490341`; V2 work and preview deployment use `feature/pitch-lab-v2`.
- D-202: TUNING and PRACTICE share one `AudioSession`; mode switches do not restart mic capture or engine state.
- D-203: PRACTICE is dynamically imported so the default TUNING graph stays close to V1 weight.
- D-204: Support all 12 major and natural-minor keys; use harmonic-minor dominant function where appropriate.
- D-205: The practice harmony map has top COLOR/TENSION, center DIATONIC CORE, and bottom RELATED/BORROWED lanes.
- D-206: P1 recommendations stay small and explainable; advanced altered/jazz substitution packs are deferred.
- D-207: Add no P1 production dependency; implement typed pitch spelling and chord rules locally with exhaustive tests.
- D-208: Root and piano playback remain monophonic; arpeggio/chord audition uses a six-voice maximum and normalized master gain.
- D-209: Every reference sound gates microphone grading through the release tail.
- D-210: Practice scores a selected chord tone from median cents and voiced coverage; it does not attempt sung-chord/polyphonic recognition.
- D-211: Persist settings and summaries locally, but never persist or upload microphone PCM.
- D-212: Mobile chord lanes and the existing piano scroll horizontally without preventing vertical page scroll.
</decisions>

<canonical_refs>
- `docs/v2-development-plan.md` — product layout, music rules, architecture, weight gates, risks, and rollout.
- `docs/product-spec.md` — V1 audio, privacy, Neural, and device contracts that remain binding.
- `.planning/REQUIREMENTS.md` — P1 requirement IDs and traceability.
- `src/ui/app.ts` — current V1 shell and pitch-frame rendering behavior to preserve.
- `src/audio/audio-session.ts` — single shared microphone session.
- `src/piano/reference-tone.ts` and `src/ui/piano.ts` — current reference lifecycle and keyboard behavior.
</canonical_refs>

<scope_fence>
No score import, PDF/OMR, choir extraction, polyphonic microphone analysis, UI framework, sampled piano, MIDI, accounts, or cloud service in P1.
</scope_fence>

<acceptance_defaults>
- TUNING initial hard cap: 110 KB raw / 40 KB Brotli.
- PRACTICE lazy graph hard cap: 140 KB raw / 50 KB Brotli.
- LOCKED: median absolute target error <= 15 cents and voiced coverage >= 70% over 600 ms.
- CLOSE: median absolute error <= 35 cents; otherwise RETRY.
</acceptance_defaults>
