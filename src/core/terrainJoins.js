import { surfaceTop, getCollisionParts, WALKING } from './spatialGeometry.js';
import { SPATIAL_GRID } from './spatialPlan.js';
import { getStairLayout } from './assemblySizing.js';
import { inspectTerrainPortalWalking } from './terrainPortalWalking.js';

export function terrainPortalWidth(area, connections) {
  const mouth = Math.max(4, ...connections.filter(c => c.from === area.id || c.to === area.id).map(c => c.width + 2 * (c.flare || 0)));
  return Math.min(12, mouth + 2 * (WALKING.radius + Math.max(area.width, area.depth) / 12));
}

// Compare both ends across the full portal, including intentional first risers.
export function terrainJoinMeasurements(objects, plan) {
  const rows = [];
  for (const [index, c] of plan.connections.entries()) {
    const a = plan.areas.find(a => a.id === c.from), b = plan.areas.find(a => a.id === c.to);
    const axis = a.gx === b.gx ? 2 : 0, extent = axis === 2 ? 'depth' : 'width', lateral = axis === 2 ? 0 : 2;
    const direction = Math.sign((axis === 2 ? b.gz - a.gz : b.gx - a.gx));
    const run = Math.abs((axis === 2 ? b.gz - a.gz : b.gx - a.gx) * SPATIAL_GRID) - (a[extent] + b[extent]) / 2;
    const rise = Math.abs(a.level - b.level) * 4;
    const step = rise && c.traversal !== 'ramp' ? rise / getStairLayout([c.width, rise, run]).count : 0;
    for (const [room, sign] of [[a, direction], [b, -direction]]) for (let i = 0; i <= 16; i++) {
      const point = [room.gx * SPATIAL_GRID, room.gz * SPATIAL_GRID];
      point[axis === 2 ? 1 : 0] += sign * room[extent] / 2;
      const width = c.width + 2 * (c.flare || 0), offset = (i / 16 - 0.5) * (width - 0.002);
      point[lateral === 0 ? 0 : 1] += offset;
      const floorIds = [`sp_area_${room.id}`, ...(room.footprint === 'inset-corners' ? [`sp_area_${room.id}_floor_north`, `sp_area_${room.id}_floor_south`] : [])];
      const floorHeights = objects.filter(o => floorIds.includes(o.id)).map(o => surfaceTop(o, point[0], point[1])).filter(y => y !== null);
      const height = floorHeights.length ? Math.max(...floorHeights) : null;
      const link = objects.find(o => o.id === `sp_link_${index}`);
      const heights = (link ? getCollisionParts(link) : []).map(o => surfaceTop(o, point[0], point[1])).filter(y => y !== null);
      const linkHeight = heights.length ? Math.max(...heights) : null;
      const intentionalFirstRiser = room.level === Math.min(a.level, b.level) ? step : 0;
      rows.push({ from: c.from, to: c.to, area: room.id, offset, expected: room.level * 4, height,
        extraLip: height === null ? null : room.level * 4 - height, linkHeight, intentionalFirstRiser,
        joinError: height === null || linkHeight === null ? null : linkHeight - height - intentionalFirstRiser });
    }
  }
  return rows;
}

export function inspectTerrainJoins(objects, plan) {
  const enabled = new Set((plan.connections || []).flatMap(c => [c.from, c.to]).filter(id => objects.some(o => o.id === `sp_area_${id}` && o.terrainProfile?.portalWidth !== undefined)));
  const samples = enabled.size ? terrainJoinMeasurements(objects, plan).filter(r => enabled.has(r.area)) : [];
  const failures = new Map();
  for (const row of samples) if (row.height === null || row.linkHeight === null || Math.abs(row.extraLip) > 0.01 || Math.abs(row.joinError) > 0.01) failures.set(`${row.from}:${row.to}:${row.area}`, row);
  const repairableAreas = [...new Set([...failures.values()].filter(row => {
    const area = plan.areas.find(a => a.id === row.area), floor = objects.find(o => o.id === `sp_area_${row.area}`);
    return floor?.terrainProfile?.portalWidth < terrainPortalWidth(area, plan.connections);
  }).map(row => row.area))];
  const walking = inspectTerrainPortalWalking(objects, plan);
  const walkingFailures = walking.filter(r => !r.forward || !r.backward);
  for (const row of walkingFailures) {
    const key = `${row.from}:${row.to}:${row.area}`;
    if (!failures.has(key)) failures.set(key, { ...row, walking: true });
  }
  const issues = [], locations = [];
  for (const row of failures.values()) {
    const name = id => plan.areas.find(a => a.id === id)?.name || id;
    issues.push(`${name(row.from)}→${name(row.to)}: ${name(row.area)}側の接続口${row.walking ? 'で左右・中央の往復歩行を確認できません。入口脇の障害物や頭上空間を確認してください。' : 'の幅全体で床が揃っていません。'}`);
    const i = plan.connections.findIndex(c => c.from === row.from && c.to === row.to);
    locations.push({ id: `terrain-join:${i}:${row.area}`, kind: 'connection', from: row.from, to: row.to, objectId: `sp_link_${i}`, label: `${name(row.area)}側の接続口` });
  }
  return { checkedSamples: samples.length, missingSamples: samples.filter(r => r.height === null || r.linkHeight === null).length,
    maxExtraLip: Math.max(0, ...samples.map(r => Math.abs(r.extraLip || 0))), maxJoinError: Math.max(0, ...samples.map(r => Math.abs(r.joinError || 0))),
    walking: { checkedDirections: walking.length * 2, passedDirections: walking.reduce((n, r) => n + Number(r.forward) + Number(r.backward), 0), failures: walkingFailures },
    repairableAreas, issues, locations };
}
