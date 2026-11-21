import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESETS, clonePatch, midiFrequency, sampleAt } from '../fm-lab/synth-core.mjs';
import { createComparison, comparePatch, fitSample } from '../fm-lab/fit-core.mjs';

assert.equal(Object.keys(PRESETS).length, 4);
for (const [name, patch] of Object.entries(PRESETS)) {
  assert.equal(patch.ratios.length, 4, name);
  assert.equal(patch.indices.length, 4, name);
  assert.ok(patch.indices.every(x => x >= 0 && x <= 8), name);
  const y = sampleAt(.23, 440, patch);
  assert.ok(Number.isFinite(y) && Math.abs(y) <= 1, name);
}
assert.ok(Math.abs(midiFrequency(69) - 440) < 1e-9);

for (const patch of Object.values(PRESETS)) {
  const g = new Float64Array(5);
  sampleAt(.27321, 329.63, patch, g);
  const params = [...patch.indices, patch.mix];
  for (let i = 0; i < 5; i++) {
    const eps = .00001;
    const a = clonePatch(patch), b = clonePatch(patch);
    if (i < 4) { a.indices[i] = params[i] + eps; b.indices[i] = params[i] - eps; }
    else { a.mix = params[4] + eps; b.mix = params[4] - eps; }
    const numeric = (sampleAt(.27321, 329.63, a) - sampleAt(.27321, 329.63, b)) / (2 * eps);
    assert.ok(Math.abs(numeric - g[i]) < 1e-5, 'analytic gradient mismatch for ' + patch.name + ' / ' + i);
  }
}
console.log('PASS 4-op analytic sample gradients');

const sr = 11025, frequency = 261.625565, source = clonePatch(PRESETS.trumpet);
const target = clonePatch(source);
target.indices = [4.0, 1.45, .6, .9]; target.mix = .28;
const samples = Float32Array.from({ length: Math.floor(sr * .75) },
  (_, i) => sampleAt(i / sr, frequency, target));
const comparison = createComparison(samples, sr, frequency);
const before = comparePatch(source, frequency, comparison, false).loss;
assert.ok(Number.isFinite(before) && before > 0);
const analytic = comparePatch(source, frequency, comparison, true);
for (let k = 0; k < 5; k++) {
  const p1 = clonePatch(source), p2 = clonePatch(source), eps = .0002;
  if (k < 4) { p1.indices[k] += eps; p2.indices[k] -= eps; }
  else { p1.mix += eps; p2.mix -= eps; }
  const numerical = (comparePatch(p1, frequency, comparison, false).loss -
    comparePatch(p2, frequency, comparison, false).loss) / (2 * eps);
  const tolerance = .015 + Math.abs(numerical) * .03;
  assert.ok(Math.abs(numerical - analytic.grad[k]) < tolerance,
    'spectral gradient mismatch, parameter ' + k + ' ' + numerical + '/' + analytic.grad[k]);
}
console.log('PASS windowed FFT spectral loss gradients');

const result = await fitSample({ samples, sampleRate: sr, frequency, patch: source, steps: 45 });
assert.ok(result.loss < before * .9, 'optimizer must improve spectral fit: ' + before + ' -> ' + result.loss);
assert.ok(result.patch.indices.every(x => x >= 0 && x <= 8));
assert.ok(result.patch.mix >= 0 && result.patch.mix <= 1);
console.log('PASS Adam spectral optimization', before.toFixed(4), '→', result.loss.toFixed(4));
const html = readFileSync(new URL('../fm-lab/index.html', import.meta.url), 'utf8');
for (const id of ['presets', 'keyboard', 'controls', 'scope', 'spectrum', 'fit', 'target', 'target-note']) {
  assert.ok(html.includes('id="' + id + '"'), 'missing UI ' + id);
}
const gallery = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.ok(gallery.includes('href="fm-lab/"'), 'landing page link missing');
console.log('PASS FM Lab HTML and navigation');
