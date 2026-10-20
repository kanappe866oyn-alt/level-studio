import { Component } from 'react';

// Suspense handles pending imports, but a rejected import or render failure
// needs a recovery screen. Never reload automatically or replace saved work.
export default class EditorRecoveryBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="editor-recovery" role="alert">
      <h1>エディタを表示できませんでした</h1>
      <p>読み込み、または画面の表示中に問題が起きました。接続先やアプリの状態を確認して、画面を再読み込みしてください。</p>
      <p>保存済みの作品は、トップ画面の「保存した作業を再開」から開けます。</p>
      <div className="editor-recovery-actions">
        <button type="button" onClick={() => window.location.reload()}>画面を再読み込み</button>
        <button type="button" onClick={this.props.onBack}>トップへ戻る</button>
      </div>
    </main>;
  }
}
