# PITCH/LAB project instructions

- Parent instructions in `/Volumes/data/Dev/AGENTS.md` apply.
- The app is local-first: never upload, persist, or log microphone PCM.
- `LIGHT DSP` must work without downloading any neural asset.
- Neural assets must remain behind an explicit user action and a dynamic import.
- Use test-first changes for pitch math, resampling, smoothing, session state, and asset budgets.
- Do not rename the neural mode to `AI PRECISION` unless the benchmark gate in `docs/product-spec.md` passes; use `NEURAL` by default.
- Keep generated model and ONNX Runtime binaries out of Git.

