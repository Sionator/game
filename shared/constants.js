// Gemeinsame Konstanten für Server und Client (Einheiten: Meter, Sekunden)

export const COURT = { halfW: 7.5, len: 14 };           // x: -7.5..7.5, z: 0 (Grundlinie)..14 (Mittellinie)
export const HOOP = { x: 0, y: 3.05, z: 1.575, r: 0.23 };
export const BOARD = { x0: -0.9, x1: 0.9, y0: 2.9, y1: 3.95, z: 1.2, thick: 0.06 };
export const BALL_R = 0.12;
export const BALL_G = 9.81;
export const THREE_R = 6.0;                              // Dreierlinie (Streetball-Maß)
export const CHECK_POS = { off: { x: 0, z: 9.8 }, def: { x: 0, z: 7.7 } };

export const PLAYER = {
  r: 0.42,
  speed: 5.0,
  sprint: 7.0,
  ballSpeedMul: 0.92,
  accel: 14,
  jumpV: 5.2,
  gravity: 18,
  shootGravityMul: 0.55,   // "Hangtime" beim Sprungwurf
  reach: 2.45,             // Greifhöhe über den Füßen
  dashSpeed: 9.5,
  dashTime: 0.2,
  dashCd: 1.6,
  staminaDrain: 0.3,
  staminaRegen: 0.22,
};

export const METER = { dur: 0.8, center: 0.8, green: 0.055, fireGreen: 0.1 };
export const SHOT_CLOCK = 14;
export const TICK_RATE = 60;
export const SNAP_EVERY = 2;   // 30 Snapshots/s

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function hoopDist(x, z) {
  return Math.hypot(x - HOOP.x, z - HOOP.z);
}

export function isThree(x, z) {
  if (z < HOOP.z) return Math.abs(x) > THREE_R;
  return hoopDist(x, z) > THREE_R;
}
