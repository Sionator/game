// Autoritative Spiel-Simulation (1v1 und 2v2)
import {
  COURT, HOOP, BOARD, BALL_R, BALL_G, THREE_R, CHECK_POS, PLAYER, METER,
  SHOT_CLOCK, clamp, hoopDist, isThree, attackAxes, burstDir,
} from '../shared/constants.js';
import { stepMove } from '../shared/sim.js';

const rnd = Math.random;
const r3 = (v) => Math.round(v * 1000) / 1000;
const other = (t) => (t === 'A' ? 'B' : 'A');
const COMBO_WINDOW = 0.9;

export class Match {
  // players: [{ id, name, color, team: 'A'|'B', bot }]
  constructor(players, opts, emit) {
    this.target = opts.target || 11;
    this.emit = emit;
    this.p = players.map((pl) => makePlayer(pl));
    this.mode = this.p.length > 2 ? '2v2' : '1v1';
    this.ball = {
      x: 0, y: 1, z: 9, vx: 0, vy: 0, vz: 0,
      holder: null, shot: null, pass: null, lastTouch: null, lastHolder: null,
      noPick: {}, stuckT: 0, scoredLock: false,
    };
    this.score = { A: 0, B: 0 };
    this.possTeam = null;
    this.cleared = true;
    this.checkIdx = { A: 0, B: 0 };
    this.lastPass = null;
    this.calls = {};
    this.phase = 'check';
    this.phaseT = 0;
    this.after = null;
    this.shotClock = SHOT_CLOCK;
    this.time = 0;
    this.sndT = {};
    this.winner = null;
    this.setupCheck(rnd() < 0.5 ? 'A' : 'B', true);
  }

  get(id) { return this.p.find((p) => p.id === id); }
  team(t) { return this.p.filter((q) => q.team === t); }
  opps(p) { return this.p.filter((q) => q.team !== p.team); }
  mates(p) { return this.p.filter((q) => q.team === p.team && q !== p); }
  holder() { return this.ball.holder ? this.get(this.ball.holder) : null; }

  // Position des Balls in der Dribbelhand (auch für Steals wichtig)
  handPos(h) {
    const fx = Math.sin(h.f), fz = Math.cos(h.f);
    const rx = -Math.cos(h.f), rz = Math.sin(h.f); // "rechts" des Spielers
    let lat = h.hand * PLAYER.handX;
    let fwd = 0.32;
    if (h.switchT > 0) {
      const prog = 1 - clamp(h.switchT / PLAYER.switchTime, 0, 1);
      lat = h.hand * PLAYER.handX * (2 * prog - 1);
      fwd = h.mv === 'legs' ? 0.05 : 0.45;
    }
    return { x: h.x + fx * fwd + rx * lat, z: h.z + fz * fwd + rz * lat };
  }

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
    p.switchT = 0;
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
    if (!h || h.team === p.team) return;
    p.stealCd = 0.8;
    this.emit({ k: 'reach', id });
    if (h.st === 'shoot' || h.st === 'dunk') return;
    const bp = this.handPos(h);
    const d = Math.hypot(bp.x - p.x, bp.z - p.z);
    if (d > 1.35) { p.reachT = 0.35; return; }
    // Nah am Ball = gute Chance. Ball auf der abgewandten Seite = geschützt.
    let chance = 0.45 * clamp(1 - (d - 0.45) / 0.9, 0.12, 1);
    if (h.switchT > 0) chance *= h.mv === 'legs' ? 0.8 : 1.7; // Crossover vor dem Körper ist riskant
    if (h.dashT > 0) chance *= 0.35;
    if (rnd() < chance) {
      const b = this.ball;
      b.holder = null;
      b.x = bp.x; b.y = 0.7; b.z = bp.z;
      const dx = p.x - b.x, dz = p.z - b.z, dl = Math.hypot(dx, dz) || 1;
      b.vx = (dx / dl) * 2.5 + (rnd() - 0.5); b.vy = 2.2; b.vz = (dz / dl) * 2.5 + (rnd() - 0.5);
      b.lastTouch = p.id;
      b.shot = null;
      b.pass = null;
      b.noPick = { [h.id]: 0.45 };
      p.stats.steals++;
      this.emit({ k: 'steal', id, victim: h.id });
    } else {
      p.reachT = 0.35; // Verteidiger ist kurz aus dem Gleichgewicht
    }
  }

  // Q/E: Dribble-Move nach rechts (+1) / links (-1). Ohne Ball = Steal-Versuch.
  onDribble(id, side) {
    const p = this.get(id);
    if (!p || this.phase !== 'play' || p.st !== 'free' || p.y > 0.05) return;
    side = side > 0 ? 1 : -1;
    if (this.ball.holder !== p.id) { this.onSteal(id); return; }
    if (p.moveCd > 0) return;
    const { dx, dz } = burstDir(p.x, p.z, side);
    const tired = p.stamina < 0.1;
    p.dashDx = dx; p.dashDz = dz;
    p.dashT = PLAYER.burstTime;
    p.dashV = tired ? 5 : PLAYER.burstSpeed;
    p.stamina = Math.max(0, p.stamina - PLAYER.moveStamina);
    p.moveCd = PLAYER.moveCd;
    let kind = 'drive';
    if (p.hand !== side) {
      p.hand = side;
      p.switchT = PLAYER.switchTime * 0.8;
      kind = 'cross';
    }
    const combo = this.combo(p, kind, side);
    p.lastMove = { kind, side, t: this.time };
    p.mv = kind; p.mvT = 0.35;
    this.emit({ k: 'move', id, kind, side, combo });
    this.tryAnkle(p, dx, dz, kind, combo);
  }

  // C: Handwechsel zwischen den Beinen
  onSwitch(id) {
    const p = this.get(id);
    if (!p || this.phase !== 'play' || p.st !== 'free' || this.ball.holder !== p.id) return;
    if (p.switchT > 0 || p.switchCd > 0) return;
    p.hand = -p.hand;
    p.switchT = PLAYER.switchTime;
    p.switchCd = 0.35;
    const combo = this.combo(p, 'legs', p.hand);
    p.lastMove = { kind: 'legs', side: p.hand, t: this.time };
    p.mv = 'legs'; p.mvT = 0.35;
    this.emit({ k: 'move', id, kind: 'legs', side: p.hand, combo });
    this.tryAnkle(p, 0, 0, 'legs', combo);
  }

  combo(p, kind, side) {
    const prev = p.lastMove;
    if (!prev || this.time - prev.t > COMBO_WINDOW) return null;
    if (kind === 'cross' && prev.kind === 'cross' && prev.side !== side) return 'double';
    if (kind === 'cross' && prev.kind === 'drive' && prev.side !== side) return 'hesi';
    if (kind === 'drive' && prev.kind === 'legs' && prev.side === side) return 'legsdrive';
    if (kind === 'legs' && prev.kind === 'legs') return 'legslegs';
    if (kind === 'cross' && prev.kind === 'legs') return 'legscross';
    return null;
  }

  tryAnkle(p, dx, dz, kind, combo) {
    const { ux, uz } = attackAxes(p.x, p.z);
    for (const o of this.opps(p)) {
      if (o.st !== 'free' || o.y > 0.05) continue;
      const D = Math.hypot(o.x - p.x, o.z - p.z);
      if (D > 2.2 || D < 1e-3) continue;
      const front = ((o.x - p.x) * ux + (o.z - p.z) * uz) / D;
      if (front < 0.1) continue;
      let c = kind === 'legs' ? 0.01 : 0.03;
      if (kind === 'cross') c += 0.05;
      if (combo) c += 0.14;
      if (kind !== 'legs') {
        const dv = o.vx * dx + o.vz * dz;   // läuft der Verteidiger in die falsche Richtung?
        if (dv < -1.5) c += 0.25; else if (dv < 0) c += 0.05;
      }
      if (o.reachT > 0) c += 0.3;
      c = Math.min(0.7, c);
      if (rnd() < c) {
        o.st = 'stun';
        o.stT = 1.05;
        o.vx = o.vz = 0;
        p.stats.ankles++;
        this.emit({ k: 'ankle', id: p.id, victim: o.id, kind, combo });
        return;
      }
    }
  }

  // F: Pass zum Mitspieler – ohne Ball: Ball fordern
  onPass(id) {
    const p = this.get(id);
    if (!p || this.phase !== 'play') return;
    const mate = this.mates(p)[0];
    if (!mate) return;
    const b = this.ball;
    if (b.holder !== p.id) {
      if (this.time - (this.calls[id] || -9) > 1) {
        this.calls[id] = this.time;
        this.emit({ k: 'call', id });
      }
      return;
    }
    if (p.st !== 'free') return;
    const fx = Math.sin(p.f), fz = Math.cos(p.f);
    const S = { x: p.x + fx * 0.3, y: 1.3, z: p.z + fz * 0.3 };
    const speed = 11;
    let tf = Math.hypot(mate.x - S.x, mate.z - S.z) / speed;
    const T = {
      x: clamp(mate.x + mate.vx * tf, -COURT.halfW + 0.3, COURT.halfW - 0.3),
      z: clamp(mate.z + mate.vz * tf, 0.3, COURT.len - 0.3),
    };
    tf = Math.max(0.15, Math.hypot(T.x - S.x, T.z - S.z) / speed);
    b.holder = null;
    b.x = S.x; b.y = S.y; b.z = S.z;
    b.vx = (T.x - S.x) / tf;
    b.vz = (T.z - S.z) / tf;
    b.vy = (1.25 - S.y) / tf + 0.5 * BALL_G * tf + 0.6;
    b.pass = { from: p.id, to: mate.id, tried: new Set() };
    b.shot = null;
    b.noPick = { [p.id]: 0.4 };
    b.lastTouch = p.id;
    b.lastHolder = p.id;
    p.f = Math.atan2(T.x - p.x, T.z - p.z);
    p.switchT = 0;
    this.lastPass = { from: p.id, to: mate.id, t: this.time };
    delete this.calls[mate.id];
    this.emit({ k: 'pass', id, to: mate.id });
  }

  // ---------------------------------------------------------------- Wurf
  contest(p) {
    let best = 0;
    const ux = HOOP.x - p.x, uz = HOOP.z - p.z, ul = Math.hypot(ux, uz) || 1;
    for (const o of this.opps(p)) {
      if (o.st === 'stun') continue;
      const D = Math.hypot(o.x - p.x, o.z - p.z);
      if (D >= 2.2) continue;
      const dot = ((o.x - p.x) * ux + (o.z - p.z) * uz) / (D * ul || 1);
      if (dot <= 0.1) continue;
      let c = (1 - D / 2.2) * (0.6 + 0.4 * dot);
      if (o.y > 0.2) c *= 1.4;
      best = Math.max(best, clamp(c, 0, 1));
    }
    return best;
  }

  release(p, v) {
    const b = this.ball;
    p.st = 'free';
    if (b.holder !== p.id) return;
    const fx = Math.sin(p.f), fz = Math.cos(p.f);
    const S = { x: p.x + fx * 0.2, y: p.y + 2.35, z: p.z + fz * 0.2 };
    const d = hoopDist(p.x, p.z);
    const three = isThree(p.x, p.z);
    const layup = d < 2.8;
    const contest = this.contest(p);

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
    b.shot = { by: p.id, pts: three ? 3 : 2, cleared: this.cleared, t: 0, rim: false, three, dunk: false, tried: new Set() };
    b.pass = null;
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
    p.dunkTried = new Set();
    p.switchT = 0;
    const dx = p.x - HOOP.x, dz = Math.max(0.3, p.z - HOOP.z), l = Math.hypot(dx, dz) || 1;
    p.dunkFrom = { x: p.x, z: p.z };
    p.dunkTo = { x: HOOP.x + (dx / l) * 0.5, z: HOOP.z + (dz / l) * 0.5 };
    p.f = Math.atan2(HOOP.x - p.x, HOOP.z - p.z);
    p.vx = p.vz = 0;
    this.emit({ k: 'dunkStart', id: p.id });
  }

  // ---------------------------------------------------------------- Ablauf
  setupCheck(team, first = false) {
    const off = this.team(team);
    const def = this.team(other(team));
    if (!off.length) return;
    const h = off[this.checkIdx[team]++ % off.length];
    for (const p of this.p) {
      p.st = 'free'; p.y = 0; p.vy = 0; p.vx = 0; p.vz = 0; p.dashT = 0; p.switchT = 0;
      p.reachT = 0; p.input.mx = 0; p.input.mz = 0; p.hand = 1;
    }
    const side = rnd() < 0.5 ? 1 : -1;
    h.x = CHECK_POS.off.x; h.z = CHECK_POS.off.z; h.f = Math.PI;
    const offMate = off.find((p) => p !== h);
    if (offMate) {
      offMate.x = CHECK_POS.offMate.x * side; offMate.z = CHECK_POS.offMate.z;
      offMate.f = Math.atan2(HOOP.x - offMate.x, HOOP.z - offMate.z);
    }
    if (def[0]) { def[0].x = CHECK_POS.def.x; def[0].z = CHECK_POS.def.z; def[0].f = 0; }
    if (def[1]) {
      def[1].x = CHECK_POS.defMate.x * side; def[1].z = CHECK_POS.defMate.z;
      def[1].f = offMate ? Math.atan2(offMate.x - def[1].x, offMate.z - def[1].z) : 0;
    }
    this.possTeam = team;
    this.cleared = true;
    const b = this.ball;
    b.holder = h.id; b.lastHolder = h.id; b.lastTouch = h.id; b.shot = null; b.pass = null; b.noPick = {};
    b.vx = b.vy = b.vz = 0;
    this.shotClock = SHOT_CLOCK;
    this.phase = 'check';
    this.phaseT = first ? 2.2 : 1.3;
    this.emit({ k: 'check', id: h.id, team });
  }

  changeTo(team, reason, delay = 1.1) {
    this.phase = 'dead';
    this.phaseT = delay;
    this.after = () => this.setupCheck(team);
    this.emit({ k: 'turnover', team, reason });
  }

  awardScore(shot) {
    const p = this.get(shot.by);
    if (!p) return;
    if (!shot.cleared) {
      this.emit({ k: 'noclear', id: p.id });
      this.changeTo(other(p.team), 'noclear', 1.4);
      return;
    }
    this.score[p.team] += shot.pts;
    p.stats.pts += shot.pts;
    p.stats.fgm++;
    if (shot.three) p.stats.tpm++;
    if (shot.dunk) p.stats.dunks++;
    let assist = null;
    const lp = this.lastPass;
    if (lp && lp.to === p.id && this.time - lp.t < 4) {
      const a = this.get(lp.from);
      if (a && a.team === p.team) { a.stats.ast++; assist = a.id; }
    }
    this.lastPass = null;
    p.streak++;
    for (const o of this.opps(p)) {
      o.streak = 0;
      if (o.fire) { o.fire = false; this.emit({ k: 'fireOut', id: o.id }); }
    }
    let fireNow = false;
    if (p.streak >= 3 && !p.fire) { p.fire = true; fireNow = true; }
    this.emit({
      k: 'score', id: p.id, team: p.team, pts: shot.pts, swish: !shot.rim && !shot.dunk,
      dunk: shot.dunk, fire: fireNow, assist, score: { ...this.score },
    });
    if (this.score[p.team] >= this.target) {
      this.phase = 'over';
      this.winner = p.team;
      this.emit({ k: 'over', winner: p.team, score: { ...this.score }, stats: this.statsOut() });
      return;
    }
    this.phase = 'dead';
    this.phaseT = 1.7;
    this.after = () => this.setupCheck(other(p.team));
  }

  statsOut() {
    const s = {};
    for (const p of this.p) s[p.id] = { ...p.stats, team: p.team };
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
        if (!this.cleared && hoopDist(h.x, h.z) > THREE_R + 0.15) {
          this.cleared = true;
          this.emit({ k: 'cleared', id: h.id });
        }
        this.shotClock -= dt;
        if (this.shotClock <= 0 && h.st !== 'shoot' && h.st !== 'dunk') {
          this.shotClock = 0;
          this.changeTo(other(h.team), 'shotclock');
        }
      }
    }
  }

  tickPlayer(p, dt, frozen) {
    p.stealCd = Math.max(0, p.stealCd - dt);
    p.moveCd = Math.max(0, p.moveCd - dt);
    p.switchCd = Math.max(0, p.switchCd - dt);
    p.switchT = Math.max(0, p.switchT - dt);
    p.reachT = Math.max(0, p.reachT - dt);
    if (p.mvT > 0) { p.mvT -= dt; if (p.mvT <= 0) p.mv = ''; }
    const hasBall = this.ball.holder === p.id;
    p.speedMul = (p.reachT > 0 ? 0.45 : 1) * (p.switchT > 0 && p.mv === 'legs' ? 0.8 : 1);

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
      if (p.stT > METER.dur * 1.3) this.release(p, 1.3);
    } else {
      p.sprinting = stepMove(p, p.input, dt, hasBall);
    }

    if (p.y > 0 || p.vy > 0) {
      const g = PLAYER.gravity * (p.st === 'shoot' ? PLAYER.shootGravityMul : 1);
      p.vy -= g * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) { p.y = 0; p.vy = 0; }
    }
  }

  tickDunk(p, dt) {
    const b = this.ball;
    p.stT += dt;
    const T1 = 0.45;
    if (p.stT < T1) {
      const f = p.stT / T1;
      p.x = p.dunkFrom.x + (p.dunkTo.x - p.dunkFrom.x) * f;
      p.z = p.dunkFrom.z + (p.dunkTo.z - p.dunkFrom.z) * f;
      p.y = Math.sin(f * Math.PI / 2) * 1.05;
      // Jeder Verteidiger bekommt genau eine Block-Chance, wenn er nah genug in der Luft ist
      const o = this.opps(p).find((q) => q.y > 0.3 && q.st === 'free' && !p.dunkTried.has(q.id) &&
        Math.hypot(q.x - p.x, q.z - p.z) < 1.05 && (p.dunkTried.add(q.id), rnd() < 0.45));
      if (o && b.holder === p.id) {
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
        b.shot = { by: p.id, pts: 2, cleared: this.cleared, t: 1, rim: true, three: false, dunk: true, tried: new Set() };
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
    const min = PLAYER.r * 2;
    for (let i = 0; i < this.p.length; i++) {
      for (let j = i + 1; j < this.p.length; j++) {
        const a = this.p[i], b = this.p[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) / 2;
        const nx = dx / d, nz = dz / d;
        if (a.st !== 'dunk') { a.x -= nx * push; a.z -= nz * push; }
        if (b.st !== 'dunk') { b.x += nx * push; b.z += nz * push; }
      }
    }
  }

  tickBall(dt) {
    const b = this.ball;
    for (const k in b.noPick) { b.noPick[k] -= dt; if (b.noPick[k] <= 0) delete b.noPick[k]; }

    const h = this.holder();
    if (h) {
      const hp = this.handPos(h);
      b.x = hp.x; b.z = hp.z;
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
        b.shot = null;
        b.scoredLock = false;
      }
    }
    if (b.y <= BALL_R + 0.001) { b.vx *= 0.985; b.vz *= 0.985; }

    // Block
    if (b.shot && !b.shot.dunk && b.shot.t < 0.55 && b.vy > -0.5) {
      const shooter = this.get(b.shot.by);
      for (const o of shooter ? this.opps(shooter) : []) {
        if (o.y <= 0.15 || o.st !== 'free') continue;
        // Blockhand streckt sich Richtung Ball
        const tx = b.x - o.x, tz = b.z - o.z, tl = Math.hypot(tx, tz) || 1;
        const reachOut = Math.min(0.45, tl);
        const d = Math.hypot(b.x - (o.x + (tx / tl) * reachOut), b.y - (o.y + 2.6), b.z - (o.z + (tz / tl) * reachOut));
        if (d >= 0.5 || b.shot.tried.has(o.id)) continue;
        b.shot.tried.add(o.id);
        if (rnd() > 0.6) continue;
        const ax = b.x - HOOP.x, az = b.z - HOOP.z, al = Math.hypot(ax, az) || 1;
        b.vx = (ax / al) * 4 + (rnd() - 0.5) * 3;
        b.vz = (az / al) * 4 + (rnd() - 0.5) * 3;
        b.vy = 1.5;
        b.shot = null;
        b.lastTouch = o.id;
        o.stats.blocks++;
        this.emit({ k: 'block', id: o.id, victim: shooter.id });
        break;
      }
    }

    const out = b.x < -COURT.halfW - 0.3 || b.x > COURT.halfW + 0.3 ||
      b.z > COURT.len + 0.3 || b.z < -0.4;
    if (out && b.y < 2.6 && this.phase === 'play') {
      const last = this.get(b.lastTouch);
      this.changeTo(last ? other(last.team) : 'A', 'out');
      return;
    }

    const sp = Math.hypot(b.vx, b.vy, b.vz);
    if (sp < 0.3 && b.y > 1.5) b.stuckT += dt; else b.stuckT = 0;
    if (b.stuckT > 2 && this.phase === 'play') {
      b.stuckT = 0;
      const last = this.get(b.lastTouch);
      this.changeTo(last ? other(last.team) : 'A', 'stuck');
      return;
    }

    if (this.phase !== 'play') return;
    // Aufheben / Rebound / Pass fangen – der Nächste gewinnt
    let best = null, bestD = 9;
    for (const p of this.p) {
      if (p.st === 'stun' || p.st === 'dunk' || b.noPick[p.id]) continue;
      const hd = Math.hypot(b.x - p.x, b.z - p.z);
      const reach = b.pass && b.pass.to === p.id ? 1.0 : 0.72;
      if (hd > reach) continue;
      if (b.y > p.y + PLAYER.reach || b.y < p.y - 0.3) continue;
      if (b.y > HOOP.y - 0.15 && hoopDist(b.x, b.z) < 0.9) continue; // Goaltending
      if (b.pass && b.pass.to !== p.id && p.team !== this.get(b.pass.from)?.team) {
        // Pass abfangen: eine Chance pro Verteidiger, nur wenn der Ball nah genug vorbeifliegt
        if (b.pass.tried.has(p.id)) continue;
        if (hd > 0.5) continue;
        b.pass.tried.add(p.id);
        if (rnd() > 0.2) continue;
      }
      if (hd < bestD) { best = p; bestD = hd; }
    }
    if (best) this.gainBall(best);
  }

  gainBall(p) {
    const b = this.ball;
    const wasShot = !!b.shot;
    const pass = b.pass;
    const sameTeam = this.possTeam === p.team;
    if (!sameTeam) {
      this.possTeam = p.team;
      this.cleared = false;
      this.shotClock = SHOT_CLOCK;
    }
    if (hoopDist(p.x, p.z) > THREE_R + 0.15) this.cleared = true;
    b.holder = p.id;
    b.shot = null;
    b.pass = null;
    b.noPick = {};
    b.lastHolder = p.id;
    b.lastTouch = p.id;
    p.switchT = 0;
    if (pass && !sameTeam) {
      p.stats.steals++;
      this.emit({ k: 'intercept', id: p.id, victim: pass.from });
    } else {
      this.emit({ k: 'pickup', id: p.id, own: sameTeam, rebound: wasShot || (b.y > 1.4 && !pass), catch: !!pass, cleared: this.cleared });
    }
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
    if (b.shot) b.shot.rim = true;
    this.shotClock = SHOT_CLOCK;
  }

  // Leave/Bot-Übernahme
  setBot(id, bot) {
    const p = this.get(id);
    if (p) p.bot = bot;
  }

  snapshot() {
    const b = this.ball;
    return {
      ph: this.phase,
      pt: r3(Math.max(0, this.phaseT)),
      sc: r3(Math.max(0, this.shotClock)),
      score: this.score,
      pos: this.possTeam,
      cl: this.cleared,
      p: this.p.map((p) => ({
        id: p.id, tm: p.team, x: r3(p.x), y: r3(p.y), z: r3(p.z), vx: r3(p.vx), vz: r3(p.vz),
        f: r3(p.f), st: p.st, sta: r3(p.stamina), fire: p.fire, hd: p.hand, mv: p.mv,
        sw: p.switchT > 0 ? 1 : 0, sm: r3(p.speedMul), dc: r3(p.moveCd), sp: p.sprinting ? 1 : 0,
      })),
      b: {
        x: r3(b.x), y: r3(b.y), z: r3(b.z), h: b.holder, s: b.shot ? 1 : 0,
        sb: b.shot ? b.shot.by : null, pa: b.pass ? b.pass.to : null,
      },
    };
  }
}

function makePlayer(pl) {
  return {
    id: pl.id, name: pl.name, color: pl.color, team: pl.team || 'A', bot: !!pl.bot,
    x: 0, y: 0, z: 9, vx: 0, vy: 0, vz: 0, f: Math.PI,
    stamina: 1, input: { mx: 0, mz: 0, sprint: false },
    st: 'free', stT: 0, dashT: 0, dashDx: 0, dashDz: 0, dashV: 0, stealCd: 0,
    hand: 1, switchT: 0, switchCd: 0, moveCd: 0, mv: '', mvT: 0, lastMove: null, reachT: 0, speedMul: 1,
    streak: 0, fire: false, sprinting: false, shootSpeed: 0,
    stats: { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, dunks: 0, blocks: 0, steals: 0, ankles: 0, ast: 0 },
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
