import { app, session } from 'electron';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startDesktop } from './application.mjs';

const root = process.cwd(), out = path.join(root, 'output');
const bundleRoot = path.resolve(process.argv[process.argv.indexOf('--bundle') + 1]);
const watchdog = setTimeout(() => { void writeFile(path.join(out, 'desktop-v34-contract-error.txt'), 'Overall smoke timeout').finally(() => app.exit(1)); }, 180000);
const progress = phase => writeFile(path.join(out, 'desktop-v34-contract-progress.json'), JSON.stringify({ phase }));
async function runSmoke() {
try {
  const win = await startDesktop({ bundleRoot, userData: path.join(out, 'desktop-contract-v34-profile'), show: false, downloadDirectory: out });
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
  const project = JSON.parse(await readFile(path.join(out, 'layout-contract-stage.json'), 'utf8'));
  const run = code => win.webContents.executeJavaScript(code);
  win.webContents.setBackgroundThrottling(false);
  await progress('loaded');
  await run(`void(window.alert=(message)=>{throw Error(message)})`);
  await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('エディタを開く'))?.click()`);
  await run(`new Promise((resolve,reject)=>{const start=Date.now();const t=setInterval(()=>{if(document.querySelector('input[accept=".json"]')){clearInterval(t);resolve(true)}else if(Date.now()-start>30000){clearInterval(t);reject(Error('editor timeout'))}},100)})`);
  await run(`(()=>{const input=document.querySelector('input[accept=".json"]'),data=new DataTransfer();data.items.add(new File([${JSON.stringify(JSON.stringify(project))}],'layout-contract.json',{type:'application/json'}));input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await run(`new Promise((resolve,reject)=>{const start=Date.now();const t=setInterval(()=>{if(Array.from(document.querySelectorAll('input')).some(input=>input.value===${JSON.stringify(project.metadata.theme)})){clearInterval(t);resolve(true)}else if(Date.now()-start>30000){clearInterval(t);reject(Error('import timeout'))}},100)})`);
  await progress('imported');
  const downloaded = new Promise((resolve, reject) => {
    session.defaultSession.once('will-download', (_e, item) => item.once('done', (_event, state) => state === 'completed' ? resolve(item.getSavePath()) : reject(Error(state))));
  });
  await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='保存').click()`);
  const saved = JSON.parse(await readFile(await downloaded, 'utf8'));
  await progress('saved');
  assert.equal(saved.objects.length, project.objects.length);
  assert.deepEqual(saved.metadata.design_rationale.spatial_design.request_contract, project.metadata.design_rationale.spatial_design.request_contract);
  const worker = (await readdir(path.join(bundleRoot, 'assets'))).find(n => /^spatialCheck\.worker-.*\.js$/.test(n));
  const checked = await run(`new Promise((resolve,reject)=>{const w=new Worker(${JSON.stringify('/assets/' + worker)},{type:'module'});const t=setTimeout(()=>{w.terminate();reject(Error('check timeout'))},120000);w.onmessage=({data})=>{clearTimeout(t);w.terminate();data.type==='complete'?resolve(data.result):reject(Error(data.message))};w.onerror=e=>{clearTimeout(t);w.terminate();reject(Error(e.message))};w.postMessage({task:'recheck',objects:${JSON.stringify(saved.objects)},design:${JSON.stringify(saved.metadata.design_rationale.spatial_design)}})})`);
  assert.ok(checked.passed); assert.equal(checked.checks.length, 3); assert.ok(checked.checks.every(c => c.passed));
  await writeFile(path.join(out, 'desktop-v34-contract-report.json'), JSON.stringify({ passed: true, bundleRoot, importedAndSavedObjects: saved.objects.length, humanConditions: checked.checks.length, actualPackagedWorker: true, cloudApiCalled: false }, null, 2));
  clearTimeout(watchdog);
  app.quit();
} catch (error) {
  clearTimeout(watchdog);
  await writeFile(path.join(out, 'desktop-v34-contract-error.txt'), error.stack || String(error));
  app.exit(1);
}
}
void runSmoke();
