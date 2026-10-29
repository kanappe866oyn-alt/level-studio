import { reserveTerrainBuildings } from './terrainBuildingSites.js';
import { sampleTerrainRelief, terrainFlankDetail } from './terrainRelief.js';
import { footprintContains, surfaceTop } from './spatialGeometry.js';
import { expandDesignFeatures, seatFormations } from './designFeatures.js';
// Compact terrain instructions, compiled locally. No template or remote calls.
const number = { type: 'number' };
const record = properties => ({ type: 'object', properties, required: Object.keys(properties) });
const array = items => ({ type: 'array', items });
export const TERRAIN_DESIGN_SCHEMA = record({
  enabled: { type: 'boolean', description: '起伏が必要ならtrue。平面指定ならfalse' },
  baseHeight: number,
  material: { type: 'string', enum: ['grass', 'paving', 'rock', 'setts', 'slate'] },
  surfaceColor: {type:'string',description:'地表の基調色。#から始まる6桁HEX。土台groundの色とは別。'},
  hills: array(record({ x: number, z: number, radius: number, rise: number })),
  ridges: array(record({ radius: number, points: array(record({ x: number, z: number, rise: number })) })),
  pads: array(record({ x: number, z: number, width: number, depth: number, height: number })),
  paths: array(record({ width: number, points: array(record({ x: number, z: number, height: number })) })),
  rivers: array(record({ width: number, points: array(record({ x: number, z: number })) })),
  terraces: array(record({ x: number, z: number, width: number, depth: number, direction: { type: 'string', enum: ['north', 'south', 'east', 'west'] }, levels: number, rise: number, height: number, link: { type: 'string', enum: ['road', 'stairs'], description: '各段のつなぎ方。階段で登る指示ならstairs、坂道ならroad' } })),
  formations: array(record({ x: number, z: number, count: number, height: number, spread: number })),
});
export const TERRAIN_DESIGN_PROMPT = `
【地形を短い設計から構築】stage.terrainDesignを必ず出力する。地面の頂点列は出力しない。
surfaceColorは見える地表の基調色。指示や画像に合わせて#から始まる6桁HEXで指定する。ground.colorは下地の色なので地表の色には使わない。草地の公園なら落ち着いた緑、乾いた土地なら土色など、materialと環境が一致するように設計する。surfaceColorは蛍光色(彩度の高い黄緑等)を避け、落ち着いた自然色にする。背景の木立・下草・地形の岩は生成後に自動配置されるのでobjectsへ出さない。指示で個数・位置・種類が明示された木・岩・植物だけをobjectsへ配置し、道や平場の通行を塞がない。地形だけで景観が完成したと説明しない。
座標は北=-Z、南=+Z、東=+X、西=-X。ground中心からの方角を守る。平場は中心だけでなく幅・奥行の半分を含む全域をground内に収める。padsは独立objectsではないため、その上の物体のsupportIdも__generated_terrainを使う。
起伏のある地面ならenabled=true。baseHeightは基本標高m、hillsは中心x/z・radius(3〜60m)・rise(-12〜12mの基本標高との差)。正は丘、負は谷。最大12個。
ridgesは曲がった尾根・山脈・蛇行する谷を表す折れ線。最大12本、各2〜16点(x,z,rise)、radiusは中心線から裾までの幅3〜60m。riseは基本標高との差-12〜12mで、負なら谷。点ごとに高さを変えられる。丸い丘の羅列で代用せず、入力の方向・曲がり・連続性を反映する。不要なら空配列。丘と尾根は加算され、平場と道がその上を整地する。
padsは建物や広場の水平な平場(x,z,width,depth,height=絶対標高)、最大24個。pathsは坂道の幅(3〜12m)と折れ線points(x,z,height=絶対標高)、最大12経路、各2〜16点。道の縦断勾配は1/3以下。高低差のある平場は道で接続し、端点を平場内部へ入れる。交わる道・平場の標高を一致させる。
丘をノイズで散らさず、指示・画像の地形構成に合わせる。地面範囲はobjectsのgroundの幅・奥行。groundは回転なし。hills/pads/pathsはその範囲内に置く。
構築された地面のIDは__generated_terrain。地上の木・岩・建物・スポーンにはsupportId="__generated_terrain"を付ける。建物の下は実寸全体が収まるpadを用意。建物は道の脇に配置し、道の中心線からモデル半幅＋道の半幅＋0.35m以上離す。敷地の不足は実寸から局所補正するが、道を塞ぐ配置は失敗になる。既存の地上物と同じ座標にlandformの箱を重ねない。
高さの違う平場(pads)は互いに重ねない。隣り合う平場の間には、高低差の3倍以上の長さの坂(paths)を通す余白を空ける（例: 高低差3mなら間隔9m以上）。平場の幅・奥行は、その余白を引いた大きさにする。建物のrotは指示がない限り[0,0,0]（回転させない）にし、建物を置く平場は建物の実寸より1.2m以上大きくする。
【指示の特徴を落とさない】指示で名前・高さ・位置が示された台地・広場・丘・谷・尾根・崖・道は、必ずterrainDesignへ出す。「北の高さ6mの台地」ならgroundの北側にheight=6の平場(幅・奥行8m以上)を置く。地面全体が石畳・舗装・岩盤(平らな広場だけの敷地、岩山など)の指示のときだけ、materialをpaving/setts/rockへ合わせる。街・村・公園・丘のように起伏のある景観では、地面はgrassのままにし、石畳・舗装の広場は、広場の位置と大きさのplatformオブジェクト(薄い箱。上面の高さは平場と同じ)として出す。丘や地形の全体を舗装(paving)にしない。指示にない特徴は足さず、足りない特徴は黙って省かない。
【起伏の強さ】起伏を求められたら、hillsのriseは3〜8m、ridgesのriseは5〜10mを目安にし、1〜2mの小さな起伏だけにしない。谷はriseを-2〜-5mにする。最大の高低差はgroundの幅の1/8〜1/5(64mなら8〜12m)を目安にする。指示に高さ・勾配の数値があればそれを優先する。尾根は2点だけでなく、曲がりや高さの変化を3〜6点で表す。
【参考画像】画像があれば、画像で見える丘・尾根・谷・崖・道の位置・向き・高さの比を、hills/ridges/pads/pathsの座標と高さへ写す。画像の主な色は、蛍光色にせずsurfaceColorへ反映する。
【川】川はriversで指定する。折れ線points(x,z)を2〜8点と幅(3〜14m)。水面と河床は自動で作られ、流れに沿って連続する。橋は別にrole=bridgeのobjectsを岸から岸へまたがせて置く(長辺を川を渡る向きにする)。riversを使わずwaterのboxを置かない。
【段丘】段々の地形(畑・段丘・多段の高台)はterracesで指定する。中心x/z、width(段の幅)、depth(全体の奥行)、direction(north/south/east/west=登っていく向き)、levels(2〜5)、rise(1段の高さ0.8〜4m)、height(最下段の標高)。各段が平らな広場になり、link=roadなら勾配1/3以下の道で、link=stairsなら階段(幅3m)で順につながる(階段で登る指示にはstairsを使う)。depthは、levels×6 + (levels-1)×(rise×3+4)m以上にする(例: 3段・段差1.5mなら約34m)。足りなければ自動で伸ばすが、地面に収まらなければ作れない。
【岩の群れ】岩の塔・岩壁・ビュートはformationsで指定する。中心x/z、count(1〜8)、height(4〜26m)、spread(横の広がり0〜30m)。地面の内側に収める。
参考画像に川・橋・階段・崖や岩の塔・段丘や高台があれば、rivers/terraces/formationsと、橋・階段のobjectsで、それぞれ表す。画像の主要な特徴を黙って省かない。
橋・屋上・階段は別objectsで設計し、橋の下の道をpathsで通す。pathsは地表の道であり、橋・トンネルをheightfieldへ押し込めない。階段の上下は水平platformを用意しstairFrom/stairToで接続(台地へ登る階段は、台地と同じ位置・高さの薄いplatformをstairToにし、階段の足元に平らな場所を残す)。歩かせない背景の岩壁や崖はformationsで表し、landformにしない。小さな柱・門柱・石柱はrole=cover(variant=2、約1.2×2.5m)で置く。role=towerは7〜20mの塔で、実寸が固定。
平面のみの要求ならenabled=false、hills/pads/pathsは空配列。起伏を必要としない指示に強制追加しない。配色・建物・経路の構成は入力から設計し、既成のステージで代替しない。
`;
// Neon greens (e.g. #7CFC00) read as plastic in a landscape. Only saturated
// grass greens are pulled toward a natural tone; every other colour is kept.
function naturalGrassColor(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return hex;
  const sat = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  if (sat <= 0.55 || h < 60 || h > 180) return hex;
  const s2 = 0.36, l2 = Math.max(0.3, Math.min(0.46, l)), c = (1 - Math.abs(2 * l2 - 1)) * s2, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l2 - c / 2;
  const [r2, g2, b2] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c]][Math.min(3, Math.floor(h / 60))];
  return '#' + [r2 + m, g2 + m, b2 + m].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
const fail = message => { throw new Error('地形設計: ' + message); };
const finite = (v, min, max, name) => { if (!Number.isFinite(v) || v < min || v > max) fail(name + 'が範囲外です'); return v; };
const smooth = v => { const t=Math.max(0,Math.min(1,v)); return t*t*(3-2*t); };
const distanceToSegment = (x,z,a,b) => {
  const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l));
  return { distance:Math.hypot(x-a.x-t*dx,z-a.z-t*dz), height:a.height+(b.height-a.height)*t };
};
export function compileTerrainDesign(input) {
  // Rivers, terraces and rock groups stated in the design are built into pads, a road and objects first (a no-op once done).
  const built=expandDesignFeatures(input);
  const draft=built.draft;
  const design=draft?.terrainDesign ? structuredClone(draft.terrainDesign) : null;
  if (!design || design.enabled === false) return draft;
  if (design.enabled !== true) fail('enabledが不正です');
  const objects=structuredClone(draft.objects);
  const grounds=objects?.filter(o=>o.role==='ground');
  if (grounds?.length!==1) fail('groundが1個必要です');
  const ground=grounds[0];
  // A missing HEX prefix is a lossless syntax repair, not a palette change.
  for(const object of objects)for(const key of ['color','color2','color3'])if(/^[0-9a-f]{6}$/i.test(object[key] || ''))object[key]='#'+object[key];
  if (objects.some(o=>o.id==='__generated_terrain')) fail('予約ID __generated_terrain をobjectsに含めないでください');
  if (!ground.pos?.every(Number.isFinite) || !ground.size?.every(Number.isFinite) || ground.rot?.some(v=>v!==0)) fail('groundの位置・大きさ・回転を確認してください');
  const [width,,depth]=ground.size;
  finite(width,4,120,'地面幅'); finite(depth,4,120,'地面奥行');
  finite(design.baseHeight,-5,20,'基本標高');
  if (!['grass','paving','rock','setts','slate'].includes(design.material)) fail('素材が不正です');
  if(design.surfaceColor!==undefined&&!/^#[0-9a-f]{6}$/i.test(design.surfaceColor))fail('地表色は#から始まる6桁HEXで指定してください');
  for (const [key,max] of [['hills',12],['pads',24],['paths',12]]) if (!Array.isArray(design[key]) || design[key].length>max) fail(key+'の数が範囲外です');
  design.ridges ??= [];
  if(!Array.isArray(design.ridges)||design.ridges.length>12)fail('尾根・谷は12本以内です');
  const point=(p,margin=0)=>{
    finite(p.x,ground.pos[0]-width/2+margin,ground.pos[0]+width/2-margin,'X');
    finite(p.z,ground.pos[2]-depth/2+margin,ground.pos[2]+depth/2-margin,'Z');
  };
  for(const h of design.hills){point(h);finite(h.radius,3,60,'丘の半径');finite(h.rise,-12,12,'丘・谷の高低差');}
  for(const ridge of design.ridges){
    finite(ridge.radius,3,60,'尾根・谷の半幅');
    if(!Array.isArray(ridge.points)||ridge.points.length<2||ridge.points.length>16)fail('尾根・谷の点は2〜16個です');
    ridge.points.forEach((p,i)=>{point(p);finite(p.rise,-12,12,'尾根・谷の高低差');if(i && Math.hypot(p.x-ridge.points[i-1].x,p.z-ridge.points[i-1].z)<.5)fail('尾根・谷の連続点は0.5m以上離してください');});
  }
  for(const p of design.pads){finite(p.width,2,width,'平場幅');finite(p.depth,2,depth,'平場奥行');point(p);finite(p.height,-5,24,'平場標高');
    point({x:p.x-p.width/2,z:p.z-p.depth/2});point({x:p.x+p.width/2,z:p.z+p.depth/2});}
  const buildingSites=reserveTerrainBuildings(design,objects,ground);
  design.pads=buildingSites.pads;
  const segments=[], gradeAdjustments=[];
  for(const path of design.paths){const firstSegment=segments.length;finite(path.width,3,12,'道幅');if(!Array.isArray(path.points)||path.points.length<2||path.points.length>16)fail('道の点は2〜16個です');
    path.points.forEach(p=>{point(p,path.width/2);finite(p.height,-5,24,'道の標高');});
    // A point inside a flat site shares that site's surface. Keep the authored
    // site elevation and record the derived road endpoint instead of two floors.
    path.points.forEach((q,pointIndex)=>{
      const pads=design.pads.filter(p=>Math.abs(q.x-p.x)<=p.width/2&&Math.abs(q.z-p.z)<=p.depth/2);
      if(pads.some(p=>Math.abs(p.height-pads[0].height)>.01))fail('接続先の平場の標高が矛盾しています');
      if(pads.length&&Math.abs(q.height-pads[0].height)>.01){
        gradeAdjustments.push({pathIndex:design.paths.indexOf(path),pointIndex,reason:'接続する平場の標高を保持して道の接続点を一致',fromHeight:q.height,toHeight:pads[0].height});
        q.height=pads[0].height;
      }
    });
    for(let i=1;i<path.points.length;i++){let a={...path.points[i-1]},b={...path.points[i]};
      const leavePad=(start,end)=>{
        let fraction=0;
        for(const p of design.pads){
          if(Math.abs(start.x-p.x)>p.width/2 || Math.abs(start.z-p.z)>p.depth/2)continue;
          if(Math.abs(start.height-p.height)>.01)fail('道の端点と平場の標高が一致しません');
          const dx=end.x-start.x,dz=end.z-start.z;
          const tx=dx===0?Infinity:((p.x+Math.sign(dx)*(p.width/2+.8))-start.x)/dx;
          const tz=dz===0?Infinity:((p.z+Math.sign(dz)*(p.depth/2+.8))-start.z)/dz;
          fraction=Math.max(fraction,Math.min(tx,tz));
        }
        return {...start,x:start.x+(end.x-start.x)*Math.min(1,fraction),z:start.z+(end.z-start.z)*Math.min(1,fraction)};
      };
      const originalA=a; a=leavePad(a,b);b=leavePad(b,originalA);
      const length=Math.hypot(b.x-a.x,b.z-a.z);
      if(length<.5)fail(`道${design.paths.indexOf(path)+1}の点${i}→${i+1}(${path.points[i-1].x}, ${path.points[i-1].z})→(${path.points[i].x}, ${path.points[i].z})は、平場の縁の外側に残る道が${length.toFixed(2)}mで0.5m未満です。平場に近すぎる点を取り除くか、離してください`);
      segments.push({a,b,width:path.width,pathIndex:design.paths.indexOf(path)});}
    const parts=segments.slice(firstSegment),lengths=parts.map(s=>Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z));
    if(parts.some((s,i)=>Math.abs(s.b.height-s.a.height)>lengths[i]/3+1e-6)){
      const anchors=[0,...path.points.slice(1,-1).flatMap((q,i)=>design.pads.some(p=>Math.abs(q.x-p.x)<=p.width/2&&Math.abs(q.z-p.z)<=p.depth/2)?[i+1]:[]),parts.length];
      const groups=anchors.slice(1).map((end,i)=>{const start=anchors[i];return {start,end,total:lengths.slice(start,end).reduce((a,b)=>a+b,0),low:parts[start].a.height,high:parts[end-1].b.height};});
      if(groups.some(g=>Math.abs(g.high-g.low)>g.total/3+1e-6)){
        const steep=parts.map((s,i)=>({s,length:lengths[i]})).filter(({s,length})=>Math.abs(s.b.height-s.a.height)>length/3+1e-6);
        fail('平場の高さを保ったまま坂の勾配を1/3以下にできません。'+steep.map(({s,length})=>`道${design.paths.indexOf(path)+1}: (${s.a.x.toFixed(1)},${s.a.z.toFixed(1)})標高${s.a.height.toFixed(1)}m→(${s.b.x.toFixed(1)},${s.b.z.toFixed(1)})標高${s.b.height.toFixed(1)}m、有効長${length.toFixed(1)}mに対し必要長${(Math.abs(s.b.height-s.a.height)*3).toFixed(1)}m`).join('。')+'。元の指示に高さ指定がない平場は接続する谷・道に近い標高に設計するか、坂の経路を長くしてください。');
      }
      for(const {start,end,total,low,high} of groups){
        let travelled=0;
        for(let i=start;i<end;i++){const part=parts[i];part.a.height=low+(high-low)*travelled/total;travelled+=lengths[i];part.b.height=low+(high-low)*travelled/total;}
      }
      gradeAdjustments.push({pathIndex:design.paths.indexOf(path),reason:'平場の高さと道の平面経路を保持し、中継点の標高を坂の有効長に沿って再計算',points:parts.map(s=>({from:s.a,to:s.b}))});
    }
  }
  // One-metre-or-finer triangles. Smooth shoulders extend beyond the protected
  // walking width so interpolation cannot narrow the authored path.
  const reliefSeed=Math.round(Math.abs(Math.sin(width*12.9898+depth*78.233+design.hills.length*3.1+(design.ridges?.length||0)*5.7+design.pads.length*1.3+design.paths.length*2.9))*65535);
  const columns=Math.ceil(width)+1,rows=Math.ceil(depth)+1, heights=[], pathWeights=[];
  const waters=objects.filter(o=>o.role==='water'&&o.type!=='spline'&&Array.isArray(o.pos)&&Array.isArray(o.size)&&[...o.pos,...o.size].every(Number.isFinite)&&!o.customModelUrl&&(o.rot||[0,0,0]).every((v,i)=>i===1||!v));
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const x=ground.pos[0]-width/2+width*col/(columns-1),z=ground.pos[2]-depth/2+depth*row/(rows-1);
    let y=sampleTerrainRelief(design,x,z)+terrainFlankDetail(design,x,z,reliefSeed);
    const constraints=[];
    for(const [padIndex,p] of design.pads.entries()){const d=Math.hypot(Math.max(0,Math.abs(x-p.x)-p.width/2),Math.max(0,Math.abs(z-p.z)-p.depth/2));constraints.push({height:p.height,weight:1-smooth((d-.8)/3),label:`平場${padIndex+1}`});}
    let pathWeight=0;
    for(let pathIndex=0;pathIndex<design.paths.length;pathIndex++){
      const nearest=segments.filter(s=>s.pathIndex===pathIndex).map(s=>({...distanceToSegment(x,z,s.a,s.b),width:s.width})).sort((a,b)=>a.distance-b.distance)[0];
      if(nearest){constraints.push({height:nearest.height,weight:1-smooth((nearest.distance-nearest.width/2-.8)/3),label:`道${pathIndex+1}`});pathWeight=Math.max(pathWeight,1-smooth((nearest.distance-nearest.width/2+.5)/1));}
    }
    const hard=constraints.filter(p=>p.weight>=1-1e-8);
    if(hard.length && Math.max(...hard.map(p=>p.height))-Math.min(...hard.map(p=>p.height))>.35)fail(`交差する道・平場の標高が一致しません。(${x.toFixed(1)}, ${z.toFixed(1)})付近で、${[...new Map(hard.map(c=>[c.label,c])).values()].map(c=>`${c.label}=${c.height.toFixed(1)}m`).join(' と ')}が重なっています。高さの違う平場どうしを2m以上離す、または道を平場の高さへ滑らかにつないでください。`);
    const active=hard.length?hard:constraints.filter(p=>p.weight>0);
    if(active.length){const weight=Math.max(...active.map(p=>p.weight)),target=active.reduce((s,p)=>s+p.height*p.weight,0)/active.reduce((s,p)=>s+p.weight,0);y+=(target-y)*weight;}
    // A river the model placed is a channel, not a surface laid over whatever the relief and the
    // flat ground around a road end left there: the bed is cut below the water, with banks that
    // rise gently over about 4 m, a sloping shore rather than a canal wall (2 m where a road or plaza holds the ground). A road or a plaza keeps its own height where the ground is held flat for it (a ford stays a ford); only the rest is cut.
    if(waters.length&&!constraints.some(c=>c.weight>=1-1e-8))for(const w of waters){
      const top=w.pos[1]+w.size[1]/2;
      const free=!constraints.some(c=>c.weight>.01);
      const allowed=footprintContains(w,x,z)?top-.9:free?(footprintContains(w,x,z,-1)?top+.12:footprintContains(w,x,z,-2.5)?top+.5:footprintContains(w,x,z,-4)?top+1:Infinity):footprintContains(w,x,z,-1)?top+.15:footprintContains(w,x,z,-2)?top+.9:Infinity;
      if(y>allowed)y=Math.max(-7.9,allowed);
    }
    finite(y,-8,35,'合成地形の標高'); heights.push(y);pathWeights.push(pathWeight);
  }
  const min=Math.min(...heights),max=Math.max(...heights),bottom=min-.5,height=max-bottom;
  ground.pos[1]=bottom-ground.size[1]/2; delete ground.surfaceY;
  const terrain={id:'__generated_terrain',name:'入力から構築した地形',role:'landform',type:'box',pos:[ground.pos[0],bottom+height/2,ground.pos[2]],size:[width,height,depth],rot:[0,0,0],variant:1,material:0,color:ground.color||'#81916c',terrainProfile:{seed:reliefSeed,relief:0,edgeRoughness:0,surfaceMaterial:design.material,sideMaterial:'rock',surfaceMapping:'world',...(design.material==='grass'?{surfaceBlend:'slope'}:{}),surfaceGrid:{columns,rows,heights:heights.map(y=>(y-bottom)/height)}}};
  terrain.color=design.surfaceColor || {grass:'#81916c',paving:'#b1a28b',rock:'#82786b',setts:'#a49b89',slate:'#737f84'}[design.material];
  let colorAdjustment=null;
  if(design.material==='grass'&&design.surfaceColor){const natural=naturalGrassColor(design.surfaceColor);if(natural!==design.surfaceColor.toLowerCase()){colorAdjustment={from:design.surfaceColor,to:natural,reason:'彩度の高い蛍光色の草地を自然な緑へ補正'};terrain.color=natural;}}
  if(design.material==='grass'&&design.paths.length)terrain.terrainProfile.surfaceGrid.pathWeights=pathWeights;
  return {...draft,objects:[ground,terrain,...seatFormations(objects.filter(o=>o!==ground),terrain,surfaceTop)],terrainCompilation:{version:1,...(built.changes.length||draft.designFeatureUnbuilt?.length?{features:{built:built.changes,unbuilt:draft.designFeatureUnbuilt||[]}}:{}),columns,rows,minHeight:min,maxHeight:max,gradeAdjustments,...(colorAdjustment?{colorAdjustment}:{}),buildingSites:buildingSites.reservations,source:structuredClone(draft.terrainDesign)}};
}
