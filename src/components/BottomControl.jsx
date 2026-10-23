// src/components/BottomControl.jsx
import React, { useState, useRef, useEffect } from 'react';
import PromptPresetBar from './PromptPresetBar';

export default function BottomControl({
  aiMode, setAiMode, cloudModel,
  hasApiKey, aiConnection, onOpenAISettings,
  imageFile, setImageFile,
  imagePreview, setImagePreview,
  generationMode, setGenerationMode,
  stageTheme, setStageTheme,
  imageInputRef, handleImageChange,
  isPartialEdit, setIsPartialEdit,
  setAssemblyType,
  inputText, setInputText,
  handleGenerate, isLoading, generationStatus
}) {
  // ★ 追加: パネルの高さ状態とドラッグ管理
  const [panelHeight, setPanelHeight] = useState(260);
  const isDragging = useRef(false);

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (!isDragging.current) return;
      // ウィンドウ下端からの距離を計算し、高さを制限（最小100px, 最大画面の80%）
      const newHeight = window.innerHeight - e.clientY;
      setPanelHeight(Math.max(100, Math.min(newHeight, window.innerHeight * 0.8)));
    };
    const handlePointerUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = 'auto';
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      if (isDragging.current) document.body.style.cursor = 'auto';
    };
  }, []);

  return (
    // ★ 修正: heightを動的適用し、上部のpaddingをハンドル用に削る
    <div className="bottom" id="ai-generation-panel" style={{ height: `${panelHeight}px` }}>
      
      {/* ★ 追加: ドラッグハンドル（ここを掴んで上下にリサイズ） */}
      <div 
        className="bottom-resize-handle"
        role="separator" tabIndex={0} aria-label="プロンプトパネルの高さ" aria-orientation="horizontal"
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            setPanelHeight(height => Math.max(100, Math.min(height + (e.key === 'ArrowUp' ? 20 : -20), window.innerHeight * 0.8)));
          }
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          isDragging.current = true;
          document.body.style.cursor = 'ns-resize';
        }}
      >
        <div style={{ width: '40px', height: '4px', background: 'var(--text-dim)', borderRadius: '2px' }} />
      </div>

      <div className="brow">
        <select
          className="sel"
          style={{ width: 'auto' }}
          value={aiMode}
          aria-label="利用するAI"
          onChange={(e) => { setAiMode(e.target.value); setAssemblyType('direct'); onOpenAISettings(); }}
        >
          <option value="gemini">🌐 Gemini API (クラウド)</option>
          <option value="local">💻 自作AI (ローカル環境)</option>
        </select>

        <button className="btn b-gray" onClick={onOpenAISettings}>AI設定</button>
        <span className="ai-settings-summary" role="status">{aiMode === 'gemini' ? `${cloudModel} ／ ${hasApiKey ? (aiConnection.status === 'success' ? '接続確認済み' : 'キー設定済み') : 'キー未設定'}` : 'ローカルAI ／ AI設定で接続先を確認'}</span>
      </div>

      {imagePreview && (
        <div className="imgprev">
          <img src={imagePreview} alt="Preview" />
          <button onClick={() => { setImageFile(null); setImagePreview(null); }}>X</button>
        </div>
      )}

      <div className="brow">
        <select className="sel" style={{ width: 'auto' }} value={generationMode} onChange={(e) => { setGenerationMode(e.target.value); setAssemblyType('direct'); }}>
          <option value="free">🎨 自由制作 (Free)</option>
          <option value="combat">🔫 対戦アリーナ (Combat)</option>
          <option value="platforming">🧗 立体アスレチック (Platforming)</option>
        </select>

        <input
          type="text"
          className="inp"
          style={{ width: '190px' }}
          value={stageTheme}
          onChange={(e) => setStageTheme(e.target.value)}
          placeholder="テーマ (例: 春, サイバーパンク, 青ベース)"
        />

        <button className="btn b-gray" onClick={() => imageInputRef.current.click()}>
          📷 {imageFile ? "画像変更" : "画像アップロード"}
        </button>
        <input type="file" ref={imageInputRef} accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />

        <label
          className="checkline"
          style={{
            color: (isPartialEdit && !imageFile) ? 'var(--ok)' : 'var(--text-dim)',
            cursor: imageFile ? 'not-allowed' : 'pointer',
            opacity: imageFile ? 0.5 : 1
          }}
        >
          <input type="checkbox" checked={isPartialEdit && !imageFile} disabled={!!imageFile} onChange={(e) => { setIsPartialEdit(e.target.checked); if (e.target.checked) setAssemblyType('direct'); }} />
          今のステージを修正
        </label>
      </div>

      <PromptPresetBar 
        generationMode={generationMode} 
        onApplyPreset={(text) => setInputText(text)} 
      />

      <div className="generation-status" role="status" aria-live="polite">{generationStatus}</div>
      <div className="brow prompt-row">
        <textarea
          className="inp grow"
          value={inputText}
          onFocus={(e) => {
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onBlur={(e) => {
            e.target.style.height = '44px';
          }}
          onChange={(e) => {
            setInputText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          placeholder={imageFile ? "例: このスケッチを再現して" : "例: スナイパーが有利な市街地 (Shift+Enterで改行)"}
          style={{
            resize: 'none',
            height: '44px',
            maxHeight: '100%', // ★ 親要素に合わせて伸びるように修正
            overflowY: 'auto',
            fontSize: '14px',
            transition: 'height 0.2s ease'
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!isLoading) { if (aiMode === 'gemini' && !hasApiKey) onOpenAISettings(); else handleGenerate(); }
            }
          }}
        />
        <button
          className={`btn ${(imageFile || !isPartialEdit) ? 'b-blue' : 'b-green'}`}
          onClick={() => { if (aiMode === 'gemini' && !hasApiKey) onOpenAISettings(); else handleGenerate(); }}
          disabled={isLoading}
          style={{ padding: '10px 24px', height: '44px', fontSize: '15px', whiteSpace: 'nowrap' }}
        >
          {isLoading ? "生成中…" : (imageFile || !isPartialEdit) ? "新規生成" : "対話修正"}
        </button>

      </div>
    </div>
  );
}
