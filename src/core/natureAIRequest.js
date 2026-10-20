import { abortable } from './abortable.js';

export const NATURE_AI_STEP_TIMEOUT_MS = 110_000;
export const NATURE_AI_STEPS = {
  reading: '参考画像と指示の読み取り',
  planning: '自然地形の設計',
  drafting: '要求に沿った配置と修正',
  spatial: '立体マップの設計',
};

// Bound each request without displaying or persisting raw model output.
export async function requestNatureJSON({ model, parts, signal, step, onProgress = () => {}, timeoutMs = NATURE_AI_STEP_TIMEOUT_MS }) {
  signal.throwIfAborted();
  if (!Object.hasOwn(NATURE_AI_STEPS, step)) throw new Error('生成段階の指定が不正です。');
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => {
    const error = new Error('AI generation step timed out');
    error.code = 'AI_STEP_TIMEOUT';
    error.step = step;
    controller.abort(error);
  }, timeoutMs);
  try {
    const result = await abortable(() => model.generateContent(parts, { signal: controller.signal }), controller.signal);
    controller.signal.throwIfAborted();
    onProgress(`${NATURE_AI_STEPS[step]}の応答を受信しました。内容を検証しています。`);
    controller.signal.throwIfAborted();
    return JSON.parse(result.response.text());
  } catch (error) {
    if (error instanceof Error) error.natureStep = step;
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
