import { COLS, ROWS, COLORS, SHAPES, cells } from './resonance-engine.mjs';

export const WORLDS = [
  { name: 'Северное сияние', detail: 'Вдохните. Всё начинается с одной искры.', color: '#a1e9da', rgb: [161, 233, 218], sky: [4, 17, 27], secondary: [95, 119, 199] },
  { name: 'Глубина', detail: 'Отпустите мысли. Доверьтесь течению.', color: '#94d9f0', rgb: [148, 217, 240], sky: [3, 14, 32], secondary: [68, 112, 191] },
  { name: 'Звёздный океан', detail: 'В каждом из нас — целая вселенная.', color: '#d3b8f4', rgb: [211, 184, 244], sky: [16, 10, 30], secondary: [186, 121, 172] },
];
const TAU = Math.PI * 2;
const rgba = (rgb, a) => `rgba(${rgb.map(Math.round).join(',')},${Math.max(0, a)})`;
const mix = (a, b, p) => a.map((v, i) => v + (b[i] - v) * p);
const lerp = (a, b, p) => a + (b - a) * p;

function glow(ctx, x, y, radius, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.18, rgba(color, alpha * 0.38));
  g.addColorStop(0.6, rgba(color, alpha * 0.1));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

export class ResonanceRenderer {
  constructor(background, board, { motion = true } = {}) {
    this.background = background;
    this.boardCanvas = board;
    this.bg = background.getContext('2d', { alpha: false });
    this.ctx = board.getContext('2d');
    this.motion = motion;
    this.time = 0;
    this.stage = 0;
    this.previousStage = 0;
    this.transition = 1;
    this.particles = [];
    this.rings = [];
    this.trails = [];
    this.rowFlashes = [];
    this.flash = 0;
    this.lastBackground = -1;
    this.lastActive = null;
    this.activeX = 0;
    this.activeY = 0;
    this.stars = Array.from({ length: 340 }, (_, i) => ({ x: this.random(i * 7 + 1), y: this.random(i * 7 + 2), z: this.random(i * 7 + 3), phase: this.random(i * 7 + 4) * TAU }));
    this.resize();
  }

  random(n) { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    this.background.width = Math.round(this.width * scale);
    this.background.height = Math.round(this.height * scale);
    this.bg.setTransform(scale, 0, 0, scale, 0, 0);
    const rect = this.boardCanvas.getBoundingClientRect();
    this.boardWidth = rect.width;
    this.boardHeight = rect.height;
    this.cell = rect.width / COLS;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.boardCanvas.width = Math.round(rect.width * dpr);
    this.boardCanvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.boardRect = rect;
    this.lastBackground = -1;
  }

  setWorld(stage) {
    if (stage === this.stage) return;
    this.previousStage = this.stage;
    this.stage = stage;
    this.transition = this.motion ? 0 : 1;
    this.lastBackground = -1;
  }

  setMotion(motion) {
    this.motion = motion;
    if (!motion) { this.particles = []; this.rings = []; this.trails = []; this.rowFlashes = []; this.flash = 0; this.transition = 1; }
    this.lastBackground = -1;
  }

  event(event) {
    if (!this.motion) return;
    const rect = this.boardCanvas.getBoundingClientRect();
    this.boardRect = rect;
    if (event.type === 'drop') {
      this.trails.push({ cells: event.cells, from: event.from, life: 0.32, max: 0.32 });
    }
    if (event.type === 'clear' || event.type === 'lock') {
      const clear = event.type === 'clear';
      const perCell = clear ? (this.width < 600 ? 6 : 10) : 3;
      for (const c of event.cells) {
        for (let i = 0; i < perCell; i++) {
          const angle = Math.random() * TAU, speed = (clear ? 80 : 25) + Math.random() * (clear ? 190 : 50);
          const life = (clear ? 1.6 : 0.6) + Math.random() * 0.8;
          this.particles.push({ x: rect.left + (c.x + 0.5) * this.cell, y: rect.top + (c.y + 0.5) * this.cell, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 25, life, max: life, size: 0.5 + Math.random() * 2, color: COLORS[c.type] });
        }
      }
      if (clear) {
        this.flash = 0.08 + event.rows.length * 0.035;
        for (const y of event.rows) {
          this.rings.push({ x: rect.left + rect.width / 2, y: rect.top + (y + 0.5) * this.cell, radius: 8, life: 1.8, max: 1.8, power: event.rows.length });
          this.rowFlashes.push({ y, life: 0.48 });
        }
      }
    }
    if (['flow', 'stage', 'rebirth', 'complete'].includes(event.type)) {
      this.rings.push({ x: this.width / 2, y: this.height / 2, radius: 0, life: 3, max: 3, power: 4 });
      this.flash = 0.22;
    }
    // Keep effects bounded even during repeated four-line clears.
    if (this.particles.length > 1000) this.particles.splice(0, this.particles.length - 1000);
    if (this.rings.length > 12) this.rings.splice(0, this.rings.length - 12);
    if (this.trails.length > 8) this.trails.splice(0, this.trails.length - 8);
  }

  draw(game, dt, pulse = 0, paused = false) {
    if (!paused) {
      if (this.motion) this.time += dt;
      this.transition = Math.min(1, this.transition + dt / 4);
      this.flash *= Math.exp(-dt * 2.6);
      for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-dt * 0.7); p.vy += dt * 9; p.life -= dt; }
      for (const r of this.rings) { r.radius += dt * (180 + r.power * 40); r.life -= dt; }
      for (const t of this.trails) t.life -= dt;
      for (const f of this.rowFlashes) f.life -= dt;
      this.particles = this.particles.filter(p => p.life > 0);
      this.rings = this.rings.filter(r => r.life > 0);
      this.trails = this.trails.filter(t => t.life > 0);
      this.rowFlashes = this.rowFlashes.filter(f => f.life > 0);
    }
    const now = performance.now();
    if (this.lastBackground < 0 || ((!paused && this.motion) || this.transition < 1) && now - this.lastBackground > 32) {
      this.drawBackground(this.motion ? pulse : 0, game.flowing);
      this.lastBackground = now;
    }
    this.drawBoard(game, dt, this.motion ? pulse : 0);
  }

  drawBackground(pulse, flow) {
    const ctx = this.bg, w = this.width, h = this.height, t = this.time;
    const ease = this.transition * this.transition * (3 - 2 * this.transition);
    const old = WORLDS[this.previousStage], world = WORLDS[this.stage];
    const color = mix(old.rgb, world.rgb, ease), sky = mix(old.sky, world.sky, ease);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba(sky, 1); ctx.fillRect(0, 0, w, h);
    glow(ctx, w * 0.5, h * 0.4, w * 0.53, color, 0.12 + pulse * 0.025);
    glow(ctx, w * 0.14, h * 0.16, w * 0.5, mix(old.secondary, world.secondary, ease), 0.11);
    const scenes = this.transition < 1 ? [[this.previousStage, 1 - ease], [this.stage, ease]] : [[this.stage, 1]];
    for (const [stage, alpha] of scenes) {
      ctx.save(); ctx.globalAlpha = alpha;
      if (stage === 0) this.aurora(ctx, w, h, t, pulse);
      if (stage === 1) this.ocean(ctx, w, h, t, pulse);
      if (stage === 2) this.cosmos(ctx, w, h, t, pulse);
      ctx.restore();
    }
    // A field of slow, depth-separated motes; the center stays quiet and legible.
    ctx.globalCompositeOperation = 'screen';
    const count = w < 600 ? 160 : this.stars.length;
    for (let i = 0; i < count; i++) {
      const star = this.stars[i];
      const x = (star.x * w + Math.sin(t * 0.05 + star.phase) * 12 + w) % w;
      const y = (star.y * h - t * (1 + star.z * 4) + h * 10) % h;
      const twinkle = 0.35 + 0.25 * Math.sin(t * 0.6 + star.phase);
      ctx.fillStyle = rgba(color, twinkle * (0.3 + star.z * 0.7));
      ctx.beginPath(); ctx.arc(x, y, 0.45 + star.z * 1.1, 0, TAU); ctx.fill();
      if (star.z > 0.94) {
        ctx.strokeStyle = rgba(color, twinkle * 0.3);
        ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke();
      }
    }
    // Orbit encircles the playfield and breathes with the score.
    const orbit = Math.min(w * 0.31, h * 0.38);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = rgba(color, (0.07 - i * 0.018) + pulse * 0.016);
      ctx.lineWidth = i ? 0.7 : 1;
      ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.49, orbit + i * 13, orbit + i * 13, t * 0.015, 0, TAU); ctx.stroke();
    }
    for (const p of this.particles) {
      const alpha = Math.min(1, p.life / p.max * 1.8);
      ctx.globalAlpha = alpha; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      ctx.strokeStyle = p.color; ctx.lineWidth = p.size * 0.4;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) {
      ctx.strokeStyle = rgba(color, r.life / r.max * 0.4);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.radius, 0, TAU); ctx.stroke();
      ctx.strokeStyle = rgba(color, r.life / r.max * 0.1); ctx.lineWidth = 12;
      ctx.stroke();
    }
    if (flow) {
      glow(ctx, w / 2, h / 2, Math.max(w, h) * 0.65, [159, 168, 243], 0.1 + pulse * 0.06);
      const radius = orbit * (1.06 + Math.sin(t) * 0.015);
      ctx.strokeStyle = rgba(color, 0.24); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w / 2, h * 0.49, radius, -Math.PI / 2, t * 0.5); ctx.stroke();
    }
    if (this.flash > 0.002) glow(ctx, w / 2, h * 0.7, w * 0.75, color, this.flash);
    ctx.globalCompositeOperation = 'source-over';
    const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.15, w / 2, h / 2, Math.max(w, h) * 0.7);
    vignette.addColorStop(0, 'transparent'); vignette.addColorStop(1, '#02070d9c');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
  }

  aurora(ctx, w, h, t, pulse) {
    ctx.globalCompositeOperation = 'screen';
    // Silk-like curtains made of translucent ribbons, not a static backdrop.
    const ribbons = w < 600 ? 28 : 44;
    for (let band = 0; band < 3; band++) {
      for (let j = 0; j < ribbons; j++) {
        const depth = j / ribbons;
        ctx.beginPath();
        for (let i = 0; i <= 70; i++) {
          const u = i / 70;
          const x = u * w;
          const wave = Math.sin(u * 5.2 + t * 0.065 + band * 1.8) * h * 0.13 + Math.sin(u * 12 - t * 0.1 + band) * h * 0.035;
          const y = h * (0.24 + band * 0.07) + wave - depth * h * (0.19 + Math.sin(u * 8 + band) * 0.08);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = band === 1 ? `rgba(94,144,226,${(1 - depth) ** 2 * 0.065})` : `rgba(101,233,189,${Math.sin(depth * Math.PI) * (0.035 + pulse * 0.012)})`;
        ctx.lineWidth = h * 0.006; ctx.stroke();
      }
    }
    glow(ctx, w * 0.78, h * 0.24, Math.min(w, h) * 0.17, [163, 211, 214], 0.14);
    ctx.fillStyle = '#c9e5dfb3'; ctx.beginPath(); ctx.arc(w * 0.78, h * 0.24, Math.max(2, h * 0.012), 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // Layered mountain silhouettes and a dark reflective lake.
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let i = 0; i <= 60; i++) {
        const x = i / 60 * w;
        const middle = Math.abs(i / 60 - 0.5) * 2;
        const y = h * (0.8 + layer * 0.045) - (Math.sin(i * 0.48 + layer * 2) * 0.035 + this.random(i + layer * 80) * 0.05 + middle * 0.065) * h;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h); ctx.closePath();
      ctx.fillStyle = ['#102632', '#0a1c28', '#07131e'][layer]; ctx.fill();
    }
    const lake = ctx.createLinearGradient(0, h * 0.82, 0, h);
    lake.addColorStop(0, '#17373655'); lake.addColorStop(1, '#06111b');
    ctx.fillStyle = lake; ctx.fillRect(0, h * 0.85, w, h * 0.15);
    for (let i = 0; i < 20; i++) {
      const y = h * (0.86 + i * 0.0065);
      ctx.strokeStyle = `rgba(126,206,190,${0.045 * (1 - i / 20)})`;
      ctx.beginPath(); ctx.moveTo(w * (0.12 + Math.sin(i * 2.4 + t * 0.1) * 0.04), y); ctx.lineTo(w * (0.9 - Math.sin(i * 0.7) * 0.05), y); ctx.stroke();
    }
  }

  ocean(ctx, w, h, t, pulse) {
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 6; i++) {
      const x = w * (0.12 + i * 0.17), sway = Math.sin(t * 0.12 + i) * w * 0.05;
      const ray = ctx.createLinearGradient(x, 0, x + sway, h);
      ray.addColorStop(0, '#58b3d31c'); ray.addColorStop(1, '#58b3d300');
      ctx.fillStyle = ray; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w * 0.025, 0); ctx.lineTo(x + sway + w * 0.16, h); ctx.lineTo(x + sway - w * 0.08, h); ctx.fill();
    }
    for (const [i, x, y, size] of [[0, 0.17, 0.47, 0.075], [1, 0.83, 0.61, 0.055], [2, 0.72, 0.25, 0.025], [3, 0.29, 0.73, 0.023]]) {
      const radius = Math.min(w, h) * size * (1 + Math.sin(t * 0.7 + i) * 0.055);
      const cx = x * w + Math.sin(t * 0.09 + i) * 12, cy = y * h + Math.sin(t * 0.17 + i * 2) * 18;
      glow(ctx, cx, cy, radius * 2.4, [111, 185, 235], 0.1 + pulse * 0.02);
      const bell = ctx.createRadialGradient(cx, cy - radius * 0.3, 0, cx, cy, radius);
      bell.addColorStop(0, '#a7e0fa1a'); bell.addColorStop(0.8, '#86c7ef14'); bell.addColorStop(1, '#a7e0fa55');
      ctx.fillStyle = bell; ctx.beginPath(); ctx.ellipse(cx, cy, radius, radius * 0.68, 0, Math.PI, TAU); ctx.bezierCurveTo(cx + radius * 0.4, cy + radius * 0.23, cx - radius * 0.4, cy + radius * 0.23, cx - radius, cy); ctx.fill();
      for (let arm = 0; arm < 9; arm++) {
        ctx.beginPath();
        for (let step = 0; step <= 26; step++) {
          const u = step / 26, px = cx + (arm / 8 - 0.5) * radius * 1.5 + Math.sin(u * 7 + t * 0.55 + arm * 0.7) * radius * u * 0.3;
          const py = cy + u * radius * (2.5 + Math.sin(arm) * 0.4);
          step ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.strokeStyle = `rgba(142,203,246,${0.1 + (arm % 3) * 0.035})`; ctx.lineWidth = 0.8; ctx.stroke();
      }
    }
  }

  cosmos(ctx, w, h, t, pulse) {
    ctx.globalCompositeOperation = 'screen';
    glow(ctx, w * 0.25, h * 0.5, w * 0.35, [106, 104, 200], 0.12);
    glow(ctx, w * 0.8, h * 0.4, w * 0.4, [188, 102, 166], 0.12);
    const cx = w * 0.78, cy = h * 0.34, r = Math.min(w, h) * 0.105;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.45);
    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = `rgba(193,161,223,${0.015 + Math.sin(i / 18 * Math.PI) * 0.07})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 0, r * (1.5 + i * 0.035), r * (0.38 + i * 0.009), 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    const planet = ctx.createRadialGradient(cx - r * 0.55, cy - r * 0.5, r * 0.03, cx, cy, r);
    planet.addColorStop(0, '#756c9e'); planet.addColorStop(0.45, '#363149'); planet.addColorStop(1, '#100d20');
    ctx.fillStyle = planet; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = '#c8b5ee55'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.86, Math.PI * 1.9); ctx.stroke();
    const orbitX = w * 0.19, orbitY = h * 0.55;
    for (let i = 0; i < 190; i++) {
      const u = i / 190, angle = u * TAU * 3 + t * 0.022, radius = Math.sqrt(u) * Math.min(w * 0.2, h * 0.25);
      const x = orbitX + Math.cos(angle) * radius, y = orbitY + Math.sin(angle) * radius * 0.46;
      ctx.fillStyle = `rgba(199,183,243,${0.12 + u * 0.35})`;
      ctx.beginPath(); ctx.arc(x, y, 0.7 + this.random(i) * 0.6, 0, TAU); ctx.fill();
    }
    glow(ctx, orbitX, orbitY, 65, [219, 192, 248], 0.2 + pulse * 0.025);
  }

  block(ctx, x, y, size, type, { ghost = false, active = false, alpha = 1 } = {}) {
    const color = COLORS[type];
    const gap = Math.max(1.5, size * 0.055), s = size - gap * 2;
    x += gap; y += gap;
    ctx.globalAlpha = alpha;
    if (ghost) {
      ctx.fillStyle = `${color}08`; ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = `${color}70`; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      const corner = size * 0.16;
      ctx.strokeStyle = `${color}b3`;
      ctx.beginPath(); ctx.moveTo(x, y + corner); ctx.lineTo(x, y); ctx.lineTo(x + corner, y); ctx.moveTo(x + s - corner, y + s); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s, y + s - corner); ctx.stroke();
    } else {
      ctx.shadowColor = color; ctx.shadowBlur = active ? size * 0.45 : 0;
      const fill = ctx.createLinearGradient(x, y, x + s, y + s);
      fill.addColorStop(0, `${color}${active ? 'f2' : 'b3'}`); fill.addColorStop(0.45, `${color}${active ? '9c' : '5c'}`); fill.addColorStop(1, `${color}24`);
      ctx.fillStyle = fill; ctx.fillRect(x, y, s, s);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `${color}${active ? 'ed' : '99'}`; ctx.lineWidth = 0.8; ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      ctx.strokeStyle = '#ffffff6b'; ctx.beginPath(); ctx.moveTo(x + 1, y + s - 1); ctx.lineTo(x + 1, y + 1); ctx.lineTo(x + s - 1, y + 1); ctx.stroke();
      ctx.strokeStyle = `${color}42`; ctx.strokeRect(x + s * 0.22, y + s * 0.22, s * 0.56, s * 0.56);
      ctx.fillStyle = '#fff8'; ctx.fillRect(x + s * 0.23, y + s * 0.23, Math.max(1, s * 0.065), Math.max(1, s * 0.065));
    }
    ctx.globalAlpha = 1;
  }

  drawBoard(game, dt, pulse) {
    const ctx = this.ctx, w = this.boardWidth, h = this.boardHeight, s = this.cell;
    ctx.clearRect(0, 0, w, h);
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, '#08172199'); base.addColorStop(1, '#07121de0');
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#b3d6e00a'; ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) { ctx.moveTo(x * s, 0); ctx.lineTo(x * s, h); }
    for (let y = 1; y < ROWS; y++) { ctx.moveTo(0, y * s); ctx.lineTo(w, y * s); }
    ctx.stroke();
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const type = game.board[y][x];
      if (type) this.block(ctx, x * s, y * s, s, type, { alpha: game.clearing.includes(y) ? Math.max(0.1, game.clearClock / 0.48) : 1 });
    }
    for (const trail of this.trails) {
      const alpha = trail.life / trail.max;
      for (let i = 0; i < trail.cells.length; i++) {
        const c = trail.cells[i], from = trail.from[i];
        const g = ctx.createLinearGradient(0, from.y * s, 0, (c.y + 1) * s);
        g.addColorStop(0, `${COLORS[c.type]}00`); g.addColorStop(1, `${COLORS[c.type]}66`);
        ctx.globalAlpha = alpha; ctx.fillStyle = g;
        ctx.fillRect(c.x * s + 2, from.y * s, s - 4, (c.y - from.y + 1) * s);
      }
    }
    ctx.globalAlpha = 1;
    if (game.active) {
      const ghost = game.ghost();
      for (const c of cells(ghost)) if (c.y >= 0) this.block(ctx, c.x * s, c.y * s, s, c.type, { ghost: true });
      const identity = `${game.placed}:${game.active.type}:${game.holdUsed}`;
      if (this.lastActive !== identity || !this.motion) { this.activeX = game.active.x; this.activeY = game.active.y; }
      this.lastActive = identity;
      const smoothing = 1 - Math.exp(-dt * 32);
      this.activeX = lerp(this.activeX, game.active.x, smoothing);
      this.activeY = lerp(this.activeY, game.active.y, smoothing);
      const offsetX = this.activeX - game.active.x, offsetY = this.activeY - game.active.y;
      for (const c of cells(game.active)) this.block(ctx, (c.x + offsetX) * s, (c.y + offsetY) * s, s, c.type, { active: true });
    }
    for (const f of this.rowFlashes) {
      const alpha = f.life / 0.48;
      const y = (f.y + 0.5) * s;
      glow(ctx, w / 2, y, w * 0.8, WORLDS[this.stage].rgb, alpha * 0.4);
      ctx.fillStyle = `rgba(226,250,245,${alpha * 0.7})`; ctx.fillRect(0, y - 1.2, w, 2.4);
    }
    if (game.flowing) {
      ctx.strokeStyle = rgba(WORLDS[this.stage].rgb, 0.22 + pulse * 0.12);
      ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  preview(canvas, type) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    if (!type || !SHAPES[type]) return;
    const points = cells({ type, x: 0, y: 0, rotation: 0 });
    const minX = Math.min(...points.map(c => c.x)), maxX = Math.max(...points.map(c => c.x));
    const minY = Math.min(...points.map(c => c.y)), maxY = Math.max(...points.map(c => c.y));
    const size = Math.min(20, rect.width / 5, rect.height / 2.7);
    const left = (rect.width - (maxX - minX + 1) * size) / 2;
    const top = (rect.height - (maxY - minY + 1) * size) / 2;
    for (const c of points) this.block(ctx, left + (c.x - minX) * size, top + (c.y - minY) * size, size, type);
  }
}
