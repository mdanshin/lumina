import { CHAPTERS, GEM_NAMES, GEM_COLORS, adjacent, swap, tile, adoptBoard, levelConfig, createBoard, createFrost, findGroups, legalMoves, specialPair, planWave, combinedWave, applyWave, collapse, shuffleBoard } from './engine.mjs';

const $ = id => document.getElementById(id);
const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const gem = type => `<span class="gem-icon gem-${type}" aria-hidden="true"></span>`;
const fmt = n => Math.floor(n).toLocaleString('ru-RU');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wait = ms => new Promise(r => setTimeout(r, prefs.motion ? ms : Math.min(ms, 40)));
const STORAGE = 'lumina-gardens-v1';
const defaults = () => ({ version: 1, unlocked: 1, completed: {}, sessions: {}, mode: 'adventure', zenBest: 0, visited: [0], prefs: { muted: false, sfx: true, music: true, motion: !matchMedia('(prefers-reduced-motion: reduce)').matches, autoHints: true }, seen: false });
let profile = defaults(), storageAvailable = true;
try {
  const stored = JSON.parse(localStorage.getItem(STORAGE));
  if (stored?.version === 1) {
    profile = { ...profile, ...stored, prefs: { ...profile.prefs, ...stored.prefs } };
    profile.unlocked = clamp(Number(profile.unlocked) || 1, 1, 30);
    if (!profile.completed || typeof profile.completed !== 'object') profile.completed = {};
    if (!profile.sessions || typeof profile.sessions !== 'object') profile.sessions = {};
    if (!['adventure', 'zen'].includes(profile.mode)) profile.mode = 'adventure';
    if (!Array.isArray(profile.visited)) profile.visited = [0];
  }
} catch { storageAvailable = false; }
const prefs = profile.prefs;
let state, busy = false, selected = -1, cursor = 0, keyboardFocus = false, armed = false, hinted = [], hintUntil = 0, lastAction = performance.now(), epoch = 0;
let particles = [], rings = [], beams = [], labels = [], moving = new Map(), vanishing = new Map();
let toastTimer, comboTimer, autosaveWarningShown = false;
const canvas = $('board'), ctx = canvas.getContext('2d', { alpha: true });
const atlas = new Image();
let atlasReady = false;
const SIZE = 640, CELL = 80;
// Палитра поля для каждого мира: клетки, преграда (лёд, песок, пыль) и её узор.
const THEMES = [
  { cellA: '#163b403b', cellB: '#20505830', grid: '#90c8bf10', frostFill: '#a2d9f220', frostLine: '#b5effb65', frostMark: '#c4f1ff55', chrome: '#071d25' },
  { cellA: '#4a331b3f', cellB: '#5f452534', grid: '#e6b97c14', frostFill: '#e6bd7a2c', frostLine: '#f0cd8a72', frostMark: '#ffe2a866', chrome: '#1b120a' },
  { cellA: '#2b254f3f', cellB: '#3b306a34', grid: '#bcaaff14', frostFill: '#c8b9ff24', frostLine: '#dacdff6c', frostMark: '#efe7ff66', chrome: '#0c0a22' },
];
const point = index => ({ x: ((index % 8 + 8) % 8) * CELL + CELL / 2, y: Math.floor(index / 8) * CELL + CELL / 2 });
const ease = p => 1 - Math.pow(1 - clamp(p, 0, 1), 3);

class Soundscape {
  constructor() { this.context = null; this.timer = null; this.step = 0; }
  start() {
    if (document.hidden) return;
    try {
      if (!this.context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        this.context = new Audio();
        this.master = this.context.createGain(); this.master.gain.value = .36; this.master.connect(this.context.destination);
        this.echo = this.context.createDelay(1); this.echo.delayTime.value = .32;
        const echoGain = this.context.createGain(); echoGain.gain.value = .16;
        this.echo.connect(echoGain); echoGain.connect(this.master);
      }
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      if (!this.timer) { this.ambient(); this.timer = setInterval(() => this.ambient(), 3200); }
    } catch { /* Browsers without audio support can still play. */ }
  }
  tone(freq, start = 0, duration = .4, volume = .16, kind = 'sine', glide = null) {
    const ac = this.context;
    if (!ac || ac.state !== 'running' || prefs.muted || document.hidden) return;
    const t = ac.currentTime + start, osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = kind; osc.frequency.setValueAtTime(freq, t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t + duration);
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(volume, t + .015); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(gain); gain.connect(this.master); gain.connect(this.echo); osc.start(t); osc.stop(t + duration + .03);
  }
  ambient() {
    if (!prefs.music || prefs.muted || document.hidden) return;
    const chords = [[130.81, 196, 261.63, 329.63], [110, 164.81, 220, 293.66], [87.31, 130.81, 174.61, 261.63], [98, 146.83, 196, 293.66]];
    const chord = chords[Math.floor(this.step / 2) % chords.length];
    chord.forEach((f, i) => this.tone(f, i * .38, 3, .045));
    this.tone(chord[(this.step + 1) % 4] * 4, .95, 2, .022);
    this.step++;
  }
  play(name, cascade = 1) {
    if (!prefs.sfx || prefs.muted) return;
    this.start();
    if (name === 'select') this.tone(690, 0, .10, .11);
    if (name === 'swap') { this.tone(350, 0, .13, .12, 'sine', 660); this.tone(520, .05, .16, .08); }
    if (name === 'invalid') this.tone(190, 0, .23, .13, 'sine', 120);
    if (name === 'match') {
      const root = 523.25 * Math.pow(1.12246, Math.min(cascade - 1, 7));
      [1, 1.25, 1.5].forEach((v, i) => this.tone(root * v, i * .045, .46, .12));
      this.tone(root / 2, 0, .25, .09, 'triangle');
    }
    if (name === 'special') { [261.63, 392, 523.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, i * .055, .75, .11)); this.tone(80, 0, .5, .25, 'sine', 35); }
    if (name === 'win') [523.25, 659.25, 783.99, 1046.5, 987.77, 1046.5].forEach((f, i) => this.tone(f, i * .17, 1.1, .17));
    if (name === 'lose') [392, 329.63, 261.63].forEach((f, i) => this.tone(f, i * .22, .8, .10));
    if (name === 'shuffle') [260, 390, 520, 780, 1040].forEach((f, i) => this.tone(f, i * .07, .4, .09));
  }
}
const audio = new Soundscape();

function toast(message) {
  $('toast').textContent = message; $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3600);
}
function announce(message) { $('announcer').textContent = message; }
function save() {
  if (state && !busy) profile.sessions[state.mode] = JSON.parse(JSON.stringify(state));
  profile.prefs = prefs;
  try { localStorage.setItem(STORAGE, JSON.stringify(profile)); }
  catch {
    storageAvailable = false;
    if (!autosaveWarningShown) { autosaveWarningShown = true; toast('Не удалось сохранить прогресс. Игра доступна до закрытия вкладки.'); }
  }
  $('save-status').textContent = storageAvailable ? 'Прогресс сохраняется на этом устройстве' : 'Прогресс доступен только в этой вкладке';
}
function validSession(s, mode) {
  return s && s.mode === mode && Array.isArray(s.board) && s.board.length === 64 && new Set(s.board.map(t => t?.id)).size === 64 && s.board.every(t => t && Number.isInteger(t.id) && t.id > 0 && Number.isInteger(t.type) && t.type >= -1 && t.type <= 5 && [null, 'h', 'v', 'bomb', 'prism'].includes(t.special) && (t.type !== -1 || t.special === 'prism')) && Array.isArray(s.frost) && s.frost.length === 64 && s.frost.every(v => v === 0 || v === 1) && Number.isFinite(s.score) && s.score >= 0 && Number.isInteger(s.moves) && Array.isArray(s.collected) && s.collected.length === 6 && s.collected.every(v => Number.isFinite(v) && v >= 0) && s.boosters && Number.isInteger(s.boosters.hammer) && Number.isInteger(s.boosters.shuffle) && ['playing', 'won', 'lost'].includes(s.status) && Number.isInteger(s.level) && s.level >= 1 && s.level <= profile.unlocked;
}
function freshState(level, mode) {
  const config = levelConfig(level);
  return { level, mode, config, board: createBoard(), frost: createFrost(mode === 'zen' ? 0 : config.frost, Math.random, config.chapter), moves: mode === 'zen' ? -1 : config.moves, score: 0, collected: Array(6).fill(0), ice: 0, boosters: { hammer: 3, shuffle: 2 }, status: 'playing', turns: 0, bestCascade: 0 };
}
function loadGame(mode = 'adventure', level = null) {
  epoch++; busy = false; armed = false; selected = -1; cursor = 0; particles = []; rings = []; beams = []; labels = []; moving.clear(); vanishing.clear(); hinted = [];
  const saved = profile.sessions[mode];
  state = level === null && validSession(saved, mode) ? JSON.parse(JSON.stringify(saved)) : freshState(level || (mode === 'zen' ? 1 : profile.unlocked), mode);
  state.config = levelConfig(state.level);
  adoptBoard(state.board);
  if (state.status === 'playing' && (findGroups(state.board).length || !legalMoves(state.board).length)) shuffleBoard(state.board);
  profile.mode = mode; document.body.classList.toggle('zen-mode', mode === 'zen');
  if ($('modal').open) $('modal').close();
  lastAction = performance.now(); updateHUD(); updateJourney();
  const fresh = state.status === 'playing' && state.turns === 0;
  if (mode === 'adventure' && fresh && !profile.visited.includes(state.config.chapter)) { profile.visited.push(state.config.chapter); setTimeout(() => chapterModal(state.config.chapter), 350); }
  save();
  if (state.status === 'won') setTimeout(() => resultModal(true), 150);
  else if (state.status === 'lost') setTimeout(() => resultModal(false), 150);
}
let shownChapter = null, veilTimer = 0;
// Смена мира: короткое затемнение, новая палитра страницы и цвет системной панели.
function applyChapter(chapter) {
  if (shownChapter === chapter) return;
  const first = shownChapter === null; shownChapter = chapter;
  const swap = () => { document.body.dataset.chapter = String(chapter); document.querySelector('meta[name="theme-color"]').setAttribute('content', THEMES[chapter].chrome); };
  if (first || !prefs.motion) { swap(); return; }
  clearTimeout(veilTimer); $('veil').classList.add('on');
  veilTimer = setTimeout(() => { swap(); $('veil').classList.remove('on'); }, 420);
}
function updateHUD() {
  const { mode, config, score, moves, collected } = state, zen = mode === 'zen';
  const chapter = CHAPTERS[config.chapter];
  applyChapter(config.chapter);
  $('chapter-label').textContent = zen ? 'БЕЗ СПЕШКИ. БЕЗ ГРАНИЦ.' : `ГЛАВА ${chapter.numeral}`;
  $('chapter-title').textContent = zen ? 'В потоке света' : chapter.name;
  $('chapter-subtitle').textContent = zen ? 'Пусть весь мир немного подождёт' : chapter.subtitle;
  $('adventure-mode').classList.toggle('active', !zen); $('zen-mode').classList.toggle('active', zen);
  $('adventure-mode').setAttribute('aria-pressed', String(!zen)); $('zen-mode').setAttribute('aria-pressed', String(zen));
  $('level-label').textContent = zen ? 'РЕЖИМ ДЗЕН' : `УРОВЕНЬ ${String(state.level).padStart(2, '0')}`;
  $('moves').textContent = zen ? '∞' : moves;
  $('moves-label').textContent = zen ? 'ПОТОК' : 'ХОДОВ';
  $('moves-ring').style.strokeDashoffset = zen ? 0 : 333 * (1 - moves / config.moves);
  document.querySelector('.moves-panel').classList.toggle('low', !zen && moves <= 5);
  $('moves-warning').textContent = !zen && moves <= 5 ? 'Каждый ход — искра' : '';
  $('score').textContent = fmt(score); $('score-target').textContent = zen ? '' : `/ ${fmt(config.target)}`;
  $('score-fill').style.width = `${zen ? (score % 5000) / 50 : Math.min(100, score / (config.target * 2) * 100)}%`;
  $('score-stars').querySelectorAll('svg').forEach((s, i) => s.classList.toggle('earned', score >= (zen ? 1500 : config.target) * [1, 1.5, 2][i]));
  $('personal-best').textContent = zen ? `Лучший поток: ${fmt(Math.max(score, profile.zenBest))}` : profile.completed[state.level] ? `Лучший результат: ${fmt(profile.completed[state.level].score)}` : 'Пусть кристаллы засияют';
  document.querySelector('.goals-panel .panel-title>span').textContent = zen ? 'СВОБОДНАЯ ИГРА' : 'ЦЕЛЬ УРОВНЯ';
  $('goals').innerHTML = zen ? `<div class="zen-goal">${icon('infinity')}<span>Без целей<br>Без спешки</span></div>` : config.goals.map(g => {
    const value = Math.min(collected[g.type], g.target), done = value >= g.target;
    return `<div class="goal ${done ? 'done' : ''}" aria-label="${GEM_NAMES[g.type]}: ${value} из ${g.target}">${gem(g.type)}<div class="goal-track"><span class="goal-amount">${done ? icon('check') : value}<small> / ${g.target}</small></span><div class="goal-mini-track"><i style="width:${value / g.target * 100}%"></i></div></div></div>`;
  }).join('') + (config.frost ? `<div class="goal frost ${state.ice >= config.frost ? 'done' : ''}" aria-label="${chapter.frostName}: ${state.ice} из ${config.frost}"><span class="goal-symbol">${icon(chapter.frostIcon)}</span><span class="goal-amount">${state.ice >= config.frost ? icon('check') : state.ice}<small> / ${config.frost}</small></span></div>` : '');
  $('goal-note').innerHTML = zen ? 'Следуйте за сиянием.<br>Усилители не заканчиваются.' : config.frost ? chapter.frostNote : 'Соберите кристаллы<br>и наполните сады светом.';
  $('hammer-count').textContent = zen ? '∞' : state.boosters.hammer;
  $('shuffle-count').textContent = zen ? '∞' : state.boosters.shuffle;
  $('hammer-button').disabled = busy || state.status !== 'playing' || (!zen && state.boosters.hammer <= 0);
  $('shuffle-button').disabled = busy || state.status !== 'playing' || (!zen && state.boosters.shuffle <= 0);
  $('hint-button').disabled = busy || state.status !== 'playing';
  $('hammer-button').classList.toggle('armed', armed); $('board-frame').classList.toggle('hammer-armed', armed);
  $('hammer-button').setAttribute('aria-pressed', String(armed));
  $('hammer-button').setAttribute('aria-label', `Искра: удалить кристалл. Осталось ${zen ? 'неограниченно' : state.boosters.hammer}`);
  $('shuffle-button').setAttribute('aria-label', `Вихрь: перемешать поле. Осталось ${zen ? 'неограниченно' : state.boosters.shuffle}`);
  $('play-instruction').innerHTML = armed ? '<span class="instruction-spark">✦</span> Выберите кристалл, который хотите убрать. Esc — отмена.' : '<span class="instruction-spark">✦</span> Меняйте соседние кристаллы местами. Соберите 3 или больше.';
}
function updateJourney() {
  const chapter = CHAPTERS[state.config.chapter];
  $('journey-chapter').textContent = chapter.name;
  document.querySelector('.journey-chapter>svg use').setAttribute('href', `#i-${chapter.emblem}`);
  let start = Math.max(1, Math.min(26, state.level - 2));
  if (state.level <= 3) start = 1;
  $('level-path').innerHTML = Array.from({ length: 5 }, (_, j) => {
    const n = start + j, done = profile.completed[n], current = n === state.level;
    return `<button class="path-node ${current ? 'current' : ''} ${done ? 'passed' : ''}" data-level="${n}" ${n > profile.unlocked ? 'disabled' : ''} aria-label="Уровень ${n}${current ? ', текущий' : ''}${done ? ', пройден' : ''}"><span class="path-circle">${current ? n : done ? icon('check') : icon('lock')}</span><span class="path-copy">Уровень ${n}${current ? '<small>ВЫ ЗДЕСЬ</small>' : done ? '<small>' + '★'.repeat(done.stars) + '</small>' : ''}</span></button>`;
  }).join('');
  $('level-path').querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => chooseLevel(Number(b.dataset.level))));
  const wisdom = ['Четыре кристалла в ряд<br>рождают луч света.', 'Пять кристаллов в ряд —<br>и радуга в ваших руках.', 'Соедините два усилителя.<br>Магия любит смелых.', 'Комбинация на льду<br>освобождает клетку.'];
  $('wisdom-text').innerHTML = wisdom[(state.level - 1) % wisdom.length];
}

function resizeCanvas() {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const physical = Math.round(canvas.getBoundingClientRect().width * ratio);
  if (physical && canvas.width !== physical) { canvas.width = physical; canvas.height = physical; }
}
new ResizeObserver(resizeCanvas).observe(canvas);
// Режим приложения на сенсорных экранах: страница не прокручивается, а поле подстраивается под свободное место.
const touchScreen = matchMedia('(pointer:coarse)'), sideBoosters = matchMedia('(max-width:1000px) and (max-height:520px) and (orientation:landscape)');
let naturalBoard = 0, fitQueued = false;
function measureNaturalBoard() {
  const root = document.documentElement, frame = $('board-frame');
  const current = root.style.getPropertyValue('--board-size');
  root.style.removeProperty('--board-size'); naturalBoard = frame.offsetWidth;
  if (current) root.style.setProperty('--board-size', current);
}
function fitLayout() {
  fitQueued = false;
  const root = document.documentElement, body = document.body;
  if (!touchScreen.matches) { body.classList.remove('app-shell'); root.style.removeProperty('--board-size'); return; }
  body.classList.add('app-shell');
  if (sideBoosters.matches || !naturalBoard) { root.style.removeProperty('--board-size'); return; }
  const frame = $('board-frame'), viewport = Math.round(visualViewport?.height || innerHeight);
  const outer = el => { if (!el || el.offsetParent === null) return 0; const cs = getComputedStyle(el); return el.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom); };
  let tail = 0; for (let el = frame.nextElementSibling; el; el = el.nextElementSibling) tail += outer(el);
  tail += outer(document.querySelector('.footer'));
  const available = Math.floor(viewport - frame.getBoundingClientRect().top - tail - 4);
  const size = Math.max(240, Math.min(naturalBoard, available));
  const current = parseFloat(root.style.getPropertyValue('--board-size')) || naturalBoard;
  if (Math.abs(size - current) >= 1) root.style.setProperty('--board-size', `${size}px`);
  body.classList.toggle('app-shell', available >= 240);
}
function queueFit() { if (!fitQueued) { fitQueued = true; requestAnimationFrame(fitLayout); } }
function refitLayout() { if (touchScreen.matches) { document.body.classList.add('app-shell'); measureNaturalBoard(); } queueFit(); }
addEventListener('resize', refitLayout); addEventListener('orientationchange', refitLayout); visualViewport?.addEventListener('resize', refitLayout);
touchScreen.addEventListener?.('change', refitLayout);
const fitObserver = new ResizeObserver(queueFit);
for (const el of document.querySelectorAll('.header, .chapter-heading, .hud, .board-toolbar, .boosters')) fitObserver.observe(el);
function rounded(x, y, w, h, radius) { ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); }
function sprite(type, x, y, size = 82, alpha = 1, rotation = 0) {
  if (!atlasReady || alpha <= 0) return;
  const sourceType = type < 0 ? 4 : type;
  const sw = atlas.naturalWidth / 3, sh = atlas.naturalHeight / 2;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); if (rotation) ctx.rotate(rotation);
  ctx.drawImage(atlas, sourceType % 3 * sw, Math.floor(sourceType / 3) * sh, sw, sh, -size / 2, -size / 2, size, size); ctx.restore();
}
function drawTile(item, index, now) {
  let { x, y } = point(index), scale = 1, alpha = 1, rotation = 0;
  const move = moving.get(item.id);
  if (move) { const p = ease((now - move.start) / move.duration); x = move.from.x + (x - move.from.x) * p; y = move.from.y + (y - move.from.y) * p; if (p >= 1) moving.delete(item.id); }
  const vanish = vanishing.get(item.id);
  if (vanish) { const p = clamp((now - vanish) / (prefs.motion ? 260 : 35), 0, 1); scale = 1 + p * .22; alpha = 1 - p; rotation = p * .13; }
  if (!move && !vanish && prefs.motion) y += Math.sin(now / 1400 + item.id * .7) * .55;
  if (item.special) {
    const pulse = prefs.motion ? Math.sin(now / 290) * .10 + .85 : 1;
    ctx.save(); ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x, y, 5, x, y, 43);
    g.addColorStop(0, (item.special === 'prism' ? '#fff3dc' : GEM_COLORS[item.type]) + '65'); g.addColorStop(1, '#00000000');
    ctx.fillStyle = g; ctx.fillRect(x - 45, y - 45, 90, 90);
    if (item.special === 'prism') {
      for (let n = 0; n < 6; n++) { ctx.beginPath(); ctx.strokeStyle = GEM_COLORS[n]; ctx.globalAlpha = alpha * .8; ctx.lineWidth = 2; ctx.arc(x, y, 29 + pulse * 2, n * Math.PI / 3 + now / 1400, (n + .8) * Math.PI / 3 + now / 1400); ctx.stroke(); }
    } else if (item.special === 'bomb') {
      ctx.strokeStyle = '#fff4c7'; ctx.lineWidth = 1.3; ctx.globalAlpha = alpha * pulse; ctx.beginPath(); ctx.arc(x, y, 27, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  sprite(item.type, x, y, 82 * scale, alpha, rotation);
  if (item.special) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = '#fff6d5'; ctx.shadowColor = '#fff2ba'; ctx.shadowBlur = 8; ctx.lineWidth = 2;
    if (item.special === 'h' || item.special === 'v') {
      ctx.beginPath(); if (item.special === 'h') { ctx.moveTo(x - 27, y); ctx.lineTo(x + 27, y); } else { ctx.moveTo(x, y - 27); ctx.lineTo(x, y + 27); } ctx.stroke();
    } else {
      ctx.font = item.special === 'prism' ? '22px Georgia' : '17px Georgia'; ctx.fillStyle = '#fff8e2'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(item.special === 'prism' ? '✧' : '✦', x, y);
    }
    ctx.restore();
  }
}
let lastFrame = performance.now();
function render(now) {
  requestAnimationFrame(render);
  if (!state || document.hidden) return;
  const delta = Math.min((now - lastFrame) / 16.667, 2); lastFrame = now;
  ctx.setTransform(canvas.width / SIZE, 0, 0, canvas.height / SIZE, 0, 0); ctx.clearRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 64; i++) {
    const { x, y } = point(i), r = i / 8 | 0, c = i % 8;
    const theme = THEMES[state.config.chapter] || THEMES[0];
    rounded(x - 38, y - 38, 76, 76, 9);
    ctx.fillStyle = (r + c) % 2 ? theme.cellA : theme.cellB; ctx.fill(); ctx.strokeStyle = theme.grid; ctx.lineWidth = 1; ctx.stroke();
    if (state.frost[i]) {
      rounded(x - 37, y - 37, 74, 74, 8); ctx.fillStyle = theme.frostFill; ctx.fill(); ctx.strokeStyle = theme.frostLine; ctx.stroke();
      ctx.beginPath(); ctx.strokeStyle = theme.frostMark; ctx.lineWidth = 1.3;
      if (state.config.chapter === 1) {
        ctx.moveTo(x - 36, y - 12); ctx.lineTo(x - 16, y - 9); ctx.lineTo(x - 8, y + 4); ctx.moveTo(x + 36, y + 12); ctx.lineTo(x + 18, y + 15); ctx.lineTo(x + 9, y + 30); ctx.moveTo(x - 22, y + 36); ctx.lineTo(x - 17, y + 20);
      } else if (state.config.chapter === 2) {
        for (const [sx, sy, r] of [[-21, -20, 4.5], [18, -25, 3], [24, 19, 4.5], [-19, 23, 3]]) { ctx.moveTo(x + sx - r, y + sy); ctx.lineTo(x + sx + r, y + sy); ctx.moveTo(x + sx, y + sy - r); ctx.lineTo(x + sx, y + sy + r); }
      } else {
        ctx.moveTo(x - 36, y - 18); ctx.lineTo(x - 18, y - 25); ctx.lineTo(x - 9, y - 36); ctx.moveTo(x + 12, y + 36); ctx.lineTo(x + 19, y + 19); ctx.lineTo(x + 36, y + 8);
      }
      ctx.stroke();
    }
    if (i === selected || (hinted.includes(i) && now < hintUntil) || (keyboardFocus && i === cursor)) {
      const hint = i !== selected;
      rounded(x - 36, y - 36, 72, 72, 10); ctx.strokeStyle = hint ? '#9ae6ce' : '#f5d293'; ctx.lineWidth = hint ? 1.8 : 2;
      ctx.globalAlpha = prefs.motion && hint ? .5 + Math.sin(now / 240) * .3 : .85;
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = hint ? '#a0ffd412' : '#edca8720'; ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  state.board.forEach((item, i) => { if (item && !moving.has(item.id)) drawTile(item, i, now); });
  state.board.forEach((item, i) => { if (item && moving.has(item.id)) drawTile(item, i, now); });
  for (const beam of beams) {
    const p = (now - beam.start) / 500; if (p >= 1) continue;
    ctx.save(); ctx.globalAlpha = (1 - p) * .9; ctx.strokeStyle = '#fff7d4'; ctx.lineWidth = Math.max(1, 18 * (1 - p)); ctx.shadowBlur = 20; ctx.shadowColor = beam.color;
    ctx.beginPath(); ctx.moveTo(beam.a.x, beam.a.y); ctx.lineTo(beam.b.x, beam.b.y); ctx.stroke(); ctx.restore();
  }
  beams = beams.filter(b => now - b.start < 500);
  for (const ring of rings) {
    const p = (now - ring.start) / ring.duration; if (p >= 1) continue;
    ctx.beginPath(); ctx.arc(ring.x, ring.y, 8 + p * ring.radius, 0, Math.PI * 2); ctx.strokeStyle = ring.color; ctx.globalAlpha = (1 - p) * .8; ctx.lineWidth = 2 * (1 - p) + .5; ctx.stroke(); ctx.globalAlpha = 1;
  }
  rings = rings.filter(r => now - r.start < r.duration);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const progress = (now - p.start) / p.life; if (progress >= 1) continue;
    p.x += p.vx * delta; p.y += p.vy * delta; p.vy += .038 * delta; p.vx *= .985; ctx.globalAlpha = Math.pow(1 - progress, 1.4);
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(.4, p.size * (1 - progress * .5)), 0, Math.PI * 2); ctx.fill();
    if (p.spark) { ctx.strokeStyle = '#fff6d1'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(p.x - p.size * 2, p.y); ctx.lineTo(p.x + p.size * 2, p.y); ctx.moveTo(p.x, p.y - p.size * 2); ctx.lineTo(p.x, p.y + p.size * 2); ctx.stroke(); }
  }
  ctx.restore(); particles = particles.filter(p => now - p.start < p.life);
  for (const label of labels) {
    const p = (now - label.start) / 1000; if (p >= 1) continue;
    ctx.save(); ctx.globalAlpha = Math.min(1, (1 - p) * 2); ctx.font = '500 22px Georgia'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff1bf'; ctx.shadowColor = '#06282c'; ctx.shadowBlur = 8; ctx.fillText(label.text, label.x, label.y - p * 37); ctx.restore();
  }
  labels = labels.filter(l => now - l.start < 1000);
  if (prefs.autoHints && !busy && state.status === 'playing' && !$('modal').open && now - lastAction > 9500 && now > hintUntil) {
    const moves = legalMoves(state.board); if (moves.length) { hinted = moves[0]; hintUntil = now + 3400; lastAction = now - 1000; }
  }
}
function burst(index, color, power = 1) {
  if (!prefs.motion) return;
  const { x, y } = point(index), now = performance.now();
  const count = Math.round(13 * power);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2, speed = (1 + Math.random() * 3.2) * power;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - .8, size: 1 + Math.random() * 2.2, color, start: now, life: 450 + Math.random() * 550, spark: i % 4 === 0 });
  }
  rings.push({ x, y, start: now, radius: 36 * power, duration: 430, color });
}
function animateSwap(a, b) {
  const first = state.board[a], second = state.board[b], now = performance.now();
  swap(state.board, a, b);
  const duration = prefs.motion ? 190 : 35;
  moving.set(first.id, { from: point(a), start: now, duration }); moving.set(second.id, { from: point(b), start: now, duration });
  return wait(205);
}
function combo(chain, special = false) {
  const title = special ? 'Слияние света' : ['','','Прекрасно!','Волшебно!','Невероятно!','Сияние!'][Math.min(chain, 5)];
  if (!title) return;
  $('combo-label').innerHTML = `${title}<small>${special ? 'МАГИЯ КРИСТАЛЛОВ' : `КАСКАД ×${chain}`}</small>`;
  $('combo-label').classList.remove('show'); void $('combo-label').offsetWidth; $('combo-label').classList.add('show');
  clearTimeout(comboTimer); comboTimer = setTimeout(() => $('combo-label').classList.remove('show'), 1300);
}
async function resolve(wave, token) {
  let chain = 0;
  while (wave && token === epoch) {
    chain++; state.bestCascade = Math.max(state.bestCascade, chain);
    const now = performance.now();
    wave.clear.forEach(i => { if (state.board[i]) vanishing.set(state.board[i].id, now); burst(i, GEM_COLORS[state.board[i]?.type] || '#f5dbb4', 1); });
    for (const a of wave.activated) {
      const { x, y } = point(a.index);
      if (a.special === 'h') beams.push({ a: { x: 0, y }, b: { x: SIZE, y }, start: now, color: GEM_COLORS[a.type] });
      if (a.special === 'v') beams.push({ a: { x, y: 0 }, b: { x, y: SIZE }, start: now, color: GEM_COLORS[a.type] });
      if (a.special === 'bomb' || a.special === 'prism') { burst(a.index, '#ffe6ae', 2.4); rings.push({ x, y, start: now, radius: 160, duration: 650, color: '#fff3c6' }); }
    }
    if (wave.activated.length) { audio.play('special'); if (prefs.motion) { $('board-frame').classList.remove('shaking'); void $('board-frame').offsetWidth; $('board-frame').classList.add('shaking'); } }
    else audio.play('match', chain);
    if (chain >= 2) combo(chain);
    $('board-status').textContent = chain > 1 ? `Каскад ×${chain}` : wave.promotions.length ? 'Рождается новый свет' : 'Кристаллы сияют';
    await wait(260); if (token !== epoch) return;
    const result = applyWave(state.board, state.frost, wave);
    const gained = Math.round(result.points * (1 + Math.min(chain - 1, 8) * .25));
    state.score += gained; state.ice += result.ice; result.collected.forEach((n, i) => { state.collected[i] += n; });
    const middle = point(wave.matched[Math.floor(wave.matched.length / 2)]);
    labels.push({ ...middle, text: `+${fmt(gained)}`, start: performance.now() });
    vanishing.clear(); wave.promotions.forEach(p => burst(p.index, '#ffdea4', 1.6));
    updateHUD(); await wait(85); if (token !== epoch) return;
    const falls = collapse(state.board), start = performance.now();
    falls.forEach(f => moving.set(f.id, { from: point(f.from), start: start + (f.to % 8) * (prefs.motion ? 9 : 0), duration: prefs.motion ? 290 : 35 }));
    await wait(395); if (token !== epoch) return;
    moving.clear(); wave = planWave(state.board);
    if (chain >= 80 && wave) { shuffleBoard(state.board); wave = null; }
  }
  if (token !== epoch) return;
  if (!legalMoves(state.board).length) { toast('Нет доступных ходов. Кристаллы перемешиваются.'); await reshuffle(false); }
  busy = false; $('board-frame').classList.remove('shaking'); lastAction = performance.now();
  if (state.mode === 'zen') profile.zenBest = Math.max(profile.zenBest, state.score);
  checkEnd(); updateHUD(); save();
  $('board-status').textContent = state.status === 'won' ? 'Сады наполнены светом' : state.status === 'lost' ? 'Новый путь ждёт вас' : 'Магия начинается с трёх';
  announce(`${state.mode === 'zen' ? 'Свет' : 'Ходов осталось: ' + state.moves + '. Свет'}: ${fmt(state.score)}. ${state.config.goals.map(g => `${GEM_NAMES[g.type]}: ${Math.min(g.target, state.collected[g.type])} из ${g.target}`).join('. ')}`);
}
async function attemptSwap(a, b) {
  if (busy || state.status !== 'playing' || !adjacent(a, b) || $('modal').open) return;
  busy = true; selected = -1; hinted = []; armed = false; updateHUD(); audio.play('swap');
  const token = epoch;
  await animateSwap(a, b); if (token !== epoch) return;
  let wave;
  if (specialPair(state.board, a, b)) { wave = combinedWave(state.board, a, b); combo(1, true); }
  else wave = planWave(state.board, [b, a]);
  if (!wave) {
    audio.play('invalid'); await animateSwap(a, b); if (token !== epoch) return;
    busy = false; updateHUD(); lastAction = performance.now(); $('board-status').textContent = 'Нужна комбинация из трёх'; announce('Комбинации нет. Ход сохранён.'); return;
  }
  if (state.mode !== 'zen') state.moves--;
  state.turns++; updateHUD(); await resolve(wave, token);
}
function interact(i) {
  if (i < 0 || i >= 64 || busy || state.status !== 'playing' || $('modal').open || !atlasReady) return;
  audio.start(); lastAction = performance.now(); hinted = [];
  if (armed) { useHammer(i); return; }
  if (selected === i) { selected = -1; return; }
  if (selected >= 0 && adjacent(selected, i)) { attemptSwap(selected, i); return; }
  selected = i; cursor = i; audio.play('select');
  const t = state.board[i]; announce(`Строка ${Math.floor(i / 8) + 1}, столбец ${i % 8 + 1}: ${t.special === 'prism' ? 'радужная призма' : GEM_NAMES[t.type]}. Кристалл выбран.`);
}
async function useHammer(i) {
  if (busy || (!state.boosters.hammer && state.mode !== 'zen')) return;
  busy = true; armed = false; selected = -1; hinted = [];
  if (state.mode !== 'zen') state.boosters.hammer--;
  updateHUD(); await resolve(planWave(state.board, [], [i]), epoch);
}
async function reshuffle(manual = true) {
  if (manual && (busy || state.status !== 'playing' || (state.mode !== 'zen' && !state.boosters.shuffle))) return;
  const token = epoch, previousBusy = busy;
  busy = true; selected = -1; armed = false; hinted = [];
  if (manual && state.mode !== 'zen') state.boosters.shuffle--;
  updateHUD(); audio.play('shuffle');
  const old = new Map(state.board.map((t, i) => [t.id, point(i)]));
  shuffleBoard(state.board);
  const start = performance.now();
  state.board.forEach(t => moving.set(t.id, { from: old.get(t.id) || { x: 320, y: 320 }, start, duration: prefs.motion ? 480 : 35 }));
  await wait(510); if (token !== epoch) return;
  moving.clear(); busy = previousBusy; updateHUD(); lastAction = performance.now();
  if (manual) { toast('Новый порядок. Новые возможности.'); save(); }
}
function checkEnd() {
  if (state.mode === 'zen' || state.status !== 'playing') return;
  const config = state.config;
  const won = state.score >= config.target && config.goals.every(g => state.collected[g.type] >= g.target) && state.ice >= config.frost;
  if (won) {
    state.status = 'won'; state.bonus = state.moves * 120; state.score += state.bonus;
    const stars = state.score >= config.target * 2 ? 3 : state.score >= config.target * 1.5 ? 2 : 1;
    state.stars = stars;
    const old = profile.completed[state.level] || { score: 0, stars: 0 };
    profile.completed[state.level] = { score: Math.max(old.score, state.score), stars: Math.max(old.stars, stars) };
    profile.unlocked = Math.max(profile.unlocked, Math.min(30, state.level + 1));
    audio.play('win'); updateJourney();
    if (prefs.motion) for (let i = 0; i < 12; i++) burst(Math.floor(Math.random() * 64), '#f6d58c', 2);
    const token = epoch; setTimeout(() => { if (token === epoch) resultModal(true); }, prefs.motion ? 950 : 100);
  } else if (state.moves <= 0) {
    state.status = 'lost'; audio.play('lose');
    const token = epoch; setTimeout(() => { if (token === epoch) resultModal(false); }, 650);
  }
}

let pointer = null;
function cellFromEvent(e) {
  const rect = canvas.getBoundingClientRect(), x = (e.clientX - rect.left) / rect.width * 8, y = (e.clientY - rect.top) / rect.height * 8;
  return x >= 0 && y >= 0 && x < 8 && y < 8 ? Math.floor(y) * 8 + Math.floor(x) : -1;
}
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 || busy || $('modal').open || state.status !== 'playing') return;
  e.preventDefault(); canvas.focus({ preventScroll: true }); keyboardFocus = false; audio.start();
  pointer = { id: e.pointerId, index: cellFromEvent(e), x: e.clientX, y: e.clientY, moved: false }; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!pointer || pointer.id !== e.pointerId || pointer.moved || armed || busy) return;
  const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
  const threshold = canvas.getBoundingClientRect().width / 8 * .3;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > threshold) {
    const destination = pointer.index + (Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : Math.sign(dy) * 8);
    pointer.moved = true; if (adjacent(pointer.index, destination)) attemptSwap(pointer.index, destination);
  }
});
canvas.addEventListener('pointerup', e => { if (!pointer || pointer.id !== e.pointerId) return; if (!pointer.moved) interact(pointer.index); pointer = null; });
canvas.addEventListener('pointercancel', () => { pointer = null; });
canvas.addEventListener('lostpointercapture', () => { pointer = null; });
canvas.addEventListener('blur', () => { keyboardFocus = false; });
canvas.addEventListener('keydown', e => {
  if (busy || state.status !== 'playing' || $('modal').open) return;
  keyboardFocus = true;
  const offset = { ArrowUp: -8, ArrowDown: 8, ArrowLeft: -1, ArrowRight: 1 }[e.key];
  if (offset) {
    e.preventDefault(); const next = cursor + offset;
    if (adjacent(cursor, next)) { if (selected === cursor && !armed) attemptSwap(cursor, next); cursor = next; lastAction = performance.now(); const t = state.board[cursor]; announce(`Строка ${Math.floor(cursor / 8) + 1}, столбец ${cursor % 8 + 1}: ${t.special === 'prism' ? 'призма' : GEM_NAMES[t.type]}`); }
  } else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); interact(cursor); }
});
document.addEventListener('keydown', e => {
  if ($('modal').open || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.key === 'Escape') { armed = false; selected = -1; updateHUD(); }
  if (e.key.toLowerCase() === 'h' || e.key.toLowerCase() === 'р') { e.preventDefault(); $('hint-button').click(); }
  if (e.key === '1') $('hammer-button').click();
  if (e.key === '2') $('shuffle-button').click();
});
$('hint-button').addEventListener('click', () => {
  if (busy || state.status !== 'playing') return;
  audio.start(); armed = false; selected = -1; updateHUD();
  const moves = legalMoves(state.board);
  if (!moves.length) { reshuffle(false); return; }
  hinted = moves[Math.floor(Math.random() * moves.length)]; hintUntil = performance.now() + 4800; lastAction = performance.now();
  const [a, b] = hinted;
  toast(`Поменяйте подсвеченные кристаллы. Ход не тратится.`);
  announce(`Подсказка: строка ${Math.floor(a / 8) + 1}, столбец ${a % 8 + 1}; строка ${Math.floor(b / 8) + 1}, столбец ${b % 8 + 1}.`);
});
$('hammer-button').addEventListener('click', () => { if (busy || state.status !== 'playing') return; armed = !armed; selected = -1; hinted = []; updateHUD(); audio.play('select'); if (armed) toast('Искра: выберите один кристалл на поле.'); });
$('shuffle-button').addEventListener('click', () => reshuffle());

const dialog = $('modal');
function modal(html, setup) {
  $('modal-body').innerHTML = html;
  if (!dialog.open) dialog.showModal();
  if (setup) setup();
}
function closeModal() { dialog.close(); lastAction = performance.now(); }
$('modal-close').addEventListener('click', closeModal);
dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeModal(); } });
dialog.addEventListener('close', () => { lastAction = performance.now(); if (state?.status === 'playing') canvas.focus({ preventScroll: true }); });
function helpModal() {
  audio.start();
  modal(`<p class="modal-eyebrow">СЕКРЕТЫ МАГИИ</p><h2 class="modal-title" id="modal-title">Свет в ваших руках</h2><p class="modal-description">Несколько простых правил — бесконечно много красивых комбинаций.</p><div class="guide-steps"><div class="guide-step"><span class="guide-number">1</span><div><h3>Меняйте и соединяйте</h3><p>Нажмите на два соседних кристалла или проведите пальцем. Три одинаковых в ряд исчезнут. Обмен без комбинации не тратит ход.</p></div></div><div class="guide-step"><span class="guide-number">2</span><div><h3>Наполняйте сады светом</h3><p>Соберите нужные кристаллы и наберите указанное количество света, пока есть ходы. Начиная с 4-го уровня, убирайте преграды комбинациями на закрытых клетках: в садах это лёд, в руинах — песок вдоль стен и колонн, в обители — звёздная пыль, лежащая зеркальными созвездиями.</p></div></div><div class="guide-step"><span class="guide-number">3</span><div><h3>Создавайте особые кристаллы</h3><p>Длинные комбинации рождают усилители. Активируйте их в новой комбинации или соедините два усилителя друг с другом.</p></div></div></div><div class="guide-specials"><div class="special-info"><span>↔</span><strong>4 в ряд · Луч</strong><p>Очищает целый ряд<br>или столбец.</p></div><div class="special-info"><span>✦</span><strong>Т или Г · Нова</strong><p>Взрывает область<br>3 × 3 клетки.</p></div><div class="special-info"><span>✧</span><strong>5 в ряд · Призма</strong><p>Убирает все камни<br>выбранного цвета.</p></div></div><div class="keyboard-info">Подсказка бесплатна. Искра и Вихрь не тратят ходы; их запас обновляется на каждом уровне. Оставшиеся ходы дают по 120 света.<br><br>Клавиатура: стрелки — клетка, пробел — выбор, затем стрелка — обмен. H — подсказка, 1 — Искра, 2 — Вихрь, Esc — отмена.</div><div class="modal-actions"><button class="primary-button" id="help-play">Пусть начнётся магия ${icon('arrow')}</button></div>`, () => $('help-play').addEventListener('click', closeModal));
}
function settingsModal() {
  audio.start();
  modal(`<p class="modal-eyebrow">ВАША АТМОСФЕРА</p><h2 class="modal-title" id="modal-title">Настройки</h2><div class="setting-row"><label for="pref-sfx">Звуки кристаллов<small>Обмены, каскады и маленькие победы</small></label><input type="checkbox" class="switch" id="pref-sfx" ${prefs.sfx ? 'checked' : ''}></div><div class="setting-row"><label for="pref-music">Музыка садов<small>Спокойная мелодия из светлых нот</small></label><input type="checkbox" class="switch" id="pref-music" ${prefs.music ? 'checked' : ''}></div><div class="setting-row"><label for="pref-motion">Анимация и частицы<small>Сияние, искры и плавные движения</small></label><input type="checkbox" class="switch" id="pref-motion" ${prefs.motion ? 'checked' : ''}></div><div class="setting-row"><label for="pref-autoHints">Автоподсказки<small>Показывать возможный ход после паузы</small></label><input type="checkbox" class="switch" id="pref-autoHints" ${prefs.autoHints ? 'checked' : ''}></div><div class="settings-footer">30 уровней · 3 мира · Неограниченный дзен<br>Прогресс и текущая партия сохраняются на этом устройстве.${prefs.muted ? '<br>Общий звук выключен кнопкой в верхней панели.' : ''}</div><div class="modal-actions"><button class="primary-button" id="settings-done">Вернуться в сады</button><button class="secondary-button" id="settings-map">${icon('map')} Карта миров</button><button class="secondary-button" id="settings-help">${icon('help')} Правила игры</button></div>`, () => {
    for (const key of ['sfx', 'music', 'motion', 'autoHints']) $(`pref-${key}`).addEventListener('change', e => {
      prefs[key] = e.target.checked;
      if (key === 'autoHints') { hinted = []; hintUntil = 0; lastAction = performance.now(); }
      applyPrefs(); save();
      if (key === 'music' && prefs.music) audio.ambient();
    });
    $('settings-done').addEventListener('click', closeModal); $('settings-map').addEventListener('click', mapModal); $('settings-help').addEventListener('click', helpModal);
  });
}
function applyPrefs() {
  document.body.classList.toggle('reduced-motion', !prefs.motion);
  $('sound-button').innerHTML = icon(prefs.muted ? 'mute' : 'sound');
  $('sound-button').setAttribute('aria-label', prefs.muted ? 'Включить звук' : 'Выключить звук');
  $('sound-button').setAttribute('aria-pressed', String(!prefs.muted));
  if (!prefs.motion) { particles = []; rings = []; beams = []; }
  if (audio.master && audio.context) audio.master.gain.setTargetAtTime(prefs.muted ? 0 : .36, audio.context.currentTime, .08);
}
function chapterCard(chapter, c, current) {
  const first = c * 10 + 1, done = Array.from({ length: 10 }, (_, i) => profile.completed[first + i]).filter(Boolean);
  const stars = done.reduce((sum, l) => sum + (l.stars || 0), 0);
  const locked = profile.unlocked < first, complete = done.length === 10;
  const status = locked ? `${icon('lock')} Откроется после мира «${CHAPTERS[c - 1].name}»` : complete ? `${icon('check')} Мир пройден` : current ? '✦ Вы здесь' : `${icon('play')} Открыт`;
  return `<section class="world-map world-${c} ${locked ? 'locked' : ''} ${current ? 'current' : ''}" style="--world:${chapter.color}"><div class="world-art"><i></i><i></i><i></i>${icon(chapter.emblem)}</div><div class="world-body"><div class="world-map-title"><div><h3>${chapter.name}</h3><p>${chapter.subtitle}</p></div><span>ГЛАВА ${chapter.numeral}</span></div><p class="world-lead">${chapter.lead}</p><div class="world-rule">${icon(chapter.frostIcon)}<span>${chapter.rule}</span></div><ul class="world-traits">${chapter.traits.map(t => `<li>${t}</li>`).join('')}</ul><div class="world-status">${status}</div>${locked ? '' : `<div class="world-progress" role="img" aria-label="${done.length} из 10 уровней, ${stars} из 30 звёзд"><i style="width:${done.length * 10}%"></i></div><div class="world-stars"><span>${done.length} / 10 уровней</span><span>${icon('star')} ${stars} / 30</span></div><div class="world-levels">${Array.from({ length: 10 }, (_, i) => {
    const n = first + i, result = profile.completed[n], here = state.mode === 'adventure' && state.level === n;
    return `<button class="map-level ${here ? 'current' : ''} ${result ? 'passed' : ''}" data-map-level="${n}" ${n > profile.unlocked ? 'disabled' : ''} aria-label="Уровень ${n}${result ? ', звёзд: ' + result.stars : n > profile.unlocked ? ', закрыт' : ''}">${n > profile.unlocked ? icon('lock') : n}<small>${result ? '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars) : ''}</small></button>`;
  }).join('')}</div>`}</div></section>`;
}
function mapModal() {
  audio.start();
  const stars = Object.values(profile.completed).reduce((sum, l) => sum + (l.stars || 0), 0);
  const current = state.mode === 'adventure' ? state.config.chapter : -1;
  modal(`<p class="modal-eyebrow">ВАШЕ ПУТЕШЕСТВИЕ</p><h2 class="modal-title" id="modal-title">Три мира. Один свет.</h2><p class="modal-description">Каждый мир живёт по своим законам: меняются свет, преграды на поле и цена победы.</p><div class="journey-total">${icon('star')} ${stars} / 90 звёзд <span>·</span> ${Object.keys(profile.completed).length} / 30 уровней</div><div class="worlds">${CHAPTERS.map((chapter, c) => chapterCard(chapter, c, c === current)).join('')}</div><div class="modal-actions"><button class="secondary-button" id="map-zen">${icon('leaf')} Отдохнуть в режиме дзен</button></div>`, () => {
    $('modal-body').querySelectorAll('[data-map-level]').forEach(b => b.addEventListener('click', () => chooseLevel(Number(b.dataset.mapLevel))));
    $('map-zen').addEventListener('click', () => switchMode('zen'));
    $('modal-body').querySelector('.world-map.current')?.scrollIntoView({ block: 'nearest' });
  });
}
// Вход в новый мир: чем он живёт и что изменилось на поле.
function chapterModal(c) {
  const chapter = CHAPTERS[c];
  modal(`<div class="chapter-intro world-${c}" style="--world:${chapter.color}"><div class="world-art"><i></i><i></i><i></i>${icon(chapter.emblem)}</div><p class="modal-eyebrow">ГЛАВА ${chapter.numeral} · ${c ? 'НОВЫЙ МИР' : 'НАЧАЛО ПУТИ'}</p><h2 class="modal-title" id="modal-title">${chapter.name}</h2><p class="modal-description">${chapter.subtitle}</p><p class="world-lead">${chapter.lead}</p><div class="world-rule">${icon(chapter.frostIcon)}<span>${chapter.rule}</span></div><ul class="world-traits">${chapter.traits.map(t => `<li>${t}</li>`).join('')}</ul><div class="modal-actions"><button class="primary-button" id="chapter-enter">Войти в мир ${icon('arrow')}</button></div></div>`, () => {
    $('chapter-enter').addEventListener('click', closeModal);
  });
}
function chooseLevel(n) {
  if (n > profile.unlocked || n < 1 || n > 30) return;
  if (busy) { toast('Подождите, пока завершится каскад.'); return; }
  if (state.mode === 'adventure' && state.level === n && state.status === 'playing') { closeModal(); return; }
  if (state.mode === 'adventure' && state.status === 'playing' && state.turns > 0) {
    confirmModal('Отправиться дальше?', 'Текущая партия начнётся заново. Пройденные уровни и звёзды сохранятся.', 'Открыть уровень ' + n, () => loadGame('adventure', n));
  } else { save(); loadGame('adventure', n); }
}
function confirmModal(title, description, action, callback) {
  modal(`<div class="result-icon">${icon('gem')}</div><h2 class="modal-title" id="modal-title">${title}</h2><p class="modal-description">${description}</p><div class="modal-actions"><button class="primary-button" id="confirm-yes">${action}</button><button class="secondary-button" id="confirm-no">Продолжить игру</button></div>`, () => { $('confirm-yes').addEventListener('click', callback); $('confirm-no').addEventListener('click', closeModal); });
}
function resultModal(won) {
  const complete = won && state.level === 30, zen = state.mode === 'zen';
  if (zen) return;
  const resultStars = Array.from({ length: 3 }, (_, i) => icon('star', won && i < state.stars ? 'earned' : '')).join('');
  const title = complete ? 'Сады снова сияют' : won ? 'Вы пробудили свет!' : 'Свет ещё вернётся';
  modal(`<p class="modal-eyebrow">${complete ? 'ПУТЕШЕСТВИЕ ЗАВЕРШЕНО' : `УРОВЕНЬ ${state.level} ${won ? 'ПРОЙДЕН' : '· ХОДЫ ЗАКОНЧИЛИСЬ'}`}</p><h2 class="modal-title" id="modal-title">${title}</h2><p class="modal-description">${complete ? 'Все 30 уровней позади. Спасибо, что вернули магию в эти миры.' : won ? 'Ещё один уголок древних садов наполнен магией.' : 'У каждого сада свой секрет. Попробуйте новый путь.'}</p>${won ? `<div class="result-stars">${resultStars}</div>` : `<div class="result-icon">${icon('restart')}</div>`}<div class="result-stats"><div><strong>${fmt(state.score)}</strong><span>собрано света</span></div><div><strong>${won ? '+' + fmt(state.bonus || 0) : state.bestCascade || 1}</strong><span>${won ? 'бонус за оставшиеся ходы' : 'лучший каскад'}</span></div></div>${won ? `<p class="result-award">${complete ? '<strong>Вы — хранитель вечного света.</strong><br>Соберите все 90 звёзд или растворитесь в режиме дзен.' : 'Впереди — новая магия.<br><strong>Следующий уровень открыт.</strong>'}</p>` : `<div class="objective-summary">${state.config.goals.map(g => `<span>${gem(g.type)} ${Math.min(g.target, state.collected[g.type])} / ${g.target}</span>`).join('')}${state.config.frost ? `<span>${icon(CHAPTERS[state.config.chapter].frostIcon)} ${state.ice} / ${state.config.frost}</span>` : ''}</div><p class="result-award">${state.score < state.config.target ? `Для победы нужно ${fmt(state.config.target)} света и все цели.` : 'Света достаточно — осталось собрать все цели.'}<br>Искра и Вихрь помогут. Они не тратят ходы.</p>`}<div class="modal-actions"><button class="primary-button" id="result-next">${complete ? 'Отдохнуть в режиме дзен' : won ? 'Следующий уровень' : 'Попробовать снова'} ${icon('arrow')}</button><button class="secondary-button" id="result-map">${icon('map')} Карта миров</button>${won ? '<button class="secondary-button" id="result-replay">Переиграть уровень</button>' : ''}</div>`, () => {
    $('result-next').addEventListener('click', () => { audio.start(); if (complete) switchMode('zen'); else loadGame('adventure', won ? state.level + 1 : state.level); });
    $('result-map').addEventListener('click', mapModal);
    if ($('result-replay')) $('result-replay').addEventListener('click', () => loadGame('adventure', state.level));
  });
}
function switchMode(mode) {
  if (busy) { toast('Подождите, пока завершится каскад.'); return; }
  save(); audio.start(); loadGame(mode);
  if (mode === 'zen') toast('Без ограничений. Усилители бесконечны.');
}
$('sound-button').addEventListener('click', () => { prefs.muted = !prefs.muted; audio.start(); applyPrefs(); save(); toast(prefs.muted ? 'Звук выключен' : 'Звук включён'); });
$('settings-button').addEventListener('click', settingsModal);
for (const id of ['help-button', 'guide-button', 'footer-help']) $(id).addEventListener('click', helpModal);
for (const id of ['map-button', 'map-shortcut']) $(id).addEventListener('click', mapModal);
$('adventure-mode').addEventListener('click', () => { if (state.mode !== 'adventure') switchMode('adventure'); else mapModal(); });
$('zen-mode').addEventListener('click', () => { if (state.mode !== 'zen') switchMode('zen'); });
$('restart-button').addEventListener('click', () => {
  if (busy) { toast('Подождите, пока завершится каскад.'); return; }
  if (state.status !== 'playing' || !state.turns) { loadGame(state.mode, state.level); return; }
  confirmModal('Начать с чистого света?', 'Счёт и цели текущей партии сбросятся. Ваши звёзды и открытые уровни сохранятся.', 'Начать заново', () => loadGame(state.mode, state.level));
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { save(); if (audio.context?.state === 'running') audio.context.suspend().catch(() => {}); }
  else { lastFrame = performance.now(); lastAction = performance.now(); if (audio.context) audio.start(); }
});
window.addEventListener('pagehide', save);
atlas.onload = () => { atlasReady = true; $('board-loading').classList.add('loaded'); resizeCanvas(); };
atlas.onerror = () => { $('board-loading').innerHTML = '<p>Не удалось загрузить кристаллы.</p><button class="primary-button" id="reload-assets">Попробовать ещё раз</button>'; $('reload-assets').addEventListener('click', () => { atlas.src = './assets/gems.webp?retry=' + Date.now(); }); };
atlas.src = './assets/gems.webp';
applyPrefs(); loadGame(profile.mode); refitLayout(); resizeCanvas(); requestAnimationFrame(render);
if (!profile.seen) { profile.seen = true; save(); if (!$('modal').open) setTimeout(() => toast('Добро пожаловать в Лунные сады. Соедините три одинаковых кристалла.'), 1100); }
