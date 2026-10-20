import { terrainFamily, TERRAIN_VERSION } from './terrainRecipe.js';

export function createSampleProjectAsync(scene, { seed = 0, version = TERRAIN_VERSION, signal, onProgress, workerFactory = () => new Worker(new URL('../workers/sampleProject.worker.js', import.meta.url), { type: 'module' }) } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason || new DOMException('中止しました。', 'AbortError')); return; }
    let worker, settled = false;
    const finish = (error, workspace) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', cancel);
      worker?.terminate();
      if (error) reject(error); else resolve(workspace);
    };
    const cancel = () => finish(signal.reason || new DOMException('中止しました。', 'AbortError'));
    try {
      worker = workerFactory();
      worker.onmessage = ({ data }) => {
        if (settled) return;
        if (data.type === 'progress') onProgress?.(data.message);
        else if (data.type === 'complete') finish(null, data.workspace);
        else if (data.type === 'error') finish(new Error(data.message));
      };
      worker.onerror = () => finish(new Error('ステージの組み立てを開始できませんでした。ページを開き直してお試しください。'));
      signal?.addEventListener('abort', cancel, { once: true });
      worker.postMessage({ scene, seed, version });
    } catch (error) { finish(error); }
  });
}

export function nextTerrainSeed(previousSeed, randomSeed) {
  let seed = randomSeed >>> 0;
  if (Number.isInteger(previousSeed) && previousSeed >= 0 && previousSeed <= 0xffffffff) {
    while (terrainFamily(seed) === terrainFamily(previousSeed)) seed = (seed + 1) >>> 0;
  }
  return seed;
}
export const randomTerrainSeed = previousSeed => nextTerrainSeed(previousSeed, crypto.getRandomValues(new Uint32Array(1))[0]);
