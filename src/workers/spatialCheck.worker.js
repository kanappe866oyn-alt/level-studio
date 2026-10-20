import { recheckSpatialStage } from '../core/spatialRecheck.js';
import { repairTerrainJoins } from '../core/terrainJoinRepair.js';
import ASSETS from '../assets.json' with { type: 'json' };

self.onmessage = ({ data: { objects, design, task } }) => {
  try {
    if (!['recheck', 'repair'].includes(task)) throw new Error('不明な検査です。');
    const result = task === 'repair' ? repairTerrainJoins(objects, design, ASSETS.SEMANTIC_PREFABS) : recheckSpatialStage(objects, design);
    self.postMessage({ type: 'complete', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || 'ステージを確認できませんでした。' });
  }
};
