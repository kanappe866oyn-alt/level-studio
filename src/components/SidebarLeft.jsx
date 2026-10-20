// src/components/SidebarLeft.jsx
import React from 'react';
import { SEMANTIC_PREFABS } from '../core/rules';
import RationalePanel from './RationalePanel';

export default function SidebarLeft({
  isOpen, setIsOpen,
  logs, setLogs,
  handleUndo, handleRedo,
  historyStep, historyLength,
  objects,
  selectedIds, setSelectedIds, setEditorMode,
  evaluation, collisions, navigation,
  handleAIEvaluation, isEvaluating, aiReview,
  showDummy, setShowDummy,
  handleDownloadCSV,
  designRationale, // RationalePanel用に受け取る
  spatialRecheck, spatialRecheckStale, onSpatialRecheck, onTerrainJoinRepair, spatialChecking, spatialCheckDisabled, onSpatialProblem, coverProposal, routeDisplay,
  onOpenSizePreview, onCancelSpatialCheck
}) {
  const InspectionWrapper = onSpatialRecheck ? 'details' : 'div';
  return (
    <div className={`sidebar-wrapper left-wrapper ${isOpen ? 'is-open' : ''}`}>
      <div id="hierarchy-panel" className={`sidebar left ${isOpen ? '' : 'closed'}`} inert={!isOpen}>
        <div className="sidebar-inner">
          <div className="block">
            <strong className="block-title">🔬 研究ログ (Participant ID)</strong>
            <input 
              type="text" 
              className="inp" 
              value={logs.participantId} 
              onChange={(e) => setLogs({...logs, participantId: e.target.value})} 
            />
          </div>

          <div className="panel-title">🛠️ Hierarchy</div>
          <div className="block">
            <button className="btn b-blue full" onClick={onOpenSizePreview}>モデルのサイズ確認</button>
          </div>
          <div className="block" style={{ display: 'flex', gap: '6px' }}>
            <button className="btn grow" onClick={handleUndo} disabled={historyStep === 0}>↩️ Undo</button>
            <button className="btn grow" onClick={handleRedo} disabled={historyStep === historyLength - 1}>↪️ Redo</button>
          </div>

          <div className="h-list">
            {objects.map((obj) => (
              <div
                key={obj.id}
                className={`h-item ${selectedIds.includes(obj.id) ? 'on' : ''}`}
                onClick={() => { setEditorMode('transform'); setSelectedIds([obj.id]); }}
              >
                <span className="h-name">{obj.name}</span>
                <span className="chip" style={{ background: SEMANTIC_PREFABS[obj.role]?.color || '#888' }}>{obj.role}</span>
              </div>
            ))}
          </div>

          {/* ★ 設計理由パネルを左サイドバーに組み込み、見やすくしました */}
          <div className="block">
            <RationalePanel designRationale={designRationale} spatialRecheck={spatialRecheck} spatialRecheckStale={spatialRecheckStale} onSpatialRecheck={onSpatialRecheck} onTerrainJoinRepair={onTerrainJoinRepair} spatialChecking={spatialChecking} spatialCheckDisabled={spatialCheckDisabled} onSpatialProblem={onSpatialProblem} coverProposal={coverProposal} routeDisplay={routeDisplay} onCancelSpatialCheck={onCancelSpatialCheck} />
          </div>

          <InspectionWrapper className="inspection-details">
          {onSpatialRecheck && <>
            <summary>補助的な簡易検査</summary>
            <p>立体ステージの経路と視線は「マップの確認」で調べます。以下の重なり数には、壁・手すり・柱の接続も含まれます。</p>
          </>}
          <div className="block">
            <strong className="block-title">重なりの目安</strong>
            <div className="kv">
              <span>重なりランク:</span>
              <span className="rank-num" style={{ color: evaluation.color }}>{evaluation.rank}</span>
            </div>
            <div className={collisions > 0 ? 'bad-text' : 'ok-text'} style={{ marginTop: '2px', fontSize: '11px' }}>
              {collisions > 0 ? `⚠️ 重なり候補: ${collisions}箇所` : "✅ 重なり候補なし"}
            </div>
            <p style={{ fontSize: '11px' }}>意図した接続も含む簡易判定です。ステージ全体の品質を表す点数ではありません。</p>
          </div>
          <div className="block">
            <strong className="block-title">上下階と歩行経路</strong>
            <p>床の高さ: {navigation?.levels || 0}層</p>
            <p className={navigation?.status === 'warning' ? 'bad-text' : ''}>{({ checked: '経路確認済み（簡易判定）', warning: '接続を確認してください', unavailable: 'スタートと床を配置すると検証できます', 'no-targets': 'ゴール等を配置すると経路を検証できます', limited: '検証範囲を超えています' })[navigation?.status]}</p>
            {navigation?.issues.map((issue, i) => <p key={i} className="bad-text" style={{ fontSize: '11px' }}>{issue}</p>)}
            {navigation?.notes.map((note, i) => <p key={i} style={{ fontSize: '11px' }}>{note}</p>)}
            <p style={{ fontSize: '11px' }}>幅0.7m・身長1.8m、段差0.6mまでの歩行を0.5m間隔で検証します。細い経路やモデル形状はテストプレイでも確認してください。</p>
          </div>

          </InspectionWrapper>

          <div className="block">
            <strong className="block-title">🧠 AI プレイアビリティ評価</strong>
            <button className="btn b-blue full" onClick={handleAIEvaluation} disabled={isEvaluating || objects.length === 0}>
              {isEvaluating ? "評価中..." : "🤖 現在のマップをAIに採点させる"}
            </button>

            {aiReview && (
              <div className="review-card">
                <div className="review-score" style={{ color: aiReview.score >= 80 ? 'var(--ok)' : aiReview.score >= 60 ? 'var(--warn)' : 'var(--danger)' }}>
                  {aiReview.score} / 100 点
                </div>
                <p style={{ margin: '0 0 10px 0' }}>{aiReview.comment}</p>

                <strong className="ok-text">👍 良い点:</strong>
                <ul className="r-ul" style={{ margin: '2px 0 10px 0' }}>
                  {aiReview.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>

                <strong className="bad-text">🛠️ 改善点:</strong>
                <ul className="r-ul" style={{ margin: '2px 0 0 0' }}>
                  {aiReview.improvements.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div className="block">
            <label className="checkline" style={{ color: 'var(--accent)' }}>
              <input
                type="checkbox"
                checked={showDummy}
                onChange={(e) => setShowDummy(e.target.checked)}
              />
              🧍‍♂️ 人型モデルを表示（スケール確認用）
            </label>
          </div>

          <div className="block" style={{ marginTop: 'auto', borderBottom: 'none' }}>
            <div className="kv" style={{ color: 'var(--text-dim)', fontSize: '11px' }}>
              <span>AI生成: {logs.aiGenerateCount} 回</span>
              <span>修正: {logs.manualEditCount} 回</span>
            </div>
            <button className="btn b-green full" onClick={handleDownloadCSV} style={{ marginTop: '8px' }}>📄 CSV出力 (スコア含む)</button>
          </div>
        </div>
      </div>
      
      {/* 開閉トグルボタン */}
      <button type="button" className="sidebar-toggle left" aria-controls="hierarchy-panel" aria-expanded={isOpen} aria-label={isOpen ? '左サイドバーを閉じる' : '左サイドバーを開く'} title={isOpen ? '左サイドバーを閉じる' : '左サイドバーを開く'} onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? '◀' : '▶'}
      </button>
    </div>
  );
}
