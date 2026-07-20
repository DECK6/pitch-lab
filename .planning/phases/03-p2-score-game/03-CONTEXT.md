# Phase 3 Context — Product P2 score game and choir parts

<domain>
Import a structured or OMR-converted score, normalize it into a renderer-independent timeline, let the singer select and correct one choir line, then grade pitch and rhythm against that line using the existing local monophonic detector.
</domain>

<decisions>
- D-301: MusicXML/XML/MXL is the canonical semantic input and stays local to the browser.
- D-302: PDF/image import is an optional OMR conversion path; raw OMR output must pass a correction/confirmation gate before grading.
- D-303: The canonical `ScoreDocument` cannot expose OpenSheetMusicDisplay or another renderer's internal classes.
- D-304: OpenSheetMusicDisplay is the leading lazy renderer candidate; pin only after a bundle/cursor/part-hiding spike.
- D-305: The Web Audio `AudioContext.currentTime` clock drives scheduling and grading; animation frames only draw.
- D-306: P2 handles key and tempo changes, pickup measures, ties, tuplets, forward/back repeats, and first/second endings.
- D-307: Ambiguous D.S./D.C./Coda and unsupported constructs are import warnings, never silently flattened.
- D-308: Choir extraction uses part names and MusicXML part/staff/voice structure first. Vocal range is only a suggestion hint.
- D-309: Medium- and low-confidence choir mappings require user confirmation; ambiguous simultaneous pitches are ungradable until resolved.
- D-310: The PDF OMR path receives score files only, never microphone PCM, and deletes temporary files under a documented TTL.
- D-311: Handwritten OMR and polyphonic microphone recognition are outside P2.
- D-312: SCORE and OMR graphs are absent from initial TUNING and PRACTICE loads.
</decisions>

<canonical_refs>
- `docs/v2-development-plan.md` — full P2 flow, architecture, weight policy, tests, risks, and rollout.
- `.planning/REQUIREMENTS.md` — P2 requirement IDs and traceability.
- `src/audio/types.ts` — normalized pitch input consumed by the scorer.
- `src/audio/audio-session.ts` — local microphone and interruption lifecycle.
- MusicXML 4.0 structure: https://www.w3.org/2021/06/musicxml40/tutorial/structure-of-musicxml-files/
- MusicXML voices/staves: https://www.w3.org/2021/06/musicxml40/tutorial/notation-basics/
- OpenSheetMusicDisplay API: https://opensheetmusicdisplay.github.io/classdoc/classes/OpenSheetMusicDisplay.html
- Audiveris handbook: https://audiveris.github.io/audiveris/_pages/handbook/
</canonical_refs>

<scope_fence>
No handwritten OMR, general notation editor, polyphonic microphone grading, accompaniment separation, sampled backing tracks, accounts, leaderboards, or silent V1 production cutover.
</scope_fence>

<release_defaults>
- Lazy SCORE graph provisional hard cap: 2.5 MB raw / 800 KB Brotli.
- MusicXML/MXL remains local; PDF/image needs explicit score-only upload disclosure.
- P2 PDF production remains feature-disabled until accuracy, deletion, privacy, and license gates pass.
</release_defaults>
