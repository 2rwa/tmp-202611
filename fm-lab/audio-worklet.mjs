import { sampleAt, clonePatch } from './synth-core.mjs';

class FMLabProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = [];
    this.port.onmessage = ({ data: m }) => {
      if (m.type === 'on') {
        this.voices = this.voices.filter(v => v.id !== m.id);
        if (this.voices.length >= 12) this.voices.shift();
        this.voices.push({
          id: m.id, f: m.frequency, p: clonePatch(m.patch),
          age: 0, releaseAge: null, noiseState: (m.id * 2654435761) >>> 0
        });
      } else if (m.type === 'off') {
        for (const v of this.voices) {
          if (v.id === m.id && v.releaseAge === null) v.releaseAge = v.age;
        }
      } else if (m.type === 'allOff') {
        for (const v of this.voices) {
          if (v.releaseAge === null) v.releaseAge = v.age;
        }
      }
    };
  }
  process(_inputs, outputs) {
    const channels = outputs[0];
    const left = channels[0];
    const right = channels[1] || left;
    for (let i = 0; i < left.length; i++) {
      let signal = 0;
      for (const v of this.voices) {
        const t = v.age / sampleRate;
        const releaseT = v.releaseAge === null ? 0 : (v.age - v.releaseAge) / sampleRate;
        const tail = v.releaseAge === null ? 1 : Math.exp(-6 * releaseT / Math.max(.015, v.p.release));
        const tonal = sampleAt(t, v.f, v.p);
        // Low-level deterministic breath/bow noise is not part of the FM fit.
        let breath = 0;
        if (v.p.noise) {
          v.noiseState ^= v.noiseState << 13;
          v.noiseState ^= v.noiseState >>> 17;
          v.noiseState ^= v.noiseState << 5;
          breath = ((v.noiseState >>> 0) / 2147483648 - 1) *
            v.p.noise * v.p.gain * Math.min(1, t / Math.max(.005, v.p.attack));
        }
        signal += (tonal + breath) * tail;
        v.age++;
      }
      // Gentle saturation protects speakers and polyphonic levels.
      const val = Math.tanh(signal * .92);
      left[i] = val;
      if (right !== left) right[i] = val;
    }
    this.voices = this.voices.filter(v =>
      v.releaseAge === null ? v.age < sampleRate * 35 :
        v.age - v.releaseAge < sampleRate * Math.max(.15, v.p.release * 2.3));
    return true;
  }
}
registerProcessor('fm-lab-processor', FMLabProcessor);
