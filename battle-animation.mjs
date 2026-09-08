// Visual state is separate from the simulation and advances only with its clock.
export const MOTION = {
  spark:   { stride: 14, gait: .30, bob: 1.7, recoil: 2.8, attack: .32, flight: .16 },
  blade:   { stride: 21, gait: .36, bob: 2.2, recoil: 1.0, attack: .48, flight: .18 },
  bulwark: { stride: 21, gait: .19, bob: 1.1, recoil: 2.4, attack: .40, flight: .22 },
  lancer:  { stride: 17, gait: .27, bob: 1.5, recoil: 3.8, attack: .40, flight: .12 },
  mortar:  { stride: 24, gait: 0,   bob: .45, recoil: 3.0, attack: .70, flight: .46 },
  wing:    { stride: 26, gait: 0,   bob: 0,   recoil: 1.9, attack: .34, flight: .20 },
  titan:   { stride: 27, gait: .23, bob: 1.8, recoil: 3.2, attack: .60, flight: .28 },
  tower:   { stride: 24, gait: 0,   bob: 0,   recoil: 1.2, attack: .42, flight: .19 },
  core:    { stride: 24, gait: 0,   bob: 0,   recoil: 0,   attack: .50, flight: .22 }
};

export const STILL_POSE = Object.freeze({
  phase: 0, travel: 0, walk: 0, left: 0, right: 0, kneeLeft: 0, kneeRight: 0,
  liftLeft: 0, liftRight: 0, bob: 0, lean: 0, hover: 0, engine: 0,
  kick: 0, flash: 0, swing: 0, attack: -1, facing: 1, idle: 0, step: 0
});

function sample(track, time) {
  const profile = MOTION[track.kind], phase = track.phase, walk = track.walk;
  const age = track.shot ? time - track.shot.start : Infinity;
  const attack = age >= 0 && age < profile.attack ? age / profile.attack : -1;
  const kick = attack < 0 ? 0 : Math.exp(-age * (track.kind === 'mortar' ? 7 : 14));
  const flash = attack < 0 ? 0 : Math.max(0, 1 - age / .12);
  const sine = Math.sin(phase), leftLift = Math.max(0, -Math.cos(phase));
  const rightLift = Math.max(0, Math.cos(phase)), air = track.kind === 'wing';
  const idle = track.clock;
  return {
    phase, travel: track.travel, walk, idle, facing: track.facing,
    left: sine * profile.gait * walk, right: -sine * profile.gait * walk,
    kneeLeft: leftLift * .36 * walk, kneeRight: rightLift * .36 * walk,
    liftLeft: leftLift * 2.1 * walk, liftRight: rightLift * 2.1 * walk,
    bob: -Math.abs(Math.cos(phase)) * profile.bob * walk + Math.sin(idle * 2) * .25 * (1 - walk),
    lean: air ? Math.sin(idle * 2.7) * .035 + walk * .045 : sine * .028 * walk - kick * .025,
    hover: air ? Math.sin(idle * 3.2) * 2.6 : 0,
    engine: air ? .65 + walk * .35 + Math.sin(idle * 26) * .12 : 0,
    step: (track.kind === 'titan' || track.kind === 'bulwark') ? Math.max(0, 1 - Math.abs(sine) * 5) * walk : 0,
    kick, flash, attack,
    swing: track.kind === 'blade' && attack >= 0 ? (attack < .48 ? -.9 + attack / .48 * 1.65 : .75 * (1 - (attack - .48) / .52)) : 0
  };
}

export function createBattleAnimator() {
  const actors = new Map(), shots = new Map();
  let lastTime = null;

  function ingest(events, time, motion = true) {
    if (!motion) { shots.clear(); return; }
    for (const event of events) {
      if (event.kind === 'shot' && Number.isInteger(event.id)) shots.set(event.id, { ...event, start: time });
      if (event.kind === 'destroy' && Number.isInteger(event.id)) { actors.delete(event.id); shots.delete(event.id); }
    }
  }

  function update(state, time, motion = true) {
    const dt = lastTime === null ? 0 : Math.max(0, Math.min(.1, time - lastTime));
    lastTime = time;
    const alive = new Set();
    for (const unit of [...state.structures, ...state.units]) {
      if (unit.hp <= 0) continue;
      alive.add(unit.id);
      let track = actors.get(unit.id);
      if (!track) {
        track = { kind: unit.kind, x: unit.x, y: unit.y, phase: unit.id * 2.399963, travel: 0,
          clock: unit.id * .73, walk: 0, facing: unit.side ? -1 : 1, shot: null, pose: null, frozen: false };
        actors.set(unit.id, track);
      }
      const dx = unit.x - track.x, dy = unit.y - track.y;
      const distance = Math.hypot(dx, dy);
      track.x = unit.x; track.y = unit.y;
      if (!motion) {
        track.walk = 0; track.shot = null; track.frozen = false;
        track.pose = { ...STILL_POSE, facing: unit.side ? -1 : 1 };
        continue;
      }
      if (unit.stunned > state.time) {
        track.shot = null; shots.delete(unit.id); track.frozen = true;
        track.pose = { ...(track.pose || STILL_POSE), kick: 0, flash: 0, swing: 0, attack: -1, engine: 0, step: 0 };
        continue;
      }
      track.frozen = false;
      const shot = shots.get(unit.id);
      if (shot) { track.shot = shot; track.facing = shot.tx < shot.x ? -1 : 1; }
      if (unit.moving && distance > .001 && dt > 0) {
        track.travel += distance;
        track.phase += distance / MOTION[unit.kind].stride * Math.PI * 2;
        if (Math.abs(dx) > .001) track.facing = dx < 0 ? -1 : 1;
      }
      const walking = unit.moving && distance > .001 ? 1 : 0;
      track.walk += (walking - track.walk) * (1 - Math.exp(-dt * 16));
      track.clock += dt;
      if (track.shot && time - track.shot.start >= MOTION[unit.kind].attack) track.shot = null;
      track.pose = sample(track, time);
    }
    shots.clear();
    for (const id of actors.keys()) if (!alive.has(id)) actors.delete(id);
  }

  return { ingest, update, pose: id => actors.get(id)?.pose || STILL_POSE,
    reset() { actors.clear(); shots.clear(); lastTime = null; },
    get size() { return actors.size; }
  };
}
