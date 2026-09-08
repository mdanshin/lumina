import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, tick } from '../battle-engine.mjs';
import { createBattleAnimator, STILL_POSE } from '../battle-animation.mjs';

function fixture() {
  const state=createBattle('normal',123);
  state.status='playing';
  const animator=createBattleAnimator();
  animator.update(state,0);
  return {state,animator,unit:state.units[0]};
}
function advance(state,animator,time) { state.time=time;animator.update(state,time); }

test('walking follows distance, alternates legs, and does not slide when stopped',()=>{
  const {state,animator,unit}=fixture();
  const initial=animator.pose(unit.id);
  unit.x+=3;advance(state,animator,.1);
  const walking=animator.pose(unit.id);
  assert.ok(walking.walk>0 && walking.travel===3);
  assert.notEqual(walking.phase,initial.phase);
  assert.ok(Math.abs(walking.left+walking.right)<1e-9);
  assert.notEqual(walking.phase,animator.pose(state.units[1].id).phase);
  unit.moving=false;advance(state,animator,.2);
  assert.equal(animator.pose(unit.id).phase,walking.phase);
  assert.ok(animator.pose(unit.id).walk<walking.walk);
});

test('only a real shot animates the firing actor, including shots aimed behind it',()=>{
  const {state,animator,unit}=fixture();
  unit.cooldown=.9;advance(state,animator,.1);
  assert.equal(animator.pose(unit.id).flash,0,'spawn cooldown is not a shot');
  animator.ingest([{kind:'shot',id:unit.id,unit:unit.kind,x:unit.x,tx:unit.x-50}],.1);
  animator.update(state,.1);
  assert.equal(animator.pose(unit.id).flash,1);
  assert.equal(animator.pose(unit.id).facing,-1);
  assert.equal(animator.pose(state.units[1].id).flash,0);
  advance(state,animator,.18);
  assert.ok(animator.pose(unit.id).kick>0 && animator.pose(unit.id).kick<1);
  advance(state,animator,.6);
  assert.equal(animator.pose(unit.id).attack,-1);
  assert.equal(animator.pose(unit.id).kick,0);
});

test('pause freezes the entire pose and shot without consuming its animation',()=>{
  const {state,animator,unit}=fixture();
  unit.x+=2;advance(state,animator,.1);
  animator.ingest([{kind:'shot',id:unit.id,x:unit.x,tx:500}],.1);
  animator.update(state,.1);
  const pose=structuredClone(animator.pose(unit.id));
  for(let frame=0;frame<100;frame++)animator.update(state,.1);
  assert.deepEqual(animator.pose(unit.id),pose);
  advance(state,animator,.2);
  assert.ok(animator.pose(unit.id).kick<pose.kick);
});

test('stasis freezes limbs and engines, suppresses fire, then allows movement again',()=>{
  const {state,animator,unit}=fixture();
  unit.kind='wing';animator.reset();animator.update(state,0);
  unit.x+=3;advance(state,animator,.1);
  unit.stunned=2;
  animator.ingest([{kind:'shot',id:unit.id,x:unit.x,tx:500}],.2);
  advance(state,animator,.2);
  const frozen=structuredClone(animator.pose(unit.id));
  assert.equal(frozen.flash,0);assert.equal(frozen.engine,0);
  advance(state,animator,1);
  assert.deepEqual(animator.pose(unit.id),frozen);
  unit.x+=4;advance(state,animator,2.1);
  assert.notEqual(animator.pose(unit.id).phase,frozen.phase);
  assert.ok(animator.pose(unit.id).engine>0);
});

test('reduced motion, despawning, and a new battle leave no stale attacks or actors',()=>{
  const {state,animator,unit}=fixture();
  animator.ingest([{kind:'shot',id:unit.id,x:unit.x,tx:500}],.1);
  unit.x+=4;state.time=.1;animator.update(state,.1,false);
  const pose=animator.pose(unit.id);
  for(const key of ['walk','left','right','hover','engine','flash','kick','swing'])assert.equal(pose[key],0);
  animator.update(state,.2,true);
  assert.equal(animator.pose(unit.id).flash,0);
  const before=animator.size;
  state.units=state.units.filter(u=>u.id!==unit.id);animator.update(state,.3);
  assert.equal(animator.size,before-1);
  assert.equal(animator.pose(unit.id),STILL_POSE);
  animator.reset();assert.equal(animator.size,0);
});

test('simulation shot events identify the actual soldier, tower, core, and target',()=>{
  const state=createBattle('normal',123);state.status='playing';
  const soldier=state.units[0],enemy=state.units.find(u=>u.side===1);
  const core=state.structures.find(u=>u.side===0&&u.kind==='core');
  const tower=state.structures.find(u=>u.side===0&&u.kind==='tower');
  soldier.x=120;soldier.y=191;soldier.cooldown=0;
  enemy.x=180;enemy.y=191;enemy.hp=enemy.maxHP=10000;
  core.cooldown=0;tower.cooldown=0;
  tick(state,1/30);
  const shots=state.events.filter(e=>e.kind==='shot');
  for(const source of [soldier,core,tower]) {
    const shot=shots.find(e=>e.id===source.id);
    assert.ok(shot,`missing shot from ${source.kind}`);
    assert.equal(shot.unit,source.kind);
    assert.equal(shot.targetId,enemy.id);
    assert.equal(shot.targetKind,enemy.kind);
    assert.equal(shot.targetAir,false);
    assert.equal(shot.x,source.x);assert.equal(shot.y,source.y);
  }
});
