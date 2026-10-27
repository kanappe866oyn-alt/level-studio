import { surfaceTop, footprintContains, createSpatialWorld } from './spatialGeometry.js';

// Only absolute, directly qualified ground plazas are covered here. Relative
// phrases (building's north side), negations and mixed directions need review.
export function inspectExplicitTerrainDirections(objects, compilation, request) {
  if(!compilation?.source)return [];
  const ground=objects.find(o=>o.role==='ground');
  if(!ground)return [];
  const issues=[];
  // Check endpoint bends only when the request names a cardinal end and turn.
  // A polyline's ordering is arbitrary, so inspect both outward end segments.
  const bendRequest=request.split(/[。！？\n]/).filter(s=>!/ではなく|ではない|不要|以外/.test(s)).join('。');
  for(const m of bendRequest.matchAll(/([北南])端で([東西])(?:へ|に)(?:緩やかに)?曲がる尾根/g)){
    const north=m[1]==='北',east=m[2]==='東';
    const found=(compilation.source.ridges||[]).some(r=>{
      if(r.points.length<3||!r.points.every(p=>p.rise>0))return false;
      // A bend may sit mid-line when the ridge continues past it (a hook): the
      // corner must be reached by a mostly north-south spine, lie at the
      // ridge's own extreme end and on the named side of the ground.
      const extreme=north?Math.min(...r.points.map(p=>p.z)):Math.max(...r.points.map(p=>p.z));
      const hooked=r.points.slice(1).some((b,k)=>{
        const a=r.points[k],eastward=b.x>a.x,corner=east===eastward?a:b,tip=corner===a?b:a;
        const cornerIndex=corner===a?k:k+1,spine=r.points[cornerIndex+(corner===a?-1:1)];
        if(!spine||Math.abs(tip.x-corner.x)<=Math.abs(tip.z-corner.z))return false;
        if(east?tip.x<=corner.x:tip.x>=corner.x)return false;
        // An arch bends both ways depending on the end read. The longer leg is
        // the spine; the bend belongs to the shorter leg's side.
        const beyond=r.points[r.points.indexOf(tip)+(tip===b?1:-1)];
        if(beyond&&Math.hypot(beyond.x-tip.x,beyond.z-tip.z)>Math.hypot(spine.x-corner.x,spine.z-corner.z))return false;
        return (north?corner.z<ground.pos[2]:corner.z>ground.pos[2])&&Math.abs(corner.z-extreme)<=2&&
          (north?spine.z>corner.z+2:spine.z<corner.z-2)&&Math.abs(spine.z-corner.z)>Math.abs(spine.x-corner.x);
      });
      if(hooked)return true;
      return [[r.points[0],r.points[1]],[r.points.at(-1),r.points.at(-2)]].some(([end,prev])=>{
        const dx=end.x-prev.x,dz=end.z-prev.z;
        return (north?end.z<ground.pos[2]:end.z>ground.pos[2]) &&
          (east?dx>0:dx<0)&&Math.abs(dx)>Math.abs(dz)&&
          r.points.some(p=>north?p.z>end.z+2:p.z<end.z-2);
      });
    });
    if(!found)issues.push(`指示「${m[0]}」に一致する正の尾根の端部がありません。北=-Z、南=+Z。尾根の南北位置と端部の曲がる向きを同時に修正してください。`);
  }
  for(const match of requestedDirectionalPlazas(request)){
      const direction=match[1];
      const pads=compilation.source.pads || [];
      const candidates=pads.filter(p=>p.width>=4&&p.depth>=4&&
        (direction==='北'?p.z<ground.pos[2]:direction==='南'?p.z>ground.pos[2]:direction==='東'?p.x>ground.pos[0]:p.x<ground.pos[0]));
      const open=candidates.some(p=>inspectTerrainPadElevation(objects,{source:{pads:[p]}},{evidence:direction,comparison:'exact',value:p.height}).passed);
      if(!open)issues.push(`指示「${match[0]}」に対応する開けた地形の平場がありません。北=-Z、南=+Z、東=+X、西=-X。地面中心(${ground.pos[0]},${ground.pos[2]})からの位置と接続を修正してください。`);
  }
  return [...new Set(issues)];
}

// Plazas the request places by an absolute direction (「南側の広場」), as matches: [phrase, direction, kind].
export function requestedDirectionalPlazas(request){
  return String(request||'').split(/[。！？\n]/).filter(sentence=>!/ではなく|ではない|不要|以外|建物の|橋の|広場の|平場の|尾根の|谷の/.test(sentence))
    .flatMap(sentence=>[...sentence.matchAll(/(?<![北南東西])([北南東西])(?:側)?の(?:小さな|大きな|広い|狭い|平らな|高さ[0-9０-９.]+[mｍ]の)?(平場|広場)/g)]);
}

// Measure authored open ground regions on the final mesh. A plaza does not need
// a separate platform object. Missing/ambiguous regions remain validation errors.
export function inspectTerrainPadElevation(objects, compilation, requirement) {
  const terrain=objects.find(o=>o.id==='__generated_terrain'),ground=objects.find(o=>o.role==='ground');
  if(!terrain || !ground || !compilation?.source?.pads)return {passed:false,actual:'地形の平場がありません'};
  const evidence=requirement.evidence,world=createSpatialWorld(objects);
  const candidates=compilation.source.pads.filter(p=>{
    if(p.width<4 || p.depth<4 || p.purpose==='building')return false;
    if(/北/.test(evidence)&&p.z>=ground.pos[2] || /南/.test(evidence)&&p.z<=ground.pos[2] || /東/.test(evidence)&&p.x<=ground.pos[0] || /西/.test(evidence)&&p.x>=ground.pos[0])return false;
    return true;
  });
  const builtOn=p=>objects.some(o=>o.role==='building'&&footprintContains(o,p.x,p.z)&&Math.abs(o.pos[1]-o.size[1]/2-p.height)<.2);
  const open=candidates.filter(p=>!builtOn(p));
  // A summit plateau that the request itself builds on is still the named plaza.
  const occupied=!open.length&&/頂上|山頂|頂/.test(evidence)&&candidates.length>0;
  const pads=occupied?candidates:open;
  if(pads.length!==1)return {passed:false,actual:pads.length?'対象の広場が複数あり特定できません':'指定位置に開けた平場がありません'};
  const pad=pads[0],heights=[];
  for(const u of [-.4,0,.4])for(const v of [-.4,0,.4])heights.push(surfaceTop(terrain,pad.x+pad.width*u,pad.z+pad.depth*v));
  const matches=y=>Number.isFinite(y)&&(requirement.comparison==='atLeast'?y>=requirement.value-.02:requirement.comparison==='atMost'?y<=requirement.value+.02:Math.abs(y-requirement.value)<=.02);
  const centre=surfaceTop(terrain,pad.x,pad.z);
  return {passed:heights.every(matches)&&Number.isFinite(centre)&&(occupied||!world.blocked(pad.x,pad.z,centre)&&!world.dangerous(pad.x,pad.z,centre)),actual:{x:pad.x,z:pad.z,heights}};
}
