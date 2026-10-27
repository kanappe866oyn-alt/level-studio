// Models offered in AI settings, with what has actually been measured in this app's generation
// (eval/ and the 2026-10-27 public-build checks). A note says what was seen, not what is expected.
export const DEFAULT_CLOUD_MODEL = 'gemini-3.5-flash-lite';

export const MODEL_PROFILES = [
  { key: 'lite', id: 'gemini-3.5-flash-lite', label: 'Flash-Lite 3.5（軽量・動作確認済み）',
    note: '軽量モデル。文章のみの生成は公開版で、画像つきの生成は評価ツールで、成功を確認済みです（応答は数秒〜十数秒）。画面からの画像つき生成は未確認です。出力は簡素になりやすく、細部の作り込みはFlash/Proより少ない可能性があります（品質の比較は未測定）。' },
  { key: 'flash', id: 'gemini-flash-latest', label: 'Flash（自動更新）',
    note: '最新のFlash。このアプリの生成では、時間切れ・503エラーの記録があり、原因は調査中です。失敗したときは軽量モデルを選んでください。品質の比較は未測定です。' },
  { key: 'pro', id: 'gemini-pro-latest', label: 'Pro（自動更新）',
    note: '最新のPro。このアプリの生成では未測定です。無料枠の対象外になることがあります。' },
];

export const modelProfileKey = model => MODEL_PROFILES.find(profile => profile.id === model)?.key ?? 'custom';
export const modelProfile = model => MODEL_PROFILES.find(profile => profile.id === model) ?? null;
