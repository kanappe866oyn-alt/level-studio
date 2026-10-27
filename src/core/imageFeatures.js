// Features a reference image can show and what it takes to have built them. The reader's observations are
// matched against this table: a feature that the design data can state is asked for (and later checked in
// the finished stage without another request); one it cannot state is listed as unmet, never dropped quietly.
// The user's own words win: a feature they removed or replaced is not asked for.
export const IMAGE_FEATURES = [
  { name: '川', words: '川|河|水路|流れ', how: 'riversに流路を点列(x,z)と幅で指定する', built: s => s.waters.some(w => Math.max(w.size[0], w.size[2]) >= 12) },
  { name: '橋', words: '橋', how: 'role=bridgeのobjectsを川や谷の両岸にまたがせて置く', built: s => s.objects.some(o => o.role === 'bridge') },
  { name: '階段', words: '階段|ステップ', how: 'role=climbのobjectsを置き、上下の足場をstairFrom/stairToで指定する(足元の踊り場は自動で作られる)', built: s => s.objects.some(o => o.role === 'climb') },
  { name: '崖・岩の塔', words: '崖|岩山|岩の塔|岩塔|岩柱|岩壁|巨岩|ビュート|断崖', how: 'formationsに位置・個数・高さ・広がりを指定する(岩壁が並ぶ)。崖の上の台地ならpadsやridgesで3m以上の高さの差をつけてもよい', built: s => s.formations > 0 || s.objects.some(o => o.role === 'cliff') || s.highGround >= 3 },
  { name: '段丘・多段の高台', words: '段丘|段々|多段|テラス|高台|プラットフォーム|高低差のある|階層', how: 'terracesに位置・幅・奥行・向き・段数・段差・最下段の標高を指定する(各段は勾配1/3以下の道でつながる)', built: s => s.terraces > 0 || s.padHeightRange >= 1.5 || s.objects.some(o => o.role === 'platform' && o.pos[1] + o.size[1] / 2 >= 1.5) },
  { name: '湖・池', words: '湖|池', how: 'riversの幅を広げるか、role=waterのboxを谷に置く', built: s => s.waters.length > 0 },
  { name: '谷', words: '谷|渓谷', how: 'ridgesのriseを負にするか、riversで谷を掘る', built: s => s.waters.length > 0 || s.valley },
  { name: '尾根', words: '尾根|山脈', how: 'ridgesに点列を指定する', built: s => s.ridges > 0 },
  // Not stated by the design data: listed as unmet with the reason, so that nobody believes they were built.
  { name: '滝', words: '滝', unsupported: '滝(落差のある水の流れ)は設計データで表現できません' },
  { name: '砂浜・海岸', words: '砂浜|海岸|波打ち際', unsupported: '砂浜・海岸の波打ち際は設計データで表現できません' },
];

// What the finished stage and its design contain, as far as these features are concerned.
export function featureState(objects, compilation) {
  const source = compilation?.source || {};
  const pads = source.pads || [], heights = pads.map(p => p.height);
  return {
    objects, waters: objects.filter(o => o.role === 'water'),
    count: { 橋: objects.filter(o => o.role === 'bridge').length, 階段: objects.filter(o => o.role === 'climb').length },
    formations: (compilation?.features?.built || []).filter(c => c.kind === 'formationBuilt').length,
    terraces: (compilation?.features?.built || []).filter(c => c.kind === 'terraceBuilt').length,
    padHeightRange: heights.length > 1 ? Math.max(...heights) - Math.min(...heights) : 0,
    ridges: (source.ridges || []).length,
    // High ground the terrain itself rises to (a plateau, a ridge): a cliff face can be made of it.
    highGround: Math.max(0, ...pads.map(p => p.height - (source.baseHeight || 0)), ...(source.ridges || []).flatMap(r => (r.points || []).map(p => p.rise))),
    valley: (source.ridges || []).some(r => r.points?.some(p => p.rise < 0)) || (source.hills || []).some(h => h.rise < 0),
  };
}

const excludedBy = (words, request) => new RegExp(String.raw`(?:${words})(?:(?:や|と|、|・)[一-龠ぁ-んァ-ヶ]{1,4})*(?:は|を|も|が)?\s*(?:不要|なし|無し|いらない|要らない|置かない|作らない|入れない|設けない|除|省|外|なくて)|(?:${words})(?:では|じゃ)なく|(?:${words})の代わり`).test(request);

// Goals and unmet features for the observations of a reference image.
export function imageFeatureGoals(observations, request, existingGoals, unsupportedText) {
  const goals = [], unmet = [];
  for (const observation of observations) {
    const asked = [], declined = [];
    for (const feature of IMAGE_FEATURES) {
      if (!new RegExp(feature.words).test(observation) || excludedBy(feature.words, request)) continue;
      if (existingGoals.some(g => g.features?.includes(feature.name)) || goals.some(g => g.features.includes(feature.name))) continue;
      if (new RegExp(feature.words).test(unsupportedText)) continue;
      (feature.unsupported ? declined : asked).push(feature);
      if (feature.unsupported && !unmet.includes(feature.unsupported)) unmet.push(feature.unsupported);
    }
    // "橋が複数" / "2か所の橋" / "いくつもの階段": more than one of a thing that can be counted
    const many = Object.fromEntries(asked.filter(f => ['橋', '階段'].includes(f.name) && new RegExp(`(?:複数|いくつ|数か所|数カ所|各所|[2-9２-９二三四五] ?(?:か所|カ所|ヶ所|つ|個|本|箇所))[^。]{0,8}(?:${f.words})|(?:${f.words})[^。]{0,6}(?:複数|いくつ|数か所|数カ所|各所|[2-9２-９二三四五] ?(?:か所|カ所|ヶ所|つ|個|本|箇所))`).test(observation)).map(f => [f.name, 2]));
    if (asked.length) goals.push({ description: `参考画像に見える特徴「${observation}」のうち、${asked.map(f => f.name).join('・')}を、最終配置の地形・道筋・配置に反映する`, source: 'image', evidence: observation, features: asked.map(f => f.name), ...(Object.keys(many).length ? { atLeast: many } : {}) });
  }
  return { goals, unmet };
}

// After building: each asked-for feature must be in the stage. Missing ones are reported with how to state them.
export function inspectImageFeatureGoals(brief, objects, compilation) {
  const state = featureState(objects, compilation), issues = [];
  for (const goal of brief.designGoals.filter(g => g.source === 'image' && Array.isArray(g.features))) {
    for (const name of goal.features) {
      const feature = IMAGE_FEATURES.find(f => f.name === name);
      if (feature?.built && !feature.built(state)) issues.push(`参考画像の特徴「${name}」が設計にありません(${goal.evidence})。${feature.how}。`);
      else if (goal.atLeast?.[name] && (state.count[name] ?? Infinity) < goal.atLeast[name]) issues.push(`参考画像の特徴「${name}」は複数あります(${goal.evidence})が、${state.count[name]}個しかありません。${goal.atLeast[name]}個以上置いてください。`);
    }
  }
  return issues;
}
