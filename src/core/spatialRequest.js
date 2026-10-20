import { independentRouteCount, SPATIAL_HIGH_HEIGHTS } from './spatialPlan.js';

const NUMBER = '(?<![0-9一二三四五六七八九十百千万.])(?:-?[0-9]+(?:\\.[0-9]+)?|[一二三四五六七八九十]+)';
const HEIGHT_UNIT = 'cm|センチメートル|センチ|mm|ミリメートル|ミリ|m|メートル';
const REF = '(?:(?:南西|北西|南東|北東|西|東|南|北|中央|奥|手前)(?:側)?(?:の)?\\s*)?(?:高架下|橋の下|中央広場|中庭|中央|高台|裏道|側道|入口|目的地|ゴール|広場)';
const VISION = '見えない|見えなく|見えず|見渡せる|見渡す|見通せる|見える|見え|隠れる|隠す|隠して';
const normal = text => text.normalize('NFKC');
function numeral(text) {
  if (/^-?\d/.test(text)) return Number(text);
  const digits = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (text.includes('十')) { const [a, b] = text.split('十'); return (a ? digits[a] : 1) * 10 + (b ? digits[b] : 0); }
  return digits[text];
}
const optional = text => /できれば|可能なら|参考(?:として|例)|例えば|理想(?:は|として)|約\s*\d/.test(text);
const hidden = text => /見えない|見えなく|見えず|隠れ|隠す|隠して/.test(text);

function visionClauses(clause) {
  // Keep each evidence string as an unchanged substring of the human request.
  // Do not detach a condition from a preference or a complex negation.
  if (optional(clause) || /ではなく|しないで|必要ない/.test(clause)) return [clause];
  return clause.split(new RegExp(`(?<=見えて|見えず|見えるが|見えないが|見えるし|見えないし|見渡せるが|見渡すが)\\s*(?=(?:できれば|可能なら)?\\s*${REF}\\s*(?:から|が|は|を))`));
}

export function readSpatialRequest(request = '') {
  if (typeof request !== 'string' || request.length > 20000) throw new Error('立体マップの指示が長すぎるか不正です。');
  const source = normal(request), conditions = [], notes = [];
  const add = condition => {
    if (!conditions.some(c => c.kind === condition.kind && c.evidence === condition.evidence)) conditions.push({ id: `condition_${conditions.length + 1}`, ...condition });
  };
  for (const sentence of source.split(/[。！？;\n]/).filter(s => s.trim())) {
    let previousSource = null;
    for (const clause of sentence.split(/[、,]/).flatMap(visionClauses).filter(s => s.trim())) {
      const text = clause.trim();
      if (optional(text)) { notes.push(`任意・例示として扱いました: ${text}`); continue; }
      const routePatterns = [
        new RegExp(`(${NUMBER})\\s*(?:つの|本の|本|つ)?\\s*(?:独立した)?(?:経路|ルート)`),
        new RegExp(`(?:経路|ルート)(?:数)?\\s*(?:は|を|:|=)?\\s*(${NUMBER})\\s*(?:本|つ)?(?!\\s*(?:m|cm|mm|メートル|[0-9]))`),
      ];
      const route = routePatterns.map(p => text.match(p)).find(Boolean);
      if (route) {
        const partial = text.match(new RegExp(`(${REF})\\s*(?:へ|まで)\\s*(?:独立した)?\\s*(?:${NUMBER})`));
        if (/(?:最短|中央|左右|左|右|西|東|北|南)(?:の)?(?:経路|ルート)/.test(text) || partial && !/目的地|ゴール|奥の広場/.test(partial[1])) notes.push(`一部の区間の経路数は自動照合できません: ${text}`);
        else if (/要らない|いらない|不要|ではなく|にしない/.test(text)) notes.push(`経路数の否定・比較は自動照合できません: ${text}`);
        else {
          const operator = /以上|最低|少なくとも/.test(text) ? 'atLeast' : /以下|以内|最大|多くても/.test(text) ? 'atMost' : 'exact';
          add({ kind: 'routes', value: numeral(route[1]), operator, evidence: text });
        }
      } else if (/経路|ルート/.test(text) && /[0-9一二三四五六七八九十百千]/.test(text)) notes.push(`この経路数の表現は自動照合できません: ${text}`);
      const heightPatterns = [
        new RegExp(`(高台(?:の高さ)?|高架(?:の高さ)?)(?:は|を|:|=)?\\s*(?:高さ)?\\s*(${NUMBER})\\s*(${HEIGHT_UNIT})`),
        new RegExp(`高さ\\s*(${NUMBER})\\s*(${HEIGHT_UNIT})\\s*(?:の)?\\s*(高台|高架)`),
        new RegExp(`(${NUMBER})\\s*(${HEIGHT_UNIT})\\s*(?:の)?\\s*(高台|高架)`),
      ];
      const heights = heightPatterns.map((p, i) => ({ match: text.match(p), i })).find(x => x.match);
      if (heights) {
        if (/以下|以上|未満|以内|程度|くらい|ではなく|不要|要らない|にしない/.test(text)) notes.push(`高さの範囲・否定指定は自動照合できません: ${text}`);
        else {
          const unit = heights.match[heights.i === 0 ? 3 : 2];
          const scale = /^(?:cm|センチ)/.test(unit) ? 0.01 : /^(?:mm|ミリ)/.test(unit) ? 0.001 : 1;
          const value = numeral(heights.match[heights.i === 0 ? 2 : 1]) * scale;
          const scope = [...text.slice(0, heights.match.index).matchAll(/(西|東|北|南)(?:の|に|側)/g)].at(-1)?.[1] || null;
          add({ kind: 'height', value, scope, evidence: text });
        }
      } else if (/高台|高架/.test(text) && /[0-9一二三四五六七八九十百千]/.test(text) && /m|メートル|センチ|ミリ|高さ/.test(text)) notes.push(`この高台の寸法表現は自動照合できません: ${text}`);
      const direct = text.match(new RegExp(`(${REF})\\s*から\\s*(${REF})\\s*(?:が|は|を)?\\s*(?:広く\\s*)?(${VISION})`));
      const reverse = text.match(new RegExp(`(${REF})\\s*(?:が|は)\\s*(${REF})\\s*から\\s*(?:広く\\s*)?(${VISION})`));
      const attributive = text.match(new RegExp(`(${REF})\\s*から\\s*(?:広く\\s*)?(${VISION})\\s*(?:ような|ようにした)?\\s*(${REF})`));
      const inherited = previousSource ? text.match(new RegExp(`(${REF})\\s*(?:が|は|を)?\\s*(?:広く\\s*)?(${VISION})`)) : null;
      if (direct || reverse || attributive || inherited) {
        const from = direct ? direct[1] : reverse ? reverse[2] : attributive ? attributive[1] : previousSource;
        const to = direct ? direct[2] : reverse ? reverse[1] : attributive ? attributive[3] : inherited[1];
        const vision = (direct || reverse || attributive || inherited)[direct || reverse ? 3 : 2];
        const relation = hidden(vision) ? 'hidden' : 'visible';
        if (/ではなく|しないで|必要ない/.test(text)) notes.push(`視線の否定・比較は自動照合できません: ${text}`);
        else { add({ kind: 'sight', from: from.trim(), to: to.trim(), relation, evidence: text,
          ...(relation === 'visible' && /見渡/.test(vision) ? { minVisibleRatio: 0.5 } : {}) }); previousSource = from.trim(); }
      } else if (/見え|見渡|見通|射線|視線|隠れ/.test(text)) notes.push(`この視線指定は対象地点を自動で特定できません: ${text}`);
    }
  }
  if (conditions.length > 24) throw new Error('立体マップの明示条件は24件までです。');
  return { version: 1, request, conditions, notes: [...new Set(notes)].slice(0, 24) };
}

export function spatialRequestProblems(brief) {
  const issues = [];
  for (const c of brief.conditions) {
    if (c.kind === 'routes' && (!Number.isInteger(c.value) || c.value < 1 || c.value > 3)) issues.push(`「${c.evidence}」: この設計方式の指定経路数は1〜3本です。「指示と画像に合わせて生成」では別の構成を試せます。`);
    if (c.kind === 'height' && !SPATIAL_HIGH_HEIGHTS.includes(c.value)) issues.push(`「${c.evidence}」: この設計方式の高台は2・4・6・8mです。${c.value}mを別の高さに置き換える生成は行いません。自由な寸法は「指示と画像に合わせて生成」を選択してください。`);
  }
  for (const kind of ['routes', 'height']) {
    const exact = brief.conditions.filter(c => c.kind === kind && (kind === 'height' ? !c.scope : c.operator === 'exact'));
    if (new Set(exact.map(c => c.value)).size > 1) issues.push(`${kind === 'routes' ? '経路数' : '高台の高さ'}に異なる必須値があります。条件をひとつにしてください。`);
  }
  const routeLimits = brief.conditions.filter(c => c.kind === 'routes');
  const lower = Math.max(1, ...routeLimits.filter(c => c.operator !== 'atMost').map(c => c.value));
  const upper = Math.min(3, ...routeLimits.filter(c => c.operator !== 'atLeast').map(c => c.value));
  if (lower > upper) issues.push('経路数の指定範囲が矛盾しています。');
  const globalHeights = brief.conditions.filter(c => c.kind === 'height' && !c.scope);
  if (globalHeights.some(g => brief.conditions.some(c => c.kind === 'height' && c.scope && c.value !== g.value))) issues.push('全体の高台の高さと、方角を指定した高台の高さが矛盾しています。');
  for (const scope of ['西', '東', '南', '北']) {
    if (new Set(brief.conditions.filter(c => c.kind === 'height' && c.scope === scope).map(c => c.value)).size > 1) issues.push(`${scope}の高台の高さに異なる必須値があります。条件をひとつにしてください。`);
  }
  const sightRelations = new Map();
  // Only merge explicit spelling variants of the same reference. Different
  // directions and different named locations must retain independent rules.
  const sightRef = ref => ref.replace(/\s|側|の/g, '');
  for (const c of brief.conditions.filter(c => c.kind === 'sight')) {
    const key = JSON.stringify([sightRef(c.from), sightRef(c.to)]);
    if (sightRelations.has(key) && sightRelations.get(key) !== c.relation) issues.push(`${c.from}から${c.to}の「見える」と「見えない」が矛盾しています。条件をひとつにしてください。`);
    sightRelations.set(key, c.relation);
  }
  return [...new Set(issues)];
}

export function validateSpatialRequestRecord(record) {
  if (!record || record.version !== 1 || typeof record.request !== 'string' || record.request.length > 20000 || !Array.isArray(record.conditions) || record.conditions.length > 24 || !Array.isArray(record.checks) || record.checks.length > 24 || !Array.isArray(record.notes) || record.notes.length > 24 || record.notes.some(s => typeof s !== 'string' || s.length > 21000)) throw new Error('文章条件の照合記録の形式が不正です。');
  const ids = new Set(), source = normal(record.request);
  for (const c of record.conditions) {
    if (!c || !/^condition_\d+$/.test(c.id) || ids.has(c.id) || typeof c.evidence !== 'string' || !c.evidence.trim() || !source.includes(c.evidence)) throw new Error('文章条件の根拠・IDが不正です。');
    ids.add(c.id);
    if (c.kind === 'routes' ? !Number.isInteger(c.value) || c.value < 1 || c.value > 3 || !['exact', 'atLeast', 'atMost'].includes(c.operator) : c.kind === 'height' ? !SPATIAL_HIGH_HEIGHTS.includes(c.value) || ![null, '西', '東', '南', '北'].includes(c.scope) : c.kind === 'sight' ? typeof c.from !== 'string' || !c.from || typeof c.to !== 'string' || !c.to || !['visible', 'hidden'].includes(c.relation) : true) throw new Error('文章条件の値が不正です。');
    if (c.minVisibleRatio !== undefined && (c.kind !== 'sight' || c.relation !== 'visible' || c.minVisibleRatio !== 0.5 || !/見渡/.test(c.evidence))) throw new Error('文章条件の視界の基準が不正です。');
  }
  const checked = new Set();
  for (const c of record.checks) {
    if (!c || !ids.has(c.id) || checked.has(c.id) || typeof c.evidence !== 'string' || !source.includes(c.evidence) || typeof c.passed !== 'boolean' || typeof c.detail !== 'string' || c.detail.length > 10000) throw new Error('文章条件の照合結果が不正です。');
    checked.add(c.id);
  }
  if (checked.size !== ids.size) throw new Error('文章条件の照合結果が不足しています。');
  return record;
}

function areaMatches(plan, ref) {
  const areas = Array.isArray(plan.areas) ? plan.areas.filter(a => a && typeof a.name === 'string') : [];
  const main = areas.find(a => a.kind === 'courtyard') || areas.find(a => a.kind === 'entry');
  const bare = ref.replace(/^(?:南西|北西|南東|北東|西|東|南|北|中央|奥|手前)(?:側)?(?:の)?\s*/, '');
  let candidates = areas.filter(a => /高台/.test(ref) ? a.kind === 'high' && a.level > 0 : /中庭|中央広場|中央/.test(ref) ? a.kind === 'courtyard' : /入口/.test(ref) && !/裏道/.test(ref) ? a.kind === 'entry' : /目的地|ゴール|奥の広場/.test(ref) ? a.kind === 'goal' : /高架下|橋の下/.test(ref) ? a.kind === 'passage' : a.name.includes(bare || ref));
  if (/西/.test(ref)) candidates = candidates.filter(a => a.gx < (main?.gx ?? 0));
  if (/東/.test(ref)) candidates = candidates.filter(a => a.gx > (main?.gx ?? 0));
  if (/北/.test(ref)) candidates = candidates.filter(a => a.gz < (main?.gz ?? 0));
  if (/南/.test(ref)) candidates = candidates.filter(a => a.gz > (main?.gz ?? 0));
  const exact = candidates.filter(a => a.name === ref);
  if (exact.length) return exact;
  if (/裏道|側道/.test(ref)) { const middle = candidates.filter(a => /(?:裏道|側道)$/.test(a.name)); if (middle.length) return middle; }
  return candidates;
}

export function spatialSightPassed(condition, sight) {
  return !!sight?.passed && (condition.relation === 'hidden' ? sight.visibleSamples === 0 : sight.ratio >= (condition.minVisibleRatio ?? 0.2));
}

export function inspectSpatialRequest(plan, brief, { geometry = false, sightlines } = {}) {
  const rows = [], issues = [];
  for (const c of brief.conditions) {
    let passed = false, detail = '', from, to;
    if (c.kind === 'routes') {
      const value = geometry ? independentRouteCount(plan.areas, plan.connections) : plan.requirements?.minimumRoutes;
      passed = c.operator === 'atLeast' ? value >= c.value : c.operator === 'atMost' ? value <= c.value : value === c.value;
      detail = `独立経路 ${Number.isFinite(value) ? value : '未指定'}本（指定 ${c.value}本${c.operator === 'atLeast' ? '以上' : c.operator === 'atMost' ? '以下' : ''}）`;
    } else if (c.kind === 'height') {
      const targets = areaMatches(plan, `${c.scope ? `${c.scope}の` : ''}高台`);
      passed = targets.length > 0 && targets.every(a => a.level * 4 === c.value);
      detail = targets.length ? targets.map(a => `${a.name}: ${a.level * 4}m`).join('、') : '対象の高台がありません';
    } else {
      const sources = areaMatches(plan, c.from), targets = areaMatches(plan, c.to);
      const line = (plan.requirements?.sightlines || []).find(s => s && s.relation === c.relation && sources.some(a => a.id === s.from) && targets.some(a => a.id === s.to));
      passed = !!line;
      if (line) { from = line.from; to = line.to; detail = `${sources.find(a => a.id === from).name} → ${targets.find(a => a.id === to).name}: ${c.relation === 'visible' ? '見える' : '見えない'}`; }
      else detail = `${c.from} → ${c.to}: ${c.relation === 'visible' ? '見える' : '見えない'}条件が設計にありません`;
      if (c.minVisibleRatio) detail += `（見渡せる: 目線の${c.minVisibleRatio * 100}%以上が必要）`;
      if (geometry && line && (sightlines || c.minVisibleRatio)) {
        const measured = sightlines?.find(s => s.from === from && s.to === to && s.relation === c.relation);
        passed = spatialSightPassed(c, measured);
        detail += measured ? `（${measured.visibleSamples}/${measured.totalSamples}目線）` : '（視界の実測が必要です）';
      }
    }
    rows.push({ id: c.id, evidence: c.evidence, passed, detail, ...(from ? { from, to } : {}) });
    if (!passed) issues.push(`「${c.evidence}」を保持してください。${detail}`);
  }
  return { rows, issues };
}

export function spatialRequestPrompt(brief) {
  return `\n【文章から抽出した明示条件・変更禁止】\n${JSON.stringify(brief.conditions)}\n経路数のexactは実際の独立経路数を一致させます。heightは対象の全ての高台の床高さです。sightの対象は用途・名前・方角に合うエリアをsightlinesへ登録します。minVisibleRatioが0.5の「見渡せる」条件は81組の目線の半数以上が通る配置を要求します。高さだけでなく高台の床・縁の遮り、対象までの距離も調整してください。これらの条件を削除・緩和して修正しないでください。`;
}
