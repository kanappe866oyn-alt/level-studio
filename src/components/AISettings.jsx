import { useEffect, useRef, useState } from 'react';
import { checkAIConnection, listGenerationModels, explainAIError, normalizeLocalUrl, saveSessionKey, getSessionStorage } from '../core/aiSettings';

export default function AISettings({ mode, setMode, model, setModel, apiKey, setApiKey, environmentKey, localUrl, setLocalUrl, connection, setConnection, onClose }) {
  const [visibleKey, setVisibleKey] = useState(false);
  const [remember, setRemember] = useState(() => {
    try { return !!sessionStorage.getItem('world-studio-api-key'); } catch { return false; }
  });
  const [urlDraft, setUrlDraft] = useState(localUrl);
  const [storageMessage, setStorageMessage] = useState('');
  const [models, setModels] = useState([]);
  const [listing, setListing] = useState(false);
  const [modelMessage, setModelMessage] = useState('');
  const request = useRef(null);
  const dialog = useRef(null);
  const checking = connection.status === 'checking';
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  const invalidate = () => {
    request.current?.abort();
    request.current = null;
    setListing(false);
    setConnection({ status: 'idle', message: '' });
  };
  const updateKey = value => {
    invalidate();
    setModels([]); setModelMessage('');
    setApiKey(value);
    if (!saveSessionKey(getSessionStorage(), value, remember)) setStorageMessage('ブラウザに保存できませんでした。この画面では利用できます。');
  };
  const loadModels = async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setListing(true); setModelMessage('利用できるモデルの情報を取得しています…');
    setConnection({ status: 'idle', message: '' });
    try {
      const available = await listGenerationModels({ key: apiKey.trim() || environmentKey, signal: controller.signal });
      if (request.current === controller) {
        setModels(available);
        setModelMessage(available.length ? 'Googleからモデル候補を取得しました。モデルを選び、接続を確認してください。実際の生成には別途利用枠が必要です。' : '文章生成用のモデル候補が見つかりませんでした。キーの利用権限を確認してください。');
      }
    } catch (error) { if (request.current === controller) setModelMessage(explainAIError(error)); }
    finally { clearTimeout(timeout); if (request.current === controller) setListing(false); }
  };
  const modelChoices = models.length ? [...models] : [{ id: 'gemini-pro-latest', label: 'Pro（自動更新）' }, { id: 'gemini-flash-latest', label: 'Flash（自動更新）' }, { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' }, { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' }];
  if (!modelChoices.some(option => option.id === model)) modelChoices.unshift({ id: model, label: `${model}（現在の選択）` });
  const check = async () => {
    if (mode === 'local') {
      try { setLocalUrl(normalizeLocalUrl(urlDraft)); } catch (error) { setConnection({ status: 'error', message: error.message }); return; }
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setConnection({ status: 'checking', message: '接続を確認しています…' });
    try {
      const message = await checkAIConnection({ mode, key: apiKey.trim() || environmentKey, model, localUrl: urlDraft, signal: controller.signal });
      if (request.current === controller) setConnection({ status: 'success', message });
    } catch (error) {
      if (request.current === controller) setConnection({ status: 'error', message: explainAIError(error) });
    } finally { clearTimeout(timeout); }
  };
  const close = () => { request.current?.abort(); request.current = null; if (checking) setConnection({ status: 'idle', message: '' }); onClose(); };
  return <div className="size-preview-overlay" onKeyDown={event => {
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const elements = [...dialog.current.querySelectorAll('button:not(:disabled), input, select, summary, a[href]')].filter(element => element.getClientRects().length);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <section ref={dialog} className="size-preview-dialog ai-settings" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title">
      <header><div><h2 id="ai-settings-title">AI設定</h2><p>利用するAIと接続方法を設定します。アカウント登録は不要です。</p></div><button className="tbtn" onClick={close}>閉じる</button></header>
      <div className="ai-settings-body">
        <label>利用するAI<select className="sel" value={mode} autoFocus onChange={e => { invalidate(); setMode(e.target.value); }}><option value="gemini">Gemini（クラウド）</option><option value="local">自作AI（ローカル）</option></select></label>
        {mode === 'gemini' ? <>
          <label>生成モデル<select aria-label="生成モデル" className="sel" value={/flash/.test(model) ? 'flash' : /pro/.test(model) ? 'pro' : 'custom'} onChange={e => { invalidate(); setModel(e.target.value === 'flash' ? 'gemini-flash-latest' : 'gemini-pro-latest'); }}><option value="flash">Flash</option><option value="pro">Pro</option>{!/(flash|pro)/.test(model) && <option value="custom">個別指定</option>}</select></label>
          <details><summary>モデルの詳細設定</summary>
          <label>使用するモデルID<select aria-label="モデルID" className="sel" value={model} onChange={e => { invalidate(); setModel(e.target.value); }}>{modelChoices.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <button type="button" className="tbtn" disabled={checking || listing || !(apiKey.trim() || environmentKey)} onClick={loadModels}>{listing ? 'モデル候補を確認中…' : '利用できるモデルを確認'}</button>
          {modelMessage && <p role="status">{modelMessage}</p>}
          </details>
          <label>Gemini APIキー<input className="inp" type={visibleKey ? 'text' : 'password'} value={apiKey} autoComplete="off" spellCheck={false} onChange={e => updateKey(e.target.value)} placeholder="自分のAPIキーを貼り付け" /></label>
          <div className="ai-settings-actions"><button className="tbtn" onClick={() => setVisibleKey(v => !v)}>{visibleKey ? 'キーを隠す' : 'キーを表示'}</button><button className="tbtn" onClick={() => { updateKey(''); setVisibleKey(false); }}>キーを削除</button><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">APIキーを取得する ↗</a></div>
          <label className="checkline"><input type="checkbox" checked={remember} onChange={e => { setRemember(e.target.checked); setStorageMessage(saveSessionKey(getSessionStorage(), apiKey, e.target.checked) ? '' : 'このブラウザでは保存できません。'); }} />このタブでキーを一時保存する</label>
          <p>保存しない場合、再読み込みでキーは消えます。一時保存はこのブラウザのタブ内だけで、プロジェクトファイルには含めません。共有PCでは保存を解除し、キーを削除してください。</p>
          <p>キーは通信時にGoogleへ送信されます。生成は、ご自身のGoogle側の利用枠・料金設定に従います。</p>
          {environmentKey && !apiKey && <p>開発用の環境キーが設定されています。公開用ビルドではこのキーを使いません。</p>}
        </> : <>
          <label>ローカルAIの接続先<input className="inp" value={urlDraft} onChange={e => { invalidate(); setUrlDraft(e.target.value); }} onBlur={() => {
            try { const value = normalizeLocalUrl(urlDraft); setLocalUrl(value); setUrlDraft(value); } catch (error) { setConnection({ status: 'error', message: error.message }); }
          }} placeholder="http://127.0.0.1:5000" /></label>
          <p>127.0.0.1は、このアプリを使っているPCを指します。他のPCで使う場合は、そのPCでAIサーバーを起動するか、アクセス可能な接続先を指定してください。</p>
        </>}
        {storageMessage && <p role="alert">{storageMessage}</p>}
        <div className="ai-settings-actions"><button className="btn b-blue" disabled={checking || listing || (mode === 'gemini' && !(apiKey.trim() || environmentKey))} onClick={check}>{checking ? '確認中…' : '接続を確認する'}</button><span>{mode === 'gemini' ? '文章生成をせず、モデル情報だけ確認します。' : 'サーバーの状態を確認します。'}</span></div>
        <p role={connection.status === 'error' ? 'alert' : 'status'} aria-live="polite" className={`ai-connection ${connection.status}`}>{connection.message || (mode === 'gemini' && !(apiKey.trim() || environmentKey) ? 'APIキーを入力してください。' : '接続はまだ確認していません。')}</p>
      </div>
    </section>
  </div>;
}
