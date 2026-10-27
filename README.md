# LEVEL STUDIO：Web版とWindows版

凹凸のある地形・階段・坂・上下の経路を生成し、既存モデルの配置、編集、一人称の歩行確認、JSON保存、GLB出力ができる試作ツールです。

## 公開先（2026-10-27更新）

- [Web版を開く](https://level-studio-world.netlify.app)
- [Windows 0.1.37のダウンロード](https://github.com/kanappe866oyn-alt/level-studio/releases/tag/v0.1.37)
- [公開ソース](https://github.com/kanappe866oyn-alt/level-studio)

0.1.37では、AI設定で軽量モデル(gemini-3.5-flash-lite)を選べるようにし、既定にしました(Flash自動更新はこのアプリの生成で時間切れ・503の記録があるため)。サーバーエラーの表示にHTTPステータスを含めます。0.1.36以前の内容: AI生成ステージに蛇行する川、段丘と階段、岩の群れ、橋と道の高さ調整を追加し、参考画像の川・橋・階段・崖・段丘を読み取って配置へ反映します。画像だけの生成では、階段や台の色・素材が参考画像と異なることがあります。滝と砂浜は未対応です。タグ v0.1.37 のソース、配布ZIP、Web版は同じビルドに対応します。

Web版の新規立体集落はルール36です。岩山を土台へ寄せ、広い広場には樹木・植栽枡・ベンチをまとめて配置します。通路・建物・上段床・指定した視線を保護し、置けない場所には追加しません。

現在のWeb版はNetlify CLIから手動で公開しています。GitHubへ変更を送るだけではサイトへ自動反映されません。Windows版0.1.34にはWebのルール36・街路樹・表示改善・文章条件と配置補正を同梱しています。生成・保存復元・Web作品の読込保存を検証済みです。

## 使い分け

ブラウザ版はURLを開いて試すための入口。Windows版はモデルと構造ルール生成を同梱し、開発サーバー不要で起動できます。構造ルール生成・編集・歩行・保存はオフライン対応。クラウドAIには両方とも接続とAPI設定が必要です。アプリだからAI精度や速度が上がるという仕様ではありません。

作品は各ブラウザ／Windowsユーザーの保存領域に残ります。端末間の自動同期はありません。JSONファイルを保存し、もう一方で開くことで移動できます。

## 開発・ビルド

Node.js 22.12以降を使用します。

```powershell
npm ci
npm run dev
```

```powershell
npm test
npm run lint
npm run build
```

公開用の最小ソースでは、配布URLと同梱ファイル境界の単独検査を実行します。元の制作環境の全テストや過去の検証データは含めません。

## 公開構成

Web版はNetlify、WindowsのZIPはGitHub Releasesで配布する構成です。

1. GitHubに新しいリポジトリを作り、公開用ソースフォルダの内容を入れます。元の制作フォルダ全体をアップロードしないでください。公開用ソースは必要なファイルを許可リストで複製し、APIキー、研究結果、学習データ、作業ログ、保存作品を含めていません。
2. GitHub Releasesに、確認済みの `LevelStudio-0.1.37-win-x64.zip` を添付します。ソースのリポジトリにはアプリのZIPやreleasesフォルダを入れません。
3. Releaseの実際のZIPダウンロードURLを、`src/data/desktopRelease.json` の `url`、またはNetlifyの環境変数 `VITE_DESKTOP_DOWNLOAD_URL` に設定します。HTTPSのZIP URLが必要です。これは公開用リンクであり、秘密情報ではありません。
4. Netlifyでそのリポジトリを選び、ビルド `npm run build`、公開先 `dist` としてデプロイします。設定は `netlify.toml` に含まれます。
5. 公開ページの画像・サンプル生成・Worker・モデル読み込み・JSON保存・GLB出力とWindowsのダウンロードを確認します。

公開URL未設定のサイトは「配布ファイルの公開準備中」を表示します。架空のダウンロード先を出しません。ローカルのVite開発／プレビューでは `releases/0.1.33/LevelStudio-0.1.37-win-x64.zip` を専用の経路でダウンロードできます。このZIPはWebビルドや次のWindowsアプリに混入しません。

## API・公開範囲

クラウドAPIキーは各利用者がエディタで設定します。開発用 `.env` をGitHubへ登録したり、NetlifyのVITE変数へ共通APIキーを入れたりしないでください。ローカルAIサーバーや学習済みモデル本体はWeb版・Windows版に含みません。

同梱素材には外部由来と自作のモデルが含まれます。トップの素材クレジットを保持します。権利・ライセンスの全素材照合はこの作業では完了していないため、公開配布する素材の利用・再配布条件を確認してから公開します。

Windows版は64bit向けのZIP試作版。ZIPをすべて展開し、`LevelStudio.exe` を起動します。DLL・resources・localesを含むフォルダ全体が必要です。署名付きインストーラー・自動更新・別PCでの動作検証はまだ提供していません。

設定の根拠：[NetlifyのVite設定](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/)、[GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)。

