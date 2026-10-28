import ASSETS from '../assets.json' with { type: 'json' };

// The colours a reference image shows, as the reader wrote them ("灰色の石の階段", "木の橋"). A model that keeps the
// catalogue's default colour for a role (orange stairs, a brown deck) did not choose it from the image; such objects
// take the colour the reading gives for that kind of structure. A colour the model chose itself is never replaced.
const KINDS = [
  { roles: ['climb'], words: '階段|石段|ステップ' },
  { roles: ['bridge'], words: '橋' },
  { roles: ['cover'], words: '石柱|柱|門柱' },
  { roles: ['platform', 'corridor'], words: '台地|高台|台|テラス|段丘|床|舗装|擁壁|石垣' },
  { roles: ['wall'], words: '壁|塀|石垣|擁壁' },
  { roles: ['building'], words: '建物|家|小屋|塔', field: 'color' },
  { roles: ['building'], words: '屋根', field: 'color2' },
];
// Colour words before material words: "白い石" is white, "石" alone is grey stone.
const COLOURS = [
  [/灰色|グレー|灰/, '#8e8d87'], [/白/, '#e3dfd4'], [/黒|暗い色|暗色/, '#3e3e3c'], [/赤|朱/, '#a6452f'], [/青緑/, '#3f8a86'], [/青/, '#4b6f96'],
  [/緑|苔/, '#5d7d48'], [/黄/, '#c7a548'], [/砂色|ベージュ|砂/, '#cbb38a'], [/茶|こげ茶|焦げ茶/, '#7a5a3c'],
  [/木製|木の|木造|板/, '#8a6a47'], [/石|岩|コンクリート/, '#8e8d87'], [/レンガ|煉瓦/, '#9c5a3f'],
];

// The colour word nearest the structure describes it ("白い建物に赤い屋根": the roof is red). A material word (石, 木の)
// counts only when no colour word stands before the structure ("白い石段" is white, "石段" grey stone).
const MATERIALS = COLOURS.slice(10);
const nearest = (text, list) => list.flatMap(([pattern, hex]) => [...text.matchAll(new RegExp(pattern.source, 'g'))].map(m => ({ at: m.index + m[0].length, hex }))).sort((a, b) => b.at - a.at)[0]?.hex ?? null;
const colourOf = (before, word) => nearest(before, COLOURS.slice(0, 10)) ?? nearest(before + word, MATERIALS);
// "木の" and "茶色の" name the same brown wood: colours this close count as one.
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const sameColour = list => list.every(m => Math.hypot(...rgb(m.hex).map((v, i) => v - rgb(list[0].hex)[i])) < 40);
// Every coloured mention of a kind of structure in the reading: { text, word, hex }.
function mentions(observations, words) {
  return observations.flatMap(text => [...text.matchAll(new RegExp(`([^、。,]{0,12}?)(${words})`, 'g'))]
    .map(m => ({ text, word: m[2], hex: colourOf(m[1], m[2]) })).filter(m => m.hex));
}

// A reading of the whole scene ("全体的に緑の地面と灰色の階段や岩で構成") names the colour its built parts share: the first
// colour whose phrase (up to the next colour word) names stone, rock, walls or floors. A colour given only to ground, plants,
// water, or a structure with its own colour (木の橋, 赤い屋根) is not that shared colour. It is used for decks, corridors and walls
// the reading never names, which would otherwise keep the catalogue colour (a brown deck in a grey stone scene).
const OVERALL = /全体|全般|全景|ステージ全体/;
const NOT_BUILT = /^(?:の|い|色|な)*(?:地面|草|芝|木|樹|森|葉|植|花|水|川|池|空|雲)/;
const SHARED_MATERIAL = /岩|石|壁|塀|台|床|舗装|崖|コンクリート|レンガ|煉瓦/;
const COLOUR_WORDS = new RegExp(COLOURS.map(([pattern]) => pattern.source).join('|'), 'g');
function overallColour(observations) {
  for (const text of observations.filter(t => OVERALL.test(t))) {
    const matches = [...text.matchAll(COLOUR_WORDS)];
    for (const [k, match] of matches.entries()) {
      const end = match.index + match[0].length, phrase = text.slice(end, matches[k + 1]?.index ?? text.length).split('。')[0];
      if (NOT_BUILT.test(phrase) || !SHARED_MATERIAL.test(match[0] + phrase)) continue;
      const hex = COLOURS.find(([pattern]) => pattern.test(match[0]))?.[1];
      if (hex) return { text, hex };
    }
  }
  return null;
}
const OVERALL_ROLES = ['platform', 'corridor', 'wall'];

export function colourFromImageReading(objects, brief) {
  const observations = (brief?.imageObservations || []).filter(o => typeof o === 'string');
  if (!observations.length) return { objects, changes: [] };
  const changes = [], overall = overallColour(observations);
  const next = objects.map(o => {
    let out = o, unclear = false;
    for (const kind of KINDS.filter(k => k.roles.includes(o.role))) {
      const field = kind.field || 'color', fallback = ASSETS.SEMANTIC_PREFABS[o.role]?.color;
      if (out !== o && out[field] !== o[field]) continue;
      if (field === 'color' ? o.color && o.color.toLowerCase() !== fallback?.toLowerCase() : o.color2) continue;
      const found = mentions(observations, kind.words);
      if (!found.length) continue;
      // Several colours for one kind (a grey stone 高台 and a wooden テラス): the colour goes only to the object whose name
      // says which one it is. With no such name the match is unknown, and the object keeps its own colour.
      let pick = found;
      if (!sameColour(found)) {
        const named = found.filter(m => `${o.name || ''} ${o.id}`.includes(m.word));
        if (!named.length || !sameColour(named)) { unclear = true; continue; }
        pick = named;
      }
      const { text, hex } = pick[0];
      changes.push({ id: o.id, reason: `参考画像の読み取り「${text}」にある色・素材を、既定色のままだった${o.id}の${field === 'color2' ? '屋根色' : '色'}に使った(${hex})` });
      out = { ...out, [field]: hex };
    }
    const fallback = ASSETS.SEMANTIC_PREFABS[o.role]?.color;
    if (unclear) changes.push({ id: o.id, reason: `参考画像の読み取りに同じ種類の構造物の色が複数あり、${o.id}がどれにあたるか分からないため、${o.id}の色は変えなかった` });
    if (out === o && !unclear && overall && OVERALL_ROLES.includes(o.role) && (!o.color || o.color.toLowerCase() === fallback?.toLowerCase())) {
      changes.push({ id: o.id, reason: `参考画像の読み取りで${o.id}にあたる構造の色は書かれていなかったため、全体の読み取り「${overall.text}」にある構造物の色を、既定色のままだった${o.id}に使った(${overall.hex})` });
      out = { ...o, color: overall.hex };
    }
    return out;
  });
  return { objects: next, changes };
}
