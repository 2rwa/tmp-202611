# tmp-202611 — NEON BREAK regression playground

Temporary test repository for the single-file `index.html` brick-breaker.

- Open `index.html` after the first successful GitHub Actions run to play.
- `packed/game.html.part*`: UTF-8 text chunks of the current 29 KB HTML (GitHub Connector-safe uploads).
- `.github/workflows/brick-breaker.yml`: rebuilds HTML, validates SHA-256, checks syntax, tests collisions/UI, and commits tested output.
- `tests/game.test.cjs`: deterministic regression tests against the actual inline game script, with canvas and UI event mocks.

The CI test covers rounded, triangular, rectangular blocks, eight triangle rotations, ellipse-paddle separation and fixed speed across repeated collisions. Browser rendering still needs manual gameplay QA; tests use an instrumented Canvas mock.
CI trigger: GitHub Actions push event verification (2026-11-04).
