const smooth = v => { const t=Math.max(0,Math.min(1,v)); return t*t*(3-2*t); };

// Crest height stays exactly the authored rise and the foot ends at the authored
// radius. A positive rise gets a sharper crest and a wider foot instead of a
// round tube; a valley keeps its smooth floor.
function profile(t,rise,sharp) {
  const s=smooth(1-t);
  return rise>0 ? ((1-sharp)*s+sharp*Math.pow(Math.max(0,1-t),2.4)) : s;
}

// Shared by meshing and building-site reservation. Each polyline contributes
// once, so a bend or an extra control point cannot double the ridge height.
export function sampleTerrainRelief(design,x,z) {
  let height=design.baseHeight;
  for(const h of design.hills) height+=h.rise*profile(Math.hypot(x-h.x,z-h.z)/h.radius,h.rise,0.2);
  for(const ridge of design.ridges || []) {
    let nearest=null;
    for(let i=1;i<ridge.points.length;i++) {
      const a=ridge.points[i-1],b=ridge.points[i],dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
      const distance=Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
      if(!nearest || distance<nearest.distance) nearest={distance,rise:a.rise+(b.rise-a.rise)*t};
    }
    if(nearest) height+=nearest.rise*profile(nearest.distance/ridge.radius,nearest.rise,0.45);
  }
  return height;
}

const hash=(i,j,seed)=>{let n=Math.imul(i,374761393)^Math.imul(j,668265263)^Math.imul(seed,2147483647);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
const valueNoise=(x,z,seed)=>{
  const i=Math.floor(x),j=Math.floor(z),u=smooth(x-i),v=smooth(z-j);
  const a=hash(i,j,seed),b=hash(i+1,j,seed),c=hash(i,j+1,seed),d=hash(i+1,j+1,seed);
  return (a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v)*2-1;
};

// Strength of the authored relief at a point, 0 outside every hill/ridge and 1
// on a crest. Used so roughness only appears on the flanks.
function influence(design,x,z) {
  let w=0;
  for(const h of design.hills) w=Math.max(w,smooth(1-Math.hypot(x-h.x,z-h.z)/h.radius));
  for(const ridge of design.ridges || []) for(let i=1;i<ridge.points.length;i++) {
    const a=ridge.points[i-1],b=ridge.points[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    w=Math.max(w,smooth(1-Math.hypot(x-a.x-t*dx,z-a.z-t*dz)/ridge.radius));
  }
  return w;
}

// Erosion-like roughness for mountain flanks. Zero on crests, valley floors
// and outside the authored radius, so every authored height is still exact.
export function terrainFlankDetail(design,x,z,seed) {
  const w=influence(design,x,z), mask=4*w*(1-w);
  if(mask<=0) return 0;
  const rises=[...design.hills.map(h=>Math.abs(h.rise)),...(design.ridges||[]).flatMap(r=>r.points.map(p=>Math.abs(p.rise)))];
  const amplitude=Math.max(0.15,Math.min(1.2,0.1*Math.max(0,...rises)));
  const n=valueNoise(x/14,z/14,seed)*0.55+valueNoise(x/6.5,z/6.5,seed+1)*0.3+valueNoise(x/3,z/3,seed+2)*0.15;
  return n*amplitude*mask;
}
