import { PRESETS, clonePatch, midiFrequency, sampleAt, clamp } from './synth-core.mjs';

const $ = s => document.querySelector(s);
const state = { preset: 'violin', patch: clonePatch(PRESETS.violin), midi: 60,
  context: null, node: null, analyser: null, held: new Map(), nextId: 1,
  target: null, targetRate: 0, targetUrl: null, worker: null };
const keys = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k'];
const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const controls = [
  ['indices.0', 'キャリアへの変調指数', 0, 8, .01],
  ['indices.1', '第2段の変調指数', 0, 8, .01],
  ['indices.2', '第3段の変調指数', 0, 8, .01],
  ['indices.3', '並列キャリアの変調指数', 0, 8, .01],
  ['mix', '並列キャリアの混合率', 0, 1, .01],
  ['attack', 'アタック時間 / 秒', .005, 1, .005],
  ['release', 'リリース時間 / 秒', .05, 1.2, .01],
  ['vibrato', 'ビブラート深さ / 周波数比', 0, .014, .0001],
  ['noise', 'ブレス・ボウノイズ量', 0, .12, .001]
];
const readParam = key => key.startsWith('indices.') ?
  state.patch.indices[Number(key.split('.')[1])] : state.patch[key];
const writeParam = (key, value) => {
  if (key.startsWith('indices.')) state.patch.indices[Number(key.split('.')[1])] = value;
  else state.patch[key] = value;
};
const noteLabel = midi => noteNames[midi % 12] + (Math.floor(midi / 12) - 1);
const noteBase = () => Number($('#octave').value);
function updateNoteInfo() {
  $('#note-info').textContent = noteLabel(state.midi) + ' · ' +
    midiFrequency(state.midi).toFixed(1) + ' Hz · キーボード A〜K でも演奏可';
}
function renderPresets() {
  const area = $('#presets');
  area.replaceChildren();
  Object.entries(PRESETS).forEach(([id, p], i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset' + (id === state.preset ? ' selected' : '');
    btn.setAttribute('aria-pressed', String(id === state.preset));
    const short = id === 'trumpetBright' ? 'Trumpet bright' : id[0].toUpperCase() + id.slice(1);
    btn.innerHTML = '<span class="num">PATCH 0' + (i + 1) +
      '</span><strong>' + short + '</strong><small>' + p.description + '</small>';
    btn.addEventListener('click', () => selectPreset(id));
    area.appendChild(btn);
  });
}
function selectPreset(id) {
  stopAll();
  state.preset = id;
  state.patch = clonePatch(PRESETS[id]);
  renderPresets();
  renderControls();
}
function renderControls() {
  const area = $('#controls');
  area.replaceChildren();
  controls.forEach(([key, name, min, max, step]) => {
    const block = document.createElement('div');
    block.className = 'control';
    const head = document.createElement('div');
    head.className = 'controlhead';
    const label = document.createElement('label');
    const output = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range';
    input.id = 'parameter-' + key.replace('.', '-');
    input.min = min; input.max = max; input.step = step;
    input.value = readParam(key);
    label.htmlFor = input.id;
    label.textContent = name;
    output.textContent = Number(input.value).toFixed(step < .001 ? 4 : 2);
    head.append(label, output);
    input.addEventListener('input', () => {
      writeParam(key, Number(input.value));
      output.textContent = Number(input.value).toFixed(step < .001 ? 4 : 2);
    });
    block.append(head, input);
    area.appendChild(block);
  });
}
async function ensureAudio() {
  if (state.node) {
    if (state.context.state === 'suspended') await state.context.resume();
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx || !window.AudioWorkletNode) throw Error('このブラウザはAudioWorkletに対応していません');
  const context = new Ctx();
  try {
    await context.audioWorklet.addModule('./audio-worklet.mjs');
    const node = new AudioWorkletNode(context, 'fm-lab-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2]
    });
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = .72;
    node.connect(analyser);
    analyser.connect(context.destination);
    state.context = context;
    state.node = node;
    state.analyser = analyser;
    await context.resume();
  } catch (error) {
    await context.close();
    throw error;
  }
}
function stopAll() {
  if (state.node) state.node.port.postMessage({ type: 'allOff' });
  state.held.clear();
  document.querySelectorAll('.key.down').forEach(el => el.classList.remove('down'));
}
async function noteDown(midi, token, button = null) {
  if (state.held.has(token)) return;
  const id = state.nextId++;
  state.held.set(token, id);
  state.midi = midi;
  updateNoteInfo();
  $('#target-note').value = String(midi);
  if (button) button.classList.add('down');
  try {
    await ensureAudio();
    if (!state.held.has(token) || state.held.get(token) !== id) return;
    state.node.port.postMessage({
      type: 'on', id, frequency: midiFrequency(midi), patch: clonePatch(state.patch)
    });
  } catch (error) {
    state.held.delete(token);
    if (button) button.classList.remove('down');
    $('#fit-status').textContent = '音声初期化に失敗しました: ' + error.message +
      '（GitHub PagesなどのHTTPSから開いてください）';
  }
}
function noteUp(token, button = null) {
  const id = state.held.get(token);
  if (id === undefined) return;
  state.held.delete(token);
  state.node?.port.postMessage({ type: 'off', id });
  if (button) button.classList.remove('down');
}
function renderKeyboard() {
  const el = $('#keyboard');
  el.replaceChildren();
  for (let i = 0; i <= 12; i++) {
    const midi = noteBase() + i;
    const isBlack = [1, 3, 6, 8, 10].includes(i % 12);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'key' + (isBlack ? ' black' : '');
    b.textContent = noteLabel(midi);
    b.title = noteLabel(midi) + ' / ' + keys[i].toUpperCase();
    b.setAttribute('aria-label', noteLabel(midi) + ' の音を鳴らす');
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      noteDown(midi, 'ptr:' + e.pointerId, b);
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      b.addEventListener(event, e => noteUp('ptr:' + e.pointerId, b));
    }
    el.appendChild(b);
  }
}
function drawMonitor(canvas, data, mode, active) {
  const cx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  cx.clearRect(0, 0, w, h);
  cx.strokeStyle = '#1d3952';
  cx.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    cx.beginPath(); cx.moveTo(i * w / 8, 0); cx.lineTo(i * w / 8, h); cx.stroke();
  }
  for (let i = 1; i < 5; i++) {
    cx.beginPath(); cx.moveTo(0, i * h / 5); cx.lineTo(w, i * h / 5); cx.stroke();
  }
  cx.strokeStyle = active ? '#81f6e1' : '#537c91';
  cx.lineWidth = 2;
  cx.beginPath();
  if (mode === 'wave') {
    for (let x = 0; x < w; x++) {
      const i = Math.floor(x / w * data.length);
      const v = data[i];
      const y = h / 2 - v * h * .43;
      if (x === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
    }
  } else {
    for (let x = 0; x < w; x++) {
      // Logarithmic magnitude, linear frequency axis to 8 kHz.
      const bin = Math.min(data.length - 1, Math.floor(x / w * (8000 / 24000) * data.length));
      const magnitude = clamp((data[bin] + 95) / 87, 0, 1);
      const y = h - magnitude * (h - 14);
      if (x === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
    }
  }
  cx.stroke();
}
const idleWave = new Float32Array(2048);
const idleSpectrum = new Float32Array(1024).fill(-95);
function visualize() {
  const active = state.held.size > 0 && state.analyser;
  if (active) {
    const times = new Float32Array(state.analyser.fftSize);
    const freqs = new Float32Array(state.analyser.frequencyBinCount);
    state.analyser.getFloatTimeDomainData(times);
    state.analyser.getFloatFrequencyData(freqs);
    drawMonitor($('#scope'), times, 'wave', true);
    drawMonitor($('#spectrum'), freqs, 'spectrum', true);
  } else {
    for (let n = 0; n < idleWave.length; n++) {
      const t = .4 + n / 44100;
      idleWave[n] = sampleAt(t, midiFrequency(state.midi), state.patch);
    }
    drawMonitor($('#scope'), idleWave, 'wave', false);
    drawMonitor($('#spectrum'), idleSpectrum, 'spectrum', false);
  }
  requestAnimationFrame(visualize);
}
function downloadWav() {
  const rate = 44100, length = rate * 3, pcm = new Int16Array(length);
  for (let n = 0; n < length; n++) {
    const t = n / rate;
    const tail = t > 2.5 ? Math.exp(-8 * (t - 2.5) / Math.max(.08, state.patch.release)) : 1;
    pcm[n] = Math.round(clamp(sampleAt(t, midiFrequency(state.midi), state.patch) *
      tail * 2.0, -.99, .99) * 32767);
  }
  const ab = new ArrayBuffer(44 + pcm.byteLength), view = new DataView(ab);
  const put = (pos, text) => { for (let k = 0; k < text.length; k++) view.setUint8(pos + k, text.charCodeAt(k)); };
  put(0, 'RIFF'); view.setUint32(4, 36 + pcm.byteLength, true);
  put(8, 'WAVE'); put(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  put(36, 'data'); view.setUint32(40, pcm.byteLength, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, pcm[i], true);
  const url = URL.createObjectURL(new Blob([ab], { type: 'audio/wav' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fm-' + state.preset + '-' + noteLabel(state.midi).replace('♯', 'sharp') + '.wav';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function loadTarget(file) {
  if (!file) return;
  $('#fit').disabled = true;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const temp = new Ctx();
    const buf = await temp.decodeAudioData(await file.arrayBuffer());
    await temp.close();
    const maxFrames = Math.min(buf.length, Math.floor(buf.sampleRate * 2));
    const mono = new Float32Array(maxFrames);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const samples = buf.getChannelData(ch);
      for (let n = 0; n < maxFrames; n++) mono[n] += samples[n] / buf.numberOfChannels;
    }
    let peak = 0;
    for (const v of mono) peak = Math.max(peak, Math.abs(v));
    if (peak < .002) throw Error('無音に近いファイルです');
    let start = mono.findIndex(v => Math.abs(v) > peak * .045);
    start = Math.max(0, start - Math.floor(.009 * buf.sampleRate));
    state.target = mono.slice(start);
    state.targetRate = buf.sampleRate;
    if (state.targetUrl) URL.revokeObjectURL(state.targetUrl);
    state.targetUrl = URL.createObjectURL(file);
    $('#target-audio').src = state.targetUrl;
    $('#target-audio').hidden = false;
    $('#target-name').textContent = file.name;
    $('#fit-status').textContent = '読み込み完了。録音の音高を指定して「この音にフィット」を押してください。';
    $('#fit').disabled = false;
  } catch (error) {
    state.target = null;
    $('#fit-status').textContent = '読み込みエラー: ' + error.message;
  }
}
function fitTarget() {
  if (!state.target || state.worker) return;
  const fit = $('#fit'), status = $('#fit-status'), bar = $('#progress-fill');
  const frequency = midiFrequency(Number($('#target-note').value));
  fit.disabled = true;
  bar.style.width = '0%';
  status.textContent = '倍音スペクトルを解析しています…';
  const worker = new Worker('./fit-worker.mjs', { type: 'module' });
  state.worker = worker;
  const finish = () => { worker.terminate(); state.worker = null; fit.disabled = !state.target; };
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      const { step, steps, initial, best } = data.detail;
      bar.style.width = (100 * step / steps) + '%';
      status.textContent = '最適化 ' + step + '/' + steps +
        ' · 損失 ' + initial.toFixed(3) + ' → ' + best.toFixed(3);
    } else if (data.type === 'done') {
      state.patch = data.result.patch;
      renderControls();
      status.textContent = '完了。スペクトル損失 ' +
        data.result.initial.toFixed(3) + ' → ' + data.result.loss.toFixed(3) +
        '。鍵盤で結果を試聴できます。';
      finish();
    } else if (data.type === 'error') {
      status.textContent = '最適化エラー: ' + data.message;
      finish();
    }
  };
  worker.onerror = e => { status.textContent = 'Worker エラー: ' + e.message; finish(); };
  worker.postMessage({
    samples: state.target, sampleRate: state.targetRate, frequency,
    patch: clonePatch(state.patch), steps: 90
  });
}
function init() {
  renderPresets(); renderControls(); renderKeyboard(); updateNoteInfo();
  $('#octave').addEventListener('change', () => { stopAll(); renderKeyboard(); });
  $('#reset').addEventListener('click', () => selectPreset(state.preset));
  $('#panic').addEventListener('click', stopAll);
  $('#demo').addEventListener('click', async () => {
    const token = 'demo:' + state.nextId;
    await noteDown(state.midi, token);
    setTimeout(() => noteUp(token), 1400);
  });
  $('#export').addEventListener('click', downloadWav);
  $('#target').addEventListener('change', e => loadTarget(e.target.files[0]));
  $('#fit').addEventListener('click', fitTarget);
  const targetNote = $('#target-note');
  for (let midi = 48; midi <= 84; midi++) {
    const opt = document.createElement('option');
    opt.value = midi;
    opt.textContent = noteLabel(midi) + ' · ' + midiFrequency(midi).toFixed(1) + ' Hz';
    targetNote.appendChild(opt);
  }
  targetNote.value = String(state.midi);
  window.addEventListener('keydown', e => {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey ||
      ['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName)) return;
    const ix = keys.indexOf(e.key.toLowerCase());
    if (ix < 0) return;
    e.preventDefault();
    const midi = noteBase() + ix;
    const button = $('#keyboard').children[ix];
    noteDown(midi, 'kb:' + keys[ix], button);
  });
  window.addEventListener('keyup', e => {
    const ix = keys.indexOf(e.key.toLowerCase());
    if (ix < 0) return;
    noteUp('kb:' + keys[ix], $('#keyboard').children[ix]);
  });
  window.addEventListener('blur', stopAll);
  requestAnimationFrame(visualize);
}
init();
