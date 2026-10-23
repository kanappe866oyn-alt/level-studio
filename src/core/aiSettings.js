export const SESSION_KEY = 'world-studio-api-key';
export function getSessionStorage() {
  try { return globalThis.sessionStorage; } catch { return undefined; }
}

export function readSessionKey(storage) {
  try { return storage?.getItem(SESSION_KEY) || ''; } catch { return ''; }
}

export function saveSessionKey(storage, key, remember) {
  try {
    if (!storage) return false;
    if (remember && key.trim()) storage?.setItem(SESSION_KEY, key.trim());
    else storage?.removeItem(SESSION_KEY);
    return true;
  } catch { return false; }
}

export function normalizeLocalUrl(value) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('接続先は http:// または https:// から始まるURLを入力してください。認証情報や検索文字列は含められません。');
  }
  return url.href.replace(/\/$/, '');
}

// Quota errors need user/provider state to change. A short immediate retry is
// reserved for a transient 503 response, not every failed generation.
export function shouldRetryAIError(error) {
  if (['AbortError', 'TimeoutError'].includes(error?.name) || ['SPATIAL_VALIDATION', 'AI_STEP_TIMEOUT', 'AI_REQUEST_LIMIT'].includes(error?.code)) return false;
  const status = Number(error?.status);
  if (status >= 400 && status <= 599) return status === 503;
  const message = String(error?.message || '');
  return /\b503\b/.test(message) && !/\b429\b/.test(message);
}

export function explainAIError(error) {
  if (error?.code === 'GENERATION_VALIDATION') return `生成案の検査で停止しました。既存のマップは保持しています。\n${String(error.message).slice(0, 1400)}`;
  if (error?.code === 'AI_OUTPUT_LIMIT') return 'AIの応答が出力上限で打ち切られました。入力の長さだけが原因ではありません。生成案は適用していません。';
  if (error?.code === 'AI_RESPONSE_BLOCKED') return 'AI側で応答が制限されました。生成案は受信できていません。既存のマップは保持しています。';
  if (error?.code === 'AI_RESPONSE_INCOMPLETE') return 'AIが完成した応答を返さなかったため停止しました。既存のマップは保持しています。';
  if (error?.code === 'AI_RESPONSE_FORMAT') return 'AIの応答を設計データとして読み取れませんでした。応答形式の問題であり、接続確認だけでは解決しません。';
  if (error?.code === 'AI_REQUEST_LIMIT') return error.message;
  if (error?.code === 'SPATIAL_VALIDATION') return `立体マップの設計条件を満たせませんでした。既存のステージを維持しています。${String(error.message).slice(0, 600)}`;
  if (error?.code === 'AI_STEP_TIMEOUT' && error.step === 'spatial') return '立体マップの設計が時間制限に達しました。エリア数や条件を減らして再試行できます。';
  if (error?.code === 'AI_STEP_TIMEOUT' && ['reading', 'planning'].includes(error.step)) return `${error.step === 'reading' ? '参考画像と指示の読み取り' : '自然地形の設計'}の応答を${Number.isFinite(error.timeoutMs) ? `${Math.round(error.timeoutMs / 1000)}秒` : '制限時間まで'}待ちましたが、完了しませんでした。入力が不正とは限りません。既存のマップは保持しています。時間を置いて再試行するか、AI設定で別のモデルを選べます。`;
  if (error?.code === 'AI_STEP_TIMEOUT') return `${error.step === 'reviewing' ? '生成結果の照合' : '3D配置の生成'}の応答が時間制限に達しました。短い指示でも、AIが出力する配置データの量によって時間がかかります。生成案は適用していません。`;
  const status = Number(error?.status);
  const message = String(error?.message || '');
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return '接続確認が時間切れになりました。通信環境やサーバーの起動状態を確認してください。';
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|APIキーが設定/.test(message)) return 'APIキーが未設定・無効、またはアクセスが許可されていません。AI設定でキーと利用権限を確認してください。';
  if (status === 429 || /\b429\b/.test(message)) return '利用回数・トークン・料金枠などの上限に達しました。Google AI Studioで利用枠を確認し、必要に応じて時間を置いて再試行してください。';
  if (status === 404 || /\b404\b/.test(message)) return '選択したモデル、またはローカルサーバーの接続先が見つかりません。AI設定で確認してください。';
  if (status >= 500 || /\b50[0234]\b/.test(message)) return 'AIサーバーでエラーが発生しています。少し時間を置いて再試行してください。';
  if (error instanceof SyntaxError) return 'AIの応答をマップとして読み込めませんでした。指示を短くするか、モデルを変更して再試行してください。';
  if (/Failed to fetch|NetworkError|Network request failed|Load failed|ローカルAIサーバー/i.test(message)) return '接続できませんでした。ネット接続、ローカルサーバーの起動、接続先URL、ブラウザの通信制限を確認してください。';
  if (error instanceof TypeError) return 'アプリ内部の処理でエラーが発生しました。発生した操作を確認する必要があります。';
  return 'AI処理を完了できませんでした。原因を特定できていません。表示された診断情報を開発者にお知らせください。';
}

export async function checkAIConnection({ mode, key, model, localUrl, signal }, fetcher = fetch) {
  const cloud = mode === 'gemini';
  if (cloud && !key.trim()) throw new Error('APIキーが設定されていません。');
  const url = cloud
    ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`
    : `${normalizeLocalUrl(localUrl)}/api/health`;
  const response = await fetcher(url, { method: 'GET', headers: cloud ? { 'x-goog-api-key': key.trim() } : {}, signal });
  if (!response.ok) {
    const error = new Error('Connection check failed');
    error.status = response.status;
    throw error;
  }
  const body = await response.json();
  if (cloud && !body.supportedGenerationMethods?.includes('generateContent')) throw new Error('Selected model does not support generation');
  if (!cloud && body.service !== 'world-studio-local-ai') throw new Error('Unexpected local service');
  return cloud
    ? '接続確認に成功しました。キーとモデル情報は有効です。生成の動作・混雑状況・残り利用枠は、この確認では判定していません。'
    : 'ローカルAIサーバーへの接続を確認できました。生成の動作は実際の生成時に確認します。';
}

export async function listGenerationModels({ key, signal }, fetcher = fetch) {
  if (!key.trim()) throw new Error('APIキーが設定されていません。');
  const models = new Map();
  let token = '';
  for (let page = 0; page < 3; page++) {
    signal?.throwIfAborted();
    const query = new URLSearchParams({ pageSize: '1000', ...(token ? { pageToken: token } : {}) });
    const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models?${query}`, { method: 'GET', headers: { 'x-goog-api-key': key.trim() }, signal });
    if (!response.ok) { const error = new Error('Model list failed'); error.status = response.status; throw error; }
    const body = await response.json();
    signal?.throwIfAborted();
    if (!Array.isArray(body.models)) throw new Error('モデル一覧の形式が不正です。');
    for (const model of body.models) {
      if (typeof model.name !== 'string' || !/^models\/gemini-[a-z0-9.-]+$/.test(model.name) || !Array.isArray(model.supportedGenerationMethods) || !model.supportedGenerationMethods.includes('generateContent') || /image|banana|tts|audio|live|robotics|transcribe|computer-use|customtools|custom-tools/.test(model.name)) continue;
      const id = model.name.slice(7);
      models.set(id, { id, label: typeof model.displayName === 'string' ? model.displayName.slice(0, 128) : id });
    }
    if (!body.nextPageToken) return [...models.values()];
    if (typeof body.nextPageToken !== 'string' || body.nextPageToken.length > 4096 || body.nextPageToken === token) throw new Error('モデル一覧の続きを取得できません。');
    token = body.nextPageToken;
  }
  throw new Error('モデル一覧の取得が完了しませんでした。');
}
