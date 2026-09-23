// Bewegungs-Simulation, identisch auf Server (autoritativ) und Client (Vorhersage)
import { COURT, HOOP, PLAYER, clamp } from './constants.js';

export function stepMove(p, inp, dt, hasBall) {
  let mx = inp.mx || 0, mz = inp.mz || 0;
  const m = Math.hypot(mx, mz);
  if (m > 1) { mx /= m; mz /= m; }

  const sprinting = !!inp.sprint && p.stamina > 0.05 && m > 0.1;
  let sp = sprinting ? PLAYER.sprint : PLAYER.speed;
  if (hasBall) sp *= PLAYER.ballSpeedMul;
  sp *= p.speedMul ?? 1;

  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vx = p.dashDx * (p.dashV || PLAYER.dashSpeed);
    p.vz = p.dashDz * (p.dashV || PLAYER.dashSpeed);
  } else {
    const air = p.y > 0.01;
    const k = Math.min(1, PLAYER.accel * dt * (air ? 0.25 : 1));
    p.vx += (mx * sp - p.vx) * k;
    p.vz += (mz * sp - p.vz) * k;
  }

  p.x += p.vx * dt;
  p.z += p.vz * dt;
  const r = PLAYER.r;
  p.x = clamp(p.x, -COURT.halfW + r, COURT.halfW - r);
  p.z = clamp(p.z, r, COURT.len - r);

  if (sprinting) p.stamina = Math.max(0, p.stamina - PLAYER.staminaDrain * dt);
  else p.stamina = Math.min(1, p.stamina + PLAYER.staminaRegen * dt);

  if (m > 0.1) turnTowards(p, Math.atan2(mx, mz), dt * 14);
  else if (hasBall && !(p.dashT > 0)) turnTowards(p, Math.atan2(HOOP.x - p.x, HOOP.z - p.z), dt * 4); // Blick zum Korb
  return sprinting;
}

export function turnTowards(p, target, k) {
  let d = target - p.f;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  p.f += d * Math.min(1, k);
}
