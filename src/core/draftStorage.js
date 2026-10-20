import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import ASSETS from '../assets.json' with { type: 'json' };
import { validateProjectImport } from './projectImport.js';
import { canonicalNaturePlan } from './natureGenerator.js';

export const DRAFT_STORAGE_KEY = 'world-studio-drafts-v1';
export const MAX_DRAFTS = 5;
const objectFields = ['id', 'name', 'role', 'type', 'variant', 'material', 'pos', 'size', 'rot', 'points', 'color', 'color2', 'color3', 'terrainProfile', 'riverProfile', 'customModelUrl', 'modelDimensions', 'modelGrounding', 'buildingPlacement', 'detectedColorCount', 'spatialAppearance'];
const pick = (object, fields) => Object.fromEntries(fields.filter(key => object?.[key] !== undefined).map(key => [key, object[key]]));

export function getDraftStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

// Explicit fields keep credentials, reference images and runtime UI state out of storage.
export function createDraftSnapshot(project, editor) {
  return {
    project: {
      metadata: { ...pick(project.metadata, ['game_mode', 'theme', 'generator', 'design_rationale']),
        ...(project.metadata?.nature_plan !== undefined ? { nature_plan: canonicalNaturePlan(project.metadata.nature_plan) } : {}) },
      objects: project.objects.map(object => pick(object, objectFields)),
      logs: pick(project.logs, ['participantId', 'aiGenerateCount', 'manualEditCount', 'undoCount', 'redoCount', 'generationTimes', 'promptHistory']),
      aiReview: project.aiReview ?? null,
    },
    editor: pick(editor, ['inputText', 'dummyPos', 'showDummy', 'isPartialEdit']),
  };
}

export function validateDraft(draft) {
  if (!draft || typeof draft.id !== 'string' || !draft.id || !Number.isFinite(Date.parse(draft.savedAt))) throw new Error('自動保存データの形式が不正です。');
  const { objects } = validateProjectImport(draft.project, ASSETS.SEMANTIC_PREFABS, ASSETS.MODE_CONFIG);
  const editor = draft.editor;
  if (!editor || typeof editor.inputText !== 'string' || typeof editor.showDummy !== 'boolean' || typeof editor.isPartialEdit !== 'boolean' || !Array.isArray(editor.dummyPos) || editor.dummyPos.length !== 3 || !editor.dummyPos.every(Number.isFinite)) throw new Error('自動保存した編集設定の形式が不正です。');
  if (objects.some(object => object.customModelUrl?.startsWith('blob:'))) throw new Error('一時的なモデルURLは復元できません。');
  return { id: draft.id, savedAt: draft.savedAt, ...createDraftSnapshot({ ...draft.project, objects }, editor) };
}

export function readDrafts(storage = getDraftStorage()) {
  if (!storage) return { drafts: [], error: 'このブラウザでは自動保存を利用できません。JSONファイルで保存してください。' };
  try {
    const raw = storage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return { drafts: [], error: '' };
    const stored = JSON.parse(raw);
    const payload = stored.version === 2 && stored.encoding === 'gzip-base64' && typeof stored.data === 'string'
      ? JSON.parse(strFromU8(gunzipSync(Uint8Array.from(atob(stored.data), c => c.charCodeAt(0))))) : stored;
    if (payload.version !== 1 || !Array.isArray(payload.drafts)) throw new Error('unknown format');
    const drafts = payload.drafts.map(validateDraft);
    if (new Set(drafts.map(draft => draft.id)).size !== drafts.length) throw new Error('duplicate drafts');
    return { drafts, error: '' };
  } catch {
    return { drafts: [], error: '自動保存データを読み込めませんでした。元のデータを保持しています。JSONファイルで保存してください。' };
  }
}

export function saveDraft(storage, draft) {
  const previous = readDrafts(storage);
  if (previous.error) throw new Error(previous.error);
  const validated = validateDraft(draft);
  const drafts = [validated, ...previous.drafts.filter(item => item.id !== validated.id)].slice(0, MAX_DRAFTS);
  // One atomic write: quota failures leave the previous recovery copies intact.
  const raw = JSON.stringify({ version: 1, drafts });
  let value = raw;
  if (raw.length >= 250000) {
    const bytes = gzipSync(strToU8(raw), { level: 1 });
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const compressed = JSON.stringify({ version: 2, encoding: 'gzip-base64', data: btoa(binary) });
    if (compressed.length < raw.length) value = compressed;
  }
  storage.setItem(DRAFT_STORAGE_KEY, value);
  return validated;
}

export function formatDraftTime(savedAt) {
  return new Date(savedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
