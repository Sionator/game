// Einfache KI für den Übungsmodus
import { HOOP, METER, THREE_R, hoopDist } from '../shared/constants.js';

const LEVELS = {
  easy: { sigma: 0.13, react: 0.35, steal: 0.25, shootOpen: 2.4, speed: 0.75 },
  medium: { sigma: 0.075, react: 0.2, steal: 0.5, shootOpen: 1.9, speed: 0.9 },
  hard: { sigma: 0.04, react: 0.1, steal: 0.9, shootOpen: 1.5, speed: 1 },
};

const SPOTS = [
  { x: 0, z: 8.2 }, { x: -4.6, z: 6.4 }, { x: 4.6, z: 6.4 },
  { x: -6.4, z: 1.2 }, { x: 6.4, z: 1.2 }, { x: -2.2, z: 5.2 },
  { x: 2.2, z: 5.2 }, { x: 0, z: 5.6 }, { x: -3.4, z: 3.0 }, { x: 3.4, z: 3.0 },
];

export class Bot {
  constructor(match, id, level = 'medium') {
    this.m = match;
    this.id = id;
    this.cfg = LEVELS[level] || LEVELS.medium;
    this.spot = null;
    this.spotT = 0;
    this.drive = false;
    this.releaseAt = -1;
    this.shootT = 0;
    this.jumpAt = -1;
    this.t = 0;
    this.decideT = 0;
  }

  update(dt) {
    const m = this.m;
    const me = m.get(this.id);
    if (!me) return;
    const o = m.opp(me);
    this.t += dt;
    const inp = { mx: 0, mz: 0, sprint: false };

    if (me.st === 'shoot') {
      this.shootT += dt;
      if (this.shootT >= this.releaseAt) m.onShootRelease(this.id, this.shootT / METER.dur);
      m.onInput(this.id, inp);
      return;
    }
    if (m.phase !== 'play' || me.st !== 'free') {
      m.onInput(this.id, inp);
      this.spot = null;
      return;
    }

    const b = m.ball;
    if (b.holder === me.id) this.offense(me, o, inp, dt);
    else if (b.holder && o && b.holder === o.id) this.defense(me, o, inp, dt);
    else this.chase(me, o, inp);

    const s = this.cfg.speed;
    inp.mx *= s; inp.mz *= s;
    m.onInput(this.id, inp);
  }

  moveTo(me, inp, x, z, sprint) {
    const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz);
    if (d > 0.25) { inp.mx = dx / d; inp.mz = dz / d; }
    inp.sprint = sprint && d > 1.5;
    return d;
  }

  offense(me, o, inp, dt) {
    const m = this.m;
    this.spotT -= dt;
    if (!me.cleared) {
      const a = Math.atan2(me.x - HOOP.x, me.z - HOOP.z);
      const R = THREE_R + 0.9;
      this.moveTo(me, inp, HOOP.x + Math.sin(a) * R, Math.min(13, HOOP.z + Math.cos(a) * R + 0.5), true);
      return;
    }
    if (!this.spot || this.spotT <= 0) {
      this.drive = Math.random() < 0.35;
      this.spot = this.drive ? { x: (Math.random() - 0.5) * 1.2, z: HOOP.z + 1.2 } : SPOTS[Math.floor(Math.random() * SPOTS.length)];
      this.spotT = 2 + Math.random() * 2.5;
    }
    const dO = o ? Math.hypot(o.x - me.x, o.z - me.z) : 99;
    const hd = hoopDist(me.x, me.z);

    if (this.drive) {
      this.moveTo(me, inp, this.spot.x, this.spot.z, true);
      if (hd < 2.5 && me.sprinting && Math.hypot(me.vx, me.vz) > 4.3) {
        m.onShootStart(this.id);
        return;
      }
      if (hd < 1.6) this.startShot();
      if (o && dO < 1.6 && me.dashCd <= 0 && Math.random() < dt * 1.5) {
        const side = Math.random() < 0.5 ? 1 : -1;
        m.onMove(this.id, -inp.mz * side, inp.mx * side);
      }
      return;
    }

    const d = this.moveTo(me, inp, this.spot.x, this.spot.z, false);
    const open = dO > this.cfg.shootOpen;
    const late = m.shotClock < 3.5;
    if ((d < 0.6 && (open || Math.random() < dt * 0.5)) || late) {
      this.startShot();
    } else if (o && dO < 1.5 && me.dashCd <= 0 && Math.random() < dt * 0.8) {
      const side = Math.random() < 0.5 ? 1 : -1;
      const ax = HOOP.x - me.x, az = HOOP.z - me.z, al = Math.hypot(ax, az) || 1;
      m.onMove(this.id, (ax / al) * 0.5 - (az / al) * side, (az / al) * 0.5 + (ax / al) * side);
    }
  }

  startShot() {
    const me = this.m.get(this.id);
    this.m.onShootStart(this.id);
    if (me.st === 'shoot') {
      this.shootT = 0;
      const v = METER.center + gauss() * this.cfg.sigma;
      this.releaseAt = Math.max(0.05, v) * METER.dur;
      this.spot = null;
    }
  }

  defense(me, o, inp, dt) {
    const m = this.m;
    const hx = HOOP.x - o.x, hz = HOOP.z - o.z, hl = Math.hypot(hx, hz) || 1;
    const gap = o.cleared ? 1.3 : 2.2;
    const tx = o.x + (hx / hl) * gap, tz = o.z + (hz / hl) * gap;
    const d = this.moveTo(me, inp, tx, tz, true);
    if (d < 0.3) { inp.mx = 0; inp.mz = 0; }
    me.f = Math.atan2(o.x - me.x, o.z - me.z);

    const dO = Math.hypot(o.x - me.x, o.z - me.z);
    if ((o.st === 'shoot' || o.st === 'dunk') && dO < 2.2) {
      if (this.jumpAt < 0) this.jumpAt = this.t + this.cfg.react * (0.6 + Math.random() * 0.8);
    } else if (o.st === 'free') this.jumpAt = -1;
    if (this.jumpAt > 0 && this.t >= this.jumpAt) {
      m.onShootStart(this.id);
      this.jumpAt = -1e9;
    }
    if (dO < 1.3 && me.stealCd <= 0 && Math.random() < dt * this.cfg.steal) m.onSteal(this.id);
  }

  chase(me, o, inp) {
    const b = this.m.ball;
    // Grobe Vorhersage des Balls
    const tx = b.x + b.vx * 0.25, tz = b.z + b.vz * 0.25;
    const d = this.moveTo(me, inp, tx, tz, true);
    if (d < 1.0 && b.y > 2.2 && b.y < 3.3 && b.vy < 0) this.m.onShootStart(this.id);
  }
}

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
