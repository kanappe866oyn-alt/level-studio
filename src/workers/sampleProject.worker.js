import { createSampleProject } from '../core/sampleProjects.js';

self.onmessage = ({ data: { scene, seed, version } }) => {
  try {
    const workspace = createSampleProject(scene, { seed, version, onProgress: message => self.postMessage({ type: 'progress', message }) });
    self.postMessage({ type: 'complete', workspace });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || 'ステージを組み立てられませんでした。' });
  }
};
