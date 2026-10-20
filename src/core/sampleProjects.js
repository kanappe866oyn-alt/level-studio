import { buildBlockout, DEFAULT_BLOCKOUT_PLAN } from './blockoutGenerator.js';
import { buildSpatialStage, inspectSpatialStage, finishSpatialStageWithReport } from './spatialStageGenerator.js';
import { createUrbanSpatialPlan, createSettlementTerrainPlan } from './spatialPlan.js';
import { createMarketTerrainPlan } from './marketTerrainPlan.js';
import { createProceduralTerrainLayout } from './proceduralTerrainPlan.js';
import { TERRAIN_VERSION } from './terrainRecipe.js';
import { getModelDefault } from './modelCatalog.js';
import { buildCity, DEFAULT_CITY_PLAN } from './cityGenerator.js';
import { buildNature, DEFAULT_NATURE_PLAN, canonicalNaturePlan } from './natureGenerator.js';

const box = (id, name, role, pos, size, color = '#93a4b2') => ({
  id, name, role, type: 'box', pos, size, rot: [0, 0, 0], color, variant: 1, material: 0,
});

function model(id, name, role, x, z, variant = 1, scale = 1) {
  const reference = getModelDefault(role, variant);
  const size = reference.size.map(value => value * scale);
  return {
    ...box(id, name, role, [x, size[1] / 2, z], size, null), variant,
    modelDimensions: { path: reference.path, size: [...reference.bounds.size], defaultScale: reference.scale },
  };
}

export const createEmptyLogs = () => ({ participantId: 'User_01', aiGenerateCount: 0, manualEditCount: 0, undoCount: 0, redoCount: 0, generationTimes: [], promptHistory: [] });

export function createSampleProject(scene, { seed = 0, version = TERRAIN_VERSION, onProgress } = {}) {
  onProgress?.('地形と経路を組み立てています。');
  if (['spatial', 'spatial-finished', 'spatial-terrain', 'spatial-market', 'spatial-varied'].includes(scene.id)) {
    let stage, report;
    if (scene.id === 'spatial') {
      stage = buildSpatialStage(); report = inspectSpatialStage(stage);
    } else {
      const layout = scene.id === 'spatial-varied' ? createProceduralTerrainLayout(seed, { version }) : null;
      const plan = layout?.plan || (scene.id === 'spatial-market' ? createMarketTerrainPlan() : scene.id === 'spatial-finished' ? createUrbanSpatialPlan() : createSettlementTerrainPlan());
      const base = buildSpatialStage(plan);
      if (layout) base.design_rationale.spatial_design.variation = layout.variation;
      onProgress?.('建物を配置し、通行と視線を確認しています。');
      const finished = finishSpatialStageWithReport(base);
      stage = finished.stage; report = finished.report;
      if (layout) stage.design_rationale.spatial_design.variation = layout.variation;
    }
    if (report.issues.length) throw new Error(report.issues.join('\n'));
    stage.design_rationale.spatial_design.validation = { independentRoutes: report.independentRoutes, navigation: report.navigation.status, sightlines: report.sightlines };
    stage.design_rationale.key_decisions.push(...report.sightlines.map(s => ({ object_id: `sp_area_${s.from}`, reason: `${s.from}→${s.to}: ${s.relation === 'visible' ? '見える' : '見えない'}条件を確認（${s.visibleSamples}/${s.totalSamples}目線）。` })));
    const spawn = stage.objects.find(o => o.role === 'spawn');
    return { project: { metadata: { game_mode: scene.mode, theme: scene.theme, generator: 'procedural-spatial', design_rationale: stage.design_rationale }, objects: stage.objects, logs: createEmptyLogs(), aiReview: null },
      editor: { inputText: scene.prompt, dummyPos: [spawn.pos[0], spawn.pos[1] - spawn.size[1] / 2, spawn.pos[2]], showDummy: true, isPartialEdit: true } };
  }
  if (scene.id === 'city' || scene.id === 'nature' || scene.id === 'blockout') {
    const city = scene.id === 'blockout' ? buildBlockout(DEFAULT_BLOCKOUT_PLAN, scene.mode) : scene.id === 'nature' ? buildNature(DEFAULT_NATURE_PLAN, scene.mode) : buildCity(DEFAULT_CITY_PLAN, scene.mode);
    const spawn = city.objects.find(o => o.role === 'spawn');
    return { project: { metadata: { game_mode: scene.mode, theme: scene.theme, generator: `procedural-${scene.id}`, design_rationale: city.design_rationale, ...(scene.id === 'nature' ? { nature_plan: canonicalNaturePlan(city.plan) } : {}) }, objects: city.objects, logs: createEmptyLogs(), aiReview: null },
      editor: { inputText: scene.prompt, dummyPos: [spawn.pos[0], spawn.pos[1] - spawn.size[1] / 2, spawn.pos[2]], showDummy: true, isPartialEdit: true } };
  }
  let objects;
  let dummyPos;
  let intent;
  let decisions;
  if (scene.id === 'arena') {
    objects = [
      box('g1', 'アリーナの地面', 'ground', [0, -0.5, 0], [36, 1, 32], '#84939b'),
      box('sp1', '南西スタート', 'spawn', [-12, 0.05, 10], [1.5, 0.1, 1.5], '#57c7bd'),
      box('sp2', '北東スタート', 'spawn', [12, 0.05, -10], [1.5, 0.1, 1.5], '#efab72'),
      box('w1', '中央の射線を切る壁', 'wall', [0, 1.3, 0], [5, 2.6, 1], '#647682'),
      ...[[-6, -4], [6, -4], [-6, 4], [6, 4], [0, -9], [0, 9]].map(([x, z], i) => model(`c${i + 1}`, `遮蔽物 ${i + 1}`, 'cover', x, z, 1, 1.2)),
      model('t1', '北西の見張り塔', 'tower', -11, -8, 1, 0.35),
      box('w2', '西の外壁', 'wall', [-17, 1, 0], [0.5, 2, 30], '#647682'),
      box('w3', '東の外壁', 'wall', [17, 1, 0], [0.5, 2, 30], '#647682'),
    ];
    dummyPos = [-12, 0, 10];
    intent = '中央の壁の両側を回り込み、遮蔽物の間の距離や射線を試せる小さなアリーナです。';
    decisions = [{ object_id: 'w1', reason: '対角のスタート地点を結ぶ射線を遮り、左右の回り込みを促します。' }];
  } else if (scene.id === 'ruins') {
    objects = [
      box('g1', '遺跡の地面', 'ground', [0, -0.5, 0], [26, 1, 36], '#7d898c'),
      box('sp1', '入口', 'spawn', [0, 0.05, -13], [1.5, 0.1, 1.5], '#61c8b4'),
      ...Array.from({ length: 5 }, (_, i) => box(`cl${i + 1}`, `一段目の階段 ${i + 1}`, 'climb', [0, 0.2 + i * 0.4, -10 + i * 1.5], [3, 0.4, 1.5], '#aab3ae')),
      box('pf1', '中間の踊り場', 'platform', [0, 1.85, -0.25], [6, 0.3, 6], '#96a89e'),
      box('deck1', '踊り場中央の床', 'bridge', [0, 1.865, -0.25], [4, 0.25, 4], '#96a89e'),
      ...Array.from({ length: 5 }, (_, i) => box(`cl${i + 6}`, `二段目の階段 ${i + 1}`, 'climb', [0, 2.2 + i * 0.4, 3.5 + i * 1.5], [3, 0.4, 1.5], '#aab3ae')),
      box('pf2', '見晴らしのよいゴール台', 'platform', [0, 3.85, 13.25], [6, 0.3, 6], '#96a89e'),
      box('deck2', 'ゴール台中央の床', 'bridge', [0, 3.865, 13.25], [4, 0.25, 4], '#96a89e'),
      box('gl1', 'ゴールの目印', 'goal', [0, 4.15, 14], [1.2, 0.3, 1.2], '#edca68'),
    ];
    objects = objects.map(object => ({ ...object, pos: [object.pos[0], object.pos[1], -object.pos[2]] }));
    dummyPos = [0, 0, 13];
    intent = '高さ0.4mずつの階段を通じて、入口から高さ4mのゴール台まで歩いて登れる遺跡です。';
    decisions = [{ object_id: 'pf1', reason: '途中に広い踊り場を置き、登った高さと次の経路を確認できるようにします。' }];
  } else if (scene.id === 'garden') {
    objects = [
      box('g1', '庭園の地面', 'ground', [0, -0.5, 0], [36, 1, 36], '#6f8b71'),
      box('walk1', '入口からの小道', 'corridor', [0, 0.08, 8], [2.5, 0.16, 12], '#c7bda4'),
      box('walk2', '横に広がる小道', 'corridor', [0, 0.08, 0], [18, 0.16, 2.5], '#c7bda4'),
      model('lm1', '庭園のシンボル', 'landmark', 0, -5, 2, 0.4),
      box('pond1', '東側の池', 'water', [9, 0.04, 5], [6, 0.08, 5], '#5b9fae'),
      ...[[-11, -10], [10, -10], [-11, 10], [11, 12]].map(([x, z], i) => model(`tr${i + 1}`, `庭木 ${i + 1}`, 'tree', x, z, i % 2 ? 3 : 1, 0.65)),
      model('rk1', '池のそばの庭石', 'rock', 6, 7, 1, 0.6),
      model('rk2', '北側の庭石', 'rock', -6, -8, 1, 0.7),
      ...[[-4, 4], [4, -2], [-5, -3], [5, 10]].map(([x, z], i) => model(`pl${i + 1}`, `小さな植栽 ${i + 1}`, 'plant', x, z, 1, 0.8)),
    ];
    dummyPos = [0, 0.16, 12];
    intent = '小道を中心に、庭木・池・庭石を配置した庭園です。植栽や主役を動かして構図を試せます。';
    decisions = [{ object_id: 'walk1', reason: '入口からシンボルへ視線を誘導し、歩ける空間を確保します。' }];
  } else {
    throw new Error('サンプルが見つかりません。');
  }
  const ground = objects.find(object => object.role === 'ground');
  return {
    project: {
      metadata: { game_mode: scene.mode, theme: scene.theme, generator: 'sample', design_rationale: {
        ground_size: [ground.size[0], ground.size[2]], spatial_plan: intent,
        overall_intent: intent, key_decisions: decisions,
        tradeoffs: ['体験用の小さなサンプルです。戦闘・勝敗・ゴール判定はありません。'],
      } },
      objects, logs: createEmptyLogs(), aiReview: null,
    },
    editor: { inputText: '', dummyPos, showDummy: true, isPartialEdit: true },
  };
}
