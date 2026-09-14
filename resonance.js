import { ResonanceGame, restoreGame, FLOW_SECONDS, STAGE_LINES } from './resonance-engine.mjs';
import { ResonanceAudio, SCORES } from './resonance-audio.mjs';
import { ResonanceRenderer, WORLDS } from './resonance-render.mjs';

const $ = id => document.getElementById(id);
const SAVE = 'lumina-resonance-v1', PREFS = 'lumina-resonance-prefs-v1', RECORD = 'lumina-resonance-record-v1';
const media = window.matchMedia('(prefers-reduced-motion: reduce)');
const fmt = n => Math.floor(n).toLocaleString('ru-RU');
const clock = n => `${Math.floor(n / 60).toString().padStart(2, '0')}:${Math.floor(n % 60).toString().padStart(2, '0')}`;
const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const previousPrefs = read(PREFS);
const prefs = {
  volume: Number.isFinite(previousPrefs?.volume) ? Math.min(1, Math.max(0, previousPrefs.volume)) : 0.65,
  music: previousPrefs?.music !== false,
  effects: previousPrefs?.effects !== false,
  muted: previousPrefs?.muted === true,
  motion: typeof previousPrefs?.motion === 'boolean' ? previousPrefs.motion : !media.matches,
  mode: previousPrefs?.mode === 'zen' ? 'zen' : 'journey',
  zenWorld: Number.isInteger(previousPrefs?.zenWorld) && previousPrefs.zenWorld >= 0 && previousPrefs.zenWorld < 3 ? previousPrefs.zenWorld : 0,
};
const previousRecord = read(RECORD);
const validBest = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
const record = { version: 1, journey: validBest(previousRecord?.journey), zen: validBest(previousRecord?.zen) };
let saved;
try { saved = restoreGame(localStorage.getItem(SAVE)); } catch { /* Storage is optional. */ }
let game = saved || new ResonanceGame({ mode: prefs.mode });
let started = Boolean(saved), paused = Boolean(saved);
let lastFrame = performance.now(), animationFrame = 0, lastSave = 0, lastHUD = '', previewKey = '', previousWorld = -1;
let toastTimer, comboTimer;
let audioUnavailable = false;
const audio = new ResonanceAudio();
const renderer = new ResonanceRenderer($('universe'), $('board'), { motion: prefs.motion });
const held = new Map();
const pointerRepeats = new Map();
const keys = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down', ArrowUp: 'rotate', KeyX: 'rotate', KeyW: 'rotate', KeyZ: 'counter', Space: 'drop', KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold', KeyF: 'flow' };
const modalOpen = () => Boolean(document.querySelector('dialog[open]'));
const canPlay = () => started && !paused && !modalOpen() && game.status === 'playing';
const currentWorld = () => game.mode === 'zen' ? prefs.zenWorld : game.stage;
const announce = text => { $('announcer').textContent = text; };
const text = (id, value) => { const el = $(id); if (el.textContent !== String(value)) el.textContent = value; };

function toast(message) {
  text('toast', message); $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3800);
}

function savePrefs() {
  try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { text('save-status', 'Настройки не сохраняются в этом браузере'); }
}

function save() {
  if (!started) return;
  record[game.mode] = Math.max(record[game.mode], game.score);
  try {
    localStorage.setItem(RECORD, JSON.stringify(record));
    if (game.status === 'playing') localStorage.setItem(SAVE, game.serialize());
    else localStorage.removeItem(SAVE);
    text('save-status', 'Путешествие сохранено на этом устройстве');
  } catch { text('save-status', 'Сохранение недоступно · не закрывайте вкладку'); }
  lastSave = performance.now();
}

function configure() {
  audio.configure({ volume: prefs.muted ? 0 : prefs.volume, music: prefs.music, effects: prefs.effects });
  renderer.setMotion(prefs.motion);
  document.body.classList.toggle('reduced-motion', !prefs.motion);
  document.body.classList.toggle('motion-enabled', prefs.motion);
  $('volume').value = Math.round(prefs.volume * 100);
  text('volume-value', `${Math.round(prefs.volume * 100)}%`);
  $('music-toggle').checked = prefs.music;
  $('effects-toggle').checked = prefs.effects;
  $('motion-toggle').checked = prefs.motion;
  $('sound-button').setAttribute('aria-label', prefs.muted ? 'Включить звук' : 'Выключить весь звук');
  $('sound-button').setAttribute('aria-pressed', String(prefs.muted));
  $('sound-button').querySelector('use').setAttribute('href', prefs.muted ? '#i-mute' : '#i-sound');
  lastHUD = ''; updateHUD();
}

function resumeAudio() {
  audio.setWorld(currentWorld(), game.flowing, (game.lines % STAGE_LINES) / STAGE_LINES);
  audio.resume().then(ok => {
    audioUnavailable = !ok;
    if (!ok) toast('Звук пока недоступен. Попробуйте кнопку звука.');
    lastHUD = ''; updateHUD();
  }).catch(() => {
    audioUnavailable = true; toast('Браузер не запустил звук. Нажмите кнопку звука, чтобы попробовать снова.');
    lastHUD = ''; updateHUD();
  });
}

function clearInput() { held.clear(); pointerRepeats.clear(); gesture = null; }

function overlay() {
  const finished = game.status !== 'playing';
  $('board-overlay').hidden = started && !paused && !finished;
  $('mode-switch').hidden = started;
  $('new-button').hidden = !started;
  $('overlay-note').hidden = false;
  if (finished) {
    const complete = game.status === 'complete';
    text('overlay-eyebrow', complete ? 'ТРИ МИРА. ОДНО ПУТЕШЕСТВИЕ.' : 'КАЖДЫЙ ФИНАЛ — НАЧАЛО');
    text('overlay-title', complete ? 'Вы — свет' : 'Ещё один вдох');
    text('overlay-description', `${fmt(game.score)} света · ${game.lines} линий · ${clock(game.elapsed)}`);
    text('start-button', complete ? 'Продолжить в дзен ∞' : 'Попробовать снова →');
    text('new-button', 'Выбрать режим');
  } else if (started) {
    text('overlay-eyebrow', 'МИР МОЖЕТ ПОДОЖДАТЬ');
    text('overlay-title', 'Вдох. Выдох.');
    text('overlay-description', 'Ваша музыка и ваше путешествие ждут вас здесь.');
    text('start-button', 'Продолжить →');
    text('new-button', 'Начать заново');
  } else {
    text('overlay-eyebrow', 'ВАШЕ МАЛЕНЬКОЕ БЕСКОНЕЧНОЕ');
    $('overlay-title').innerHTML = 'Поймайте<br>поток';
    $('overlay-description').innerHTML = game.mode === 'zen' ? 'Без спешки и поражений.<br>Выберите свой мир.<br>Останьтесь на мгновение.' : 'Падающие фигуры.<br>Рождающаяся музыка.<br>Только этот момент.';
    text('start-button', game.mode === 'zen' ? 'Начать дзен ∞' : 'Начать →');
  }
  $('journey-mode').setAttribute('aria-pressed', String(game.mode === 'journey'));
  $('zen-mode').setAttribute('aria-pressed', String(game.mode === 'zen'));
  $('pause-button').disabled = !started || finished;
  $('pause-button').setAttribute('aria-label', paused ? 'Продолжить игру' : 'Пауза');
  $('pause-button').querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
  lastHUD = ''; updateHUD();
}

function pause() {
  if (!started || game.status !== 'playing') { audio.pause().catch(() => {}); return; }
  paused = true; clearInput(); save();
  audio.pause().catch(() => {}); overlay();
}

function start() {
  if (modalOpen()) return;
  if (game.status !== 'playing') {
    const mode = game.status === 'complete' ? 'zen' : game.mode;
    game = new ResonanceGame({ mode });
    prefs.mode = mode;
    if (mode === 'zen') prefs.zenWorld = 2;
    savePrefs();
  }
  started = true; paused = false; clearInput();
  lastFrame = performance.now();
  renderer.setWorld(currentWorld());
  resumeAudio(); overlay(); save();
  $('board').focus({ preventScroll: true });
  announce('Игра началась. Стрелки — движение и поворот. Пробел — сброс.');
}

function reset() {
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  audio.pause().catch(() => {});
  clearInput();
  game = new ResonanceGame({ mode: prefs.mode });
  started = false; paused = false; previousWorld = -1; previewKey = '';
  renderer.particles = []; renderer.rings = []; renderer.trails = []; renderer.rowFlashes = []; renderer.lastActive = null;
  try { localStorage.removeItem(SAVE); } catch { /* The new game remains playable. */ }
  overlay(); updateHUD(); $('start-button').focus({ preventScroll: true });
}

function openDialog(id) {
  pause(); clearInput();
  $(id).showModal();
}

function action(name) {
  if (!canPlay()) return false;
  let changed = false;
  if (name === 'left') changed = game.move(-1);
  if (name === 'right') changed = game.move(1);
  if (name === 'rotate') changed = game.rotate(1);
  if (name === 'counter') changed = game.rotate(-1);
  if (name === 'down') changed = game.softDrop();
  if (name === 'drop') changed = game.hardDrop();
  if (name === 'hold') changed = game.hold();
  if (name === 'flow') changed = game.activateFlow();
  processEvents(); updateHUD();
  return changed;
}

function showCombo(title, subtitle) {
  const el = $('combo-message'); el.replaceChildren();
  const main = document.createElement('span'); main.textContent = title;
  const small = document.createElement('small'); small.textContent = subtitle;
  el.append(main, small); el.classList.add('visible');
  clearTimeout(comboTimer); comboTimer = setTimeout(() => el.classList.remove('visible'), 1600);
}

function processEvents() {
  let needsSave = false;
  for (const event of game.drainEvents()) {
    renderer.event(event); audio.effect(event);
    if (['lock', 'score', 'hold', 'flow', 'over', 'complete', 'rebirth'].includes(event.type)) needsSave = true;
    if (event.type === 'score') {
      showCombo(['', 'Дыхание', 'Гармония', 'Сияние', 'Резонанс'][event.count] || 'Сияние', event.combo > 0 ? `КОМБО ×${event.combo + 1}` : `${event.count} ${event.count === 1 ? 'ЛИНИЯ СВЕТА' : 'ЛИНИИ СВЕТА'}`);
      announce(`Собрано линий: ${event.count}. Всего: ${game.lines}. Счёт: ${game.score}.`);
    }
    if (event.type === 'flow') { showCombo('Всё замирает', 'ПОТОК · ОЧКИ ×2'); announce('Поток. 16 секунд без гравитации. Очки за линии удваиваются.'); }
    if (event.type === 'flow-end') toast('Возвращаемся к тихому ритму');
    if (event.type === 'rebirth') { showCombo('Новый вдох', 'ВАШ ДЗЕН ПРОДОЛЖАЕТСЯ'); toast('Поле очистилось. Продолжайте в своём ритме.'); }
    if (event.type === 'stage' && game.mode !== 'zen') toast(WORLDS[event.stage].detail);
    if (event.type === 'over' || event.type === 'complete') {
      clearInput(); overlay();
      announce(event.type === 'complete' ? `Путешествие завершено. ${game.score} света.` : `Партия завершена. ${game.score} света. Можно начать снова.`);
      $('start-button').focus({ preventScroll: true });
    }
  }
  if (needsSave) save();
}

function updateHUD() {
  const worldIndex = currentWorld(), world = WORLDS[worldIndex];
  const playing = canPlay();
  const soundPlaying = started && !paused && !modalOpen() && audio.running && !audioUnavailable && !prefs.muted && prefs.music && prefs.volume > 0;
  const key = [game.score, game.lines, Math.floor(game.elapsed), game.charge, Math.ceil(game.flowRemaining), game.status, worldIndex, game.mode, game.held, game.holdUsed, game.queue.join(''), playing, soundPlaying, record[game.mode]].join(':');
  if (key === lastHUD) return;
  lastHUD = key;
  text('score', fmt(game.score));
  text('best', `Личный рекорд · ${fmt(Math.max(record[game.mode], game.score))}`);
  $('lines').replaceChildren(document.createTextNode(String(game.lines)));
  const target = document.createElement('small'); target.textContent = game.mode === 'zen' ? ' / ∞' : ` / ${Math.min(72, (game.stage + 1) * STAGE_LINES)}`; $('lines').append(target);
  text('time', clock(game.elapsed));
  text('mode-label', game.mode === 'zen' ? 'ДЗЕН · БЕЗ СПЕШКИ' : 'ПУТЕШЕСТВИЕ · 72 ЛИНИИ');
  text('board-status', !started ? 'ТИШИНА ПЕРЕД ПЕРВОЙ НОТОЙ' : game.status === 'complete' ? 'ВЫ — ЧАСТЬ ЭТОГО СВЕТА' : paused ? 'МОМЕНТ ТИШИНЫ' : game.flowing ? 'ВРЕМЯ ЗАМИРАЕТ · ОЧКИ ×2' : 'В ВАШЕМ РИТМЕ');
  $('hold-button').disabled = !playing || game.holdUsed || !game.active;
  text('hold-note', game.holdUsed ? 'После посадки' : game.held ? 'Поменять фигуру' : 'Место для вдоха');
  const ready = game.charge >= 100 && !game.flowing;
  $('flow-button').disabled = !playing || !ready;
  $('flow-button').classList.toggle('ready', ready);
  $('flow-button').classList.toggle('flowing', game.flowing);
  text('flow-label', game.flowing ? 'В ПОТОКЕ' : 'ПОТОК');
  text('flow-hint', game.flowing ? 'Падение замерло · очки за линии ×2' : ready ? 'Нажмите — мир подождёт 16 секунд' : 'Собирайте линии, чтобы замедлить мир');
  text('flow-amount', game.flowing ? `${Math.ceil(game.flowRemaining)}с` : `${Math.floor(game.charge)}%`);
  $('flow-fill').style.width = `${game.flowing ? game.flowRemaining / FLOW_SECONDS * 100 : game.charge}%`;
  document.body.classList.toggle('flow-active', game.flowing);
  $('equalizer').classList.toggle('playing', soundPlaying && prefs.motion);
  text('track-title', audioUnavailable ? 'Звук недоступен' : prefs.muted || !prefs.music || !prefs.volume ? 'Момент тишины' : SCORES[audio.context ? audio.stage : worldIndex].title);
  if (previousWorld !== worldIndex) {
    previousWorld = worldIndex;
    renderer.setWorld(worldIndex);
    document.documentElement.style.setProperty('--accent', world.color);
    text('world-number', `${String(worldIndex + 1).padStart(2, '0')} / ${['ПРОБУЖДЕНИЕ', 'ПОГРУЖЕНИЕ', 'БЕСКОНЕЧНОСТЬ'][worldIndex]}`);
    $('world-name').replaceChildren(...world.name.split(' ').flatMap((word, i) => i ? [document.createElement('br'), document.createTextNode(word)] : [document.createTextNode(word)]));
    text('world-detail', world.detail);
  }
  document.querySelectorAll('[data-world]').forEach(button => {
    const i = Number(button.dataset.world);
    button.disabled = game.mode !== 'zen';
    if (i === worldIndex) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    button.style.setProperty('--progress', `${game.mode === 'zen' ? (i === worldIndex ? 100 : 0) : Math.max(0, Math.min(1, (game.lines - i * STAGE_LINES) / STAGE_LINES)) * 100}%`);
    button.title = game.mode === 'zen' ? `Перейти в мир «${WORLDS[i].name}»` : `Мир ${i + 1} · ${i * STAGE_LINES}–${(i + 1) * STAGE_LINES} линий`;
  });
  audio.setWorld(worldIndex, game.flowing, (game.lines % STAGE_LINES) / STAGE_LINES);
  const nextKey = `${game.queue.slice(0, 3).join('')}:${game.held}`;
  if (previewKey !== nextKey) {
    previewKey = nextKey;
    for (let i = 0; i < 3; i++) {
      renderer.preview($(`next-${i}`), game.queue[i]);
      $(`next-${i}`).setAttribute('aria-label', `${i + 1} в очереди: фигура ${game.queue[i]}`);
    }
    renderer.preview($('hold-preview'), game.held);
  }
}

$('start-button').addEventListener('click', start);
$('pause-button').addEventListener('click', () => paused ? start() : pause());
$('new-button').addEventListener('click', () => game.status === 'playing' ? openDialog('restart-dialog') : reset());
$('settings-button').addEventListener('click', () => openDialog('settings-dialog'));
for (const id of ['help-button', 'footer-help']) $(id).addEventListener('click', () => openDialog('help-dialog'));
$('restart-button').addEventListener('click', () => { $('settings-dialog').close(); openDialog('restart-dialog'); });
$('confirm-restart').addEventListener('click', reset);
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => { clearInput(); overlay(); }));
for (const mode of ['journey', 'zen']) $(`${mode}-mode`).addEventListener('click', () => {
  if (started) return;
  prefs.mode = mode; game = new ResonanceGame({ mode }); savePrefs(); overlay();
});
document.querySelectorAll('[data-world]').forEach(button => button.addEventListener('click', () => {
  if (game.mode !== 'zen') return;
  prefs.zenWorld = Number(button.dataset.world); savePrefs(); updateHUD();
  if (canPlay()) $('board').focus({ preventScroll: true });
}));
$('flow-button').addEventListener('click', () => { action('flow'); $('board').focus({ preventScroll: true }); });
$('hold-button').addEventListener('click', () => { action('hold'); $('board').focus({ preventScroll: true }); });
$('sound-button').addEventListener('click', () => {
  if (audioUnavailable) { audioUnavailable = false; prefs.muted = false; } else prefs.muted = !prefs.muted;
  configure(); savePrefs();
  if (started && !paused) resumeAudio();
});
$('volume').addEventListener('input', event => { prefs.volume = Number(event.target.value) / 100; prefs.muted = false; configure(); savePrefs(); });
for (const [id, key] of [['music-toggle', 'music'], ['effects-toggle', 'effects'], ['motion-toggle', 'motion']]) $(id).addEventListener('change', event => { prefs[key] = event.target.checked; configure(); savePrefs(); });
media.addEventListener('change', event => {
  if (typeof read(PREFS)?.motion !== 'boolean') { prefs.motion = !event.matches; configure(); }
});
if (!document.fullscreenEnabled) $('fullscreen-button').hidden = true;
$('fullscreen-button').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { toast('Полноэкранный режим недоступен в этом браузере.'); }
});

document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || modalOpen()) return;
  if (event.code === 'Escape' || event.code === 'KeyP') {
    if (event.target.matches('input,textarea,select') || event.repeat) return;
    if (started && game.status === 'playing') { event.preventDefault(); paused ? start() : pause(); }
    return;
  }
  const name = keys[event.code];
  if (!name || !canPlay() || event.target.closest('button,a,input,textarea,select')) return;
  event.preventDefault();
  if (event.repeat || held.has(event.code)) return;
  action(name);
  if (['left', 'right', 'down'].includes(name)) held.set(event.code, { name, next: performance.now() + (name === 'down' ? 45 : 165) });
});
document.addEventListener('keyup', event => held.delete(event.code));

let gesture = null;
$('board').addEventListener('pointerdown', event => {
  if (!canPlay() || !event.isPrimary || event.button > 0) return;
  event.preventDefault(); $('board').focus({ preventScroll: true });
  $('board').setPointerCapture(event.pointerId);
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, at: performance.now() };
});
$('board').addEventListener('pointermove', event => {
  if (!gesture || event.pointerId !== gesture.id || !canPlay()) return;
  const threshold = Math.max(15, renderer.cell * 0.8);
  let dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
  if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 10) gesture.moved = true;
  while (Math.abs(dx) >= threshold) { action(dx < 0 ? 'left' : 'right'); gesture.x += Math.sign(dx) * threshold; dx = event.clientX - gesture.x; }
  while (dy >= threshold) { action('down'); gesture.y += threshold; dy = event.clientY - gesture.y; }
});
$('board').addEventListener('pointerup', event => {
  if (!gesture || event.pointerId !== gesture.id) return;
  if (!gesture.moved && performance.now() - gesture.at < 400) action('rotate');
  gesture = null;
});
$('board').addEventListener('pointercancel', () => { gesture = null; });
$('board').addEventListener('lostpointercapture', () => { gesture = null; });
document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('pointerdown', event => {
    if (event.button > 0 || !canPlay()) return;
    event.preventDefault(); button.setPointerCapture(event.pointerId);
    const name = button.dataset.action; action(name);
    if (['left', 'right', 'down'].includes(name)) pointerRepeats.set(event.pointerId, { name, next: performance.now() + (name === 'down' ? 55 : 165) });
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, e => pointerRepeats.delete(e.pointerId));
  // Assistive technology and keyboard-generated clicks have no pointerdown.
  button.addEventListener('click', event => { if (event.detail === 0) action(button.dataset.action); });
});

window.addEventListener('blur', pause);
window.addEventListener('pagehide', () => { pause(); save(); clearInput(); cancelAnimationFrame(animationFrame); });
window.addEventListener('pageshow', () => { lastFrame = performance.now(); cancelAnimationFrame(animationFrame); animationFrame = requestAnimationFrame(frame); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); cancelAnimationFrame(animationFrame); }
  else { lastFrame = performance.now(); renderer.lastBackground = -1; cancelAnimationFrame(animationFrame); animationFrame = requestAnimationFrame(frame); }
});
let resizeFrame;
function resize() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => { renderer.resize(); previewKey = ''; lastHUD = ''; updateHUD(); });
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe($('board-frame'));

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
  if (canPlay()) {
    for (const input of [...held.values(), ...pointerRepeats.values()]) if (now >= input.next) {
      action(input.name); input.next = now + (input.name === 'down' ? 45 : 55);
    }
    game.update(dt); processEvents();
    if (now - lastSave > 3000) save();
  }
  updateHUD();
  renderer.draw(game, dt, audio.pulse, paused || modalOpen());
  animationFrame = requestAnimationFrame(frame);
}

configure(); overlay(); updateHUD();
if (saved) text('save-status', 'Партия восстановлена · продолжите, когда будете готовы');
animationFrame = requestAnimationFrame(frame);
