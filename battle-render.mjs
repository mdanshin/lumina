import { UNITS, SPELLS } from './battle-engine.mjs?v=animation-20260908';
import { GEM_COLORS } from './engine.mjs';
import { battleCamera } from './battle-view.mjs';

import { createBattleAnimator, MOTION } from './battle-animation.mjs';
import { hasUnitAtlas, spriteHeight, drawAnimatedSprite, muzzlePoint } from './battle-sprites.mjs';
export { setUnitAtlas } from './battle-sprites.mjs';

const colors = side => side ? { glow: '#ff736d', pale: '#f6c1a9', armor: '#806a68', light: '#c5b1a0', shade: '#473e42' } : { glow: '#92edc4', pale: '#f3f6d5', armor: '#6d9289', light: '#c7dace', shade: '#384e4e' };
function polygon(c, points, fill, stroke) { c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); if(fill){c.fillStyle=fill;c.fill();} if(stroke){c.strokeStyle=stroke;c.lineWidth=.8;c.stroke();} }
function ellipse(c,x,y,rx,ry,fill) { c.beginPath(); c.ellipse(x,y,rx,ry,0,0,Math.PI*2); c.fillStyle=fill;c.fill(); }
function line(c,x,y,tx,ty,color,width=2) { c.beginPath(); c.moveTo(x,y);c.lineTo(tx,ty);c.strokeStyle=color;c.lineWidth=width;c.stroke(); }
function box(c,x,y,w,h,d,p) {
  polygon(c,[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],p.armor,'#142b2a');
  polygon(c,[[x,y],[x+d,y-d],[x+w+d,y-d],[x+w,y]],p.light,'#24433b');
  polygon(c,[[x+w,y],[x+w+d,y-d],[x+w+d,y+h-d],[x+w,y+h]],p.shade,'#1e3631');
}
export function drawUnit(c, kind, side, x, y, scale=1, time=0, moving=false, firing=false, pose=null) {
  if (hasUnitAtlas()) {
    drawAnimatedSprite(c, kind, side, x, y, scale, pose, colors(side));
    return;
  }
  if (pose) { time=pose.phase/12; moving=pose.walk>.02; firing=pose.flash>0; }
  const p=colors(side), flying=kind==='wing';
  c.save(); c.translate(x,y); c.scale(scale,scale);
  ellipse(c,0,8,kind==='titan'?28:kind==='mortar'?26:19,6,'#03161555');
  if(flying) c.translate(0,-22-Math.sin(time*3)*2);
  else if(moving) c.translate(0,Math.sin(time*11+x)*1.2);
  c.scale(side ? -1 : 1,1);
  if(kind==='mortar') {
    box(c,-24,-2,43,11,7,{...p,armor:'#344642',light:'#648075',shade:'#1d2c2b'});
    for(let n=0;n<7;n++){line(c,-22+n*6,1,-22+n*6,8,'#78948b',2);line(c,-19+n*6,-17,-19+n*6,-11,'#45665b',3);}
    box(c,-17,-16,30,14,9,p);box(c,-9,-25,20,10,6,p);
    box(c,8,-25,34,5,4,{...p,light:p.pale});line(c,39,-24,46,-24,'#203431',5);
    line(c,-10,-14,2,-14,p.glow,3);
  } else if(kind==='wing') {
    polygon(c,[[-30,-3],[-12,-28],[7,-16],[27,-6],[7,1],[-17,10]],p.shade,'#233e39');
    polygon(c,[[-31,-6],[-13,-29],[5,-17],[-3,-9]],p.light,'#173735');
    polygon(c,[[-26,13],[-7,-3],[12,-2],[-3,18]],p.armor,'#173735');
    polygon(c,[[-17,-10],[6,-16],[29,-6],[6,4],[-15,0]],p.light,'#173735');
    polygon(c,[[-3,-11],[10,-10],[17,-6],[3,-3]],p.glow);
    c.shadowColor=p.glow;c.shadowBlur=10;line(c,-26,-5,-38-Math.sin(time*15)*5,-4,p.glow,4);line(c,-19,11,-33,13,p.glow,3);c.shadowBlur=0;
    line(c,14,-12,30,-12,p.shade,3);line(c,14,0,30,0,p.shade,3);
  } else if(kind==='titan') {
    const stride=moving?Math.sin(time*8)*5:0;
    box(c,-19,-2,13,14+stride,5,{...p,light:p.armor});box(c,7,-5,13,17-stride,5,{...p,light:p.armor});
    box(c,-22,9+stride,18,7,6,p);box(c,6,8-stride,18,7,6,p);
    box(c,-22,-32,39,30,10,p);box(c,-7,-42,22,12,5,p);
    box(c,-32,-30,15,23,5,p);box(c,14,-32,16,20,6,p);
    box(c,28,-25,19,8,4,{...p,light:p.pale});line(c,40,-27,48,-27,'#243e38',7);
    line(c,-3,-35,14,-35,p.glow,4);line(c,-13,-22,8,-22,p.glow,3);line(c,-13,-17,8,-17,p.glow,2);
  } else if(kind==='bulwark') {
    box(c,-14,-3,10,14,4,p);box(c,6,-4,10,14,4,p);
    box(c,-17,-26,30,26,8,p);box(c,-8,-37,20,13,5,p);
    box(c,-25,-26,14,27,5,{...p,armor:p.light,light:p.pale});box(c,13,-22,20,9,4,p);
    line(c,-18,-19,-18,-3,p.glow,3);line(c,-4,-30,12,-30,p.glow,3);
  } else {
    const stride=moving?Math.sin(time*13)*6:0;
    line(c,-7,-6,-10+stride,10,p.shade,7);line(c,5,-6,9-stride,9,p.shade,7);
    box(c,-15+stride,7,10,5,3,p);box(c,5-stride,6,10,5,3,p);
    box(c,-10,-27,19,20,6,p);box(c,-7,-39,17,13,4,p);
    box(c,-18,-27,10,10,3,p);box(c,11,-27,10,10,3,p);
    line(c,-4,-32,10,-32,p.glow,3);
    if(kind==='blade') { line(c,14,-18,33,-41,'#425f54',7);line(c,16,-20,35,-44,p.pale,3);line(c,18,-21,36,-43,p.glow,1.5);polygon(c,[[-18,-17],[-27,-12],[-25,3],[-15,-2]],p.light,p.shade); }
    else {const length=kind==='lancer'?40:28;box(c,8,-21,length-8,5,3,p);line(c,length-2,-22,length+5,-22,p.shade,4);if(kind==='lancer'){box(c,17,-27,11,4,2,p);line(c,19,-26,24,-26,p.glow,2);}}
  }
  if(firing) { c.shadowColor=p.glow;c.shadowBlur=15;ellipse(c,kind==='mortar'?47:kind==='titan'?49:34,-22,8,4,p.pale);c.shadowBlur=0; }
  c.restore();
}
function drawShot(c,event,time,pose) {
  const age=time-event.start,profile=MOTION[event.unit],flight=profile.flight;
  const palette=colors(event.side),heavy=['mortar','titan'].includes(event.unit);
  if(!event.origin) {
    const scale=UNITS[event.unit] ? UNITS[event.unit].size/16*(hasUnitAtlas()?1.2:1) : 1;
    const aim={...pose,facing:event.tx<event.x?-1:1};
    event.origin=hasUnitAtlas()?muzzlePoint(event.unit,event.x,event.y,scale,aim,event.side):{x:event.x,y:event.y-(event.air?32:22)*scale};
    const target=UNITS[event.targetKind],targetScale=target?target.size/16*(hasUnitAtlas()?1.2:1):1;
    event.hit={x:event.tx,y:event.ty-((event.targetAir?22:0)+spriteHeight(event.targetKind||'spark')*.48)*targetScale};
  }
  const origin=event.origin,hit=event.hit;
  c.globalAlpha=1;
  if(age<flight) {
    const t=age/flight;
    if(event.unit==='blade') {
      c.globalAlpha=1-t;c.strokeStyle=palette.pale;c.lineWidth=2.5;
      c.beginPath();c.arc(hit.x,hit.y,8+t*13,-1.1,.8);c.stroke();
    } else if(['lancer','core'].includes(event.unit)) {
      c.globalAlpha=1-t*.8;
      line(c,origin.x,origin.y,hit.x,hit.y,palette.glow,event.unit==='lancer'?3:2);
      line(c,origin.x,origin.y,hit.x,hit.y,palette.pale,1);
    } else {
      const trajectory=p=>({x:origin.x+(hit.x-origin.x)*p,y:origin.y+(hit.y-origin.y)*p-(event.unit==='mortar'?Math.sin(p*Math.PI)*34:0)});
      const head=trajectory(t),tail=trajectory(Math.max(0,t-.16));
      for(const offset of event.unit==='wing'?[-2.5,2.5]:[0]) {
        line(c,tail.x,tail.y+offset,head.x,head.y+offset,palette.glow,heavy?3:1.8);
        ellipse(c,head.x,head.y+offset,heavy?3:2,heavy?2.5:1.5,palette.pale);
      }
    }
  } else {
    const p=Math.min(1,(age-flight)/.24),radius=heavy?22:10;
    c.globalAlpha=1-p;
    ellipse(c,hit.x,hit.y,Math.max(.1,(1-p)*(heavy?9:4)),Math.max(.1,(1-p)*4),palette.pale);
    c.strokeStyle=palette.glow;c.lineWidth=heavy?2:1;
    c.beginPath();c.ellipse(hit.x,hit.y,3+p*radius,2+p*radius*.55,0,0,Math.PI*2);c.stroke();
    for(let i=0;i<(heavy?7:4);i++) {
      const angle=i*2.4+event.id;
      const x=hit.x+Math.cos(angle)*p*radius,y=hit.y+Math.sin(angle)*p*radius*.6;
      line(c,x,y,x+Math.cos(angle)*3,y+Math.sin(angle)*3,palette.pale,1.2);
    }
  }
  if(heavy && age<.35) {
    c.globalAlpha=(1-age/.35)*.3;
    ellipse(c,origin.x,origin.y-age*22,3+age*13,2+age*8,'#cbd4da');
  }
}

function health(c,x,y,hp,max,width,side) {
  c.fillStyle='#132621db';c.fillRect(x-width/2-1,y-1,width+2,5);
  c.fillStyle=hp/max<.25?'#ffb276':colors(side).glow;c.fillRect(x-width/2,y,width*Math.max(0,hp/max),3);
}
function structure(c,b,time,pose) {
  const p=colors(b.side),x=b.x,y=b.y,core=b.kind==='core';
  c.save();c.translate(x,y);
  if(b.hp<=0){ellipse(c,0,3,core?58:27,core?24:13,'#15252280');for(let i=0;i<7;i++)box(c,-25+i*7,Math.sin(i*14)*9,6+i%3*3,5,3,{...p,light:'#4b5f55',armor:'#334339'});c.restore();return;}
  if (hasUnitAtlas()) {
    ellipse(c,0,10,core?60:36,core?19:12,'#03101a70');
    drawAnimatedSprite(c,b.kind,b.side,0,0,1,pose,p);
    if (core) {
      c.strokeStyle=p.glow; c.lineWidth=1.5; c.globalAlpha=.7;
      c.beginPath(); c.ellipse(0,-13,37,12,0,time%6,time%6+Math.PI*1.5); c.stroke();
    }
    c.restore();
    health(c,x,y+(core?24:19),b.hp,b.maxHP,core?76:44,b.side);
    return;
  }
  ellipse(c,0,9,core?62:30,core?24:13,'#0c1e2180');
  if(core){
    polygon(c,[[-56,8],[-35,-18],[20,-27],[56,-8],[48,20],[0,34]],p.shade,'#b8c9b7');
    polygon(c,[[-56,4],[-35,-22],[20,-31],[56,-12],[48,16],[0,30]],p.armor,'#d7e1c6');
    for(let i=0;i<4;i++){const a=i*Math.PI/2+.3;box(c,Math.cos(a)*37-9,Math.sin(a)*16-18,17,22,7,p);}
    box(c,-22,-40,39,45,14,p);
    polygon(c,[[-14,-34],[2,-72],[20,-33],[2,-15]],p.glow,p.pale);
    polygon(c,[[-14,-34],[2,-72],[2,-15]],p.pale);
    c.shadowBlur=18;c.shadowColor=p.glow;line(c,-15,-12,18,-12,p.glow,3);c.shadowBlur=0;
    c.strokeStyle=p.glow;c.lineWidth=1.1;c.beginPath();c.ellipse(0,-2,43,17,0,time%6, time%6+Math.PI*1.5);c.stroke();
  }else{
    polygon(c,[[-25,8],[-12,-6],[17,-8],[30,3],[16,16],[-11,18]],p.armor,p.light);
    box(c,-12,-24,22,29,8,p);box(c,-17,-35,27,13,10,p);
    c.save();c.scale(b.side?-1:1,1);box(c,3,-35,30,6,5,p);line(c,29,-35,38,-35,p.shade,6);c.restore();
    line(c,-9,-17,9,-17,p.glow,3);
  }
  c.restore();health(c,x,y-(core?83:49),b.hp,b.maxHP,core?72:39,b.side);
}
export function makeRenderer(field,puzzle,atlas,terrain) {
  const f=field.getContext('2d'),g=puzzle.getContext('2d');
  let effects=[],sparks=[];
  const animator=createBattleAnimator();
  function resize(){for(const canvas of [field,puzzle]){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);const w=Math.round(r.width*d),h=Math.round(r.height*d);if(w>0&&h>0&&(w!==canvas.width||h!==canvas.height)){canvas.width=w;canvas.height=h;}}}
  const observer=new ResizeObserver(resize);observer.observe(field);observer.observe(puzzle);resize();
  function ingest(events,time,motion) {
    animator.ingest(events,time,motion);
    for(const e of events){
      if(motion&&['shot','spawn','destroy','storm','heal','stasis'].includes(e.kind)) effects.push({...e,start:time,life:e.kind==='shot'?(MOTION[e.unit]?.flight||.2)+.24:e.kind==='spawn'?.65:e.kind==='destroy'?1:e.kind==='stasis'?1.3:1.1});
      if(e.kind==='shatter'&&motion)e.indices.forEach((i,n)=>{for(let j=0;j<6;j++)sparks.push({x:i%8*80+40,y:Math.floor(i/8)*80+40,vx:Math.cos(j*1.047+n)*100,vy:Math.sin(j*1.047+n)*100,color:GEM_COLORS[e.types[n]]||'#fff',start:time});});
    }
    effects=effects.slice(-180);sparks=sparks.slice(-450);
  }
  function drawBattle(s,time,target,motion) {
    animator.update(s,time,motion);
    if(!motion) effects=[];
    const camera = battleCamera(field.width, field.height);
    f.setTransform(1,0,0,1,0,0);f.clearRect(0,0,field.width,field.height);
    f.setTransform(camera.scale,0,0,camera.scale,camera.x,camera.y);
    if(terrain.complete&&terrain.naturalWidth)f.drawImage(terrain,0,0,1200,400);
    const shade = f.createLinearGradient(0, 0, 0, 400);
    shade.addColorStop(0, '#061b3545'); shade.addColorStop(.5, '#091c3012'); shade.addColorStop(1, '#030e2866');
    f.fillStyle = shade; f.fillRect(0, 0, 1200, 400);
    for(const field of s.fields){f.save();f.globalAlpha=.15;f.fillStyle=colors(field.side).glow;f.beginPath();f.ellipse(field.x,field.y,field.radius,field.radius/1.25,0,0,Math.PI*2);f.fill();f.restore();if(motion){for(let j=0;j<7;j++){const x=field.x+Math.sin(time*8+j*9)*field.radius*.85,y=field.y+Math.cos(time*4+j*7)*25;line(f,x,y-70,x+4,y-40,'#f0ffe2',1.5);line(f,x+4,y-40,x-7,y-23,colors(field.side).glow,2);line(f,x-7,y-23,x,y,colors(field.side).glow,1.5);}}}
    const objects=[...s.structures,...s.units].sort((a,b)=>(a.y+(UNITS[a.kind]?.air?55:0))-(b.y+(UNITS[b.kind]?.air?55:0)));
    for(const u of objects){
      if(!UNITS[u.kind])structure(f,u,motion?time:0,animator.pose(u.id));
      else{const d=UNITS[u.kind],scale=d.size/16*(hasUnitAtlas()?1.2:1);drawUnit(f,u.kind,u.side,u.x,u.y,scale,motion?time:0,motion&&u.moving,false,animator.pose(u.id));if(u.hp<u.maxHP||u.stunned>s.time)health(f,u.x,u.y-(hasUnitAtlas()?spriteHeight(u.kind)+(d.air?22:0):d.air?62:53)*scale,u.hp,u.maxHP,Math.max(20,32*scale),u.side);if(u.stunned>s.time){f.strokeStyle='#bcefff';f.lineWidth=1.5;f.beginPath();f.ellipse(u.x,u.y-22*scale,25*scale,46*scale,0,0,Math.PI*2);f.stroke();}}
    }
    effects=effects.filter(e=>time-e.start<e.life);
    for(const e of effects){const p=(time-e.start)/e.life,col=colors(e.side||0);f.save();f.globalAlpha=1-p;
      if(e.kind==='shot')drawShot(f,e,time,animator.pose(e.id));
      else if(e.kind==='destroy'){f.strokeStyle=e.unit==='core'?'#fff1bb':col.glow;f.lineWidth=2;f.beginPath();f.ellipse(e.x,e.y,8+p*(e.unit==='core'?100:30),6+p*15,0,0,Math.PI*2);f.stroke();if(motion)for(let j=0;j<8;j++)ellipse(f,e.x+Math.cos(j)*p*43,e.y+Math.sin(j)*p*23-p*15,3*(1-p),2,col.pale);}
      else if(e.kind==='spawn'){f.strokeStyle=col.glow;f.lineWidth=2;f.beginPath();f.ellipse(e.x,e.y,7+p*20,3+p*9,0,0,Math.PI*2);f.stroke();}
      else{f.strokeStyle=e.kind==='heal'?'#bcffb0':e.kind==='stasis'?'#d0eeff':'#ffe8bb';f.lineWidth=2;f.beginPath();f.ellipse(e.x,e.y,(e.radius||100)*p,(e.radius||100)/1.25*p,0,0,Math.PI*2);f.stroke();if(e.kind==='heal')for(let j=0;j<6;j++){const x=e.x+Math.sin(j*5)*60,y=e.y+Math.cos(j*3)*16-p*40;line(f,x-4,y,x+4,y,'#eaffbe',2);line(f,x,y-4,x,y+4,'#eaffbe',2);}}
      f.restore();
    }
    if(target){const spell=SPELLS[target.kind];f.save();f.fillStyle='#cfffc623';f.strokeStyle='#ecffb8';f.lineWidth=1.5;f.setLineDash([7,5]);f.beginPath();f.ellipse(target.x,target.y,spell.radius,spell.radius/1.25,0,0,Math.PI*2);f.fill();f.stroke();f.setLineDash([]);line(f,target.x-9,target.y,target.x+9,target.y,'#fff',1);line(f,target.x,target.y-9,target.x,target.y+9,'#fff',1);f.restore();}
  }
  function drawPuzzle(s,time,selected,cursor,keyboard,hints,motion){
    g.setTransform(puzzle.width/640,0,0,puzzle.height/640,0,0);g.clearRect(0,0,640,640);
    for(let i=0;i<64;i++){const x=i%8*80,y=Math.floor(i/8)*80;g.fillStyle=(i+Math.floor(i/8))%2?'#34547633':'#02091655';g.beginPath();g.roundRect(x+2,y+2,76,76,8);g.fill();g.strokeStyle='#719bb836';g.lineWidth=.8;g.stroke();}
    const p=s.phase,progress=p?1-Math.max(0,p.remaining/p.duration):1;
    for(let i=0;i<64;i++){
      const tile=s.board[i];if(!tile)continue;let x=i%8*80+40,y=Math.floor(i/8)*80+40,scale=1,alpha=1;
      if(motion&&(p?.kind==='swap'||p?.kind==='return')&&(i===p.a||i===p.b)){const from=i===p.a?p.b:p.a;x=(from%8*80+40)+(x-(from%8*80+40))*progress;y=(Math.floor(from/8)*80+40)+(y-(Math.floor(from/8)*80+40))*progress;}
      if(p?.kind==='clear'&&p.wave.clear.includes(i)){scale=motion?1+Math.sin(progress*Math.PI)*.18:1;alpha=1-progress;}
      if(motion&&p?.kind==='fall'){const fall=p.falls.find(v=>v.id===tile.id);if(fall)y=(Math.floor(fall.from/8)*80+40)+(y-(Math.floor(fall.from/8)*80+40))*(1-Math.pow(1-progress,3));}
      g.save();g.globalAlpha=alpha;
      if(atlas.complete&&atlas.naturalWidth){const t=tile.type<0?4:tile.type,sw=atlas.naturalWidth/3,sh=atlas.naturalHeight/2;g.drawImage(atlas,t%3*sw,Math.floor(t/3)*sh,sw,sh,x-43*scale,y-43*scale,86*scale,86*scale);}
      if(tile.special){g.strokeStyle='#fff3be';g.lineWidth=2;g.shadowColor='#fffbb5';g.shadowBlur=7;
        if(tile.special==='h')line(g,x-24,y,x+24,y,'#fff0ba',2.5);
        if(tile.special==='v')line(g,x,y-24,x,y+24,'#fff0ba',2.5);
        if(tile.special==='bomb'){g.beginPath();g.arc(x,y,16,0,Math.PI*2);g.stroke();line(g,x-9,y,x+9,y,'#fff0ba',2);line(g,x,y-9,x,y+9,'#fff0ba',2);}
        if(tile.special==='prism'){g.beginPath();g.arc(x,y,25,0,Math.PI*2);g.stroke();g.fillStyle='#fff7d0';g.font='31px Georgia';g.textAlign='center';g.fillText('✧',x,y+10);}
      }g.restore();
    }
    for(let i=0;i<64;i++)if(i===selected||(keyboard&&i===cursor)||hints.includes(i)){const x=i%8*80+4,y=Math.floor(i/8)*80+4;g.fillStyle=i===selected?'#ffdd9f15':'#6ce6ce12';g.strokeStyle=i===selected?'#ffdd9f':'#8effe1';g.lineWidth=i===selected?3:2;g.beginPath();g.roundRect(x,y,72,72,8);g.fill();g.stroke();if(hints.includes(i)){g.fillStyle='#c2fff0';g.beginPath();g.arc(x+36,y+64,3,0,Math.PI*2);g.fill();}}
    sparks=sparks.filter(v=>time-v.start<.7);if(motion)for(const v of sparks){const t=time-v.start;g.globalAlpha=1-t/.7;ellipse(g,v.x+v.vx*t,v.y+v.vy*t+t*t*90,3*(1-t),3*(1-t),v.color);}g.globalAlpha=1;
  }
  return {drawBattle,drawPuzzle,ingest,reset(){effects=[];sparks=[];animator.reset();}};
}
