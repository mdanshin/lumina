import { createBoard, adjacent, swap, specialPair, combinedWave, planWave, applyWave, collapse, legalMoves, shuffleBoard, adoptBoard } from './engine.mjs';

export const LIMIT = 42;
export const ENERGY_CAP = 1200;
export const UNITS = {
  spark: { name: 'Искра', role: 'Бесплатный боец за комбинацию', cost: 0, hp: 44, damage: 7, range: 82, speed: 30, rate: .9, size: 7, air: false, antiAir: true, armor: 0 },
  blade: { name: 'Клинок', role: 'Ближний бой · против артиллерии', cost: 60, hp: 130, damage: 24, range: 28, speed: 44, rate: .8, size: 10, air: false, antiAir: false, armor: 1 },
  bulwark: { name: 'Бастион', role: 'Тяжёлая броня · держит удар', cost: 95, hp: 310, damage: 16, range: 70, speed: 23, rate: 1.1, size: 14, air: false, antiAir: false, armor: 5 },
  lancer: { name: 'Стрела', role: 'Дальний бой · против авиации', cost: 120, hp: 105, damage: 25, range: 150, speed: 27, rate: .9, size: 11, air: false, antiAir: true, armor: 0 },
  mortar: { name: 'Гром', role: 'Осадная пушка · против башен', cost: 180, hp: 165, damage: 44, range: 215, speed: 19, rate: 2.1, size: 16, air: false, antiAir: false, armor: 2, splash: 43 },
  wing: { name: 'Сокол', role: 'Авиация · обходит наземные войска', cost: 195, hp: 135, damage: 25, range: 115, speed: 37, rate: 1, size: 15, air: true, antiAir: true, armor: 1 },
  titan: { name: 'Титан', role: 'Штурмовой мех · урон по площади', cost: 290, hp: 530, damage: 38, range: 80, speed: 19, rate: 1.5, size: 21, air: false, antiAir: false, armor: 4, splash: 55 }
};
export const SPELLS = {
  storm: { name: 'Ионный шторм', cost: 150, cooldown: 14, radius: 105, desc: 'Выбранная область: 40 урона/с, 4 секунды', key: 'Q' },
  heal: { name: 'Ремонтный импульс', cost: 110, cooldown: 18, radius: 130, desc: 'Выбранная область: +140 здоровья союзникам', key: 'W' },
  stasis: { name: 'Стазис', cost: 100, cooldown: 16, radius: 100, desc: 'Замораживает врагов в области на 5 секунд', key: 'E' }
};
export const DIFFICULTIES = { easy: { name: 'Кадет', interval: 4.5 }, normal: { name: 'Командир', interval: 3.1 }, hard: { name: 'Ветеран', interval: 2 } };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function random(s) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
const rng = s => () => random(s);
export const armySize = (s, side) => s.units.filter(u => u.side === side && u.hp > 0).length;
export const upgradeCost = (s, side, key) => 160 + s.upgrades[side][key] * 100;
export function createBattle(difficulty = 'normal', seed = Date.now()) {
  const s = { version: 1, seed: seed >>> 0, difficulty: DIFFICULTIES[difficulty] ? difficulty : 'normal', status: 'ready', time: 0, nextId: 1, energy: [160, 160], upgrades: [{ attack: 0, armor: 0 }, { attack: 0, armor: 0 }], units: [], structures: [], fields: [], events: [], cooldowns: [{}, {}], nextAI: 3, nextOrder: 4, board: [], phase: null, combo: 0, shuffleAt: 0, stats: [{ energy: 0, matches: 0, kills: 0, deployed: 0, maxCombo: 0 }, { energy: 0, matches: 0, kills: 0, deployed: 0, maxCombo: 0 }] };
  s.board = createBoard(rng(s));
  for (let side = 0; side < 2; side++) {
    s.structures.push({ id: s.nextId++, side, kind: 'core', x: side ? 1100 : 100, y: 191, hp: 1250, maxHP: 1250, cooldown: 0 });
    for (const y of [158, 224]) s.structures.push({ id: s.nextId++, side, kind: 'tower', x: side ? 956 : 244, y, hp: 360, maxHP: 360, cooldown: 0 });
    spawn(s, side, 'spark'); spawn(s, side, 'spark');
  }
  s.events = [];
  return s;
}
function event(s, kind, data = {}) { s.events.push({ kind, ...data }); if (s.events.length > 120) s.events.shift(); }
export function spawn(s, side, kind) {
  const def = UNITS[kind];
  if (!def || armySize(s, side) >= LIMIT) return false;
  const hp = def.hp * (1 + s.upgrades[side].armor * .18);
  const id = s.nextId++;
  const u = { id, side, kind, x: side ? 1055 : 145, y: 169 + id % 5 * 11, hp, maxHP: hp, cooldown: .4 + random(s) * .4, stunned: 0, target: null, moving: true };
  s.units.push(u); s.stats[side].deployed++; event(s, 'spawn', { x: u.x, y: u.y, side, unit: kind }); return u;
}
export function recruit(s, side, kind) {
  const def = UNITS[kind];
  if (s.status !== 'playing' || !def || def.cost <= 0 || s.energy[side] < def.cost || armySize(s, side) >= LIMIT) return false;
  if (!spawn(s, side, kind)) return false;
  s.energy[side] -= def.cost; return true;
}
export function upgrade(s, side, key) {
  if (!['attack', 'armor'].includes(key) || s.status !== 'playing' || s.upgrades[side][key] >= 3) return false;
  const cost = upgradeCost(s, side, key);
  if (s.energy[side] < cost) return false;
  s.energy[side] -= cost; s.upgrades[side][key]++;
  if (key === 'armor') for (const u of s.units.filter(u => u.side === side)) {
    const newHP = UNITS[u.kind].hp * (1 + s.upgrades[side].armor * .18);
    u.hp += newHP - u.maxHP; u.maxHP = newHP;
  }
  event(s, 'upgrade', { side, key }); return true;
}
export function grantMatch(s, side, count = 3, combo = 1, specialCount = 0) {
  if (s.status !== 'playing') return 0;
  const gain = Math.round(count * 12 * Math.min(2.5, 1 + (combo - 1) * .25) + specialCount * 16);
  s.energy[side] = Math.min(ENERGY_CAP, s.energy[side] + gain);
  s.stats[side].energy += gain; s.stats[side].matches++; s.stats[side].maxCombo = Math.max(s.stats[side].maxCombo, combo);
  for (let i = 0; i < Math.min(3, Math.floor(count / 3)); i++) spawn(s, side, 'spark');
  event(s, 'match', { side, gain, combo }); return gain;
}
export function moveGems(s, a, b) {
  if (s.status !== 'playing' || s.phase || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 63 || b > 63 || !adjacent(a, b)) return false;
  swap(s.board, a, b);
  const wave = specialPair(s.board, a, b) ? combinedWave(s.board, a, b) : planWave(s.board, [b, a]);
  s.combo = 0; s.phase = { kind: 'swap', a, b, remaining: .16, duration: .16, wave };
  return true;
}
export function resetBoard(s) {
  if (s.status !== 'playing' || s.phase || s.time < s.shuffleAt) return false;
  shuffleBoard(s.board, rng(s)); s.shuffleAt = s.time + 15; event(s, 'shuffle'); return true;
}
function beginWave(s, wave) { s.combo++; s.phase = { kind: 'clear', remaining: .18, duration: .18, wave }; }
function tickPuzzle(s, dt) {
  const p = s.phase;
  if (!p) return;
  p.remaining -= dt;
  if (p.remaining > 0) return;
  if (p.kind === 'swap') {
    if (p.wave) beginWave(s, p.wave);
    else { swap(s.board, p.a, p.b); s.phase = { kind: 'return', a: p.a, b: p.b, remaining: .15, duration: .15 }; event(s, 'invalid'); }
  } else if (p.kind === 'return') s.phase = null;
  else if (p.kind === 'clear') {
    event(s, 'shatter', { indices: p.wave.matched, types: p.wave.matched.map(i => s.board[i]?.type ?? 0) });
    grantMatch(s, 0, p.wave.matched.length, s.combo, p.wave.promotions.length + p.wave.activated.length);
    applyWave(s.board, Array(64).fill(0), p.wave);
    const falls = collapse(s.board, rng(s));
    s.phase = { kind: 'fall', remaining: .22, duration: .22, falls };
  } else {
    const wave = planWave(s.board);
    if (wave && s.combo < 60) beginWave(s, wave);
    else { s.phase = null; if (wave || !legalMoves(s.board).length) { shuffleBoard(s.board, rng(s)); event(s, 'shuffle'); } event(s, 'settled'); }
  }
}
const distance = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 1.25);
export function cast(s, side, kind, x, y) {
  const spell = SPELLS[kind];
  if (s.status !== 'playing' || !spell || !Number.isFinite(x) || !Number.isFinite(y) || s.energy[side] < spell.cost || (s.cooldowns[side][kind] || 0) > s.time) return false;
  x = clamp(x, 60, 1140); y = clamp(y, 120, 255);
  const target = { x, y };
  if (kind === 'heal') {
    const allies = [...s.units, ...s.structures].filter(u => u.side === side && u.hp > 0 && u.hp < u.maxHP && distance(u, target) <= spell.radius);
    if (!allies.length) return false;
    allies.forEach(u => { u.hp = Math.min(u.maxHP, u.hp + (u.kind === 'core' ? 85 : 140)); });
  } else if (kind === 'stasis') {
    const enemies = s.units.filter(u => u.side !== side && u.hp > 0 && distance(u, target) <= spell.radius);
    if (!enemies.length) return false;
    enemies.forEach(u => { u.stunned = s.time + 5; });
  } else s.fields.push({ side, x, y, remaining: 4, radius: spell.radius });
  s.energy[side] -= spell.cost; s.cooldowns[side][kind] = s.time + spell.cooldown;
  event(s, kind, { side, x, y, radius: spell.radius }); return true;
}
function damage(s, target, amount, side) {
  if (target.hp <= 0) return;
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp === 0) { event(s, 'destroy', { id: target.id, x: target.x, y: target.y, side: target.side, unit: target.kind }); if (UNITS[target.kind]) s.stats[side].kills++; }
}
function tickAI(s) {
  const difficulty = DIFFICULTIES[s.difficulty];
  if (s.time >= s.nextAI) {
    const combo = random(s) < .2 ? 2 : 1;
    grantMatch(s, 1, random(s) < .17 ? 5 : 3, combo);
    s.nextAI = s.time + difficulty.interval * (.8 + random(s) * .4);
  }
  if (s.time < s.nextOrder) return;
  s.nextOrder = s.time + 1.6;
  const enemies = s.units.filter(u => u.side === 0), allies = s.units.filter(u => u.side === 1);
  const cluster = enemies.find(u => enemies.filter(v => distance(u, v) < 95).length >= 5);
  if (cluster && s.energy[1] > 200 && cast(s, 1, 'storm', cluster.x, cluster.y)) return;
  const hurt = allies.find(u => u.maxHP - u.hp > 130);
  if (hurt && s.energy[1] > 155 && cast(s, 1, 'heal', hurt.x, hurt.y)) return;
  if (s.time > 70 && random(s) < .15 && upgrade(s, 1, random(s) < .6 ? 'attack' : 'armor')) return;
  let kind;
  if (enemies.filter(u => UNITS[u.kind].air).length > allies.filter(u => u.kind === 'lancer').length) kind = 'lancer';
  else if (enemies.filter(u => u.kind === 'mortar').length >= 2) kind = 'wing';
  else { const choices = ['blade', 'bulwark', 'lancer', 'mortar', 'mortar', 'wing', 'titan']; kind = choices[Math.floor(random(s) * choices.length)]; }
  if (!recruit(s, 1, kind) && enemies.some(u => u.x > 860)) recruit(s, 1, 'blade');
}
function tickCombat(s, dt) {
  const power = 1 + Math.max(0, s.time - 300) / 120;
  for (const field of s.fields) {
    const duration = Math.min(dt, field.remaining); field.remaining -= dt;
    for (const u of s.units) if (u.side !== field.side && distance(u, field) <= field.radius) damage(s, u, 40 * duration * power, field.side);
  }
  s.fields = s.fields.filter(f => f.remaining > 0);
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    const def = UNITS[u.kind]; u.moving = false;
    if (u.stunned > s.time) continue;
    u.cooldown = Math.max(0, u.cooldown - dt);
    const candidates = s.units.filter(v => v.hp > 0 && v.side !== u.side && (def.antiAir || !UNITS[v.kind].air));
    const enemyStructures = s.structures.filter(v => v.hp > 0 && v.side !== u.side);
    const towers = enemyStructures.filter(v => v.kind === 'tower');
    candidates.push(...(towers.length ? towers : enemyStructures));
    candidates.sort((a, b) => distance(u, a) - distance(u, b));
    const target = candidates[0];
    if (!target) continue;
    const dist = distance(u, target);
    u.target = target.id;
    if (dist <= def.range + (target.kind === 'core' ? 28 : 0)) {
      if (u.cooldown <= 0) {
        u.cooldown = def.rate;
        const targetDef = UNITS[target.kind];
        let hit = def.damage * (1 + s.upgrades[u.side].attack * .2) * power;
        if (u.kind === 'mortar' && !targetDef) hit *= 1.8;
        if (u.kind === 'lancer' && targetDef?.air) hit *= 1.7;
        if (u.kind === 'blade' && target.kind === 'mortar') hit *= 1.5;
        damage(s, target, Math.max(2, hit - (targetDef?.armor || 0)), u.side);
        event(s, 'shot', { id: u.id, x: u.x, y: u.y, tx: target.x, ty: target.y, targetId: target.id, targetKind: target.kind, targetAir: !!targetDef?.air, side: u.side, unit: u.kind, air: def.air });
        if (def.splash) for (const v of s.units) if (v !== target && v.hp > 0 && v.side !== u.side && !UNITS[v.kind].air && distance(v, target) < def.splash) damage(s, v, hit * .45, u.side);
      }
    } else {
      u.moving = true;
      const step = Math.min(def.speed * dt, dist - def.range + 1);
      u.x += (target.x - u.x) / dist * step;
      u.y = clamp(u.y + (target.y - u.y) / dist * step * .45, 150, 232);
    }
  }
  for (const tower of s.structures) {
    if (tower.hp <= 0) continue;
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    const reach = tower.kind === 'core' ? 155 : 170;
    const target = s.units.filter(u => u.hp > 0 && u.side !== tower.side && distance(u, tower) < reach).sort((a, b) => distance(a, tower) - distance(b, tower))[0];
    if (target && tower.cooldown <= 0) {
      tower.cooldown = .95; damage(s, target, (tower.kind === 'core' ? 19 : 23) * power, tower.side);
      event(s, 'shot', { id: tower.id, x: tower.x, y: tower.y, tx: target.x, ty: target.y, targetId: target.id, targetKind: target.kind, targetAir: !!UNITS[target.kind]?.air, side: tower.side, unit: tower.kind });
    }
  }
  s.units = s.units.filter(u => u.hp > 0);
  const cores = [0, 1].map(side => s.structures.find(t => t.side === side && t.kind === 'core'));
  if (cores.some(c => c.hp <= 0)) {
    s.status = cores[0].hp <= 0 && cores[1].hp <= 0 ? 'draw' : cores[1].hp <= 0 ? 'won' : 'lost';
    if (s.phase) { s.phase = null; if (planWave(s.board)) shuffleBoard(s.board, rng(s)); }
    event(s, 'end', { status: s.status });
  }
}
export function tick(s, dt) {
  if (s.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, .1); s.time += dt;
  tickPuzzle(s, dt); tickAI(s); tickCombat(s, dt);
}
export function serializeBattle(s) { return JSON.stringify({ ...s, events: [] }); }
export function restoreBattle(raw) {
  try {
    const s = JSON.parse(raw);
    if (s.version !== 1 || !DIFFICULTIES[s.difficulty] || !['ready', 'playing', 'won', 'lost', 'draw'].includes(s.status) || !Number.isFinite(s.time) || s.time < 0 || !Number.isInteger(s.seed) || !Number.isInteger(s.nextId) || s.nextId < 1) return null;
    if (!Array.isArray(s.board) || s.board.length !== 64 || !s.board.every(t => t && Number.isInteger(t.id) && t.id > 0 && Number.isInteger(t.type) && t.type >= -1 && t.type < 6 && [null, 'h', 'v', 'bomb', 'prism'].includes(t.special) && (t.type !== -1 || t.special === 'prism')) || new Set(s.board.map(t => t.id)).size !== 64) return null;
    if (!Array.isArray(s.units) || s.units.length > LIMIT * 2 || !s.units.every(u => UNITS[u.kind] && [0, 1].includes(u.side) && [u.id, u.x, u.y, u.hp, u.maxHP, u.cooldown, u.stunned].every(Number.isFinite) && u.hp > 0 && u.hp <= u.maxHP)) return null;
    if (!Array.isArray(s.structures) || s.structures.length !== 6 || !s.structures.every(t => ['core', 'tower'].includes(t.kind) && [0, 1].includes(t.side) && [t.id, t.hp, t.maxHP, t.x, t.y, t.cooldown].every(Number.isFinite) && t.hp >= 0 && t.hp <= t.maxHP)) return null;
    for (const side of [0, 1]) if (s.structures.filter(t => t.side === side && t.kind === 'core').length !== 1 || !s.upgrades?.[side] || !['attack', 'armor'].every(k => Number.isInteger(s.upgrades[side][k]) && s.upgrades[side][k] >= 0 && s.upgrades[side][k] <= 3) || !s.stats?.[side] || !['energy', 'matches', 'kills', 'deployed', 'maxCombo'].every(k => Number.isFinite(s.stats[side][k])) || !s.cooldowns?.[side] || !Object.values(s.cooldowns[side]).every(Number.isFinite)) return null;
    if (!Array.isArray(s.energy) || s.energy.length !== 2 || !s.energy.every(e => Number.isFinite(e) && e >= 0 && e <= ENERGY_CAP) || ![s.nextAI, s.nextOrder, s.shuffleAt].every(Number.isFinite) || !Array.isArray(s.fields) || !s.fields.every(f => [0,1].includes(f.side) && [f.x, f.y, f.radius, f.remaining].every(Number.isFinite))) return null;
    // Saves are taken between puzzle animations so an interrupted cascade cannot lose a reward.
    if (s.phase) return null;
    adoptBoard(s.board); s.events = [];
    if (!legalMoves(s.board).length || planWave(s.board)) shuffleBoard(s.board, rng(s));
    return s;
  } catch { return null; }
}
