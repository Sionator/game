import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, solveShot } from '../server/match.js';
import { Bot } from '../server/bot.js';
import { HOOP, BALL_G } from '../shared/constants.js';

const DT = 1 / 60;
const run = (m, n, bots = []) => { for (let i = 0; i < n; i++) { for (const b of bots) b.update(DT); m.tick(DT); } };
const two = () => [{ id: 'a', name: 'A', team: 'A' }, { id: 'b', name: 'B', team: 'B' }];
const four = () => [
  { id: 'a1', name: 'A1', team: 'A' }, { id: 'a2', name: 'A2', team: 'A' },
  { id: 'b1', name: 'B1', team: 'B' }, { id: 'b2', name: 'B2', team: 'B' },
];

test('solveShot trifft den Ringmittelpunkt', () => {
  const S = { x: 3, y: 2.35, z: 8 };
  const v = solveShot(S, HOOP, 52);
  let p = { ...S }, vel = { ...v }, best = 9;
  for (let i = 0; i < 2000; i++) {
    const dt = 1 / 600;
    vel.vy -= BALL_G * dt;
    p.x += vel.vx * dt; p.y += vel.vy * dt; p.z += vel.vz * dt;
    if (vel.vy < 0 && Math.abs(p.y - HOOP.y) < 0.02) best = Math.min(best, Math.hypot(p.x - HOOP.x, p.z - HOOP.z));
  }
  assert.ok(best < 0.03, 'Abstand ' + best);
});

test('perfekter Wurf ist ein Treffer und zählt fürs Team', () => {
  const events = [];
  const m = new Match(two(), { target: 11 }, (e) => events.push(e));
  m.setupCheck('A');
  run(m, 120);
  const b = m.get('b'); b.x = -6; b.z = 12;
  m.onShootStart('a');
  run(m, 20);
  m.onShootRelease('a', 0.8);
  run(m, 180);
  const sc = events.find((e) => e.k === 'score');
  assert.ok(sc, 'kein Korb: ' + events.map((e) => e.k).join(','));
  assert.equal(sc.pts, 3);
  assert.equal(sc.swish, true);
  assert.equal(m.score.A, 3);
});

test('Crossover wechselt die Hand, C wechselt zurück, Pass mit Assist', () => {
  const events = [];
  const m = new Match(four(), { target: 11 }, (e) => events.push(e));
  m.setupCheck('A');
  run(m, 100);
  const h = m.holder();
  assert.equal(h.hand, 1);
  m.onDribble(h.id, -1);           // nach links = Crossover
  assert.equal(h.hand, -1);
  assert.equal(events.at(-1).kind, 'cross');
  run(m, 40);
  m.onSwitch(h.id);
  assert.equal(h.hand, 1);
  assert.equal(events.filter((e) => e.k === 'move').at(-1).kind, 'legs');
  run(m, 30);
  // Pass zum Mitspieler
  const mate = m.mates(h)[0];
  for (const o of m.opps(h)) { o.x = -7; o.z = 13; }
  m.onPass(h.id);
  run(m, 90);
  assert.equal(m.ball.holder, mate.id, 'Pass nicht angekommen');
  mate.x = 0; mate.z = 8;
  run(m, 2);
  m.onShootStart(mate.id);
  run(m, 20);
  m.onShootRelease(mate.id, 0.8);
  run(m, 180);
  const sc = events.find((e) => e.k === 'score');
  assert.ok(sc);
  assert.equal(sc.assist, h.id);
  assert.equal(h.stats.ast, 1);
});

for (const [name, mk] of [['1v1', two], ['2v2', four]]) {
  test(`Bots spielen ein komplettes ${name}-Spiel`, () => {
    const events = [];
    const m = new Match(mk().map((p) => ({ ...p, bot: true })), { target: 11 }, (e) => events.push(e));
    const bots = m.p.map((p, i) => new Bot(m, p.id, i % 2 ? 'medium' : 'hard'));
    let steps = 0;
    while (m.phase !== 'over' && steps < 60 * 60 * 15) {
      for (const b of bots) b.update(DT);
      m.tick(DT);
      for (const p of m.p) for (const k of ['x', 'y', 'z']) assert.ok(Number.isFinite(p[k]));
      assert.ok(Number.isFinite(m.ball.x) && Number.isFinite(m.ball.y));
      steps++;
    }
    const count = (k) => events.filter((e) => e.k === k).length;
    console.log(name, 'Minuten:', (steps / 3600).toFixed(1), 'Score:', m.score, 'Würfe:', count('release'),
      'Körbe:', count('score'), 'Pässe:', count('pass'), 'Assists:', events.filter((e) => e.k === 'score' && e.assist).length,
      'Moves:', count('move'), 'Ankle:', count('ankle'), 'Steals:', count('steal') + count('intercept'),
      'Blocks:', count('block'), 'Dunks:', count('dunk'),
      'Turnover:', events.filter((e) => e.k === 'turnover').map((e) => e.reason).join(','));
    assert.equal(m.phase, 'over');
  });
}
