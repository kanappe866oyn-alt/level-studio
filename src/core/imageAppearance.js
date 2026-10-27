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

function colourFor(observation, words) {
  const match = observation.match(new RegExp(`([^、。,]{0,12})(${words})`));
  if (!match) return null;
  for (const [pattern, hex] of COLOURS) if (pattern.test(match[1] + match[2])) return hex;
  return null;
}

export function colourFromImageReading(objects, brief) {
  const observations = (brief?.imageObservations || []).filter(o => typeof o === 'string');
  if (!observations.length) return { objects, changes: [] };
  const changes = [];
  const next = objects.map(o => {
    let out = o;
    for (const kind of KINDS.filter(k => k.roles.includes(o.role))) {
      const field = kind.field || 'color', fallback = ASSETS.SEMANTIC_PREFABS[o.role]?.color;
      if (out !== o && out[field] !== o[field]) continue;
      if (field === 'color' ? o.color && o.color.toLowerCase() !== fallback?.toLowerCase() : o.color2) continue;
      const source = observations.find(text => colourFor(text, kind.words));
      if (!source) continue;
      const hex = colourFor(source, kind.words);
      changes.push({ id: o.id, reason: `参考画像の読み取り「${source}」にある色・素材を、既定色のままだった${o.id}の${field === 'color2' ? '屋根色' : '色'}に使った(${hex})` });
      out = { ...out, [field]: hex };
    }
    return out;
  });
  return { objects: next, changes };
}
