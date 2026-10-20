export default function SpatialMeasurementsPanel({ measurements, onView, disabled, coverProposal, canPropose }) {
  if (!measurements) return null;
  return <details className="r-sub">
    <summary>距離と射線の測定</summary>
    <p>入口 → 目的地の最短距離の目安: {measurements.goalDistance === null ? '到達を確認できません' : `${measurements.goalDistance.toFixed(1)}m`}</p>
    {measurements.path.length > 0 && <p>経由地点: {measurements.path.map(a => a.name).join(' → ')}</p>}
    <p>往復できた元の接続の中心線で計算しています。階段は斜面の長さによる近似です。</p>
    <strong>各地点までの距離</strong>
    <ul className="r-ul">{measurements.areaDistances.map(a => <li key={a.id}>{a.name}: {a.distance === null ? '到達未確認' : `${a.distance.toFixed(1)}m`}</li>)}</ul>
    <strong>長く見通せる区間（上位3区間）</strong>
    <p>全{measurements.checkedPairs}組のエリア間を測定。各組81本の目線のうち、壁で遮られなかった最長距離です。</p>
    {measurements.longestSightlines.length === 0 && <p>見通せる区間を確認できません。</p>}
    {measurements.longestSightlines.map(s => <div key={s.id}>
      <p>{s.label}: {s.maxVisibleDistance.toFixed(1)}m（{s.visibleSamples}/{s.totalSamples}目線が通る）</p>
      <button className="btn full" disabled={disabled} onClick={() => onView?.(s)}>{s.label}の射線を見る</button>
      <button className="btn full" disabled={disabled || !canPropose || coverProposal?.busy} onClick={() => coverProposal?.onSearch(s)}>{s.label}の遮蔽物案を探す</button>
    </div>)}
    {coverProposal?.busy && <div aria-live="polite"><p>歩行と指定条件を保てる遮蔽物案を探しています…</p><button className="btn full" onClick={coverProposal.onCancel}>探索を中止</button></div>}
    {coverProposal?.state && <div aria-live="polite">
      {coverProposal.state.error && <p>{coverProposal.state.error}</p>}
      {coverProposal.state.result && (coverProposal.state.result.candidate ? <>
        <strong>遮蔽物のプレビュー</strong>
        <p>対象: {coverProposal.state.target.label}</p>
        <p>対象区間の最長射線: {coverProposal.state.result.before.maxVisibleDistance.toFixed(1)}m → {coverProposal.state.result.after.maxVisibleDistance.toFixed(1)}m</p>
        <p>元の接続の往復歩行と指定条件を確認済み。緑の箱は案です。採用するまで保存・衝突判定に含みません。</p>
        <button className="btn b-green full" disabled={disabled} onClick={coverProposal.onAdopt}>この遮蔽物案を採用</button>
      </> : <p>指定条件を保って射線を短くする案が見つかりませんでした。既存マップは変更していません。</p>)}
      <button className="btn full" onClick={coverProposal.onDiscard}>案を閉じる</button>
    </div>}
    <strong>高台から見える範囲</strong>
    {measurements.highCoverage.length === 0 && <p>高台はありません。</p>}
    <ul className="r-ul">{measurements.highCoverage.map(a => <li key={a.id}>{a.name}: {a.available ? `${a.checked}エリア中${a.visible}エリア` : '元の地点に立てないため未確認'}{a.targets.length > 0 && `（${a.targets.join('、')}）`}</li>)}</ul>
    <p>見える範囲は各対象との81本の目線の20%以上が通るかで数えます。同時に全部を監視できることや競技バランスを保証する値ではありません。</p>
  </details>;
}
