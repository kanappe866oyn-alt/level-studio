import { sampleTerrain } from './terrainSurface.js';
import { dressNatureTerrace, dressNatureUnderstory, natureTint } from './natureDressing.js';
import { buildNaturePlace, NATURE_PAVING_RISE } from './naturePlaces.js';
import { buildNatureBridge } from './natureBridges.js';
import { natureTrail, trailReservations } from './natureTrails.js';
import { buildNatureWayfinding } from './natureWayfinding.js';
import { NATURE_LAYOUTS, natureTerraceLayout } from './natureLayout.js';
import { buildNatureBackdrop } from './natureBackdrop.js';

export const DEFAULT_NATURE_PLAN = {
  width: 60, depth: 64, rise: 2, channelWidth: 8, waterEnabled: true, density: 'balanced',
  terrainSeed: 17, relief: 0.6, edgeRoughness: 0.08, riverBend: 3,
  terraceLayout: 'upper-wide', backdropEnabled: true,
  groundColor: '#6f9167', rockColor: '#74797e', waterColor: '#4c9da9', foliageColor: '#3f805c',
  intent: '川の両岸に3段の地形を設け、階段と2本の橋で回遊しながら高台を目指す。',
};
export const NATURE_PLAN_SCHEMA = {
  type: 'object', properties: {
    width: { type: 'number', description: '幅48〜80m' }, depth: { type: 'number', description: '奥行48〜80m' },
    rise: { type: 'number', description: '地形一段の高さ1〜3m。3層の地形を作る' },
    channelWidth: { type: 'number', description: '中央の川または渓谷の幅4〜10m' },
    riverBend: { type: 'number', description: '流路の曲がり幅0〜3m。0なら直線。狭い岸では安全な幅に制限する' },
    terraceLayout: { type: 'string', enum: NATURE_LAYOUTS, description: '段の広さ。balancedは均等、lower-wideは低地、middle-wideは中段、upper-wideは高台を広くする' },
    waterEnabled: { type: 'boolean', description: '川ならtrue、乾いた渓谷ならfalse' },
    backdropEnabled: { type: 'boolean', description: '奥に18mの土台と岩壁3つを加える。主要地形の幅・奥行は変えない' },
    density: { type: 'string', enum: ['sparse', 'balanced', 'dense'] },
    terrainSeed: { type: 'integer', description: '地形の形を再現する0〜65535の整数' },
    relief: { type: 'number', description: '草地の起伏0〜1.2m。0なら平坦' },
    edgeRoughness: { type: 'number', description: '崖の輪郭変化0〜0.12。0なら長方形' },
    groundColor: { type: 'string' }, rockColor: { type: 'string' }, waterColor: { type: 'string' }, foliageColor: { type: 'string' },
    intent: { type: 'string', description: '高低差の役割や参考画像から採用した要素を日本語で説明' },
  }, required: ['width', 'depth', 'rise', 'channelWidth', 'riverBend', 'waterEnabled', 'backdropEnabled', 'density', 'terrainSeed', 'relief', 'edgeRoughness', 'groundColor', 'rockColor', 'waterColor', 'foliageColor', 'intent'],
};

export function validateNaturePlan(plan) {
  if (!plan || typeof plan !== 'object') throw new Error('自然地形の設計案がありません。');
  for (const [key, min, max] of [['width', 48, 80], ['depth', 48, 80], ['rise', 1, 3], ['channelWidth', 4, 10]]) {
    if (!Number.isFinite(plan[key]) || plan[key] < min || plan[key] > max) throw new Error(`${key}は${min}〜${max}で指定してください。`);
  }
  if (typeof plan.waterEnabled !== 'boolean') throw new Error('水辺の指定はtrue/falseが必要です。');
  const backdropEnabled = plan.backdropEnabled === undefined ? false : plan.backdropEnabled;
  if (typeof backdropEnabled !== 'boolean') throw new Error('奥の岩壁の指定はtrue/falseが必要です。');
  if (!['sparse', 'balanced', 'dense'].includes(plan.density)) throw new Error('装飾密度が不正です。');
  for (const key of ['groundColor', 'rockColor', 'waterColor', 'foliageColor']) if (!/^#[\da-f]{6}$/i.test(plan[key])) throw new Error(`${key}はHEXカラーで指定してください。`);
  if (typeof plan.intent !== 'string' || !plan.intent.trim() || plan.intent.length > 2000) throw new Error('設計意図は1〜2000文字で記述してください。');
  const terrainSeed = plan.terrainSeed ?? 17, relief = plan.relief ?? 0.6, edgeRoughness = plan.edgeRoughness ?? 0.08;
  if (!Number.isInteger(terrainSeed) || terrainSeed < 0 || terrainSeed > 65535) throw new Error('地形seedは0〜65535の整数が必要です。');
  if (!Number.isFinite(relief) || relief < 0 || relief > 1.2 || !Number.isFinite(edgeRoughness) || edgeRoughness < 0 || edgeRoughness > 0.12) throw new Error('起伏は0〜1.2m、輪郭変化は0〜0.12で指定してください。');
  const riverBend = plan.riverBend ?? 3;
  if (!Number.isFinite(riverBend) || riverBend < 0 || riverBend > 3) throw new Error('流路の曲がり幅は0〜3mで指定してください。');
  const terraceLayout = plan.terraceLayout === undefined ? 'balanced' : plan.terraceLayout;
  if (!NATURE_LAYOUTS.includes(terraceLayout)) throw new Error('段の広さの構成が不正です。');
  return { ...plan, terrainSeed, relief, edgeRoughness, riverBend, terraceLayout, backdropEnabled };
}

const box = (id, name, role, pos, size, color, yaw = 0) => ({ id, name, role, type: 'box', pos, size, rot: [0, yaw, 0], color, variant: 1, material: 0 });

// Persist only the bounded recipe fields, never arbitrary AI response or credential fields.
export function canonicalNaturePlan(input) {
  const plan = validateNaturePlan(input);
  return Object.fromEntries(Object.keys(DEFAULT_NATURE_PLAN).map(key => [key, plan[key]]));
}

export function effectiveNatureBend(plan) {
  const patchWidth = (plan.width - plan.channelWidth) / 2 - 2;
  return Math.min(plan.riverBend, patchWidth * 0.09);
}

// Six solid terrace patches, four stair links, and two bridges form a walking loop.
// Decoration is kept outside the reserved centre strip and bridge landing zones.
export function buildNature(planInput, mode = 'free') {
  if (!['free', 'platforming'].includes(mode)) throw new Error('自然地形の組み立ては自由制作・アスレチックに対応しています。');
  const plan = validateNaturePlan(planInput);
  const { width: w, depth: d, rise, channelWidth: channel } = plan;
  const run = Math.round(rise / 0.4) * 0.5;
  const layout = natureTerraceLayout(d, run, plan.terraceLayout);
  const patchWidth = (w - channel) / 2 - 2;
  const bankX = channel / 2 + patchWidth / 2;
  const bend = effectiveNatureBend(plan);
  // Shared samples keep bridge axes and the ends beside stairs straight.
  const bankSectionsByLevel = [0, 1, 2].map(level => Array.from({ length: 13 }, (_, j) => {
    const patchDepth = layout[level].depth;
    const t = j / 12 - 0.5, z = t * patchDepth;
    const direction = (plan.terrainSeed + level) % 2 ? 1 : -1;
    const amplitude = [0.65, 1, 0.8][level];
    const offset = j === 0 || j === 12 || Math.abs(z) <= 2.5 ? 0 : direction * amplitude * bend * Math.sin(j / 12 * Math.PI * 2);
    return [t, offset / patchWidth];
  }));
  const riverWidth = channel + bend * 2;
  const riverSections = [];
  for (const level of [2, 1, 0]) {
    const { z: centre, depth: patchDepth } = layout[level];
    for (const [t, offset] of bankSectionsByLevel[level]) riverSections.push([(centre + t * patchDepth) / (d - 4), offset * patchWidth / riverWidth]);
  }
  riverSections[0][0] = -0.5; riverSections.at(-1)[0] = 0.5;
  const patches = [];
  const objects = [box('nature_ground', '渓谷の土台', 'ground', [0, -2.5, 0], [w, 1, d], plan.rockColor)];
  if (plan.waterEnabled) objects.push({ ...box('nature_water', '曲がりながら流れる川', 'water', [0, -1.1, 0], [riverWidth, 2.2, d - 4], plan.waterColor), riverProfile: { widthRatio: channel / riverWidth, sections: riverSections } });
  for (let side = 0; side < 2; side++) {
    const x = side === 0 ? -bankX : bankX;
    for (let level = 0; level < 3; level++) {
      const { z, depth: patchDepth } = layout[level];
      const y = 0.4 + level * rise;
      const id = `bank_${side}_${level}`;
      const land = box(id, `${side === 0 ? '西' : '東'}岸の${level + 1}段目の地形`, 'landform', [x, (y - 2) / 2, z], [patchWidth, y + 2, patchDepth], natureTint(plan.groundColor, [-0.04, 0, 0.06][level]));
      land.color2 = plan.rockColor;
      land.terrainProfile = { seed: (plan.terrainSeed + side * 103 + level * 37) % 65536, relief: plan.relief, edgeRoughness: plan.edgeRoughness };
      land.terrainProfile.shoreline = { side: side === 0 ? 1 : -1, sections: bankSectionsByLevel[level].map(p => [...p]) };
      // Broad outer shoulders alternate with recessed edges. Crossing axes stay intact.
      land.terrainProfile.outerInset = plan.edgeRoughness / 0.12 *
        ([0.1, 0.22, 0.15][level] + 0.02 * Math.sin(land.terrainProfile.seed * 0.73));
      land.terrainProfile.cliffRelief = plan.edgeRoughness / 0.12 * 0.45;
      if (mode === 'free' && level === 1) land.terrainProfile.trail = natureTrail(land);
      objects.push(land);
      patches.push({ id, x, y, z, width: patchWidth, depth: patchDepth, level });
      if (level < 2) {
        const stairZ = z - patchDepth / 2 - run / 2;
        objects.push(box(`${id}_stairs`, '上の地形へ登る階段', 'climb', [x, y + rise / 2, stairZ], [3, rise, run], plan.rockColor, Math.PI));
        objects.push({ ...box(`${id}_stair_base`, '階段下の岩盤', 'landform', [x, (y - 2) / 2, stairZ], [3, y + 2, run], plan.rockColor), color2: plan.rockColor });
      }
      if (mode === 'free') {
        const place = [...buildNaturePlace(land, plan, side, level), ...buildNatureWayfinding(land, plan, side, level)];
        const reserved = [...place, ...trailReservations(land)];
        const dressing = dressNatureTerrace(land, plan, level, reserved);
        objects.push(...place, ...dressing, ...dressNatureUnderstory(land, plan, dressing, reserved));
      }
    }
  }
  for (const level of [0, 2]) {
    const patch = patches.find(p => p.level === level);
    objects.push(...buildNatureBridge(patch, channel, mode));
  }
  const start = patches[0], finish = patches.at(-1);
  const pavingRise = mode === 'free' ? NATURE_PAVING_RISE : 0;
  objects.push(box('nature_spawn', '川沿いのスタート', 'spawn', [start.x, start.y + pavingRise + 0.05, start.z + start.depth / 4], [1.5, 0.1, 1.5], '#52c6b5'));
  objects.push(box('nature_goal', '東岸の展望地点', 'goal', [finish.x, finish.y + pavingRise + 0.15, finish.z - finish.depth / 4], [1.5, 0.3, 1.5], '#e5c46c'));
  for (const patch of patches.filter(p => p.level === 1)) objects.push(box(`${patch.id}_checkpoint`, '中段の休憩地点', 'checkpoint', [patch.x, patch.y + pavingRise + 0.05, patch.z], [1.5, 0.1, 1.5], '#66b5ce'));
  if (mode === 'platforming') {
    // Optional model platforms sit beside the main walking route, not across it.
    for (const patch of patches.filter(p => p.level === 1)) {
      const land = objects.find(o => o.id === patch.id);
      const y = land.pos[1] + sampleTerrain(land, patchWidth / 3, 0);
      objects.push(box(`${patch.id}_platform`, '休憩地点の足場', 'platform', [patch.x + patchWidth / 3, y + 0.15, patch.z], [3, 0.3, 3], plan.groundColor));
    }
  }
  objects.push(...buildNatureBackdrop(plan));
  return { objects, patches, plan, design_rationale: {
    ground_size: [w, d], overall_intent: plan.intent,
    spatial_plan: `中央の幅${channel}m、曲がり幅${bend.toFixed(2)}mの${plan.waterEnabled ? '川' : '渓谷'}を挟み、両岸に高さ${rise}mずつ上昇する3段の地形を配置。低地・中段・高台の奥行は${layout.map(p => p.depth.toFixed(1)).join('・')}m。段の広さに合わせて階段4本と橋2本を接続。`,
    key_decisions: [
      ...(plan.backdropEnabled ? [{ object_id: 'nature_backdrop_cliff_1', reason: '主要地形の奥に土台を18m延ばして岩壁を3つ置き、入口や高台から見た景観に奥行きを作ります。岩壁の上へ登る道は設けません。岩壁も通常のオブジェクトとして編集・保存・出力できます。' }] : []),
      { object_id: 'nature_bridge_0', reason: '低地でも対岸へ移動でき、どちらの岸からも登れるようにします。' },
      { object_id: 'nature_bridge_2', reason: '高台の展望地点をつなぎ、同じ道を戻らず周回できる構成にします。' },
      { object_id: 'nature_goal', reason: '最上段に目的地を置き、高所へ移動する理由を作ります。' },
      { object_id: 'bank_1_2', reason: `${{ balanced: '各段を均等', 'lower-wide': '低地を広く', 'middle-wide': '中段を広く', 'upper-wide': '高台を広く' }[plan.terraceLayout]}取る構成です。各段に最低12mの奥行を確保し、残る広さを配分します。狭いステージでは均等に近づきます。` },
      { object_id: 'bank_0_1', reason: '段と岸ごとに外縁の広さと絞り込みを変え、川の曲がり方にも違いを付けます。階段前と橋の接続部は形を保ちます。' },
      ...(mode === 'free' ? [{ object_id: 'bank_0_1', reason: '中段には木立、低地には岸辺の岩、高台には岩群と開けた展望空間を設けます。階段の前と橋の出入口には植生を置きません。' }] : []),
      ...(mode === 'free' ? [
        { object_id: 'bank_0_0_plaza', reason: '石柱のある入口広場から橋と階段を見つけやすくします。' },
        { object_id: 'bank_0_1_plaza', reason: '両岸の中段に腰掛けのある休憩広場を置き、上り道の途中に区切りを作ります。' },
        { object_id: 'bank_0_1', reason: '両岸の中段に、休憩広場の脇から分かれて主経路へ戻る散策路を設けます。道沿いの起伏を抑え、岩や植生を通路から離します。' },
        { object_id: 'bank_1_2_landmark', reason: '展望広場の脇に塔を置き、対岸からも目指す場所を認識できるようにします。' },
        { object_id: 'bank_0_1_stair_post_-1', reason: '階段の両脇を石の目印で示し、足元の金色の石を上り方向へ向けます。高台では橋と展望広場への方向にも同じ目印を使います。' },
      ] : []),
    ],
    tradeoffs: ['川と岸辺は共通の流路座標で作ります。橋と階段の接続部は平坦に保ち、曲がり幅は岸の広さに合わせて制限します。洞窟・大規模な山は未対応です。', '川は通行不可です。橋を使って渡ります。水流・泳ぎ・滝の動作は実装していません。', ...(mode === 'free' ? ['岩と植生は地形に接地させ、回転後の輪郭と通路の余白を検査します。狭い地形や急な起伏では、密度指定より少なく配置することがあります。'] : [])],
  } };
}
