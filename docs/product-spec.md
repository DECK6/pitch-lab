# PITCH/LAB 01 product spec

Status: approved for implementation on 2026-07-19.

The full reviewed source document is `/Users/deck/.gstack/projects/Dev/deck-unknown-design-20260719-140225.md`. It passed three adversarial review rounds with 37 findings resolved. This file is the repository-local execution contract.

## Product

PITCH/LAB 01 is an install-free, responsive web instrument that identifies a single sung or played pitch from a desktop or mobile microphone. It shows note name with octave, frequency, cents from equal temperament, confidence, input level, processing age, and a four-second pitch trail. A two-octave monophonic reference keyboard produces exact sine tones.

## Release scope

- `LIGHT DSP` is the default and starts without neural downloads.
- `NEURAL` is selectable now, loads SwiftF0 v0.1.1 plus ONNX Runtime Web only after explicit selection, and falls back to Light on failure or poor performance.
- All microphone analysis stays inside the browser. No account, API, database, upload, or audio persistence.
- Desktop and mobile layouts use a clean retro-industrial instrument language: warm shell, charcoal labels, colored function pads, mono numeric display, no copied logos or product trade dress.
- PDF score reading, target-note grading, and choir-part separation are deferred.

## Audio contract

- Request mono audio with `echoCancellation`, `noiseSuppression`, and `autoGainControl` ideally disabled; use actual device settings and sample rate.
- Collect PCM in an AudioWorklet and process it in a Worker. Keep at most one in-flight and one latest pending buffer; never build an unbounded queue.
- Light uses Pitchy/McLeod with a 4096-sample window, 1024 hop, C2-C6 display range, -55 dBFS RMS gate, and confidence hysteresis.
- Neural resamples stream input to 16 kHz, keeps a 4096-sample rolling window, and runs SwiftF0 every 512 samples. It validates `input_audio`, `pitch_hz`, and `confidence` tensor contracts.
- Engine output is normalized to monotonic `PitchFrame` values. Invalid or unvoiced frequency is `null`, never zero, NaN, or a stale value.
- Reference tones gate detection until 300 ms after their 200 ms release so speakers do not grade themselves.

## Weight and compatibility gates

| Artifact | Target | Hard cap |
|---|---:|---:|
| Initial compressed transfer | 180 KB | 250 KB |
| Initial raw deployed assets | 500 KB | 750 KB |
| Optional neural raw assets | 14.5 MB | 15 MB |
| Optional neural compressed transfer | 8 MB | 12 MB |

- Source excluding generated output and dependencies should stay below 5 MB.
- Target modern Chrome, Edge, Firefox, Safari, iOS Safari, and Android Chrome.
- iPhone neural inference uses worker-hosted WASM CPU with one thread. WebGPU is not attempted.
- Release-blocking checks include an iPhone 12-class device. Neural p95 end-to-end latency must be at most 250 ms on target mobile or the app returns to Light with a clear reason.

## Accuracy and naming gates

- A4 is 440 Hz; displayed notes follow 12-TET with sharp names by default.
- Clean synthetic and harmonic fixtures target plus/minus 5 cents for both engines.
- Silence, breath, and noise must not pin a random note.
- Keep the neutral label `NEURAL`. Rename it to `AI PRECISION` only if the fixed validation set shows at least 20% relative gross-error reduction or at least 3 cents absolute median-error improvement over Light.

## Model pin

- Source: `https://raw.githubusercontent.com/lars76/swift_f0/v0.1.1/swift_f0/model.onnx`
- Size: 399,114 bytes
- SHA-256: `fa91bb45512b90339cf4b00a599ba8fe3a253c46419fcfe6b46df77a8a8336a5`
- Repository/model license: MIT; attribution is shown in the app.

## Acceptance

1. A user can start and stop the microphone and see a stable note within two seconds of a clean input.
2. Light works before and after every neural load, cancel, incompatibility, and runtime error.
3. No ONNX JavaScript, WASM, glue module, or model request occurs before the user selects Neural.
4. Each reference key is within 0.1 cent of its 12-TET frequency, only one oscillator exists, and no voice sticks after release.
5. The production build passes unit, worker, browser smoke, and separate initial/neural bundle-budget checks.

