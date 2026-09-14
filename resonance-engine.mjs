// A deterministic falling-block simulation, independent of rendering and audio.
export const COLS = 10;
export const ROWS = 20;
export const FLOW_SECONDS = 16;
export const STAGE_LINES = 24;
export const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
export const COLORS = { I: '#86eee9', O: '#f5d998', T: '#beabff', S: '#a6eac3', Z: '#f1a9c7', J: '#91bdff', L: '#efb98c' };
const TYPES = Object.keys(SHAPES);
const blank = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));
const piece = type => ({ type, x: type === 'O' ? 4 : 3, y: type === 'I' ? -1 : 0, rotation: 0 });
// Kick offsets use screen coordinates: positive y points down.
const KICKS = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};
const I_KICKS = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export function cells(p) {
  if (!p) return [];
  let shape = SHAPES[p.type];
  for (let turn = 0; turn < p.rotation; turn++) shape = shape[0].map((_, x) => shape.map(row => row[x]).reverse());
  return shape.flatMap((row, y) => row.flatMap((value, x) => value ? [{ x: p.x + x, y: p.y + y, type: p.type }] : []));
}

export class ResonanceGame {
  constructor({ mode = 'journey', seed = (Math.random() * 0xffffffff) >>> 0 } = {}) {
    this.mode = mode === 'zen' ? 'zen' : 'journey';
    this.seed = seed || 1;
    this.board = blank();
    this.queue = [];
    this.active = null;
    this.held = null;
    this.holdUsed = false;
    this.status = 'playing';
    this.score = 0;
    this.lines = 0;
    this.placed = 0;
    this.combo = -1;
    this.charge = 0;
    this.flowRemaining = 0;
    this.elapsed = 0;
    this.dropClock = 0;
    this.lockClock = 0;
    this.lockResets = 0;
    this.clearClock = 0;
    this.clearing = [];
    this.events = [];
    this.spawn();
  }

  get stage() { return this.mode === 'zen' ? Math.floor(this.lines / STAGE_LINES) % 3 : Math.min(2, Math.floor(this.lines / STAGE_LINES)); }
  get gravity() { return this.mode === 'zen' ? 1.25 : Math.max(0.36, 1.05 - Math.floor(this.lines / 8) * 0.075); }
  get flowing() { return this.flowRemaining > 0; }
  get playable() { return this.status === 'playing' && this.active !== null; }

  random() {
    let x = this.seed;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }

  fillQueue() {
    while (this.queue.length < 7) {
      const bag = [...TYPES];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      this.queue.push(...bag);
    }
  }

  fits(p) {
    return cells(p).every(({ x, y }) => x >= 0 && x < COLS && y < ROWS && y >= -4 && (y < 0 || !this.board[y][x]));
  }

  spawn(type) {
    this.fillQueue();
    this.active = piece(type || this.queue.shift());
    this.fillQueue();
    this.dropClock = this.lockClock = this.lockResets = 0;
    if (!this.fits(this.active)) this.topOut();
  }

  topOut() {
    if (this.mode === 'zen') {
      this.board = blank();
      this.combo = -1;
      this.active = piece(this.active?.type || this.queue.shift());
      this.dropClock = this.lockClock = this.lockResets = 0;
      this.events.push({ type: 'rebirth' });
    } else {
      this.status = 'over';
      this.active = null;
      this.events.push({ type: 'over' });
    }
  }

  resetLock(wasGrounded) {
    if (wasGrounded && this.lockResets < 15) {
      this.lockClock = 0;
      this.lockResets++;
    }
  }

  move(direction) {
    if (!this.playable || ![-1, 1].includes(direction)) return false;
    const next = { ...this.active, x: this.active.x + direction };
    if (!this.fits(next)) return false;
    const grounded = !this.fits({ ...this.active, y: this.active.y + 1 });
    this.active = next;
    this.resetLock(grounded);
    this.events.push({ type: 'move' });
    return true;
  }

  rotate(direction = 1) {
    if (!this.playable || this.active.type === 'O') return false;
    const rotation = (this.active.rotation + (direction === -1 ? 3 : 1)) % 4;
    const kicks = (this.active.type === 'I' ? I_KICKS : KICKS)[`${this.active.rotation}>${rotation}`];
    const grounded = !this.fits({ ...this.active, y: this.active.y + 1 });
    for (const [dx, dy] of kicks) {
      const next = { ...this.active, rotation, x: this.active.x + dx, y: this.active.y + dy };
      if (!this.fits(next)) continue;
      this.active = next;
      this.resetLock(grounded);
      this.events.push({ type: 'rotate' });
      return true;
    }
    return false;
  }

  softDrop() {
    if (!this.playable) return false;
    const next = { ...this.active, y: this.active.y + 1 };
    if (!this.fits(next)) return false;
    this.active = next;
    this.dropClock = 0;
    this.score++;
    return true;
  }

  ghost() {
    if (!this.active) return null;
    const ghost = { ...this.active };
    while (this.fits({ ...ghost, y: ghost.y + 1 })) ghost.y++;
    return ghost;
  }

  hardDrop() {
    if (!this.playable) return false;
    const from = cells(this.active);
    const landing = this.ghost();
    this.score += (landing.y - this.active.y) * 2;
    this.active = landing;
    this.events.push({ type: 'drop', from, cells: cells(landing) });
    this.lock();
    return true;
  }

  hold() {
    if (!this.playable || this.holdUsed) return false;
    const current = this.active.type;
    this.spawn(this.held);
    this.held = current;
    this.holdUsed = true;
    this.events.push({ type: 'hold' });
    return true;
  }

  activateFlow() {
    if (this.status !== 'playing' || this.charge < 100 || this.flowing) return false;
    this.charge = 0;
    this.flowRemaining = FLOW_SECONDS;
    this.events.push({ type: 'flow' });
    return true;
  }

  lock() {
    const locked = cells(this.active);
    if (locked.some(c => c.y < 0)) { this.topOut(); return; }
    this.dropClock = this.lockClock = 0;
    for (const { x, y, type } of locked) this.board[y][x] = type;
    this.active = null;
    this.holdUsed = false;
    this.placed++;
    this.events.push({ type: 'lock', cells: locked });
    this.clearing = this.board.flatMap((row, y) => row.every(Boolean) ? [y] : []);
    if (this.clearing.length) {
      this.clearClock = 0.48;
      this.events.push({ type: 'clear', rows: [...this.clearing], cells: this.clearing.flatMap(y => this.board[y].map((type, x) => ({ x, y, type }))) });
    } else {
      this.combo = -1;
      this.spawn();
    }
  }

  finishClear() {
    const count = this.clearing.length;
    const previousStage = this.stage;
    this.board = this.board.filter((_, y) => !this.clearing.includes(y));
    while (this.board.length < ROWS) this.board.unshift(Array(COLS).fill(null));
    this.combo++;
    this.score += (([0, 100, 300, 500, 800][count] || 800) + this.combo * 50) * (1 + Math.floor(this.lines / 8)) * (this.flowing ? 2 : 1);
    this.lines += count;
    if (!this.flowing) this.charge = Math.min(100, this.charge + count * 14);
    this.clearing = [];
    this.clearClock = 0;
    this.events.push({ type: 'score', count, combo: this.combo });
    if (this.stage !== previousStage) this.events.push({ type: 'stage', stage: this.stage });
    if (this.mode === 'journey' && this.lines >= STAGE_LINES * 3) {
      this.status = 'complete';
      this.events.push({ type: 'complete' });
    } else this.spawn();
  }

  update(dt) {
    if (this.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1); // Never catch up a background tab or a long stalled frame.
    this.elapsed += dt;
    const wasFlowing = this.flowing;
    this.flowRemaining = Math.max(0, this.flowRemaining - dt);
    if (wasFlowing && !this.flowing) {
      this.dropClock = this.lockClock = 0;
      this.events.push({ type: 'flow-end' });
    }
    if (this.clearing.length) {
      this.clearClock -= dt;
      if (this.clearClock <= 0) this.finishClear();
      return;
    }
    if (!this.active || this.flowing) return;
    this.dropClock += dt;
    if (this.dropClock >= this.gravity) {
      this.dropClock %= this.gravity;
      const next = { ...this.active, y: this.active.y + 1 };
      if (this.fits(next)) this.active = next;
    }
    if (!this.fits({ ...this.active, y: this.active.y + 1 })) {
      this.lockClock += dt;
      if (this.lockClock >= 0.55) this.lock();
    } else this.lockClock = 0;
  }

  drainEvents() { return this.events.splice(0); }

  serialize() {
    const { events, ...state } = this;
    return JSON.stringify({ version: 1, ...state });
  }
}

export function restoreGame(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 16000) return null;
    const s = JSON.parse(raw);
    const int = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
    const num = (v, max) => Number.isFinite(v) && v >= 0 && v <= max;
    const validType = t => TYPES.includes(t);
    if (s.version !== 1 || !['journey', 'zen'].includes(s.mode) || s.status !== 'playing') return null;
    if (!Array.isArray(s.board) || s.board.length !== ROWS || s.board.some(row => !Array.isArray(row) || row.length !== COLS || row.some(t => t !== null && !validType(t)))) return null;
    if (!Array.isArray(s.queue) || s.queue.length < 7 || s.queue.length > 14 || !s.queue.every(validType)) return null;
    if (s.held !== null && !validType(s.held)) return null;
    if (typeof s.holdUsed !== 'boolean' || !int(s.seed, 0xffffffff) || !s.seed) return null;
    for (const key of ['score', 'lines', 'placed']) if (!int(s[key], Number.MAX_SAFE_INTEGER)) return null;
    if (!Number.isInteger(s.combo) || s.combo < -1 || s.combo > s.placed) return null;
    if (!num(s.charge, 100) || !num(s.flowRemaining, FLOW_SECONDS) || !num(s.elapsed, Number.MAX_SAFE_INTEGER)) return null;
    if (!num(s.dropClock, 2) || !num(s.lockClock, 0.56) || !int(s.lockResets, 15) || !num(s.clearClock, 0.48)) return null;
    if (!Array.isArray(s.clearing) || s.clearing.length > 4 || new Set(s.clearing).size !== s.clearing.length || s.clearing.some(y => !int(y, ROWS - 1) || !s.board[y].every(Boolean))) return null;
    const full = s.board.flatMap((row, y) => row.every(Boolean) ? [y] : []);
    if (full.length !== s.clearing.length || (s.mode === 'journey' && s.lines >= STAGE_LINES * 3)) return null;
    if (s.clearing.length ? (s.active !== null || s.clearClock <= 0) : (!s.active || s.clearClock !== 0)) return null;
    if (s.active && (!validType(s.active.type) || !int(s.active.rotation, 3) || !Number.isInteger(s.active.x) || !Number.isInteger(s.active.y) || Math.abs(s.active.x) > 10 || s.active.y < -4 || s.active.y >= ROWS)) return null;
    const game = new ResonanceGame({ mode: s.mode, seed: s.seed });
    for (const key of Object.keys(game)) if (key !== 'events') game[key] = s[key];
    game.events = [];
    if (game.active && !game.fits(game.active)) return null;
    return game;
  } catch { return null; }
}
