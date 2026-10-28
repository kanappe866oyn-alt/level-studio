import React from 'react';
import './landing.css';
import { formatDraftTime } from './core/draftStorage.js';
import { isDesktopApp } from './core/runtimePlatform.js';
import { desktopDownload } from './core/desktopDistribution.js';

const features = [
  ['01', '役割を考えて、配置する。', '「中央に遮蔽物を」「高所へ続く足場を」。ゲームモードやテーマに合わせて、AIが役割に沿った配置を提案します。'],
  ['02', '意図を見て、手で磨く。', '配置と設計理由を確認し、移動・回転・拡縮で調整。追加の指示と手動編集を組み合わせ、自分の意図に近づけます。'],
  ['03', '歩いて、空間を確かめる。', 'ルール検査やAI評価を参考に、一人称視点で動線や広さを確認。仕上げたステージはGLB形式で書き出せます。'],
];

const creditGroups = [
  { title: 'モデル', sites: [
    ['Quaternius', 'https://quaternius.com/index.html'],
    ['Kenney', 'https://kenney.nl/assets'],
    ['Sketchfab', 'https://sketchfab.com/feed', 'CC0の素材のみ使用'],
    ['Open Source 3D Assets', 'https://www.opensource3dassets.com/ja'],
    ['The Base Mesh', 'https://www.thebasemesh.com/'],
  ] },
  { title: 'マテリアル', sites: [
    ['ambientCG', 'https://ambientcg.com/'],
    ['CGBookcase', 'https://www.cgbookcase.com/'],
  ] },
  { title: 'モデル・マテリアル', sites: [
    ['Poly Haven', 'https://polyhaven.com/'],
  ] },
];

export default function LandingPage({ scenes, onLaunch, onSelectScene, drafts = [], storageWarning = '', onRestoreDraft, hasCurrentWork = false }) {
  const desktop = isDesktopApp();
  const download = desktopDownload({ url: import.meta.env.VITE_DESKTOP_DOWNLOAD_URL || '', hostname: globalThis.location?.hostname || '' });
  return (
    <div className="lp" lang="ja">
      <a className="lp-skip" href="#lp-main">本文へ移動</a>
      <header className="lp-header lp-wrap">
        <a className="lp-brand" href="#lp-main"><span aria-hidden="true">◇</span> LEVEL STUDIO<small>LLM-Driven 3D Level Generator</small></a>
        <nav aria-label="トップページ">
          <a href="#lp-features">できること</a><a href="#lp-starters">スターター</a>{!desktop && <a href="#lp-desktop">Windowsアプリ</a>}
          <button type="button" className="lp-button lp-button-small" onClick={onLaunch}>エディタを開く ↗</button>
        </nav>
      </header>
      <main id="lp-main" className="lp-wrap" tabIndex={-1}>
        {storageWarning && <p className="lp-recovery-warning" role="status">{storageWarning}</p>}
        {drafts.length > 0 && <section className="lp-recovery" aria-labelledby="lp-recovery-title">
          <div><h2 id="lp-recovery-title">保存した作業を再開</h2><p>{desktop ? 'このアプリに保存した最近の作業です。最大5件まで残ります。' : 'このブラウザに保存した最近の作業です。最大5件まで残ります。'}</p></div>
          <div className="lp-recovery-list">{drafts.map(draft => <button type="button" key={draft.id} onClick={() => onRestoreDraft(draft)}>
            <strong>{draft.project.metadata.theme || 'テーマ未設定のステージ'}</strong>
            <span>{formatDraftTime(draft.savedAt)} · {draft.project.objects.length}個のオブジェクト</span>
            <span>この作業を再開 ↗</span>
          </button>)}</div>
        </section>}
        <section className="lp-hero" aria-labelledby="lp-title">
          <div>
            <p className="lp-eyebrow">YOUR WORDS. YOUR WORLD.</p>
            <h1 id="lp-title">アイデアを、<br /><span>歩ける世界に。</span></h1>
            <p className="lp-lead">凹凸のある地形、階段、坂、上下に重なる道。<br />構造ルールやAIで組み立て、歩いて確かめながら仕上げる3Dステージ制作ツール。</p>
            <div className="lp-actions"><button type="button" className="lp-button" onClick={onLaunch}>{hasCurrentWork ? '現在の作業に戻る' : desktop ? 'アプリで制作をはじめる' : 'ブラウザで試す'} <span aria-hidden="true">↗</span></button><a className="lp-secondary" href={desktop ? '#lp-starters' : '#lp-desktop'}>{desktop ? 'サンプルを試す ↓' : 'Windowsアプリを見る ↓'}</a></div>
            <p className="lp-note">サンプルの編集・テストプレイ・保存はAPIキーなしで体験できます。AI生成には設定が必要です。</p>
            <div className="lp-quick-start" aria-label="サンプルからすぐに始める"><span>まずは体験</span>{scenes.slice(0, 3).map(scene => <button type="button" key={scene.id || scene.title} onClick={() => onSelectScene(scene)}>{scene.title} <span aria-hidden="true">↗</span></button>)}</div>
          </div>
          <figure className="lp-preview lp-real-preview">
            <div className="lp-preview-bar"><span><i /> GENERATED STAGE</span><span>FREE / EXPLORATION</span></div>
            <img src={`${import.meta.env.BASE_URL}images/stage-overview.png`} alt="構造ルールで生成した、岩山・段丘・住宅・上層回廊がある集落の実画面" width="1280" height="720" fetchPriority="high" />
            <figcaption className="lp-preview-footer"><span>土台から組み立て、実際に歩ける。</span><small>実際の生成画面・番号8</small></figcaption>
          </figure>
        </section>
        <div className="lp-capabilities" aria-label="主な機能"><span>自然言語による生成</span><span>3Dオブジェクト編集</span><span>一人称テストプレイ</span><span>GLBエクスポート</span></div>
        <section id="lp-desktop" className="lp-section lp-download" aria-labelledby="lp-desktop-title">
          <p className="lp-eyebrow">BROWSER TO DESKTOP</p>
          <h2 id="lp-desktop-title">まず試すならブラウザ。<br />じっくり作るならWindowsアプリ。</h2>
          <p className="lp-section-intro">生成・編集の機能は共通。作品はJSONファイルで持ち運べます。アプリでは、開発サーバーを起動せずに制作を始められます。</p>
          <div className="lp-grid lp-desktop-benefits">
            <article className="lp-card"><h3>ネットなしでも、土台から作れる。</h3><p>モデルと生成処理を同梱。構造ルールでの生成・編集・歩行確認・保存はオフラインで使えます。クラウドAIにはネット接続とAPI設定が必要です。</p></article>
            <article className="lp-card"><h3>アプリを開いて、作業を再開。</h3><p>サーバーの手動起動は不要。最近の作業をアプリ内に最大5件保存し、終了後も再開できます。ブラウザのサイトデータとは保存先が別です。</p></article>
            <article className="lp-card"><h3>ファイルで作品を残せる。</h3><p>Windowsの保存画面からJSON・GLBの保存先を選べます。JSONは再編集用、GLBはほかの3Dツールへ渡すための形式です。</p></article>
          </div>
          <div className="lp-comparison-wrap"><table className="lp-comparison"><caption>使い方に合わせて選ぶ</caption><thead><tr><th scope="col">できること</th><th scope="col">ブラウザ</th><th scope="col">Windowsアプリ</th></tr></thead><tbody>
            <tr><th scope="row">構造ルール生成・編集・歩行確認</th><td>対応</td><td>対応</td></tr>
            <tr><th scope="row">はじめ方</th><td>URLを開く</td><td>ZIPを展開して起動</td></tr>
            <tr><th scope="row">オフラインでの制作</th><td>ページやモデルの読み込みに接続が必要</td><td>構造ルール生成から保存まで対応</td></tr>
            <tr><th scope="row">作業の自動保存</th><td>使っているブラウザ内</td><td>Windowsユーザーのアプリ内</td></tr>
            <tr><th scope="row">クラウドAI</th><td>接続・API設定が必要</td><td>接続・API設定が必要</td></tr>
          </tbody></table></div>
          <div className="lp-download-panel">
            <div><h3>{desktop ? 'Windowsアプリで制作できます。' : 'Windows版をダウンロード'}</h3><p>{download.platform} · 試作版 {download.version} · ZIP形式</p></div>
            {desktop ? <button type="button" className="lp-button" onClick={onLaunch}>アプリで制作を続ける ↗</button> : download.available
              ? <a className="lp-button" href={download.url} download={download.local ? download.fileName : undefined}>Windows版をダウンロード ↓</a>
              : <p className="lp-download-status" role="status">配布ファイルの公開準備中です。ブラウザ版は今すぐ使えます。</p>}
            <ol><li>ZIPをダウンロードして「すべて展開」します。</li><li>展開したフォルダ内の「LevelStudio.exe」を開きます。</li><li>周りのファイルも必要です。移動するときはフォルダごとコピーします。</li></ol>
            <p className="lp-note">Windows 64bit向けの試作版です。ブラウザとアプリの自動保存は同期しません。「保存」で残したJSONを「開く」から読み込んで移動してください。</p>
          </div>
        </section>
        <section id="lp-features" className="lp-section" aria-labelledby="lp-features-title">
          <p className="lp-eyebrow">CREATE / REFINE / EXPLORE</p><h2 id="lp-features-title">配置に意味を、空間に意図を。</h2>
          <div className="lp-grid">{features.map(([number, title, text]) => <article className="lp-card" key={number}><span className="lp-number">{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>
        <section id="lp-starters" className="lp-section" aria-labelledby="lp-starters-title">
          <p className="lp-eyebrow">TRY A SAMPLE</p><h2 id="lp-starters-title">完成済みのステージで試そう。</h2><p className="lp-section-intro">サンプルを選ぶと、配置済みのステージがすぐ開きます。APIキー不要で、オブジェクトの編集・テストプレイ・保存を体験できます。</p>
          <div className="lp-grid">{scenes.map((scene, index) => <button className="lp-card lp-scene" type="button" key={`${scene.title}-${index}`} onClick={() => onSelectScene(scene)}><div className={`lp-scene-art lp-scene-art-${scene.mode}`} aria-hidden="true"><span /><span /><span /><span /><span /></div><span className="lp-tag">APIキー不要 / {scene.theme}</span><h3>{scene.title}</h3><p>{scene.description}</p><span className="lp-scene-link">サンプルを開く ↗</span></button>)}</div>
        </section>
        <section className="lp-section lp-workflow" aria-labelledby="lp-workflow-title"><div><p className="lp-eyebrow">HOW IT WORKS</p><h2 id="lp-workflow-title">小さく作って、<br />試しながら育てる。</h2></div><ol><li><h3>作りたい空間を伝える</h3><p>自由制作・対戦・アスレチックから選び、広さや配置したいものを伝えます。</p></li><li><h3>生成結果を調整する</h3><p>配置と設計理由を見比べ、追加の指示や手動編集で整えます。</p></li><li><h3>歩いて確認し、保存する</h3><p>一人称視点で動線やスケールを確認。プロジェクト保存やGLB出力で残します。</p></li></ol></section>
        <section className="lp-section lp-faq" aria-labelledby="lp-faq-title"><p className="lp-eyebrow">GOOD TO KNOW</p><h2 id="lp-faq-title">はじめる前に。</h2><details><summary>サンプルを使うのにAPIキーは必要ですか？</summary><p>必要ありません。完成済みの配置を編集し、一人称で歩いたり、JSON・GLBで保存したりできます。追加のAI生成や評価を使うときにAI設定を行ってください。</p></details><details><summary>作業は自動保存されますか？</summary><p>{desktop ? 'このアプリ内に最近の作業を最大5件保存します。終了して開き直した後も「保存した作業を再開」から戻れます。ブラウザ版との保存領域は別です。作品の移動や長期保管には「保存」でJSONファイルを残してください。APIキー・参考画像・Undoの履歴は自動保存に含みません。' : 'このブラウザ内に最近の作業を最大5件保存します。再読み込み後はページ上部の「保存した作業を再開」から戻れます。タブやブラウザを閉じても残ります。同じブラウザ・同じURLで再開してください。サイトデータの削除やシークレットモードの終了時には消えます。別の端末への移動や長期保管には、エディタの「保存」でJSONファイルを残してください。APIキー・参考画像・Undoの履歴は自動保存に含みません。'}</p></details><details><summary>他の人の作品が表示されることはありますか？</summary><p>{desktop ? '作品は、このWindowsユーザーのアプリ内に保存されます。ブラウザ版や別の端末との自動同期はありません。同じWindowsユーザーを共有する場合は保存履歴も共有されます。' : '別のPCの作品は表示されません。作品は各自のブラウザに保存され、端末間の自動同期はありません。同じPC・同じブラウザの同じプロフィールを共有する場合は、保存履歴も共有されます。'}</p></details><details><summary>操作方法はどこで確認できますか？</summary><p>エディタ上部の「操作ガイド」で、視点操作・編集・テストプレイ・保存の手順を確認できます。PCとマウスでの操作をおすすめします。</p></details><details><summary>AIを使うには何が必要ですか？</summary><p>GeminiにはAPIキー、ローカルAIには対応サーバーの起動が必要です。エディタ内で設定してください。</p></details><details><summary>どのような3D空間を作れますか？</summary><p>用意されたモデルを、地面・遮蔽物・足場などの役割に沿って配置します。生成後も手動で調整でき、遊びやすさは実際に歩いて確認します。</p></details></section>
        <section className="lp-final"><p className="lp-eyebrow">LET'S BUILD YOUR NEXT LEVEL</p><h2>次の世界は、あなたのアイデアから。</h2><button type="button" className="lp-button" onClick={onLaunch}>エディタを起動する ↗</button></section>
        <section id="lp-credits" className="lp-section lp-credits" aria-labelledby="lp-credits-title">
          <p className="lp-eyebrow">ASSET CREDITS</p>
          <h2 id="lp-credits-title">素材クレジット</h2>
          <p className="lp-section-intro">モデルやマテリアルの一部に、以下のサイトで公開されている素材を使用・参考にしています。すべてのモデルが外部素材ではなく、制作者自身が制作したモデルも含まれています。素材を公開してくださった皆さまに感謝します。</p>
          <div className="lp-credit-groups">{creditGroups.map(({ title, sites }) => (
            <div key={title}>
              <h3>{title}</h3>
              <ul>{sites.map(([name, url, note]) => (
                <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{name} <span aria-hidden="true">↗</span><span className="lp-sr-only">（新しいタブで開く）</span></a>{note && <small>{note}</small>}</li>
              ))}</ul>
            </div>
          ))}</div>
        </section>
      </main>
      <footer className="lp-footer lp-wrap"><span>LEVEL STUDIO</span><span>Imagine. Build. Play.</span><a href="#lp-credits">素材クレジット</a><a href="#lp-main">ページ上部へ ↑</a></footer>
    </div>
  );
}
