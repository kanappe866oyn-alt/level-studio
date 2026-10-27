import { packager } from '@electron/packager';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd(), version = '0.1.37';
const bundleIndex = process.argv.indexOf('--bundle');
if (bundleIndex >= 0 && !process.argv[bundleIndex + 1]) throw new Error('--bundle requires a built application directory');
const bundleRoot = bundleIndex < 0 ? path.join(root, 'dist') : path.resolve(process.argv[bundleIndex + 1]);
const outputRoot = path.join(root, 'output');
await mkdir(outputRoot, { recursive: true });
const staging = await mkdtemp(path.join(outputRoot, 'desktop-package-'));
await cp(bundleRoot, path.join(staging, 'dist'), { recursive: true });
await mkdir(path.join(staging, 'desktop'));
for (const name of ['main.mjs', 'application.mjs', 'bundlePaths.mjs']) await cp(path.join(root, 'desktop', name), path.join(staging, 'desktop', name));
await writeFile(path.join(staging, 'package.json'), JSON.stringify({ name: 'level-studio', productName: 'LEVEL STUDIO', version, type: 'module', main: 'desktop/main.mjs' }, null, 2));
await writeFile(path.join(staging, 'README.txt'), 'LEVEL STUDIO Windows試作版\r\nLevelStudio.exeを起動してください。フォルダ全体が必要です。\r\n作品はJSON保存で残せます。ブラウザ版の作品はJSONで読み込んでください。\r\n構造ルール生成にAPIキーは不要です。AI機能には別途接続設定が必要です。\r\n');
const sourcePackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const paths = await packager({ dir: staging, out: path.join(root, 'releases', version), name: 'LevelStudio', executableName: 'LevelStudio', platform: 'win32', arch: 'x64',
  electronVersion: sourcePackage.devDependencies.electron, download: { cacheRoot: path.join(outputRoot, 'electron-cache') }, asar: true, overwrite: false, prune: false, appVersion: version, win32metadata: { CompanyName: 'LEVEL STUDIO', ProductName: 'LEVEL STUDIO', FileDescription: 'LEVEL STUDIO 3D Level Editor' } });
for (const appPath of paths) await cp(path.join(staging, 'README.txt'), path.join(appPath, 'README.txt'));
await writeFile(path.join(outputRoot, 'desktop-package-report.json'), JSON.stringify({ version, platform: 'win32', arch: 'x64', electron: sourcePackage.devDependencies.electron, paths, included: ['dist/', 'desktop/main.mjs', 'desktop/application.mjs', 'desktop/bundlePaths.mjs', 'package.json', 'README.txt'], excluded: ['.env', 'source files', 'output/', 'node_modules/'] }, null, 2));
console.log(JSON.stringify({ version, paths }));

