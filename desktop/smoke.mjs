import { saveDraft, readDrafts } from '../src/core/draftStorage.js';
import { app, session } from 'electron';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startDesktop } from './application.mjs';

const root = process.cwd(), out = path.join(root, 'output');
writeFileSync(path.join(out, 'desktop-smoke-progress.json'), JSON.stringify({ phase: 'module-loaded', ready: app.isReady() }));
const phase = process.argv.includes('--restore') ? 'restore' : 'generate';
const seed = process.argv.includes('--seed=20') ? 20 : process.argv.includes('--seed=8') ? 8 : 43;
const rule = process.argv.includes('--rule=36') ? 36 : process.argv.includes('--rule=34') ? 34 : process.argv.includes('--rule=33') ? 33 : process.argv.includes('--rule=32') ? 32 : process.argv.includes('--rule=31') ? 31 : process.argv.includes('--rule=30') ? 30 : process.argv.includes('--rule=29') ? 29 : process.argv.includes('--rule=28') ? 28 : 27;
const expected = seed === 8 ? { objects: 1941, entrances: 10, portals: 240, eyes: [63], before: 461, after: 304 } :
  seed === 20 ? { objects: 1895, entrances: 10, portals: 228, eyes: [65], before: 459, after: 302 } :
  { objects: 1437, entrances: 10, portals: 192, eyes: [39, 61, 0, 0], before: 187, after: 142 };
if (rule === 28) { assert.equal(seed, 8, 'rule 28 desktop fixture uses seed 8'); expected.objects = 1966; }
if (rule === 29) { assert.equal(seed, 8, 'rule 29 desktop fixture uses seed 8'); expected.objects = 1988; }
if (rule === 30) { assert.equal(seed, 8, 'rule 30 desktop fixture uses seed 8'); expected.objects = 1986; }
if (rule === 31) { assert.equal(seed, 8, 'rule 31 desktop fixture uses seed 8'); expected.objects = 1986; }
if (rule === 32) { assert.equal(seed, 8, 'rule 32 desktop fixture uses seed 8'); expected.objects = 1986; }
if (rule === 33) { assert.equal(seed, 8, 'rule 33 desktop fixture uses seed 8'); expected.objects = 1986; }
if (rule === 34) { assert.equal(seed, 8, 'rule 34 desktop fixture uses seed 8'); expected.objects = 2061; }
if (rule === 36) { assert.equal(seed, 8, 'rule 36 desktop fixture uses seed 8'); expected.objects = 2083; }
const bundleIndex = process.argv.indexOf('--bundle');
const bundleRoot = bundleIndex < 0 ? path.join(root, 'dist') : path.resolve(process.argv[bundleIndex + 1]);
const profile = path.join(out, `desktop-smoke-profile-rule-${rule}`);
async function run() {
await mkdir(out, { recursive: true });
await mkdir(profile, { recursive: true });
try {
  writeFileSync(path.join(out, 'desktop-smoke-progress.json'), JSON.stringify({ phase: 'before-window', ready: app.isReady() }));
  const win = await startDesktop({ bundleRoot, userData: profile, show: false, downloadDirectory: out });
  writeFileSync(path.join(out, 'desktop-smoke-progress.json'), JSON.stringify({ phase: 'window-loaded', ready: app.isReady() }));
  let blockedExternalRequests = 0;
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => { blockedExternalRequests++; callback({ cancel: true }); });
  const isolation = await win.webContents.executeJavaScript("({node:typeof process,require:typeof require,origin:location.href,secure:isSecureContext,loaded:document.querySelector('#root').children.length>0})");
  assert.equal(isolation.node, 'undefined'); assert.equal(isolation.require, 'undefined'); assert.ok(isolation.secure); assert.ok(isolation.loaded);
  const model = await win.webContents.executeJavaScript("fetch('/building/1.glb').then(r=>r.arrayBuffer()).then(b=>({magic:new TextDecoder().decode(b.slice(0,4)),bytes:b.byteLength}))");
  assert.equal(model.magic, 'glTF');
  let objects, geometryWorker = null;
  if (phase === 'generate') {
    const workerFile = (await readdir(path.join(bundleRoot, 'assets'))).find(name => /^sampleProject\.worker-.*\.js$/.test(name));
    assert.ok(workerFile);
    const workspace = await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const worker=new Worker(${JSON.stringify('/assets/' + workerFile)},{type:'module'});const timer=setTimeout(()=>{worker.terminate();reject(new Error('worker timeout'))},120000);worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(new Error(e.message))};worker.onmessage=({data})=>{if(data.type==='complete'){clearTimeout(timer);worker.terminate();resolve(data.workspace)}else if(data.type==='error'){clearTimeout(timer);worker.terminate();reject(new Error(data.message))}};worker.postMessage({scene:{id:'spatial-varied',mode:'free',theme:'harbor',prompt:'構造ルールから生成'},seed:${seed},version:${rule}})})`);
    assert.equal(workspace.project.metadata.design_rationale.spatial_design.variation.version, rule);
    if (rule === 28) assert.equal(workspace.project.metadata.design_rationale.spatial_design.outer_gardens.models, 25);
    if (rule === 29) {
      const landscape = workspace.project.metadata.design_rationale.spatial_design.outer_gardens;
      assert.equal(landscape.models, 47); assert.equal(landscape.rocks, 12); assert.equal(landscape.trees, 35);
    }
    if (rule === 30) {
      const mountains = workspace.project.metadata.design_rationale.spatial_design.rock_mountains;
      assert.equal(mountains.mountains, 2);
      assert.ok(mountains.checks.every(m => m.summit > m.highestRoof + 5));
      assert.ok(workspace.project.objects.filter(o => o.terrainProfile?.rockMass).every(o => o.terrainProfile.surfaceGrid));
    }
    if (rule === 31) {
      assert.equal(workspace.project.objects.filter(o => o.terrainProfile?.rockStrata).length, 2);
      assert.ok(workspace.project.objects.filter(o => o.terrainProfile?.rockStrata).every(o => o.terrainProfile.surfaceGrid.columns === 25));
    }
    if (rule === 32 || rule === 33 || rule === 34) {
      const mountains = workspace.project.metadata.design_rationale.spatial_design.rock_mountains;
      assert.equal(mountains.version, rule >= 34 ? 4 : rule === 33 ? 3 : 2); assert.equal(mountains.mountains, 2);
      assert.ok(mountains.checks.every(c => c.foot.samples >= 16 && c.foot.afterMaxDeficit < (rule >= 33 ? 0.35 : 0.05)));
    }
    if (rule === 34) {
      assert.equal(workspace.project.metadata.design_rationale.spatial_design.landscape_finish.details, 75);
      assert.equal(workspace.project.objects.find(o => o.id === 'sp_ground').role, 'landform');
    }
    if (rule === 36) {
      assert.equal(workspace.project.metadata.design_rationale.spatial_design.landscape_finish.details, 77);
      assert.ok(workspace.project.objects.some(o => o.id.startsWith('sp_street_tree_')));
    }
    const districts = workspace.project.metadata.design_rationale.spatial_design.terrain_wayfinding.districts;
    assert.equal(districts.length, 3); assert.ok(districts.every(d => d.paintedObjects > 0));
    if (seed !== 43) assert.notEqual(workspace.project.objects.find(o => o.id === 'sp_area_west_lane').color, workspace.project.objects.find(o => o.id === 'sp_area_east_lane').color);
    if (seed === 20) assert.deepEqual(workspace.project.metadata.design_rationale.spatial_design.plan.connections.filter(c => c.from === 'court' && ['west_lane','east_lane'].includes(c.to)).map(c=>c.to), ['west_lane']);
    assert.equal(workspace.project.metadata.design_rationale.spatial_design.building_front_gardens.groups.length, 20);
    objects = workspace.project.objects.length;
    assert.equal(objects, expected.objects);
    const screens = workspace.project.metadata.design_rationale.spatial_design.long_sight_screens;
    assert.equal(screens.groups.length, 6);
    assert.equal(screens.beforeLongRays, expected.before); assert.equal(screens.afterLongRays, expected.after);
    if (seed !== 43) {assert.equal(screens.version,2);assert.ok(screens.afterLongRays<screens.legacyAfterLongRays);}
    if (seed === 43) assert.equal(workspace.project.metadata.design_rationale.spatial_design.plaza_furniture.groups.filter(g => g.rest).length, 2);
    if (seed === 8) assert.equal(workspace.project.metadata.design_rationale.spatial_design.terrain_gardens.models, 18);
    if (seed !== 43) assert.ok(workspace.project.metadata.design_rationale.spatial_design.plan.connections.some(c=>c.traversal==='ramp'));
    const sightlines = workspace.project.metadata.design_rationale.spatial_design.validation.sightlines;
    assert.equal(sightlines.length, expected.eyes.length); assert.ok(sightlines.every(s => s.passed));
    assert.deepEqual(sightlines.map(s => s.visibleSamples), expected.eyes);
    const checkWorker = (await readdir(path.join(bundleRoot, 'assets'))).find(name => /^spatialCheck\.worker-.*\.js$/.test(name));
    assert.ok(checkWorker, 'packaged geometry worker');
    const checked = await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      const worker=new Worker(${JSON.stringify('/assets/' + checkWorker)},{type:'module'}), start=performance.now();let heartbeats=0;
      const beat=setInterval(()=>heartbeats++,25);
      const stop=()=>{clearInterval(beat);clearTimeout(timer);worker.terminate()};
      const timer=setTimeout(()=>{stop();reject(new Error('geometry worker timeout'))},180000);
      worker.onerror=e=>{stop();reject(new Error(e.message))};
      worker.onmessage=({data})=>{stop();if(data.type==='complete')resolve({report:data.result,heartbeats,elapsedMs:performance.now()-start});else reject(new Error(data.message))};
      worker.postMessage({objects:${JSON.stringify(workspace.project.objects)},design:${JSON.stringify(workspace.project.metadata.design_rationale.spatial_design)},task:'recheck'});
    })`);
    assert.ok(checked.report.passed); assert.equal(checked.report.routes, 3);
    const routeHeights = checked.report.routeViews.map(({ id, distance, ascent, descent, highest })=>({ id, distance, ascent, descent, highest }));
    assert.equal(routeHeights.length,3);
    for(const route of routeHeights) {
      assert.ok(Number.isFinite(route.ascent)&&route.ascent>=0);assert.ok(Number.isFinite(route.descent)&&route.descent>=0);
      assert.ok(Number.isFinite(route.highest));
      assert.equal(route.ascent-route.descent,seed===43?6:4);
    }
    assert.equal(checked.report.buildingApproaches.filter(b=>b.passed).length, expected.entrances);
    assert.equal(checked.report.terrainJoins.walking.passedDirections, expected.portals);
    assert.ok(checked.heartbeats > 0, 'renderer event loop continues during geometry checks');
    geometryWorker = { passed: true, routes: 3, entrances: expected.entrances, portalDirections: expected.portals, routeHeights, heartbeats: checked.heartbeats, elapsedMs: checked.elapsedMs };
    await writeFile(path.join(out, 'desktop-smoke-project.json'), JSON.stringify(workspace.project, null, 2));
    const draft = { id: `desktop-smoke-${seed}`, savedAt: new Date().toISOString(), project: workspace.project, editor: workspace.editor };
    let payload;
    saveDraft({ getItem: () => null, setItem: (_key, value) => { payload = value; } }, draft);
    assert.equal(JSON.parse(payload).encoding, 'gzip-base64');
    await win.webContents.executeJavaScript(`localStorage.setItem('world-studio-drafts-v1',${JSON.stringify(payload)})`);
    session.defaultSession.flushStorageData();
    const downloaded = await new Promise((resolve, reject) => {
      session.defaultSession.once('will-download', (_event, item) => item.once('done', (_event, state) => state === 'completed' ? resolve(item.getSavePath()) : reject(new Error(state))));
      win.webContents.downloadURL('data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({ desktopDownload: true, objects })));
    });
    assert.deepEqual(JSON.parse(await readFile(downloaded, 'utf8')), { desktopDownload: true, objects });
  } else {
    const raw = await win.webContents.executeJavaScript("localStorage.getItem('world-studio-drafts-v1')");
    const saved = readDrafts({getItem:()=>raw});assert.equal(saved.error,'');
    assert.equal(saved.drafts[0].id, `desktop-smoke-${seed}`);
    objects = saved.drafts[0].project.objects.length;
    assert.equal(objects, expected.objects);
    assert.match(await win.webContents.executeJavaScript('document.body.innerText'), new RegExp(String(expected.objects)));
  }
  await writeFile(path.join(out, `desktop-smoke-${phase}-report.json`), JSON.stringify({ passed: true, phase, bundleRoot, isolation, model, objects, worker: phase === 'generate', geometryWorker, persistenceAcrossProcesses: phase === 'restore', blockedExternalRequests, electron: process.versions.electron }, null, 2));
  app.quit();
} catch (error) {
  await writeFile(path.join(out, `desktop-smoke-${phase}-error.txt`), error.stack || String(error));
  app.exit(1);
}
}
void run();






