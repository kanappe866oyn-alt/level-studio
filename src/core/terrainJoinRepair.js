import { terrainJoinMeasurements, terrainPortalWidth } from './terrainJoins.js';
import { validateTerrainProfile } from './terrainSurface.js';
import { regroundTerrainObjects } from './spatialGeometry.js';
import { validateSpatialPlan } from './spatialPlan.js';
import { recheckSpatialStage } from './spatialRecheck.js';

// Widen only existing landing reservations. Never move a room/link or flatten
// an entire stage to disguise an unrelated broken route. Adoption is atomic.
export function repairTerrainJoins(objects, design, prefabs) {
  const plan = validateSpatialPlan(design.plan);
  const failures = new Set(terrainJoinMeasurements(objects, plan)
    .filter(r => r.height === null || r.linkHeight === null || Math.abs(r.extraLip) > 0.01 || Math.abs(r.joinError) > 0.01)
    .map(r => r.area));
  let candidate = objects;
  const changedIds = [];
  for (const area of plan.areas.filter(a => failures.has(a.id))) {
    const previous = candidate.find(o => o.id === `sp_area_${area.id}`);
    if (!Number.isFinite(previous?.terrainProfile?.portalWidth)) continue;
    const width = Math.max(previous.terrainProfile.portalWidth, terrainPortalWidth(area, plan.connections));
    if (width === previous.terrainProfile.portalWidth) continue;
    const next = { ...previous, terrainProfile: validateTerrainProfile({ ...previous.terrainProfile, portalWidth: width }) };
    candidate = regroundTerrainObjects(candidate.map(o => o === previous ? next : o), previous, next, prefabs);
    changedIds.push(next.id);
  }
  if (!changedIds.length) return { status: failures.size ? 'rejected' : 'unchanged', objects, changedIds: [] };
  const report = recheckSpatialStage(candidate, design);
  if (!report.passed) return { status: 'rejected', objects, changedIds: [], report };
  return { status: 'repaired', objects: candidate, changedIds, report };
}
