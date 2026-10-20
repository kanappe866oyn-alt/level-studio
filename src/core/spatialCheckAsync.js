// Run expensive geometry checks away from the editor. Cancellation terminates
// the computation rather than leaving an obsolete job consuming CPU.
export function runSpatialCheckAsync(objects, design, { task = 'recheck', signal, timeoutMs = 180000,
  workerFactory = () => new Worker(new URL('../workers/spatialCheck.worker.js', import.meta.url), { type: 'module' }) } = {}) {
  return new Promise((resolve, reject) => {
    if (!['recheck', 'repair'].includes(task)) { reject(new Error('不明な検査です。')); return; }
    if (signal?.aborted) { reject(signal.reason || new DOMException('確認を中止しました。', 'AbortError')); return; }
    let worker, settled = false, timer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); signal?.removeEventListener('abort', cancel); worker?.terminate();
      if (error) reject(error); else resolve(result);
    };
    const cancel = () => finish(signal.reason || new DOMException('確認を中止しました。', 'AbortError'));
    try {
      worker = workerFactory();
      worker.onmessage = ({ data }) => {
        if (data?.type === 'complete') finish(null, data.result);
        else if (data?.type === 'error') finish(new Error(data.message));
      };
      worker.onerror = () => finish(new Error('検査を開始できませんでした。保存してから画面を開き直してください。'));
      worker.onmessageerror = () => finish(new Error('検査結果を読み取れませんでした。もう一度お試しください。'));
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) { cancel(); return; }
      timer = setTimeout(() => finish(new DOMException('確認に時間がかかりすぎたため中止しました。', 'TimeoutError')), timeoutMs);
      worker.postMessage({ objects, design, task });
    } catch (error) { finish(error); }
  });
}
