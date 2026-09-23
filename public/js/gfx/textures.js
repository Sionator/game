// Prozedurale Texturen (Canvas) und kleine Hilfen
import * as THREE from 'three';

export function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

export function canvasTex(w, h, draw, { repeat, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(makeCanvas(w, h, draw));
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

export function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

// Weiches Rauschen (Speckles) auf einen Canvas legen
export function speckle(g, w, h, n, alpha, light = '255,255,255', dark = '0,0,0', size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? dark : light},${Math.random() * alpha})`;
    const s = size * (0.5 + Math.random());
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

let _glow;
export function glowTex() {
  if (_glow) return _glow;
  _glow = canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,.6)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  return _glow;
}

let _smoke;
export function smokeTex() {
  if (_smoke) return _smoke;
  _smoke = canvasTex(64, 64, (g, w) => {
    for (let i = 0; i < 6; i++) {
      const x = w / 2 + (Math.random() - 0.5) * 18, y = w / 2 + (Math.random() - 0.5) * 18;
      const gr = g.createRadialGradient(x, y, 0, x, y, w / 2.4);
      gr.addColorStop(0, 'rgba(255,255,255,.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    }
  });
  return _smoke;
}

let _blob;
export function blobTex() {
  if (_blob) return _blob;
  _blob = canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,.85)');
    gr.addColorStop(0.5, 'rgba(0,0,0,.45)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  return _blob;
}

// Leuchtender Ring unter den Spielern (optional mit Richtungspfeil)
export function ringTex(arrow) {
  return canvasTex(128, 128, (g, w) => {
    const c = w / 2;
    const gr = g.createRadialGradient(c, c, w * 0.3, c, c, w * 0.5);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.45, 'rgba(255,255,255,.9)');
    gr.addColorStop(0.6, 'rgba(255,255,255,.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(c, c, w * 0.5, 0, Math.PI * 2); g.fill();
    if (arrow) {
      g.fillStyle = 'rgba(255,255,255,1)';
      g.beginPath();
      g.moveTo(c, w * 0.99); g.lineTo(c - 11, w * 0.84); g.lineTo(c + 11, w * 0.84);
      g.closePath(); g.fill();
    }
  }, { srgb: true });
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// Namensschild / Emote-Blase als Sprite
export function textSprite(text, { size = 40, color = '#fff', bg = 'rgba(8,10,18,.72)', accent = null, w = 256, h = 64, scale = 1.5 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const draw = (t) => {
    g.clearRect(0, 0, w, h);
    g.font = `800 ${size}px system-ui, sans-serif`;
    const tw = Math.min(w - 8, g.measureText(t).width + 30);
    if (bg) {
      g.fillStyle = bg;
      roundRect(g, (w - tw) / 2, 8, tw, h - 16, (h - 16) / 2);
      g.fill();
      if (accent) {
        g.save(); g.clip();
        g.fillStyle = accent;
        g.fillRect((w - tw) / 2, h - 14, tw, 6);
        g.restore();
      }
    }
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, w / 2, h / 2 + 1, w - 24);
  };
  draw(text);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
  s.scale.set(scale, (scale * h) / w, 1);
  s.renderOrder = 10;
  s.userData.draw = (t) => { draw(t); tex.needsUpdate = true; };
  return s;
}
