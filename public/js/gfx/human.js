// Realistische Spielerfiguren auf Basis des MakeHuman-Modells (CC0, siehe /assets/char/LICENSE.txt)
// Lädt char.bin (Körper-Varianten, Skelett, Kleidung, Kopfhaut) und baut pro Spieler eine
// geskinnte Figur mit individueller Haut-, Haar- und Trikot-Textur.
import * as THREE from 'three';
import { PLAYER, BALL_R } from '/shared/constants.js';
import { textSprite, ringTex, blobTex, mulberry, hash, speckle } from './textures.js';
import { hairTexture, shoeGeometry, canvasTexture, merge, placed } from './charParts.js';

const ASSET = '/assets/char/';
let assets = null;
let assetsPromise = null;

function loadImageData(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      res(g.getImageData(0, 0, img.width, img.height));
    };
    img.onerror = rej;
    img.src = url;
  });
}

export function loadHumanAssets() {
  if (!assetsPromise) {
    assetsPromise = (async () => {
      const [bin, mask, maskB, pos, eyeTex] = await Promise.all([
        fetch(ASSET + 'char.bin').then((r) => r.arrayBuffer()),
        loadImageData(ASSET + 'skin_a.png'),
        loadImageData(ASSET + 'skin_b.png'),
        loadImageData(ASSET + 'skin_pos.png'),
        new THREE.TextureLoader().loadAsync(ASSET + 'eye.png'),
      ]);
      const hl = new DataView(bin).getUint32(0, true);
      const header = JSON.parse(new TextDecoder().decode(new Uint8Array(bin, 4, hl)));
      const base = 4 + hl + ((4 - ((4 + hl) % 4)) % 4);
      const arr = (d) => new globalThis[d.t](bin, base + d.o, d.n);
      eyeTex.colorSpace = THREE.SRGBColorSpace;
      assets = { header, arr, mask, maskB, pos, eyeTex, geoCache: new Map() };
      return assets;
    })();
  }
  return assetsPromise;
}

// ------------------------------------------------------------------ Geometrie aus char.bin
function blockGeometry(A, name, vi) {
  const key = name + '|' + vi;
  if (A.geoCache.has(key)) return A.geoCache.get(key);
  const all = name === 'bodyAll';
  if (all) name = 'body';
  const H = A.header, b = H.blocks[name], vb = H.variants[vi].blocks[name];
  const g = new THREE.BufferGeometry();
  const p16 = A.arr(vb.pos), n8 = A.arr(vb.nrm);
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(p16, (v) => v / 13000), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(n8, (v) => v / 127), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(A.arr(b.uv), 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(A.arr(b.skinIndex), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(A.arr(b.skinWeight), 4, true));
  const idx = A.arr(name === 'body' && !all ? b.visible : b.index);
  if (b.cut) g.setAttribute('cut', new THREE.BufferAttribute(A.arr(b.cut), 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  A.geoCache.set(key, g);
  return g;
}

// Saum/Paspel entlang der offenen Kanten (Armausschnitt, Halsausschnitt, Saum)
function trimGeometry(src, width = 0.018) {
  const idx = src.index.array, P = src.attributes.position, N = src.attributes.normal;
  const SI = src.attributes.skinIndex, SW = src.attributes.skinWeight;
  const edges = new Map();
  for (let i = 0; i < idx.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = idx[i + k], b = idx[i + (k + 1) % 3], c = idx[i + (k + 2) % 3];
      const key = a < b ? a + '_' + b : b + '_' + a;
      const e = edges.get(key);
      if (e) e.n++; else edges.set(key, { a, b, c, n: 1 });
    }
  }
  const pos = [], nrm = [], si = [], sw = [], ind = [];
  const v3 = (i) => new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i));
  const n3 = (i) => new THREE.Vector3(N.getX(i), N.getY(i), N.getZ(i)).normalize();
  const push = (p, n, from) => {
    pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z);
    for (let k = 0; k < 4; k++) { si.push(SI.getComponent(from, k)); sw.push(SW.array[from * 4 + k]); }
    return pos.length / 3 - 1;
  };
  for (const e of edges.values()) {
    if (e.n !== 1) continue;
    const A = v3(e.a), B = v3(e.b), C = v3(e.c);
    const na = n3(e.a), nb = n3(e.b);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const inward = C.clone().sub(mid);
    inward.addScaledVector(na, -inward.dot(na)).normalize().multiplyScalar(width);
    const lift = 0.0025;
    const a0 = push(A.clone().addScaledVector(na, lift), na, e.a);
    const b0 = push(B.clone().addScaledVector(nb, lift), nb, e.b);
    const a1 = push(A.clone().add(inward).addScaledVector(na, lift), na, e.a);
    const b1 = push(B.clone().add(inward).addScaledVector(nb, lift), nb, e.b);
    const a2 = push(A.clone().addScaledVector(na, -0.004), na.clone().negate(), e.a);
    const b2 = push(B.clone().addScaledVector(nb, -0.004), nb.clone().negate(), e.b);
    ind.push(a0, b0, b1, a0, b1, a1, a0, a2, b2, a0, b2, b0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(Uint8Array.from(si), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(Uint8Array.from(sw), 4, true));
  g.setIndex(ind);
  return g;
}

// ------------------------------------------------------------------ Haut-Textur zusammensetzen
const SKIN = {
  african: ['#6b4430', '#5a3826', '#7c5038', '#4a2e20', '#8a5a3c'],
  caucasian: ['#e8bfa0', '#f1cfb4', '#d9a988', '#e2b48f'],
  asian: ['#e6c09c', '#d8b08a', '#eccaa6'],
  mixed: ['#b07b55', '#9c6a48', '#c48d64', '#a87450'],
};
const VARIANT_SKIN = { m_af: 'african', m_ca: 'caucasian', m_as: 'asian', m_mx: 'mixed', m_big: 'african', f_af: 'african', f_ca: 'caucasian', m_king: 'african' };

function composeSkin(A, o) {
  const step = o.step || 1, SW = A.mask.width;
  const W = SW / step, H = A.mask.height / step;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const rc = document.createElement('canvas'); rc.width = W; rc.height = H;
  const rg = rc.getContext('2d'), rimg = rg.createImageData(W, H), rd = rimg.data;
  const d = img.data, m = A.mask.data, mb = A.maskB.data, p = A.pos.data;
  const bb = A.header.bbox;
  const sk = rgb(o.skin), lip = rgb(o.lip), hair = rgb(o.hair);
  const sock = rgb(o.sock), sockStripe = rgb(o.sockStripe), dark = rgb('#121418');
  const rnd = mulberry(o.seed);
  // kleines Rauschen für Hautunregelmäßigkeiten
  const NW = 64, noise = new Float32Array(NW * NW);
  for (let i = 0; i < noise.length; i++) noise[i] = rnd();
  const nz = (x, y) => noise[(y & (NW - 1)) * NW + (x & (NW - 1))];
  const kx = (bb.max[0] - bb.min[0]) / 255, ky = (bb.max[1] - bb.min[1]) / 255, kz = (bb.max[2] - bb.min[2]) / 255;
  const tat = o.tattoo;
  for (let i = 0, n = W * H; i < n; i++) {
    const o4 = i * 4, s4 = step === 1 ? o4 : (((i / W) | 0) * step * SW + (i % W) * step) * 4;
    const ao = m[s4] / 255, lips = m[s4 + 1] / 255, brow = m[s4 + 2] / 255, scalp = mb[s4] / 255, stub = mb[s4 + 1] / 255;
    const x = bb.min[0] + p[s4] * kx, y = bb.min[1] + p[s4 + 1] * ky, z = bb.min[2] + p[s4 + 2] * kz;
    const px = i % W, py = (i / W) | 0;
    const nn = (nz((px * step) >> 2, (py * step) >> 2) + nz((px * step) >> 4, (py * step) >> 4)) * 0.5 - 0.5;
    // Grundton mit AO, leicht rötlich in Falten
    const aoS = Math.pow(ao, 1.35);
    let r = sk.r * (0.5 + 0.5 * aoS) * (1 + nn * 0.06), gg = sk.g * (0.46 + 0.54 * aoS) * (1 + nn * 0.06), b = sk.b * (0.44 + 0.56 * aoS) * (1 + nn * 0.05);
    // Gesichtsdetails: durchblutete Wangen, Nase und Ohren, Schatten unter den Augen und in der Lidfalte
    let rough = 0.62;
    if (y > 6.0 && y < 8.0 && z > -0.4) {
      const ax = Math.abs(x);
      const gs = (cx, cy, cz, rr) => Math.exp(-((ax - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) / (rr * rr));
      const blush = gs(0.52, 6.95, 1.2, 0.3) * 0.28 + gs(0, 6.95, 1.62, 0.2) * 0.22 + (ax > 0.62 && y > 6.85 && y < 7.65 && z < 0.8 ? 0.22 : 0);
      if (blush > 0.01) { r *= 1 + blush * 0.12; gg *= 1 - blush * 0.14; b *= 1 - blush * 0.12; }
      const under = gs(0.32, 7.13, 1.32, 0.14) * 0.06 + gs(0.31, 7.43, 1.36, 0.1) * 0.08;
      if (under > 0.01) { r *= 1 - under; gg *= 1 - under * 1.1; b *= 1 - under * 0.9; }
      // T-Zone und Nasenspitze glänzen etwas mehr
      rough -= gs(0, 7.0, 1.62, 0.22) * 0.16 + (ax < 0.35 && y > 7.55 && z > 1.0 ? 0.08 : 0);
    }
    // Lippen
    if (lips > 0) {
      rough -= lips * 0.22;
      const t = lips * 0.92; r += (lip.r * (0.7 + 0.3 * ao) - r) * t; gg += (lip.g * (0.7 + 0.3 * ao) - gg) * t; b += (lip.b * (0.7 + 0.3 * ao) - b) * t;
    }
    // Bartschatten
    if (stub > 0 && o.stubble > 0) { const t = stub * o.stubble * (0.75 + nn * 0.5); r += (hair.r * 0.6 - r) * t; gg += (hair.g * 0.6 - gg) * t; b += (hair.b * 0.6 - b) * t; }
    // Augenbrauen (mit Haar-Struktur)
    if (brow > 0) {
      const strands = nz(px >> 1, py) * 0.6 + nz(px >> 2, py >> 1) * 0.4;       // feine, waagrechte Härchen
      const t = Math.min(1, Math.pow(brow, 1.5) * (0.25 + 0.75 * strands) * 0.62);
      r += (hair.r * 0.8 - r) * t; gg += (hair.g * 0.8 - gg) * t; b += (hair.b * 0.8 - b) * t;
    }
    // Gemalte kurze Haare (Buzz, Fade, Waves)
    if (scalp > 0 && o.painted) {
      let t = scalp * (0.82 + nn * 0.5);
      if (o.painted === 'fade') t *= Math.max(0, Math.min(1, (y - 7.25) / 0.55)) * 0.9 + 0.1 * scalp;   // Seiten ausrasiert
      if (o.painted === 'waves') t *= 0.85 + 0.15 * Math.sin((y * 9 + Math.atan2(x, z - 0.35) * 3) * 3.1);
      t = Math.min(1, t);
      r += (hair.r - r) * t; gg += (hair.g - gg) * t; b += (hair.b - b) * t;
    }
    // Socken
    if (y < o.sockTop && y > -8.5 && Math.abs(x) > 0.6) {
      const band = (y > o.sockTop - 0.28 && y < o.sockTop - 0.18) || (y > o.sockTop - 0.45 && y < o.sockTop - 0.35);
      const sc = band ? sockStripe : sock;
      r = sc.r * (0.55 + 0.45 * ao); gg = sc.g * (0.55 + 0.45 * ao); b = sc.b * (0.55 + 0.45 * ao);
    }
    // Tights / Kniebandage / Arm-Sleeve
    const leftSide = x > 0;
    if ((o.tights && y < 0.3 && y > -4.6 && Math.abs(x) > 0.15) ||
        (o.kneeSleeve && (o.kneeSleeve === 'L') === leftSide && Math.abs(x) > 0.6 && y < -3.0 && y > -4.35) ||
        (o.armSleeve && !leftSide && x < -1.55 && y > 1.2 && y < 5.4)) {
      r = dark.r * (0.6 + 0.4 * ao); gg = dark.g * (0.6 + 0.4 * ao); b = dark.b * (0.6 + 0.4 * ao);
    }
    // Tattoos (linker Arm): Tribal-Band oder Sternen-Sleeve
    if (tat && x > 1.6 && y > 1.8 && y < 5.2) {
      const ang = Math.atan2(z - 0.2, x - 2.4);
      let ink = 0;
      if (tat === 'band') { const yy = 4.15 + Math.sin(ang * 6) * 0.12; ink = Math.abs(y - yy) < 0.1 || Math.abs(y - 4.45) < 0.03 || Math.abs(y - 3.85) < 0.03 ? 1 : 0; }
      else if (tat === 'sleeve') { const u = ang * 2.2, v = y * 2.6; const cx = Math.round(u), cy = Math.round(v); ink = ((u - cx) ** 2 + (v - cy) ** 2) < 0.07 + 0.05 * Math.sin(cx * 3.1 + cy * 1.7) ? 1 : 0; if (y > 4.9) ink = 0; }
      if (ink) { const t = 0.72; r += (0.07 - r) * t; gg += (0.08 - gg) * t; b += (0.12 - b) * t; }
    }
    // Freizeitkleidung (Zuschauer): Shirt/Hoodie mit Ärmeln, Jeans/Jogger/Shorts – auf die Haut gemalt
    if (o.outfit) {
      const O = o.outfit, arm = mb[s4 + 2] / 255, ax = Math.abs(x);
      const dSh = Math.hypot(ax - 1.68, y - 5.25, z - 0.15);
      const fold = 1 + nn * 0.12 + Math.sin(y * 7 + Math.sin(x * 3) * 2) * 0.04;
      let cloth = null;
      const shirtTop = 5.42 + 0.42 * Math.min(1, Math.max(0, (ax - 0.55) / 0.45));
      const onTorso = arm < 0.5 && y > O.hem && y < shirtTop && y < 5.95;
      const onSleeve = arm >= 0.5 && dSh < (O.sleeve === 'long' ? 4.0 : O.sleeve === 'short' ? 1.15 : -1);
      if (onTorso || onSleeve) {
        cloth = O.shirtC;
        if (O.print && z > 0.9) {                                                        // Brust-Logo: Ring mit Punkt oder Schriftzug-Balken
          const rr = Math.hypot(x, (y - 4.15) * 1.1);
          if (O.print === 'ring' ? (Math.abs(rr - 0.3) < 0.06 || rr < 0.1) : (ax < 0.5 && (Math.abs(y - 4.3) < 0.08 || (Math.abs(y - 4.05) < 0.04 && ax < 0.35)))) cloth = O.printC;
        }
        if (O.sleeve === 'long' && onSleeve && dSh > 3.75) cloth = O.cuffC;             // Bündchen
      } else if (arm < 0.5 && y <= O.hem + 0.05 && y > (O.pantsLen === 'shorts' ? -3.3 : -7.3)) {
        cloth = O.pantsC;
        if (O.jeans && Math.abs(ax - 1.45) < 0.05 && y < 0.5) cloth = O.seamC;           // Außennaht
      }
      if (cloth) {
        const k = (0.45 + 0.55 * aoS) * fold;
        r = cloth.r * k; gg = cloth.g * k; b = cloth.b * k;
        rough = 0.85;
      }
    }
    d[o4] = Math.min(255, r * 255); d[o4 + 1] = Math.min(255, gg * 255); d[o4 + 2] = Math.min(255, b * 255); d[o4 + 3] = 255;
    if (scalp > 0.3 && o.painted) rough = 0.8;
    rd[o4] = rd[o4 + 1] = rd[o4 + 2] = Math.max(0, Math.min(255, rough * (1 + nn * 0.15) * 255)); rd[o4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  rg.putImageData(rimg, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.rough = new THREE.CanvasTexture(rc);
  return t;
}

// Feine Poren als Normal-Map (kachelbar)
let _pores = null;
function poreNormal() {
  if (_pores) return _pores;
  const S = 256;
  const hgt = new Float32Array(S * S);
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 0.8 + Math.random() * 1.4;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const X = ((x + dx) | 0 + S) % S, Y = ((y + dy) | 0 + S) % S;
      const dd = Math.hypot(dx, dy);
      if (dd < r * 2) hgt[Y * S + X] -= Math.max(0, 1 - dd / (r * 2)) * 0.5;
    }
  }
  _pores = canvasTexture(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const h = (X, Y) => hgt[((Y + S) % S) * S + ((X + S) % S)];
      const nx = (h(x - 1, y) - h(x + 1, y)) * 2, ny = (h(x, y - 1) - h(x, y + 1)) * 2;
      const l = Math.hypot(nx, ny, 1);
      const o = (y * S + x) * 4;
      img.data[o] = (nx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false, repeat: [16, 16] });
  return _pores;
}

// Wimpern: einzelne, gebogene Härchen (u = entlang des Lids, v = Wurzel → Spitze)
let _lash = null;
function lashTexture() {
  if (_lash) return _lash;
  _lash = canvasTexture(512, 64, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    g.strokeStyle = '#ffffff'; g.lineCap = 'round';
    let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 300; i++) {
      const x = r() * W, low = x > W / 2;                       // rechte Hälfte = Unterlid: kürzer, spärlicher
      if (low && r() < 0.45) continue;
      const len = H * (low ? 0.25 + r() * 0.25 : 0.45 + r() * 0.4), bend = (r() - 0.5) * 8;
      for (let k = 0; k < 4; k++) {
        const t0 = k / 4, t1 = (k + 1) / 4;
        g.lineWidth = 1.6 * (1 - t0 * 0.8);
        g.beginPath();
        g.moveTo(x + bend * t0 * t0, t0 * len); g.lineTo(x + bend * t1 * t1, t1 * len); g.stroke();
      }
    }
  }, { flipY: false });
  return _lash;
}

// ------------------------------------------------------------------ Trikot / Shorts
// Stoff wird entlang des Schnittfelds (Attribut "cut", dm) abgeschnitten, am Rand liegt eine Paspel
function clothCut(mat, trimHex, trimW) {
  mat.customProgramCacheKey = () => 'clothcut';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.trimColor = { value: new THREE.Color(trimHex) };
    sh.uniforms.trimW = { value: trimW };
    sh.vertexShader = 'attribute float cut;\nvarying float vCut;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCut = cut;');
    sh.fragmentShader = 'uniform vec3 trimColor;\nuniform float trimW;\nvarying float vCut;\n' + sh.fragmentShader.replace(
      '#include <map_fragment>',
      '#include <map_fragment>\n  if (vCut < 0.0) discard;\n  if (!gl_FrontFacing) diffuseColor.rgb *= 0.8;\n  diffuseColor.rgb = mix(diffuseColor.rgb, trimColor, 1.0 - smoothstep(trimW * 0.8, trimW, vCut));',
    );
  };
  return mat;
}

function isLight(col) { return new THREE.Color(col).getHSL({}).l > 0.62; }
function shade(hex, f) { const c = new THREE.Color(hex).multiplyScalar(f); return '#' + c.getHexString(); }
const WORDMARKS = ['KINGS', 'BALLERS', 'NIGHT', 'ASPHALT', 'ROCKETS', 'HOOPERS', 'SKYLINE', 'CAGE'];

function jerseyTexture(color, number, name, wordmark) {
  return canvasTexture(1024, 512, (g, W, H) => {
    const trim = isLight(color) ? '#15171c' : '#f4f4f4';
    const text = isLight(color) ? '#15171c' : '#ffffff';
    const outline = isLight(color) ? '#ffffff' : '#0d0f14';
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, shade(color, 1.05)); gr.addColorStop(1, shade(color, 0.92));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,.08)';
    for (let y = 2; y < H; y += 5) for (let x = (y / 5) % 2 ? 2.5 : 0; x < W; x += 5) g.fillRect(x, y, 1.6, 1.6);
    for (const cx of [W * 0.25, W * 0.75]) {
      g.fillStyle = shade(color, 0.62); g.fillRect(cx - 36, 0, 72, H);
      g.fillStyle = trim; g.fillRect(cx - 40, 0, 4, H); g.fillRect(cx + 36, 0, 4, H);
    }
    const txt = (t, x, y, size, italic = false) => {
      g.font = `${italic ? 'italic ' : ''}900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = size * 0.16; g.strokeStyle = outline; g.strokeText(t, x, y);
      g.lineWidth = size * 0.06; g.strokeStyle = trim === '#f4f4f4' ? shade(color, 0.5) : '#ffffff'; g.strokeText(t, x, y);
      g.fillStyle = text; g.fillText(t, x, y);
    };
    const R = 560, span = Math.min(0.46, wordmark.length * 0.05);
    for (let i = 0; i < wordmark.length; i++) {
      const a = -span / 2 + (span * (i + 0.5)) / wordmark.length;
      g.save(); g.translate(W * 0.5 + Math.sin(a) * R, H * 0.3 + R - Math.cos(a) * R); g.rotate(a);
      txt(wordmark[i], 0, 0, 46, true); g.restore();
    }
    txt(number, W * 0.5, H * 0.55, 120);
    for (const x of [0, W]) { txt(name.toUpperCase().slice(0, 12), x, H * 0.22, 36); txt(number, x, H * 0.52, 150); }
    g.fillStyle = trim; g.fillRect(0, H - 10, W, 10);
  }, { flipY: false });
}

function shortsTexture(color) {
  return canvasTexture(512, 256, (g, W, H) => {
    const trim = isLight(color) ? '#15171c' : '#f4f4f4';
    const base = shade(color, 0.85);
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    speckle(g, W, H, 3000, 0.05, '255,255,255', '0,0,0', 2);
    g.fillStyle = shade(color, 0.55); g.fillRect(0, 0, W, 26);
    g.fillStyle = trim; g.fillRect(0, 26, W, 3);
    g.strokeStyle = '#f4f4f4'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(W / 2 - 5, 10); g.lineTo(W / 2 - 9, 44); g.moveTo(W / 2 + 5, 10); g.lineTo(W / 2 + 9, 44); g.stroke();
    for (const cx of [W * 0.25, W * 0.75]) {
      g.fillStyle = shade(color, 0.6); g.fillRect(cx - 20, 29, 40, H);
      g.fillStyle = trim; g.fillRect(cx - 23, 29, 3, H); g.fillRect(cx + 20, 29, 3, H);
    }
    g.fillStyle = trim;
    for (const lx of [W * 0.62]) { g.beginPath(); g.arc(lx, H * 0.55, 11, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = base; g.font = '900 12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SB', W * 0.62, H * 0.55 + 1);
  }, { flipY: false });
}

// ------------------------------------------------------------------ Spielerfigur
const HAIR_COL = ['#1a1310', '#211710', '#2b1c13', '#3d2616', '#6b4a2a', '#b08850', '#5a2414'];
const STYLES_M = ['buzz', 'fade', 'waves', 'afro', 'dreads', 'cornrows', 'twists', 'hightop', 'fade', 'buzz', 'bald'];
const STYLES_F = ['bun', 'afro', 'cornrows', 'dreads', 'bun', 'twists', 'buzz'];
const BONE = (A, name) => A.header.bones.findIndex((b) => b.name === name);

export class PlayerView {
  constructor(scene, info, { isMe, isMate, fx, lookTarget, crowd = false }) {
    this.crowd = crowd;
    this.id = info.id;
    this.scene = scene;
    this.fx = fx;
    this.lookTarget = lookTarget;
    this.info = info;
    this.ready = false;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    scene.add(this.root);
    const col = new THREE.Color(info.color);

    this.runPhase = 0; this.dribblePhase = 0; this.lastBounce = 1; this.reachT = 0; this.celebrateT = 0;
    this.followT = 0; this.landT = 0; this.wasShooting = false; this.wasAir = false; this.fallAmt = 0;
    this.f = 0; this.time = Math.random() * 10;
    this.handX = -PLAYER.handX; this.crossMv = ''; this.q = {}; this.scaleK = 1;
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    if (crowd) {
      if (assets) this.build(assets);
      else loadHumanAssets().then((A) => { if (!this.disposed) this.build(A); });
      return;
    }
    // Namensschild, Ring, Schatten, Emote (sofort verfügbar)
    this.label = textSprite(info.name + (info.bot ? ' 🤖' : ''), { color: isMe ? '#ffe08a' : isMate ? '#bbf7d0' : '#ffffff', accent: info.color });
    this.labelY = 2.4;
    this.label.position.y = this.labelY;
    this.root.add(this.label);
    this.ground = new THREE.Group();
    const ringCol = isMe ? col.clone().multiplyScalar(1.6) : isMate ? new THREE.Color(0x4ade80).multiplyScalar(1.2) : col;
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshBasicMaterial({
      map: ringTex(isMe), color: ringCol, transparent: true, opacity: isMe ? 0.95 : isMate ? 0.7 : 0.3,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, opacity: 0.5, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.012;
    this.ground.add(this.blob, this.ring);
    scene.add(this.ground);
    this.emote = textSprite('', { size: 46, bg: 'rgba(255,255,255,.94)', color: '#111', scale: 1.4 });
    this.emote.position.y = 2.85;
    this.emote.visible = false;
    this.root.add(this.emote);
    this.emoteT = 0;

    if (assets) this.build(assets);
    else loadHumanAssets().then((A) => { if (!this.disposed) this.build(A); });
  }

  build(A) {
    const info = this.info;
    const seed = hash(info.name + '|' + info.id);
    const rnd = mulberry(seed);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const H = A.header;
    // Variante wählen (Figur-Wunsch aus dem Menü: m / f / auto)
    const males = H.variants.map((v, i) => [v, i]).filter(([v]) => v.gender === 1 && v.id !== 'm_king');
    const king = H.variants.map((v, i) => [v, i]).filter(([v]) => v.id === 'm_king');
    const females = H.variants.map((v, i) => [v, i]).filter(([v]) => v.gender === 0);
    const isKing = info.body === 'k' && king.length > 0;
    const pool = isKing ? king : info.body === 'f' ? females : info.body === 'm' ? males : (rnd() < (this.crowd ? 0.4 : 0.2) ? females : males);
    // Eigener Spieler aus dem Editor überschreibt alle Zufallswerte
    const look = info.body === 'c' && info.look ? info.look : null;
    this.look = look;
    const lookV = look && H.variants.findIndex((v) => v.id === look.body);
    const [variant, vi] = look && lookV >= 0 ? [H.variants[lookV], lookV] : pool[seed % pool.length];
    this.variant = variant;
    const female = variant.gender === 0;
    const light = isLight(info.color);

    // --- Skelett
    const bones = H.bones.map(() => new THREE.Bone());
    H.bones.forEach((b, i) => {
      const j = variant.joints[i];
      if (b.parent < 0) { bones[i].position.set(j[0], j[1], j[2]); this.body.add(bones[i]); }
      else {
        const pj = variant.joints[b.parent];
        bones[i].position.set(j[0] - pj[0], j[1] - pj[1], j[2] - pj[2]);
        bones[b.parent].add(bones[i]);
      }
    });
    this.bones = bones;
    const skeleton = new THREE.Skeleton(bones);
    const J = (n) => new THREE.Vector3(...variant.joints[BONE(A, n)]);
    const bi = (n) => BONE(A, n);

    // Korrekturen: MakeHuman steht in A-Pose → Arme/Beine so ausrichten, dass 0° = hängend ist.
    // corr[i]: Ruhe-Korrektur je Knochen; acc[i]: aufsummierte neutrale Rotation (Modellraum).
    const dir = (a, b) => J(b).sub(J(a)).normalize();
    const want = new Map();
    for (const s of ['L', 'R']) {
      const sx = s === 'L' ? 1 : -1;
      const armD = new THREE.Vector3(sx * 0.13, -1, 0.03).normalize();
      want.set(bi(`upperarm01.${s}`), [dir(`upperarm01.${s}`, `lowerarm01.${s}`), armD]);
      want.set(bi(`lowerarm01.${s}`), [dir(`lowerarm01.${s}`, `wrist.${s}`), armD]);
      want.set(bi(`wrist.${s}`), [dir(`wrist.${s}`, `finger3-1.${s}`), armD]);
      want.set(bi(`upperleg01.${s}`), [dir(`upperleg01.${s}`, `lowerleg01.${s}`), new THREE.Vector3(sx * 0.07, -1, 0).normalize()]);
      want.set(bi(`lowerleg01.${s}`), [dir(`lowerleg01.${s}`, `foot.${s}`), new THREE.Vector3(sx * 0.03, -1, -0.02).normalize()]);
      want.set(bi(`foot.${s}`), 'flat');
    }
    const corr = bones.map(() => new THREE.Quaternion());
    const acc = bones.map(() => new THREE.Quaternion());
    H.bones.forEach((b, i) => {
      const accP = b.parent >= 0 ? acc[b.parent] : new THREE.Quaternion();
      const w = want.get(i);
      if (w === 'flat') corr[i].copy(accP).invert();
      else if (w) corr[i].setFromUnitVectors(w[0], w[1].clone().applyQuaternion(accP.clone().invert()).normalize());
      acc[i].copy(accP).multiply(corr[i]);
    });
    this.corr = corr;
    this.accP = H.bones.map((b) => (b.parent >= 0 ? acc[b.parent].clone() : new THREE.Quaternion()));
    this.accInv = this.accP.map((a) => a.clone().invert());
    bones.forEach((b, i) => { b.userData.i = i; });
    // Finger leicht gekrümmt (Achse = Knöchellinie)
    for (const s of ['L', 'R']) {
      const across = J(`finger5-1.${s}`).sub(J(`finger2-1.${s}`)).normalize();
      for (let f = 1; f <= 5; f++) for (let k = 1; k <= 3; k++) {
        const i = bi(`finger${f}-${k}.${s}`);
        const amt = f === 1 ? [0.15, 0.2, 0.15][k - 1] : [0.35, 0.45, 0.3][k - 1] * (0.8 + f * 0.08);
        this.fingerRot = this.fingerRot || [];
        this.fingerRot.push([i, new THREE.Quaternion().setFromAxisAngle(across, (s === 'L' ? -1 : 1) * amt)]);
      }
    }
    this.palmR = J('finger3-1.R').sub(J('wrist.R')).multiplyScalar(0.55);
    this.labelY = variant.height + 0.38;
    this.scaleK = variant.height / 1.95;
    this.B = {
      root: bones[bi('root')], sp: ['spine05', 'spine04', 'spine03', 'spine02', 'spine01'].map((n) => bones[bi(n)]),
      neck: [bones[bi('neck01')], bones[bi('neck02')]], head: bones[bi('head')],
      clavL: bones[bi('clavicle.L')], clavR: bones[bi('clavicle.R')],
    };
    this.rootRestY = bones[bi('root')].position.y;
    this.hipY = J('upperleg01.L').y;
    this.armL = { sh: bones[bi('upperarm01.L')], elbow: bones[bi('lowerarm01.L')], hand: bones[bi('wrist.L')] };
    this.armR = { sh: bones[bi('upperarm01.R')], elbow: bones[bi('lowerarm01.R')], hand: bones[bi('wrist.R')] };
    this.legL = { hip: bones[bi('upperleg01.L')], knee: bones[bi('lowerleg01.L')], ankle: bones[bi('foot.L')] };
    this.legR = { hip: bones[bi('upperleg01.R')], knee: bones[bi('lowerleg01.R')], ankle: bones[bi('foot.R')] };
    this.hips = this.B.root;
    this.spine = this.B.sp[2];
    this.head = this.B.head;

    // --- Aussehen
    const ethn = VARIANT_SKIN[variant.id] || 'mixed';
    let skinHex = pick(SKIN[ethn]);
    let hairHex = rnd() < 0.06 ? info.color : ethn === 'caucasian' ? pick(HAIR_COL) : pick(HAIR_COL.slice(0, 4));
    let style = pick(female ? STYLES_F : STYLES_M);
    if (info.hairStyle) style = info.hairStyle;
    const crowd = this.crowd;
    if (crowd && rnd() < 0.35) { style = 'cap'; this.capColor = pick(['#16181d', '#e8413c', '#2f7cf6', '#f4f4f4', '#22c55e', '#f59e0b', '#64748b']); }
    let beard = female ? 'none' : pick(['none', 'none', 'stubble', 'stubble', 'beard', 'goatee']);
    // Power-Forward „King“: fester Look (Vollbart, kurze Haare, Stirnband, Arm-Sleeve, Kette)
    if (isKing) { skinHex = '#5e3b28'; hairHex = '#1a1310'; style = 'buzz'; beard = 'beard'; }
    if (look) {
      skinHex = look.skin; hairHex = look.hairCol; style = look.hair; beard = female ? 'none' : look.beard;
      if (style === 'cap') this.capColor = isLight(info.color) ? '#16181d' : info.color;
    }
    this.isKing = isKing;
    const painted = ['buzz', 'fade', 'waves'].includes(style) ? style : style === 'cap' ? 'buzz' : ['dreads', 'twists', 'afro', 'cornrows', 'bun'].includes(style) ? 'buzz' : style === 'hightop' ? 'fade' : null;
    const sockHex = rnd() < 0.55 ? '#f2f2f2' : '#15171c';
    const skinTex = composeSkin(A, {
      seed, skin: skinHex, lip: shade(skinHex, ethn === 'african' ? 0.72 : 0.86).replace('#', '#'), hair: hairHex, painted,
      stubble: beard === 'stubble' ? 0.32 : beard === 'beard' || beard === 'goatee' ? 0.25 : 0,
      sock: sockHex, sockStripe: rnd() < 0.5 ? info.color : (sockHex === '#f2f2f2' ? '#15171c' : '#f2f2f2'),
      sockTop: -6.3 - rnd() * 0.6,
      tights: !look && !isKing && rnd() < 0.15,
      kneeSleeve: look ? (look.kneeSleeve ? 'L' : null) : !isKing && rnd() < 0.3 ? pick(['L', 'R']) : null,
      armSleeve: look ? look.armSleeve : isKing || rnd() < 0.3,
      tattoo: look ? (look.tattoo === 'none' ? null : look.tattoo) : crowd ? null : isKing ? 'band' : rnd() < 0.35 ? pick(['band', 'sleeve']) : null,
      step: crowd ? 2 : 1,
      outfit: crowd ? (() => {
        const top = pick(['#e8413c', '#2f7cf6', '#22c55e', '#f59e0b', '#f4f4f4', '#16181d', '#a855f7', '#64748b', '#ec4899', '#7c2d12', '#0f766e']);
        const jeans = rnd() < 0.55;
        const pants = jeans ? pick(['#2c3e5c', '#36507a', '#1e2a3d', '#4a5a70']) : pick(['#16181d', '#3b3f47', '#6b7280', '#1f2937']);
        return {
          shirtC: rgb(top), printC: rgb(isLight(top) ? '#16181d' : '#f4f4f4'), cuffC: rgb(shade(top, 0.8)), print: rnd() < 0.6 ? pick(['ring', 'text']) : null,
          sleeve: pick(['short', 'short', 'long', 'none']), hem: 0.35,
          pantsC: rgb(pants), seamC: rgb(shade(pants, 1.35)), jeans, pantsLen: rnd() < 0.2 ? 'shorts' : 'long',
        };
      })() : null,
    });
    const skinMat = new THREE.MeshPhysicalMaterial({
      map: skinTex, roughnessMap: skinTex.userData.rough, roughness: 1, sheen: 0.35, sheenRoughness: 0.6,
      sheenColor: new THREE.Color(skinHex).lerp(new THREE.Color(0xff9f80), 0.45),
      normalMap: poreNormal(), normalScale: new THREE.Vector2(0.09, 0.09), specularIntensity: 0.45,
      // warmes Streulicht (Fake-Subsurface): hebt Schatten rötlich an statt grau
      emissive: new THREE.Color(0xff8a6a), emissiveMap: skinTex, emissiveIntensity: 0.08,
    });
    const number = look ? String(look.num) : isKing ? '1' : String((seed % 98) + 1);
    const jerseyMat = crowd ? null : new THREE.MeshPhysicalMaterial({
      map: jerseyTexture(info.color, number, info.name, WORDMARKS[hash(info.color) % WORDMARKS.length]),
      roughness: 0.7, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(info.color).lerp(new THREE.Color(0xffffff), 0.3), side: THREE.DoubleSide,
    });
    const shortsMat = crowd ? null : new THREE.MeshPhysicalMaterial({
      map: shortsTexture(info.color), roughness: 0.5, sheen: 0.9, sheenRoughness: 0.3,
      sheenColor: new THREE.Color(info.color).lerp(new THREE.Color(0xffffff), 0.45), side: THREE.DoubleSide,
    });
    const trimHex = light ? '#15171c' : '#f4f4f4';
    if (!crowd) { clothCut(jerseyMat, trimHex, 0.14); clothCut(shortsMat, trimHex, 0.14); }

    const skinned = (geo, mat, shadow = true) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.castShadow = shadow; m.receiveShadow = true;
      m.frustumCulled = false;
      this.body.add(m);
      return m;
    };
    // Zuschauer tragen gemalte Freizeitkleidung → kompletter Körper, kein Trikot
    const meshes = crowd ? [skinned(blockGeometry(A, 'bodyAll', vi), skinMat)] : [
      skinned(blockGeometry(A, 'body', vi), skinMat),
      skinned(blockGeometry(A, 'jersey', vi), jerseyMat),
      skinned(blockGeometry(A, 'shorts', vi), shortsMat),
      skinned(blockGeometry(A, 'lashes', vi), new THREE.MeshStandardMaterial({ map: lashTexture(), color: 0x1a120e, roughness: 0.8, side: THREE.DoubleSide, alphaTest: 0.35 }), false),
    ];
    // Binden in der Ruhepose (alle Knochen ohne Rotation), erst danach Korrekturen/Posen setzen
    this.root.updateMatrixWorld(true);
    for (const m of meshes) m.bind(skeleton);
    bones.forEach((b, i) => b.quaternion.copy(corr[i]));
    for (const [i, q] of this.fingerRot) bones[i].quaternion.copy(q).multiply(corr[i]);
    this.root.updateMatrixWorld(true);

    // --- Starre Teile am Kopf: Augen, Haare, Bart
    const headRest = J('head');
    const toHead = (v) => v.sub(headRest);
    const eyeMat = new THREE.MeshStandardMaterial({ map: A.eyeTex, color: 0xe6ddd6, roughness: 0.3 });
    // Hornhaut: fast unsichtbar, aber mit scharfem Glanzpunkt → lebendiger Blick
    const corneaMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0.02, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false });
    const eyeGeo = (mirror, key = 'index') => {
      const g = new THREE.BufferGeometry();
      const p = Float32Array.from(A.arr(H.eye.pos));
      if (mirror) for (let i = 0; i < p.length; i += 3) p[i] = -p[i];
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(A.arr(H.eye.uv), 2));
      const idx = Uint16Array.from(A.arr(H.eye[key]));
      if (mirror) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeVertexNormals();
      return g;
    };
    variant.eyes.forEach((e, k) => {
      for (const [key, mat] of [['index', eyeMat], ['cornea', corneaMat]]) {
        const m = new THREE.Mesh(eyeGeo(k === 1, key), mat);
        m.scale.setScalar(e.r * 0.98);
        m.position.copy(toHead(new THREE.Vector3(...e.c)));
        this.head.add(m);
      }
    });
    // --- Schuhe am Fuß
    const shoe = shoeGeometry();
    let shoeC = pick(['#f5f5f5', '#f5f5f5', '#111317', info.color, '#e11d48', '#f5f5f5']);
    if (look) shoeC = look.shoe === 'team' ? info.color : look.shoe;
    const accentC = shoeC.toLowerCase() === info.color.toLowerCase() ? (light ? '#15171c' : '#f5f5f5') : info.color;
    const shoeMats = {
      upper: new THREE.MeshPhysicalMaterial({ color: shoeC, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.4 }),
      sole: new THREE.MeshStandardMaterial({ color: rnd() < 0.3 ? 0xb5702e : (shoeC === '#111317' ? 0xf2f2f2 : 0x1d2026), roughness: 0.8 }),
      mid: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 }),
      accent: new THREE.MeshStandardMaterial({ color: accentC, roughness: 0.45 }),
    };
    const footScale = variant.height / 1.97;
    for (const leg of [this.legL, this.legR]) {
      const fj = leg.ankle.getWorldPosition(new THREE.Vector3());
      this.body.worldToLocal(fj);
      const g = new THREE.Group();
      g.scale.setScalar(footScale * 1.02);
      g.position.set(0, -fj.y + 0.046 * footScale, 0.012);
      for (const k of ['upper', 'sole', 'mid', 'accent']) {
        const m = new THREE.Mesh(shoe[k], shoeMats[k]);
        m.castShadow = k === 'upper' || k === 'sole';
        g.add(m);
      }
      leg.ankle.add(g);
    }

    // --- Accessoires
    const bandMat = new THREE.MeshStandardMaterial({ color: light ? 0x15171c : col(info.color), roughness: 0.75 });
    if (!crowd && (look ? look.wristbands : rnd() < 0.45)) for (const arm of [this.armL, this.armR]) {
      if (!look && rnd() < 0.4) continue;
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.034, 0.06, 20), bandMat);
      const d = arm.hand.position.clone();                          // Unterarm-Richtung (lokal)
      w.position.copy(d.clone().multiplyScalar(0.88));
      w.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      arm.elbow.add(w);
    }
    if (look ? look.chain : !female && (isKing || rnd() < 0.25)) {
      // Halsumfang an der Basis messen → Kette liegt auf, statt durch den Hals zu gehen
      const nb = this.B.neck[0], nj = J('neck01');
      const bpos = A.arr(H.variants[vi].blocks.body.pos);
      let rx = 0.05, zf = nj.z + 0.04, zb = nj.z - 0.04;
      for (let i = 0; i < bpos.length; i += 3) {
        const x = bpos[i] / 13000, y = bpos[i + 1] / 13000, z = bpos[i + 2] / 13000;
        if (Math.abs(y - (nj.y - 0.015)) > 0.012 || Math.abs(x) > 0.11) continue;
        rx = Math.max(rx, Math.abs(x)); zf = Math.max(zf, z); zb = Math.min(zb, z);
      }
      const chain = new THREE.Mesh(new THREE.TorusGeometry(1, 0.004 / (rx + 0.008), 6, 56), new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 1, roughness: 0.25 }));
      chain.scale.set(rx + 0.008, (zf - zb) / 2 + 0.01, rx + 0.008);
      chain.position.set(0, -0.03, (zf + zb) / 2 - nj.z + 0.004);
      chain.rotation.x = Math.PI / 2 + 0.35;                     // vorne tiefer (hängt auf dem Brustbein)
      nb.add(chain);
    }
    if (!crowd && (look ? look.headband : isKing || rnd() < 0.35) && !['afro', 'hightop', 'cap'].includes(style)) this.headband = bandMat;
    this.buildHair(A, vi, style, beard, hairHex, rnd, headRest);

    this.ready = true;
  }

  // Frisuren aus der Kopfhaut der Variante (Hülle entlang der Normalen)
  buildHair(A, vi, style, beard, hairHex, rnd, headRest) {
    const H = A.header;
    const blk = H.blocks.scalp, vb = H.variants[vi].blocks.scalp;
    const p16 = A.arr(vb.pos), n8 = A.arr(vb.nrm), uvA = A.arr(blk.uv), line = A.arr(blk.line);
    const idx = A.arr(blk.index);
    const n = blk.count;
    const kind = style === 'cornrows' ? 'cornrows' : ['afro', 'twists'].includes(style) ? 'coil' : 'strands';
    const tex = hairTexture(hairHex, kind);
    // Haaransatz pro Pixel aus dem interpolierten Abstand zur Haarlinie (dm) → scharfe Kante auch bei großen Dreiecken
    const short = ['buzz', 'fade', 'waves', 'hightop'].includes(style);
    const ha = { afro: [-0.03, 0.03, 1], hightop: [0.25, 0.55, 0.85], fade: [0.25, 0.55, 0.85], buzz: [-0.05, 0.12, 0.85], waves: [-0.05, 0.12, 0.85] }[style] || [-0.04, 0.04, 1];
    // Physikalisch mit Sheen: dunkles Haar bekommt einen weichen, faserigen Glanz statt schwarzer Fläche
    const mat = new THREE.MeshPhysicalMaterial({
      map: tex.map, bumpMap: tex.bump, bumpScale: 3, roughness: 0.72, transparent: short, alphaTest: short ? 0.02 : 0.5,
      sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(hairHex).lerp(new THREE.Color(0xa89080), 0.45), specularIntensity: 0.6,
    });
    mat.customProgramCacheKey = () => 'hairline';
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.hA = { value: new THREE.Vector3(...ha) };
      sh.vertexShader = 'attribute float hl;\nvarying float vHl;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHl = hl;');
      sh.fragmentShader = 'uniform vec3 hA;\nvarying float vHl;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', '  float hn = fract(sin(dot(floor(vMapUv * 700.0), vec2(12.9898, 78.233))) * 43758.5453);\n  diffuseColor.a *= smoothstep(hA.x, hA.y, vHl + (hn - 0.5) * 0.06) * hA.z;\n#include <alphatest_fragment>');
    };
    const P = (i) => new THREE.Vector3(p16[i * 3] / 13000, p16[i * 3 + 1] / 13000, p16[i * 3 + 2] / 13000);
    const N = (i) => new THREE.Vector3(n8[i * 3] / 127, n8[i * 3 + 1] / 127, n8[i * 3 + 2] / 127).normalize();
    let top = -Infinity; for (let i = 0; i < n; i++) top = Math.max(top, P(i).y);
    const shell = (offsetFn) => {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const p = P(i), nn = N(i);
        const o = offsetFn(i, p, nn);
        p.addScaledVector(nn, o.n || 0);
        if (o.up) p.y += o.up;
        p.sub(headRest);
        pos.set([p.x, p.y, p.z], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(uvA, (v, k) => v * 3), 2));
      g.setAttribute('hl', new THREE.BufferAttribute(line, 1));
      g.setIndex(new THREE.BufferAttribute(Uint16Array.from(idx), 1));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      this.head.add(m);
      return m;
    };
    const s = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    if (style === 'afro') {
      // runde Form: jede Stelle wird entlang der Normalen bis auf ein Ellipsoid um die Kopfmitte geschoben
      let zc = 0; for (let i = 0; i < n; i++) zc += P(i).z / n;
      const C = new THREE.Vector3(0, top - 0.085, zc + 0.005), R = new THREE.Vector3(0.148, 0.15, 0.158);
      shell((i, p, nn) => {
        const d = p.clone().sub(C), q = Math.hypot(d.x / R.x, d.y / R.y, d.z / R.z);
        const g = s(-0.02, 0.9, line[i]);
        const reach = Math.max(0, (1 - q) * d.length() / Math.max(q, 0.3));      // Abstand bis zur Hülle (radial)
        const taper = 0.1 + 0.9 * s(C.y - 0.17, C.y + 0.03, p.y);                // unten zum Nacken hin anliegend
        return { n: 0.0015 + g * reach * taper * (1 + (rnd() - 0.5) * 0.05) };
      });
    } else if (style === 'hightop') {
      shell(() => ({ n: 0.0025 }));
      // Block: gedrehtes Profil mit abgerundeter Oberkante, steckt unten im Schädel
      let zc = 0; for (let i = 0; i < n; i++) zc += P(i).z / n;
      const h0 = 0.14, prof = [[0, -h0 / 2], [0.072, -h0 / 2], [0.074, 0.03], [0.071, 0.05], [0.063, 0.063], [0.037, 0.069], [0, 0.07]];
      const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 40);
      g.scale(1, 1, 1.12);
      g.translate(0, top + 0.055 - 0.07, zc + 0.012);
      g.translate(-headRest.x, -headRest.y, -headRest.z);
      const bm = new THREE.MeshPhysicalMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: 3, roughness: 0.72, sheen: 1, sheenRoughness: 0.55, sheenColor: mat.sheenColor });
      const m = new THREE.Mesh(g, bm); m.castShadow = true; this.head.add(m);
    } else if (['dreads', 'twists', 'cornrows', 'bun', 'buzz', 'waves', 'fade'].includes(style)) {
      shell(() => ({ n: style === 'cornrows' ? 0.003 : style === 'bun' ? 0.004 : 0.0025 }));
      const extra = [];
      if (style === 'dreads' || style === 'twists') {
        let dz = 0; for (let i = 0; i < n; i++) dz += P(i).z / n;
        const dC = new THREE.Vector3(0, top - 0.1, dz);
        for (let i = 0; i < n; i += style === 'dreads' ? 6 : 5) {
          if (line[i] < 0.08) continue;
          const p = P(i), nn = N(i);
          if (style === 'dreads') {
            // Strähne fällt unter Schwerkraft, legt sich um den Schädel und bleibt aus dem Gesicht
            const len = 0.2 + rnd() * 0.14, seg = 0.016;
            let q = p.clone().addScaledVector(nn, 0.005);
            const minR = q.distanceTo(dC) + 0.004;
            const pts = [q.clone()];
            const v = nn.clone().multiplyScalar(0.4).add(new THREE.Vector3(q.x * 3, 0, -0.9)).normalize();
            for (let d = 0; d < len; d += seg) {
              v.y -= 0.32; v.x += (rnd() - 0.5) * 0.08; v.normalize();
              q = q.clone().addScaledVector(v, seg);
              const r = q.distanceTo(dC);
              if (r < minR && q.y > dC.y - 0.14) q.sub(dC).multiplyScalar(minR / r).add(dC);
              if (q.y < top - 0.07 && q.z > dC.z + 0.015 && Math.abs(q.x) < 0.085) q.z = dC.z + 0.015;
              pts.push(q);
            }
            extra.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((x) => x.sub(headRest))), pts.length * 2, 0.0072, 5, false));
          } else {
            // Twist liegt am Kopf an und fällt nach hinten-unten (Richtung = Tangente)
            const g = new THREE.CapsuleGeometry(0.0075, 0.03, 3, 6);
            const tdir = new THREE.Vector3(0, -1, -0.35).addScaledVector(nn, -new THREE.Vector3(0, -1, -0.35).dot(nn)).normalize();
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tdir);
            extra.push(g.applyMatrix4(new THREE.Matrix4().compose(p.addScaledVector(nn, 0.008).addScaledVector(tdir, 0.012).sub(headRest), q, new THREE.Vector3(1, 1, 1))));
          }
        }
      }
      if (style === 'bun') {
        const back = P(0);
        let best = 0; for (let i = 0; i < n; i++) { const p = P(i); if (p.y - p.z * 1.5 > back.y - back.z * 1.5) { back.copy(p); best = i; } }
        extra.push(placed(new THREE.SphereGeometry(0.04, 16, 12), { p: back.addScaledVector(N(best), 0.03).sub(headRest).toArray() }));
      }
      if (extra.length) {
        const g = merge(extra);
        g.setAttribute('hl', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(10), 1));
        const m = new THREE.Mesh(g, mat);
        m.castShadow = true;
        this.head.add(m);
      }
    }
    // Stirnband: Band aus Kopfhaut-Dreiecken knapp über dem Haaransatz
    // Kopf-Oberfläche des Körpers als Basis für Stirnband und Cap (liegt überall glatt an).
    // hb = geneigte Höhe: vorne ~4 cm über der Augenmitte = 0.12, hinten tiefer
    let zMid = 0; for (let i = 0; i < n; i++) zMid += P(i).z / n;
    const bb = H.blocks.body, bvb = H.variants[vi].blocks.body;
    const bp = A.arr(bvb.pos), bn = A.arr(bvb.nrm), sI = A.arr(bb.skinIndex), sW = A.arr(bb.skinWeight), bIdx = A.arr(bb.visible);
    const hi = BONE(A, 'head');
    const headW = (i) => { let w = 0; for (let k = 0; k < 4; k++) if (sI[i * 4 + k] === hi) w += sW[i * 4 + k] / 255; return w; };
    const eyeY = H.variants[vi].eyes[0].c[1];
    const hbOf = (i) => 0.1205 - (bp[i * 3 + 1] / 13000 - eyeY) + 0.35 * (bp[i * 3 + 2] / 13000 - zMid);
    const headPatch = (lo, hi2, off, mat, key) => {
      const map = new Map(), pos = [], hbA = [], keep = [];
      const vid = (i) => {
        if (map.has(i)) return map.get(i);
        const nn = new THREE.Vector3(bn[i * 3], bn[i * 3 + 1], bn[i * 3 + 2]).normalize();
        const p = new THREE.Vector3(bp[i * 3] / 13000, bp[i * 3 + 1] / 13000, bp[i * 3 + 2] / 13000).addScaledVector(nn, off).sub(headRest);
        map.set(i, hbA.length); pos.push(p.x, p.y, p.z); hbA.push(hbOf(i));
        return hbA.length - 1;
      };
      for (let t = 0; t < bIdx.length; t += 3) {
        const tri = [bIdx[t], bIdx[t + 1], bIdx[t + 2]];
        const h = tri.map(hbOf);
        if (Math.max(...h) < lo - 0.01 || Math.min(...h) > hi2 + 0.01 || tri.some((i) => headW(i) < 0.6)) continue;
        keep.push(...tri.map(vid));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('hb', new THREE.BufferAttribute(new Float32Array(hbA), 1));
      g.setIndex(keep);
      g.computeVertexNormals();
      const m2 = mat.clone();
      m2.customProgramCacheKey = () => key;
      m2.onBeforeCompile = (sh) => {
        sh.vertexShader = 'attribute float hb;\nvarying float vHb;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHb = hb;');
        sh.fragmentShader = 'varying float vHb;\n' + sh.fragmentShader.replace('#include <map_fragment>',
          `#include <map_fragment>\n  if (vHb < ${lo.toFixed(4)} || vHb > ${hi2.toFixed(4)}) discard;\n  diffuseColor.rgb *= 0.85 + 0.15 * step(0.004, min(vHb - ${lo.toFixed(4)}, ${hi2.toFixed(4)} - vHb));`);
      };
      const mesh = new THREE.Mesh(g, m2);
      mesh.castShadow = true;
      this.head.add(mesh);
      return mesh;
    };
    if (this.headband) headPatch(0.078, 0.112, 0.0045, this.headband, 'headband');
    if (style === 'cap') {
      const capMat = new THREE.MeshStandardMaterial({ color: this.capColor, roughness: 0.8 });
      headPatch(-1, 0.1, 0.009, capMat, 'cap');
      // Schirm: vorne auf Höhe der Cap-Unterkante, leicht nach unten geneigt
      let front = null;
      for (let i = 0; i < bp.length / 3; i++) {
        if (Math.abs(bp[i * 3] / 13000) > 0.012 || Math.abs(hbOf(i) - 0.1) > 0.008 || headW(i) < 0.6) continue;
        if (!front || bp[i * 3 + 2] > front[2]) front = [bp[i * 3] / 13000, bp[i * 3 + 1] / 13000, bp[i * 3 + 2] / 13000];
      }
      if (front) {
        const brim = new THREE.Mesh(new THREE.CircleGeometry(0.095, 24, 0, Math.PI), new THREE.MeshStandardMaterial({ color: this.capColor, roughness: 0.8, side: THREE.DoubleSide }));
        brim.scale.set(1, 0.8, 1);
        brim.rotation.x = Math.PI / 2 + 0.18;
        brim.position.set(0, front[1] - headRest.y + 0.004, front[2] - headRest.z - 0.035);
        brim.castShadow = true;
        this.head.add(brim);
      }
    }
    // Bart
    if (beard === 'beard' || beard === 'goatee') {
      const bb = H.blocks.beard, bv = H.variants[vi].blocks.beard;
      const bp = A.arr(bv.pos), bn = A.arr(bv.nrm), bu = A.arr(bb.uv);
      const cnt = bb.count;
      const btex = hairTexture(hairHex, 'coil');
      const bmat = new THREE.MeshStandardMaterial({ map: btex.map, bumpMap: btex.bump, bumpScale: 3, roughness: 0.9, transparent: true, vertexColors: true, alphaTest: 0.05 });
      let minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < cnt; i++) { minY = Math.min(minY, bp[i * 3 + 1]); maxY = Math.max(maxY, bp[i * 3 + 1]); }
      const pos = new Float32Array(cnt * 3), colA = new Float32Array(cnt * 4);
      for (let i = 0; i < cnt; i++) {
        const p = new THREE.Vector3(bp[i * 3] / 13000, bp[i * 3 + 1] / 13000, bp[i * 3 + 2] / 13000);
        const nn = new THREE.Vector3(bn[i * 3] / 127, bn[i * 3 + 1] / 127, bn[i * 3 + 2] / 127).normalize();
        const hy = (bp[i * 3 + 1] - minY) / (maxY - minY || 1);
        let a = 1 - s(0.72, 0.98, hy);
        if (beard === 'goatee') a *= 1 - s(0.035, 0.06, Math.abs(p.x));
        p.addScaledVector(nn, 0.004 + 0.006 * (1 - hy));
        p.sub(headRest);
        pos.set([p.x, p.y, p.z], i * 3);
        colA.set([1, 1, 1, a], i * 4);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(bu, (v) => v * 4), 2));
      g.setAttribute('color', new THREE.BufferAttribute(colA, 4));
      g.setIndex(new THREE.BufferAttribute(Uint16Array.from(A.arr(bb.index)), 1));
      g.computeVertexNormals();
      this.head.add(new THREE.Mesh(g, bmat));
    }
  }

  // s: {x,y,z,f,vx,vz,st, hasBall, defending, shootingLocal, hd, mv}
  update(s, dt, onDribble) {
    this.time += dt;
    const t = this.time;
    const speed = Math.hypot(s.vx || 0, s.vz || 0);
    this.root.position.set(s.x, s.y, s.z);
    let d = s.f - this.f;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.f += d * Math.min(1, dt * 18);
    this.root.rotation.y = this.f;
    this.ground.position.set(s.x, 0, s.z);
    const sc = Math.max(0.4, 1 - s.y * 0.35);
    this.blob.scale.set(sc * 0.9, sc * 0.9, 1);
    this.blob.material.opacity = 0.5 * sc;

    const air = s.y > 0.05;
    const shooting = s.st === 'shoot' || s.shootingLocal;
    const stun = s.st === 'stun';
    // Wurf-Nachschwung erkennen
    if (this.wasShooting && !shooting && air) this.followT = 0.55;
    this.wasShooting = shooting;
    if (this.wasAir && !air) {
      this.landT = 0.22;
      if (this.fx) this.fx.dust(s.x, s.z, 5, 0.6);
    }
    this.wasAir = air;
    this.followT = Math.max(0, this.followT - dt);
    this.landT = Math.max(0, this.landT - dt);
    this.celebrateT = Math.max(0, this.celebrateT - dt);

    // Laufzyklus
    this.runPhase += dt * (3 + speed * 1.75);
    const ph = this.runPhase;
    const a = air ? 0 : Math.min(1, speed / 6.5);
    // Seitwärts-Anteil (für Defense-Slides)
    const fx = Math.sin(this.f), fz = Math.cos(this.f);
    const fwdSpeed = (s.vx || 0) * fx + (s.vz || 0) * fz;
    const sideSpeed = (s.vx || 0) * -fz + (s.vz || 0) * fx;

    const T = {
      hipLx: Math.sin(ph) * 0.95 * a, hipRx: -Math.sin(ph) * 0.95 * a,
      hipLz: 0.03, hipRz: -0.03,
      kneeL: -(0.12 + a * 1.25 * Math.max(0, Math.cos(ph))), kneeR: -(0.12 + a * 1.25 * Math.max(0, -Math.cos(ph))),
      shLx: -Math.sin(ph) * 0.75 * a + 0.05, shRx: Math.sin(ph) * 0.75 * a + 0.05,
      shLz: 0.1, shRz: -0.1,
      elL: 0.25 + a * 1.1, elR: 0.25 + a * 1.1,
      spineX: 0.04 + a * 0.22 * Math.sign(fwdSpeed || 1), spineY: Math.sin(ph) * 0.18 * a, spineZ: 0,
      headX: -a * 0.12, headY: 0,
      hipsY: -Math.abs(Math.cos(ph)) * 0.045 * a + Math.sin(t * 2.2) * 0.004,
      handLx: 0, handRx: 0,
    };

    // Ballhand und Handwechsel
    const hd = s.hd === -1 ? -1 : 1;
    const targetX = -hd * PLAYER.handX;
    if (Math.sign(targetX) !== Math.sign(this.handX) && Math.abs(this.handX) > PLAYER.handX * 0.9) this.crossMv = s.mv === 'legs' ? 'legs' : 'cross';
    this.handX += (targetX - this.handX) * Math.min(1, dt * 13);

    if (s.hasBall && !shooting && s.st !== 'dunk') {
      const crossing = Math.abs(this.handX) < PLAYER.handX * 0.8;
      this.dribblePhase += dt * (crossing ? 16 : speed > 3 ? 11 : 8);
      const c = Math.abs(Math.cos(this.dribblePhase));
      if (c < this.lastBounce && c < 0.12 && this.lastBounce >= 0.12) onDribble && onDribble(this);
      this.lastBounce = c;
      // Dribbelhand drückt den Ball, die andere schützt
      const push = 1 - c;
      const ballArm = { x: 0.45 + push * 0.25, z: 0.22, el: 0.75 - push * 0.35 };
      const guard = { x: 0.65, z: 0.5, el: 1.2 };
      if (crossing) { ballArm.x = 0.6; ballArm.z = 0.05; ballArm.el = 0.5; }
      if (hd === 1) {
        T.shRx = ballArm.x; T.shRz = -ballArm.z; T.elR = ballArm.el; T.handRx = 0.4;
        T.shLx = guard.x; T.shLz = guard.z; T.elL = guard.el;
      } else {
        T.shLx = ballArm.x; T.shLz = ballArm.z; T.elL = ballArm.el; T.handLx = 0.4;
        T.shRx = guard.x; T.shRz = -guard.z; T.elR = guard.el;
      }
      const crouch = crossing ? 0.13 : 0.07;
      T.hipsY -= crouch;
      T.hipLx += crouch * 3; T.hipRx += crouch * 3;
      T.kneeL -= crouch * 5.5; T.kneeR -= crouch * 5.5;
      T.spineX += 0.18 + crouch;
      T.headX -= 0.15;
      if (crossing && this.crossMv === 'legs') { // Ausfallschritt beim Beine-Wechsel
        T.hipLx = hd === 1 ? 0.75 : -0.35; T.hipRx = hd === 1 ? -0.35 : 0.75;
        T.kneeL = hd === 1 ? -0.95 : -0.5; T.kneeR = hd === 1 ? -0.5 : -0.95;
      }
    }

    if (s.defending && !air && !stun) {
      const slide = Math.min(1, Math.abs(sideSpeed) / 4);
      const w = Math.sin(ph * 0.9) * 0.12 * slide;
      T.hipLz = 0.26 + w; T.hipRz = -0.26 + w;
      T.hipLx = 0.5 + T.hipLx * 0.3; T.hipRx = 0.5 + T.hipRx * 0.3;
      T.kneeL = -0.95; T.kneeR = -0.95;
      T.hipsY = -0.17;
      T.spineX = 0.42; T.spineY = 0;
      T.shLx = 0.6 + Math.sin(t * 7) * 0.1; T.shRx = 0.6 + Math.cos(t * 7) * 0.1;
      T.shLz = 0.85; T.shRz = -0.85;
      T.elL = 1.0; T.elR = 1.0; T.handLx = -0.4; T.handRx = -0.4;
      T.headX = -0.3;
    }

    if (air && !shooting && s.st !== 'dunk') {
      T.hipLx = 0.55; T.hipRx = 0.2; T.kneeL = -0.9; T.kneeR = -0.55;
      if (!s.hasBall) { // Block- / Rebound-Sprung
        T.shLx = T.shRx = 2.95; T.shLz = 0.18; T.shRz = -0.18; T.elL = T.elR = 0.12;
        T.spineX = -0.05; T.headX = 0.25;
      }
    }

    if (shooting) {
      T.hipLx = 0.25; T.hipRx = 0.15; T.kneeL = -0.35; T.kneeR = -0.25;
      T.shRx = 2.55; T.shRz = 0.12; T.elR = 1.55; T.handRx = -0.6;  // Wurfhand
      T.shLx = 2.3; T.shLz = -0.28; T.elL = 1.35;                   // Führhand
      T.spineX = -0.04; T.spineY = 0; T.headX = 0.12;
    } else if (this.followT > 0) {
      // Nachschwung: Arm gestreckt, Handgelenk abgeklappt ("Goose Neck")
      T.shRx = 2.85; T.shRz = 0.05; T.elR = 0.08; T.handRx = 1.25;
      T.shLx = 2.4; T.shLz = -0.1; T.elL = 0.25;
      T.hipLx = 0.2; T.kneeL = -0.3; T.kneeR = -0.2;
      T.spineX = -0.05; T.headX = 0.15;
    }

    if (s.st === 'dunk') {
      T.shRx = 3.05; T.shRz = 0.05; T.elR = 0.1;
      T.shLx = 1.3; T.shLz = 0.7; T.elL = 0.4;
      T.hipLx = 0.9; T.hipRx = 0.2; T.kneeL = -1.3; T.kneeR = -0.5;
      T.spineX = 0.1; T.headX = 0.25;
    }

    if (this.reachT > 0) {
      this.reachT -= dt;
      T.shRx = 1.35; T.shRz = 0.15; T.elR = 0.1; T.handRx = 0.3;
      T.spineX = 0.5; T.spineY = 0.25;
      T.hipRx = 0.7; T.kneeR = -0.7; T.hipLx = -0.3;
      T.hipsY = -0.12;
    }

    if (this.celebrateT > 0 && !air && !s.hasBall) {
      const pump = Math.sin(this.celebrateT * 14) * 0.25;
      T.shLx = T.shRx = 2.5 + pump; T.shLz = 0.6; T.shRz = -0.6; T.elL = T.elR = 1.5;
      T.spineX = -0.1; T.headX = 0.2;
      T.hipsY = Math.abs(Math.sin(this.celebrateT * 7)) * 0.05;
    }

    if (this.landT > 0 && !stun) {
      const k = this.landT / 0.22;
      T.hipsY -= 0.12 * k; T.kneeL -= 0.7 * k; T.kneeR -= 0.7 * k; T.hipLx += 0.3 * k; T.hipRx += 0.3 * k;
    }

    // Hinfallen bei Ankle Breaker: auf den Hintern
    const fall = stun ? 1 : 0;
    this.fallAmt += (fall - this.fallAmt) * Math.min(1, dt * (fall ? 9 : 3.5));
    if (this.fallAmt > 0.02) {
      const f = this.fallAmt;
      const mix = (key, v) => { T[key] = T[key] * (1 - f) + v * f; };
      mix('hipsY', -0.68); mix('hipLx', 1.45); mix('hipRx', 1.3); mix('kneeL', -0.35); mix('kneeR', -0.6);
      mix('hipLz', 0.2); mix('hipRz', -0.2);
      mix('spineX', -0.55); mix('shLx', -0.75); mix('shRx', -0.75); mix('shLz', 0.35); mix('shRz', -0.35);
      mix('elL', 0.1); mix('elR', 0.1); mix('headX', 0.3); mix('spineY', 0);
    }

    // Kopf schaut zum Ball
    if (this.lookTarget && !stun) {
      this._v.copy(this.lookTarget);
      this.root.worldToLocal(this._v);
      const yaw = Math.atan2(this._v.x, Math.max(0.1, this._v.z));
      const clampYaw = Math.max(-0.9, Math.min(0.9, yaw));
      T.headY = clampYaw * 0.75 - T.spineY;
      T.spineY += clampYaw * 0.15;
      const pitch = Math.atan2(this._v.y - 1.75, Math.hypot(this._v.x, this._v.z));
      T.headX += Math.max(-0.4, Math.min(0.5, -pitch * 0.5));
    }

    // Glätten und anwenden
    const k = 1 - Math.exp(-dt * 16);
    for (const key in T) this.q[key] = this.q[key] === undefined ? T[key] : this.q[key] + (T[key] - this.q[key]) * k;
    const q = this.q;
    if (this.ready) this.applyPose(q);
    this.body.position.z = -this.fallAmt * 0.15;

    // Staub beim Sprinten
    if (this.fx && !air && speed > 6 && Math.random() < dt * 6) this.fx.dust(s.x, s.z, 1, 0.35);

    if (this.emoteT > 0) {
      this.emoteT -= dt;
      this.emote.position.y = this.labelY + 0.4 + (2.4 - this.emoteT) * 0.12;
      this.emote.material.opacity = Math.min(1, this.emoteT * 2);
      if (this.emoteT <= 0) this.emote.visible = false;
    }
    this.label.position.y = this.labelY - this.fallAmt * 0.6;
    this.root.updateMatrixWorld(true);
  }

  // Pose-Winkel (Modellraum-Achsen) auf das Skelett anwenden
  applyPose(q) {
    const R = (bone, x, y, z) => {
      const i = bone.userData.i;
      this._q.setFromEuler(this._e.set(x, y, z));
      bone.quaternion.copy(this.accInv[i]).multiply(this._q).multiply(this.accP[i]).multiply(this.corr[i]);
    };
    this.B.root.position.y = this.rootRestY + q.hipsY * this.scaleK;
    const sw = [0.1, 0.2, 0.25, 0.25, 0.2];
    this.B.sp.forEach((b, j) => R(b, q.spineX * sw[j], q.spineY * sw[j], q.spineZ * sw[j]));
    R(this.B.neck[0], q.headX * 0.25, q.headY * 0.25, 0);
    R(this.B.neck[1], q.headX * 0.25, q.headY * 0.25, 0);
    R(this.B.head, q.headX * 0.5, q.headY * 0.5, 0);
    const lift = (x) => Math.max(0, Math.min(1, (x - 1.4) / 1.3));
    R(this.B.clavL, 0, 0, 0.28 * lift(q.shLx));
    R(this.B.clavR, 0, 0, -0.28 * lift(q.shRx));
    // Gliedmaßen: positive Pose-Winkel = nach vorne (Arm heben, Ellbogen/Hüfte beugen); das Modell
    // blickt in +z, eine positive X-Rotation schwenkt Hängendes aber nach hinten → Vorzeichen drehen
    const L = (bone, x, z = 0) => R(bone, -x, 0, z);
    L(this.armL.sh, q.shLx, q.shLz);
    L(this.armR.sh, q.shRx, q.shRz);
    L(this.armL.elbow, q.elL);
    L(this.armR.elbow, q.elR);
    L(this.armL.hand, q.handLx);
    L(this.armR.hand, q.handRx);
    L(this.legL.hip, q.hipLx, q.hipLz);
    L(this.legR.hip, q.hipRx, q.hipRz);
    L(this.legL.knee, q.kneeL);
    L(this.legR.knee, q.kneeR);
    L(this.legL.ankle, -(q.hipLx + q.kneeL) * 0.8);
    L(this.legR.ankle, -(q.hipRx + q.kneeR) * 0.8);
      }

  // Zuschauer: stehen/sitzen, wippen, schauen zum Ball, jubeln bei Körben
  crowdUpdate(dt, time, { cheer = 0, sit = false, look = null } = {}) {
    if (!this.ready) return;
    const ph = this.time += dt;
    const bob = Math.sin(ph * 2.1) * 0.5 + 0.5;
    const T = {
      hipLx: 0.02, hipRx: -0.02, hipLz: 0.04, hipRz: -0.04, kneeL: -0.08, kneeR: -0.05,
      shLx: 0.08 + bob * 0.05, shRx: 0.1, shLz: 0.1, shRz: -0.1, elL: 0.35, elR: 0.3, handLx: 0, handRx: 0,
      spineX: 0.02, spineY: 0, spineZ: Math.sin(ph * 0.7) * 0.03, headX: 0, headY: 0,
      hipsY: -bob * 0.01,
    };
    if (this.crowdArms === 'clap') { const c = Math.sin(ph * 9) * 0.12; T.shLx = T.shRx = 0.75; T.shLz = -0.12 + c; T.shRz = 0.12 - c; T.elL = T.elR = 1.35; }
    else if (this.crowdArms === 'pockets') { T.shLx = T.shRx = -0.15; T.shLz = 0.18; T.shRz = -0.18; T.elL = T.elR = 0.5; }
    if (sit) {
      T.hipLx = T.hipRx = 1.5; T.kneeL = T.kneeR = -1.45; T.hipLz = 0.12; T.hipRz = -0.12;
      T.hipsY = -(this.sitDrop || 0.5); T.spineX = 0.18; T.elL = T.elR = 1.2; T.shLx = T.shRx = 0.35; T.shLz = 0.05; T.shRz = -0.05;
    }
    if (cheer > 0) {
      const pump = Math.sin(ph * 12 + this.phase) * 0.25;
      T.shLx = T.shRx = 2.6 + pump; T.shLz = 0.45; T.shRz = -0.45; T.elL = T.elR = 0.5 + pump;
      T.spineX = -0.08; T.headX = -0.2;
      if (!sit) { const j = Math.abs(Math.sin(ph * 9 + this.phase)); T.hipsY = j * 0.05; T.kneeL = T.kneeR = -0.25 * (1 - j); T.hipLx = T.hipRx = 0.12 * (1 - j); }
    }
    if (look) {
      this._v.copy(look); this.root.worldToLocal(this._v);
      const yaw = Math.max(-1.1, Math.min(1.1, Math.atan2(this._v.x, this._v.z)));
      T.headY = yaw * 0.7; T.spineY = yaw * 0.25;
    }
    const k = 1 - Math.exp(-dt * 8);
    for (const key in T) this.q[key] = this.q[key] === undefined ? T[key] : this.q[key] + (T[key] - this.q[key]) * k;
    this.applyPose(this.q);
  }

  ballAnchor(s, out) {
    const shooting = s.st === 'shoot' || s.shootingLocal;
    if (this.ready && (s.st === 'dunk' || shooting || this.followT > 0.45)) {
      // Ball liegt auf der Handfläche der Wurfhand
      this.armR.hand.localToWorld(out.copy(this.palmR));
      out.y += BALL_R * 0.8;
      return out;
    }
    const c = Math.abs(Math.cos(this.dribblePhase));
    const cross = 1 - Math.min(1, Math.abs(this.handX) / PLAYER.handX);
    const z = 0.34 + cross * (this.crossMv === 'legs' ? -0.3 : 0.14);
    const h = BALL_R + c * (0.74 - cross * 0.4);
    out.set(this.handX, h, z);
    this.root.localToWorld(out);
    out.y = h + Math.max(0, s.y) * 0.8;
    return out;
  }

  showEmote(text) {
    this.emote.userData.draw(text);
    this.emote.visible = true;
    this.emoteT = 2.4;
  }

  reach() { this.reachT = 0.32; }
  celebrate() { this.celebrateT = 1.8; }

  dispose() {
    this.disposed = true;
    this.scene.remove(this.root);
    this.scene.remove(this.ground);
    // GPU-Speicher freigeben (gemeinsam genutzte Geometrien/Texturen bleiben)
    const keepGeo = new Set(assets ? assets.geoCache.values() : []);
    const keepTex = new Set([_pores, _lash, assets && assets.eyeTex]);
    const seen = new Set();
    for (const root of [this.root, this.ground]) root.traverse((o) => {
      if (o.geometry && !keepGeo.has(o.geometry) && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      for (const m of [].concat(o.material || [])) {
        if (seen.has(m)) continue;
        seen.add(m);
        for (const k of ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap']) {
          const t = m[k];
          if (t && !keepTex.has(t) && !seen.has(t) && !t.userData.shared) { seen.add(t); t.dispose(); }
        }
        m.dispose();
      }
    });
  }
}

function col(hex) { return new THREE.Color(hex); }
// Hex → sRGB-Werte 0..1 (ohne Farbraum-Umrechnung, für Canvas-Pixel)
function rgb(hex) { const n = parseInt(hex.replace('#', ''), 16); return { r: (n >> 16 & 255) / 255, g: (n >> 8 & 255) / 255, b: (n & 255) / 255 }; }
