import { createSpatialWorld, surfaceTop } from './spatialGeometry.js';
import { advanceWalker } from './walkingPhysics.js';

// Validate the authored route itself, rather than only one point on the large
// terrain mesh. No temporary gameplay objects are added to the saved scene.
export function inspectTerrainRoutes(objects, compilation) {
  const terrain=objects.find(o=>o.id==='__generated_terrain');
  const paths=compilation?.source?.paths;
  if(!terrain || !Array.isArray(paths))return {checked:0,issues:[]};
  const world=createSpatialWorld(objects),issues=[];
  const clear=(x,z)=>{const y=surfaceTop(terrain,x,z);return Number.isFinite(y)&&!world.blocked(x,z,y)&&!world.dangerous(x,z,y);};
  for(let index=0;index<paths.length;index++){
    const path=paths[index];let problem=false;
    for(let i=1;i<path.points.length&&!problem;i++){
      const a=path.points[i-1],b=path.points[i],length=Math.hypot(b.x-a.x,b.z-a.z);
      const count=Math.max(1,Math.ceil(length/.5)),nx=-(b.z-a.z)/length,nz=(b.x-a.x)/length;
      for(let n=0;n<=count&&!problem;n++)for(const side of [-1,0,1]){
        const offset=side*Math.max(0,path.width/2-.45),x=a.x+(b.x-a.x)*n/count+nx*offset,z=a.z+(b.z-a.z)*n/count+nz*offset;
        if(!clear(x,z)){problem=true;break;}
      }
    }
    for(const points of [path.points,[...path.points].reverse()]){
      if(problem)break;
      let state={x:points[0].x,z:points[0].z,y:surfaceTop(terrain,points[0].x,points[0].z),vy:0};
      for(let i=1;i<points.length&&!problem;i++){
        const a=points[i-1],b=points[i],count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.08));
        for(let n=0;n<count;n++){
          state=advanceWalker(world,state,(b.x-a.x)/count,(b.z-a.z)/count,.016);
          const x=a.x+(b.x-a.x)*(n+1)/count,z=a.z+(b.z-a.z)*(n+1)/count;
          if(Math.hypot(state.x-x,state.z-z)>.18 || Math.abs(state.y-surfaceTop(terrain,x,z))>.65){problem=true;break;}
        }
      }
    }
    if(problem)issues.push(`地形の道${index+1}: 指定幅の閉塞、段差、または往復歩行できない箇所があります。道と障害物・坂の接続を修正してください。`);
  }
  return {checked:paths.length,issues};
}
