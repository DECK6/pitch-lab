# Phase 1 Context — Browser pitch instrument

<domain>
Deliver one complete browser instrument: live monophonic pitch display, local Light default, selectable Neural engine, and exact reference keyboard.
</domain>

<decisions>
- D-01: Use Vanilla TypeScript, Vite, CSS, AudioWorklet, and Workers; no UI framework or backend.
- D-02: Light is always the default and remains usable through every Neural state.
- D-03: Neural uses pinned SwiftF0 v0.1.1 and ONNX Runtime Web WASM CPU, one thread on iOS.
- D-04: Neural JavaScript, WASM, glue, and model load only after explicit user selection.
- D-05: Keep the product label `NEURAL` until benchmark evidence passes the accuracy naming gate.
- D-06: Use a 24-key, monophonic sine reference keyboard with a detector gate.
- D-07: Enforce the product-spec raw and compressed size budgets in the build.
- D-08: Microphone PCM is ephemeral and never transmitted or persisted.
</decisions>

<canonical_refs>
- `docs/product-spec.md` — locked product, model, privacy, weight, and acceptance contract.
- `.planning/REQUIREMENTS.md` — checkable v1 scope and traceability.
- `/Users/deck/.gstack/projects/Dev/deck-unknown-design-20260719-140225.md` — full approved design and risk analysis.
- `/Users/deck/.gstack/projects/Dev/designs/pitch-lab-01/wireframe.html` — approved visual reference.
</canonical_refs>

<code_context>
Greenfield repository. Reuse platform Web Audio primitives, Pitchy 4.1.0, ONNX Runtime Web 1.27.0, and the pinned SwiftF0 model instead of creating pitch algorithms or an inference runtime from scratch.
</code_context>

<scope_fence>
No PDF, score grading, choir-part extraction, backend, authentication, upload, polyphonic analysis, sampled piano, or MIDI in this phase.
</scope_fence>

