'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.css': 'text/css', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const pathnameFile = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
    const file = path.resolve(root, '.' + pathnameFile);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('Not found'); }
});
function syntheticWav() {
  const rate = 11025, n = rate, out = Buffer.alloc(44 + n * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 2, 4);
  out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate, env = Math.min(1, t * 20);
    out.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 261.625565 * t) * env * 11000), 44 + 2 * i);
  }
  return out;
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/fm-lab/';
  const browser = await chromium.launch({ headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1260, height: 850 } });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(url, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.preset').count(), 4);
    assert.equal(await page.locator('.key').count(), 13);
    await page.locator('.preset').nth(1).click();
    assert.equal(await page.locator('.preset.selected').count(), 1);
    assert.match(await page.locator('.preset.selected').innerText(), /Flute/);
    await page.locator('#demo').click();
    await page.waitForTimeout(700);
    assert.doesNotMatch(await page.locator('#fit-status').innerText(), /音声初期化に失敗/);
    await page.locator('#target').setInputFiles({
      name: 'single-note.wav', mimeType: 'audio/wav', buffer: syntheticWav()
    });
    await page.locator('#fit').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#fit').disabled);
    await page.locator('#fit').click();
    await page.waitForFunction(() =>
      /完了。|最適化エラー|Worker エラー/.test(document.querySelector('#fit-status').textContent),
      { timeout: 60000 });
    const status = await page.locator('#fit-status').innerText();
    assert.match(status, /完了。/, status);
    fs.mkdirSync(path.join(root, 'test-artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'test-artifacts', 'fm-lab.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS FM Lab Chromium playback, UI, audio import and analytic fit');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
