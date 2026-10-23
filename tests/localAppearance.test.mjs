import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLocalPalette, LOCAL_PALETTES } from '../src/core/localAppearance.js';
import { validateProjectImport } from '../src/core/projectImport.js';
import ASSETS from '../src/assets.json' with { type: 'json' };

const objects = ['ground', 'climb', 'building', 'cover', 'spawn'].map((role, i) => ({
  id: `o${i}`, role, type: 'box', pos: [i * 4, 1, 0], size: [3, 2, 3], rot: [0, 0.5, 0],
  variant: 1, color: '#abcdef', color2: '#123456',
}));
test('all palettes preserve geometry and asset fields, leave source intact and round-trip through project import', () => {
  const before = structuredClone(objects);
  for (const palette of LOCAL_PALETTES) {
    const result = applyLocalPalette(objects, palette.id);
    assert.ok(result.changed > 0);
    const geometry = list => list.map(({ color, ...rest }) => rest);
    assert.deepEqual(geometry(result.objects), geometry(objects));
    assert.deepEqual(objects, before);
    const project = JSON.parse(JSON.stringify({ objects: result.objects }));
    const loaded = validateProjectImport(project, ASSETS.SEMANTIC_PREFABS, ASSETS.MODE_CONFIG);
    assert.deepEqual(loaded.objects.map(o => [o.pos, o.size, o.rot, o.color, o.color2]), result.objects.map(o => [o.pos, o.size, o.rot, o.color, o.color2]));
    assert.equal(applyLocalPalette(result.objects, palette.id).changed, 0);
  }
});
test('explicit color requirements, independent models and gameplay markers are retained', () => {
  const source = [...objects, { ...objects[2], id: 'custom', customModelUrl: '/custom.glb' }];
  const result = applyLocalPalette(source, 'sand', { generation_contract: { requirements: [{ kind: 'color', role: 'building' }] } });
  assert.equal(result.objects[2], source[2]);
  assert.equal(result.objects[4], source[4]);
  assert.equal(result.objects[5], source[5]);
  assert.equal(result.protectedCount, 1);
  assert.throws(() => applyLocalPalette(source, 'missing'));
});

