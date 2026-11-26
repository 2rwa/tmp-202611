# Browser OCR regression contract

Sources: [NDL v2 announcement](https://lab.ndl.go.jp/news/2026/2026-11-24/), [usage](https://lab.ndl.go.jp/data_set/ndlocrlite-usage/), [official source pinned](https://github.com/ndl-lab/ndlocr-lite/tree/1f3adc7af311af1ce4cbbd4d9089f30781d01313). User reference https://joho-todai.com/ndlocr-lite-2-0-0-gpu-free-ocr/ could not be retrieved; official sources define the initial scope.

Run: npm install --no-save --no-package-lock playwright@1.56.1 pdf-lib@1.17.1 pdfjs-dist@4.10.38 adm-zip@0.5.16; npx playwright install chromium; node ndlocr-lite-v2/regression.cjs
Set NDLOCR_TEST_URL to test actual Pages instead of local HTTP. Set STRICT_FEATURES=1 to fail on PENDING and BASELINE_FAIL. No Pages gate.

PASS = assertion satisfied; FAIL = implemented feature regression, fails CI; PENDING = explicit future UI contract not yet present; BASELINE_FAIL = exploratory existing OCR quality or reading order below threshold (not a pass; promote to required when fixed). Each case saves screenshot; report.json contains observations; fixture images and actual downloads in artifact. No mocked inference. Generated printed samples have known truth. Handwriting uses upstream sample images and approximate known text prefix (not a statistically representative benchmark).

## Feature priority and UI contract (proposed)
| ID | Acceptance |
|---|---|
| 01–04 | exact sample, JSON boxes in bounds, single line EN/JA |
| 05–08 | vertical right-to-left, two-column reading order, actual upstream handwriting (prefix CER) |
| 09 | #crop toggles crop selection on preview via mouse, #run recognizes only selected region |
| 10 | #normalize-variants checkbox, original / normalized characters |
| 11 | #table-structure checkbox; HTML export contains exact 3×3 table |
| 12 | PDF upload; #page-next / #page-prev; two-page searchable PDF with text extraction |
| 13 | #export-format select (txt/xml/tei/markdown) and #export download; content + parseability |
| 14 | DAISY ZIP with OPF, NCX, SMIL and text; initial structural checks (full DAISY conformance separate) |
| 15 | multiple image files with page navigation |
| 16–17 | warm model cache with ONNX URL blocked; no non-GET requests during local OCR |

Next tests to add before implementing each corresponding feature: 30/50/100 cascade and >100-character lines, vertical-in-horizontal (縦中横), merged table cells, rubies/complex layout, PDF image preservation + invisible text geometry, DAISY schema/link validation, screen capture with user permission, WebGPU actual EP profiling and browser matrix, full JaWildText handwriting CER. No fake tests or silent skips. Selectors are intended implementation contract, not current UI claims.

Cases 18–19: real cascade inference and long horizontal line splitting (exploratory CER). logic.test.mjs tests thresholds, split geometry and XY-cut order. Short-model selection is driven by the detector, not a character-count estimate.

Cases 09–10 implemented; verify actual crop coordinates in original image space, clearing selection invalidates stale output, and normalized JSON retains raw OCR text. Mapping is NDL's official character inclusion CSV (4905 entries at pinned revision), not NFKC. Tests still need real Chromium execution.

Case 20: experimental TCY, mixed vertical text and horizontal digits; compare enabled/disabled output and JSON flag. Baseline quality failure is tracked. Fixes for cases 03–06, 09–10, 17: trim uniform margins in single-line mode; suppress overlapping near-identical line detections across classes. Unit tests cover geometry and TCY projection. TableCenterNet remains unimplemented.

Case 11 enabled: actual TableCenterNet inference, model log, cell count, 3×3 HTML exact contents. table.test.mjs tests synthetic tensors, coordinate mapping, merged-cell HTML and escaping. Experimental single-region table decoder; official relocation and recovery remain pending. TXT/HTML exports now available.

Cases 12, 13, 15 enabled: actual two-page PDF OCR, navigation and re-extraction from exported searchable PDF (English and Japanese), XML/TEI/Markdown, multi-image batch. Main default ORT 1.31.1; table model previously failed due to unavailable DeformConv in 1.22.0 and is now retested. PDF rendering and font URLs are pinned; native browser/real OCR tests pending.

Run 45720772538: 16 PASS, 2 FAIL (crop pointer, table text), 1 PENDING (DAISY), 1 BASELINE_FAIL (long line). PDF two-page input/searchable export incl. Japanese, NDL XML/TEI/Markdown and multi-image passed. New tests verify DAISY archive/XML/cross-file links, crop selection before OCR, wide-line splitting and short-cell OCR. Table and long-line recognition still require real inference verification.

Run 45721411608: PASS 18, FAIL 2, zero pending/precision failures. Crop, 126-character long-line exact, and DAISY cross-reference test passed. Cascade used rec30 for all 3 lines but cached-session initialization log was absent; log reused session shape. Table 3x3 grid exact, but single-glyph values 二/三 misread; previous blanket cell refinement introduced a false negative in りんご. Replace with rule-snapped interior crop, geometry-gated single-glyph padded candidates, preserve multi-glyph text; detailed candidate diagnostics on failure. This is an experimental OCR refinement, not a validated accuracy improvement yet.

Run 45724509527: 19 PASS, 1 FAIL (single-glyph 二/三), Pages successful. Keep exact table accuracy assertion. Expanded short-glyph model/geometry candidates (experimental). Tests 21 and 22 cover text/cell editing, original text, coordinates, navigation, exports and restore. Table edits are distinct from body lines.

Run 45754805153: all 22 PASS; table exact, both correction regressions PASS. GPU 1.31.1 all/disabled PASS, obsolete 1.22.0 known failures removed from automatic matrix; pinned 1.31.1/all remains. Case 23 verifies real compressed multipage TIFF, navigation, JSON dimensions and text export. TIFF decoder support beyond tested fixtures remains experimental.
