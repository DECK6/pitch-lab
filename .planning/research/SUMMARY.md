# Project Research Summary

## Key Findings

- Web Audio, `getUserMedia`, AudioWorklet, Worker, and OscillatorNode cover capture, off-main-thread processing, and exact reference tones without a backend.
- Pitchy 4.1.0 provides the McLeod Pitch Method in a small dependency graph.
- SwiftF0 v0.1.1 accepts 16 kHz mono PCM and returns `pitch_hz` and `confidence`; the pinned model is about 0.4 MB.
- ONNX Runtime Web 1.27.0 WASM CPU supports iOS Safari, while WebGPU is not a valid iPhone baseline.
- The ORT WASM runtime, not the model, dominates neural download size. Only the default SIMD-threaded mjs/wasm pair may be emitted.

## Implications for Roadmap

1. Prove the DSP and neural adapters with deterministic fixtures before polishing the UI.
2. Keep workers and engine contracts explicit so neural failure cannot break Light.
3. Generate a production asset manifest and fail the build on accidental backend or budget growth.
4. Verify real microphone interruption and neural performance on physical iOS hardware before release.

## Sources

- `docs/product-spec.md`
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- https://github.com/ianprime0509/pitchy
- https://github.com/lars76/swift_f0
- https://onnxruntime.ai/docs/tutorials/web/deploy.html

