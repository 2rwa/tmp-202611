# NDLOCR-Lite 2.0 Browser Lab

非公式のブラウザ移植実験。モデルは国立国会図書館の公式 v2.0.0 (commit 1f3adc7af311af1ce4cbbd4d9089f30781d01313) を使用し、ブラウザが直接取得・SHA-256照合・Cache API保存する。画像は外部送信しない。モデルをリポジトリには追加しない。

- DEIM 1024×1024 + PARSeq 24×768（100文字）、WASMを既定にする。
- WebGPU + WASM は実験的な混合EP（全演算GPU実行を保証しない）。
- ページモードは行クラス抽出・簡易重複抑制・単純な横/縦読み順。1行モードは検出を省略。
- 公式の読み順、30/50/100モデルのカスケード、100文字超の分割、縦中横、表、PDFは未移植。Canvas補間もPythonと完全一致しない。
- ORT Web 1.22.0をCDNから取得。WASMはPagesのCOOP/COEP不要な1スレッド。初回はインターネット接続が必要。キャッシュはブラウザが削除する場合がある。
- Pages: https://2rwa.github.io/tmp-202611/ndlocr-lite-v2/
- ローカル: リポジトリ直下で `python3 -m http.server 8000` → /ndlocr-lite-v2/

出典・改変元: [国立国会図書館 NDLOCR-Lite](https://github.com/ndl-lab/ndlocr-lite/tree/1f3adc7af311af1ce4cbbd4d9089f30781d01313) (CC BY 4.0)。モデル・文字集合は公式のまま。JavaScript移植・UIは非公式。依存モデル/ライブラリについては上流のLICENCE_DEPENDENCEIESも参照。
