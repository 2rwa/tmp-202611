// Four-operator phase-modulation FM core. No dependencies; shared by audio and gradient fitter.
export const PRESETS = Object.freeze({
  violin: {
    name: 'Violin / バイオリン', description: '弓の立ち上がり、豊かな倍音と遅れて入るビブラート',
    ratios: [1, 2, 3, 5], indices: [3.1, 1.25, .60, .85], mix: .20,
    attack: .18, decay: .40, sustain: .83, release: .42,
    brightFall: .28, brightTime: .65, vibrato: .005, vibratoRate: 5.7,
    vibratoDelay: .27, noise: .015, gain: .28
  },
  flute: {
    name: 'Flute / フルート', description: '基音優勢、柔らかい息成分、ゆっくり立ち上がる音',
    ratios: [1, 2, 3, 4], indices: [.40, .12, .07, .17], mix: .06,
    attack: .10, decay: .22, sustain: .95, release: .23,
    brightFall: .24, brightTime: .22, vibrato: .0035, vibratoRate: 5.1,
    vibratoDelay: .32, noise: .035, gain: .36
  },
  trumpet: {
    name: 'Trumpet / トランペット', description: '吹き込みの強さで倍音が増え、発音後は少し丸くなる金管音',
    ratios: [1, 2, 3, 4], indices: [2.8, 1.1, .35, .48], mix: .16,
    attack: .060, decay: .24, sustain: .88, release: .22,
    brightFall: .55, brightTime: .34, vibrato: .0018, vibratoRate: 5.2,
    vibratoDelay: .40, noise: .013, gain: .30
  },
  trumpetBright: {
    name: 'Trumpet / ブライト', description: '強いアタック、鋭い高次倍音。明るいトランペット',
    ratios: [1, 2, 4, 5], indices: [5.0, 2.0, .83, .76], mix: .19,
    attack: .025, decay: .19, sustain: .76, release: .17,
    brightFall: .66, brightTime: .23, vibrato: .0012, vibratoRate: 5,
    vibratoDelay: .42, noise: .02, gain: .26
  }
});
export const PARAM_KEYS = ['indices.0', 'indices.1', 'indices.2', 'indices.3', 'mix'];
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const clonePatch = p => ({ ...p, ratios: [...p.ratios], indices: [...p.indices] });
export function midiFrequency(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
export function amplitudeAt(t, p) {
  if (t < 0) return 0;
  const attack = Math.max(.001, p.attack);
  if (t < attack) return t / attack;
  const s = clamp(p.sustain, 0, 1);
  return s + (1 - s) * Math.exp(-(t - attack) / Math.max(.005, p.decay));
}
// Directly differentiable phase-modulation network. The 5 optional derivatives
// are analytic chain-rule derivatives w.r.t. four indices and carrier mix.
export function sampleAt(t, frequency, p, derivatives = null) {
  const tau = Math.PI * 2, r = p.ratios, ix = p.indices;
  const vibratoRamp = clamp((t - p.vibratoDelay) / .15, 0, 1);
  const phase = tau * frequency * t +
    (frequency * p.vibrato / Math.max(.01, p.vibratoRate)) *
      Math.sin(tau * p.vibratoRate * t) * vibratoRamp;
  const bright = 1 - p.brightFall * (1 - Math.exp(-t / Math.max(.01, p.brightTime)));
  const amp = amplitudeAt(t, p) * p.gain;
  const s3 = Math.sin(r[3] * phase);
  const x2 = r[2] * phase + ix[2] * bright * s3;
  const s2 = Math.sin(x2), c2 = Math.cos(x2);
  const x1 = r[1] * phase + ix[1] * bright * s2;
  const s1 = Math.sin(x1), c1 = Math.cos(x1);
  const x0 = r[0] * phase + ix[0] * bright * s1;
  const xP = r[0] * phase + ix[3] * bright * s2;
  const s0 = Math.sin(x0), sP = Math.sin(xP);
  const y = amp * ((1 - p.mix) * s0 + p.mix * sP);
  if (derivatives) {
    const c0 = Math.cos(x0), cP = Math.cos(xP);
    const d2 = c2 * bright * s3;
    derivatives[0] = amp * (1 - p.mix) * c0 * bright * s1;
    derivatives[1] = amp * (1 - p.mix) * c0 * ix[0] * bright * c1 * bright * s2;
    derivatives[2] = amp * ((1 - p.mix) * c0 * ix[0] * bright * c1 *
      ix[1] * bright * d2 + p.mix * cP * ix[3] * bright * d2);
    derivatives[3] = amp * p.mix * cP * bright * s2;
    derivatives[4] = amp * (sP - s0);
  }
  return y;
}
