# Phase 3 Context — Product P2 score game and choir parts

<domain>
Import a structured or OMR-converted score, normalize it into a renderer-independent timeline, let the singer select and correct one choir line, then grade pitch and rhythm against that line using the existing local monophonic detector.
</domain>

<decisions>
- D-301: MusicXML/XML/MXL is the canonical semantic input and stays local to the browser.
- D-302: The V2 preview recognizes printed PDF pages locally with PDF.js plus a bounded raster heuristic; its output must pass a correction/confirmation gate before grading.
- D-303: The canonical `ScoreDocument` cannot expose OpenSheetMusicDisplay or another renderer's internal classes.
- D-304: The first preview uses a renderer-independent rhythm lane and local PDF page preview. A full notation renderer remains a later measured decision.
- D-305: The Web Audio `AudioContext.currentTime` clock drives scheduling and grading; animation frames only draw.
- D-306: The preview handles key/tempo maps, pickup duration, ties, voices/staves, transpose, and lyrics. Repeats/endings and jump navigation require explicit review because playback expansion is not implemented yet.
- D-307: Repeats/endings and D.S./D.C./Coda constructs become blocking import warnings, never silent guesses.
- D-308: Choir extraction uses part names and MusicXML part/staff/voice structure first. Vocal range is only a suggestion hint.
- D-309: Medium- and low-confidence choir mappings require user confirmation; ambiguous simultaneous pitches are ungradable until resolved.
- D-310: The PDF OMR path receives score bytes only inside the current browser session, never microphone PCM, and creates no server-side temporary files.
- D-311: Handwritten OMR and polyphonic microphone recognition are outside P2.
- D-312: SCORE is loaded only when its tab opens; MusicXML and PDF/OMR graphs load only after the corresponding explicit file action.
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
- MusicXML/MXL and PDF remain local; PDF.js/OMR is an explicit lazy graph with a mandatory review gate.
- Printed PDF support is experimental and limited to clean common five-line notation; handwritten and complex engraving remain outside the preview.
</release_defaults>
