export const SIZE = 8;
export const TYPES = 6;
let serial = 0;
export const CHAPTERS = [
  { name: 'Лунные сады', subtitle: 'Там, где пробуждается свет', numeral: 'I', color: '#76e4d8' },
  { name: 'Янтарные руины', subtitle: 'Эхо забытого солнца', numeral: 'II', color: '#edbf6e' },
  { name: 'Звёздная обитель', subtitle: 'За гранью ночного неба', numeral: 'III', color: '#b5a5ff' },
];
export const GEM_NAMES = ['рубин', 'янтарь', 'аметист', 'изумруд', 'аквамарин', 'сапфир'];
export const GEM_COLORS = ['#ff667b', '#ffd06e', '#bc85ff', '#69edb7', '#73e9ff', '#7b9eff'];
export const tile = (type, special = null) => ({ id: ++serial, type, special });
export function adoptBoard(board) { serial = Math.max(serial, ...board.filter(Boolean).map(t => t.id)); return board; }
export const adjacent = (a, b) => a >= 0 && b >= 0 && a < 64 && b < 64 && Math.abs(a % 8 - b % 8) + Math.abs((a / 8 | 0) - (b / 8 | 0)) === 1;
export const swap = (board, a, b) => { [board[a], board[b]] = [board[b], board[a]]; };

export function levelConfig(number) {
  const n = Math.max(1, Math.min(30, number | 0));
  const chapter = (n - 1) / 10 | 0;
  const local = (n - 1) % 10;
  const goalA = (n - 1) % 6, goalB = (n + 3) % 6;
  return {
    number: n, chapter, moves: 26 + (local > 5 ? 2 : 0) + chapter * 2,
    target: 1800 + local * 180 + chapter * 850,
    goals: [{ type: goalA, target: 10 + local + chapter * 3 }, { type: goalB, target: 10 + local + chapter * 3 }],
    frost: n < 4 ? 0 : Math.min(24, 6 + local * 2 + chapter * 3),
  };
}

export function findGroups(board) {
  const runs = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8;) {
    const start = c, t = board[r * 8 + c]?.type;
    if (t == null || t < 0) { c++; continue; }
    while (c < 8 && board[r * 8 + c]?.type === t) c++;
    if (c - start >= 3) runs.push({ indices: Array.from({ length: c - start }, (_, j) => r * 8 + start + j), dir: 'h' });
  }
  for (let c = 0; c < 8; c++) for (let r = 0; r < 8;) {
    const start = r, t = board[r * 8 + c]?.type;
    if (t == null || t < 0) { r++; continue; }
    while (r < 8 && board[r * 8 + c]?.type === t) r++;
    if (r - start >= 3) runs.push({ indices: Array.from({ length: r - start }, (_, j) => (start + j) * 8 + c), dir: 'v' });
  }
  const groups = [];
  for (const run of runs) {
    const hits = groups.filter(g => run.indices.some(i => g.indices.includes(i)));
    if (!hits.length) groups.push({ indices: [...run.indices], runs: [run] });
    else {
      const merged = { indices: [...new Set([...run.indices, ...hits.flatMap(g => g.indices)])], runs: [run, ...hits.flatMap(g => g.runs)] };
      for (const hit of hits) groups.splice(groups.indexOf(hit), 1);
      groups.push(merged);
    }
  }
  return groups;
}

export function specialPair(board, a, b) {
  return board[a] && board[b] && (board[a].special === 'prism' || board[b].special === 'prism' || (board[a].special && board[b].special));
}

export function legalMoves(board) {
  const moves = [];
  for (let a = 0; a < 64; a++) {
    for (const b of [a % 8 < 7 ? a + 1 : -1, a < 56 ? a + 8 : -1]) {
      if (b < 0 || !board[a] || !board[b]) continue;
      if (specialPair(board, a, b)) { moves.push([a, b]); continue; }
      if (board[a].type === board[b].type) continue;
      swap(board, a, b);
      const groups = findGroups(board);
      swap(board, a, b);
      if (groups.some(g => g.indices.includes(a) || g.indices.includes(b))) moves.push([a, b]);
    }
  }
  return moves;
}

export function createBoard(rng = Math.random) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const board = [];
    for (let i = 0; i < 64; i++) {
      const choices = Array.from({ length: 6 }, (_, j) => j).filter(t => !(i % 8 >= 2 && board[i - 1]?.type === t && board[i - 2]?.type === t) && !(i >= 16 && board[i - 8]?.type === t && board[i - 16]?.type === t));
      board.push(tile(choices[Math.floor(rng() * choices.length)]));
    }
    if (legalMoves(board).length) return board;
  }
  throw new Error('Unable to create a playable board');
}

export function createFrost(count, rng = Math.random) {
  const frost = Array(64).fill(0);
  const choices = Array.from({ length: 64 }, (_, i) => i);
  for (let n = 0; n < count; n++) frost[choices.splice(Math.floor(rng() * choices.length), 1)[0]] = 1;
  return frost;
}

function footprint(i, special) {
  const row = i / 8 | 0, col = i % 8;
  if (special === 'h') return Array.from({ length: 8 }, (_, c) => row * 8 + c);
  if (special === 'v') return Array.from({ length: 8 }, (_, r) => r * 8 + col);
  if (special === 'bomb') {
    const cells = [];
    for (let r = Math.max(0, row - 1); r <= Math.min(7, row + 1); r++) for (let c = Math.max(0, col - 1); c <= Math.min(7, col + 1); c++) cells.push(r * 8 + c);
    return cells;
  }
  return [i];
}

export function planWave(board, preferred = [], forced = null) {
  const groups = forced ? [] : findGroups(board);
  if (!groups.length && !forced?.length) return null;
  const clear = new Set(forced || groups.flatMap(g => g.indices));
  const promotions = [];
  for (const group of groups) {
    const longest = group.runs.reduce((a, b) => b.indices.length > a.indices.length ? b : a);
    let special = null;
    if (longest.indices.length >= 5) special = 'prism';
    else if (group.runs.some(r => r.dir === 'h') && group.runs.some(r => r.dir === 'v')) special = 'bomb';
    else if (longest.indices.length === 4) special = longest.dir;
    if (special) {
      const available = group.indices.filter(i => !board[i]?.special);
      const cross = group.indices.find(i => group.runs.filter(r => r.indices.includes(i)).length > 1);
      const anchor = preferred.find(i => available.includes(i)) ?? (available.includes(cross) ? cross : available[available.length / 2 | 0]);
      if (anchor != null) promotions.push({ index: anchor, tile: tile(special === 'prism' ? -1 : board[anchor].type, special) });
    }
  }
  const activated = [];
  const queue = [...clear];
  const seen = new Set();
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    if (seen.has(i)) continue;
    seen.add(i);
    const item = board[i];
    if (!item?.special) continue;
    activated.push({ index: i, special: item.special, type: item.type });
    let cells;
    if (item.special === 'prism') {
      const counts = Array(6).fill(0);
      board.forEach(t => { if (t?.type >= 0) counts[t.type]++; });
      const type = counts.indexOf(Math.max(...counts));
      cells = board.flatMap((t, j) => t?.type === type ? [j] : []);
    } else cells = footprint(i, item.special);
    for (const j of cells) if (!clear.has(j)) { clear.add(j); queue.push(j); }
  }
  const matched = [...clear];
  promotions.forEach(p => clear.delete(p.index));
  return { clear: [...clear], matched, promotions, activated };
}

export function combinedWave(board, a, b) {
  const one = board[a], two = board[b];
  if (one.special === 'prism' || two.special === 'prism') {
    if (one.special === 'prism' && two.special === 'prism') return planWave(board, [], Array.from({ length: 64 }, (_, i) => i));
    const other = one.special === 'prism' ? two : one;
    const indices = board.flatMap((t, i) => t && t.type === other.type ? [i] : []);
    if (other.special) indices.forEach(i => { if (board[i].special !== 'prism') board[i].special = other.special; });
    // A swapped prism clears the selected color only; its regular chain activation is suppressed.
    const prismIndex = one.special === 'prism' ? a : b;
    const saved = board[prismIndex].special;
    board[prismIndex].special = null;
    const result = planWave(board, [], [...new Set([a, b, ...indices])]);
    board[prismIndex].special = saved;
    result.activated.push({ index: prismIndex, special: 'prism', type: other.type });
    return result;
  }
  let indices = [];
  if (one.special === 'bomb' && two.special === 'bomb') {
    const row = b / 8 | 0, col = b % 8;
    for (let r = Math.max(0, row - 2); r <= Math.min(7, row + 2); r++) for (let c = Math.max(0, col - 2); c <= Math.min(7, col + 2); c++) indices.push(r * 8 + c);
  } else if (one.special === 'bomb' || two.special === 'bomb') {
    const row = b / 8 | 0, col = b % 8;
    for (let i = 0; i < 64; i++) if (Math.abs((i / 8 | 0) - row) <= 1 || Math.abs(i % 8 - col) <= 1) indices.push(i);
  } else indices = [...footprint(b, 'h'), ...footprint(b, 'v')];
  return planWave(board, [], [...new Set([a, b, ...indices])]);
}

export function applyWave(board, frost, wave) {
  const collected = Array(6).fill(0);
  for (const i of wave.matched) if (board[i]?.type >= 0) collected[board[i].type]++;
  let ice = 0;
  for (const i of wave.matched) if (frost[i] > 0) { frost[i]--; ice++; }
  for (const i of wave.clear) board[i] = null;
  for (const p of wave.promotions) board[p.index] = p.tile;
  return { collected, ice, points: wave.matched.length * 60 + wave.promotions.length * 120 + wave.activated.length * 180 };
}

export function collapse(board, rng = Math.random) {
  const falls = [];
  for (let c = 0; c < 8; c++) {
    let dest = 7;
    for (let r = 7; r >= 0; r--) if (board[r * 8 + c]) {
      const item = board[r * 8 + c];
      if (dest !== r) { board[dest * 8 + c] = item; board[r * 8 + c] = null; falls.push({ id: item.id, from: r * 8 + c, to: dest * 8 + c }); }
      dest--;
    }
    const empty = dest + 1;
    for (let r = dest; r >= 0; r--) {
      const item = tile(Math.floor(rng() * 6));
      board[r * 8 + c] = item;
      falls.push({ id: item.id, from: (r - empty) * 8 + c, to: r * 8 + c });
    }
  }
  return falls;
}

export function shuffleBoard(board, rng = Math.random) {
  const original = [...board];
  for (let attempt = 0; attempt < 200; attempt++) {
    for (let i = 63; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); swap(board, i, j); }
    if (!findGroups(board).length && legalMoves(board).length) return board;
  }
  const fresh = createBoard(rng);
  // Keep earned special pieces even in the fallback board.
  original.filter(t => t?.special).forEach((t, i) => { fresh[i * 7 % 64].special = t.special; if (t.special === 'prism') fresh[i * 7 % 64].type = -1; });
  board.splice(0, 64, ...fresh);
  return board;
}
