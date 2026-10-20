import { MODE_CONFIG, SEMANTIC_PREFABS, validateByMode, validateObjects } from './rules';
import { analyzeWalkability } from './walkability.js';
import { validateTerrainProfile } from './terrainSurface.js';
import { validateRiverProfile } from './riverSurface.js';

export function inspectDraft(objects, mode, { includeCollisions = true, includeNavigation = true } = {}) {
  if (!Array.isArray(objects) || !objects.length) return ['objects が空です。'];
  const issues = [];
  const ids = new Set();
  for (const o of objects) {
    if (!o || typeof o !== 'object') { issues.push('オブジェクトの形式が不正です。'); continue; }
    if (!o.id || ids.has(o.id)) issues.push(`IDが欠落または重複: ${o.id}`);
    ids.add(o.id);
    if (!SEMANTIC_PREFABS[o.role] || !MODE_CONFIG[mode]?.roles.includes(o.role)) issues.push(`使用できないrole: ${o.role}`);
    for (const key of ['pos', 'size', 'rot']) {
      if (!Array.isArray(o[key]) || o[key].length !== 3 || !o[key].every(Number.isFinite)) issues.push(`${o.id}: ${key}は有限数3個が必要です。`);
    }
    if (o.size?.some(n => n <= 0)) issues.push(`${o.id}: sizeは正の値にしてください。`);
    if (Array.isArray(o.pos) && (Math.abs(o.pos[0]) > 100 || Math.abs(o.pos[2]) > 100 || o.pos[1] < -10 || o.pos[1] > 50)) issues.push(`${o.id}: 座標がエディタの対応範囲を超えています。`);
    for (const key of ['color', 'color2', 'color3']) if (o[key] !== undefined && o[key] !== null && !/^#[\da-f]{6}$/i.test(o[key])) issues.push(`${o.id}: ${key}は6桁のHEXカラーにしてください。`);
    if (o.terrainProfile !== undefined) {
      try { if (o.role !== 'landform') throw new Error('地形設定はlandform専用です。'); validateTerrainProfile(o.terrainProfile); }
      catch (error) { issues.push(`${o.id}: ${error.message}`); }
    }
    if (o.riverProfile !== undefined) {
      try { if (o.role !== 'water') throw new Error('流路設定はwater専用です。'); validateRiverProfile(o.riverProfile); }
      catch (error) { issues.push(`${o.id}: ${error.message}`); }
    }
  }
  const safeObjects = objects.filter(o => o && typeof o === 'object');
  if (safeObjects.filter(o => o.role === 'ground').length !== 1) issues.push('groundはちょうど1個にしてください。');
  if (issues.length) return [...new Set(issues)];
  const normalized = validateObjects(safeObjects);
  const navigation = includeNavigation && !issues.length && mode !== 'free' ? analyzeWalkability(normalized) : null;
  const navigationIssues = [...(navigation?.issues || [])];
  if (navigation && mode === 'platforming' && navigation.levels < 2) navigationIssues.push('立体アスレチックには高さの異なる床が2層以上必要です。階段で接続した高所の足場を設けてください。');
  return [...new Set([...issues, ...validateByMode(normalized, mode, { includeCollisions }), ...navigationIssues])];
}

export function draftWarnings(objects) {
  const safe = validateObjects(objects);
  // Broad-phase bounding boxes cannot distinguish intentional model intersections.
  const issues = validateByMode(safe, 'free').filter(s => s.includes('重なり'));
  return issues.length ? ['簡易判定で重なりが見つかりました。意図した接続や装飾の重なりも含むため、3D画面で確認してください。'] : [];
}

export const QUALITY_BRIEF = `
【制作品質】
- ユーザーが指定した個数、形状、主役、動線を最優先で守る。
- 人の身長を約1.8mとして縮尺を統一。posは中心座標、sizeは幅・高さ・奥行、rotはラジアン。
- 接地する物の中心Yは地面上面+高さ/2。浮遊は指示された場合に限る。
- 主役、補助要素、装飾の階層を作り、空間を均一なランダム配置で埋めない。
- 通路には幅2m以上の余裕を確保し、入口から主要地点へ到達可能にする。
- 立体構造は、まず各階の高さ・床・用途を決め、次に上下の接続を作り、最後に装飾を配置する。高所に移動する理由をdesign_rationaleに記載する。
- 高低差を求められた場合やアスレチックでは、高さの異なる床を2層以上設け、入口から高所とゴールまで歩いて往復できる経路を作る。平面だけの指定は尊重する。
- テストプレイは歩行専用。ジャンプ、はしご昇降、動く足場に頼る必須経路を作らない。climbはvariant=1の直線階段を使う。
- 直線階段はローカル-Z側が下端、+Z側が上端。size[1]は総上昇量、pos[1]=下端の床高さ+size[1]/2。上端は接続先の床上面と同じ高さにする。
- 階段は幅2m以上、各段の奥行0.4m以上。段数=round(総上昇量/0.4)、総奥行は段数×0.4m以上。上下端に十分な踊り場を設ける。
- 通行箇所の頭上には1.8m以上（推奨2.2m）の空間を確保する。上階の床が階段の途中や下階の通路に食い込まないようにする。
- 高所のgoal/checkpoint/cover等は、その床上面+物体の高さ/2に配置する。地面の高さを0と決めつけない。
- 対戦では複数のルートと遮蔽物、アスレチックでは到達可能な足場の連続を設計する。
- 自由制作では景観と構図を優先し、不要な戦闘設備を追加しない。
- variant/materialは各roleの有効範囲内で選び、テーマと整合するものを使用する。
- 出力前に要求の充足、接地、縮尺、重複ID、動線を点検する。
`;
