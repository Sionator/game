// Alle Sounds werden per WebAudio synthetisiert – keine Dateien nötig
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.55;
  return muted;
}

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

function tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, attack = 0.004, delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  env(g, t, attack, vol, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function noise(dur, { freq = 1000, q = 1, type = 'bandpass', vol = 0.3, attack = 0.005, delay = 0, sweep = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, attack, vol, dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random());
  s.stop(t + attack + dur + 0.05);
}

export const sfx = {
  bounce(v = 1) {
    const vol = Math.min(0.5, 0.12 + v * 0.05);
    tone(95, 0.12, { vol, slide: 0.6 });
    noise(0.05, { freq: 500, q: 1.5, vol: vol * 0.5 });
  },
  dribble(vol = 0.25) {
    tone(110, 0.09, { vol, slide: 0.55 });
    noise(0.04, { freq: 600, q: 2, vol: vol * 0.4 });
  },
  rim(v = 1) {
    const vol = Math.min(0.35, 0.1 + v * 0.05);
    for (const f of [620, 1340, 2150, 3100]) tone(f * (0.98 + Math.random() * 0.04), 0.35, { type: 'triangle', vol: vol / 3 });
  },
  board(v = 1) {
    tone(160, 0.15, { vol: Math.min(0.4, 0.15 + v * 0.05), slide: 0.7, type: 'triangle' });
    noise(0.08, { freq: 900, vol: 0.12 });
  },
  swish() {
    noise(0.35, { freq: 2500, q: 0.7, vol: 0.35, attack: 0.03, sweep: 0.4 });
  },
  shoot() { noise(0.12, { freq: 1600, q: 0.8, vol: 0.1, sweep: 0.5 }); },
  squeak() { tone(1800 + Math.random() * 600, 0.07, { type: 'sawtooth', vol: 0.05, slide: 1.3 }); },
  jump() { tone(200, 0.1, { vol: 0.08, slide: 1.8 }); },
  steal() { tone(500, 0.08, { type: 'square', vol: 0.12, slide: 1.8 }); tone(900, 0.1, { type: 'square', vol: 0.1, slide: 1.4, delay: 0.07 }); },
  block() { tone(90, 0.25, { vol: 0.5, slide: 0.5, type: 'square' }); noise(0.2, { freq: 400, vol: 0.4 }); },
  dunk() { tone(70, 0.5, { vol: 0.6, slide: 0.4 }); noise(0.4, { freq: 300, vol: 0.4, type: 'lowpass' }); this.rim(3); },
  cheer(big = false) {
    const dur = big ? 2.2 : 1.3;
    noise(dur, { freq: 1100, q: 0.4, vol: big ? 0.28 : 0.16, attack: 0.25 });
    noise(dur * 0.8, { freq: 2400, q: 0.6, vol: big ? 0.12 : 0.07, attack: 0.3 });
  },
  aww() { noise(1.0, { freq: 700, q: 0.8, vol: 0.12, attack: 0.2, sweep: 0.6 }); },
  whistle() { tone(2900, 0.35, { vol: 0.12, type: 'sine' }); tone(3050, 0.35, { vol: 0.06 }); },
  buzzer() { tone(180, 0.7, { type: 'sawtooth', vol: 0.18 }); tone(185, 0.7, { type: 'square', vol: 0.1 }); },
  perfect() { tone(880, 0.12, { vol: 0.15 }); tone(1320, 0.2, { vol: 0.15, delay: 0.08 }); },
  click() { tone(1200, 0.03, { vol: 0.08, type: 'square' }); },
  fire() { noise(1.2, { freq: 300, q: 0.5, vol: 0.3, type: 'lowpass', sweep: 6 }); tone(220, 0.8, { vol: 0.15, slide: 2, type: 'sawtooth' }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { vol: 0.18, type: 'triangle', delay: i * 0.13 })); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.35, { vol: 0.15, type: 'triangle', delay: i * 0.18 })); },
  tick() { tone(1000, 0.04, { vol: 0.07, type: 'square' }); },
};
