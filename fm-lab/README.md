# FM INSTRUMENT LAB

[GitHub Pages で演奏する](https://2rwa.github.io/tmp-202611/fm-lab/)

Four-operator phase-modulation FM synthesizer (pure HTML, CSS, vanilla JavaScript, Web Audio API, AudioWorklet). It approximates violin, flute, mellow trumpet, and bright trumpet. The patches are **hand-designed**, not the output of DDX7 training and not faithful reconstructions of a particular sampled performance.

## How to use

1. Select an instrument patch.
2. Click or touch the piano keyboard, or play the A W S E D F T G Y H U J K keys. Change the starting octave if desired.
3. Adjust modulation indices (0–8), mixing, attack, release, vibrato, and noise. New notes use the current patch.
4. Optional: load a local recording of a **single pitched note**, choose its pitch explicitly, and click **この音にフィット**. Listen to the fitted patch using the keyboard.
5. Export a 3-second 44.1 kHz mono PCM WAV of the selected pitch. The WAV uses the differentiable tonal DSP and omits stochastic bow/breath noise.

The sound is generated locally; audio files are decoded and processed in the browser, not uploaded.

## DSP / optimization

- Shared core in `synth-core.mjs`: nested four-operator phase modulation, two mixed carrier paths, envelopes, index brightness decay, delayed vibrato. Live playback adds a small amount of stochastic noise. See source for ratios and exact patch parameters.
- Live audio: `audio-worklet.mjs`, polyphonic, note-on/off and exponential release with bounded voice lifetime.
- Offline fitting: `fit-core.mjs` computes **analytic sample derivatives**, propagates them through a windowed FFT (derivative FFT), and minimizes a phase-insensitive, normalized log harmonic-band-power loss with Adam, keeping frequency ratios and envelopes fixed. No TensorFlow or external dependencies.
- Pitch detection is **not** implemented: the user must choose the recording's pitch correctly. A 0.25-second or longer isolated monophonic note, with minimal reverb, is recommended. The optimizer assumes sound starts near the beginning after silence trimming.
- Fitting changes only the four modulation indices and carrier mix; pitch, operator ratios, attack/decay/sustain/release, brightness decay, noise, and vibrato parameters stay at their chosen preset values. Fitting a different instrument class may not converge to a convincing timbre.
- This is an exploratory four-operator model, not an implementation of Yamaha DX7's six-operator algorithms. There is no guarantee it will match a real violin/flute/trumpet exactly.

## Local development and tests

Serve from a local HTTP server (AudioWorklet needs a secure context; localhost counts):

```sh
python3 -m http.server 8000
# http://localhost:8000/fm-lab/
node tests/fm-lab.test.mjs
node tests/fm-lab.browser.cjs  # requires Playwright Chromium
```

No build step is required for FM Lab. GitHub Pages copies `fm-lab/` as-is.

References:
- Caspe et al., “DDX7: Differentiable FM Synthesis of Musical Instrument Sounds” (2022).
- https://fcaspe.github.io/ddx7/
