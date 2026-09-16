try {
  const garden = JSON.parse(localStorage.getItem('lumina-gardens-v1'));
  if (garden?.version === 1) {
    const level = Math.max(1, Math.min(30, Number(garden.unlocked) || 1));
    document.getElementById('garden-progress').textContent = `Продолжить · уровень ${level} из 30`;
  }
  const battle = JSON.parse(localStorage.getItem('lumina-frontier-v1'));
  const record = JSON.parse(localStorage.getItem('lumina-frontier-record-v1'));
  if (battle?.version === 1 && battle.status === 'playing') document.getElementById('front-progress').textContent = 'Продолжить сохранённую схватку';
  else if (Number.isInteger(record?.wins) && record.wins > 0) document.getElementById('front-progress').textContent = `Ваши победы: ${record.wins}`;
} catch { /* The game selector also works when storage is unavailable. */ }

try {
  const resonance = JSON.parse(localStorage.getItem('lumina-resonance-v1'));
  const record = JSON.parse(localStorage.getItem('lumina-resonance-record-v1'));
  if (resonance?.version === 1 && resonance.status === 'playing') document.getElementById('resonance-progress').textContent = 'Продолжить свой поток';
  else {
    const best = Math.max(Number(record?.journey) || 0, Number(record?.zen) || 0);
    if (Number.isSafeInteger(best) && best > 0) document.getElementById('resonance-progress').textContent = `Собрано света: ${best.toLocaleString('ru-RU')}`;
  }
} catch { /* Each world's storage is independent. */ }
