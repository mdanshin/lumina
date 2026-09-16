// Original generative score. Every voice is synthesized locally; no downloads,
// samples, copyrighted recordings, or network services are required.
export const SCORES = [
  { title: 'Первый свет', bpm: 68, chords: [[50, 57, 60, 64, 69], [46, 53, 57, 60, 65], [48, 55, 59, 62, 67], [53, 60, 64, 67, 72]] },
  { title: 'Память воды', bpm: 62, chords: [[53, 60, 64, 67, 72], [52, 59, 62, 67, 71], [50, 57, 60, 64, 69], [48, 55, 59, 62, 67]] },
  { title: 'Мы — созвездия', bpm: 74, chords: [[50, 57, 61, 64, 69], [47, 54, 57, 61, 66], [43, 50, 54, 57, 62], [45, 52, 57, 59, 64]] },
];
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
const MELODIES = [
  [4, -1, -1, 2, -1, -1, 3, -1],
  [-1, -1, 1, -1, -1, 2, -1, 4],
  [3, -1, -1, -1, 2, -1, 1, -1],
  [-1, 2, -1, -1, 0, -1, -1, -1],
  [2, -1, 3, -1, -1, 4, -1, -1],
  [-1, 3, -1, -1, 2, -1, -1, 1],
  [4, -1, -1, 3, -1, -1, 2, -1],
  [1, -1, -1, -1, 0, -1, -1, -1],
];

export class ResonanceAudio {
  constructor() {
    this.context = null;
    this.stage = 0;
    this.pendingStage = 0;
    this.flow = false;
    this.intensity = 0;
    this.music = true;
    this.effects = true;
    this.volume = 0.65;
    this.step = 0;
    this.beatAnchor = 0;
    this.timer = null;
    this.running = false;
    this.nodes = new Set();
    this.lastEffect = -1;
  }

  init() {
    if (this.context) return true;
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) return false;
    const ctx = this.context = new Audio();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 16;
    limiter.ratio.value = 5;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.25;
    this.master.connect(limiter).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.fxBus = ctx.createGain();
    this.musicBus.gain.value = this.music ? 0.78 : 0;
    this.fxBus.gain.value = this.effects ? 0.65 : 0;
    this.musicBus.connect(this.master);
    this.fxBus.connect(this.master);
    // A stereo hall with a soft onset and four seconds of diffuse decay.
    this.reverb = ctx.createConvolver();
    const length = Math.ceil(ctx.sampleRate * 4.8);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    let seed = 91823;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let smooth = 0;
      for (let i = 0; i < length; i++) {
        smooth = smooth * 0.48 + (random() * 2 - 1) * 0.52;
        data[i] = smooth * Math.min(1, i / (ctx.sampleRate * 0.035)) * (1 - i / length) ** 3;
      }
    }
    this.reverb.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    this.reverb.connect(wet).connect(this.master);
    // Send follows the music bus, so muting really silences the whole score.
    this.musicBus.connect(this.reverb);
    this.fxBus.connect(this.reverb);
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 60 / SCORES[0].bpm * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.24;
    const echoFilter = ctx.createBiquadFilter();
    echoFilter.type = 'lowpass'; echoFilter.frequency.value = 2400;
    this.delay.connect(echoFilter).connect(feedback).connect(this.delay);
    const echoLevel = ctx.createGain(); echoLevel.gain.value = 0.22;
    this.delay.connect(echoLevel).connect(this.musicBus);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const noise = this.noise.getChannelData(0);
    for (let i = 0; i < noise.length; i++) noise[i] = random() * 2 - 1;
    this.nextTime = ctx.currentTime + 0.08;
    return true;
  }

  configure({ volume = this.volume, music = this.music, effects = this.effects } = {}) {
    this.volume = Math.min(1, Math.max(0, volume));
    this.music = music;
    this.effects = effects;
    if (!this.context) return;
    const t = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.volume, t, 0.12);
    this.musicBus.gain.setTargetAtTime(music ? 0.78 : 0, t, 0.18);
    this.fxBus.gain.setTargetAtTime(effects ? 0.65 : 0, t, 0.08);
  }

  async resume() {
    if (!this.init()) return false;
    this.running = true;
    await this.context.resume();
    if (!this.running) { await this.context.suspend(); return false; }
    this.nextTime = Math.max(this.nextTime, this.context.currentTime + 0.05);
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
    return this.context.state === 'running';
  }

  async pause() {
    this.running = false;
    clearInterval(this.timer);
    this.timer = null;
    if (this.context?.state === 'running') await this.context.suspend();
  }

  setWorld(stage, flow = false, intensity = 0) {
    this.pendingStage = Math.max(0, Math.min(2, stage));
    this.flow = flow;
    this.intensity = intensity;
  }

  track(source, end, disconnect = []) {
    this.nodes.add(source);
    source.onended = () => {
      source.disconnect();
      for (const node of disconnect) node.disconnect();
      this.nodes.delete(source);
    };
    source.stop(end);
  }

  tone(midi, time, duration, level, { bus = this.musicBus, wave = 'sine', attack = 0.01, pan = 0, detune = 0, cutoff = 0, echo = false } = {}) {
    const ctx = this.context;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = frequency(midi);
    osc.detune.value = detune;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(attack + 0.05, duration));
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const cleanup = [gain, panner];
    if (cutoff) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = 0.35;
      osc.connect(filter).connect(gain); cleanup.push(filter);
    } else osc.connect(gain);
    gain.connect(panner).connect(bus);
    if (echo) panner.connect(this.delay);
    osc.start(time);
    this.track(osc, time + duration + 0.1, cleanup);
  }

  piano(midi, time, velocity = 0.085, pan = 0, bus = this.musicBus) {
    // Felt-like partials: rounded transient, fast upper-harmonic decay.
    for (const [interval, level, duration] of [[0, 1, 3.7], [12, 0.24, 1.5], [19, 0.07, 0.7], [24, 0.025, 0.4]]) {
      this.tone(midi + interval, time, duration, velocity * level, { pan, bus, attack: 0.012, echo: bus === this.musicBus && interval === 0 });
    }
  }

  pad(chord, time, beat) {
    chord.slice(0, 4).forEach((note, i) => {
      for (const detune of [-5, 5]) this.tone(note, time, beat * 7.5, 0.021, { wave: 'triangle', attack: beat * 1.6, cutoff: 950 + i * 260, pan: (i / 3 - 0.5) * 0.85, detune });
    });
  }

  brush(time, level) {
    const ctx = this.context;
    const source = ctx.createBufferSource(); source.buffer = this.noise;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 3100; filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    source.connect(filter).connect(gain).connect(this.musicBus);
    source.start(time);
    this.track(source, time + 0.24, [filter, gain]);
  }

  schedule() {
    if (!this.running || this.context?.state !== 'running') return;
    const ctx = this.context;
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.16) {
      const position = this.step % 8;
      const bar = Math.floor(this.step / 8);
      if (!position) {
        this.stage = this.pendingStage;
        this.delay.delayTime.setTargetAtTime(60 / SCORES[this.stage].bpm * 0.75, this.nextTime, 1);
      }
      const score = SCORES[this.stage], beat = 60 / score.bpm;
      const chord = score.chords[bar % score.chords.length];
      const t = this.nextTime;
      if (!position) this.beatAnchor = t;
      if (this.music) {
        if (!position) this.pad(chord, t, beat);
        if (position === 0 || position === 4) this.tone(chord[0] - 12, t, beat * 3, 0.075, { attack: 0.1 });
        const motif = MELODIES[(bar + this.stage * 2) % MELODIES.length][position];
        if (motif >= 0) this.piano(chord[motif] + 12, t, motif === 4 ? 0.085 : 0.07, Math.sin(bar + position) * 0.35);
        if (position % 2 === 0 && (this.intensity > 0.3 || this.flow)) this.brush(t, this.flow ? 0.012 : 0.006);
        if (this.flow) this.tone(chord[(position + bar) % chord.length] + 24, t, 1.5, 0.025, { attack: 0.02, pan: Math.sin(position) * 0.65, echo: true });
        if (position === 6 && bar % 2 === 0) this.tone(chord[4] + 24, t, 4, 0.012, { attack: 0.3, pan: -0.6 });
      }
      this.nextTime += beat / 2;
      this.step++;
    }
  }

  effect(event) {
    if (!this.effects || !this.running || this.context?.state !== 'running') return;
    const t = this.context.currentTime + 0.008;
    const chord = SCORES[this.stage].chords[Math.floor(Math.max(0, this.step - 1) / 8) % 4];
    if (event.type === 'move' || event.type === 'rotate') {
      if (t - this.lastEffect < 0.065) return;
      this.lastEffect = t;
      this.tone(chord[event.type === 'rotate' ? 3 : 2] + 12, t, 0.2, 0.021, { bus: this.fxBus, attack: 0.005, pan: event.type === 'rotate' ? 0.2 : -0.2 });
    } else if (event.type === 'lock' || event.type === 'hold') {
      this.piano(chord[event.type === 'hold' ? 4 : 0] + 12, t, 0.065, 0, this.fxBus);
    } else if (['clear', 'flow', 'complete', 'rebirth', 'stage'].includes(event.type)) {
      const amount = event.type === 'clear' ? Math.min(5, (event.rows?.length || 1) + 2) : 5;
      chord.slice(0, amount).forEach((note, i) => this.piano(note + 12, t + i * 0.095, 0.085, (i - 2) * 0.18, this.fxBus));
      this.tone(chord[4] + 24, t + 0.22, 5, 0.03, { bus: this.fxBus, attack: 0.1 });
    } else if (event.type === 'drop') {
      this.tone(chord[0] - 12, t, 0.6, 0.09, { bus: this.fxBus, attack: 0.015 });
    }
  }

  get pulse() {
    if (!this.running || !this.context) return 0;
    const beat = 60 / SCORES[this.stage].bpm;
    const phase = ((this.context.currentTime - this.beatAnchor) / beat % 1 + 1) % 1;
    return Math.exp(-phase * 5);
  }

  async dispose() {
    this.running = false;
    clearInterval(this.timer); this.timer = null;
    for (const node of this.nodes) { try { node.stop(); } catch { /* Already ended. */ } }
    this.nodes.clear();
    if (this.context && this.context.state !== 'closed') await this.context.close();
  }
}
