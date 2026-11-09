# NEON BREAK LAB — tmp-202611

Temporary GitHub Pages playground and archive for six successive iterations of the same brick-breaking game.

## Play

- [Index / version gallery](https://2rwa.github.io/tmp-202611/)
- [v1 — original](https://2rwa.github.io/tmp-202611/games/v1-classic.html)
- [v2 — shapes and balloon paddle](https://2rwa.github.io/tmp-202611/games/v2-shapes.html)
- [v3 — rotated triangles, scattered blocks, paddle correction](https://2rwa.github.io/tmp-202611/games/v3-reflections.html)
- [v4 — fixed game-speed rules](https://2rwa.github.io/tmp-202611/games/v4-speed.html)

- [v5 — ORBIT BREAK circular arena, drifting targets and a two-sided paddle](https://2rwa.github.io/tmp-202611/games/v5-orbit.html)

- [v6 — COMBO & MORPH: easier stages 4+, bonus lives, expanding/splitting targets, shape-changing arena](https://2rwa.github.io/tmp-202611/games/v6-orbit.html)

The first four versions are the original conversation-generated standalone HTML snapshot. Old versions deliberately retain their historical collision and speed quirks; v6 is the current gameplay experiment; v5 remains available unchanged.

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

`.github/workflows/plamo-browser.yml` automates the PFML3 unit check, mock Chromium UI regression, WebGPU SwiftShader probe, and a separate **real 0.8B GGUF CPU/WASM inference** job. A successful mock UI test does **not** demonstrate real model inference or compatibility. The Pages workflow also checks the production bundle and preserves all six existing games.

### Safari / iPhone compatibility runtime

The PLaMo-3-compatible wllama runtime must ship **two** worker/WASM pairs generated from the same pinned llama.cpp source:

- `dist/translate/wasm/wllama.wasm` — standard JSPI/Memory64 runtime
- `dist/translate/compat/wllama.js` and `dist/translate/compat/wllama.wasm` — Safari/iOS fallback (32-bit memory, compatible worker)

`translate/runtime-assets.mjs` derives same-origin URLs from the loaded module; `translate/app.js` calls `model.setCompat(assets.compat)` before loading the model. There must be **no** request for `@wllama/wllama-compat` at jsDelivr. The builder fails if a matching compatibility pair is missing.

`.github/workflows/plamo-upstream.yml` compiles both pairs using the same pinned upstream source, checks their presence, and tests the compat worker in a Playwright WebKit iPhone device profile using a small real GGUF model, then verifies the real PLaMo model in Chromium. This is not an on-device iOS Safari test: memory pressure and hardware performance require physical-device testing. Both Pages pipelines reject artifacts lacking the compatibility assets.

## V6: COMBO & MORPH (2026-11-07)

- **Stages 1–3:** v5's original target layouts, movement, speed, paddle size and LIFE rules are unchanged. Combo points are additional, but extra LIFE begins at stage 4.
- **Stage 4+:** slower ball (stage 4: 360 vs v5's 386), 18 targets instead of 25, slower target drift (12–26 vs 24–44 px/s), wider paddle (half-width .36 vs .275 rad), 2.0s damage grace (vs 1.1s).
- **Combo:** consecutive powered hits within 4 seconds increase scoring by +0.5× per hit, capped at 4×. A 4-hit combo awards one LIFE (+1) **once per stage from stage 4 onward**, capped at 6 LIVES. Reset on level advance.
- **Stage 6+:** selected expanding circles require 3 powered hits; radius increases twice before the final pop.
- **Stage 9+:** selected split targets yield two smaller single-hit targets on a powered hit.
- **Stage 12+:** stage 12 star, stage 13 square, stage 14 star; stage 15+ continuously morphs circle↔star on a 10-second loop. Canvas outline and ball-wall collision both follow the new shape.
- **Sharing:** native share with URL-copy fallback, an opt-in QR image supplied by a third-party QR generator, repository Star link, and fullscreen with an in-arena mobile close button. After GAME OVER, export PNG showing the final stage, score, max combo and arena image.
- **Source:** `games/v6-orbit.html` plus `orbit/v6-*`; v5 source files are unchanged.
- **Tests:** `node tests/orbit-v6.test.cjs`; `node tests/orbit-v6.browser.cjs` (Playwright Chromium). The Pages workflow includes both suites.

## V6 fullscreen HUD and endgame compression

- Fullscreen targets `#game-shell` (HUD, energy, buttons, status and canvas), not the canvas alone. Desktop and mobile preserve SCORE, BEST, STAGE, LIVES, COMBO and ENERGY while hiding share/intro content. The gameplay surface fills the remaining viewport and centers the arena using a stage-aware scale (square arenas receive a wider view to avoid clipping); pointer mapping uses the same transform.
- When fewer than 10 targets remain, the arena gradually closes in. Scale goals are 97% at 9 remaining down to 73% at 1 remaining; smoothing is time-based, not an abrupt resize. Target count increases from splits do not reverse the shrink. The ball, target positions, paddle radius, collision wall and drawn shell shrink together; ball speed stays constant, increasing attack frequency. Each new stage resets the arena to full size.
- The fullscreen exit control remains visible alongside the HUD; game-over result capture preserves image aspect ratio. Dedicated Node and Chromium tests exercise the shrinking physics and both desktop/mobile fullscreen.

## V6 stage selection

- **ステージ選択** opens the replay picker, including in fullscreen. Cleared stages are marked **CLEAR**; the next unlocked stage is **NEXT**. Future stages stay locked.
- Completing Stage N unlocks Stage N+1 and retains all earlier clears in browser `localStorage` (`orbitBreakerV6CompletedStage`). Previous gameplay before this feature cannot be restored automatically.
- A selected stage begins at SCORE 0 / LIVES 3. Reset and GAME OVER retry use that stage. The picker pauses play when opened. Clear progression survives browser reload if storage is enabled.
- Tests: `tests/orbit-v6.test.cjs` and `tests/orbit-v6-stages.browser.cjs` (local HTTP server + Playwright).

## MLIT Geospatial MCP experiment (2026-11-09)

- [Interactive GeoJSON map viewer](https://2rwa.github.io/tmp-202611/geo-mcp/) (synthetic sample by default)
- [Python MCP stdio probe, offline mock and real API instructions](geo-mcp/README.md)
- Run offline: `python3 geo-mcp/probe.py --mock --out geo-mcp/result.json`
- Tests: `node tests/geo-mcp.test.cjs`; optional live workflow uses repository secret `MLIT_LIBRARY_API_KEY`.
- Generated results and government API credentials are not included in the public Pages deployment.
