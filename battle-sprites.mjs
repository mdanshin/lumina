import { MOTION, STILL_POSE } from './battle-animation.mjs';

const SPRITES = {
  spark: [89, 41, 262, 346], blade: [477, 45, 341, 349],
  bulwark: [905, 40, 305, 347], lancer: [48, 428, 344, 364],
  mortar: [422, 495, 407, 266], wing: [856, 453, 376, 296],
  titan: [60, 822, 317, 390], tower: [440, 806, 386, 388], core: [854, 804, 387, 398]
};
export const spriteHeight = kind => ({ mortar: 50, wing: 54, titan: 75, bulwark: 72, tower: 76, core: 122 }[kind] || 70);
const MUZZLES = { spark: [1,.53], blade: [.98,.76], bulwark: [.60,.53], lancer: [1,.40], mortar: [1,.16], wing: [.96,.92], titan: [.70,.58], tower: [1,.34], core: [.50,.26] };
// Polygon masks and joints use coordinates within each original sprite, not new artwork.
// Legs are split again at the knee; weapon pixels are removed from every underlying part.
const RIGS = {
  spark: { hip: [.47,.59], legs: [
    { hip:[.55,.60], knee:[.67,.74], split:.74, poly:[[.48,.57],[.70,.56],[.79,.66],[.70,.79],[.83,.84],[.83,.92],[.59,.93],[.50,.84],[.49,.76],[.38,.66]] },
    { hip:[.37,.57], knee:[.25,.75], split:.75, poly:[[.22,.53],[.49,.55],[.44,.68],[.33,.77],[.22,.95],[.14,1],[0,.98],[0,.88],[.16,.70]] }
  ] },
  blade: { hip: [.39,.61], legs: [
    { hip:[.52,.61], knee:[.52,.75], split:.75, poly:[[.45,.58],[.62,.56],[.62,.69],[.57,.77],[.67,.81],[.64,.89],[.51,.90],[.41,.82],[.41,.70]] },
    { hip:[.32,.64], knee:[.22,.80], split:.80, poly:[[.24,.59],[.45,.60],[.42,.73],[.28,.82],[.22,.98],[.15,1],[.07,.95],[.08,.83]] }
  ], weapon: { pivot:[.28,.52], poly:[[.25,.48],[.38,.48],[1,.74],[1,.81],[.34,.60],[.22,.56]], sword:true } },
  bulwark: { hip: [.36,.59], legs: [
    { hip:[.45,.61], knee:[.52,.75], split:.75, poly:[[.37,.57],[.57,.58],[.62,.75],[.65,.88],[.59,.94],[.43,.92],[.39,.77]] },
    { hip:[.28,.62], knee:[.21,.78], split:.78, poly:[[.19,.55],[.39,.59],[.38,.71],[.28,.82],[.28,.96],[.20,1],[.02,.99],[0,.88],[.10,.77]] }
  ] },
  lancer: { hip: [.34,.56], legs: [
    { hip:[.43,.59], knee:[.49,.78], split:.78, poly:[[.37,.54],[.49,.56],[.53,.70],[.58,.83],[.73,.90],[.73,.96],[.48,.95],[.40,.83],[.32,.68]] },
    { hip:[.29,.59], knee:[.16,.77], split:.77, poly:[[.23,.54],[.38,.58],[.30,.72],[.18,.87],[.14,.98],[.08,1],[0,.98],[0,.89],[.08,.70]] }
  ], weapon: { pivot:[.48,.36], poly:[[.40,.29],[.63,.31],[1,.36],[1,.46],[.59,.43],[.39,.38]] } },
  titan: { hip: [.44,.64], legs: [
    { hip:[.57,.66], knee:[.63,.80], split:.80, poly:[[.48,.62],[.64,.63],[.70,.75],[.70,.81],[.96,.85],[1,.91],[.89,.96],[.62,.93],[.49,.80]] },
    { hip:[.28,.65], knee:[.20,.80], split:.80, poly:[[.17,.58],[.38,.64],[.33,.79],[.27,.91],[.29,.98],[.16,1],[0,1],[0,.88],[.10,.75]] }
  ], weapon: { pivot:[.35,.46], poly:[[.30,.40],[.47,.43],[.70,.52],[.73,.61],[.63,.65],[.40,.55],[.28,.49]] } },
  mortar: { hip:[.44,.61], weapon: { pivot:[.46,.23], poly:[[.40,.10],[.65,.10],[.99,.07],[1,.24],[.63,.30],[.44,.32],[.34,.23]] } },
  wing: { hip:[.50,.54] },
  tower: { hip:[.50,.68], weapon: { pivot:[.55,.36], poly:[[.51,.26],[1,.28],[1,.51],[.55,.44],[.45,.37]] } },
  core: { hip:[.50,.75] }
};
let atlases = null;
const parts = new Map();
export const hasUnitAtlas = () => !!atlases;

function path(context, polygon, width, height) {
  context.beginPath();
  polygon.forEach(([x,y],i) => i ? context.lineTo(x*width,y*height) : context.moveTo(x*width,y*height));
  context.closePath();
}
function layer(source, rect, include, exclude=[]) {
  const [sx,sy,width,height] = rect, canvas = document.createElement('canvas');
  canvas.width=width; canvas.height=height;
  const context=canvas.getContext('2d');
  if(include) { path(context,include,width,height); context.clip(); }
  context.drawImage(source,sx,sy,width,height,0,0,width,height);
  context.globalCompositeOperation='destination-out';
  for(const polygon of exclude) { path(context,polygon,width,height); context.fill(); }
  return canvas;
}
export function setUnitAtlas(atlas) {
  if(!atlas.complete || !atlas.naturalWidth) return;
  const enemy=document.createElement('canvas');
  enemy.width=atlas.naturalWidth; enemy.height=atlas.naturalHeight;
  const context=enemy.getContext('2d');
  context.filter='hue-rotate(165deg) saturate(1.1)'; context.drawImage(atlas,0,0);
  atlases=[atlas,enemy]; parts.clear();
  for(const [kind,rig] of Object.entries(RIGS)) for(let side=0;side<2;side++) {
    const weapon=rig.weapon ? [rig.weapon.poly] : [], legs=rig.legs||[];
    const body=layer(atlases[side],SPRITES[kind],null,[...legs.map(leg=>leg.poly),...weapon]);
    const legParts=legs.map(leg=>({
      upper:layer(atlases[side],SPRITES[kind],leg.poly,[...weapon,[[0,leg.split+.025],[1,leg.split+.025],[1,1],[0,1]]]),
      lower:layer(atlases[side],SPRITES[kind],leg.poly,[...weapon,[[0,0],[1,0],[1,leg.split-.025],[0,leg.split-.025]]])
    }));
    parts.set(`${kind}-${side}`,{body,legs:legParts,weapon:rig.weapon?layer(atlases[side],SPRITES[kind],rig.weapon.poly):null});
  }
}
function point(kind, normalized) {
  const height=spriteHeight(kind),rect=SPRITES[kind],width=height*rect[2]/rect[3];
  return {x:(normalized[0]-.5)*width,y:8-height+normalized[1]*height};
}
function imagePart(context, image, kind) {
  const height=spriteHeight(kind),width=height*SPRITES[kind][2]/SPRITES[kind][3];
  context.drawImage(image,-width/2,8-height,width,height);
}
function hinge(context,pivot,angle,x=0,y=0) {
  context.translate(pivot.x+x,pivot.y+y);context.rotate(angle);context.translate(-pivot.x,-pivot.y);
}
function oval(context,x,y,rx,ry,color) {
  context.fillStyle=color;context.beginPath();context.ellipse(x,y,rx,ry,0,0,Math.PI*2);context.fill();
}
export function drawStaticSprite(context,kind,side,height=spriteHeight(kind)) {
  const [sx,sy,sw,sh]=SPRITES[kind],width=height*sw/sh;
  context.drawImage(atlases[side],sx,sy,sw,sh,-width/2,8-height,width,height);
}
function engines(context,pose,color) {
  for(const position of [[.22,.42],[.76,.25]]) {
    const p=point('wing',position),length=7+pose.engine*19;
    const glow=context.createLinearGradient(p.x-length,p.y,p.x,p.y);
    glow.addColorStop(0,'#71fff200');glow.addColorStop(.65,color);glow.addColorStop(1,'#eefffa');
    context.fillStyle=glow;context.beginPath();context.moveTo(p.x+2,p.y-3);
    context.lineTo(p.x-length,p.y+1);context.lineTo(p.x+2,p.y+4);context.fill();
  }
}
function treads(context,pose) {
  const height=spriteHeight('mortar'),width=height*SPRITES.mortar[2]/SPRITES.mortar[3];
  context.save();context.translate(-width/2,8-height);context.scale(width,height);
  path(context,[[.01,.50],[.16,.47],[.68,.79],[.68,.96],[.55,1],[.06,.73]],1,1);context.clip();
  context.strokeStyle='#c2d7dc99';context.lineWidth=.011;
  const offset=(pose.travel*.08)%1;
  for(let i=-12;i<30;i++) {
    const t=(i+offset)*.064;
    context.beginPath();context.moveTo(t,.40);context.lineTo(t-.15,1.04);context.stroke();
  }
  context.restore();
}
export function muzzlePoint(kind,x,y,scale,pose=STILL_POSE,side=0) {
  const rig=RIGS[kind],muzzle=point(kind,MUZZLES[kind]);
  if(rig.weapon && !rig.weapon.sword) muzzle.x-=pose.kick*3.5;
  const hip=point(kind,rig.hip),dx=muzzle.x-hip.x,dy=muzzle.y-hip.y;
  const mx=hip.x+dx*Math.cos(pose.lean)-dy*Math.sin(pose.lean)-pose.kick*MOTION[kind].recoil;
  const my=hip.y+dx*Math.sin(pose.lean)+dy*Math.cos(pose.lean)+pose.bob+(kind==='wing'?-22+pose.hover:0);
  const facing=pose===STILL_POSE?(side?-1:1):pose.facing;
  return {x:x+mx*scale*facing,y:y+my*scale};
}
export function drawAnimatedSprite(context,kind,side,x,y,scale,pose,palette) {
  const rig=RIGS[kind],cache=parts.get(`${kind}-${side}`),animated=pose!==null;
  pose=pose||{...STILL_POSE,facing:side?-1:1};
  context.save();context.translate(x,y);context.scale(scale,scale);
  oval(context,0,8,kind==='mortar'?31:21,6,'#02091270');
  context.strokeStyle=palette.glow;context.globalAlpha=.5;context.lineWidth=1.2;
  context.beginPath();context.ellipse(0,8,23,7,0,0,Math.PI*2);context.stroke();context.globalAlpha=1;
  if(pose.step>0) {
    context.globalAlpha=pose.step*.3;
    oval(context,-10,10,10+(1-pose.step)*12,3,'#d4cec0');
    oval(context,12,10,9+(1-pose.step)*12,3,'#d4cec0');context.globalAlpha=1;
  }
  context.scale(pose.facing,1);
  if(kind==='wing')context.translate(0,-22+pose.hover);
  if(!animated) { drawStaticSprite(context,kind,side);context.restore();return; }
  for(let i=0;i<(rig.legs?.length||0);i++) {
    const leg=rig.legs[i],isLeft=i===1;
    context.save();
    const hip=point(kind,leg.hip),lift=isLeft?pose.liftLeft:pose.liftRight;
    hinge(context,hip,isLeft?pose.left:pose.right,0,pose.bob);
    context.translate(hip.x,hip.y);context.scale(1,1-lift*.035);context.translate(-hip.x,-hip.y);
    imagePart(context,cache.legs[i].upper,kind);
    hinge(context,point(kind,leg.knee),isLeft?pose.kneeLeft:pose.kneeRight);
    imagePart(context,cache.legs[i].lower,kind);context.restore();
  }
  context.save();hinge(context,point(kind,rig.hip),pose.lean,-pose.kick*MOTION[kind].recoil,pose.bob);
  if(kind==='wing' && pose.engine>0)engines(context,pose,palette.glow);
  imagePart(context,cache.body,kind);
  if(kind==='mortar' && pose.walk>.02)treads(context,pose);
  if(cache.weapon) {
    context.save();
    hinge(context,point(kind,rig.weapon.pivot),rig.weapon.sword?pose.swing:0,rig.weapon.sword?0:-pose.kick*3.5);
    imagePart(context,cache.weapon,kind);context.restore();
  }
  if(pose.flash>0 && kind!=='blade') {
    const muzzle=point(kind,MUZZLES[kind]);
    if(rig.weapon)muzzle.x-=pose.kick*3.5;
    context.globalAlpha=pose.flash;context.shadowColor=palette.glow;context.shadowBlur=12;
    const size=kind==='mortar'||kind==='titan'?15:9;
    context.fillStyle=palette.glow;context.beginPath();context.moveTo(muzzle.x-3,muzzle.y-2);
    context.lineTo(muzzle.x+size,muzzle.y-5);context.lineTo(muzzle.x+size*.55,muzzle.y);
    context.lineTo(muzzle.x+size,muzzle.y+5);context.lineTo(muzzle.x-3,muzzle.y+2);context.fill();
    oval(context,muzzle.x+2,muzzle.y,5,2.5,palette.pale);context.shadowBlur=0;context.globalAlpha=1;
  }
  if(kind==='blade' && pose.attack>=0 && pose.attack<.75) {
    const hand=point(kind,rig.weapon.pivot),angle=pose.swing;
    context.save();context.translate(hand.x,hand.y);context.rotate(angle);
    context.globalAlpha=(1-pose.attack)*.8;context.strokeStyle=palette.glow;context.lineWidth=5;
    context.beginPath();context.arc(0,0,37,-.24,.58);context.stroke();
    context.strokeStyle=palette.pale;context.lineWidth=1.6;context.stroke();context.restore();
  }
  context.restore();context.restore();
}
