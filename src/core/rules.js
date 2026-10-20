// src/core/rules.js
import ASSETS from '../assets.json' with { type: 'json' };
import { getModelDefault, usesNativeSizing } from './modelCatalog.js';
import { snapToSupports, getBounds, boxesOverlap, getCollisionParts, surfaceTop, worldXZ, isUpright } from './spatialGeometry.js';
import { validateTerrainProfile } from './terrainSurface.js';
import { validateRiverProfile } from './riverSurface.js';
import { validateSpatialAppearance } from './spatialAppearance.js';
import { validateModelGrounding } from './modelGrounding.js';
import { validateBuildingPlacement } from './buildingKit.js';

export const clamp = (val, min, max) => Math.max(min, Math.min(val, max));
export const safeNumber = (v, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

// GLBパス規約（/role/variant.glb）を一元管理。変更する時はここだけ直す
export const getModelPath = (role, variant = 1) => `/${role}/${variant}.glb`;

// ============================================================================
// セマンティックPrefab定義（アセット管理の唯一の真実 = Single Source of Truth）
// assets.json から読み込んでエクスポート
// ============================================================================
export const SEMANTIC_PREFABS = ASSETS.SEMANTIC_PREFABS;
export const MODE_CONFIG = ASSETS.MODE_CONFIG;
export const MODE_GUIDELINES = ASSETS.MODE_GUIDELINES;

export const buildSemanticRules = (mode) => {
  const spec = MODE_CONFIG[mode];
  const guide = MODE_GUIDELINES[mode];
  if (!spec) return "";

  const roleList = spec.roles.join(', ');
  const required = spec.requiredRoles?.join(', ') || '';
  const minLines = Object.entries(spec.minCounts || {})
    .map(([r, n]) => `- ${r} は ${n} 個以上`)
    .join('\n');

  let ruleText = `
【基本ルール】
- 使用可能なすべての role: ${roleList}
- 必須 role: ${required}
${minLines}

【座標計算の手順（必ず厳守すること！）】
1. まず design_rationale 内の "ground_size" に地面のサイズを決定して記録する
2. 以降すべてのオブジェクトの座標は、その地面サイズを基準にした比率で論理的に計算する
3. "spatial_plan" に計算過程を記述してから、最後に "objects" 配列を出力する

【出力トークン削減ルール（速度と安定性のため厳守）】
- id は "c1","t2","w1" のような短い一意文字列にする（UUID禁止）
- pos/size/rot の数値は小数第2位までに丸める
- objects内に prefab_name は出力しない。colorはテーマに合うHEXカラーを指定してよい
`.trim();

  if (guide) {
    ruleText += `\n\n【DO（推奨事項・具体的な計算式）】\n${guide.do.map(g => `- ${g}`).join('\n')}`;
    ruleText += `\n\n【DON'T（禁止事項）】\n${guide.dont.map(g => `- ${g}`).join('\n')}`;
    if (guide.good_example) ruleText += `\n\n【良い配置の例】\n${guide.good_example}`;
    if (guide.bad_example) ruleText += `\n\n【悪い配置の例（絶対に避けること）】\n${guide.bad_example}`;
  }
  return ruleText;
};

const normalizeRotation = (rotArray) => {
  if (!Array.isArray(rotArray) || rotArray.length !== 3) return [0, 0, 0];
  return rotArray.map(v => Math.abs(v) > Math.PI * 2 ? (v * Math.PI) / 180 : v);
};

const normalizePoints = (points) => {
  if (!Array.isArray(points) || points.length < 3) return [[-10,0,-10], [0,0,0], [10,0,10]];
  return points.slice(0, 12).map((p) => [
    clamp(safeNumber(p?.[0], 0), -50, 50),
    clamp(safeNumber(p?.[1], 0), -10, 50),
    clamp(safeNumber(p?.[2], 0), -50, 50)
  ]);
};

export const validateObjects = (data) => {
  if (!Array.isArray(data)) return [];
  let hasFloor = false;

  const validated = data.map((obj, i) => {
    let type = ['box', 'sphere', 'cylinder', 'cone', 'spline'].includes(obj.type) ? obj.type : 'box';
    const role = obj.role && SEMANTIC_PREFABS[obj.role] ? obj.role : (obj.name?.toLowerCase().includes('ground') ? 'ground' : 'wall');
    const prefab = SEMANTIC_PREFABS[role] || { name: 'Prefab_Default', color: '#cccccc' };

    // ★ ハードコード配列を廃止し、prefabメタデータで全判定
    if (prefab.forceSpline) type = 'spline';

    const pos = Array.isArray(obj.pos) && obj.pos.length === 3
      ? [clamp(safeNumber(obj.pos[0]), -100, 100), clamp(safeNumber(obj.pos[1]), -10, 50), clamp(safeNumber(obj.pos[2]), -100, 100)]
      : [0, 0, 0];
    let size = Array.isArray(obj.size) && obj.size.length === 3
      ? [clamp(safeNumber(obj.size[0], 2), 0.1, 200), clamp(safeNumber(obj.size[1], 2), 0.1, 50), clamp(safeNumber(obj.size[2], 2), 0.1, 200)]
      : [2, 2, 2];
    const rot = normalizeRotation(Array.isArray(obj.rot) && obj.rot.length === 3 ? [safeNumber(obj.rot[0]), safeNumber(obj.rot[1]), safeNumber(obj.rot[2])] : [0, 0, 0]);

    const name = obj.name || `${type}_${i}`;

    const maxVariants = prefab.variants || 1;
    const variant = clamp(safeNumber(obj.variant, 1), 1, maxVariants);
    const maxMaterials = prefab.materials || 1;
    const material = clamp(safeNumber(obj.material, 1), prefab.hasModel ? 0 : 1, maxMaterials);

    // Size means dimensions, rather than a raw GLB scale multiplier.
    // Native models receive measured defaults below; surfaces keep requested dimensions.
    const isResizable = prefab.resizable ?? true;
    if (!isResizable) {
      size = [2, 2, 2];
    } else if (prefab.flatHeight && size[1] > 2) {
      size[1] = prefab.flatHeight;
    }

    // Give generation and collision checks the real dimensions before the GLB renders.
    const modelReference = !obj.customModelUrl ? getModelDefault(role, variant) : null;
    if (modelReference && !(Array.isArray(obj.size) && obj.size.length === 3)) size = [...modelReference.size];
    const modelDefault = usesNativeSizing(role, variant) ? modelReference : null;
    const existingDimensions = obj.modelDimensions?.path === modelDefault?.path ? obj.modelDimensions : null;
    if (modelDefault && !existingDimensions) {
      const requestedHeight = Array.isArray(obj.size) && obj.size.length === 3 ? safeNumber(obj.size[1], 2) : modelDefault.size[1];
      const bottom = Array.isArray(obj.pos) ? pos[1] - requestedHeight / 2 : 0;
      size = [...modelDefault.size];
      pos[1] = bottom + size[1] / 2;
    }


    // ★ 接地スナップ：groundSnapフラグで一元管理
    // Support-aware snapping happens after every object's dimensions are known.

    const id = obj.id || crypto.randomUUID();
    if (prefab.floorLike || (pos[1] <= 0 && size[0] > 8 && size[2] > 8)) hasFloor = true;

    const points = (type === 'spline') ? normalizePoints(obj.points) : undefined;
    const customModelUrl = obj.customModelUrl || null;

    // ★ オリジナル色維持：originalColorフラグで一元管理
    const finalColor = obj.color !== undefined ? obj.color : (prefab.originalColor ? null : prefab.color);

    const modelDimensions = modelDefault
      ? existingDimensions || { path: modelDefault.path, size: [...modelDefault.bounds.size], defaultScale: modelDefault.scale }
      : undefined;
    const extraColors = Object.fromEntries(['color2', 'color3'].filter(key => /^#[\da-f]{6}$/i.test(obj[key])).map(key => [key, obj[key]]));
    const terrainProfile = role === 'landform' && obj.terrainProfile ? validateTerrainProfile(obj.terrainProfile) : undefined;
    const riverProfile = role === 'water' && obj.riverProfile ? validateRiverProfile(obj.riverProfile) : undefined;
    const spatialAppearance = obj.spatialAppearance ? validateSpatialAppearance(obj.spatialAppearance) : undefined;
    const modelGrounding = obj.modelGrounding ? validateModelGrounding(obj.modelGrounding, { role, size }) : undefined;
    const buildingPlacement = obj.buildingPlacement ? validateBuildingPlacement(obj.buildingPlacement, { role, variant }) : undefined;
    return { id, type, role, variant, material, customModelUrl, prefab_name: prefab.name, pos, size, rot, color: finalColor, ...extraColors, name, points, ...(terrainProfile ? { terrainProfile } : {}), ...(riverProfile ? { riverProfile } : {}), ...(modelDimensions ? { modelDimensions } : {}), ...(modelGrounding ? { modelGrounding } : {}), ...(buildingPlacement ? { buildingPlacement } : {}), ...(spatialAppearance ? { spatialAppearance } : {}) };
  });

  if (!hasFloor) {
    const prefab = SEMANTIC_PREFABS.ground || { name: 'Prefab_Ground', color: '#556b2f' };
    validated.unshift({ id: 'ground_auto', type: 'box', name: 'Ground_Auto', role: 'ground', variant: 1, material: 1, customModelUrl: null, prefab_name: prefab.name, pos: [0, -0.5, 0], size: [40, 1, 40], rot: [0,0,0], color: prefab.color });
  }
  return snapToSupports(validated, SEMANTIC_PREFABS);
};

export const validateByMode = (objects, mode, { includeCollisions = true } = {}) => {
  const spec = MODE_CONFIG[mode];
  const issues = [];
  if (!spec) return issues;

  const counts = {};
  for (const obj of objects) {
    counts[obj.role] = (counts[obj.role] || 0) + 1;
  }

  for (const r of spec.requiredRoles || []) {
    if (!counts[r]) issues.push(`必須オブジェクトである '${r}' がマップ内に見当たりません。`);
  }

  for (const [r, min] of Object.entries(spec.minCounts || {})) {
    if ((counts[r] || 0) < min) issues.push(`'${r}' の個数が足りません（最低: ${min}個、現在: ${counts[r] || 0}個）。`);
  }

  const collisionCount = includeCollisions ? checkCollisions(objects) : 0;
  if (collisionCount > 5) {
    issues.push(`オブジェクト同士の意図しない重なり（衝突）が多すぎます（現在: ${collisionCount}箇所）。もっと空間を広げて配置してください。`);
  }

  return issues;
};

export const applyDiff = (currentObjects, diff) => {
  const map = new Map(currentObjects.map(o => [o.id, o]));
  for (const id of diff.remove || []) map.delete(id);
  for (const upd of diff.update || []) {
    const cur = map.get(upd.id);
    if (cur) map.set(upd.id, { ...cur, ...upd });
  }
  for (const add of diff.add || []) map.set(add.id || crypto.randomUUID(), add);
  return Array.from(map.values());
};

// ============================================================================
// 衝突判定（空間ハッシュ版）
// ============================================================================
export const checkCollisions = (objects) => {
  const CELL = 8;
  const grid = new Map();
  const boxes = [];

  for (const o of objects) {
    if (o.type === 'spline') continue;
    const prefab = SEMANTIC_PREFABS[o.role];
    if (prefab?.floorLike) continue; // 床同士は判定しない
    const parts = getCollisionParts(o);
    if (parts.length) boxes.push({ ...getBounds(o), object: o, parts });
  }

  boxes.forEach((b, idx) => {
    const x0 = Math.floor(b.minX / CELL), x1 = Math.floor(b.maxX / CELL);
    const z0 = Math.floor(b.minZ / CELL), z1 = Math.floor(b.maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = `${x}:${z}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(idx);
      }
    }
  });

  const seen = new Set();
  let collisionCount = 0;
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const pk = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (seen.has(pk)) continue;
        seen.add(pk);
        const A = boxes[a], B = boxes[b];
        const groundedOnTerrain = (terrain, prop) => {
          if (terrain.role !== 'landform' || !terrain.terrainProfile || terrain.customModelUrl || !SEMANTIC_PREFABS[prop.role]?.groundSnap) return false;
          const top = surfaceTop(terrain, prop.pos[0], prop.pos[2]);
          return top !== null && Math.abs(prop.pos[1] - prop.size[1] / 2 - top) <= 0.06;
        };
        const supportedPaving = (terrain, paving) => {
          if (terrain.role !== 'landform' || !terrain.terrainProfile || terrain.customModelUrl ||
              paving.role !== 'corridor' || paving.customModelUrl || paving.size[1] > 0.2 || !isUpright(paving) || !isUpright(terrain)) return false;
          const top = paving.pos[1] + paving.size[1] / 2, bottom = paving.pos[1] - paving.size[1] / 2;
          return [-1, 0, 1].every(dx => [-1, 0, 1].every(dz => {
            const [x, z] = worldXZ(paving, dx * paving.size[0] / 2, dz * paving.size[2] / 2);
            const support = surfaceTop(terrain, x, z);
            return support !== null && top >= support - 1e-6 && top - support <= 0.15 && bottom <= support + 1e-6 && support - bottom <= 0.15;
          }));
        };
        if (groundedOnTerrain(A.object, B.object) || groundedOnTerrain(B.object, A.object) || supportedPaving(A.object, B.object) || supportedPaving(B.object, A.object)) continue;
        if (A.parts.some(a => B.parts.some(b => boxesOverlap(a, b)))) {
          collisionCount++;
        }
      }
    }
  }
  return collisionCount;
};

export const calculateRank = (objects, collisionCount) => {
  if (objects.length <= 1) return { rank: "-", color: "#9aa0aa" };
  if (collisionCount === 0) return { rank: "SS", color: "#ffd700" };
  if (collisionCount <= 2) return { rank: "S", color: "#ff8c00" };
  if (collisionCount <= 5) return { rank: "A", color: "#3fb950" };
  if (collisionCount <= 10) return { rank: "B", color: "#39c5cf" };
  if (collisionCount <= 20) return { rank: "C", color: "#d29922" };
  return { rank: "D", color: "#e5534b" };
};

export const fileToGenerativePart = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve({ inlineData: { data: reader.result.split(',')[1], mimeType: file.type } });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
