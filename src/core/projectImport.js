// Import validation deliberately preserves saved dimensions and positions.
import { validateTerrainProfile } from './terrainSurface.js';
import { validateRiverProfile } from './riverSurface.js';
import { canonicalNaturePlan } from './natureGenerator.js';
import { validateSpatialPlan } from './spatialPlan.js';
import { validateSpatialAppearance } from './spatialAppearance.js';
import { validateSpatialRequestRecord } from './spatialRequest.js';
import { validateModelGrounding } from './modelGrounding.js';
import { validateBuildingPlacement } from './buildingKit.js';
export function validateProjectImport(project, prefabs, modes) {
  if (!project || !Array.isArray(project.objects)) throw new Error('objects は配列で指定してください。');
  const ids = new Set();
  const unknownRoles = new Set();
  const objects = project.objects.map((object, index) => {
    const label = `${index + 1}番目のオブジェクト`;
    if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error(`${label}の形式が不正です。`);
    if (typeof object.id !== 'string' || !object.id.trim() || ids.has(object.id)) throw new Error(`${label}のIDが欠落または重複しています。`);
    ids.add(object.id);
    const rot = object.rot === undefined ? [0, 0, 0] : object.rot;
    for (const [key, value] of Object.entries({ pos: object.pos, size: object.size, rot })) {
      if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new Error(`${label}の${key}には有限数3個が必要です。`);
    }
    if (object.size.some(value => value <= 0)) throw new Error(`${label}のサイズは正の値にしてください。`);
    if (object.name !== undefined && typeof object.name !== 'string') throw new Error(`${label}のnameは文字列で指定してください。`);
    const type = object.type === undefined ? 'box' : object.type;
    if (!['box', 'sphere', 'cylinder', 'cone', 'spline'].includes(type)) throw new Error(`${label}のtypeが不正です。`);
    if (type === 'spline' && (!Array.isArray(object.points) || object.points.length < 3 || !object.points.every(point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite)))) throw new Error(`${label}のpointsには3個以上の座標が必要です。`);
    const knownRole = Object.hasOwn(prefabs, object.role);
    if (!knownRole) unknownRoles.add(String(object.role ?? '未指定'));
    const role = knownRole ? object.role : 'wall';
    if (object.spatialAppearance !== undefined) validateSpatialAppearance(object.spatialAppearance);
    if (object.buildingPlacement !== undefined) validateBuildingPlacement(object.buildingPlacement, object);
    if (object.modelGrounding !== undefined) {
      validateModelGrounding(object.modelGrounding, object);
    }
    if (object.terrainProfile !== undefined) {
      if (role !== 'landform') throw new Error(`${label}の地形設定はlandform専用です。`);
      validateTerrainProfile(object.terrainProfile);
      if ((object.terrainProfile.grade || 0) >= object.size[1]) throw new Error(`${label}の坂の土台は高低差より厚くしてください。`);
      const curve = object.terrainProfile.curve;
      if (curve && curve.width + 2 * ((curve.flare || 0) + Math.abs(curve.offset)) > object.size[0] + 0.00001) throw new Error(`${label}の曲がる道を収める幅が不足しています。`);
    }
    if (object.riverProfile !== undefined) {
      if (role !== 'water') throw new Error(`${label}の流路設定はwater専用です。`);
      validateRiverProfile(object.riverProfile);
    }
    // Existing texture indices can exceed prefab metadata; retain positive indices.
    for (const [key, maximum] of [['variant', prefabs[role]?.variants || 1], ['material', Number.MAX_SAFE_INTEGER]]) {
      if (object[key] !== undefined && (!Number.isInteger(object[key]) || object[key] < (key === 'material' ? 0 : 1) || object[key] > maximum)) throw new Error(`${label}の${key}が有効範囲外です。`);
    }
    for (const key of ['color', 'color2', 'color3']) if (object[key] !== undefined && object[key] !== null && !/^#[\da-f]{6}$/i.test(object[key])) throw new Error(`${label}の${key}が不正です。`);
    if (object.customModelUrl !== undefined && object.customModelUrl !== null && typeof object.customModelUrl !== 'string') throw new Error(`${label}のモデルURLが不正です。`);
    if (object.modelDimensions !== undefined && (!object.modelDimensions || typeof object.modelDimensions.path !== 'string' || !Array.isArray(object.modelDimensions.size) || object.modelDimensions.size.length !== 3 || !object.modelDimensions.size.every(value => Number.isFinite(value) && value > 0) || !Number.isFinite(object.modelDimensions.defaultScale) || object.modelDimensions.defaultScale <= 0)) throw new Error(`${label}のモデル寸法が不正です。`);
    return { ...object, type, role, rot };
  });
  if (project.metadata?.game_mode !== undefined && !Object.hasOwn(modes, project.metadata.game_mode)) throw new Error('ゲームモードが不正です。');
  if (project.metadata?.theme !== undefined && typeof project.metadata.theme !== 'string') throw new Error('テーマは文字列で指定してください。');
  if (project.metadata?.nature_plan !== undefined) canonicalNaturePlan(project.metadata.nature_plan);
  if (project.logs !== undefined) {
    const logs = project.logs;
    if (!logs || typeof logs.participantId !== 'string' || !['aiGenerateCount', 'manualEditCount', 'undoCount', 'redoCount'].every(key => Number.isInteger(logs[key]) && logs[key] >= 0) || !Array.isArray(logs.generationTimes) || !logs.generationTimes.every(value => Number.isFinite(value) && value >= 0) || !Array.isArray(logs.promptHistory) || !logs.promptHistory.every(value => typeof value === 'string')) throw new Error('研究ログの形式が不正です。');
  }
  const rationale = project.metadata?.design_rationale ?? project.designRationale;
  if (rationale?.spatial_design !== undefined) {
    const design = rationale.spatial_design;
    if (!design || design.version !== 1) throw new Error('立体マップ設計の形式が不正です。');
    validateSpatialPlan(design.plan);
    if (design.request_contract !== undefined) validateSpatialRequestRecord(design.request_contract);
    const report = design.validation;
    if (report !== undefined && (!report || report.navigation !== 'checked' || !Number.isInteger(report.independentRoutes) || report.independentRoutes < 1 || report.independentRoutes > 16 || !Array.isArray(report.sightlines) || report.sightlines.length > 16 || !report.sightlines.every(s => s && typeof s.from === 'string' && typeof s.to === 'string' && ['visible', 'hidden'].includes(s.relation) && typeof s.passed === 'boolean' && Number.isFinite(s.ratio) && s.ratio >= 0 && s.ratio <= 1 && Number.isInteger(s.visibleSamples) && s.visibleSamples >= 0 && s.visibleSamples <= 81 && s.totalSamples === 81))) throw new Error('立体マップ検証記録の形式が不正です。');
  }
  if (rationale !== undefined && typeof rationale !== 'string' && (!rationale || typeof rationale.overall_intent !== 'string' || !Array.isArray(rationale.key_decisions) || !rationale.key_decisions.every(item => item && typeof item.object_id === 'string' && typeof item.reason === 'string') || !Array.isArray(rationale.tradeoffs) || !rationale.tradeoffs.every(item => typeof item === 'string') || (rationale.ground_size !== undefined && (!Array.isArray(rationale.ground_size) || rationale.ground_size.length !== 2 || !rationale.ground_size.every(value => Number.isFinite(value) && value > 0))) || (rationale.spatial_plan !== undefined && typeof rationale.spatial_plan !== 'string'))) throw new Error('設計理由の形式が不正です。');
  if (project.aiReview !== undefined && project.aiReview !== null && (!Number.isFinite(project.aiReview.score) || project.aiReview.score < 0 || project.aiReview.score > 100 || typeof project.aiReview.comment !== 'string' || !['strengths', 'improvements'].every(key => Array.isArray(project.aiReview[key]) && project.aiReview[key].every(item => typeof item === 'string')))) throw new Error('AI評価の形式が不正です。');
  return { objects, unknownRoles: [...unknownRoles] };
}
