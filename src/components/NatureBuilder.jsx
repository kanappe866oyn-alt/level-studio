import { useEffect, useMemo, useRef, useState } from 'react';
import { validateNaturePlan, effectiveNatureBend } from '../core/natureGenerator';
import { natureTerraceLayout } from '../core/natureLayout';
import { natureTint } from '../core/natureDressing';
import { NATURE_PALETTES } from '../core/naturePalettes';
import { NATURE_BACKDROP_DEPTH } from '../core/natureBackdrop';

const layouts = { balanced: '均等に広げる', 'lower-wide': '低地を広く', 'middle-wide': '中段を広く', 'upper-wide': '高台を広く' };
const shapePresets = [
  { label: '平坦・直線', relief: 0, edgeRoughness: 0, riverBend: 0 },
  { label: '自然な起伏', relief: 0.6, edgeRoughness: 0.08, riverBend: 3 },
  { label: '起伏を強める', relief: 1.2, edgeRoughness: 0.12, riverBend: 3 },
];

function LayoutPreview({ plan }) {
  const run = Math.round(plan.rise / 0.4) * 0.5;
  const patches = natureTerraceLayout(plan.depth, run, plan.terraceLayout);
  const scale = 140 / plan.depth;
  const screenY = z => 22 + (z + plan.depth / 2) * scale;
  const bankWidth = 70, riverWidth = plan.channelWidth * 3;
  const left = 80 - riverWidth / 2 - bankWidth, right = 80 + riverWidth / 2;
  return <div className="nature-layout-preview">
    <svg viewBox="-40 0 280 188" role="img" aria-label={`${layouts[plan.terraceLayout]}の構成図。両岸の3段を階段と橋で接続`}>
      {plan.backdropEnabled && <g fill={plan.rockColor}><rect x={left} y="2" width={bankWidth * 2 + riverWidth} height="16" rx="3" /><path d={`M ${left + 8} 16 l 18 -14 l 18 14 M 62 16 l 18 -16 l 18 16 M ${right + 22} 16 l 18 -14 l 18 14`} fill={natureTint(plan.rockColor, 0.2)} /></g>}
      <rect x={80 - riverWidth / 2} y="22" width={riverWidth} height="140" rx="3" fill={plan.waterEnabled ? plan.waterColor : natureTint(plan.rockColor, -0.2)} />
      {patches.map((patch, level) => <g key={level}>
        {[left, right].map((x, side) => <rect key={side} x={x} y={screenY(patch.z - patch.depth / 2)} width={bankWidth} height={patch.depth * scale} rx="5" fill={natureTint(plan.groundColor, [-0.04, 0, 0.06][level])} />)}
        <text x="-32" y={screenY(patch.z) + 4} fill="#cbd8d0" fontSize="9">{['低地', '中段', '高台'][level]}</text>
        <text x={right + bankWidth + 8} y={screenY(patch.z) + 4} fill="#cbd8d0" fontSize="9">{patch.depth.toFixed(1)}m</text>
        {[left + bankWidth / 2, right + bankWidth / 2].map((x, side) => <path key={side} d={`M ${x} ${screenY(patch.z - patch.depth / 2)} V ${screenY(patch.z + patch.depth / 2)}`} stroke="#cbb574" strokeWidth="2" />)}
        {level < 2 && [left + bankWidth / 2, right + bankWidth / 2].map((x, side) => <rect key={side} x={x - 4} y={screenY(patch.z - patch.depth / 2 - run)} width="8" height={run * scale} fill="#cbb574" />)}
        {level !== 1 && <rect x={80 - riverWidth / 2 - 4} y={screenY(patch.z) - 3} width={riverWidth + 8} height="6" fill="#b99b73" />}
      </g>)}
      <circle cx={left + bankWidth / 2} cy={screenY(patches[0].z + patches[0].depth / 4)} r="4" fill="#64c9b6" />
      <circle cx={right + bankWidth / 2} cy={screenY(patches[2].z - patches[2].depth / 4)} r="4" fill="#f1d078" />
      <text x="80" y="181" textAnchor="middle" fill="#aabbb1" fontSize="9">構成のプレビュー（上から見た概略図）</text>
    </svg>
    <p>主要地形は幅{plan.width}m × 奥行{plan.depth}m。入口から高さ{(0.4 + plan.rise * 2).toFixed(1)}mの高台へ。階段4か所と橋2本で回遊します。</p>
    {plan.backdropEnabled && <p>奥の岩壁と土台を含めた全体の奥行は{plan.depth + NATURE_BACKDROP_DEPTH}mです。岩壁も編集・保存・GLB出力に含まれます。岩壁へ登る道は設けません。</p>}
    {patches.every(p => Math.abs(p.depth - 12) < 1e-6) && <p>この広さと高さでは、通路を確保するため各段を均等にします。</p>}
  </div>;
}

export default function NatureBuilder({ initialPlan, initialMode, hasSavedPlan, onBuild, onClose }) {
  const dialog = useRef(null);
  const [plan, setPlan] = useState(initialPlan);
  const [mode, setMode] = useState(initialMode === 'platforming' ? 'platforming' : 'free');
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');
  const preview = useMemo(() => {
    try { return validateNaturePlan({ ...plan, terrainSeed: Number(plan.terrainSeed) }); } catch { return null; }
  }, [plan]);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  const change = (key, value) => { setError(''); setPlan(previous => ({ ...previous, [key]: value })); };
  const submit = async event => {
    event.preventDefault();
    setBuilding(true); setError('');
    await new Promise(resolve => requestAnimationFrame(resolve));
    try {
      if (String(plan.terrainSeed).trim() === '') throw new Error('地形の番号を入力してください。');
      const next = validateNaturePlan({ ...plan, terrainSeed: Number(plan.terrainSeed) });
      if (await onBuild(next, mode) === false) { setBuilding(false); setError('現在の作業を保存してから、もう一度お試しください。'); }
    } catch (cause) { setBuilding(false); setError(cause.message); }
  };
  const select = (key, label, values, unit = '', format = value => `${value}${unit}`) => {
    const choices = [...new Set([...values, plan[key]])].sort((a, b) => a - b);
    return <label>{label}<select aria-label={label} value={plan[key]} onChange={event => change(key, Number(event.target.value))}>{choices.map(value => <option key={value} value={value}>{format(value)}</option>)}</select></label>;
  };
  return <dialog ref={dialog} className="quick-guide nature-builder" aria-labelledby="nature-builder-title" onCancel={event => { if (building) event.preventDefault(); else onClose(); }}>
    <header><h2 id="nature-builder-title">自然ステージを組み立てる</h2><button className="tbtn" onClick={onClose} disabled={building} autoFocus>閉じる</button></header>
    <p>APIキーなしで地形の構成を試せます。設定を変えて、広さと高低差を見比べてください。</p>
    {hasSavedPlan && <p className="nature-recipe-note">このステージを組み立てた設定を読み込んでいます。設定はJSON保存と自動保存に含まれます。手動編集や差分修正後の配置は、組み立て直す別案には引き継がれません。</p>}
    <form onSubmit={submit}>
      <fieldset disabled={building}>
        <div className="nature-builder-fields">
          <label>地形の構成<select aria-label="地形の構成" value={plan.terraceLayout} onChange={event => change('terraceLayout', event.target.value)}>{Object.entries(layouts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>用途<select aria-label="用途" value={mode} onChange={event => setMode(event.target.value)}><option value="free">景観・自由制作</option><option value="platforming">立体アスレチック</option></select></label>
          {select('width', 'ステージの幅', [48, 60, 72, 80], 'm')}
          {select('depth', 'ステージの奥行', [48, 64, 72, 80], 'm')}
          {select('rise', '一段の高さ', [1, 2, 3], 'm')}
          {select('channelWidth', '川・渓谷の幅', [4, 6, 8, 10], 'm')}
          <label>岩と植生の量<select aria-label="岩と植生の量" value={plan.density} onChange={event => change('density', event.target.value)}><option value="sparse">少なめ</option><option value="balanced">標準</option><option value="dense">多め</option></select></label>
          <label>地形の番号<input aria-label="地形の番号" aria-describedby="nature-seed-help" type="number" min="0" max="65535" step="1" required value={plan.terrainSeed} onChange={event => change('terrainSeed', event.target.value)} /><small id="nature-seed-help">同じ番号と設定で、同じ形を再現します。</small></label>
        </div>
        <label className="nature-water-toggle"><input type="checkbox" checked={plan.waterEnabled} onChange={event => change('waterEnabled', event.target.checked)} />川に水を入れる</label>
        <label className="nature-water-toggle"><input type="checkbox" aria-label="奥に岩壁を配置" checked={plan.backdropEnabled ?? false} onChange={event => change('backdropEnabled', event.target.checked)} />奥に岩壁を配置</label>
        <details className="nature-shape-controls">
          <summary>地形の形を調整</summary>
          <div className="nature-shape-presets" role="group" aria-label="地形の形のプリセット">
            {shapePresets.map(({ label, ...shape }) => <button type="button" className="tbtn" key={label} aria-pressed={Object.entries(shape).every(([key, value]) => plan[key] === value)} onClick={() => { setError(''); setPlan(previous => ({ ...previous, ...shape })); }}>{label}</button>)}
          </div>
          <div className="nature-builder-fields">
            {select('relief', '草地の起伏', [0, 0.3, 0.6, 0.9, 1.2], 'm')}
            {select('riverBend', '川・渓谷の曲がり幅', [0, 1, 2, 3], 'm')}
            {select('edgeRoughness', '崖の輪郭の変化', [0, 0.04, 0.08, 0.12], '', value => value === 0 ? 'なし' : `${Math.round(value * 1000) / 10}%`)}
          </div>
          <p>起伏は指定値以内に収め、階段・橋・道の接続部は平坦に保ちます。輪郭の変化に合わせて、崖の下側にも最大0.45mの浅い岩の層を作ります。「なし」では崖の外縁と側面をまっすぐにします。</p>
          {preview && <p role="status">{preview.riverBend === 0 ? '川・渓谷は直線になります。' : `実際の曲がり幅は最大${effectiveNatureBend(preview).toFixed(2)}mです。岸の広さに合わせて調整します。`}</p>}
        </details>
        <details className="nature-shape-controls">
          <summary>ステージの配色を調整</summary>
          <div className="nature-shape-presets" role="group" aria-label="配色のプリセット">
            {NATURE_PALETTES.map(({ label, colors }) => <button type="button" className="tbtn" key={label} aria-pressed={Object.entries(colors).every(([key, value]) => plan[key].toLowerCase() === value)} onClick={() => { setError(''); setPlan(previous => ({ ...previous, ...colors })); }}>{label}</button>)}
          </div>
          <div className="nature-builder-fields">
            {Object.entries({ groundColor: '草地の色', rockColor: '岩肌の色', waterColor: '水の色', foliageColor: '植生の色' }).map(([key, label]) => <label key={key}>{label}<span className="nature-color-field"><input type="color" aria-label={label} value={plan[key]} onInput={event => change(key, event.target.value)} onChange={event => change(key, event.target.value)} /><span>{plan[key].toUpperCase()}</span></span></label>)}
          </div>
          <p>配色を変えても地形や歩行経路は同じです。構成図には草地と川・渓谷の色を反映します。岩肌と植生を含む仕上がりは、新しいステージで確認できます。水を入れない場合は水の色を使いません。</p>
        </details>
      </fieldset>
      {preview && <LayoutPreview plan={preview} />}
      {mode === 'platforming' && <p>アスレチックでは、広場・塔・植生を省いて歩行経路を確認しやすくします。</p>}
      <p>現在の作業を自動保存して残し、新しいステージを開きます。自動保存は直近5件です。</p>
      {error && <p className="nature-builder-error" role="alert">{error}</p>}
      <button className="tbtn on nature-build-submit" type="submit" disabled={building}>{building ? '組み立てて経路を確認中…' : 'この設定で新しいステージを開く'}</button>
    </form>
  </dialog>;
}
