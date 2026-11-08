# PLaMo 3 Translate × 青空文庫: Actions benchmark

## Purpose
A reproducible, real-model Japanese-to-English translation speed/memory experiment on GitHub-hosted Ubuntu 24.04 CPU. This is a **llama.cpp CPU baseline** and must not be represented as WebGPU, browser WASM, iPhone, or Apple Silicon results.

## Primary sources
- 宮沢賢治『注文の多い料理店』: https://www.aozora.gr.jp/cards/000081/card43754.html
- 夏目漱石『吾輩は猫である』: https://www.aozora.gr.jp/cards/000148/card789.html

These authors' Japanese originals are public domain in Japan. The automated test downloads the Aozora Bunko XHTML text, decodes Shift-JIS, selects only main_text, strips ruby pronunciation markup, and samples deterministic contiguous passages. The input texts remain attributed; attribution and URL/hash are in the result artifacts. Do not confuse source text licensing with the PLaMo model's own Community License.

## Execution
Workflow: .github/workflows/plamo-aozora-benchmark.yml
Triggers: changes to the benchmark files on main, or manual workflow_dispatch.
Engine: latest llama.cpp source at run time (the actual revision is archived), built CPU-only, four threads.
Model: pfnet/plamo-3-translate-0.8b-GGUF, Q4_K_M, downloaded to the runner only. No weights committed.
Cases: short (~120 Japanese chars), medium (~370), long (~850), extra long (~1700); sources and exact text are archived. Temperature zero; PFML3 via the model's chat template with ja→en explicit.
Metrics: time to ready including model load, process peak resident memory, request wall time, reported prompt and generated tokens, end-to-end generated tokens/s and server-provided decoding speed when available.
Each case is run after a separate warm-up translation. Scores are single-run timings, not averages or accuracy judgments. Output length caps and finish reasons are recorded. Runs that truncate/return empty are a failure, not a successful throughput result.

## Artifacts
Download the "plamo-aozora-cpu-benchmark" artifact from the workflow run:
- results.md: summary table, linked in the workflow step summary
- results.json: translations, throughput, finish reasons, machine metadata
- cases.json: the original extracted passages, source URLs and source SHA-256
- server.log: llama.cpp runtime diagnostics
- llama-cpp-revision.txt: exact engine commit for the run

To compare browser execution, collect the same four cases on the built browser runtime in a separate workflow. Do not conflate CPU baseline with prior browser inference smoke tests.
