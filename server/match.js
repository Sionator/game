// Autoritative Spiel-Simulation eines 1v1-Matches
import {
  COURT, HOOP, BOARD, BALL_R, BALL_G, THREE_R, CHECK_POS, PLAYER, METER,
  SHOT_CLOCK, clamp, hoopDist, isThree,
} from '../shared/constants.js';
import { stepMove, turnTowards } from '../shared/sim.js';

const rnd = Math.random;
const r3 = (v) => Math.round(v * 1000) / 1000;

export class Match {
  constructor(players, opts, emit) {
    this.target = opts.target || 11;
    this.emit = emit;
    this.p = players.map((pl) => makePlayer(pl));
    this.ball = {
      x: 0, y: 1, z: 9, vx: 0, vy: 0, vz: 0,
      holder: null, shot: null, lastTouch: null, lastHolder: null,
      noPick: {}, stuckT: 0, scoredLock: false,
    };
    this.score = {};
    for (const p of this.p) this.score[p.id] = 0;
    this.phase = 'check';
    this.phaseT = 0;
    this.after = null;
    this.shotClock = SHOT_CLOCK;
    this.time = 0;
    this.sndT = {};
    this.winner = null;
    this.setupCheck(this.p[Math.floor(rnd() * this.p.length)].id, true);
  }

  get(id) { return this.p.find((p) => p.id === id); }
  opp(p) { return this.p.find((q) => q !== p); }
  holder() { return this.ball.holder ? this.get(this.ball.holder) : null; }

  // ---------------------------------------------------------------- Aktionen
  onInput(id, inp) {
    const p = this.get(id);
    if (!p) return;
    p.input.mx = clamp(+inp.mx || 0, -1, 1);
    p.input.mz = clamp(+inp.mz || 0, -1, 1);
    p.input.sprint = !!inp.sprint;
  }

  onShootStart(id) {
    const p = this.get(id);
    if (!p || this.phase !== 'play' || p.st !== 'free' || p.y > 0.05) return;
    if (this.ball.holder !== p.id) {
      p.vy = PLAYER.jumpV;           // Sprung (Block / Rebound)
      this.emit({ k: 'jump', id });
      return;
    }
    const d = hoopDist(p.x, p.z);
    const speed = Math.hypot(p.vx, p.vz);
    if (d < 2.7 && p.input.sprint && speed > 4.2) {
      this.startDunk(p);
      return;
    }
    p.st = 'shoot';
    p.stT = 0;
    p.vy = PLAYER.jumpV * 0.95;
    p.shootSpeed = speed;
    p.vx *= 0.3; p.vz *= 0.3;
    p.f = Math.atan2(HOOP.x - p.x, HOOP.z - p.z);
    this.emit({ k: 'shootStart', id });
  }

  onShootRelease(id, v) {
    const p = this.get(id);
    if (!p || p.st !== 'shoot') return;
    this.release(p, clamp(+v || 0, 0, 1.5));
  }

  onSteal(id) {
    const p = this.get(id);
    if (!p || this.phase !== 'play' || p.st !== 'free' || p.stealCd > 0) return;
    const h = this.holder();
    if (!h || h === p) return;
    p.stealCd = 0.9;
    this.emit({ k: 'reach', id });
    if (h.st === 'shoot' || h.st === 'dunk') return;
    const D = Math.hypot(h.x - p.x, h.z - p.z);
    if (D > 1.6) return;
    let chance = 0.34 * clamp(1 - (D - 0.7) / 0.9, 0.25, 1);
    if (h.dashT > 0) chance = 0.05;
    // Ball auf der abgewandten Seite (Rücken zum Verteidiger) ist sicherer
    const fx = Math.sin(h.f), fz = Math.cos(h.f);
    const dot = ((p.x - h.x) * fx + (p.z - h.z) * fz) / (D || 1);
    if (dot < -0.3) chance *= 0.55;
    if (rnd() < chance) {
      const b = this.ball;
      b.holder = null;
      b.x = h.x + fx * 0.4; b.y = 0.9; b.z = h.z + fz * 0.4;
      const dx = p.x - b.x, dz = p.z - b.z, dl = Math.hypot(dx, dz) || 1;
      b.vx = (dx / dl) * 2.5 + (rnd() - 0.5); b.vy = 2.2; b.vz = (dz / dl) * 2.5 + (rnd() - 0.5);
      b.lastTouch = p.id;
      b.shot = null;
      b.noPick = { [h.id]: 0.45 };
      p.stats.steals++;
      this.emit({ k: 'steal', id, victim: h.id });
    }
  }

  onMove(id, dx, dz) {
    const p = this.get(id);
    if (!p || this.phase !== 'play' || p.st !== 'free' || p.dashCd > 0 || p.y > 0.05) return;
    let l = Math.hypot(dx, dz);
    if (!(l > 0.1)) { dx = Math.cos(p.f); dz = -Math.sin(p.f); l = 1; }
    p.dashDx = dx / l; p.dashDz = dz / l;
    p.dashT = PLAYER.dashTime;
    p.dashCd = PLAYER.dashCd;
    this.emit({ k: 'dash', id });
    if (this.ball.holder !== p.id) return;
    const o = this.opp(p);
    if (!o || o.st !== 'free' || o.y > 0.05) return;
    const D = Math.hypot(o.x - p.x, o.z - p.z);
    if (D > 2.0) return;
    // Gegner steht vor dem Ballführer (Richtung Korb)?
    const hx = HOOP.x - p.x, hz = HOOP.z - p.z, hl = Math.hypot(hx, hz) || 1;
    const front = ((o.x - p.x) * hx + (o.z - p.z) * hz) / (D * hl || 1);
    let chance = 0.28 + (Math.hypot(o.vx, o.vz) > 5 ? 0.15 : 0);
    if (front > 0.2 && rnd() < chance) {
      o.st = 'stun';
      o.stT = 1.1;
      o.vx = o.vz = 0;
      p.stats.ankles++;
      this.emit({ k: 'ankle', id: p.id, victim: o.id });
    }
  }

  // ---------------------------------------------------------------- Wurf
  release(p, v) {
    const b = this.ball;
    p.st = 'free';
    if (b.holder !== p.id) return;
    const fx = Math.sin(p.f), fz = Math.cos(p.f);
    const S = { x: p.x + fx * 0.2, y: p.y + 2.35, z: p.z + fz * 0.2 };
    const d = hoopDist(p.x, p.z);
    const three = isThree(p.x, p.z);
    const layup = d < 2.8;
    const o = this.opp(p);

    // Wie stark wird der Wurf verteidigt?
    let contest = 0;
    if (o && o.st !== 'stun') {
      const D = Math.hypot(o.x - p.x, o.z - p.z);
      if (D < 2.2) {
        const ux = HOOP.x - p.x, uz = HOOP.z - p.z, ul = Math.hypot(ux, uz) || 1;
        const dot = ((o.x - p.x) * ux + (o.z - p.z) * uz) / (D * ul || 1);
        if (dot > 0.1) {
          contest = (1 - D / 2.2) * (0.6 + 0.4 * dot);
          if (o.y > 0.2) contest *= 1.4;
          contest = clamp(contest, 0, 1);
        }
      }
    }

    const green = p.fire ? METER.fireGreen : METER.green;
    const e = Math.abs(v - METER.center);
    let grade;
    if (e <= green) grade = 'perfect';
    else if (e <= green + 0.08) grade = 'good';
    else grade = v < METER.center ? 'early' : 'late';

    let err = e <= green ? 0 : 0.08 + (e - green) * 2.2;
    err += contest * (0.06 + rnd() * 0.12);
    err += Math.max(0, d - 4.5) * 0.01;
    if (p.shootSpeed > 3) err += 0.03;
    if (layup) err *= 0.6;
    if (p.fire) err *= 0.6;
    if (grade === 'perfect' && contest < 0.12) err = 0;

    const ux = HOOP.x - S.x, uz = HOOP.z - S.z, ul = Math.hypot(ux, uz) || 1;
    const sign = v < METER.center ? -1 : 1;
    const along = sign * err * (sign > 0 ? 1.4 : 0.6) * (0.55 + 0.45 * rnd());
    const lat = (rnd() < 0.5 ? -1 : 1) * err * (0.3 + 0.6 * rnd());
    const T = {
      x: HOOP.x + (ux / ul) * along + (-uz / ul) * lat,
      y: HOOP.y,
      z: HOOP.z + (uz / ul) * along + (ux / ul) * lat,
    };
    const theta = d < 1.2 ? 72 : layup ? 62 : 57;
    const vel = solveShot(S, T, theta);

    b.holder = null;
    b.x = S.x; b.y = S.y; b.z = S.z;
    b.vx = vel.vx; b.vy = vel.vy; b.vz = vel.vz;
    b.shot = { by: p.id, pts: three ? 3 : 2, cleared: p.cleared, t: 0, rim: false, three, dunk: false };
    b.scoredLock = false;
    b.lastTouch = p.id;
    b.lastHolder = p.id;
    b.noPick = { [p.id]: 0.5 };
    p.stats.fga++;
    if (three) p.stats.tpa++;
    this.emit({ k: 'release', id: p.id, grade, contest: r3(contest), three, layup });
  }

  startDunk(p) {
    p.st = 'dunk';
    p.stT = 0;
    p.dunkDone = false;
    const dx = p.x - HOOP.x, dz = Math.max(0.3, p.z - HOOP.z), l = Math.hypot(dx, dz) || 1;
    p.dunkFrom = { x: p.x, z: p.z };
    p.dunkTo = { x: HOOP.x + (dx / l) * 0.5, z: HOOP.z + (dz / l) * 0.5 };
    p.f = Math.atan2(HOOP.x - p.x, HOOP.z - p.z);
    p.vx = p.vz = 0;
    this.emit({ k: 'dunkStart', id: p.id });
  }

  // ---------------------------------------------------------------- Ablauf
  setupCheck(offId, first = false) {
    const off = this.get(offId);
    const def = this.opp(off);
    for (const p of this.p) {
      p.st = 'free'; p.y = 0; p.vy = 0; p.vx = 0; p.vz = 0; p.dashT = 0;
      p.input.mx = 0; p.input.mz = 0;
    }
    off.x = CHECK_POS.off.x; off.z = CHECK_POS.off.z; off.f = Math.PI;
    if (def) { def.x = CHECK_POS.def.x; def.z = CHECK_POS.def.z; def.f = 0; }
    off.cleared = true;
    const b = this.ball;
    b.holder = off.id; b.lastHolder = off.id; b.lastTouch = off.id; b.shot = null; b.noPick = {};
    b.vx = b.vy = b.vz = 0;
    this.shotClock = SHOT_CLOCK;
    this.phase = 'check';
    this.phaseT = first ? 2.2 : 1.3;
    this.emit({ k: 'check', id: off.id });
  }

  changeTo(id, reason, delay = 1.1) {
    this.phase = 'dead';
    this.phaseT = delay;
    this.after = () => this.setupCheck(id);
    this.emit({ k: 'turnover', id, reason });
  }

  awardScore(shot) {
    const p = this.get(shot.by);
    const o = this.opp(p);
    if (!shot.cleared) {
      this.emit({ k: 'noclear', id: p.id });
      this.changeTo(o.id, 'noclear', 1.4);
      return;
    }
    this.score[p.id] += shot.pts;
    p.stats.pts += shot.pts;
    p.stats.fgm++;
    if (shot.three) p.stats.tpm++;
    if (shot.dunk) p.stats.dunks++;
    p.streak++;
    if (o) { o.streak = 0; if (o.fire) { o.fire = false; this.emit({ k: 'fireOut', id: o.id }); } }
    let fireNow = false;
    if (p.streak >= 3 && !p.fire) { p.fire = true; fireNow = true; }
    this.emit({
      k: 'score', id: p.id, pts: shot.pts, swish: !shot.rim && !shot.dunk,
      dunk: shot.dunk, fire: fireNow, score: { ...this.score },
    });
    if (this.score[p.id] >= this.target) {
      this.phase = 'over';
      this.winner = p.id;
      this.emit({ k: 'over', winner: p.id, score: { ...this.score }, stats: this.statsOut() });
      return;
    }
    this.phase = 'dead';
    this.phaseT = 1.7;
    this.after = () => this.setupCheck(o ? o.id : p.id);
  }

  statsOut() {
    const s = {};
    for (const p of this.p) s[p.id] = { ...p.stats };
    return s;
  }

  snd(kind, extra) {
    if (this.time - (this.sndT[kind] || -1) < 0.09) return;
    this.sndT[kind] = this.time;
    this.emit({ k: 'snd', s: kind, ...extra });
  }

  // ---------------------------------------------------------------- Tick
  tick(dt) {
    this.time += dt;
    if (this.phase === 'over') return;

    if (this.phase === 'check') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) { this.phase = 'play'; this.emit({ k: 'go' }); }
    } else if (this.phase === 'dead') {
      this.phaseT -= dt;
      if (this.phaseT <= 0 && this.after) { const f = this.after; this.after = null; f(); }
    }

    const frozen = this.phase === 'check';
    for (const p of this.p) this.tickPlayer(p, dt, frozen);
    this.collidePlayers();
    this.tickBall(dt);

    if (this.phase === 'play') {
      const h = this.holder();
      if (h) {
        if (!h.cleared && hoopDist(h.x, h.z) > THREE_R + 0.15) {
          h.cleared = true;
          this.emit({ k: 'cleared', id: h.id });
        }
        this.shotClock -= dt;
        if (this.shotClock <= 0 && h.st !== 'shoot' && h.st !== 'dunk') {
          this.shotClock = 0;
          const o = this.opp(h);
          this.changeTo(o ? o.id : h.id, 'shotclock');
        }
      }
    }
  }

  tickPlayer(p, dt, frozen) {
    p.stealCd = Math.max(0, p.stealCd - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    const hasBall = this.ball.holder === p.id;

    if (frozen) {
      p.vx = p.vz = 0;
      return;
    }
    if (p.st === 'stun') {
      p.stT -= dt;
      p.vx *= 0.8; p.vz *= 0.8;
      if (p.stT <= 0) p.st = 'free';
    } else if (p.st === 'dunk') {
      this.tickDunk(p, dt);
      return;
    } else if (p.st === 'shoot') {
      p.stT += dt;
      p.vx *= 0.9; p.vz *= 0.9;
      p.x += p.vx * dt; p.z += p.vz * dt;
      if (p.stT > METER.dur * 1.3) this.release(p, METER.dur * 1.3 / METER.dur);
    } else {
      const sprint = stepMove(p, p.input, dt, hasBall);
      p.sprinting = sprint;
    }

    // Vertikal
    if (p.y > 0 || p.vy > 0) {
      const g = PLAYER.gravity * (p.st === 'shoot' ? PLAYER.shootGravityMul : 1);
      p.vy -= g * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) { p.y = 0; p.vy = 0; }
    }
  }

  tickDunk(p, dt) {
    const b = this.ball;
    const o = this.opp(p);
    p.stT += dt;
    const T1 = 0.45;
    if (p.stT < T1) {
      const f = p.stT / T1;
      p.x = p.dunkFrom.x + (p.dunkTo.x - p.dunkFrom.x) * f;
      p.z = p.dunkFrom.z + (p.dunkTo.z - p.dunkFrom.z) * f;
      p.y = Math.sin(f * Math.PI / 2) * 1.05;
      // Block-Chance während des Anlaufs
      if (o && o.y > 0.3 && o.st === 'free' && b.holder === p.id &&
          Math.hypot(o.x - p.x, o.z - p.z) < 1.25) {
        b.holder = null;
        b.x = p.x; b.y = p.y + 2.4; b.z = p.z;
        const ax = p.x - HOOP.x, az = p.z - HOOP.z + 0.5, al = Math.hypot(ax, az) || 1;
        b.vx = (ax / al) * 5 + (rnd() - 0.5) * 2; b.vy = 2; b.vz = (az / al) * 5;
        b.shot = null; b.lastTouch = o.id; b.noPick = { [p.id]: 0.6 };
        o.stats.blocks++;
        p.stats.fga++;
        p.st = 'free'; p.vy = 0;
        this.emit({ k: 'block', id: o.id, victim: p.id, dunk: true });
      }
    } else if (!p.dunkDone) {
      p.dunkDone = true;
      if (b.holder === p.id) {
        b.holder = null;
        b.x = HOOP.x; b.y = HOOP.y + 0.18; b.z = HOOP.z;
        b.vx = 0; b.vy = -5; b.vz = 0;
        b.shot = { by: p.id, pts: 2, cleared: p.cleared, t: 1, rim: true, three: false, dunk: true };
        b.scoredLock = false;
        b.lastTouch = p.id; b.lastHolder = p.id;
        b.noPick = { [p.id]: 0.6 };
        p.stats.fga++;
        this.emit({ k: 'dunk', id: p.id });
      }
    } else if (p.stT > T1 + 0.4) {
      p.st = 'free';
      p.vy = 0;
    }
  }

  collidePlayers() {
    const [a, b] = this.p;
    if (!a || !b) return;
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    const min = PLAYER.r * 2;
    if (d < min && d > 1e-4) {
      const push = (min - d) / 2;
      const nx = dx / d, nz = dz / d;
      if (a.st !== 'dunk') { a.x -= nx * push; a.z -= nz * push; }
      if (b.st !== 'dunk') { b.x += nx * push; b.z += nz * push; }
    }
  }

  tickBall(dt) {
    const b = this.ball;
    for (const k in b.noPick) { b.noPick[k] -= dt; if (b.noPick[k] <= 0) delete b.noPick[k]; }

    const h = this.holder();
    if (h) {
      b.x = h.x + Math.sin(h.f) * 0.4;
      b.z = h.z + Math.cos(h.f) * 0.4;
      b.y = h.y + (h.st === 'shoot' || h.st === 'dunk' ? 2.3 : 0.9);
      b.vx = h.vx; b.vy = 0; b.vz = h.vz;
      return;
    }

    if (b.shot) b.shot.t += dt;
    const N = 4, hdt = dt / N;
    for (let i = 0; i < N; i++) {
      const prevY = b.y;
      b.vy -= BALL_G * hdt;
      b.x += b.vx * hdt; b.y += b.vy * hdt; b.z += b.vz * hdt;
      this.collideBoard(b);
      this.collideRim(b);

      // Korb?
      const hd = Math.hypot(b.x - HOOP.x, b.z - HOOP.z);
      if (!b.scoredLock && prevY >= HOOP.y && b.y < HOOP.y && b.vy < 0 && hd < HOOP.r - 0.02) {
        b.scoredLock = true;
        this.snd('swish');
        if (b.shot && this.phase === 'play') {
          const shot = b.shot;
          b.shot = null;
          this.awardScore(shot);
        }
      }
      // Netz bremst den Ball
      if (hd < HOOP.r + 0.02 && b.y < HOOP.y && b.y > HOOP.y - 0.45) {
        b.vx *= 0.9; b.vz *= 0.9;
        b.x += (HOOP.x - b.x) * 0.08; b.z += (HOOP.z - b.z) * 0.08;
        if (b.vy < -3.5) b.vy *= 0.9;
      }

      if (b.y < BALL_R) {
        b.y = BALL_R;
        if (b.vy < 0) {
          if (b.vy < -1.2) this.snd('bounce', { v: r3(-b.vy) });
          b.vy = -b.vy * 0.72;
          b.vx *= 0.86; b.vz *= 0.86;
          if (b.vy < 0.4) b.vy = 0;
        }
        if (b.shot) b.shot = null; // Wurf ist tot, sobald er den Boden berührt
        b.scoredLock = false;
      }
    }
    if (b.y <= BALL_R + 0.001) { b.vx *= 0.985; b.vz *= 0.985; }

    // Block eines Wurfs
    if (b.shot && !b.shot.dunk && b.shot.t < 0.6 && b.vy > -1) {
      const o = this.p.find((q) => q.id !== b.shot.by);
      if (o && o.y > 0.15 && o.st === 'free') {
        const d = Math.hypot(b.x - o.x, b.y - (o.y + 2.4), b.z - o.z);
        if (d < 0.5) {
          const shooter = this.get(b.shot.by);
          const ax = b.x - HOOP.x, az = b.z - HOOP.z, al = Math.hypot(ax, az) || 1;
          b.vx = (ax / al) * 4 + (rnd() - 0.5) * 3;
          b.vz = (az / al) * 4 + (rnd() - 0.5) * 3;
          b.vy = 1.5;
          b.shot = null;
          b.lastTouch = o.id;
          o.stats.blocks++;
          this.emit({ k: 'block', id: o.id, victim: shooter ? shooter.id : null });
        }
      }
    }

    // Aus?
    const out = b.x < -COURT.halfW - 0.3 || b.x > COURT.halfW + 0.3 ||
      b.z > COURT.len + 0.3 || b.z < -0.4;
    if (out && b.y < 2.6 && this.phase === 'play') {
      const last = this.get(b.lastTouch);
      const to = last ? this.opp(last) : this.p[0];
      this.changeTo((to || this.p[0]).id, 'out');
      return;
    }

    // Ball liegt fest (z. B. auf dem Ring)
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    if (sp < 0.3 && b.y > 1.5) b.stuckT += dt; else b.stuckT = 0;
    if (b.stuckT > 2 && this.phase === 'play') {
      b.stuckT = 0;
      const last = this.get(b.lastTouch);
      this.changeTo((last ? this.opp(last) || last : this.p[0]).id, 'stuck');
      return;
    }

    if (this.phase !== 'play') return;
    // Aufheben / Rebound
    for (const p of this.p) {
      if (p.st === 'stun' || p.st === 'dunk' || b.noPick[p.id]) continue;
      const hd = Math.hypot(b.x - p.x, b.z - p.z);
      if (hd > 0.72) continue;
      if (b.y > p.y + PLAYER.reach || b.y < p.y - 0.3) continue;
      // Goaltending: nichts über dem Ring wegfischen
      if (b.y > HOOP.y - 0.15 && hoopDist(b.x, b.z) < 0.9) continue;
      this.gainBall(p);
      break;
    }
  }

  gainBall(p) {
    const b = this.ball;
    const prevHolder = b.lastHolder;
    const wasShot = !!b.shot;
    b.holder = p.id;
    b.shot = null;
    b.noPick = {};
    const own = prevHolder === p.id;
    p.cleared = own ? p.cleared : false;
    if (hoopDist(p.x, p.z) > THREE_R + 0.15) p.cleared = true;
    if (!own) this.shotClock = SHOT_CLOCK;
    b.lastHolder = p.id;
    b.lastTouch = p.id;
    this.emit({ k: 'pickup', id: p.id, own, rebound: wasShot || b.y > 1.4, cleared: p.cleared });
  }

  collideBoard(b) {
    const cx = clamp(b.x, BOARD.x0, BOARD.x1);
    const cy = clamp(b.y, BOARD.y0, BOARD.y1);
    const cz = clamp(b.z, BOARD.z - BOARD.thick, BOARD.z);
    let nx = b.x - cx, ny = b.y - cy, nz = b.z - cz;
    const d = Math.hypot(nx, ny, nz);
    if (d >= BALL_R) return;
    if (d < 1e-6) { nx = 0; ny = 0; nz = 1; } else { nx /= d; ny /= d; nz /= d; }
    b.x = cx + nx * BALL_R; b.y = cy + ny * BALL_R; b.z = cz + nz * BALL_R;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    if (vn < 0) {
      b.vx -= 1.72 * vn * nx; b.vy -= 1.72 * vn * ny; b.vz -= 1.72 * vn * nz;
      if (vn < -1) this.snd('board', { v: r3(-vn) });
      b.lastTouchBoard = true;
    }
  }

  collideRim(b) {
    let dx = b.x - HOOP.x, dz = b.z - HOOP.z;
    let l = Math.hypot(dx, dz);
    if (l < 1e-6) { dx = 1; dz = 0; l = 1; }
    const px = HOOP.x + (dx / l) * HOOP.r, pz = HOOP.z + (dz / l) * HOOP.r, py = HOOP.y;
    let nx = b.x - px, ny = b.y - py, nz = b.z - pz;
    const d = Math.hypot(nx, ny, nz);
    const min = BALL_R + 0.012;
    if (d >= min || d < 1e-6) return;
    nx /= d; ny /= d; nz /= d;
    b.x = px + nx * min; b.y = py + ny * min; b.z = pz + nz * min;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    if (vn < 0) {
      b.vx -= 1.55 * vn * nx; b.vy -= 1.55 * vn * ny; b.vz -= 1.55 * vn * nz;
      b.vx *= 0.92; b.vz *= 0.92;
      if (vn < -0.6) this.snd('rim', { v: r3(-vn) });
    }
    if (b.shot && !b.shot.rim) { b.shot.rim = true; }
    this.shotClock = SHOT_CLOCK;
  }

  snapshot() {
    const b = this.ball;
    return {
      ph: this.phase,
      pt: r3(Math.max(0, this.phaseT)),
      sc: r3(Math.max(0, this.shotClock)),
      score: this.score,
      p: this.p.map((p) => ({
        id: p.id, x: r3(p.x), y: r3(p.y), z: r3(p.z), vx: r3(p.vx), vz: r3(p.vz),
        f: r3(p.f), st: p.st, sta: r3(p.stamina), fire: p.fire, cl: p.cleared,
        dc: r3(p.dashCd), sp: p.sprinting ? 1 : 0, dash: p.dashT > 0 ? 1 : 0,
      })),
      b: { x: r3(b.x), y: r3(b.y), z: r3(b.z), h: b.holder, s: b.shot ? 1 : 0, sb: b.shot ? b.shot.by : null },
    };
  }
}

function makePlayer(pl) {
  return {
    id: pl.id, name: pl.name, color: pl.color, bot: !!pl.bot,
    x: 0, y: 0, z: 9, vx: 0, vy: 0, vz: 0, f: Math.PI,
    stamina: 1, input: { mx: 0, mz: 0, sprint: false },
    st: 'free', stT: 0, dashT: 0, dashDx: 0, dashDz: 0, dashCd: 0, stealCd: 0,
    cleared: false, streak: 0, fire: false, sprinting: false, shootSpeed: 0,
    stats: { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, dunks: 0, blocks: 0, steals: 0, ankles: 0 },
  };
}

export function solveShot(S, T, thetaDeg) {
  const dx = T.x - S.x, dz = T.z - S.z;
  const d = Math.hypot(dx, dz) || 0.01;
  const h = T.y - S.y;
  let th = (thetaDeg * Math.PI) / 180;
  for (let i = 0; i < 40; i++) {
    const denom = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - h);
    if (denom > 0.05) {
      const v = Math.sqrt((BALL_G * d * d) / denom);
      return { vx: v * Math.cos(th) * (dx / d), vy: v * Math.sin(th), vz: v * Math.cos(th) * (dz / d) };
    }
    th += 0.03;
  }
  return { vx: dx, vy: 5, vz: dz };
}

// exportiert für Bot / Tests
export { turnTowards };
