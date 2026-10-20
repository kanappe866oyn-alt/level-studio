import { withCloisterSpatialRhythm } from './cloisterSpatialRhythm.js';
import { withCloisterConnections } from './cloisterConnections.js';
import { withCloisterSpacing } from './cloisterSpacing.js';
import { createMarketTerrainPlan } from './marketTerrainPlan.js';
import { createSettlementTerrainPlan } from './spatialPlan.js';
import { varyBuildingRows } from './proceduralBuildings.js';
import { withSkyCourtyard } from './skyCourtyardPlan.js';
import { withStreetHierarchy } from './streetHierarchyPlan.js';
import { withStairTerrace } from './stairTerracePlan.js';
import { createCloisterTerrainPlan } from './cloisterTerrainPlan.js';
import { terrainFamily, validateTerrainRecipe, TERRAIN_VERSION } from './terrainRecipe.js';
import { withRecessedFrontages } from './buildingFrontages.js';
import { withTerraceCrossings } from './terraceCrossingsPlan.js';
import { withTerraceSpatialRhythm } from './terraceSpatialRhythm.js';
import { withTerraceSightPlan } from './terraceSightPlan.js';

function terraces() {
  const area = (id, name, kind, x, z, y) => ({ id, name, kind, gx: x / 16, gz: z / 16, level: y / 4, width: 10, depth: 10, enclosure: 'open' });
  const link = (from, to, traversal, curve) => ({ from, to, width: 4, enclosure: 'open', ...(traversal ? { traversal } : {}), ...(curve ? { curve } : {}) });
  return {
    intent: '入口から2・4mの踊り場を経て6mの展望広場へ登る。低地の庭と西の尾根を通る別経路を持つ段丘の集落。', foundation: 'terrain', openRailings: true,
    areas: [area('arrival', '低地の入口', 'entry', -24, 24, 0), area('market', '中段の住宅広場', 'courtyard', 0, 24, 2),
      area('landing', '4mの踊り場', 'high', 0, 0, 4), area('destination', '6mの展望広場', 'goal', 24, 0, 6),
      area('garden', '低地の庭', 'courtyard', -24, 0, 0), area('ridge', '西の尾根', 'high', -24, -24, 4), area('upper', '上段の通り', 'high', 24, -24, 6)],
    connections: [link('arrival', 'market', 'ramp'), link('market', 'landing', 'stairs', 1.5), link('landing', 'destination', 'stairs'),
      link('arrival', 'garden'), link('garden', 'ridge', 'stairs'), link('ridge', 'upper', 'ramp', -2), link('upper', 'destination')],
    buildings: [{ id: 'arrival_house', from: 'arrival', side: 'south', variant: 2, approachLength: 2 },
      { id: 'market_house', from: 'market', side: 'east', variant: 1, approachLength: 2 }, { id: 'garden_house', from: 'garden', side: 'west', variant: 3, approachLength: 2 }],
    requirements: { minimumRoutes: 2, sightlines: [] }, limitations: [],
  };
}

// A bounded grammar, not unrestricted AI: seed reproduces the graph, dimensions,
// elevations and orientation. Every result still passes the normal stage checks.
// Retain earlier versions and their random draw order for saved seed replay.
export function createProceduralTerrainLayout(seed = 0, { version = TERRAIN_VERSION } = {}) {
  validateTerrainRecipe({ seed, version });
  let state = (seed ^ 0x9e3779b9) >>> 0 || 1;
  const pick = values => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return values[(state >>> 0) % values.length]; };
  const family = terrainFamily(seed, version);
  let plan = family === 'cloister' ? createCloisterTerrainPlan() : family === 'market' ? createMarketTerrainPlan() : family === 'terraces' ? terraces() : createSettlementTerrainPlan();
  if (family === 'market') {
    const west = pick([-26, -24, -22]), east = pick([10, 12, 14]), north = pick([-36, -34, -32, -30]), south = pick([30, 32, 34, 36]);
    for (const a of plan.areas) { a.gx = (a.gx < 0 ? west : east) / 16; a.gz = (a.gz < 0 ? north : a.gz > 0 ? south : 0) / 16; }
    const court = plan.areas.find(a => a.id === 'court'), market = plan.areas.find(a => a.id === 'market');
    court.width = pick([20, 22, 24]); court.depth = pick([16, 18, 20]); court.level = pick([0.5, 1]);
    market.width = pick([20, 24]); market.level = pick([0, 0.5]);
    plan.areas.find(a => a.id === 'lane').depth = pick([18, 20, 24]);
    if (pick([false, true])) plan.connections = plan.connections.filter(c => !(c.from === 'lane' && c.to === 'court'));
    for (const c of plan.connections) if (plan.areas.find(a => a.id === c.from).level === plan.areas.find(a => a.id === c.to).level) delete c.traversal;
    plan.intent = '広い中庭と細長い市場を、低地の路地と尾根を通る二経路で結ぶ集落。広場の広さ・間隔・高さと、経路間の連絡階段を構造ルールの範囲で変える。';
  } else if (family === 'terraces') {
    if (pick([false, true])) plan.connections.push({ from: 'garden', to: 'landing', width: 4, enclosure: 'open', traversal: 'stairs' });
    const market = plan.areas.find(a => a.id === 'market'); market.width = pick([10, 12]);
  } else if (family === 'bridge') {
    const centre = plan.areas.find(a => a.id === 'centre');
    centre.width = pick([10, 12]); centre.depth = pick([10, 12]);
    // Keep every relative portal position valid, within the planner's bounds.
    const dx = pick([0, 1, 2]) / 16, dz = pick([-2, 0, 2]) / 16;
    for (const a of plan.areas) { a.gx += dx; a.gz += dz; }
    if (version >= 2) {
      const west = plan.areas.find(a => a.id === 'west'), north = plan.areas.find(a => a.id === 'high_n');
      plan.areas.push({ id: 'west_return', name: '住宅街の回遊広場', kind: 'courtyard', gx: west.gx, gz: north.gz,
        level: west.level, width: 10, depth: 10, enclosure: 'open' });
      plan.connections.push(
        { from: 'west', to: 'west_return', width: 4, enclosure: 'open', flare: 0.5 },
        { from: 'west_return', to: 'high_n', width: 4, enclosure: 'open', traversal: 'ramp', flare: 0.5 });
      plan.buildings.find(b => b.id === 'west_north').from = 'west_return';
      plan.intent += ' 西の住宅街は行き止まりにせず、回遊広場と2m上る坂から北西の高台へ戻れる輪につなぐ。';
    }
  }
  if (version >= 24 && family === 'cloister') plan = withCloisterSpatialRhythm(plan);
  if (version >= 25 && family === 'cloister') plan = withCloisterConnections(plan, seed);
  if (version >= 26 && family === 'cloister') plan = withCloisterSpacing(plan, seed);
  if (version >= 11 && family === 'terraces') plan = withTerraceCrossings(plan);
  if (version >= 13 && family === 'terraces') {
    plan.areas = plan.areas.map(a => ['market', 'north_landing'].includes(a.id) ? { ...a, enclosure: 'walled' } : a);
    plan.intent += ' 中段の住宅広場と上段の回遊広場を壁と門で囲み、開けた段丘の道と囲まれた広場の違いを作る。';
  }
  if (version >= 16 && family === 'terraces') plan = withTerraceSpatialRhythm(plan);
  if (version >= 17 && family === 'terraces') plan = withTerraceSightPlan(plan);
  if (version >= 3) {
    // Recessed courts contrast with the long streets. Keep narrow passages and
    // the bridge landings intact, including the portals and building frontage.
    for (const a of plan.areas) if (a.kind === 'courtyard' && Math.max(a.width, a.depth) / Math.min(a.width, a.depth) < 2) a.footprint = 'inset-corners';
  }
  if (version >= 4) plan.pathScreens = true;
  if (version >= 6 && family === 'bridge' && seed % 2 === 0) plan = withSkyCourtyard(plan);
  const rotation = pick([0, 1, 2, 3]), mirrored = pick([false, true]);
  const sides = ['north', 'east', 'south', 'west'];
  if (mirrored) {
    for (const a of plan.areas) a.gx = -a.gx || 0;
    for (const c of plan.connections) if (c.curve) c.curve *= -1;
    for (const b of plan.buildings || []) if (b.side === 'east' || b.side === 'west') b.side = b.side === 'east' ? 'west' : 'east';
  }
  for (let i = 0; i < rotation; i++) {
    for (const a of plan.areas) { [a.gx, a.gz] = [-a.gz || 0, a.gx || 0]; [a.width, a.depth] = [a.depth, a.width]; }
    for (const b of plan.buildings || []) b.side = sides[(sides.indexOf(b.side) + 1) % 4];
  }
  if (version >= 5) plan = varyBuildingRows(plan, seed);
  if (version >= 7) plan = withStreetHierarchy(plan);
  if (version >= 8 && family === 'bridge') plan = withStairTerrace(plan);
  if (version >= 10) plan = withRecessedFrontages(plan, seed);
  plan.limitations.push(`${version >= 9 ? 4 : 3}種類の構造ルールによる自動生成。自由なAI設計の成功率、建物内部の通行、対戦バランスは未評価。`);
  return { plan, variation: { version, seed, family, rotation: rotation * 90, mirrored } };
}
