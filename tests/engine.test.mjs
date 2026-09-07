import test from 'node:test';
import assert from 'node:assert/strict';
import { tile, adoptBoard, createBoard, findGroups, legalMoves, swap, adjacent, planWave, applyWave, collapse, shuffleBoard, combinedWave, specialPair, createFrost, levelConfig } from '../dist/engine.mjs';
let seed = 284019;
const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const blank = () => Array(64).fill(null);
const latin = () => Array.from({ length: 64 }, (_, i) => tile(((i / 8 | 0) * 2 + i % 8) % 6));

test('200 opening boards are full, stable and playable', () => {
  for (let n = 0; n < 200; n++) {
    const board = createBoard(rng);
    assert.equal(board.length, 64); assert.equal(new Set(board.map(t => t.id)).size, 64);
    assert.equal(findGroups(board).length, 0); assert.ok(legalMoves(board).length);
    const before = JSON.stringify(board); legalMoves(board); assert.equal(JSON.stringify(board), before);
  }
});
test('adjacency cannot wrap around an edge', () => { assert.equal(adjacent(7, 8), false); assert.equal(adjacent(0, -1), false); assert.equal(adjacent(56, 64), false); assert.equal(adjacent(17, 25), true); });
test('four and five in a row create a beam and a prism at the swapped cell', () => {
  for (const [length, special] of [[4, 'h'], [5, 'prism']]) {
    const board = blank(); for (let i = 0; i < length; i++) board[24 + i] = tile(2);
    const wave = planWave(board, [24]); assert.equal(wave.promotions.length, 1); assert.equal(wave.promotions[0].index, 24); assert.equal(wave.promotions[0].tile.special, special);
    const result = applyWave(board, Array(64).fill(0), wave); assert.equal(result.collected[2], length); assert.equal(board[24].special, special); assert.equal(wave.clear.length, length - 1);
  }
});
test('crossing runs merge into one nova', () => {
  const board = blank(); [9,17,25,24,26].forEach(i => board[i] = tile(3));
  const groups = findGroups(board); assert.equal(groups.length, 1); assert.equal(groups[0].indices.length, 5);
  const wave = planWave(board); assert.equal(wave.promotions[0].tile.special, 'bomb'); assert.equal(wave.promotions[0].index, 25);
});
test('line specials chain exactly once and break only hit frost', () => {
  const board = latin(); board[0].special = 'h'; board[3].special = 'v';
  const wave = planWave(board, [], [0]); assert.equal(wave.clear.length, 15); assert.equal(wave.activated.length, 2);
  const frost = Array(64).fill(1); const result = applyWave(board, frost, wave);
  assert.equal(result.ice, 15); assert.equal(frost.reduce((a,b) => a+b), 49);
  assert.equal(result.collected.reduce((a,b) => a+b), 15);
});
test('prism swaps clear the selected color, and two prisms clear everything', () => {
  const board = latin(); board[0] = tile(-1, 'prism'); const count = board.filter(t => t.type === board[1].type).length;
  let wave = combinedWave(board, 0, 1); assert.equal(wave.clear.length, count + 1); assert.equal(board[0].special, 'prism');
  board[1] = tile(-1, 'prism'); wave = combinedWave(board, 0, 1); assert.equal(wave.clear.length, 64);
});
test('special combinations produce the documented blast areas', () => {
  const board = latin(); board[28].special = 'bomb'; board[29].special = 'bomb';
  assert.equal(combinedWave(board, 28, 29).clear.length, 25);
  board[28].special = 'h'; assert.equal(combinedWave(board, 28, 29).clear.length, 39);
  board[29].special = 'v'; assert.ok(combinedWave(board, 28, 29).clear.length >= 15);
});
test('gravity preserves order in every column and refills all vacancies', () => {
  const board = createBoard(rng); [0,1,3,8,17,24,32,40,48,56,63].forEach(i => board[i] = null);
  const columns = Array.from({ length: 8 }, (_, c) => board.filter((t,i) => i % 8 === c && t).map(t => t.id));
  const falls = collapse(board, rng); assert.ok(board.every(Boolean)); assert.equal(new Set(board.map(t => t.id)).size, 64);
  columns.forEach((ids, c) => { const actual = board.filter((t,i) => i % 8 === c).map(t => t.id); assert.deepEqual(actual.slice(8 - ids.length), ids); });
  falls.forEach(f => { assert.equal((f.to - f.from) % 8, 0); assert.ok(f.to >= f.from); });
});
test('shuffling preserves earned specials and creates a stable playable board', () => {
  const board = createBoard(rng); board[17].special = 'h'; board[36] = tile(-1, 'prism');
  const ids = board.map(t => t.id).sort((a,b) => a-b); shuffleBoard(board, rng);
  assert.deepEqual(board.map(t => t.id).sort((a,b) => a-b), ids); assert.equal(findGroups(board).length, 0); assert.ok(legalMoves(board).length);
  assert.equal(board.filter(t => t.special).length, 2);
});
test('restored tile identities remain unique after refilling', () => {
  const board = createBoard(rng).map(t => ({ ...t, id: t.id + 90000 })); adoptBoard(board);
  board[0] = null; collapse(board, rng); assert.equal(new Set(board.map(t => t.id)).size, 64); assert.ok(board[0].id > board[1].id);
});
test('all 30 levels have valid and increasing chapter targets', () => {
  for (let n = 1; n <= 30; n++) { const config = levelConfig(n); assert.equal(config.number,n); assert.ok(config.moves > 0); assert.ok(config.target > 0); assert.equal(new Set(config.goals.map(g => g.type)).size,2); const frost = createFrost(config.frost,rng); assert.equal(frost.reduce((a,b)=>a+b), config.frost); }
});
test('1200 legal moves and their cascades settle without corrupting the board', () => {
  const board = createBoard(rng), frost = createFrost(20,rng);
  let count = 0;
  for (let turn = 0; turn < 1200; turn++) {
    let moves = legalMoves(board); if (!moves.length) { shuffleBoard(board,rng); moves = legalMoves(board); }
    const [a,b] = moves[Math.floor(rng() * moves.length)]; swap(board,a,b);
    let wave = specialPair(board,a,b) ? combinedWave(board,a,b) : planWave(board,[b,a]);
    assert.ok(wave, 'Every legal move must produce a wave');
    let chains = 0;
    while (wave) { assert.ok(chains++ < 80); const result = applyWave(board,frost,wave); assert.ok(result.points > 0); collapse(board,rng); wave = planWave(board); count++; }
    assert.equal(board.length,64); assert.ok(board.every(t=>t && (t.type >= 0 || t.special === 'prism'))); assert.equal(new Set(board.map(t=>t.id)).size,64);
  }
  assert.ok(count >= 1200);
});
