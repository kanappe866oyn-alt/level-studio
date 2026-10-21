import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrainSpatialPlan, validateSpatialPlan } from '../src/core/spatialPlan.js';
import { repairSpatialPlanSpacing } from '../src/core/spatialPlanSpacing.js';
import { buildSpatialStage, generatePlannedSpatialStage, inspectConnectionWalking, inspectSpatialStage } from '../src/core/spatialStageGenerator.js';

function compressed() {
  const plan = createTerrainSpatialPlan();
  plan.areas.forEach(a => { a.gx /= 2; a.gz /= 2; });
  return plan;
}

test('spacing repair preserves topology, dimensions, heights and direction without mutating the proposal', () => {
  const input = compressed(), original = structuredClone(input);
  const repaired = repairSpatialPlanSpacing(input);
  assert.ok(repaired.changes.length);
  assert.deepEqual(input, original);
  assert.deepEqual(repaired.plan.connections, input.connections);
  assert.deepEqual(repaired.plan.requirements, input.requirements);
  const withoutPosition = a => Object.fromEntries(Object.entries(a).filter(([k]) => !['gx', 'gz'].includes(k)));
  assert.deepEqual(repaired.plan.areas.map(withoutPosition), input.areas.map(withoutPosition));
  for (const a of input.areas) for (const b of input.areas) for (const axis of ['gx', 'gz']) {
    const ra = repaired.plan.areas.find(r => r.id === a.id), rb = repaired.plan.areas.find(r => r.id === b.id);
    assert.equal(Math.sign(ra[axis] - rb[axis]), Math.sign(a[axis] - b[axis]));
    assert.ok(Math.abs(ra[axis] - rb[axis]) >= Math.abs(a[axis] - b[axis]));
  }
  assert.ok(validateSpatialPlan(repaired.plan));
  const stage = buildSpatialStage(repaired.plan);
  assert.deepEqual(inspectSpatialStage(stage).issues, []);
  assert.ok(inspectConnectionWalking(stage).every(c => c.forward && c.backward));
});

test('valid spacing stays unchanged; impossible bounded layouts and malformed graphs are not disguised as repairs', () => {
  assert.equal(repairSpatialPlanSpacing(createTerrainSpatialPlan()), null);
  const plan = compressed();
  plan.areas.forEach(a => { a.width = 24; a.depth = 24; });
  // Six ordered rows of 24m rooms cannot be separated inside a 96m domain.
  plan.areas = Array.from({ length: 6 }, (_, i) => ({ ...plan.areas[0], id: `a${i}`, kind: i === 0 ? 'entry' : i === 5 ? 'goal' : 'passage', gx: i / 16, gz: 0 }));
  plan.connections = plan.areas.slice(1).map((a, i) => ({ from: `a${i}`, to: a.id, width: 4, enclosure: 'open' }));
  plan.requirements = { minimumRoutes: 1, sightlines: [] };
  assert.equal(repairSpatialPlanSpacing(plan), null);
  const malformed = compressed(); malformed.connections[0].to = 'missing';
  assert.throws(() => repairSpatialPlanSpacing(malformed));
});

test('curve and ramp clear lengths are solved together for several plaza sizes', () => {
  for (const width of [8, 10, 12, 16]) {
    const plan = compressed();
    plan.areas.forEach(a => { a.width = width; a.depth = width; });
    const ramp = plan.connections.find(c => c.traversal === 'ramp');
    ramp.curve = 4;
    const repaired = repairSpatialPlanSpacing(plan);
    assert.ok(repaired);
    const byId = new Map(repaired.plan.areas.map(a => [a.id, a]));
    for (const c of repaired.plan.connections) {
      const a = byId.get(c.from), b = byId.get(c.to), axis = a.gx === b.gx ? 'gz' : 'gx';
      const run = Math.abs(a[axis] - b[axis]) * 16 - width;
      assert.ok(run >= 1);
      if (c.traversal === 'ramp') assert.ok(run >= Math.abs(a.level - b.level) * 12 && run >= Math.abs(c.curve) * 3);
    }
  }
});

test('AI pipeline repairs a cramped plan locally, finishes geometry and preserves the human contract using one provider call', async () => {
  let calls = 0;
  const stage = await generatePlannedSpatialStage({ userPrompt: '入口から西の高台へ幅4mの坂でつなぐ。', prompt: '', mode: 'free',
    signal: new AbortController().signal, requestPlan: async () => { calls++; return compressed(); } });
  assert.equal(calls, 1);
  assert.ok(stage.design_rationale.spatial_design.spacing_adjustment.changes.length);
  assert.ok(stage.design_rationale.spatial_design.request_contract.checks.every(c => c.passed));
  assert.deepEqual(inspectSpatialStage(stage).issues, []);
  assert.ok(inspectConnectionWalking(stage).every(c => c.forward && c.backward));
});

test('spacing changes cannot waive a failed sight condition or consume unbounded retries', async () => {
  let calls = 0;
  await assert.rejects(generatePlannedSpatialStage({ userPrompt: '', prompt: '', mode: 'free', finish: false,
    signal: new AbortController().signal, requestPlan: async () => {
      calls++;
      const plan = compressed();
      plan.requirements.sightlines[0].relation = 'hidden';
      return plan;
    } }), /見えない/);
  assert.equal(calls, 3);
});
