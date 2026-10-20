import { SPATIAL_GRID, independentRouteCount, validateSpatialPlan } from './spatialPlan.js';
import { createSpatialWorld } from './spatialGeometry.js';
import { inspectSpatialSightlines } from './spatialSightlines.js';
import { inspectConnectionWalking } from './spatialStageGenerator.js';
import { inspectSpatialRequest } from './spatialRequest.js';
import { measureSpatialStage } from './spatialMeasurements.js';
import { spatialRouteViews } from './spatialRouteViews.js';
import { inspectSpatialResilience } from './spatialResilience.js';
import { inspectBuildingApproaches } from './buildingPlots.js';
import { inspectTerrainJoins } from './terrainJoins.js';

// Keep the original area anchors: moving a floor must not silently move the
// requested observation point or replace a broken connection with a new route.
export function recheckSpatialStage(objects, design) {
  const plan = validateSpatialPlan(design.plan);
  const areas = plan.areas.map(a => ({ ...a, x: a.gx * SPATIAL_GRID, z: a.gz * SPATIAL_GRID, y: a.level * 4 }));
  const world = createSpatialWorld(objects);
  const supports = areas.map(a => {
    const floor = world.floor(a.x, a.z, a.y);
    return { id: a.id, name: a.name, passed: Number.isFinite(floor) && Math.abs(floor - a.y) < 0.05 && !world.dangerous(a.x, a.z, floor) };
  });
  const supported = id => supports.find(a => a.id === id)?.passed;
  const connections = inspectConnectionWalking({ objects, areas, connections: plan.connections }).map(c => ({ ...c,
    passed: c.forward && c.backward && supported(c.from) && supported(c.to) }));
  const validLinks = connections.filter(c => c.passed);
  const routes = independentRouteCount(plan.areas, validLinks);
  const seen = new Set([areas.find(a => a.kind === 'entry').id]);
  for (let i = 0; i < areas.length; i++) for (const c of validLinks) {
    if (seen.has(c.from)) seen.add(c.to);
    if (seen.has(c.to)) seen.add(c.from);
  }
  const sightlines = inspectSpatialSightlines(objects, areas, plan.requirements.sightlines).map(s => ({ ...s,
    passed: s.passed && supported(s.from) && supported(s.to) }));
  const issues = supports.filter(a => !a.passed).map(a => `${a.name}: 元の確認地点で床高さ・立つ空間を確認できません。`);
  const buildingApproaches = inspectBuildingApproaches({ objects, areas, plan });
  const terrainJoins = inspectTerrainJoins(objects, plan);
  issues.push(...terrainJoins.issues);
  for (const b of buildingApproaches.filter(b => !b.passed)) issues.push(`${b.id}: 建物入口前への往復歩行を確認できません。`);
  const name = id => areas.find(a => a.id === id).name;
  for (const c of connections.filter(c => !c.passed)) issues.push(`${name(c.from)} → ${name(c.to)}: 元の接続の往復歩行を確認できません。`);
  for (const a of areas.filter(a => !seen.has(a.id))) issues.push(`${a.name}: 入口から元の接続を通って到達できません。`);
  if (routes < plan.requirements.minimumRoutes) issues.push(`独立経路が${routes}本に減っています（必要${plan.requirements.minimumRoutes}本）。`);
  for (const s of sightlines.filter(s => !s.passed)) issues.push(`${name(s.from)} → ${name(s.to)}: ${s.relation === 'visible' ? '見える' : '見えない'}条件が未達です（${s.visibleSamples}/${s.totalSamples}目線、対象の床も確認）。`);
  const checks = design.request_contract ? inspectSpatialRequest(plan, design.request_contract, { geometry: true, sightlines }).rows.map(row => {
    const condition = design.request_contract.conditions.find(c => c.id === row.id);
    if (condition.kind === 'routes') {
      const passed = condition.operator === 'atLeast' ? routes >= condition.value : condition.operator === 'atMost' ? routes <= condition.value : routes === condition.value;
      return { ...row, passed, detail: `往復歩行を確認した元の接続による独立経路: ${routes}本（指定${condition.value}本${condition.operator === 'atLeast' ? '以上' : condition.operator === 'atMost' ? '以下' : ''}）` };
    }
    if (condition.kind === 'sight') {
      const sight = sightlines.find(s => s.from === row.from && s.to === row.to && s.relation === condition.relation);
      return { ...row, passed: row.passed && !!sight?.passed, detail: `${row.detail}（対象の床も照合）` };
    }
    // A height check also requires a standing space at the original high area.
    const relevant = areas.filter(a => a.kind === 'high' && row.detail.includes(`${a.name}:`));
    return { ...row, passed: row.passed && relevant.length > 0 && relevant.every(a => supported(a.id)), detail: `${row.detail}（元の地点の床高さ・立つ空間を照合）` };
  }) : [];
  for (const c of checks.filter(c => !c.passed)) issues.push(`「${c.evidence}」: ${c.detail}`);
  const locations = [
    ...terrainJoins.locations,
    ...buildingApproaches.filter(b => !b.passed).map(b => ({ id: `building:${b.id}`, kind: 'area', from: b.from,
      objectId: `sp_build_${b.id}_model`, label: `${name(b.from)}沿いの建物入口前` })),
    ...supports.filter(a => !a.passed || !seen.has(a.id)).map(a => ({ id: `area:${a.id}`, kind: 'area', from: a.id, label: `${a.name}の確認地点` })),
    ...connections.flatMap((c, i) => c.passed ? [] : [{ id: `connection:${i}`, kind: 'connection', from: c.from, to: c.to, objectId: `sp_link_${i}`, label: `${name(c.from)} → ${name(c.to)}の接続` }]),
    ...sightlines.filter(s => !s.passed).map(s => ({ id: `sight:${s.from}:${s.to}`, kind: 'sight', from: s.from, to: s.to, label: `${name(s.from)} → ${name(s.to)}の視線` })),
  ];
  for (const c of checks.filter(c => !c.passed && c.from && c.to)) {
    if (!locations.some(l => l.kind === 'sight' && l.from === c.from && l.to === c.to)) {
      locations.push({ id: `sight:${c.from}:${c.to}`, kind: 'sight', from: c.from, to: c.to, label: `${name(c.from)} → ${name(c.to)}の視線` });
    }
  }
  const measurements = measureSpatialStage(objects, areas, connections, supports);
  return { routes, routeViews: spatialRouteViews(areas, connections), resilience: inspectSpatialResilience(areas, connections), connections, sightlines, buildingApproaches, terrainJoins, supports, checks, locations, measurements, issues: [...new Set(issues)], passed: issues.length === 0 };
}
