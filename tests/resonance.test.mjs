import test from 'node:test';
import assert from 'node:assert/strict';
import { ResonanceGame, restoreGame, cells, COLS, ROWS, FLOW_SECONDS } from '../resonance-engine.mjs';

const make = mode => new ResonanceGame({ seed: 72345, mode });
const advance = (game, seconds) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) game.update(1 / 60); };
function fourLines(game) {
  game.board = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => y >= 16 && x !== 4 ? 'J' : null));
  game.active = { type: 'I', rotation: 1, x: 2, y: 16 };
  game.hardDrop();
}

test('120 bags each contain all seven figures and saved RNG continues identically', () => {
  const g = make('zen');
  const sequence = [];
  for (let i = 0; i < 840; i++) {
    sequence.push(g.active.type);
    g.board.forEach(row => row.fill(null));
    g.hardDrop();
  }
  for (let i = 0; i < sequence.length; i += 7) assert.equal(new Set(sequence.slice(i, i + 7)).size, 7);
  const restored = restoreGame(g.serialize());
  assert.ok(restored);
  for (let i = 0; i < 30; i++) {
    for (const state of [g, restored]) { state.board.forEach(row => row.fill(null)); state.hardDrop(); }
    assert.equal(restored.serialize(), g.serialize());
  }
});

test('ghost is the last legal landing and hard drop fixes exactly four cells', () => {
  const g = make();
  const ghost = g.ghost();
  assert.ok(g.fits(ghost));
  assert.equal(g.fits({ ...ghost, y: ghost.y + 1 }), false);
  const expected = cells(ghost);
  g.hardDrop();
  assert.equal(g.board.flat().filter(Boolean).length, 4);
  for (const c of expected) assert.equal(g.board[c.y][c.x], c.type);
  assert.equal(g.placed, 1);
});

test('movement cannot cross walls or occupied cells', () => {
  const g = make();
  g.active = { type: 'O', x: 0, y: 10, rotation: 0 };
  assert.equal(g.move(-1), false);
  g.board[10][2] = 'I';
  assert.equal(g.move(1), false);
  g.board[10][2] = null;
  assert.equal(g.move(1), true);
  assert.equal(g.fits({ ...g.active, x: 9 }), false);
  assert.equal(g.fits({ ...g.active, y: 19 }), false);
});

test('wall and floor kicks keep T and I pieces inside the board', () => {
  for (const [type, x] of [['T', -1], ['I', -2]]) {
    const g = make();
    g.active = { type, x, y: 5, rotation: 1 };
    assert.ok(g.fits(g.active));
    assert.ok(g.rotate(1));
    assert.ok(g.fits(g.active));
    assert.ok(cells(g.active).every(c => c.x >= 0));
  }
  const g = make();
  g.active = { type: 'T', x: 3, y: 18, rotation: 0 };
  assert.ok(g.rotate(-1));
  assert.ok(g.fits(g.active));
  assert.ok(cells(g.active).every(c => c.y < 20));
});

test('blocked rotation leaves the active piece untouched', () => {
  const g = make();
  g.active = { type: 'T', x: 3, y: 8, rotation: 0 };
  const holes = new Set(cells(g.active).map(c => `${c.x},${c.y}`));
  g.board = g.board.map((row, y) => row.map((_, x) => holes.has(`${x},${y}`) ? null : 'O'));
  const before = { ...g.active };
  assert.equal(g.rotate(), false);
  assert.deepEqual(g.active, before);
});

test('hold is limited to once per piece and returns a reset orientation', () => {
  const g = make();
  const initial = g.active.type, next = g.queue[0];
  g.rotate(); g.move(-1);
  assert.ok(g.hold());
  assert.equal(g.held, initial); assert.equal(g.active.type, next);
  assert.equal(g.hold(), false);
  g.hardDrop();
  assert.ok(g.hold());
  assert.equal(g.active.type, initial); assert.equal(g.active.rotation, 0);
});

test('four-line clear animates before collapse, scores once, and earns flow', () => {
  const g = make(); fourLines(g);
  assert.equal(g.clearing.length, 4); assert.equal(g.active, null); assert.equal(g.lines, 0);
  advance(g, 0.3); assert.equal(g.lines, 0);
  advance(g, 0.2);
  assert.equal(g.lines, 4); assert.equal(g.score, 800); assert.equal(g.charge, 56);
  assert.equal(g.board.flat().filter(Boolean).length, 0);
  assert.ok(g.active);
  advance(g, 0.6); assert.equal(g.lines, 4);
});

test('line collapse preserves the cells above the cleared rows', () => {
  const g = make(); fourLines(g);
  g.board[13][0] = 'S'; g.board[14][8] = 'T';
  advance(g, 0.6);
  assert.equal(g.board[17][0], 'S'); assert.equal(g.board[18][8], 'T');
  assert.equal(g.board.length, ROWS); assert.ok(g.board.every(row => row.length === COLS));
});

test('grounded pieces have a lock delay and at most fifteen lock resets', () => {
  const g = make();
  g.active = { type: 'O', x: 4, y: 18, rotation: 0 };
  advance(g, 0.3); assert.equal(g.placed, 0);
  for (let i = 0; i < 15; i++) { g.move(i % 2 ? 1 : -1); advance(g, 0.1); }
  assert.equal(g.lockResets, 15);
  for (let i = 0; i < 8; i++) { g.move(i % 2 ? 1 : -1); advance(g, 0.1); }
  assert.ok(g.placed >= 1);
});

test('flow freezes gravity and automatic locking, permits hard drop, and doubles line points', () => {
  const g = make();
  assert.equal(g.activateFlow(), false);
  g.charge = 100;
  assert.ok(g.activateFlow()); assert.equal(g.activateFlow(), false);
  const initial = { ...g.active }; advance(g, 4);
  assert.deepEqual(g.active, initial); assert.equal(g.charge, 0);
  fourLines(g); advance(g, 0.6);
  assert.equal(g.score, 1600); assert.equal(g.charge, 0);
  g.active = { type: 'O', x: 4, y: 18, rotation: 0 };
  const placed = g.placed; advance(g, 3);
  assert.equal(g.placed, placed);
  advance(g, FLOW_SECONDS);
  assert.equal(g.flowing, false); assert.ok(g.placed > placed);
});

test('stage transitions at 24 and 48 lines; journey ends at 72', () => {
  const g = make();
  for (const [lines, stage, status] of [[20, 1, 'playing'], [44, 2, 'playing'], [68, 2, 'complete']]) {
    g.lines = lines; fourLines(g); advance(g, 0.6);
    assert.equal(g.stage, stage); assert.equal(g.status, status);
  }
  const before = g.serialize(); advance(g, 3); assert.equal(g.serialize(), before);
});

test('journey tops out, while zen renews the board and keeps its score', () => {
  for (const mode of ['journey', 'zen']) {
    const g = make(mode); g.score = 4321;
    g.board.forEach(row => row.fill('T')); g.spawn('O');
    if (mode === 'zen') {
      assert.equal(g.status, 'playing'); assert.ok(g.active);
      assert.equal(g.board.flat().filter(Boolean).length, 0);
      assert.equal(g.score, 4321);
      assert.ok(g.drainEvents().some(e => e.type === 'rebirth'));
    } else { assert.equal(g.status, 'over'); assert.equal(g.active, null); }
  }
});

test('saves restore mid-clear including a piece fixed by gravity', () => {
  const g = make();
  g.board[19] = Array.from({ length: COLS }, (_, x) => x >= 3 && x <= 6 ? null : 'S');
  g.active = { type: 'I', rotation: 0, x: 3, y: 18 };
  advance(g, 0.56);
  assert.equal(g.clearing.length, 1);
  const restored = restoreGame(g.serialize()); assert.ok(restored);
  advance(g, 1); advance(restored, 1);
  assert.equal(restored.serialize(), g.serialize());
});

test('corrupt, oversized and impossible saves are rejected without crashing', () => {
  assert.equal(restoreGame('{'), null); assert.equal(restoreGame('x'.repeat(17000)), null);
  for (const mutate of [s => s.board.pop(), s => s.board[0][0] = 'bad', s => s.active.x = 100, s => s.queue = ['T'], s => s.charge = 101, s => s.flowRemaining = 99, s => s.combo = -2, s => s.clearing = [18], s => s.score = -1, s => s.seed = 0, s => s.active = null]) {
    const raw = JSON.parse(make().serialize()); mutate(raw);
    assert.equal(restoreGame(JSON.stringify(raw)), null);
  }
});

test('3000 mixed actions preserve board bounds and a valid serializable game', () => {
  const g = make('zen');
  const actions = [() => g.move(-1), () => g.rotate(1), () => g.move(1), () => g.hold(), () => g.rotate(-1), () => g.softDrop(), () => g.hardDrop()];
  for (let i = 0; i < 3000; i++) {
    actions[(i * 47 + Math.floor(i / 7)) % actions.length](); advance(g, 0.06);
    assert.equal(g.board.length, ROWS); assert.ok(g.board.every(row => row.length === COLS));
    if (g.active) assert.ok(g.fits(g.active));
    if (i % 25 === 0) assert.ok(restoreGame(g.serialize()), `save at action ${i}`);
  }
});
