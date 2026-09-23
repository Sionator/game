// KI für Bots (Übungsmodus, Auffüllen im 2v2, Ersatz bei Verbindungsabbruch)
import { HOOP, METER, THREE_R, hoopDist, attackAxes } from '../shared/constants.js';

const LEVELS = {
  easy: { sigma: 0.13, react: 0.35, steal: 0.25, shootOpen: 2.4, speed: 0.75, moves: 0.6, pass: 0.6 },
  medium: { sigma: 0.075, react: 0.2, steal: 0.5, shootOpen: 1.9, speed: 0.9, moves: 1.2, pass: 1 },
  hard: { sigma: 0.04, react: 0.1, steal: 0.9, shootOpen: 1.5, speed: 1, moves: 1.8, pass: 1.4 },
  // „King“: Power-Forward – trifft sicher, reagiert blitzschnell, sucht den Weg zum Korb
  king: { sigma: 0.035, react: 0.07, steal: 1, shootOpen: 1.7, speed: 1.05, moves: 1.6, pass: 1.6 },
};

const SPOTS = [
  { x: 0, z: 8.2 }, { x: -4.6, z: 6.4 }, { x: 4.6, z: 6.4 },
  { x: -6.4, z: 1.2 }, { x: 6.4, z: 1.2 }, { x: -2.2, z: 5.2 },
  { x: 2.2, z: 5.2 }, { x: 0, z: 5.6 }, { x: -3.4, z: 3.0 }, { x: 3.4, z: 3.0 },
];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

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
    this.passAt = -1;
  }

  update(dt) {
    const m = this.m;
    const me = m.get(this.id);
    if (!me || !me.bot) return;
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
      this.passAt = -1;
      return;
    }

    const b = m.ball;
    const holder = m.holder();
    if (holder === me) this.offenseBall(me, inp, dt);
    else if (holder && holder.team === me.team) this.offenseOff(me, holder, inp, dt);
    else if (holder) this.defense(me, holder, inp, dt);
    else this.loose(me, inp, b);

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

  nearestOpp(me, to = me) {
    let best = null, bd = 99;
    for (const o of this.m.opps(me)) { const d = dist(o, to); if (d < bd) { bd = d; best = o; } }
    return { o: best, d: bd };
  }

  mark(me) {
    const mine = this.m.team(me.team);
    const opps = this.m.opps(me);
    return opps[mine.indexOf(me) % opps.length];
  }

  // ------------------------------------------------ Angriff mit Ball
  offenseBall(me, inp, dt) {
    const m = this.m;
    const mate = m.mates(me)[0];
    const { o, d: dO } = this.nearestOpp(me);
    const mateOpen = mate && this.nearestOpp(me, mate).d > 2.2;

    // Pass: Mitspieler fordert oder ist frei, während ich gedeckt bin
    if (mate) {
      const called = m.time - (m.calls[mate.id] ?? -9) < 1.5;
      if (this.passAt < 0 && (called || (mateOpen && dO < 1.5 && Math.random() < dt * this.cfg.pass) ||
          (!m.cleared && mateOpen && hoopDist(mate.x, mate.z) > THREE_R + 0.3 && Math.random() < dt * 2))) {
        this.passAt = this.t + this.cfg.react;
      }
      if (this.passAt > 0 && this.t >= this.passAt) {
        this.passAt = -1;
        this.spot = null;
        m.onPass(this.id);
        return;
      }
    }

    this.spotT -= dt;
    if (!m.cleared) {
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
    const hd = hoopDist(me.x, me.z);

    // Dribble-Moves gegen einen Verteidiger vor mir
    if (o && dO < 1.8 && me.moveCd <= 0 && Math.random() < dt * this.cfg.moves) {
      const { rx, rz } = attackAxes(me.x, me.z);
      const lv = o.vx * rx + o.vz * rz;
      const r = Math.random();
      if (r < 0.25) m.onSwitch(this.id);
      else {
        // gegen die Laufrichtung des Verteidigers
        const side = lv > 0.8 ? -1 : lv < -0.8 ? 1 : (Math.random() < 0.5 ? 1 : -1);
        m.onDribble(this.id, side);
      }
      return;
    }

    if (this.drive) {
      this.moveTo(me, inp, this.spot.x, this.spot.z, true);
      if (hd < 2.5 && me.sprinting && Math.hypot(me.vx, me.vz) > 4.3) { m.onShootStart(this.id); return; }
      if (hd < 1.6) this.startShot();
      return;
    }

    const d = this.moveTo(me, inp, this.spot.x, this.spot.z, false);
    const open = dO > this.cfg.shootOpen;
    if ((d < 0.6 && (open || Math.random() < dt * 0.5)) || m.shotClock < 3.5) this.startShot();
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

  // ------------------------------------------------ Angriff ohne Ball (2v2)
  offenseOff(me, holder, inp, dt) {
    this.spotT -= dt;
    const myDef = this.nearestOpp(me).d;
    if (!this.spot || this.spotT <= 0 || dist(this.spot, holder) < 3) {
      if (myDef > 2.5 && Math.random() < 0.3) {
        this.spot = { x: (Math.random() - 0.5) * 2, z: HOOP.z + 1.5 }; // Cut zum Korb
      } else {
        const cands = SPOTS.filter((s) => dist(s, holder) > 3.5).sort((a, b) => dist(b, holder) - dist(a, holder));
        this.spot = cands[Math.floor(Math.random() * Math.min(3, cands.length))] || SPOTS[0];
      }
      this.spotT = 2 + Math.random() * 2;
    }
    this.moveTo(me, inp, this.spot.x, this.spot.z, dist(me, this.spot) > 3);
  }

  // ------------------------------------------------ Verteidigung
  defense(me, holder, inp, dt) {
    const m = this.m;
    const mark = this.mark(me) || holder;
    const guardBall = mark === holder;
    const hx = HOOP.x - mark.x, hz = HOOP.z - mark.z, hl = Math.hypot(hx, hz) || 1;
    let tx, tz;
    if (guardBall) {
      const gap = m.cleared ? 1.3 : 2.2;
      tx = mark.x + (hx / hl) * gap; tz = mark.z + (hz / hl) * gap;
    } else {
      // zwischen Gegenspieler und Korb, etwas Richtung Ball (Help-Defense)
      tx = mark.x + (hx / hl) * 1.5 + (holder.x - mark.x) * 0.2;
      tz = mark.z + (hz / hl) * 1.5 + (holder.z - mark.z) * 0.2;
    }
    const d = this.moveTo(me, inp, tx, tz, true);
    if (d < 0.3) { inp.mx = 0; inp.mz = 0; }

    const dH = dist(holder, me);
    if ((holder.st === 'shoot' || holder.st === 'dunk') && dH < 2.2) {
      if (this.jumpAt < 0) this.jumpAt = this.t + this.cfg.react * (0.6 + Math.random() * 0.8);
    } else if (holder.st === 'free') this.jumpAt = -1;
    if (this.jumpAt > 0 && this.t >= this.jumpAt) {
      m.onShootStart(this.id);
      this.jumpAt = -1e9;
    }
    if (dH < 1.3 && me.stealCd <= 0 && Math.random() < dt * this.cfg.steal) m.onSteal(this.id);
  }

  loose(me, inp, b) {
    const mates = this.m.team(me.team);
    const tx = b.x + b.vx * 0.25, tz = b.z + b.vz * 0.25;
    const closest = mates.reduce((a, q) => (dist(q, { x: tx, z: tz }) < dist(a, { x: tx, z: tz }) ? q : a), me);
    if (closest !== me && !b.pass) {
      this.moveTo(me, inp, HOOP.x + (me.x > 0 ? 2.5 : -2.5), HOOP.z + 3.5, false);
      return;
    }
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
