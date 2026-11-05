# NEON BREAK LAB — tmp-202611

Temporary GitHub Pages playground and archive for five successive iterations of the same brick-breaking game.

## Play

- [Index / version gallery](https://2rwa.github.io/tmp-202611/)
- [v1 — original](https://2rwa.github.io/tmp-202611/games/v1-classic.html)
- [v2 — shapes and balloon paddle](https://2rwa.github.io/tmp-202611/games/v2-shapes.html)
- [v3 — rotated triangles, scattered blocks, paddle correction](https://2rwa.github.io/tmp-202611/games/v3-reflections.html)
- [v4 — fixed game-speed rules](https://2rwa.github.io/tmp-202611/games/v4-speed.html)

- [v5 — ORBIT BREAK circular arena, drifting targets and one-sided paddle (latest)](https://2rwa.github.io/tmp-202611/games/v5-orbit.html)

The first four versions are the original conversation-generated standalone HTML snapshot. Old versions deliberately retain their historical collision and speed quirks; v5 is the latest gameplay experiment.

## Build and test

```sh
node scripts/build-site.cjs
node tests/game.test.cjs
node tests/orbit.test.cjs
node tests/orbit-paddle.test.cjs
# Chromium UI/playability test (CI also installs Playwright + Chromium):
node tests/orbit.browser.cjs
```

- `index.html`: responsive gallery and entry point; never overwritten by the build workflow.
- `packed/archive/v{1,2,3}.part*`: original HTML text divided into connector-safe UTF-8 parts (each under 10 kB).
- `packed/game.html.part*`: existing source parts for v4.
- `scripts/build-site.cjs`: assembles `games/*.html` and verifies SHA-256 for **all four originals**, then checks inline JavaScript syntax.
- `tests/game.test.cjs`: latest-game physics / UI regression tests plus gallery-link and archive checks.
- `.github/workflows/brick-breaker.yml`: runs tests and writes generated game HTML files back to `main`.
- `.github/workflows/pages.yml`: reconstructs/validates the site and publishes the gallery **and** `games/` using GitHub Pages.

The archived HTML pages are self-contained (no packages or network dependencies to play). Collision tests use a mocked Canvas environment and are not a substitute for physical gameplay QA in a real browser.

## V5: ORBIT BREAK gameplay

- Field is a circular specular reflector; ball speed remains constant per level.
- Targets drift/rotate and bounce before reaching the paddle lane; small circles, triangles and squares can be destroyed.
- Rotate the curved paddle around the circular boundary via pointer, touch, or Left/Right / A/D keys.
- Both **front and rear** paddle contacts reflect and fully recharge the ball (100%). Neither side damages the player. Each successful powered target strike costs 34 energy (three powered hits per charge). An unpowered target contact only reflects the ball: no damage, no points and no LIFE loss. Drifting objects can now reach the paddle lane; an object colliding with the paddle costs one LIFE. Three such paddle-object contacts cause GAME OVER. Objects rebound from the paddle and a brief hit cooldown prevents repeated penalties from one overlap.
- Destroy every target to advance a level. No random reflection angles; reproducible seeded target layouts.
- `orbit/physics.js` is the stand-alone deterministic gameplay model shared by browser and Node tests. Energy and LIFE are separate from fixed per-level ball speed.
- `orbit/render.js`, `orbit/game.js`, `orbit/style.css` implement Canvas visualization, controls and HUD.
- `tests/orbit.test.cjs` and `tests/orbit-paddle.test.cjs` validate multi-step physics, paddle-object damage, and full game transitions. `tests/orbit.browser.cjs` exercises the production interface in headless Chromium and uploads screenshots via Actions.
- Pages deployment tests **both** engine gameplay and actual browser input/rendering before publishing.

## PLaMo 3 Translate 0.8B (browser experiment)

- [PLaMo 3 Translate: browser demo](https://2rwa.github.io/tmp-202611/translate/)
- Source: `translate/` (separate from the five archived games)
- Model: `pfnet/plamo-3-translate-0.8b-GGUF`, `plamo-3-translate-0.8b-Q4_K_M.gguf` (~570 MB); not committed to the repository
- The browser retrieves the model from Hugging Face, then runs PFML3 Japanese/English translation locally through wllama; WebGPU is experimental and WASM CPU mode is available. The browser can cache model data.
- Supports context, glossary, polite/plain Japanese, direction swap, copy, unload.
- Model distribution/licensing: https://huggingface.co/pfnet/plamo-3-translate-0.8b-GGUF

### Verification
```sh
npm install --no-save --no-package-lock esbuild@0.25.12 @wllama/wllama@3.8.1 playwright@1.56.1
npx playwright install chromium
node tests/translate.test.cjs
node scripts/build-translate.cjs --mock
node tests/translate.browser.cjs
node scripts/build-translate.cjs
REAL_MODEL=1 node tests/translate.browser.cjs
```

`.github/workflows/plamo-browser.yml` automates the PFML3 unit check, mock Chromium UI regression, WebGPU SwiftShader probe, and a separate **real 0.8B GGUF CPU/WASM inference** job. A successful mock UI test does **not** demonstrate real model inference or compatibility. The Pages workflow also checks the production bundle and preserves all five existing games.
