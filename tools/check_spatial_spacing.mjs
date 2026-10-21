import { writeFileSync } from 'node:fs';
import { createTerrainSpatialPlan } from '../src/core/spatialPlan.js';
import { repairSpatialPlanSpacing } from '../src/core/spatialPlanSpacing.js';
import { buildSpatialStage, inspectSpatialStage, inspectConnectionWalking } from '../src/core/spatialStageGenerator.js';

// Deterministic geometry stress cases, not a cloud model success-rate benchmark.
const rows = [];
for (const size of [8, 10, 12]) for (const curve of [0, 2]) for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
  const plan = createTerrainSpatialPlan();
  plan.areas.forEach(a => { a.gx *= sx / 2; a.gz *= sz / 2; a.width = size; a.depth = size; });
  plan.connections.find(c => c.traversal === 'ramp').curve = curve;
  const row = { size, curve, sx, sz, beforePassed: false, afterPassed: false };
  try { row.beforePassed = inspectSpatialStage(buildSpatialStage(plan)).issues.length === 0; }
  catch (error) { row.beforeIssue = error.message; }
  try {
    const repair = repairSpatialPlanSpacing(plan);
    const stage = buildSpatialStage(repair?.plan ?? plan);
    const report = inspectSpatialStage(stage), walking = inspectConnectionWalking(stage);
    row.issues = report.issues;
    row.walkingDirections = walking.filter(c => c.forward).length + walking.filter(c => c.backward).length;
    row.expectedDirections = walking.length * 2;
    row.routes = report.independentRoutes;
    row.afterPassed = report.issues.length === 0 && row.walkingDirections === row.expectedDirections;
  } catch (error) { row.issues = [error.message]; }
  rows.push(row);
}
const report = { cloudApiCalled: false, description: 'Cramped synthetic terrain plans, three plaza dimensions, straight/curved ramps, four orientations; raw geometry only.',
  cases: rows.length, beforePassed: rows.filter(r => r.beforePassed).length, afterPassed: rows.filter(r => r.afterPassed).length, rows };
writeFileSync(process.argv[2] || 'output/spatial-spacing-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ cases: report.cases, beforePassed: report.beforePassed, afterPassed: report.afterPassed }));
if (report.afterPassed !== report.cases) process.exitCode = 1;
