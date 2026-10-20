// A piecewise linear strip: rendering and water detection use the same sections.
export function validateSections(sections) {
  if (!Array.isArray(sections) || sections.length < 2 || sections.length > 65 ||
      !sections.every((p, i) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) &&
        p[0] >= -0.5 && p[0] <= 0.5 && Math.abs(p[1]) <= 0.5 && (!i || p[0] > sections[i - 1][0])) ||
      sections[0][0] !== -0.5 || sections.at(-1)[0] !== 0.5) throw new Error('流路は両端を含む2〜65個の順序付き座標が必要です。');
  return sections.map(p => [...p]);
}

export function sectionOffset(sections, t) {
  if (t < -0.5 - 1e-7 || t > 0.5 + 1e-7) return null;
  for (let i = 1; i < sections.length; i++) {
    const [a, b] = [sections[i - 1], sections[i]];
    if (t <= b[0] + 1e-7) return a[1] + (b[1] - a[1]) * Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
  }
  return sections.at(-1)[1];
}

export function validateRiverProfile(profile) {
  if (!profile || !Number.isFinite(profile.widthRatio) || profile.widthRatio <= 0 || profile.widthRatio > 1) throw new Error('川幅の比率は0より大きく1以下で指定してください。');
  const sections = validateSections(profile.sections);
  if (sections.some(p => Math.abs(p[1]) + profile.widthRatio / 2 > 0.5 + 1e-7)) throw new Error('流路が川の外形サイズを超えています。');
  return { widthRatio: profile.widthRatio, sections };
}

export function riverContains(object, x, z, inset = 0) {
  const offset = sectionOffset(object.riverProfile.sections, z / object.size[2]);
  return offset !== null && Math.abs(z) <= object.size[2] / 2 - inset + 1e-7 &&
    Math.abs(x - offset * object.size[0]) <= object.size[0] * object.riverProfile.widthRatio / 2 - inset + 1e-7;
}

export function riverMeshData(object) {
  const profile = validateRiverProfile(object.riverProfile);
  const [w, h, d] = object.size, positions = [], indices = [];
  // Inner rows confine the shoreline colour to a narrow band, preserving the exact outer edges.
  const columns = 5, half = profile.widthRatio * w / 2;
  for (const [z, x] of profile.sections) {
    const band = Math.min(0.5, half * 0.2);
    for (const offset of [-half, -half + band, 0, half - band, half]) positions.push(x * w + offset, h / 2, z * d);
  }
  for (let i = 0; i < profile.sections.length - 1; i++) {
    for (let j = 0; j < columns - 1; j++) {
      const a = i * columns + j;
      indices.push(a, a + columns, a + columns + 1, a, a + columns + 1, a + 1);
    }
  }
  const topIndexCount = indices.length;
  const perimeter = Array.from({ length: columns }, (_, i) => i);
  for (let i = 1; i < profile.sections.length; i++) perimeter.push(i * columns + columns - 1);
  for (let j = columns - 2; j >= 0; j--) perimeter.push((profile.sections.length - 1) * columns + j);
  for (let i = profile.sections.length - 2; i > 0; i--) perimeter.push(i * columns);
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i] * 3, b = perimeter[(i + 1) % perimeter.length] * 3, k = positions.length / 3;
    positions.push(positions[a], h / 2, positions[a + 2], positions[b], h / 2, positions[b + 2], positions[a], -h / 2, positions[a + 2], positions[b], -h / 2, positions[b + 2]);
    indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  // Close the bottom with the same strip triangulation.
  const bottom = positions.length / 3;
  for (let k = 0; k < profile.sections.length * columns; k++) positions.push(positions[k * 3], -h / 2, positions[k * 3 + 2]);
  for (let i = 0; i < profile.sections.length - 1; i++) for (let j = 0; j < columns - 1; j++) {
    const a = bottom + i * columns + j;
    indices.push(a, a + columns + 1, a + columns, a, a + 1, a + columns + 1);
  }
  return { positions, indices, topIndexCount };
}
