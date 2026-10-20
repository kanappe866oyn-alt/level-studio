import { getModelDefault } from './modelCatalog.js';

export const DEFAULT_CITY_PLAN = {
  width: 80, depth: 72, roadWidth: 6, elevation: 3.2, density: 'balanced',
  districts: ['commercial', 'plaza', 'residential', 'park'],
  groundColor: '#728071', roadColor: '#414c58', buildingColor: '#b5b8ad',
  intent: '道路と階段で低地の街区と高台の広場をつなぐ、小規模な都市。',
};

export const CITY_PLAN_SCHEMA = {
  type: 'object', properties: {
    width: { type: 'number', description: '幅64〜96m' }, depth: { type: 'number', description: '奥行64〜96m' },
    roadWidth: { type: 'number', description: '道路幅4〜8m' }, elevation: { type: 'number', description: '北側の高台0〜4m。平面指定なら0' },
    density: { type: 'string', enum: ['sparse', 'balanced', 'dense'] },
    districts: { type: 'array', items: { type: 'string', enum: ['commercial', 'residential', 'plaza', 'park'] }, description: '北西・北東・南西・南東の順に4区画。plazaを最低1つ含む' },
    groundColor: { type: 'string' }, roadColor: { type: 'string' }, buildingColor: { type: 'string' },
    intent: { type: 'string', description: '用途、高低差の意味、画像から取り入れた要素を日本語で説明' },
  }, required: ['width', 'depth', 'roadWidth', 'elevation', 'density', 'districts', 'groundColor', 'roadColor', 'buildingColor', 'intent'],
};

export function validateCityPlan(plan) {
  if (!plan || typeof plan !== 'object') throw new Error('都市の設計案がありません。');
  for (const [key, min, max] of [['width', 64, 96], ['depth', 64, 96], ['roadWidth', 4, 8], ['elevation', 0, 4]]) {
    if (!Number.isFinite(plan[key]) || plan[key] < min || plan[key] > max) throw new Error(`${key}は${min}〜${max}で指定してください。`);
  }
  if (!['sparse', 'balanced', 'dense'].includes(plan.density)) throw new Error('建物密度が不正です。');
  if (!Array.isArray(plan.districts) || plan.districts.length !== 4 || !plan.districts.every(d => ['commercial', 'residential', 'plaza', 'park'].includes(d)) || !plan.districts.includes('plaza')) throw new Error('4つの街区と、最低1つの広場が必要です。');
  for (const key of ['groundColor', 'roadColor', 'buildingColor']) if (!/^#[\da-f]{6}$/i.test(plan[key])) throw new Error(`${key}はHEXカラーで指定してください。`);
  if (typeof plan.intent !== 'string' || !plan.intent.trim() || plan.intent.length > 2000) throw new Error('設計意図は1〜2000文字で記述してください。');
  return { ...plan, districts: [...plan.districts] };
}

const box = (id, name, role, pos, size, color, yaw = 0) => ({ id, name, role, type: 'box', pos, size, rot: [0, yaw, 0], color, variant: 1, material: 0 });
function model(id, name, role, x, y, z, variant, maxWidth, maxDepth, color) {
  const ref = getModelDefault(role, variant);
  const scale = Math.min(1, maxWidth / ref.size[0], maxDepth / ref.size[2]);
  const size = ref.size.map(n => n * scale);
  return { ...box(id, name, role, [x, y + size[1] / 2, z], size, color), variant,
    modelDimensions: { path: ref.path, size: [...ref.bounds.size], defaultScale: ref.scale } };
}

// Bounded layout grammar. The AI chooses intent and district functions; all coordinates
// and stair dimensions are computed here. No random placement or AI coordinate arithmetic.
export function buildCity(planInput, mode = 'free') {
  if (!['free', 'combat'].includes(mode)) throw new Error('都市組み立ては自由制作・対戦モードに対応しています。');
  const plan = validateCityPlan(planInput);
  const { width: w, depth: d, roadWidth: r, elevation: h } = plan;
  const stairRun = h > 0 ? Math.max(2, Math.round(h / 0.4) * 0.5) : 0;
  const margin = 2;
  const districtWidth = (w - r) / 2 - margin;
  const northDepth = (d - r) / 2 - margin - stairRun;
  const southDepth = (d - r) / 2 - margin;
  const objects = [box('city_ground', '都市の土台', 'ground', [0, -0.5, 0], [w, 1, d], plan.groundColor),
    box('city_road_ew', '東西の大通り', 'corridor', [0, 0.025, 0], [w - 4, 0.05, r], plan.roadColor),
    box('city_road_ns', '南北の大通り', 'corridor', [0, 0.025, 0], [r, 0.05, d - 4], plan.roadColor)];
  const districts = [];
  const names = { commercial: '商業街区', residential: '住宅街区', plaza: '広場', park: '緑地' };
  for (let i = 0; i < 4; i++) {
    const north = i < 2, west = i % 2 === 0;
    const depth = north ? northDepth : southDepth;
    const x = (west ? -1 : 1) * (r / 2 + districtWidth / 2);
    const z = (north ? -1 : 1) * (r / 2 + (north ? stairRun : 0) + depth / 2);
    // Lift paving clear of the ground to avoid coplanar surface flicker.
    const y = 0.08 + (north ? h : 0);
    const type = plan.districts[i];
    const prefix = `district_${i}`;
    objects.push(box(`${prefix}_floor`, `${names[type]}の敷地`, 'bridge', [x, y - 0.15, z], [districtWidth, 0.3, depth], plan.groundColor));
    // A terraced solid base prevents the raised streets from looking like floating slabs.
    if (y > 0.3) objects.push(box(`${prefix}_base`, '高台の擁壁', 'wall', [x, (y - 0.3) / 2, z], [districtWidth, y - 0.3, depth], '#68716a'));
    if (north && h > 0) {
      objects.push(box(`${prefix}_stairs`, '大通りから高台へ登る階段', 'climb', [x, 0.08 + h / 2, -r / 2 - stairRun / 2], [3, h, stairRun], '#a5a99f', Math.PI));
    }
    // Front half is always a pedestrian court. Buildings occupy measured back-row slots.
    const rowZ = z + (north ? -1 : 1) * depth / 4;
    const count = { sparse: 1, balanced: 2, dense: 3 }[plan.density];
    if (type === 'commercial' || type === 'residential') {
      for (let j = 0; j < count; j++) {
        const slotWidth = (districtWidth - 6) / count;
        const bx = x - (districtWidth - 6) / 2 + slotWidth * (j + 0.5);
        objects.push(model(`${prefix}_building_${j}`, `${names[type]}の建物 ${j + 1}`, 'building', bx, y, rowZ,
          type === 'commercial' ? 1 : 2, slotWidth - 2, depth / 2 - 4, plan.buildingColor));
      }
    } else if (type === 'park' && mode === 'free') {
      for (let j = 0; j < 3; j++) objects.push(model(`${prefix}_tree_${j}`, '街区の庭木', 'tree', x + (j - 1) * (districtWidth - 8) / 3, y, rowZ, 1, 4, 4, '#548365'));
    }
    districts.push({ id: prefix, type, x, z, y, width: districtWidth, depth });
  }
  const plazaIndex = plan.districts.indexOf('plaza');
  const plaza = districts[plazaIndex];
  if (h >= 2.6) {
    const bridgeZ = districts[0].z + northDepth / 4;
    objects.push(box('city_upper_bridge', '高台の街区を結ぶ歩道橋', 'bridge', [0, h + 0.08 - 0.15, bridgeZ], [r + 0.4, 0.3, 3], '#a5a99f'));
    for (const side of [-1, 1]) objects.push(box(`city_bridge_rail_${side}`, '歩道橋の手すり', 'wall', [0, h + 0.08 + 0.45, bridgeZ + side * 1.5], [r + 0.4, 0.9, 0.15], '#68716a'));
  }
  if (mode === 'combat') {
    objects.push(model('city_tower', '広場のランドマーク', 'tower', plaza.x, plaza.y, plaza.z + (plazaIndex < 2 ? -1 : 1) * plaza.depth / 4, 1, 5, 5, plan.buildingColor));
    for (let i = 0; i < 4; i++) {
      const district = districts[i];
      objects.push(model(`city_cover_${i}`, '街区入口の遮蔽物', 'cover', district.x + 5, district.y,
        district.z + (i < 2 ? 1 : -1) * district.depth / 4, 1, 2, 2, '#879394'));
    }
  }
  const startZ = d / 2 - 5;
  objects.push(box('city_spawn_1', '南側の入口', 'spawn', mode === 'combat' ? [districts[3].x, districts[3].y + 0.05, districts[3].z - southDepth / 4] : [0, 0.1, startZ], [1.5, 0.1, 1.5], '#55cbb6'));
  if (mode === 'combat') objects.push(box('city_spawn_2', '北側の入口', 'spawn', [districts[0].x, districts[0].y + 0.05, districts[0].z + northDepth / 4], [1.5, 0.1, 1.5], '#e6aa72'));
  else {
    // Goal occupies the front pedestrian court, so the raised districts are actually used.
    const destination = h > 0 ? districts.find(q => q.type === 'plaza' && q.y > 0.08) || districts[0] : plaza;
    objects.push(box('city_goal', '街区の目的地', 'goal', [destination.x, destination.y + 0.15, destination.z + (destination.z < 0 ? 1 : -1) * destination.depth / 4], [1.5, 0.3, 1.5], '#e8c673'));
  }
  return { objects, plan, districts, design_rationale: {
    ground_size: [w, d], spatial_plan: `中央の幅${r}mの大通りで4街区を接続。敷地の舗装高さ0.08mに対して北側を${h}m高くし、階段の奥行は${stairRun}m。建物は通行空間から離した敷地内に配置。`,
    overall_intent: plan.intent,
    key_decisions: districts.map(q => ({ object_id: `${q.id}_floor`, reason: `${names[q.type]}としてまとまりを作り、高さ${q.y}mの歩行空間を道路へ接続します。` })),
    tradeoffs: ['都市専用の4街区構成です。建物内部、曲線道路、自由形状の地形は生成しません。', '既存の3D素材を使用します。参照画像の建築様式や細部の完全再現は対象外です。', ...(mode === 'combat' ? ['射線や対戦バランスは自動検証していません。テストプレイで調整してください。'] : [])],
  } };
}
