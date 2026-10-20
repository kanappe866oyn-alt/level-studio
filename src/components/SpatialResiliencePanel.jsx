export default function SpatialResiliencePanel({ report, onView, disabled }) {
  if (!report) return null;
  return <details className="r-sub">
    <summary>通路1本が使えない場合の影響</summary>
    <p>往復を確認した{report.testedConnections}接続を、1本ずつ使えないと仮定して調べました。現在のマップは変更しません。</p>
    {!report.baselineGoalReachable && <p>現在すでに目的地への到達が未確認です。先に現在の経路を直してください。</p>}
    <p>目的地への到達が失われる接続: {report.goalCutCount}箇所</p>
    <p>現在行けるエリアが孤立する接続: {report.isolationCount}箇所</p>
    {report.baselineUnreachable.length > 0 && <p>現在すでに到達できない対象は、新たな孤立に数えていません。</p>}
    {report.scenarios.map(s => <div key={s.id}>
      <strong>{s.label}</strong>
      <p>この接続を使えない場合: {s.goalReachable ? '目的地へ到達可能' : '目的地への到達未確認'}、独立経路{s.routesRemaining}本。</p>
      <p>新たに孤立するエリア: {s.isolated.length ? s.isolated.map(a => a.name).join('、') : 'なし'}</p>
      <button className="btn full" disabled={disabled} onClick={() => onView?.(s)}>{s.label}の接続箇所を見る</button>
    </div>)}
    <p>元の確認済み接続だけを使う仮定の検査です。別の抜け道や戦術上の強弱は含みません。行き止まりが意図された場所もあるため、孤立を設計上の失敗とは判定しません。</p>
  </details>;
}
