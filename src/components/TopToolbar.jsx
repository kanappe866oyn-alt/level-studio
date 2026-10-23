import { LOCAL_PALETTES } from '../core/localAppearance.js';
import { useEffect, useId, useRef, useState } from 'react';

export default function TopToolbar({
  editorMode, setEditorMode, transformType, setTransformType, hasSelection,
  handleSaveProject, fileInputRef, handleLoadProject, setIsEditorStarted,
  onOpenSizePreview, onOpenGuide, onOpenNatureBuilder, onOpenTerrainBuilder, buildingDisabled, autosaveStatus, autosaveFailed,
  onFinishSpatial, onLocalPalette, canvasFocused, onToggleCanvasFocus, showGrid, onToggleGrid, gridDisabled,
  renderQuality, onRenderQualityChange, measuringPerformance, onTogglePerformance
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsId = useId(), wrapper = useRef(null), toggle = useRef(null);
  useEffect(() => {
    if (!optionsOpen) return;
    const closeOutside = event => { if (!wrapper.current?.contains(event.target)) setOptionsOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [optionsOpen]);
  const run = action => () => { setOptionsOpen(false); action(); };
  return <div className="toolbar">
    <div className="studio-brand"><span className="studio-mark" aria-hidden="true">◇</span><span>LEVEL STUDIO<small>3D LEVEL EDITOR</small></span></div>
    <button type="button" className={`tbtn focus-toggle ${canvasFocused ? 'on' : ''}`} aria-pressed={canvasFocused} onClick={onToggleCanvasFocus} title="左右のパネルとAI入力をまとめて切り替えます">{canvasFocused ? '↙ 編集パネルを戻す' : '⛶ キャンバスを広げる'}</button>
    <button type="button" className="tbtn" onClick={handleSaveProject}>保存</button>
    {hasSelection && !canvasFocused && !gridDisabled && <div className="tgroup" role="group" aria-label="選択した物の編集">
      {[['translate', '移動'], ['scale', '伸縮'], ['rotate', '回転']].map(([type, label]) => <button key={type} type="button" className={`tbtn ${editorMode === 'transform' && transformType === type ? 'on' : ''}`} aria-pressed={editorMode === 'transform' && transformType === type} onClick={() => { setEditorMode('transform'); setTransformType(type); }}>{label}</button>)}
    </div>}
    <div className="toolbar-options" ref={wrapper} onKeyDown={event => {
      if (event.key === 'Escape' && optionsOpen) { event.preventDefault(); event.stopPropagation(); setOptionsOpen(false); toggle.current?.focus(); }
    }}>
      <button type="button" className="tbtn" ref={toggle} aria-expanded={optionsOpen} aria-controls={optionsId} onClick={() => setOptionsOpen(value => !value)}>その他の操作</button>
      {optionsOpen && <div id={optionsId} className="toolbar-options-panel" role="group" aria-label="その他の操作">
        <section className="toolbar-option-section"><strong>ファイル・ヘルプ</strong>
        <button type="button" className="tbtn" onClick={() => { setOptionsOpen(false); fileInputRef.current.click(); }}>開く</button>
        <button type="button" className="tbtn" onClick={run(onOpenGuide)}>操作ガイド</button>
        <button type="button" className="tbtn" onClick={run(onOpenSizePreview)}>サイズ確認</button>
        <button type="button" className="tbtn" onClick={run(() => setIsEditorStarted(false))}>トップへ</button>
        </section><section className="toolbar-option-section"><strong>ステージ制作</strong>
        <button type="button" className="tbtn" onClick={run(onOpenTerrainBuilder)} disabled={buildingDisabled}>立体ステージ</button>
        <button type="button" className="tbtn" onClick={run(onOpenNatureBuilder)} disabled={buildingDisabled}>自然ステージ</button>
        {onFinishSpatial && <button type="button" className="tbtn" onClick={run(onFinishSpatial)} disabled={buildingDisabled}>外観を仕上げる</button>}
        {onLocalPalette && <label className="local-palette-control">配色を変更（AI通信なし）
          <select aria-label="配色を変更（AI通信なし）" className="sel" value="" disabled={buildingDisabled} onChange={event => { onLocalPalette(event.target.value); setOptionsOpen(false); }}>
            <option value="" disabled>配色を選択</option>
            {LOCAL_PALETTES.map(palette => <option key={palette.id} value={palette.id}>{palette.label}</option>)}
          </select>
          <small>構造・モデルは維持。元の外観の別案です。</small>
        </label>}
        </section><section className="toolbar-option-section"><strong>表示設定</strong>
        <button type="button" className={`tbtn ${showGrid && !gridDisabled ? 'on' : ''}`} aria-label="編集用の補助線" aria-pressed={showGrid && !gridDisabled} onClick={run(onToggleGrid)} disabled={gridDisabled}>補助線</button>
        <label className="render-quality-control">表示品質 <select aria-label="表示品質" value={renderQuality} onChange={event => onRenderQualityChange(event.target.value)}>
          <option value="light">軽量</option><option value="standard">標準</option><option value="high">高品質</option>
        </select></label>
        <button type="button" className={`tbtn ${measuringPerformance ? 'on' : ''}`} aria-pressed={measuringPerformance} onClick={run(onTogglePerformance)}>表示速度を確認</button>
        </section>
      </div>}
    </div>
    <input type="file" ref={fileInputRef} accept=".json" onChange={handleLoadProject} style={{ display: 'none' }} />
    <div className={`autosave-status ${autosaveFailed ? 'failed' : ''}`} role="status" aria-live="polite">{autosaveStatus}</div>
  </div>;
}
