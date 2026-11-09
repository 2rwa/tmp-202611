# MLIT GEO / 地理空間 MCP Server 実験

[GitHub Pages 地図デモ](https://2rwa.github.io/tmp-202611/geo-mcp/) の初期表示は**合成サンプル**です。実際の地価・防災情報ではありません。

[Zenn記事](https://zenn.dev/truestar/articles/ced30276b8d1ed) を参照した、
[国土交通省 地理空間 MCP Server（α版）](https://github.com/chirikuuka/mlit-geospatial-mcp)
の接続と地理データ可視化を試す独立した実験です。

## 内容

- probe.py: Python標準ライブラリだけで動く MCP stdio JSON-RPC クライアント。
- mock_server.py: 通信、ツール一覧、ツール呼び出しを再現する架空データのサーバ。
- index.html / app.js: GitHub Pages で、結果JSON内のGeoJSONをLeaflet/OpenStreetMapに描画。
- tests/geo-mcp.test.cjs: モックでMCP初期化・ツール呼び出し・座標・GeoJSON・異常系を検証。
- .github/workflows/geo-mcp.yml: 自動モックテストと実データの手動テスト。

## APIキーなしで試す

Python 3.10以上が必要です。リポジトリ直下から：

    python3 geo-mcp/probe.py --mock --lat 35.5074 --lon 139.6176 --apis 3,5,15,26 --distance 250 --out geo-mcp/result.json
    node tests/geo-mcp.test.cjs

生成された geo-mcp/result.json を地図ページの「MCP結果のJSONを読み込む」に指定します。
モックは合成ジオメトリであり、**実際の土地価格や災害情報ではありません**。
個別結果JSONはリポジトリにコミットしないでください。

## 国交省の実APIへ接続する

1. [不動産情報ライブラリ API利用申請](https://www.reinfolib.mlit.go.jp/api/request/) でAPIキー取得。
2. [公式MCP Server](https://github.com/chirikuuka/mlit-geospatial-mcp) を取得し、公式READMEに従い仮想環境とrequirements.txtをセットアップ。
3. 環境変数 LIBRARY_API_KEY にキーを**非公開で**設定します。シェル履歴・コード・URL・Gitには残さないようにしてください。
4. サーバの依存関係をインストールしたPython環境で、次を実行します。

    python3 geo-mcp/probe.py --server /path/to/mlit-geospatial-mcp/src/server.py --lat 35.5074 --lon 139.6176 --apis 3,5,26 --distance 250 --year 2025 --out geo-mcp/result.json

得られたJSONを地図画面に読み込みます。**ブラウザにはAPIキーを渡しません**。

### GitHub Actions

Repository Secret名 MLIT_LIBRARY_API_KEY に利用申請したキーを登録します。
Actions → 「MLIT Geospatial MCP smoke test」 → 「Run workflow」 → live = true。
Actions runnerが公式リポジトリを取得してMCP経由で実APIを呼び、成功時に
geo-mcp-live-result というArtifactとしてJSONを出力します。
Artifactをダウンロードし地図ページで読み込めます（実データを公開ページには置きません）。

## どこまで確認するか

| API番号 | データ例 | 形状例 |
| --- | --- | --- |
| 3 | 地価公示・地価調査 | 点 |
| 5 | 用途地域 | ポリゴン |
| 15 | 駅別乗降客数 | 線など |
| 26 | 洪水浸水想定区域 | ポリゴン |

上流は get_multi_api を公開し、target_apis にAPI番号を渡す設計です。
上流が取得結果ファイル保存の確認を求める仕様なので、クライアントは
save_file=false を明示します。クライアントの --out は独立したJSON保存です。

点検索は最大425mの制限があります。API種別によって検索方式・年度・範囲が異なり、
結果ゼロや欠損は珍しくありません。地図表示は受け取ったGeoJSONを描くだけで、
補間や危険性推定を行いません。初期設定は3,5,26の3 APIで、全API呼び出しを避けます。
取得データの真正性・更新年月・凡例・座標系は利用者が公的原典と照合してください。
ブラウザはMCPに直接接続せず、MCP通信はローカルPythonまたはGitHub Actions内で完結します。
