import { createBattle, tick, recruit, cast, upgrade, moveGems, resetBoard, serializeBattle, restoreBattle, UNITS, SPELLS, DIFFICULTIES, ENERGY_CAP, LIMIT, armySize, upgradeCost } from './battle-engine.mjs';
import { adjacent, legalMoves, GEM_NAMES } from './engine.mjs';
import { makeRenderer, drawUnit } from './battle-render.mjs';

const $=id=>document.getElementById(id),fmt=n=>Math.floor(n).toLocaleString('ru-RU');
const STORAGE='lumina-frontier-v1',PREFS='lumina-frontier-prefs-v1',RECORD='lumina-frontier-record-v1';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const gardenPrefs=read('lumina-gardens-v1',{}).prefs||{};
const prefs={sfx:true,music:false,motion:!matchMedia('(prefers-reduced-motion: reduce)').matches,autoHints:gardenPrefs.autoHints!==false,difficulty:'normal',...read(PREFS,{})};
let raw=null;try{raw=localStorage.getItem(STORAGE);}catch{}
let state=restoreBattle(raw)||createBattle(prefs.difficulty),paused=state.status==='playing',selected=-1,cursor=0,keyboard=false,armed=null,pointer=null,lastAction=performance.now(),hints=[],hintUntil=0;
let visualTime=0,lastFrame=performance.now(),accumulator=0,lastHUD=0,lastSave=0,toastUntil=0,gainUntil=0,comboUntil=0,musicAt=0;
const atlas=new Image(),terrain=new Image(),dialog=$('dialog');
const renderer=makeRenderer($('battlefield'),$('puzzle'),atlas,terrain);
let context=null,master=null;
function sound(name,combo=1){
  if(!prefs.sfx&&name!=='ambient')return;
  if(name==='ambient'&&!prefs.music)return;
  try{
    if(!context){context=new (window.AudioContext||window.webkitAudioContext)();master=context.createGain();master.gain.value=.17;master.connect(context.destination);}
    if(context.state==='suspended')context.resume().catch(()=>{});
    const notes=name==='match'?[520*1.08**Math.min(combo,8),780*1.08**Math.min(combo,8)]:name==='win'?[523,659,784,1046]:name==='lost'?[330,262,196]:name==='invalid'?[150]:name==='spell'?[260,520,1040]:name==='ambient'?[130.81,196,261.63]:[480];
    notes.forEach((freq,i)=>{const osc=context.createOscillator(),gain=context.createGain(),t=context.currentTime+i*(name==='ambient'?.4:.09),duration=name==='ambient'?3:.32;osc.type=name==='invalid'?'triangle':'sine';osc.frequency.value=freq;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(name==='ambient'?.1:.48,t+.02);gain.gain.exponentialRampToValueAtTime(.001,t+duration);osc.connect(gain);gain.connect(master);osc.start(t);osc.stop(t+duration+.05);});
  }catch{}
}
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');toastUntil=performance.now()+3400;}
function save(){
  try{localStorage.setItem(PREFS,JSON.stringify(prefs));if(!state.phase)localStorage.setItem(STORAGE,serializeBattle(state));$('save-status').textContent='Схватка сохраняется на этом устройстве';}
  catch{$('save-status').textContent='Сохранение недоступно: не закрывайте вкладку';}
}
function canPlay(){return state.status==='playing'&&!paused&&!dialog.open;}
function applyPrefs(){document.body.classList.toggle('reduced-motion',!prefs.motion);}
function gate(){
  const ready=state.status==='ready',playing=state.status==='playing';
  $('gate').hidden=!(ready||(playing&&paused));
  if(ready){$('gate').querySelector('h1').textContent='Кристальный фронт';$('gate-description').textContent='Собирайте энергию. Ведите армию. Уничтожьте вражеское ядро.';$('start').innerHTML='Начать бой <span aria-hidden="true">→</span>';}
  else if(playing&&paused){$('gate').querySelector('h1').textContent='Бой на паузе';$('gate-description').textContent='Армии ждут вашего возвращения.';$('start').innerHTML='Продолжить <span aria-hidden="true">→</span>';}
  $('pause').setAttribute('aria-label',paused?'Продолжить бой':'Пауза');$('pause').title=paused?'Продолжить бой (пробел)':'Пауза (пробел)';
  $('pause').innerHTML=paused?'<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5Z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M8 5v14m8-14v14"/></svg>';
  $('battle-caption').textContent=ready?'ОЖИДАНИЕ КОМАНДИРА':paused?'ТАКТИЧЕСКАЯ ПАУЗА':state.status==='playing'?'БОЙ В РЕАЛЬНОМ ВРЕМЕНИ':'ОПЕРАЦИЯ ЗАВЕРШЕНА';
}
function start(){if(!atlas.complete||!atlas.naturalWidth){toast('Кристаллы ещё загружаются.');return;}if(state.status==='ready')state.status='playing';paused=false;lastAction=performance.now();sound('select');gate();updateHUD();save();$('puzzle').focus({preventScroll:true});}
function pause(){if(state.status!=='playing'||dialog.open)return;paused=!paused;cancelTarget();gate();lastAction=performance.now();updateHUD();save();if(paused&&context?.state==='running')context.suspend().catch(()=>{});}
function showDialog(html,setup){$('dialog-content').innerHTML=html;if(!dialog.open)dialog.showModal();cancelTarget();setup?.();updateHUD();}
function closeDialog(){dialog.close();}
$('dialog-close').addEventListener('click',closeDialog);
dialog.addEventListener('close',()=>{lastAction=performance.now();updateHUD();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
const purchased=Object.keys(UNITS).filter(k=>k!=='spark');
const shortRoles={blade:'Ближний бой',bulwark:'Тяжёлая броня',lancer:'Против авиации',mortar:'Осадная пушка',wing:'Авиация',titan:'Штурмовой мех'};
$('unit-buttons').innerHTML=purchased.map((kind,i)=>`<button class="unit-card" id="unit-${kind}" title="${UNITS[kind].role}. ${UNITS[kind].hp} здоровья, ${UNITS[kind].damage} урона. Клавиша ${i+1}." aria-label="Призвать ${UNITS[kind].name}, ${UNITS[kind].cost} энергии"><kbd class="unit-key">${i+1}</kbd><span class="unit-count" id="count-${kind}"></span><canvas width="180" height="100" aria-hidden="true"></canvas><span class="unit-name">${UNITS[kind].name}<span class="unit-cost">ϟ ${UNITS[kind].cost}</span></span><span class="unit-role">${shortRoles[kind]}</span></button>`).join('');
for(const kind of purchased){const canvas=$(`unit-${kind}`).querySelector('canvas'),ctx=canvas.getContext('2d');drawUnit(ctx,kind,0,88,82,kind==='titan'?1.08:kind==='wing'?1.25:1.38);$(`unit-${kind}`).addEventListener('click',()=>{if(canPlay()&&recruit(state,0,kind)){sound('select');updateHUD();save();}});}
drawUnit($('free-portrait').getContext('2d'),'spark',0,43,62,1.1);
const symbols={storm:'ϟ',heal:'✚',stasis:'❄'};
$('spell-buttons').innerHTML=Object.entries(SPELLS).map(([kind,d])=>`<button id="spell-${kind}" class="spell-button" title="${d.desc}. Нажмите на поле боя. Клавиша ${d.key}." aria-pressed="false"><span class="spell-symbol" aria-hidden="true">${symbols[kind]}</span><span class="spell-copy"><strong>${d.name}</strong><small>${kind==='storm'?'Урон по области':kind==='heal'?'Восстановление союзников':'Остановка врагов на 5 с'}</small></span><span class="spell-price"><b id="cost-${kind}">ϟ ${d.cost}</b><kbd>${d.key}</kbd></span></button>`).join('');
for(const kind of Object.keys(SPELLS))$(`spell-${kind}`).addEventListener('click',()=>arm(kind));
function arm(kind){if(!canPlay()||state.energy[0]<SPELLS[kind].cost||(state.cooldowns[0][kind]||0)>state.time)return;if(armed?.kind===kind){cancelTarget();return;}armed={kind,x:600,y:191};$('target-banner').hidden=false;$('target-label').textContent=`${SPELLS[kind].name}: выберите область на поле боя`;$('battle-viewport').scrollIntoView({block:'nearest',behavior:prefs.motion?'smooth':'instant'});updateHUD();}
function cancelTarget(){armed=null;$('target-banner').hidden=true;for(const kind of Object.keys(SPELLS)){$(`spell-${kind}`).classList.remove('armed');$(`spell-${kind}`).setAttribute('aria-pressed','false');}}
$('cancel-target').addEventListener('click',cancelTarget);
for(const key of ['attack','armor'])$(`upgrade-${key}`).addEventListener('click',()=>{if(canPlay()&&upgrade(state,0,key)){sound('select');toast(key==='attack'?'Урон всей армии увеличен на 20%.':'Здоровье всей армии увеличено на 18%.');updateHUD();save();}});
function updateHUD(){
  for(const [side,name] of [[0,'ally'],[1,'enemy']]){const core=state.structures.find(s=>s.kind==='core'&&s.side===side);$(`${name}-hp`).textContent=`${fmt(core.hp)} / ${fmt(core.maxHP)}`;$(`${name}-bar`).style.width=`${core.hp/core.maxHP*100}%`;$(`army-${name}`).textContent=armySize(state,side);}
  $('clock').textContent=`${String(Math.floor(state.time/60)).padStart(2,'0')}:${String(Math.floor(state.time%60)).padStart(2,'0')}`;
  $('difficulty-label').textContent=DIFFICULTIES[state.difficulty].name;
  $('match-state').textContent=state.time>=300?'ПЕРЕГРУЗКА · УРОН РАСТЁТ':'СЕКТОР 07 · РАЗЛОМ';
  $('energy').textContent=fmt(state.energy[0]);$('energy-bar').style.width=`${state.energy[0]/ENERGY_CAP*100}%`;
  const active=canPlay();
  for(const kind of purchased){$(`unit-${kind}`).disabled=!active||state.energy[0]<UNITS[kind].cost||armySize(state,0)>=LIMIT;const count=state.units.filter(u=>u.side===0&&u.kind===kind).length;$(`count-${kind}`).textContent=count?'×'+count:'';}
  for(const [kind,d] of Object.entries(SPELLS)){const cooldown=Math.max(0,(state.cooldowns[0][kind]||0)-state.time),b=$(`spell-${kind}`);b.disabled=!active||state.energy[0]<d.cost||cooldown>0;b.classList.toggle('armed',armed?.kind===kind);b.setAttribute('aria-pressed',String(armed?.kind===kind));b.style.setProperty('--cooldown',cooldown/d.cooldown);$(`cost-${kind}`).textContent=cooldown>0?Math.ceil(cooldown)+' с':'ϟ '+d.cost;}
  for(const key of ['attack','armor']){const level=state.upgrades[0][key],b=$(`upgrade-${key}`),cost=upgradeCost(state,0,key);b.innerHTML=`${key==='attack'?'Атака':'Броня'} ${level}/3 <span>${level===3?'МАКС.':'ϟ '+cost}</span>`;b.disabled=!active||level>=3||state.energy[0]<cost;}
  $('stat-energy').textContent=fmt(state.stats[0].energy);$('stat-kills').textContent=state.stats[0].kills;
  $('hint').disabled=!active||!!state.phase;$('shuffle').disabled=!active||!!state.phase||state.time<state.shuffleAt;
  $('shuffle-label').textContent=state.time<state.shuffleAt?Math.ceil(state.shuffleAt-state.time)+' с':'Перемешать';
  $('puzzle').setAttribute('aria-disabled',String(!active||!!state.phase));
}
function settings(){
  showDialog(`<span class="micro">ПАРАМЕТРЫ ФРОНТА</span><h2 id="dialog-title">Настройки</h2>${[['sfx','Звуки боя','Кристаллы, подкрепления и способности'],['music','Фоновая музыка','Мягкие синтезаторные аккорды'],['motion','Анимация и частицы','Движение кристаллов и эффекты'],['autoHints','Автоподсказки','Показывать ход после паузы']].map(([key,title,description])=>`<div class="setting-row"><label for="pref-${key}">${title}<small>${description}</small></label><input id="pref-${key}" type="checkbox" ${prefs[key]?'checked':''}></div>`).join('')}<button id="settings-done" class="primary">Готово</button>`,()=>{for(const key of ['sfx','music','motion','autoHints'])$(`pref-${key}`).addEventListener('change',e=>{prefs[key]=e.target.checked;if(key==='autoHints'){hints=[];hintUntil=0;lastAction=performance.now();}applyPrefs();save();});$('settings-done').onclick=closeDialog;});
}
function help(){showDialog(`<span class="micro">БРИФИНГ КОМАНДИРА</span><h2 id="dialog-title">Энергия решает всё</h2><ol class="rules-list"><li>Собирайте три кристалла: получайте <strong>36 энергии и бойца «Искра»</strong>. Каскады увеличивают награду. Четыре камня создают луч, пять дают призму.</li><li>Тратьте энергию на армию. Войска сами движутся и атакуют. «Стрела» сбивает авиацию, «Гром» разбирает башни, «Бастион» прикрывает слабых бойцов.</li><li>Выберите способность, затем её цель на поле боя. Шторм наносит урон, ремонт восстанавливает здоровье, стазис останавливает врагов.</li><li>Разрушьте две башни и ядро противника. Ходы не ограничены, но сражение идёт постоянно. Через 5 минут урон обеих армий начинает расти.</li></ol><p>1–6: отряды. Q / W / E: способности. H: подсказка. R: перемешать. Пробел: пауза. Esc: отмена способности. На реакторе: стрелки, пробел и стрелка для обмена.</p><button id="briefing-done" class="primary">Понятно</button>`,()=>{$('briefing-done').onclick=closeDialog;});}
function newBattle(){let chosen=state.difficulty;showDialog(`<span class="micro">НОВАЯ ОПЕРАЦИЯ</span><h2 id="dialog-title">Выберите сложность</h2><p>${state.status==='playing'?'Текущая схватка будет заменена новой. ':''}Сложность определяет скорость добычи энергии противником.</p><div class="difficulty-options">${Object.entries(DIFFICULTIES).map(([key,d])=>`<button class="difficulty-option ${key===chosen?'selected':''}" data-difficulty="${key}" aria-pressed="${key===chosen}">${d.name}<small>${key==='easy'?'Спокойный темп':key==='normal'?'Равный соперник':'Быстрые атаки'}</small></button>`).join('')}</div><button id="confirm-new" class="primary">Подготовить схватку</button><button id="cancel-new" class="dialog-secondary">Отмена</button>`,()=>{dialog.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>{chosen=b.dataset.difficulty;dialog.querySelectorAll('[data-difficulty]').forEach(el=>{el.classList.toggle('selected',el===b);el.setAttribute('aria-pressed',String(el===b));});});$('confirm-new').onclick=()=>{prefs.difficulty=chosen;state=createBattle(chosen);paused=false;selected=-1;hints=[];hintUntil=0;armed=null;lastAction=performance.now();renderer.reset();accumulator=0;closeDialog();gate();updateHUD();save();};$('cancel-new').onclick=closeDialog;});}
function result(){
  if(!state.recorded){const record=read(RECORD,{wins:0,losses:0});record[state.status==='won'?'wins':'losses']++;try{localStorage.setItem(RECORD,JSON.stringify(record));}catch{}state.recorded=true;save();}
  gate();const won=state.status==='won';sound(won?'win':'lost');
  showDialog(`<span class="micro">ОПЕРАЦИЯ ЗАВЕРШЕНА</span><h2 id="dialog-title">${won?'Разлом под контролем':state.status==='draw'?'Взаимное уничтожение':'Ядро потеряно'}</h2><p>${won?'Ваши отряды прорвали оборону Багрового легиона. Мост снова принадлежит Стражам рассвета.':'Легион удержал мост. Попробуйте прикрыть осадные пушки бронёй и вовремя сбивать авиацию.'}</p><div class="results-grid"><div><strong>${$('clock').textContent}</strong><span>длительность боя</span></div><div><strong>${fmt(state.stats[0].energy)}</strong><span>энергии добыто</span></div><div><strong>${state.stats[0].kills}</strong><span>врагов уничтожено</span></div><div><strong>×${state.stats[0].maxCombo}</strong><span>лучший каскад</span></div></div><button id="play-again" class="primary">Новая схватка</button><a href="./" class="dialog-secondary">Выбор игры</a>`,()=>{$('play-again').onclick=newBattle;});
}
function cellAt(e){const r=$('puzzle').getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;if(x<0||x>=1||y<0||y>=1)return -1;return Math.floor(y*8)*8+Math.floor(x*8);}
function choose(i){if(i<0||!canPlay()||state.phase)return;hints=[];lastAction=performance.now();if(selected===i){selected=-1;return;}if(selected>=0&&adjacent(selected,i)){moveGems(state,selected,i);selected=-1;updateHUD();}else{selected=i;sound('select');}}
const puzzle=$('puzzle');
puzzle.addEventListener('pointerdown',e=>{if(!canPlay()||state.phase||!e.isPrimary)return;e.preventDefault();puzzle.focus({preventScroll:true});puzzle.setPointerCapture(e.pointerId);pointer={id:e.pointerId,cell:cellAt(e),x:e.clientX,y:e.clientY};keyboard=false;});
puzzle.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const p=pointer;pointer=null;if(puzzle.hasPointerCapture(e.pointerId))puzzle.releasePointerCapture(e.pointerId);const dx=e.clientX-p.x,dy=e.clientY-p.y,threshold=puzzle.getBoundingClientRect().width/8*.3;if(Math.max(Math.abs(dx),Math.abs(dy))>threshold){const b=p.cell+(Math.abs(dx)>Math.abs(dy)?Math.sign(dx):Math.sign(dy)*8);if(adjacent(p.cell,b)&&b>=0&&b<64&&canPlay()){hints=[];selected=-1;lastAction=performance.now();moveGems(state,p.cell,b);}}else choose(p.cell);});
puzzle.addEventListener('pointercancel',()=>{pointer=null;});
puzzle.addEventListener('keydown',e=>{if(!canPlay()||state.phase)return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();keyboard=true;const delta={ArrowUp:-8,ArrowDown:8,ArrowLeft:-1,ArrowRight:1}[e.key],next=cursor+delta;if(next>=0&&next<64&&adjacent(cursor,next)){if(selected>=0){moveGems(state,selected,next);selected=-1;hints=[];}cursor=next;}lastAction=performance.now();$('announcer').textContent=`Ряд ${Math.floor(cursor/8)+1}, столбец ${cursor%8+1}, ${GEM_NAMES[state.board[cursor].type]||'Призма'}`;}else if(e.code==='Space'||e.key==='Enter'){e.preventDefault();e.stopPropagation();keyboard=true;choose(cursor);}});
$('hint').addEventListener('click',()=>{if(!canPlay()||state.phase)return;const moves=legalMoves(state.board);if(moves.length){hints=moves[0];hintUntil=performance.now()+4000;lastAction=performance.now();$('announcer').textContent=`Подсказка: ряд ${Math.floor(hints[0]/8)+1}, столбец ${hints[0]%8+1} и ряд ${Math.floor(hints[1]/8)+1}, столбец ${hints[1]%8+1}.`;}});
$('shuffle').addEventListener('click',()=>{if(canPlay()&&resetBoard(state)){selected=-1;hints=[];lastAction=performance.now();sound('select');save();updateHUD();}});
function fieldPoint(e){const r=$('battlefield').getBoundingClientRect();return{x:Math.max(60,Math.min(1140,(e.clientX-r.left)/r.width*1200)),y:Math.max(120,Math.min(255,(e.clientY-r.top)/r.height*400))};}
$('battlefield').addEventListener('pointermove',e=>{if(armed)Object.assign(armed,fieldPoint(e));});
$('battlefield').addEventListener('click',e=>{if(!armed||!canPlay())return;const {x,y}=fieldPoint(e),kind=armed.kind;if(cast(state,0,kind,x,y)){sound('spell');cancelTarget();updateHUD();save();}else toast(kind==='heal'?'В этой области нет повреждённых союзников.':'В этой области нет подходящих целей.');});
$('battlefield').addEventListener('keydown',e=>{if(!armed||!canPlay())return;if(e.key.startsWith('Arrow')){e.preventDefault();armed.x=Math.max(60,Math.min(1140,armed.x+(e.key==='ArrowLeft'?-40:e.key==='ArrowRight'?40:0)));armed.y=Math.max(120,Math.min(255,armed.y+(e.key==='ArrowUp'?-15:e.key==='ArrowDown'?15:0)));}if(e.key==='Enter'){e.preventDefault();if(cast(state,0,armed.kind,armed.x,armed.y)){cancelTarget();sound('spell');save();updateHUD();}}});
document.addEventListener('keydown',e=>{if(dialog.open||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||e.repeat)return;const key=e.key.toLowerCase();if(e.key==='Escape'){cancelTarget();selected=-1;}else if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();pause();}else if(canPlay()){if(/^[1-6]$/.test(key))$(`unit-${purchased[Number(key)-1]}`).click();if(['q','w','e','й','ц','у'].includes(key)){e.preventDefault();const i=['q','w','e'].includes(key)?['q','w','e'].indexOf(key):['й','ц','у'].indexOf(key);arm(['storm','heal','stasis'][i]);}if(['h','р'].includes(key))$('hint').click();if(['r','к'].includes(key))$('shuffle').click();}});
$('start').onclick=start;$('pause').onclick=pause;$('settings').onclick=settings;$('help').onclick=help;$('new-battle').onclick=newBattle;
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state.status==='playing')paused=true;cancelTarget();save();gate();if(context?.state==='running')context.suspend().catch(()=>{});}lastFrame=performance.now();lastAction=performance.now();});
window.addEventListener('pagehide',save);
atlas.onload=()=>{$('gem-error').hidden=true;};atlas.onerror=()=>{$('gem-error').hidden=false;};$('retry-gems').onclick=()=>{atlas.src='./assets/gems.webp?retry='+Date.now();};
atlas.src='./assets/gems.webp';terrain.src='./assets/frontier.webp';applyPrefs();gate();updateHUD();
function frame(now){
  const dt=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
  if(canPlay()){
    visualTime+=dt;accumulator+=dt;
    while(accumulator>=1/30){tick(state,1/30);accumulator-=1/30;}
    if(prefs.music&&visualTime>musicAt){sound('ambient');musicAt=visualTime+8;}
  }
  if(state.events.length){const events=state.events.splice(0);renderer.ingest(events,visualTime,prefs.motion);for(const e of events){if(e.kind==='match'&&e.side===0){$('energy-gain').textContent='+'+e.gain;$('energy-gain').classList.add('visible');gainUntil=now+1400;$('combo').textContent=e.combo>1?`КАСКАД ×${e.combo} · +${e.gain}`:`+${e.gain} ЭНЕРГИИ`;comboUntil=now+2500;sound('match',e.combo);}if(e.kind==='invalid')sound('invalid');if(e.kind==='shuffle')toast('Реактор перемешан. Новые комбинации готовы.');if(e.kind==='settled'){lastAction=now;save();}if(e.kind==='end'){cancelTarget();updateHUD();save();result();}}}
  if(now>hintUntil)hints=[];
  if(prefs.autoHints&&canPlay()&&!state.phase&&now-lastAction>9500&&now>hintUntil){hints=legalMoves(state.board)[0]||[];hintUntil=now+3400;lastAction=now;}
  renderer.drawBattle(state,visualTime,armed,prefs.motion);renderer.drawPuzzle(state,visualTime,selected,cursor,keyboard,hints,prefs.motion);
  if(now-lastHUD>120){updateHUD();lastHUD=now;}
  if(now-lastSave>4000){save();lastSave=now;}
  if(now>toastUntil)$('toast').classList.remove('visible');if(now>gainUntil)$('energy-gain').classList.remove('visible');if(now>comboUntil)$('combo').textContent='+36 за три кристалла';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if(['won','lost','draw'].includes(state.status))result();
