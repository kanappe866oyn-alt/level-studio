import { worldXZ } from './spatialGeometry.js';

const profiles = {
  entry: { surface: 'facade-market', body: '#9fc4c4', roof: '#276a77', accent: '#e0bd78', label: '港町の入口', landmark: 'gateway' },
  courtyard: { surface: 'facade-arcade', body: '#e3cfab', roof: '#72866b', accent: '#a77a47', landmark: 'lantern' },
  goal: { surface: 'facade-warehouse', body: '#cd8b65', roof: '#465d6b', accent: '#f0c27a', label: '目的地', landmark: 'tower' },
  high: { surface: 'facade-warehouse', body: '#91b2b2', roof: '#366f78', accent: '#d4b477' },
  passage: { surface: 'facade-market', body: '#bac7b7', roof: '#557a73', accent: '#d4b477' },
};

// Building volumes are proposed independently from circulation. Every module
// is disposable: the finisher must keep walking clearance and authored views.
export function spatialArchitectureModules(stage) {
  const objects = [], floor = stage.objects.find(o => o.id === 'sp_ground');
  const footing = floor ? floor.pos[1] + floor.size[1] / 2 : -8.5;
  const add = (moduleId, suffix, name, pos, size, surface, category, district, color, yaw = 0) => {
    const object = { id: `sp_finish_urban_${moduleId}_${suffix}`, name, role: 'wall', type: 'box', pos, size,
      rot: [0, yaw, 0], color, material: 0, variant: 1,
      spatialAppearance: { version: 1, style: 'harbor', surface, category, district, moduleId } };
    objects.push(object);
    return object;
  };
  const foundation = (moduleId, name, x, z, width, depth, top, district = 'neutral', yaw = 0) => {
    if (top <= footing + 0.05) return;
    add(moduleId, 'foundation', `${name}の基礎`, [x, (footing + top) / 2, z], [width, top - footing, depth],
      'concrete', 'foundation', district, '#8c9185', yaw);
  };
  for (const a of stage.areas) {
    const district = a.level > 0 ? 'high' : a.enclosure === 'walled' ? 'lane' : a.kind === 'courtyard' ? 'court' : 'entry';
    // Ground-level areas read as raised city blocks rather than thin plates.
    // Elevated areas keep their open supports, preserving any lower storey.
    if (a.level === 0) foundation(`base_${a.id}`, a.name, a.x, a.z, a.width, a.depth, a.y - 0.3, district);
    if (a.enclosure !== 'open') continue;
    const links = stage.connections.filter(c => c.from === a.id || c.to === a.id);
    const sides = [['north', 'z', -1], ['south', 'z', 1], ['west', 'x', -1], ['east', 'x', 1]].filter(([, axis, direction]) => !links.some(c => {
      const other = stage.areas.find(b => b.id === (c.from === a.id ? c.to : c.from));
      return c.axis === axis && Math.sign(other[axis] - a[axis]) === direction;
    }));
    const profile = profiles[a.kind] || profiles.passage;
    for (const [side, axis, direction] of sides) {
      // Leave every declared doorway and stair approach unobstructed.
      const yaw = axis === 'x' ? Math.PI / 2 : 0;
      const depth = a.kind === 'courtyard' ? 3 : 2.5;
      const width = (axis === 'x' ? a.depth : a.width) + 0.5;
      const x = a.x + (axis === 'x' ? direction * (a.width / 2 + 0.6 + depth / 2) : 0);
      const z = a.z + (axis === 'z' ? direction * (a.depth / 2 + 0.6 + depth / 2) : 0);
      const height = (a.kind === 'entry' ? 4.8 : a.kind === 'courtyard' ? 6 : a.kind === 'goal' ? 7.2 : 4.2) + (direction > 0 ? 0.6 : 0);
      const moduleId = `front_${a.id}_${side}`;
      foundation(moduleId, `${a.name}沿いの建物`, x, z, width, depth, a.y, district, yaw);
      add(moduleId, 'body', `${a.name}沿いの建物`, [x, a.y + height / 2, z], [width, height, depth],
        profile.surface, 'building', district, profile.body, yaw);
      add(moduleId, 'cornice', `${a.name}沿いの軒`, [x, a.y + height + 0.1, z], [width + 0.3, 0.2, depth + 0.3],
        'concrete', 'building', district, profile.accent, yaw);
      const [ridgeX, ridgeZ] = worldXZ({ pos: [x, 0, z], rot: [0, yaw, 0] }, 0, direction * depth * 0.1);
      add(moduleId, 'roof', `${a.name}沿いの屋上部`, [ridgeX, a.y + height + 0.5, ridgeZ], [width - 0.8, 0.6, depth * 0.65],
        'metal', 'building', district, profile.roof, yaw);
      const [signX, signZ] = worldXZ({ pos: [x, 0, z], rot: [0, yaw, 0] }, 0, -direction * (depth / 2 + 0.03));
      const sign = add(moduleId, 'wayfinding', `${a.name}沿いの案内`, [signX, a.y + 2.5, signZ], [Math.min(3.8, width - 1), 0.65, 0.08],
        'sign', 'building', district, profile.accent, yaw);
      sign.spatialAppearance.label = (profile.label || a.name).slice(0, 48);
      // One silhouette per area, part of the same checked building module.
      // If that facade cannot be adopted, no floating landmark is left behind.
      if (side !== sides.at(-1)?.[0] || !profile.landmark) continue;
      const roofPart = (suffix, name, localX, bottom, size, surface, color) => {
        const [px, pz] = worldXZ({ pos: [x, 0, z], rot: [0, yaw, 0] }, localX, 0);
        return add(moduleId, `landmark_${suffix}`, `${a.name}の${name}`, [px, a.y + height + bottom + size[1] / 2, pz], size,
          surface, 'building', district, color, yaw);
      };
      if (profile.landmark === 'gateway') {
        for (const s of [-1, 1]) roofPart(`post_${s}`, '入口を示す門柱', s * width * 0.23, 0.3, [0.45, 1.5, depth * 0.6], 'metal', profile.roof);
        roofPart('lintel', '入口を示す門の上梁', 0, 1.8, [width * 0.6, 0.25, depth * 0.6], 'concrete', profile.accent);
      } else if (profile.landmark === 'lantern') {
        roofPart('lantern', '中庭を示す灯台形の目印', -width * 0.22, 0.8, [1.2, 1.6, 1.2], 'stucco', '#f1dcab');
        roofPart('cap', '中庭の目印の笠', -width * 0.22, 2.4, [1.65, 0.25, 1.65], 'metal', profile.roof);
      } else {
        roofPart('tower', '目的地を示す倉庫塔', width * 0.23, 0.8, [1.8, 2.8, Math.min(depth, 1.8)], 'facade-warehouse', profile.body);
        roofPart('cap', '倉庫塔の笠', width * 0.23, 3.6, [2.1, 0.25, Math.min(depth + 0.2, 2.1)], 'metal', profile.roof);
      }
    }
  }
  for (const c of stage.connections) {
    const a = stage.areas.find(a => a.id === c.from);
    if (!c.rise && a.level === 0) foundation(`base_${c.object_id}`, '街路', c.x, c.z, c.width, c.length, a.y - 0.3, 'neutral', c.yaw);
    if (!c.rise && c.enclosure === 'walled') {
      add(`arcade_${c.object_id}`, 'ceiling', '裏道の連続した屋根', [c.x, a.y + 2.95, c.z], [c.width + 0.5, 0.3, c.length],
        'metal', 'building', 'lane', '#6d888b', c.yaw);
    }
  }
  return objects;
}
