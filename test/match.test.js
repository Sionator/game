import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, solveShot } from '../server/match.js';
import { Bot } from '../server/bot.js';
import { HOOP, BALL_G } from '../shared/constants.js';

test('solveShot trifft den Ringmittelpunkt', () => {
  const S = { x: 3, y: 2.35, z: 8 };
  const v = solveShot(S, HOOP, 52);
  // Flugbahn abtasten
  let p = { ...S }, vel = { ...v }, best = 9;
  for (let i = 0; i < 2000; i++) {
    const dt = 1 / 600;
    vel.vy -= BALL_G * dt;
    p.x += vel.vx * dt; p.y += vel.vy * dt; p.z += vel.vz * dt;
    if (vel.vy < 0 && Math.abs(p.y - HOOP.y) < 0.02) best = Math.min(best, Math.hypot(p.x - HOOP.x, p.z - HOOP.z));
  }
  assert.ok(best < 0.03, 'Abstand ' + best);
});

test('perfekter Wurf ist ein Treffer', () => {
  const events = [];
  const m = new Match([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { target: 11 }, (e) => events.push(e));
  m.setupCheck('a');
  for (let i = 0; i < 120; i++) m.tick(1 / 60);
  const b = m.get('b'); b.x = -6; b.z = 12; // Verteidiger weit weg
  m.onShootStart('a');
  for (let i = 0; i < 20; i++) m.tick(1 / 60);
  m.onShootRelease('a', 0.8);
  for (let i = 0; i < 180; i++) m.tick(1 / 60);
  const sc = events.find((e) => e.k === 'score');
  assert.ok(sc, 'kein Korb: ' + events.map((e) => e.k).join(','));
  assert.equal(sc.pts, 3);
  assert.equal(sc.swish, true);
});

test('Bot gegen Bot spielt ein komplettes Spiel', () => {
  const events = [];
  const m = new Match([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { target: 11 }, (e) => events.push(e));
  const bots = [new Bot(m, 'a', 'hard'), new Bot(m, 'b', 'medium')];
  let steps = 0;
  while (m.phase !== 'over' && steps < 60 * 60 * 15) {
    for (const b of bots) b.update(1 / 60);
    m.tick(1 / 60);
    for (const p of m.p) for (const k of ['x', 'y', 'z']) assert.ok(Number.isFinite(p[k]));
    assert.ok(Number.isFinite(m.ball.x) && Number.isFinite(m.ball.y));
    steps++;
  }
  const count = (k) => events.filter((e) => e.k === k).length;
  console.log('Minuten:', (steps / 3600).toFixed(1), 'Score:', m.score, 'Würfe:', count('release'),
    'Körbe:', count('score'), 'Blocks:', count('block'), 'Steals:', count('steal'), 'Dunks:', count('dunk'),
    'Ankle:', count('ankle'), 'Turnover:', events.filter((e) => e.k === 'turnover').map((e) => e.reason).join(','),
    'nicht geklärt:', count('noclear'));
  assert.equal(m.phase, 'over');
});
