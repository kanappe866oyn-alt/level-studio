import { surfaceTop, footprintContains } from './spatialGeometry.js';
import { sampleTerrainRelief } from './terrainRelief.js';
import { getModelDefault, usesNativeSizing } from './modelCatalog.js';
import ASSETS from '../assets.json' with { type: 'json' };

// Reserve the actual model footprint before meshing. Model bytes are not needed.
export function reserveTerrainBuildings(design, objects, ground) {
  const pads = [...design.pads], reservations = [];
  for (const object of objects) {
    if (object.role !== 'building' || object.supportId && !['__generated_terrain', ground.id].includes(object.supportId)) continue;
    const inferredSupport = !object.supportId;
    if (!object.pos?.every(Number.isFinite) || !object.size?.every(Number.isFinite) || !object.rot?.every(Number.isFinite)) throw new Error(`${object.id}: 建物の位置・寸法・回転が不正です。`);
    if (Math.abs(object.rot[0]) > .001 || Math.abs(object.rot[2]) > .001) throw new Error(`${object.id}: 地面に建つ建物は水平に置いてください。`);
    const variant = Math.max(1, Math.min(ASSETS.SEMANTIC_PREFABS.building.variants, Number.isFinite(object.variant) ? object.variant : 1));
    const model = !object.customModelUrl && usesNativeSizing('building', variant) ? getModelDefault('building', variant) : null;
    const size = object.modelDimensions?.path === model?.path ? object.size : model?.size || object.size;
    const yaw = object.rot[1], c = Math.cos(yaw), s = Math.sin(yaw);
    const width = Math.abs(c) * size[0] + Math.abs(s) * size[2] + 1.2;
    const depth = Math.abs(s) * size[0] + Math.abs(c) * size[2] + 1.2;
    let x = object.pos[0], z = object.pos[2];
    let covering = design.pads.filter(p => Math.abs(x-p.x)<=p.width/2 && Math.abs(z-p.z)<=p.depth/2);
    if (covering.some(p => Math.abs(p.height-covering[0].height)>.01)) throw new Error(`${object.id}: 敷地の標高が矛盾しています。`);
    // Keep an authored plaza height. Without one, use the authored terrain at
    // the building centre, not the requested (possibly unmeasured) model height.
    // The plot takes the height of the plaza it overlaps (the one it overlaps most): left at the terrain's
    // own height beside a plaza of another height, the two would give one spot two heights.
    const overlapArea = p => Math.max(0, Math.min(x + width / 2, p.x + p.width / 2) - Math.max(x - width / 2, p.x - p.width / 2)) * Math.max(0, Math.min(z + depth / 2, p.z + p.depth / 2) - Math.max(z - depth / 2, p.z - p.depth / 2));
    const overlapped = design.pads.map(p => ({ p, area: overlapArea(p) })).filter(e => e.area > 0).sort((a, b) => b.area - a.area)[0];
    let height = covering[0]?.height ?? overlapped?.p.height ?? sampleTerrainRelief(design,x,z);
    if (inferredSupport) {
      const bottom=object.pos[1]-object.size[1]/2;
      const otherFloor=objects.some(o=>['platform','bridge','corridor'].includes(o.role)&&Number.isFinite(surfaceTop(o,x,z))&&Math.abs(surfaceTop(o,x,z)-bottom)<=.3);
      // A building with no declared support stands on the terrain unless another floor lies under it.
      // A height guess that is metres off (a buried or floating box) is the model's slip, not a sign
      // that the building belongs elsewhere; it is seated on the terrain below.
      if(otherFloor || Math.abs(x-ground.pos[0])>ground.size[0]/2 || Math.abs(z-ground.pos[2])>ground.size[2]/2)continue;
    }
    if (Math.abs(x - ground.pos[0]) + width/2 > ground.size[0]/2 || Math.abs(z - ground.pos[2]) + depth/2 > ground.size[2]/2) throw new Error(`${object.id}: 実寸モデルの敷地が地形の外へ出ます。建物を内側へ移してください。`);
    // A conservative oriented rectangle protects the entire road width, including
    // bends whose segment endpoints are both outside the building footprint.
    const blocked = (px, pz) => design.paths.some(path => path.points.slice(1).some((point, k) => {
      const local = p => [c*(p.x-px)-s*(p.z-pz), s*(p.x-px)+c*(p.z-pz)];
      const a=local(path.points[k]), b=local(point);
      let enter=0, leave=1;
      for (let axis=0; axis<2; axis++) {
        const extent=size[axis===0?0:2]/2+path.width/2+.35, delta=b[axis]-a[axis];
        if (Math.abs(delta)<1e-9) { if(Math.abs(a[axis])>extent){enter=2;break;} }
        else { const t1=(-extent-a[axis])/delta,t2=(extent-a[axis])/delta;enter=Math.max(enter,Math.min(t1,t2));leave=Math.min(leave,Math.max(t1,t2)); }
      }
      return enter<=leave;
    }));
    let shifted = null;
    // The terrain holds each flat 0.8 m beyond its edge, so two flats of different heights closer than 1.6 m meet.
    // A plot at height h meets only flats of that same height.
    const flatPads = (px, pz, h) => design.pads.filter(p => Math.abs(px-p.x)<p.width/2+width/2+1.6 && Math.abs(pz-p.z)<p.depth/2+depth/2+1.6).every(p => Math.abs(p.height-h)<=.01);
    // A plot that spans flat ground of two heights (a building across two terrace levels, or half on a raised
    // plaza) would give one spot two heights; it is slid the same way as a plot on a road.
    const straddles = !flatPads(x, z, height);
    // Points over the plot, 2 m apart or closer: a stair, a bridge, water or a terrace level is never built over.
    const plotPoints = (px, pz) => { const nx = Math.ceil(width / 2), nz = Math.ceil(depth / 2), points = [];
      for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) points.push([px - width/2 + width*i/nx, pz - depth/2 + depth*k/nz]);
      return points; };
    const ways = objects.filter(o => o !== object && (['climb', 'bridge', 'water', 'corridor'].includes(o.role) || o.designFeature === 'terraceFloor') && o.pos?.every(Number.isFinite) && o.size?.every(Number.isFinite));
    const onWay = (px, pz) => ways.some(o => plotPoints(px, pz).some(([qx, qz]) => footprintContains(o, qx, qz, -0.3)));
    // A plot keeps clear of the water and banks of a river (the channel is cut below the plot's height).
    const inRiver = (px, pz) => (design.rivers || []).some(river => (river?.points || []).slice(1).some((b, k) => {
      const a = river.points[k], dx = b.x-a.x, dz = b.z-a.z;
      return plotPoints(px, pz).some(([qx, qz]) => { const t = Math.max(0, Math.min(1, ((qx-a.x)*dx+(qz-a.z)*dz)/(dx*dx+dz*dz || 1))); return Math.hypot(qx-a.x-t*dx, qz-a.z-t*dz) < (river.width || 0)/2 + 1; });
    }));
    const inTheWay = onWay(x, z) || inRiver(x, z);
    if (blocked(x, z) || straddles || inTheWay) {
      // Slide the model sideways by the smallest step that clears every road,
      // stays on the ground and avoids buildings already reserved. A larger
      // problem is left to the model to redesign.
      const plot = (px, pz) => {
        const cover = design.pads.filter(p => Math.abs(px-p.x)<=p.width/2 && Math.abs(pz-p.z)<=p.depth/2);
        if (cover.length) return { cover, height: cover[0].height };
        let nearest = null;
        for (const path of design.paths) for (let k=1; k<path.points.length; k++) {
          const a=path.points[k-1], b=path.points[k], dx=b.x-a.x, dz=b.z-a.z, t=Math.max(0,Math.min(1,((px-a.x)*dx+(pz-a.z)*dz)/(dx*dx+dz*dz))), distance=Math.hypot(px-a.x-t*dx,pz-a.z-t*dz);
          if (!nearest || distance<nearest.distance) nearest={distance,height:a.height+(b.height-a.height)*t,reach:path.width/2+Math.max(width,depth)/2+4};
        }
        // Beside a road, level the plot with the road so the two never disagree.
        return { cover, height: nearest && nearest.distance<=nearest.reach ? nearest.height : sampleTerrainRelief(design,px,pz) };
      };
      // The reserved plot is an axis-aligned square; it must not touch a road
      // that lies at another height.
      const plotClashesRoad = (px, pz, plotHeight) => design.paths.some(path => path.points.slice(1).some((point, k) => {
        const a = path.points[k], length = Math.hypot(point.x-a.x, point.z-a.z), samples = Math.max(2, Math.ceil(length / .5));
        for (let i=0; i<=samples; i++) {
          const t=i/samples, x2=a.x+(point.x-a.x)*t, z2=a.z+(point.z-a.z)*t, h2=a.height+(point.height-a.height)*t;
          if (Math.abs(x2-px) < width/2+path.width/2-.25 && Math.abs(z2-pz) < depth/2+path.width/2-.25 && Math.abs(h2-plotHeight) > .3) return true;
        }
        return false;
      }));
      const fits = (px, pz) => Math.abs(px-ground.pos[0])+width/2<=ground.size[0]/2 && Math.abs(pz-ground.pos[2])+depth/2<=ground.size[2]/2 && !blocked(px, pz) && flatPads(px, pz, plot(px, pz).height) && !inRiver(px, pz) && !onWay(px, pz) &&
        !plotClashesRoad(px, pz, plot(px, pz).height) &&
        !reservations.some(r => Math.abs(px-r.x)<(width+r.width)/2 && Math.abs(pz-r.z)<(depth+r.depth)/2);
      outer: for (let step=1; step<=14; step++) for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[.7,.7],[-.7,.7],[.7,-.7],[-.7,-.7]]) {
        const px=x+dx*step, pz=z+dz*step;
        if (fits(px, pz)) { shifted={from:[x,z],to:[px,pz],distance:Math.hypot(px-x,pz-z)}; break outer; }
      }
      if (!shifted) throw new Error(inTheWay && !blocked(x, z) ? `${object.id}: 実寸モデルの敷地(${width.toFixed(1)}x${depth.toFixed(1)}m)が階段・橋・水路・段丘の床に重なり、近くに置ける場所もありません。建物をそれらの外へ移してください。` : straddles && !blocked(x, z) ? `${object.id}: 実寸モデルの敷地(${width.toFixed(1)}x${depth.toFixed(1)}m)が高さの違う平場・段にまたがり、近くに平らな置き場所もありません。建物を1つの平場の中か、平場の外へ移してください。` : `${object.id}: 実寸モデルが指定の道を塞ぎます。道の位置と幅を保ち、建物を移してください。`);
      x=shifted.to[0]; z=shifted.to[1]; object.pos[0]=x; object.pos[2]=z;
      ({ cover: covering, height } = plot(x, z));
    }
    if (!pads.some(p => Math.abs(x-p.x)+width/2<=p.width/2 && Math.abs(z-p.z)+depth/2<=p.depth/2 && Math.abs(p.height-height)<.01)) pads.push({x,z,width,depth,height});
    reservations.push({objectId:object.id,inferredSupport,model:model?.path || null,x,z,width,depth,height,...(shifted?{shifted}:{})});
    object.supportId='__generated_terrain';
  }
  return {pads,reservations};
}
