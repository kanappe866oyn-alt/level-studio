// src/components/RationalePanel.jsx
import React, { useState } from 'react';
import SpatialReviewPanel from './SpatialReviewPanel.jsx';

export default function RationalePanel({ designRationale, spatialRecheck, spatialRecheckStale, onSpatialRecheck, onTerrainJoinRepair, spatialChecking, spatialCheckDisabled, onSpatialProblem, coverProposal, routeDisplay, onCancelSpatialCheck }) {
  // 初期状態は折りたたんでおく
  const [isExpanded, setIsExpanded] = useState(false);

  if (!designRationale) return null;
  const alignment = designRationale?.reference_alignment;
  const spatialValidation = designRationale?.spatial_design?.validation;
  const spatialFinish = designRationale?.spatial_design?.finish;
  const requestContract = designRationale?.spatial_design?.request_contract;
  const referenceSections = [
    ['imageObservations', '参考画像からAIが読み取った特徴'],
    ['instructions', '指定条件の確認'],
    ['preferences', '好みと設計値'],
    ['unsupported', '今回再現できない要素'],
  ];

  return (
    <div className="rationale">
      {onSpatialRecheck && <SpatialReviewPanel report={spatialRecheck} stale={spatialRecheckStale} onCheck={onSpatialRecheck} onCancel={onCancelSpatialCheck} onRepairJoins={onTerrainJoinRepair} checking={spatialChecking} disabled={spatialCheckDisabled} onView={onSpatialProblem} coverProposal={coverProposal} routeDisplay={routeDisplay} />}
      <div className="r-header" onClick={() => setIsExpanded(!isExpanded)}>
        <strong className="r-title">📝 空間の設計理由</strong>
        <span className="r-icon" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </div>

      {isExpanded && (
        <div className="r-content">
          {typeof designRationale === 'string' ? (
            <p style={{ margin: 0, lineHeight: '1.5', marginTop: '10px' }}>{designRationale}</p>
          ) : (
            <div style={{ lineHeight: '1.5', marginTop: '10px' }}>
              {Array.isArray(requestContract?.checks) && requestContract.checks.length > 0 && (
                <div className="r-sub"><strong>文章の明示条件との照合（生成時）</strong>
                  <ul className="r-ul">{requestContract.checks.map(c => <li key={c.id}>「{c.evidence}」: {c.passed ? '確認済み' : '未達'} — {c.detail}</li>)}</ul>
                </div>
              )}
              {Array.isArray(requestContract?.notes) && requestContract.notes.length > 0 && (
                <div className="r-sub"><strong>自動照合できない表現・任意の希望</strong>
                  <ul className="r-ul">{requestContract.notes.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
              {spatialValidation?.navigation === 'checked' && (
                <div className="r-sub">
                  <strong>生成時の立体マップ検証</strong>
                  <p>全エリアへの歩行を確認。独立経路: {spatialValidation.independentRoutes}本。</p>
                  <p>視線条件: {Array.isArray(spatialValidation.sightlines) ? spatialValidation.sightlines.filter(s => s.passed).length : 0}件確認。</p>
                  {spatialFinish?.sightlinesPreserved && <p>港町の外観を適用し、仕上げ前の歩行・視線を保持しました。</p>}
                  <p>生成時の結果です。編集後の構造と射線は再確認してください。</p>
                </div>
              )}
              {referenceSections.map(([key, title]) => {
                const items = Array.isArray(alignment?.[key]) ? alignment[key].filter(item => typeof item === 'string').slice(0, 32) : [];
                return items.length > 0 && <div className="r-sub" key={key}><strong>{title}</strong><ul className="r-ul">{items.map((item, i) => <li key={i}>{item}</li>)}</ul></div>;
              })}
              <div className="r-sub">
                <strong style={{ color: 'var(--warn)' }}>🎯 全体意図:</strong> {designRationale?.overall_intent}
              </div>

              <div className="r-sub">
                <strong style={{ color: 'var(--accent-2)' }}>📐 地面サイズ:</strong> {designRationale?.ground_size ? `[${designRationale.ground_size.join(', ')}]` : "未定義"}
              </div>
              
              <div className="r-sub">
                <strong style={{ color: 'var(--purple)' }}>🧠 構成の説明:</strong> {designRationale?.spatial_plan}
              </div>

              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: 'var(--ok)' }}>🔑 主要な決定:</strong>
                <ul className="r-ul">
                  {designRationale?.key_decisions?.map((d, i) => (
                    <li key={i}><span style={{ color: 'var(--teal)' }}>[{d.object_id}]</span> {d.reason}</li>
                  ))}
                </ul>
              </div>
              
              {designRationale?.tradeoffs?.length > 0 && (
                <div>
                  <strong style={{ color: 'var(--danger)' }}>⚖️ 妥協点 (Tradeoffs):</strong>
                  <ul className="r-ul">
                    {designRationale.tradeoffs.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
