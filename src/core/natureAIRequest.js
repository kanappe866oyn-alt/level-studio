import { abortable } from './abortable.js';
import { readGenerationJSON } from './generationErrors.js';

export const NATURE_AI_STEP_TIMEOUT_MS = 110_000;
export const REFERENCE_READING_TIMEOUT_MS = 180_000;
export const NATURE_AI_STEPS = {
  reading: '参考画像と指示の読み取り',
  planning: '自然地形の設計',
  drafting: '要求に沿った配置と修正',
  reviewing: '最終配置と指示・参考画像の照合',
  spatial: '立体マップの設計',
};

// Bound each request without displaying or persisting raw model output.
export async function requestNatureJSON({ model, parts, signal, step, onProgress = () => {}, timeoutMs = step === 'reading' ? REFERENCE_READING_TIMEOUT_MS : NATURE_AI_STEP_TIMEOUT_MS }) {
  signal.throwIfAborted();
  if (!Object.hasOwn(NATURE_AI_STEPS, step)) throw new Error('生成段階の指定が不正です。');
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => {
    const error = new Error('AI generation step timed out');
    error.code = 'AI_STEP_TIMEOUT';
    error.step = step;
    error.timeoutMs = timeoutMs;
    controller.abort(error);
  }, timeoutMs);
  const started = Date.now();
  const progressTimer = setInterval(() => {
    if (!controller.signal.aborted) onProgress(`${NATURE_AI_STEPS[step]}の応答を待っています（${Math.floor((Date.now() - started) / 1000)}秒経過）。キャンセルできます。`);
  }, 30000);
  try {
    const result = await abortable(() => model.generateContent(parts, { signal: controller.signal }), controller.signal);
    controller.signal.throwIfAborted();
    onProgress(`${NATURE_AI_STEPS[step]}の応答を受信しました。内容を検証しています。`);
    controller.signal.throwIfAborted();
    return readGenerationJSON(result.response);
  } catch (error) {
    if (error instanceof Error) error.natureStep = step;
    throw error;
  } finally {
    clearTimeout(timer);
    clearInterval(progressTimer);
    signal.removeEventListener('abort', cancel);
  }
}
