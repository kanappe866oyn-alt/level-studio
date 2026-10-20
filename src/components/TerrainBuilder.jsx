import { useEffect, useRef, useState } from 'react';
import { TERRAIN_FAMILIES, TERRAIN_VERSION, terrainFamily, seedForTerrainFamily, validateTerrainRecipe } from '../core/terrainRecipe.js';
import { randomTerrainSeed } from '../core/sampleProjectAsync.js';

export default function TerrainBuilder({ variation, onBuild, onClose }) {
  const dialog = useRef(null);
  const [recipe, setRecipe] = useState(() => {
    try { return validateTerrainRecipe(variation); } catch { return { seed: randomTerrainSeed(), version: TERRAIN_VERSION }; }
  });
  const [error, setError] = useState('');
  const family = terrainFamily(Number(recipe.seed), recipe.version);
  const selected = TERRAIN_FAMILIES.find(item => item.id === family);
  useEffect(() => {
    const element = dialog.current; element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="quick-guide nature-builder" aria-labelledby="terrain-builder-title" onCancel={onClose}>
    <header><h2 id="terrain-builder-title">立体ステージを作る</h2><button type="button" className="tbtn" onClick={onClose} autoFocus>閉じる</button></header>
    <p>自由制作モードで、地形・階段・坂・経路と既存の建物モデルを組み立てます。APIキーは不要です。</p>
    <p>探索・歩行確認用の集落として開きます。対戦の攻守・目標・勝敗ルールは含まれていません。</p>
    <form onSubmit={event => {
      event.preventDefault();
      try {
        if (String(recipe.seed).trim() === '') throw new Error('生成番号を入力してください。');
        onBuild(validateTerrainRecipe({ ...recipe, seed: Number(recipe.seed) }));
      } catch (cause) { setError(cause.message); }
    }}>
      <div className="nature-builder-fields">
        <label>ステージの構成<select aria-label="ステージの構成" value={family || ''} onChange={event => {
          setError('');
          setRecipe({ seed: seedForTerrainFamily(Number(recipe.seed) >>> 0, event.target.value), version: TERRAIN_VERSION });
        }}><option value="" disabled>生成番号を入力してください</option>{TERRAIN_FAMILIES.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>生成番号<input aria-label="生成番号" type="number" min="0" max="4294967295" step="1" required value={recipe.seed} onChange={event => {
          setError(''); setRecipe({ seed: event.target.value, version: TERRAIN_VERSION });
        }} /><small>同じ番号・ルールで同じ構造を再現します（ルール{recipe.version}）。</small></label>
      </div>
      {selected && <p role="status">{selected.description}</p>}
      <button type="button" className="tbtn" onClick={() => {
        setError(''); setRecipe({ seed: seedForTerrainFamily(randomTerrainSeed(), family || 'market'), version: TERRAIN_VERSION });
      }}>同じ構成で別の番号にする</button>
      {variation && <p>保存されている生成番号を読み込んでいます。組み立て直すと手動編集は引き継がれません。編集した作品は「開く」または自動保存から復元してください。</p>}
      <p>現在の作業を自動保存して残し、新しいステージを開きます。生成中は中止できます。失敗・中止した場合、現在のステージを維持します。自動保存は直近5件です。</p>
      {error && <p className="nature-builder-error" role="alert">{error}</p>}
      <button type="submit" className="tbtn on nature-build-submit">この構成で新しいステージを開く</button>
    </form>
  </dialog>;
}
