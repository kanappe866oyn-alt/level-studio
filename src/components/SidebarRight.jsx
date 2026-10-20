// src/components/SidebarRight.jsx
import React from 'react';
import { SEMANTIC_PREFABS, clamp } from '../core/rules';
import { supportsBuildingColors } from '../core/buildingAppearance.js';

export default function SidebarRight({
  isOpen, setIsOpen,
  selectedObj,
  handleStringChangeDirect,
  handleCustomModelUpload,
  handleCommit,
  handleNumericChangeDirect,
  handleDuplicate,
  handleRemove,
  handleClear
}) {
  return (
    <div className={`sidebar-wrapper right-wrapper ${isOpen ? 'is-open' : ''}`}>
      {/* 開閉トグルボタン */}
      <button type="button" className="sidebar-toggle right" aria-controls="inspector-panel" aria-expanded={isOpen} aria-label={isOpen ? '右サイドバーを閉じる' : '右サイドバーを開く'} title={isOpen ? '右サイドバーを閉じる' : '右サイドバーを開く'} onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? '▶' : '◀'}
      </button>

      <div id="inspector-panel" className={`sidebar right ${isOpen ? '' : 'closed'}`} inert={!isOpen}>
        <div className="sidebar-inner">
          <div className="panel-title">⚙️ Inspector</div>
          {selectedObj ? (
            <div className="insp">
              <div>
                <strong className="lbl">Object ID</strong>
                <input type="text" className="inp" value={selectedObj.id} readOnly />
              </div>
              <div>
                <strong className="lbl">Name</strong>
                <input type="text" className="inp" value={selectedObj.name} onChange={(e) => handleStringChangeDirect('name', e.target.value)} onBlur={handleCommit} onKeyDown={(e) => e.key === 'Enter' && handleCommit()} />
              </div>

              {/* 🎨 カラーパレット */}
              {(() => {
                const buildingColors = supportsBuildingColors(selectedObj);
                const colorCount = buildingColors ? 3 : selectedObj.role === 'landform' ? 2 : (selectedObj.detectedColorCount !== undefined ? selectedObj.detectedColorCount : 1);
                if (colorCount >= 4 || colorCount === 0) return null;

                return (
                  <div className="cblock">
                    <strong className="lbl">🎨 Colors (自動スキャン)</strong>
                    <div className="mini-note" style={{ color: selectedObj.color ? 'var(--accent)' : 'var(--text-dim)', fontWeight: 'bold', marginBottom: '8px' }}>
                      {selectedObj.color ? "🎨 カスタム色指定中" : "📦 Blenderオリジナル色表示中"}
                    </div>
                    {colorCount >= 1 && (
                      <div className="crow">
                        <span className="clabel">{buildingColors ? '外壁' : '1: Main'}</span>
                        <input
                          type="color"
                          value={selectedObj.color || (['ground', 'wall'].includes(selectedObj.role) ? "#ffffff" : SEMANTIC_PREFABS[selectedObj.role]?.color) || "#ffffff"}
                          onChange={(e) => handleStringChangeDirect('color', e.target.value)}
                        />
                        {selectedObj.color && <button className="btn b-red" onClick={() => handleStringChangeDirect('color', null)}>戻す</button>}
                      </div>
                    )}
                    {colorCount >= 2 && (!buildingColors || selectedObj.variant === 2) && (
                      <div className="crow">
                        <span className="clabel">{buildingColors ? '屋根' : '2: Sub 1'}</span>
                        <input type="color" value={selectedObj.color2 || "#ffffff"} onChange={(e) => handleStringChangeDirect('color2', e.target.value)} />
                        {selectedObj.color2 && <button className="btn b-red" onClick={() => handleStringChangeDirect('color2', null)}>戻す</button>}
                      </div>
                    )}
                    {colorCount >= 3 && (
                      <div className="crow">
                        <span className="clabel">{buildingColors ? '基壇・縁取り' : '3: Sub 2'}</span>
                        <input type="color" value={selectedObj.color3 || "#ffffff"} onChange={(e) => handleStringChangeDirect('color3', e.target.value)} />
                        {selectedObj.color3 && <button className="btn b-red" onClick={() => handleStringChangeDirect('color3', null)}>戻す</button>}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div>
                <strong className="lbl accent">Semantic Role</strong>
                <select className="sel" value={selectedObj.role} onChange={(e) => handleStringChangeDirect('role', e.target.value)} style={{ borderColor: 'var(--accent)', fontWeight: 'bold' }}>
                  {Object.keys(SEMANTIC_PREFABS).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {selectedObj.role === 'landform' && !selectedObj.customModelUrl && (
                <div className="cblock">
                  <strong className="lbl">地形の輪郭と起伏</strong>
                  <label className="checkline"><input type="checkbox" checked={!!selectedObj.terrainProfile} onChange={e => handleStringChangeDirect('terrainProfile', e.target.checked ? { seed: 17, relief: 0.6, edgeRoughness: 0.08 } : undefined)} />自然な地形にする</label>
                  {selectedObj.terrainProfile?.surfaceGrid && <p className="mini-note">経路の高さに合わせて作った裾と谷です。移動・拡縮すると通路との関係が変わるため、変更後に歩行を確認してください。</p>}
                  {selectedObj.terrainProfile && !selectedObj.terrainProfile.surfaceGrid && [['seed', '形の番号', 65535, 1], ['relief', '起伏（m）', 1.2, 0.1], ['edgeRoughness', '崖の輪郭変化', 0.12, 0.01], ['outerInset', '外縁の絞り込み', 0.24, 0.01]].map(([key, label, max, step]) => (
                    <label className="lbl" key={key}>{label}<input className="inp" type="number" aria-label={label} min="0" max={max} step={step} value={selectedObj.terrainProfile[key] ?? 0} onChange={e => {
                      const value = Number(e.target.value);
                      if (!Number.isFinite(value)) return;
                      handleStringChangeDirect('terrainProfile', { ...selectedObj.terrainProfile, [key]: key === 'seed' ? Math.round(clamp(value, 0, max)) : clamp(value, 0, max) });
                    }} /></label>
                  ))}
                  <p className="mini-note">階段と橋の接続部は平坦に保ちます。地形上に接地している木・岩も高さに合わせます。</p>
                    <p className="mini-note">外縁の絞り込みで地形の広さを変えられます。輪郭を変更した後は、岩や植生が岸からはみ出していないか確認してください。</p>
                    {selectedObj.terrainProfile?.shoreline && <p className="mini-note">川に沿った岸辺です。起伏や色を変更しても岸の曲線を保持します。地形を個別に移動・拡縮すると川との接続も変わります。</p>}
                </div>
              )}
                {selectedObj.role === 'water' && selectedObj.riverProfile && !selectedObj.customModelUrl && <div className="cblock"><strong className="lbl">曲がる川</strong><p className="mini-note">水面と水に入った判定は同じ流路を使います。川幅や曲がり幅を変えて全体を作り直す場合は、自然地形の生成で指定してください。</p></div>}

              <div>
                <strong className="lbl orange">Model Variant (見た目番号)</strong>
                <input type="number" className="inp" min="1" max={SEMANTIC_PREFABS[selectedObj.role]?.variants || 1} value={selectedObj.variant || 1} onChange={(e) => { let val = parseInt(e.target.value) || 1; val = clamp(val, 1, SEMANTIC_PREFABS[selectedObj.role]?.variants || 1); handleStringChangeDirect('variant', val); }} onBlur={handleCommit} onKeyDown={(e) => e.key === 'Enter' && handleCommit()} style={{ borderColor: 'var(--warn)', fontWeight: 'bold' }} />
                <div className="mini-note">※全 {SEMANTIC_PREFABS[selectedObj.role]?.variants || 1} 種類</div>

                <div style={{ marginTop: '8px' }}>
                  <strong className="lbl green">Material (見た目・テクスチャ番号)</strong>
                  <input type="number" className="inp" min={SEMANTIC_PREFABS[selectedObj.role]?.hasModel ? 0 : 1} max={SEMANTIC_PREFABS[selectedObj.role]?.materials || 1} value={selectedObj.material ?? 1} onChange={(e) => { const parsed = Number.parseInt(e.target.value); const val = clamp(Number.isFinite(parsed) ? parsed : 1, SEMANTIC_PREFABS[selectedObj.role]?.hasModel ? 0 : 1, SEMANTIC_PREFABS[selectedObj.role]?.materials || 1); handleStringChangeDirect('material', val); }} onBlur={handleCommit} onKeyDown={(e) => e.key === 'Enter' && handleCommit()} style={{ borderColor: 'var(--ok)', fontWeight: 'bold' }} />
                  <div className="mini-note">※全 {SEMANTIC_PREFABS[selectedObj.role]?.materials || 1} 種類</div>
                  {SEMANTIC_PREFABS[selectedObj.role]?.hasModel && <div className="mini-note">0はモデル本来の見た目です。</div>}
                </div>

                <div className="cblock" style={{ marginTop: '8px' }}>
                  <strong className="lbl green">🌟 オリジナルモデル (.glb)</strong>
                  <input type="file" accept=".glb" onChange={(e) => { const file = e.target.files[0]; e.target.value = ''; if (file) handleCustomModelUpload(selectedObj.id, file); }} style={{ fontSize: '11px', width: '100%', cursor: 'pointer', color: 'var(--text-dim)' }} />
                  {selectedObj.customModelUrl && (
                    <button className="btn b-red full" onClick={() => handleStringChangeDirect('customModelUrl', null)} style={{ marginTop: '6px' }}>❌ カスタムモデルを解除</button>
                  )}
                </div>
              </div>

              {selectedObj.type !== 'spline' && (
                <>
                  <div>
                    <strong className="lbl">Position</strong>
                    <div className="xyz">
                      <input type="number" className="inp" step="0.5" value={selectedObj.pos[0]} onChange={(e) => handleNumericChangeDirect('pos', 0, e.target.value)} onBlur={handleCommit} onKeyDown={(e) => e.key === 'Enter' && handleCommit()} />
                      <input type="number" className="inp" step="0.5" value={selectedObj.pos[1]} onChange={(e) => handleNumericChangeDirect('pos', 1, e.target.value)} onBlur={handleCommit} onKeyDown={(e) => e.key === 'Enter' && handleCommit()} />
                      <input type="number" className="inp" step="0.5" value={selectedObj.pos[2]} onChange={(e) => handleNumericChangeDirect('pos', 2, e.target.value)} onBlur={handleCommit} onKeyDown={(e) => e.key === 'Enter' && handleCommit()} />
                    </div>
                  </div>
                  <div>
                    <strong className="lbl">Rotation</strong>
                    <div className="xyz">
                      <input type="number" className="inp" step="0.1" value={selectedObj.rot[0]} onChange={(e) => handleNumericChangeDirect('rot', 0, e.target.value)} onBlur={handleCommit} onKeyDown={(e) => e.key === 'Enter' && handleCommit()} />
                      <input type="number" className="inp" step="0.1" value={selectedObj.rot[1]} onChange={(e) => handleNumericChangeDirect('rot', 1, e.target.value)} onBlur={handleCommit} onKeyDown={(e) => e.key === 'Enter' && handleCommit()} />
                      <input type="number" className="inp" step="0.1" value={selectedObj.rot[2]} onChange={(e) => handleNumericChangeDirect('rot', 2, e.target.value)} onBlur={handleCommit} onKeyDown={(e) => e.key === 'Enter' && handleCommit()} />
                    </div>
                  </div>
                  <div>
                    <strong className="lbl">Size</strong>
                    <div className="xyz">
                      <input type="number" className="inp" step="0.5" value={selectedObj.size[0]} onChange={(e) => handleNumericChangeDirect('size', 0, e.target.value)} onBlur={handleCommit} onKeyDown={(e) => e.key === 'Enter' && handleCommit()} />
                      <input type="number" className="inp" step="0.5" value={selectedObj.size[1]} onChange={(e) => handleNumericChangeDirect('size', 1, e.target.value)} onBlur={handleCommit} onKeyDown={(e) => e.key === 'Enter' && handleCommit()} />
                      <input type="number" className="inp" step="0.5" value={selectedObj.size[2]} onChange={(e) => handleNumericChangeDirect('size', 2, e.target.value)} onBlur={handleCommit} onKeyDown={(e) => e.key === 'Enter' && handleCommit()} />
                    </div>
                  </div>
                </>
              )}
              <hr className="hr" />
              <button className="btn b-teal" onClick={handleDuplicate}>📄 複製 (Duplicate)</button>
              <button className="btn b-red" onClick={handleRemove}>🗑️ 削除</button>
            </div>
          ) : (<div className="insp-empty">オブジェクトを選択</div>)}
          <button className="btn b-gray" onClick={handleClear} style={{ margin: 'auto 10px 10px 10px' }}>💣 更地にする</button>
        </div>
      </div>
    </div>
  );
}
