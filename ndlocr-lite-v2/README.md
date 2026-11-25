# NDLOCR-Lite 2.0 Browser Lab

非公式のブラウザ移植実験。モデルは国立国会図書館の公式 v2.0.0 (commit 1f3adc7af311af1ce4cbbd4d9089f30781d01313) を使用し、ブラウザが直接取得・SHA-256照合・Cache API保存する。画像は外部送信しない。モデルをリポジトリには追加しない。

- DEIM（ファイル名1024×1024、実入力800×800） + PARSeq（100文字を既定、30/50/100カスケード選択可）、WASMを既定にする。
- ONNX protobufの実入力寸法を検出・認識双方で取得し、リサイズ、サイズテンソル、座標逆変換に利用する。ファイル名から推測しない。
- WebGPU + WASM は実験的な混合EP（全演算GPU実行を保証しない）。
- ページモードは行クラス抽出・簡易重複抑制・簡易XY-cutによる横/縦読み順。1行モードは検出を省略。
- 公式の読み順、縦中横、表、PDFは未移植。カスケードと水平長文の2分割は公式Pythonの処理に準拠するが実画像で検証中。Canvas補間もPythonと完全一致しない。
- ORT Web 1.22.0をCDNから取得。WASMはPagesのCOOP/COEP不要な1スレッド。初回はインターネット接続が必要。キャッシュはブラウザが削除する場合がある。
- Pages: https://2rwa.github.io/tmp-202611/ndlocr-lite-v2/
- ローカル: リポジトリ直下で `python3 -m http.server 8000` → /ndlocr-lite-v2/

出典・改変元: [国立国会図書館 NDLOCR-Lite](https://github.com/ndl-lab/ndlocr-lite/tree/1f3adc7af311af1ce4cbbd4d9089f30781d01313) (CC BY 4.0)。モデル・文字集合は公式のまま。JavaScript移植・UIは非公式。依存モデル/ライブラリについては上流のLICENCE_DEPENDENCEIESも参照。

## Regression tests
See [TESTS.md](TESTS.md) for the feature contract, fixtures and test command. OCR regression workflow is independent of Pages deployment.

- 範囲指定: プレビュー上のドラッグ矩形を実際の検出入力に切り出し、JSON座標は元画像基準で保持する。範囲解除・画像切替時は結果をクリアする。
- 異体字包摂: 固定リビジョンの公式CSVを必要時に取得し、多文字の最長一致を先に、単文字置換を後に実行する。JSONにrawTextと変換済みtextを保存する。チェック変更後にOCRを再実行する。

- 1行モードでは画像の境界輝度を基準に文字領域を切り出す。文書モードでは異なる行クラス間も重複抑制する。
- 縦中横（実験）: 公式TCYラッパーの投影・横方向成分数・文字列長による採用条件を移植。既定では無効。実画像で検証中。
