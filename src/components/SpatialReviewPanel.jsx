import { useId, useState } from 'react';
import SpatialMeasurementsPanel from './SpatialMeasurementsPanel.jsx';
import SpatialResiliencePanel from './SpatialResiliencePanel.jsx';
import { compareSpatialRoutes } from '../core/spatialRouteViews.js';

const SECTIONS = [['result', '結果'], ['routes', '経路'], ['analysis', '分析・調整']];

export default function SpatialReviewPanel({ report, stale, onCheck, onCancel, onRepairJoins, checking, disabled, onView, coverProposal, routeDisplay }) {
  const [section, setSection] = useState('result');
  const prefix = useId();
  const current = report && !stale && !checking;
  const checks = report?.checks || [];
  const issues = report?.issues || [];
  const locations = report?.locations || [];
  const routes = report?.routeViews || [];
  const comparison = compareSpatialRoutes(routes);
  const locationButton = location => <button key={location.id} className="btn full" disabled={disabled} onClick={() => onView?.(location)}>{location.label}を見る</button>;
  return <section className="spatial-review" aria-label="マップの確認">
    <strong className="block-title">マップの確認</strong>
    <button className="btn b-blue full" disabled={checking || disabled} onClick={() => { setSection('result'); onCheck(); }}>
      {checking ? '確認しています…' : '現在のマップを再確認'}
    </button>
    {checking && onCancel && <button className="btn full" onClick={onCancel}>確認を中止</button>}
    <div aria-live="polite">
      {!report && !checking && <p>編集したら、ここで経路と視線を確認できます。</p>}
      {report && stale && !checking && <p>編集後の状態は未確認です。再確認してください。</p>}
      {checking && <p>現在の床・壁を調べています。確認中も画面を操作できます。編集すると確認を中止します。</p>}
    </div>
    {current && <>
      <div className="spatial-review-tabs" role="tablist" aria-label="マップ確認の表示">
        {SECTIONS.map(([key, label], index) => <button key={key} id={`${prefix}-${key}-tab`} role="tab" type="button"
          aria-selected={section === key} aria-controls={`${prefix}-${key}`} tabIndex={section === key ? 0 : -1}
          onClick={() => setSection(key)} onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null;
            if (next === null) return;
            event.preventDefault(); setSection(SECTIONS[next][0]);
            event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus();
          }}>{label}</button>)}
      </div>
      <div role="tabpanel" id={`${prefix}-result`} aria-labelledby={`${prefix}-result-tab`} hidden={section !== 'result'}>
        <p className={report.passed ? 'ok-text' : 'bad-text'}>{report.passed ? '元の接続と指定条件を確認済み' : '確認が必要な箇所があります'}</p>
        {Number.isFinite(report.routes) && <p>独立経路: {report.routes}本{checks.length > 0 && ` ／ 指定条件: ${checks.filter(c => c.passed).length}/${checks.length}件`}</p>}
        {report.buildingApproaches?.length > 0 && <p>建物入口前: {report.buildingApproaches.filter(b => b.passed).length}/{report.buildingApproaches.length}か所を確認（建物内部の通行は未対応）</p>}
        {report.terrainJoins?.walking?.checkedDirections > 0 && <p>接続口の左右・中央: {report.terrainJoins.walking.passedDirections}/{report.terrainJoins.walking.checkedDirections}方向を通行確認</p>}
        {issues.length > 0 && <>
          <ul className="r-ul">{issues.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}</ul>
          {issues.length > 3 && <details className="r-sub"><summary>残り{issues.length - 3}件の確認事項</summary><ul className="r-ul">{issues.slice(3).map((s, i) => <li key={i}>{s}</li>)}</ul></details>}
        </>}
        {!!report.terrainJoins?.repairableAreas?.length && onRepairJoins && <div className="r-sub">
          <button className="btn full" disabled={disabled} onClick={onRepairJoins}>接続口を直す</button>
          <p>広場の接続口を平坦に整えます。歩行と指定条件を満たす場合に採用します。Undoで戻せます。</p>
        </div>}
        {locations.slice(0, 3).map(locationButton)}
        {locations.length > 3 && <details className="r-sub"><summary>その他の確認地点</summary>{locations.slice(3).map(locationButton)}</details>}
        {checks.length > 0 && <details className="r-sub"><summary>指定条件の詳細</summary><ul className="r-ul">{checks.map(c => <li key={c.id}>「{c.evidence}」: {c.passed ? '確認済み' : '未達'} — {c.detail}</li>)}</ul></details>}
        <details className="r-sub"><summary>検査の範囲</summary><p>元の設計地点と接続を現在の床・壁で簡易検査します。新しい抜け道や競技バランスはテストプレイで確認してください。結果はこの画面でのみ保持します。</p></details>
      </div>
      <div role="tabpanel" id={`${prefix}-routes`} aria-labelledby={`${prefix}-routes-tab`} hidden={section !== 'routes'}>
        <p>通過地点と距離を比べ、3D画面で経路を確認できます。</p>
        {comparison && <div className="r-sub" aria-label="代表経路の比較">
          <p>表示する代表経路では、最短は{comparison.shortest.label}の{comparison.shortest.distance.toFixed(1)}m、最長は{comparison.longest.label}の{comparison.longest.distance.toFixed(1)}mです。距離差は{comparison.difference.toFixed(1)}m{comparison.ratio !== null && `（約${comparison.ratio.toFixed(1)}倍）`}です。</p>
          {comparison.climbing && <p>{comparison.climbing.difference < 0.05 ? `表示する${comparison.count}経路の上り合計は、いずれも約${comparison.climbing.least.ascent.toFixed(1)}mです。` : `上りの合計は、最少が${comparison.climbing.least.label}の${comparison.climbing.least.ascent.toFixed(1)}m、最多が${comparison.climbing.most.label}の${comparison.climbing.most.ascent.toFixed(1)}mです。`}</p>}
          {comparison.sharedAreas.length > 0 && <p>複数の代表経路が通る場所: {comparison.sharedAreas.map(a => `${a.name}（${a.routes}経路）`).join('、')}。ここで複数経路を同時に押さえられないか、テストプレイで確認してください。</p>}
          <p>距離差に見合う見通しや遮蔽物があるかは、実際に歩いて確認してください。距離差だけで有利・不利は判定しません。</p>
        </div>}
        {!routes.length && <p>目的地までの経路を確認できません。</p>}
        {routes.length > 0 && <button className="btn full" disabled={disabled} aria-pressed={routeDisplay?.enabled && !routeDisplay.selected} onClick={() => routeDisplay?.onShow(null)}>全ての確認済み経路を表示</button>}
        {routes.map(route => <div className="r-sub" key={route.id}>
          <p><span style={{ color: route.color }}>● {route.label}</span>: {route.distance.toFixed(1)}m</p>
          {Number.isFinite(route.ascent) && <p>上り合計 {route.ascent.toFixed(1)}m ／ 下り合計 {route.descent.toFixed(1)}m ／ 最高地点 {route.highest.toFixed(1)}m</p>}
          <p>{route.areas.map(a => a.name).join(' → ')}</p>
          <button className="btn full" disabled={disabled} aria-pressed={routeDisplay?.enabled && routeDisplay.selected === route.id} onClick={() => routeDisplay?.onShow(route.id)}>{route.label}だけ表示</button>
        </div>)}
        {routeDisplay?.enabled && <button className="btn full" onClick={routeDisplay.onHide}>経路の色表示を消す</button>}
        <details className="r-sub"><summary>経路表示の見方</summary><p>接続を共有しない代表経路です。地点を共有する場合があります。各経路の最短距離や全ての経路を示すものではありません。線と距離は元の接続の中心を通る目安です。上り・下りは設計地点間の高さの変化を合計し、最高地点は設計の高さ0mを基準に示します。床の細かな凹凸、階段の段数、移動時間は測定していません。</p></details>
      </div>
      <div role="tabpanel" id={`${prefix}-analysis`} aria-labelledby={`${prefix}-analysis-tab`} hidden={section !== 'analysis'}>
        <p>必要な項目を開いて、調整の判断材料を確認できます。</p>
        <SpatialMeasurementsPanel measurements={report.measurements} onView={onView} disabled={disabled} coverProposal={coverProposal} canPropose={report.passed} />
        <SpatialResiliencePanel report={report.resilience} onView={onView} disabled={disabled} />
      </div>
    </>}
  </section>;
}
