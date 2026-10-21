import test from 'node:test';
import assert from 'node:assert/strict';
import { readSpatialRequest, spatialRequestProblems, inspectSpatialRequest, validateSpatialRequestRecord } from '../src/core/spatialRequest.js';
import { createTerrainSpatialPlan } from '../src/core/spatialPlan.js';
import { generatePlannedSpatialStage, inspectConnectionWalking } from '../src/core/spatialStageGenerator.js';
import { recheckSpatialStage } from '../src/core/spatialRecheck.js';

const request = '中庭は幅16m、奥行12m。入口から西の高台へ幅4mの坂でつなぐ。';
const expected = () => {
  const plan = createTerrainSpatialPlan();
  Object.assign(plan.areas.find(a => a.kind === 'courtyard'), { width: 16, depth: 12 });
  plan.connections.find(c => c.from === 'entry' && c.to === 'high_s').width = 4;
  return plan;
};

test('layout instructions retain both axes, scoped endpoints and full-width metric units', () => {
  const brief = readSpatialRequest(request);
  assert.deepEqual(brief.conditions.map(c => c.kind), ['areaSize', 'areaSize', 'connection']);
  assert.deepEqual(brief.conditions.slice(0, 2).map(c => [c.target, c.axis, c.value]), [['中庭', 'width', 16], ['中庭', 'depth', 12]]);
  assert.deepEqual(brief.notes, []);
  const linked = readSpatialRequest('入口と西の高台を幅４００ｃｍのスロープで結ぶ').conditions[0];
  assert.equal(linked.width, 4); assert.equal(linked.traversal, 'ramp');
  assert.deepEqual(readSpatialRequest('中庭の幅を二十メートルで奥行き16000mmにする').conditions.map(c => c.value), [20, 16]);
  assert.deepEqual(readSpatialRequest('中庭の幅20mで入口の幅12m').conditions.map(c => [c.target, c.value]), [['中庭', 20], ['入口', 12]]);
});

test('preferences, negations, unrelated clauses and unsupported ranges cannot silently become exact dimensions', () => {
  for (const text of ['できれば中庭は幅16m、奥行12m', '中庭は幅16mではなく20m', '入口から高台へ坂を使わず階段でつなぐ', '入口から高台へ幅4m以上の坂でつなぐ']) {
    const brief = readSpatialRequest(text);
    assert.equal(brief.conditions.filter(c => ['areaSize', 'connection'].includes(c.kind)).length, 0, text);
    assert.ok(brief.notes.length, text);
  }
  const scoped = readSpatialRequest('中庭は幅16m、岩山を置く、奥行12m');
  assert.equal(scoped.conditions.length, 1);
  assert.ok(scoped.notes.some(s => s.includes('対象')));
  const dimension = readSpatialRequest('幅16mの高台');
  assert.equal(dimension.conditions.some(c => c.kind === 'height'), false);
});

test('wrong width, wrong ramp and flat stairs fail against the human request even when labels claim success', () => {
  const brief = readSpatialRequest(request), plan = expected();
  assert.deepEqual(inspectSpatialRequest(plan, brief).issues, []);
  const wrongSize = structuredClone(plan); wrongSize.areas.find(a => a.kind === 'courtyard').width = 8;
  assert.ok(inspectSpatialRequest(wrongSize, brief).issues.some(s => s.includes('幅8m')));
  for (const mutate of [c => { c.width = 3; }, c => { c.traversal = 'stairs'; }]) {
    const wrong = structuredClone(plan); mutate(wrong.connections.find(c => c.from === 'entry' && c.to === 'high_s'));
    assert.ok(inspectSpatialRequest(wrong, brief).issues.some(s => s.includes('直接接続')));
  }
  const flat = structuredClone(plan);
  const stairs = readSpatialRequest('入口から中庭へ階段でつなぐ');
  flat.connections.find(c => c.from === 'entry' && c.to === 'centre').traversal = 'stairs';
  assert.ok(inspectSpatialRequest(flat, stairs).issues.length);
});

test('impossible or conflicting explicit dimensions stop before consuming an AI request', async () => {
  for (const text of ['中庭は幅30m', '中庭は奥行6m', '入口から高台へ幅2mの坂でつなぐ', '中庭は幅16m。中庭は幅20m。', '入口から高台へ坂でつなぐ。高台から入口へ階段でつなぐ。']) {
    const brief = readSpatialRequest(text);
    assert.ok(spatialRequestProblems(brief).length, text);
    await assert.rejects(generatePlannedSpatialStage({ userPrompt: text, prompt: '', mode: 'free', signal: new AbortController().signal,
      requestPlan: () => assert.fail('must not consume API'), validateStage: () => [] }), { code: 'SPATIAL_VALIDATION' });
  }
});

test('a wrong first proposal is repaired, assembled and physically checked without relaxing the requested geometry', async () => {
  let calls = 0;
  const stage = await generatePlannedSpatialStage({ userPrompt: request, prompt: '地形を設計', mode: 'free', finish: false,
    signal: new AbortController().signal, validateStage: () => [], requestPlan: async prompt => {
      assert.match(prompt, /areaSize/); assert.match(prompt, /connection/);
      if (++calls === 1) return createTerrainSpatialPlan();
      assert.match(prompt, /幅16m|幅4m/);
      return expected();
    } });
  assert.equal(calls, 2);
  const floor = stage.objects.find(o => o.id === 'sp_area_centre');
  assert.equal(floor.size[0], 16); assert.equal(floor.size[2], 12);
  assert.ok(stage.connections.some(c => c.from === 'entry' && c.to === 'high_s' && c.traversal === 'ramp' && c.width === 4));
  assert.ok(inspectConnectionWalking(stage).every(c => c.forward && c.backward));
  const record = JSON.parse(JSON.stringify(stage.design_rationale.spatial_design.request_contract));
  assert.ok(record.checks.every(c => c.passed));
  assert.deepEqual(validateSpatialRequestRecord(record), record);
  const design = stage.design_rationale.spatial_design;
  assert.ok(recheckSpatialStage(stage.objects, design).checks.every(c => c.passed));
  const smaller = stage.objects.map(o => o.id === floor.id ? { ...o, size: [8, o.size[1], o.size[2]] } : o);
  assert.equal(recheckSpatialStage(smaller, design).checks[0].passed, false, 'manual resizing cannot pass using stale plan dimensions');
  const linkIndex = stage.plan.connections.findIndex(c => c.from === 'entry' && c.to === 'high_s');
  const narrow = stage.objects.map(o => o.id === `sp_link_${linkIndex}` ? { ...o, size: [3, o.size[1], o.size[2]] } : o);
  assert.equal(recheckSpatialStage(narrow, design).checks[2].passed, false, 'narrowing a still-walkable ramp cannot retain the old width check');
  const corrupt = structuredClone(record); corrupt.conditions.find(c => c.kind === 'connection').width = 2;
  assert.throws(() => validateSpatialRequestRecord(corrupt));
});
