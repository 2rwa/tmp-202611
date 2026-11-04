# NEON BREAK LAB — tmp-202611

Temporary GitHub Pages playground and archive for four successive iterations of the same brick-breaking game.

## Play

- [Index / version gallery](https://2rwa.github.io/tmp-202611/)
- [v1 — original](https://2rwa.github.io/tmp-202611/games/v1-classic.html)
- [v2 — shapes and balloon paddle](https://2rwa.github.io/tmp-202611/games/v2-shapes.html)
- [v3 — rotated triangles, scattered blocks, paddle correction](https://2rwa.github.io/tmp-202611/games/v3-reflections.html)
- [v4 — fixed game-speed rules (latest)](https://2rwa.github.io/tmp-202611/games/v4-speed.html)

Each version is the original conversation-generated standalone HTML snapshot. Old versions deliberately retain their historical collision and speed quirks; v4 is the recommended playable version.

## Build and test

```sh
node scripts/build-site.cjs
node tests/game.test.cjs
```

- `index.html`: responsive gallery and entry point; never overwritten by the build workflow.
- `packed/archive/v{1,2,3}.part*`: original HTML text divided into connector-safe UTF-8 parts (each under 10 kB).
- `packed/game.html.part*`: existing source parts for v4.
- `scripts/build-site.cjs`: assembles `games/*.html` and verifies SHA-256 for **all four originals**, then checks inline JavaScript syntax.
- `tests/game.test.cjs`: latest-game physics / UI regression tests plus gallery-link and archive checks.
- `.github/workflows/brick-breaker.yml`: runs tests and writes generated game HTML files back to `main`.
- `.github/workflows/pages.yml`: reconstructs/validates the site and publishes the gallery **and** `games/` using GitHub Pages.

The archived HTML pages are self-contained (no packages or network dependencies to play). Collision tests use a mocked Canvas environment and are not a substitute for physical gameplay QA in a real browser.
