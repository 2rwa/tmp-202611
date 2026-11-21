import { sampleAt, clonePatch, clamp } from './synth-core.mjs';
const FFT_SIZE = 2048, RATE = 11025, EPS = 1e-5;
const windowCoeffs = Float64Array.from({ length: FFT_SIZE }, (_, i) =>
  .5 - .5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));

function fft(samples) {
  const n = samples.length, re = Float64Array.from(samples), im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len;
    for (let start = 0; start < n; start += len) {
      for (let j = 0; j < len / 2; j++) {
        const ca = Math.cos(angle * j), sa = Math.sin(angle * j);
        const k = start + j, l = k + len / 2;
        const r = re[l] * ca - im[l] * sa;
        const ii = re[l] * sa + im[l] * ca;
        re[l] = re[k] - r; im[l] = im[k] - ii;
        re[k] += r; im[k] += ii;
      }
    }
  }
  return { re, im };
}

function bands(f, indices) {
  return indices.map(bin => {
    let power = 0;
    for (let k = bin - 1; k <= bin + 1; k++) {
      power += f.re[k] ** 2 + f.im[k] ** 2;
    }
    return power;
  });
}
function bandDerivatives(f, df, indices) {
  return indices.map(bin => {
    let derivative = 0;
    for (let k = bin - 1; k <= bin + 1; k++) {
      derivative += 2 * (f.re[k] * df.re[k] + f.im[k] * df.im[k]);
    }
    return derivative;
  });
}
function getParams(p) { return [...p.indices, p.mix]; }
function putParams(p, x) {
  p.indices = x.slice(0, 4);
  p.mix = x[4];
  return p;
}
function getIndices(frequency) {
  const arr = [];
  for (let h = 1; h <= 18; h++) {
    const bin = Math.round(frequency * h * FFT_SIZE / RATE);
    if (bin > FFT_SIZE / 2 - 3) break;
    arr.push(bin);
  }
  return arr;
}
function scoreFeature(candidate, target, gradients = null) {
  const total = candidate.reduce((a, b) => a + b, 0) + 1e-20;
  const targetTotal = target.reduce((a, b) => a + b, 0) + 1e-20;
  const dTotal = gradients ? gradients.map(g => g.reduce((a, b) => a + b, 0)) : null;
  const partials = new Float64Array(5);
  let loss = 0, weights = 0;
  for (let i = 0; i < candidate.length; i++) {
    const weight = 1 / Math.sqrt(1 + i * .12);
    const a = candidate[i] / total, b = target[i] / targetTotal;
    const delta = Math.log(a + EPS) - Math.log(b + EPS);
    loss += weight * delta * delta;
    weights += weight;
    if (gradients) {
      for (let j = 0; j < 5; j++) {
        const dNorm = (gradients[j][i] - a * dTotal[j]) / total;
        partials[j] += 2 * weight * delta * dNorm / (a + EPS);
      }
    }
  }
  if (gradients) for (let i = 0; i < 5; i++) partials[i] /= weights;
  return { loss: loss / weights, gradients: partials };
}
function lerp(samples, i) {
  const ix = Math.floor(i), u = i - ix;
  return (samples[ix] || 0) * (1 - u) + (samples[ix + 1] || 0) * u;
}
function targetWindow(samples, sourceRate, offset) {
  const result = new Float64Array(FFT_SIZE);
  for (let n = 0; n < FFT_SIZE; n++) {
    result[n] = lerp(samples, (offset + n / RATE) * sourceRate) * windowCoeffs[n];
  }
  return result;
}
function renderWindow(patch, frequency, offset, withGradients) {
  const signal = new Float64Array(FFT_SIZE);
  const derivatives = Array.from({ length: 5 }, () => new Float64Array(FFT_SIZE));
  const current = new Float64Array(5);
  for (let n = 0; n < FFT_SIZE; n++) {
    const t = offset + n / RATE;
    signal[n] = sampleAt(t, frequency, patch, withGradients ? current : null) * windowCoeffs[n];
    if (withGradients) {
      for (let k = 0; k < 5; k++) derivatives[k][n] = current[k] * windowCoeffs[n];
    }
  }
  return { signal, derivatives };
}
export function createComparison(samples, sampleRate, frequency) {
  if (!(frequency >= 80 && frequency <= 1600)) throw Error('対象音高は約80〜1600 Hzの範囲にしてください');
  const duration = samples.length / sampleRate, sizeSec = FFT_SIZE / RATE;
  if (duration < sizeSec + .025) throw Error('録音が短すぎます。0.25秒以上の単音を使ってください');
  const maxOffset = duration - sizeSec;
  const offsets = [.05, .32].map(x => Math.min(x, maxOffset));
  const indices = getIndices(frequency);
  return { offsets, indices, targets: offsets.map(t =>
    bands(fft(targetWindow(samples, sampleRate, t)), indices)) };
}
export function comparePatch(patch, frequency, comparison, withGradients = true) {
  let loss = 0;
  const grad = new Float64Array(5);
  for (let s = 0; s < comparison.offsets.length; s++) {
    const { signal, derivatives } = renderWindow(
      patch, frequency, comparison.offsets[s], withGradients);
    const wave = fft(signal);
    const dfft = withGradients ? derivatives.map(fft) : null;
    const powers = bands(wave, comparison.indices);
    const dpowers = dfft ? dfft.map(item => bandDerivatives(wave, item, comparison.indices)) : null;
    const part = scoreFeature(powers, comparison.targets[s], dpowers);
    loss += part.loss;
    if (withGradients) for (let k = 0; k < 5; k++) grad[k] += part.gradients[k];
  }
  loss /= comparison.offsets.length;
  for (let k = 0; k < 5; k++) grad[k] /= comparison.offsets.length;
  return { loss, grad };
}
export async function fitSample({ samples, sampleRate, frequency, patch, steps = 90 }, progress = () => {}) {
  const comparison = createComparison(samples, sampleRate, frequency);
  const original = clonePatch(patch);
  const x = getParams(original), m = new Float64Array(5), v = new Float64Array(5);
  let best = { loss: Infinity, patch: clonePatch(original) };
  const initial = comparePatch(original, frequency, comparison, false).loss;
  for (let step = 1; step <= steps; step++) {
    const p = putParams(clonePatch(original), x);
    const { loss, grad } = comparePatch(p, frequency, comparison, true);
    if (!Number.isFinite(loss)) throw Error('最適化中に数値エラーが発生しました');
    if (loss < best.loss) best = { loss, patch: clonePatch(p) };
    const rate = .095 * (1 - .5 * step / steps);
    for (let k = 0; k < 5; k++) {
      m[k] = .9 * m[k] + .1 * grad[k];
      v[k] = .999 * v[k] + .001 * grad[k] * grad[k];
      const mh = m[k] / (1 - Math.pow(.9, step));
      const vh = v[k] / (1 - Math.pow(.999, step));
      x[k] = clamp(x[k] - rate * mh / (Math.sqrt(vh) + 1e-8), 0, k === 4 ? 1 : 8);
    }
    if (step === 1 || step % 10 === 0 || step === steps) {
      progress({ step, steps, initial, best: best.loss });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  const lastPatch = putParams(clonePatch(original), x);
  const lastLoss = comparePatch(lastPatch, frequency, comparison, false).loss;
  if (lastLoss < best.loss) best = { loss: lastLoss, patch: lastPatch };
  return { ...best, initial };
}
