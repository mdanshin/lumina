import test from 'node:test';
import assert from 'node:assert/strict';
import { ResonanceAudio, SCORES } from '../resonance-audio.mjs';

// Exercise the musical clock without audio hardware or a browser. Instrument
// synthesis is intentionally not mocked into a claim about perceived sound.
function clockedAudio() {
  const audio = new ResonanceAudio();
  const notes = [];
  audio.context = {
    currentTime: 0, state: 'suspended',
    async resume() { this.state = 'running'; },
    async suspend() { this.state = 'suspended'; },
  };
  audio.nextTime = 0.08;
  audio.delay = { delayTime: { setTargetAtTime() {} } };
  for (const method of ['piano', 'tone', 'pad', 'brush']) audio[method] = (...args) => notes.push({ method, args });
  return { audio, notes };
}

test('the score stays silent before a gesture and resume never creates duplicate clocks', async () => {
  const { audio, notes } = clockedAudio();
  try {
    audio.schedule(); assert.equal(notes.length, 0);
    await audio.resume(); const timer = audio.timer;
    assert.ok(notes.length > 0);
    await audio.resume(); assert.equal(audio.timer, timer);
    const count = notes.length;
    await audio.pause(); audio.context.currentTime = 5; audio.schedule();
    assert.equal(notes.length, count);
    assert.equal(audio.timer, null); assert.equal(audio.context.state, 'suspended');
  } finally { await audio.pause(); }
});

test('changing worlds waits for a musical bar and a stalled clock skips missed notes', () => {
  const { audio, notes } = clockedAudio();
  audio.context.state = 'running'; audio.running = true;
  audio.schedule(); assert.equal(audio.stage, 0);
  audio.setWorld(2, true, 0.7);
  audio.context.currentTime = audio.nextTime; audio.schedule();
  assert.equal(audio.stage, 0);
  while (audio.step < 9) { audio.context.currentTime = audio.nextTime; audio.schedule(); }
  assert.equal(audio.stage, 2);
  assert.equal(audio.flow, true);
  const count = notes.length;
  audio.context.currentTime += 600;
  audio.schedule();
  assert.ok(notes.length - count < 12, 'no ten-minute catch-up burst');
  assert.ok(audio.nextTime > audio.context.currentTime);
  assert.ok(audio.pulse >= 0 && audio.pulse <= 1);
});

test('music and gameplay accents have independent mute controls', () => {
  const { audio, notes } = clockedAudio();
  audio.context.state = 'running'; audio.running = true; audio.music = false;
  audio.schedule(); assert.equal(notes.length, 0);
  audio.effect({ type: 'clear', rows: [18, 19] }); assert.ok(notes.length > 0);
  const count = notes.length;
  audio.effects = false; audio.effect({ type: 'clear', rows: [19] });
  assert.equal(notes.length, count);
  audio.music = true; audio.context.currentTime = audio.nextTime; audio.schedule();
  // Every world's harmony is a finite, audible MIDI register.
  for (const score of SCORES) for (const chord of score.chords) {
    assert.ok(chord.every(note => Number.isFinite(note) && note >= 36 && note <= 84));
  }
});

test('pausing during a pending audio resume does not restart the scheduler', async () => {
  const { audio } = clockedAudio();
  let finishResume;
  audio.context.resume = () => new Promise(resolve => { finishResume = () => { audio.context.state = 'running'; resolve(); }; });
  const pending = audio.resume();
  await audio.pause(); finishResume();
  assert.equal(await pending, false);
  assert.equal(audio.timer, null); assert.equal(audio.context.state, 'suspended');
});
