import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, tick, recruit, cast, spawn, upgrade, grantMatch, moveGems, resetBoard, restoreBattle, serializeBattle, UNITS, LIMIT, armySize } from '../battle-engine.mjs';
import { legalMoves, planWave, swap, findGroups } from '../engine.mjs';

const playing = (difficulty='normal',seed=741) => { const s=createBattle(difficulty,seed); s.status='playing'; return s; };
const advance = (s,seconds) => { for(let n=0;n<Math.ceil(seconds*30);n++)tick(s,1/30); };

test('battle starts only on command and a legal match produces income and reinforcements',()=>{
  const s=createBattle('normal',741),before=serializeBattle(s);advance(s,4);assert.equal(serializeBattle(s),before);
  assert.equal(recruit(s,0,'blade'),false);s.status='playing';const board=JSON.stringify(s.board),[a,b]=legalMoves(s.board)[0];
  assert.equal(moveGems(s,a,b),true);assert.equal(moveGems(s,a,b),false);
  advance(s,2);assert.ok(s.energy[0]>160);assert.ok(s.stats[0].matches>0);assert.ok(s.stats[0].deployed>2);assert.notEqual(JSON.stringify(s.board),board);assert.equal(s.phase,null);assert.equal(findGroups(s.board).length,0);assert.ok(legalMoves(s.board).length);
});
test('invalid swap returns the board and never awards energy',()=>{
  const s=playing(),before=JSON.stringify(s.board);let pair;
  for(let i=0;i<63;i++)if(i%8<7){swap(s.board,i,i+1);const wave=planWave(s.board);swap(s.board,i,i+1);if(!wave){pair=[i,i+1];break;}}
  assert.ok(pair);moveGems(s,...pair);advance(s,.5);assert.equal(s.phase,null);assert.equal(JSON.stringify(s.board),before);assert.equal(s.energy[0],160);assert.equal(s.stats[0].matches,0);
  assert.equal(moveGems(s,7,8),false);assert.equal(moveGems(s,-1,0),false);
});
test('recruitment respects energy, supply, and terminal states',()=>{
  const s=playing();assert.equal(recruit(s,0,'titan'),false);assert.equal(recruit(s,0,'blade'),true);assert.equal(s.energy[0],100);
  while(armySize(s,0)<LIMIT)spawn(s,0,'spark');s.energy[0]=1200;assert.equal(recruit(s,0,'blade'),false);assert.equal(s.energy[0],1200);grantMatch(s,0,12,5);assert.equal(armySize(s,0),LIMIT);assert.equal(s.energy[0],1200);
  s.status='won';assert.equal(recruit(s,0,'blade'),false);assert.equal(upgrade(s,0,'attack'),false);assert.equal(cast(s,0,'storm',600,191),false);assert.equal(moveGems(s,...legalMoves(s.board)[0]),false);
});
test('targeted spells charge once, enforce cooldowns, and ignore invalid healing targets',()=>{
  const s=playing();s.energy[0]=1000;assert.equal(cast(s,0,'heal',100,191),false);assert.equal(s.energy[0],1000);
  const u=s.units.find(u=>u.side===0);u.hp=5;assert.equal(cast(s,0,'heal',u.x,u.y),true);assert.equal(u.hp,u.maxHP);assert.equal(s.energy[0],890);u.hp=5;assert.equal(cast(s,0,'heal',u.x,u.y),false);
  const enemy=s.units.find(u=>u.side===1);assert.equal(cast(s,0,'stasis',enemy.x,enemy.y),true);const x=enemy.x;advance(s,1);assert.equal(enemy.x,x);assert.equal(cast(s,0,'storm',NaN,191),false);
  const hp=enemy.hp;assert.equal(cast(s,0,'storm',enemy.x,enemy.y),true);advance(s,.5);assert.ok(enemy.hp<hp);assert.equal(cast(s,0,'storm',enemy.x,enemy.y),false);
});
test('armor improves existing and new units consistently; upgrades stop at level three',()=>{
  const s=playing();s.energy[0]=1200;const u=s.units[0],old=u.maxHP;assert.ok(upgrade(s,0,'armor'));assert.equal(u.maxHP,old*1.18);assert.equal(u.hp,u.maxHP);
  const fresh=spawn(s,0,'spark');assert.equal(fresh.maxHP,u.maxHP);s.energy[0]=1200;upgrade(s,0,'armor');upgrade(s,0,'armor');const energy=s.energy[0];assert.equal(upgrade(s,0,'armor'),false);assert.equal(s.energy[0],energy);
});
test('anti-air units damage aircraft while melee units cannot',()=>{
  const s=playing();s.nextAI=s.nextOrder=1000;s.units=[];const blade=spawn(s,0,'blade'),wing=spawn(s,1,'wing');blade.x=600;blade.y=wing.y=191;wing.x=615;const hp=wing.hp;advance(s,2);assert.equal(wing.hp,hp);
  s.units=[];const lancer=spawn(s,0,'lancer'),target=spawn(s,1,'wing');lancer.x=600;target.x=675;lancer.y=target.y=191;advance(s,1.8);assert.ok(target.hp<UNITS.wing.hp);
});
test('manual shuffle has a cooldown and preserves a playable stable board',()=>{
  const s=playing();assert.equal(resetBoard(s),true);assert.equal(resetBoard(s),false);assert.equal(findGroups(s.board).length,0);assert.ok(legalMoves(s.board).length);advance(s,15.1);assert.equal(resetBoard(s),true);
});
test('saving and loading preserve the battle and deterministic continuation',()=>{
  const s=playing();recruit(s,0,'bulwark');advance(s,9);const restored=restoreBattle(serializeBattle(s));assert.ok(restored);assert.deepEqual(restored.energy,s.energy);assert.deepEqual(restored.units,s.units);
  s.events=[];advance(s,12);advance(restored,12);assert.equal(serializeBattle(restored),serializeBattle(s));
  assert.equal(restoreBattle('{bad'),null);assert.equal(restoreBattle(JSON.stringify({...s,board:[]})),null);assert.equal(restoreBattle(JSON.stringify({...s,units:[{kind:'unknown'}]})),null);
});
test('an unattended player loses and the finished battlefield stops changing',()=>{
  const s=playing('normal');for(let t=0;t<6000&&s.status==='playing';t++)tick(s,.1);
  assert.equal(s.status,'lost');assert.ok(s.time<600);const before=serializeBattle(s);advance(s,10);assert.equal(serializeBattle(s),before);assert.ok(restoreBattle(before));
});
test('a full battle can be won by matching and deploying a mixed army',()=>{
  const s=playing('easy',9324),order=['bulwark','mortar','lancer','mortar','titan','wing'];let next=0,unit=0;
  for(let t=0;t<9000&&s.status==='playing';t++){
    if(!s.phase&&s.time>=next){moveGems(s,...legalMoves(s.board)[0]);next=s.time+2.5;}
    if(recruit(s,0,order[unit%order.length]))unit++;
    tick(s,.1);
    assert.ok(s.energy.every(e=>Number.isFinite(e)&&e>=0&&e<=1200));assert.ok(s.units.length<=LIMIT*2);
  }
  assert.equal(s.status,'won',`Battle ended ${s.status} at ${s.time.toFixed(1)}s`);assert.ok(s.stats[0].energy>0);assert.ok(s.stats[0].kills>0);assert.ok(restoreBattle(serializeBattle(s)));
});
