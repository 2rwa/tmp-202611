# NDLOCR GPU-only development track

Priority: Apple Silicon Mac real-GPU OCR. No PDF, table, DAISY or unrelated app work in this branch. No Pages deployment dependency.

## Acceptance
- Exact known OCR text in each benchmark mode, GPU dispatch and submit in every GPU run, no uncaptured GPU errors.
- Apple hardware must be identified from the actual GPU device adapter, not merely an available adapter or an EP request. Virtual / unknown / software adapters are NOT speed evidence.
- Proposed minimum warm end-to-end improvement: 1.5x vs the same WASM baseline, median of 3 runs, excluding the first cold run. Record detection, recognition and total separately. This is a provisional engineering target, not a user-specified speed requirement.
- Full-page DEIM+PARSeq accelerated is preferred. Hybrid is valid only if end-to-end acceleration is measured; GPU dispatch alone does not constitute acceptance.
- Current browser probe is Chrome. Native Safari support is a separate compatibility goal, not assumed.

## Root-cause candidate
The failing node is /model/decoder/decoder/integral/MatMul. patch-deim.py inspects actual ONNX operand shapes and rewrites only an eligible K-vector or K-by-1 product to broadcast Mul+ReduceSum. It fails closed for any other shape. The generated model is accepted only after two full-model ONNX Runtime CPU parity checks. No weights changed. The source is pinned and hash checked. Generated ONNX and manifest stay outside Git.

## On an actual Mac
From checkout of gpu/ndlocr-mac:
    npm install --no-save --no-package-lock playwright@1.56.1
    ORT_VERSION=$(npm view onnxruntime-web version) HEADLESS=0 node ndlocr-lite-v2/mac-gpu-bench.cjs

Use installed Google Chrome (no SwiftShader flags). The script starts localhost automatically. Output: ndlocr-mac-proof/report.json, screenshots, browser logs. The hosted macOS runner may not expose the Apple GPU; such runs must not pass the hardware acceptance gate.

To test the patched model, either download the verified-detector artifact into ndlocr-lite-v2/ or generate it locally with an isolated Python environment:
    python3 -m venv /tmp/ndlocr-gpu-venv
    /tmp/ndlocr-gpu-venv/bin/pip install onnx==1.19.1 onnxruntime==1.23.2 numpy
    /tmp/ndlocr-gpu-venv/bin/python ndlocr-lite-v2/patch-deim.py
    DET_PATCH=1 ORT_VERSION=$(npm view onnxruntime-web version) HEADLESS=0 node ndlocr-lite-v2/mac-gpu-bench.cjs

CI workflow: .github/workflows/ndlocr-gpu-isolated.yml. CPU patch parity, software GPU correctness and browser benchmark UI are independent jobs; real Mac speed measurement is manual. The original branch/main model remains unchanged.

## Actual Mac: browser-only measurement (primary workflow)
No hosted macOS runner speed tests. Use the browser benchmark on the user's own Mac. Download the branch archive or the mac-browser-benchmark Actions artifact, serve the files over localhost with python3 -m http.server 8000, then open the page in Chrome. Select an image or the built-in sample, click WASM / WebGPU 比較開始. Four modes are measured with one cold run and 3 or 5 warm repetitions. Median end-to-end time, per-model session.run times and GPU dispatch/submit counts are recorded. The JSON omits recognized text and source pixels, but includes equality to the WASM reference, image dimensions and GPU diagnostics. Cold means fresh sessions; model download may hit cache. The 1.5x target is provisional; real Mac measurements decide. The standalone benchmark does not require Node or a Mac runner. Keep native CLI benchmark optional, not CI.

Patch iteration: initial Mul+ReduceSum candidate failed strict full-model CPU parity (19/1200 label positions differed on a synthetic input). Current candidate uses rank-2 RHS MatMul followed by Squeeze to avoid rank-1 WebGPU handling without changing the operation. The strict parity check is retained; no unverified model is shipped.
