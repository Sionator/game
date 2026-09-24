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
      const [bin, mask, maskB, pos, fMask, fMaskB, fPos, eyeTex] = await Promise.all([
        fetch(ASSET + 'char.bin').then((r) => r.arrayBuffer()),
        loadImageData(ASSET + 'skin_a.png'),
        loadImageData(ASSET + 'skin_b.png'),
        loadImageData(ASSET + 'skin_pos.png'),
        loadImageData(ASSET + 'face_a.png'),
        loadImageData(ASSET + 'face_b.png'),
        loadImageData(ASSET + 'face_pos.png'),
        new THREE.TextureLoader().loadAsync(ASSET + 'eye.png'),
      ]);
      const hl = new DataView(bin).getUint32(0, true);
      const header = JSON.parse(new TextDecoder().decode(new Uint8Array(bin, 4, hl)));
      const base = 4 + hl + ((4 - ((4 + hl) % 4)) % 4);
      const arr = (d) => new globalThis[d.t](bin, base + d.o, d.n);
      eyeTex.colorSpace = THREE.SRGBColorSpace;
      assets = { header, arr, mask, maskB, pos, face: { mask: fMask, maskB: fMaskB, pos: fPos }, eyeTex, geoCache: new Map() };
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
  if (b.faceUv) { g.setAttribute('faceUv', new THREE.BufferAttribute(A.arr(b.faceUv), 2)); g.setAttribute('faceW', new THREE.BufferAttribute(A.arr(b.faceW), 1)); }
  if (name === 'body' || name === 'lashes') {
    const m = exprMorphs(A, name, vi);
    if (m) { g.morphAttributes.position = m; g.morphTargetsRelative = true; }
  }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  A.geoCache.set(key, g);
  return g;
}

// Feinrelief der Gesichtshaut (prozedural in der Gesichts-UV): Poren, feine Stirn-/Augenfältchen,
// senkrechte Lippenrillen – über Ableitungen als Bump-Normalen, kostet keine Textur
const SKIN_DETAIL_GLSL = `
float sdHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sdNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sdHash(i), sdHash(i + vec2(1, 0)), f.x), mix(sdHash(i + vec2(0, 1)), sdHash(i + vec2(1, 1)), f.x), f.y);
}
float skinHeight(vec2 uv, float lip) {
  float fw = max(fwidth(uv.x), fwidth(uv.y));                                         // Pixelgröße in UV
  float aaP = 1.0 - smoothstep(0.0004, 0.0012, fw), aaF = 1.0 - smoothstep(0.0015, 0.004, fw);   // nur zeigen, wenn auflösbar
  float pores = (1.0 - pow(sdNoise(uv * vec2(1400.0, 900.0)), 3.0)) * aaP;             // kleine Vertiefungen
  float fine = sdNoise(uv * vec2(260.0, 170.0)) * 0.5 * aaF;
  float lines = (sin(uv.x * 2600.0 + sdNoise(uv * 90.0) * 6.0) * 0.5 + 0.5) * aaP;       // Lippenrillen (senkrecht)
  float forehead = smoothstep(0.62, 0.7, uv.y) * (sin(uv.y * 900.0 + sdNoise(uv * 40.0) * 5.0) * 0.5 + 0.5) * 0.25;
  return mix(0.0, lines * 0.08, lip) * 0.012;
}
vec3 skinPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 vSigmaX = normalize(dFdx(surf_pos)), vSigmaY = normalize(dFdy(surf_pos));
  vec3 R1 = cross(vSigmaY, surf_norm), R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad * 24.0);
}
`;
let _faceMaskTex = null;
function faceMaskTexture(A) {
  if (_faceMaskTex) return _faceMaskTex;
  const im = A.face.mask;
  // Zeilen umdrehen (Bild oben = v 1, wie bei den Canvas-Texturen)
  const W = im.width, H = im.height, d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) d.set(im.data.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  _faceMaskTex = new THREE.DataTexture(d, W, H);
  _faceMaskTex.needsUpdate = true;
  _faceMaskTex.magFilter = THREE.LinearFilter; _faceMaskTex.minFilter = THREE.LinearFilter;
  _faceMaskTex.userData.shared = true;
  return _faceMaskTex;
}

// Fell-Schalen: mehrere Lagen derselben Fläche; nach außen hin bleiben nur einzelne Strähnen stehen,
// innere Lagen sind dunkler (Eigenschatten) → Haare/Bart wirken dicht und fusselig statt wie eine Haube
const STRAND_GLSL = (D, aspect, sparse = 0.92) => `
  float sCell = fract(sin(dot(floor(vMapUv * vec2(${D.toFixed(1)}, ${(D * aspect).toFixed(1)})), vec2(39.346, 11.135))) * 43758.5453);
  if (vLay > 0.001) diffuseColor.a *= step(vLay * ${sparse.toFixed(2)}, pow(sCell, 0.7));
  diffuseColor.rgb *= 0.55 + 0.45 * abs(vLay) + 0.15 * (sCell - 0.5);`;
function layered(g, L, attrs, offsetFn) {
  // g: Basis-Geometrie (Position = innerste Lage); offsetFn(i, lf) → Positionsversatz als Vector3
  const n = g.attributes.position.count, idx = g.index.array;
  const pos = new Float32Array(n * 3 * L), lay = new Float32Array(n * L), ix = new Uint32Array(idx.length * L);
  const v = new THREE.Vector3();
  for (let l = 0; l < L; l++) {
    const lf = L > 1 ? l / (L - 1) : 1;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(g.attributes.position, i).add(offsetFn(i, lf));
      pos.set([v.x, v.y, v.z], (l * n + i) * 3);
      lay[l * n + i] = lf;
    }
    for (let k = 0; k < idx.length; k++) ix[l * idx.length + k] = idx[k] + l * n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('hlay', new THREE.BufferAttribute(lay, 1));
  for (const a of attrs) {
    const src = g.attributes[a], arr = new src.array.constructor(src.array.length * L);
    for (let l = 0; l < L; l++) arr.set(src.array, l * src.array.length);
    out.setAttribute(a, new THREE.BufferAttribute(arr, src.itemSize));
  }
  if (g.morphAttributes.position) {
    out.morphAttributes.position = g.morphAttributes.position.map((m) => {
      const arr = new Float32Array(m.array.length * L);
      for (let l = 0; l < L; l++) arr.set(m.array, l * m.array.length);
      const a = new THREE.BufferAttribute(arr, 3); a.name = m.name; return a;
    });
    out.morphTargetsRelative = true;
  }
  out.setIndex(new THREE.BufferAttribute(ix, 1));
  out.computeVertexNormals();
  return out;
}

// Mimik-Deltas (MPFB-Einheiten, je Herkunft gemischt) als Morph-Targets für einen Block
function exprMorphs(A, name, vi) {
  const H = A.header, E = H.expr, b = H.blocks[name];
  if (!E || !b.orig) return null;
  const v = H.variants[vi], orig = A.arr(b.orig), n = b.count;
  const rw = v.race || { caucasian: 1 };
  const sum = E.races.reduce((a, r) => a + (rw[r] || 0), 0) || 1;
  // Basis-Vertex → Block-Vertices (Nähte haben mehrere)
  const first = new Int32Array(20000).fill(-1), next = new Int32Array(n).fill(-1);
  for (let j = 0; j < n; j++) { next[j] = first[orig[j]]; first[orig[j]] = j; }
  const k = v.scale / 4000;
  const add = (arr, U, w) => {
    const idx = A.arr(U.idx), d = A.arr(U.d);
    for (let t = 0; t < idx.length; t++) {
      for (let j = first[idx[t]]; j >= 0; j = next[j]) {
        arr[j * 3] += d[t * 3] * k * w; arr[j * 3 + 1] += d[t * 3 + 1] * k * w; arr[j * 3 + 2] += d[t * 3 + 2] * k * w;
      }
    }
  };
  // Gesichtsform-Achsen (je Spieler einmal eingestellt)
  const shape = [];
  if (H.shape) for (const ax of H.shape.axes) for (const [sgn, key] of [['+', 'p'], ['-', 'm']]) {
    const arr = new Float32Array(n * 3);
    add(arr, H.shape.units[ax][key], 1);
    const a = new THREE.BufferAttribute(arr, 3);
    a.name = 'shape:' + ax + sgn;
    shape.push(a);
  }
  return E.names.map((u) => {
    const arr = new Float32Array(n * 3);
    for (const r of E.races) {
      const w = (rw[r] || 0) / sum;
      if (!w) continue;
      add(arr, E.units[u][r], w);
    }
    const a = new THREE.BufferAttribute(arr, 3);
    a.name = u;
    return a;
  }).concat(shape);
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
  const IM = o.imgs || A;
  const step = o.step || 1, SW = IM.mask.width;
  const W = SW / step, H = IM.mask.height / step;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const rc = document.createElement('canvas'); rc.width = W; rc.height = H;
  const rg = rc.getContext('2d'), rimg = rg.createImageData(W, H), rd = rimg.data;
  const d = img.data, m = IM.mask.data, mb = IM.maskB.data, p = IM.pos.data;
  const bb = o.imgs && A.header.faceBBox ? A.header.faceBBox : A.header.bbox;
  const sk = rgb(o.skin), lip = rgb(o.lip), hair = rgb(o.hair);
  const sock = rgb(o.sock), sockStripe = rgb(o.sockStripe), dark = rgb('#121418');
  const rnd = mulberry(o.seed);
  // kleines Rauschen für Hautunregelmäßigkeiten
  const NW = 64, noise = new Float32Array(NW * NW);
  for (let i = 0; i < noise.length; i++) noise[i] = rnd();
  const nz = (x, y) => noise[(y & (NW - 1)) * NW + (x & (NW - 1))];
  const kx = (bb.max[0] - bb.min[0]) / 255, ky = (bb.max[1] - bb.min[1]) / 255, kz = (bb.max[2] - bb.min[2]) / 255;
  const tat = o.tattoo;
  // ein paar Leberflecke/Sommersprossen im Gesicht (je Spieler anders)
  const moles = [];
  for (let k = 0, n = Math.floor(rnd() * 4); k < n; k++) moles.push([(rnd() - 0.5) * 1.2, 6.5 + rnd() * 1.1, 0.035 + rnd() * 0.03]);
  for (let i = 0, n = W * H; i < n; i++) {
    const o4 = i * 4, s4 = step === 1 ? o4 : (((i / W) | 0) * step * SW + (i % W) * step) * 4;
    const ao = m[s4] / 255, lips = m[s4 + 1] / 255, brow = m[s4 + 2] / 255, scalp = mb[s4] / 255, stub = mb[s4 + 1] / 255;
    const x = bb.min[0] + p[s4] * kx, y = bb.min[1] + p[s4 + 1] * ky, z = bb.min[2] + p[s4 + 2] * kz;
    const px = i % W, py = (i / W) | 0;
    const nn = (nz((px * step) >> 2, (py * step) >> 2) + nz((px * step) >> 4, (py * step) >> 4)) * 0.5 - 0.5;
    // Grundton mit AO, leicht rötlich in Falten
    const aoS = Math.pow(ao, 1.35);
    // weiche Verdeckung (tiefe Augenhöhlen wirkten unheimlich), kaum Hautrauschen
    // stilisiert: kaum Rauschen, leicht gesättigter, warmer Grundton
    let r = sk.r * 1.04 * (0.74 + 0.26 * aoS), gg = sk.g * (0.7 + 0.3 * aoS), b = sk.b * 0.94 * (0.68 + 0.32 * aoS);
    // Gesichtsdetails: durchblutete Wangen, Nase und Ohren, Schatten unter den Augen und in der Lidfalte
    let rough = 0.62;
    if (y > 6.0 && y < 8.0 && z > -0.4) {
      const ax = Math.abs(x);
      const gs = (cx, cy, cz, rr) => Math.exp(-((ax - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) / (rr * rr));
      const blush = gs(0.52, 6.95, 1.2, 0.3) * 0.28 + gs(0, 6.95, 1.62, 0.2) * 0.22 + (ax > 0.62 && y > 6.85 && y < 7.65 && z < 0.8 ? 0.22 : 0);
      if (blush > 0.01) { r *= 1 + blush * 0.12; gg *= 1 - blush * 0.14; b *= 1 - blush * 0.12; }
      const under = gs(0.31, 7.43, 1.36, 0.1) * 0.03;
      if (under > 0.01) { r *= 1 - under; gg *= 1 - under * 1.1; b *= 1 - under * 0.9; }
      // T-Zone und Nasenspitze glänzen etwas mehr
      rough -= gs(0, 7.0, 1.62, 0.22) * 0.16 + (ax < 0.35 && y > 7.55 && z > 1.0 ? 0.08 : 0);
    }
    for (const [mx, my, mr] of moles) {
      if (z < 1.0) break;
      const dd = Math.hypot(x - mx, y - my);
      if (dd < mr) { const k = 0.35 * (1 - dd / mr); r *= 1 - k; gg *= 1 - k * 1.2; b *= 1 - k * 1.1; }
    }
    // Lachfalte und Lippenrand leicht abdunkeln (mehr Plastizität)
    if (y > 6.4 && y < 7.05 && z > 1.0) {
      const ax2 = Math.abs(x), fold = Math.exp(-(((ax2 - (0.3 + (7.0 - y) * 0.45)) / 0.05) ** 2)) * (y < 6.95 ? 1 : 0) * 0.07;
      const rim = lips > 0.05 && lips < 0.6 ? 0.06 : 0;
      r *= 1 - fold - rim; gg *= 1 - fold * 1.1 - rim; b *= 1 - fold - rim;
    }
    // Lippen
    if (lips > 0) {
      rough -= lips * 0.32;                                          // feuchter Glanz
      const t = lips * 0.92; r += (lip.r * (0.7 + 0.3 * ao) - r) * t; gg += (lip.g * (0.7 + 0.3 * ao) - gg) * t; b += (lip.b * (0.7 + 0.3 * ao) - b) * t;
      // Unterlippe etwas heller in der Mitte (Volumen), Mundwinkel dunkler
      const ax3 = Math.abs(x);
      if (y < 6.66) { const k = 0.08 * Math.exp(-((ax3 / 0.12) ** 2)) * lips; r *= 1 + k; gg *= 1 + k; b *= 1 + k; }
      const corner = 0.18 * lips * Math.exp(-(((ax3 - 0.26) / 0.05) ** 2)); r *= 1 - corner; gg *= 1 - corner; b *= 1 - corner;
    }
    // Bartschatten
    if (stub > 0 && o.stubble > 0) {
      // Bartschatten aus einzelnen Stoppeln (Punkte) über einem zarten Grauschleier
      const dot = nz(px * 3 + (py >> 1), py * 5 + (px >> 2)) > 1 - stub * 0.75 ? 1 : 0;
      const t = stub * o.stubble * (0.35 + 0.9 * dot);
      r += (hair.r * 0.7 - r) * t; gg += (hair.g * 0.7 - gg) * t; b += (hair.b * 0.7 - b) * t;
    }
    // Augenbrauen (mit Haar-Struktur)
    if (brow > 0) {
      const strands = nz(px >> 1, py) * 0.6 + nz(px >> 2, py >> 1) * 0.4;       // feine, waagrechte Härchen
      // einzelne Härchen: dichter Kern, ausgedünnter Rand; Farbe etwas heller als das Kopfhaar
      const hairs = nz(px, py >> 1) > 1 - Math.pow(brow, 1.2) * 0.95 ? 1 : 0;
      // 3D-Brauen liegen darüber → hier nur ein zarter Untergrund, damit keine Haut durchblitzt
      const t = Math.min(1, (Math.pow(brow, 2) * 0.3 + hairs * 0.38) * (0.4 + 0.6 * strands)) * 0.45;
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
const LEG_KEYS = new Set(['ankLy', 'ankRy', 'hipLx', 'hipRx', 'hipLz', 'hipRz', 'kneeL', 'kneeR', 'ankL', 'ankR', 'hipsY', 'pelvisX', 'pelvisY', 'pelvisZ']);
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
    this.followT = 0; this.landT = 0; this.gaitPh = 0; this.shootT = 0; this.dunkT = 0; this.stunT = 0; this.vyS = 0; this.wasShooting = false; this.wasAir = false; this.fallAmt = 0;
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
    this.labelY = variant.height + 0.6;
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
    const skinOpts = {
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
    };
    this.skinHex = skinHex;
    const skinTex = composeSkin(A, skinOpts);
    // Gesicht/Kopf in eigener, ~3× feinerer Textur (gleiche Malregeln → nahtlos überblendet)
    const faceTex = composeSkin(A, { ...skinOpts, imgs: A.face });
    const skinMat = new THREE.MeshPhysicalMaterial({
      map: skinTex, roughnessMap: skinTex.userData.rough, roughness: 1, sheen: 0.35, sheenRoughness: 0.6,
      sheenColor: new THREE.Color(skinHex).lerp(new THREE.Color(0xff9f80), 0.45),
      normalMap: poreNormal(), normalScale: new THREE.Vector2(0.02, 0.02), specularIntensity: 0.35,
      // warmes Streulicht (Fake-Subsurface): hebt Schatten rötlich an statt grau
      emissive: new THREE.Color(0xff9a7a), emissiveMap: skinTex, emissiveIntensity: 0.14,
    });
    skinMat.customProgramCacheKey = () => 'skinFace';
    skinMat.onBeforeCompile = (sh) => {
      sh.uniforms.faceMap = { value: faceTex };
      sh.uniforms.faceRough = { value: faceTex.userData.rough };
      sh.uniforms.faceMask = { value: faceMaskTexture(A) };
      sh.vertexShader = 'attribute vec2 faceUv;\nattribute float faceW;\nvarying vec2 vFaceUv;\nvarying float vFaceW;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFaceUv = faceUv; vFaceW = faceW;');
      sh.fragmentShader = 'uniform sampler2D faceMap;\nuniform sampler2D faceRough;\nuniform sampler2D faceMask;\nvarying vec2 vFaceUv;\nvarying float vFaceW;\n' + SKIN_DETAIL_GLSL + sh.fragmentShader
        .replace('#include <map_fragment>', '#include <map_fragment>\n  vec3 faceCol = texture2D(faceMap, vFaceUv).rgb;\n  diffuseColor.rgb = mix(diffuseColor.rgb, faceCol * diffuse, vFaceW);')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  if (vFaceW > 0.01) {\n    float lipM = texture2D(faceMask, vFaceUv).g;\n    float hgt = skinHeight(vFaceUv, lipM);\n    normal = skinPerturb(-vViewPosition, normal, vec2(dFdx(hgt), dFdy(hgt)) * 1.6 * vFaceW, faceDirection);\n  }')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, roughness * texture2D(faceRough, vFaceUv).g, vFaceW);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance = mix(totalEmissiveRadiance, emissive * faceCol, vFaceW);')
        // weiches Streiflicht an den Konturen (Haut streut Licht an flachen Winkeln) → Gesicht löst sich vom Hintergrund
        .replace('#include <opaque_fragment>', '  float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);\n  outgoingLight += diffuseColor.rgb * vec3(1.0, 0.72, 0.6) * rimF * 0.35;\n  outgoingLight += diffuseColor.rgb * vec3(1.0, 0.9, 0.85) * 0.22 * vFaceW;   // weiches Fülllicht im Gesicht\n#include <opaque_fragment>');
    };
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
    this.faceMeshes = meshes.filter((m) => m.geometry.morphAttributes.position);
    this.exprNames = H.expr ? H.expr.names : [];
    // Individuelle Gesichtsform: aus dem Editor oder zufällig (glockenförmig um 0)
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 0.55;
    this.shapeW = {};
    for (const ax of H.shape ? H.shape.axes : []) {
      const lw = look && look.face ? look.face[ax] : undefined;
      this.shapeW[ax] = Math.max(-1, Math.min(1, lw !== undefined ? lw : gauss()));
    }
    this.applyShape = (m) => {
      const dict = m.morphTargetDictionary, inf = m.morphTargetInfluences;
      if (!dict) return;
      for (const ax in this.shapeW) {
        const w = this.shapeW[ax] * 0.85;
        if (dict['shape:' + ax + '+'] !== undefined) inf[dict['shape:' + ax + '+']] = Math.max(0, w);
        if (dict['shape:' + ax + '-'] !== undefined) inf[dict['shape:' + ax + '-']] = Math.max(0, -w);
      }
    };
    this.faceMeshes.forEach(this.applyShape);
    this.faceW = {}; this.blinkT = 1 + Math.random() * 3; this.blinkP = -1; this.mood = 0.3 + rnd() * 0.25;                             // freundliche Grundmiene
    // Binden in der Ruhepose (alle Knochen ohne Rotation), erst danach Korrekturen/Posen setzen
    this.root.updateMatrixWorld(true);
    for (const m of meshes) m.bind(skeleton);
    bones.forEach((b, i) => b.quaternion.copy(corr[i]));
    for (const [i, q] of this.fingerRot) bones[i].quaternion.copy(q).multiply(corr[i]);
    this.root.updateMatrixWorld(true);
    // Stil: großer Kopf (Bobblehead-Proportionen), Hals etwas kräftiger
    const HEAD_K = crowd ? 1.22 : 1.45;
    this.B.head.scale.setScalar(HEAD_K);
    this.B.neck[1].scale.setScalar(1.08);
    // Beinmaße für die IK (Körperraum, Ruhepose nach Korrektur)
    {
      const loc = (b) => this.body.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
      const hl = J('upperleg01.L'), hr = J('upperleg01.R'), aL = loc(this.legL.ankle), aR = loc(this.legR.ankle);
      const Lt = hl.distanceTo(J('lowerleg01.L')), Ls = J('lowerleg01.L').distanceTo(J('foot.L'));
      this.leg = {
        Lt, Ls, hipY: hl.y, hipZ: (hl.z + hr.z) / 2, hipX: [hl.x, hr.x], ankY: (aL.y + aR.y) / 2,
        restX: [aL.x, aR.x], restZ: (aL.z + aR.z) / 2,
        restAbd: [Math.atan2(aL.x - hl.x, hl.y - aL.y), Math.atan2(aR.x - hr.x, hr.y - aR.y)],
        rootX: 0, rootY: this.rootRestY, rootZ: this.B.root.position.z,
      };
      // Ruhe-Bein ist nicht ganz gestreckt → effektive Länge = Ruheabstand Hüfte–Knöchel
      const restLen = Math.hypot(aL.x - hl.x, hl.y - aL.y, aL.z - hl.z);
      const f = restLen / (Lt + Ls);
      this.leg.Lt *= f; this.leg.Ls *= f;
    }

    // --- Starre Teile am Kopf: Augen, Haare, Bart
    const headRest = J('head');
    const toHead = (v) => v.sub(headRest);
    // Augapfel prozedural: Iris mit radialen Fasern und dunklem Limbus-Ring, Pupille, leicht rötliche Lederhaut
    // mit Äderchen, Schatten des Oberlids und dunklere Augenwinkel (Objektraum: Einheitskugel, Blick = +z)
    const irisHex = look ? look.eyes : pick(ethn === 'caucasian' ? ['#5a3a22', '#7a5a2e', '#4a6f9a', '#4f7b5a', '#7d8a96', '#6b7a3a'] : ['#3b2414', '#5a3a22', '#3b2414', '#7a5a2e']);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });
    eyeMat.customProgramCacheKey = () => 'eyeball';
    eyeMat.onBeforeCompile = (sh) => {
      sh.uniforms.irisCol = { value: new THREE.Color(irisHex) };
      sh.vertexShader = 'varying vec3 vEyeP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vEyeP = position;');
      sh.fragmentShader = 'uniform vec3 irisCol;\nvarying vec3 vEyeP;\n' +
        'float eh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
        sh.fragmentShader.replace('#include <map_fragment>', `
  vec3 ep = vEyeP / 0.76;                                    // Augapfel ~0.76 Einheiten Radius (quer)
  float rho = vEyeP.z > 0.0 ? length(ep.xy) : 2.0;          // Abstand von der Sehachse (vorne)
  float phi = atan(ep.y, ep.x);
  float fib = 0.75 + 0.25 * eh(vec2(floor(phi * 40.0), 1.0)) + 0.12 * sin(phi * 23.0 + rho * 40.0);
  vec3 iris = irisCol * fib * (0.6 + 0.8 * smoothstep(0.14, 0.4, rho));    // innen dunkler, außen heller
  iris = mix(iris, irisCol * 0.22, smoothstep(0.38, 0.45, rho));            // Limbus-Ring
  vec3 sclera = vec3(0.9, 0.87, 0.84);
  float vein = smoothstep(0.93, 1.0, eh(vec2(floor(phi * 60.0), floor(rho * 14.0)))) * smoothstep(0.6, 0.95, rho);
  sclera = mix(sclera, vec3(0.85, 0.45, 0.42), vein * 0.5 + smoothstep(0.7, 1.0, rho) * 0.12);
  vec3 col = mix(iris, sclera, smoothstep(0.45, 0.49, rho));
  col = mix(vec3(0.015), col, smoothstep(0.13, 0.16, rho));                // Pupille
  float lid = 1.0 - 0.35 * smoothstep(0.15, 0.6, ep.y);                     // Schatten vom Oberlid
  float corner = 1.0 - 0.25 * smoothstep(0.6, 1.0, rho);
  diffuseColor.rgb *= col * lid * corner;
  // Lichtreflex (Flutlicht von oben) und feuchter Rand am Unterlid
  float cl = smoothstep(0.1, 0.06, length(ep.xy - vec2(-0.14, 0.17))) * step(0.0, vEyeP.z) + smoothstep(0.045, 0.02, length(ep.xy - vec2(0.12, -0.12))) * step(0.0, vEyeP.z) * 0.6;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.6), cl * 0.85);
  diffuseColor.rgb += vec3(0.08, 0.05, 0.05) * smoothstep(0.55, 0.75, -ep.y) * step(0.0, vEyeP.z);`);
    };
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
    this.buildMouth(A, vi, headRest);
    this.eyeBalls = [];
    variant.eyes.forEach((e, k) => {
      const eg = new THREE.Group();                             // dreht sich zum Blickziel
      eg.position.copy(toHead(new THREE.Vector3(...e.c)));
      eg.scale.setScalar(e.r * 0.98);
      for (const [key, mat] of [['index', eyeMat], ['cornea', corneaMat]]) eg.add(new THREE.Mesh(eyeGeo(k === 1, key), mat));
      this.head.add(eg);
      this.eyeBalls.push(eg);
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
    const strandD = style === 'afro' || style === 'twists' ? 70 : style === 'cornrows' ? 160 : 260;
    const ha = { afro: [-0.03, 0.03, 1], hightop: [0.25, 0.55, 0.85], fade: [0.25, 0.55, 0.85], buzz: [-0.05, 0.12, 0.85], waves: [-0.05, 0.12, 0.85] }[style] || [-0.04, 0.04, 1];
    // Physikalisch mit Sheen: dunkles Haar bekommt einen weichen, faserigen Glanz statt schwarzer Fläche
    const mat = new THREE.MeshPhysicalMaterial({
      map: tex.map, bumpMap: tex.bump, bumpScale: 3, roughness: 0.72, alphaTest: 0.5,
      sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(hairHex).lerp(new THREE.Color(0xa89080), 0.45), specularIntensity: 0.6,
    });
    mat.customProgramCacheKey = () => 'hairline';
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.hA = { value: new THREE.Vector3(...ha) };
      sh.vertexShader = 'attribute float hl;\nattribute float hlay;\nvarying float vHl;\nvarying float vLay;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHl = hl; vLay = hlay;');
      sh.fragmentShader = 'uniform vec3 hA;\nvarying float vHl;\nvarying float vLay;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', '  float hn = fract(sin(dot(floor(vMapUv * 700.0), vec2(12.9898, 78.233))) * 43758.5453);\n  diffuseColor.a *= smoothstep(hA.x, hA.y, vHl + (hn - 0.5) * 0.06 - vLay * 0.05) * (hA.z < 1.0 ? 1.0 : 1.0);' + STRAND_GLSL(strandD, style === 'afro' || style === 'twists' ? 1 : 0.3, style === 'afro' ? 0.62 : 0.92) + '\n#include <alphatest_fragment>');
    };
    const P = (i) => new THREE.Vector3(p16[i * 3] / 13000, p16[i * 3 + 1] / 13000, p16[i * 3 + 2] / 13000);
    const N = (i) => new THREE.Vector3(n8[i * 3] / 127, n8[i * 3 + 1] / 127, n8[i * 3 + 2] / 127).normalize();
    let top = -Infinity; for (let i = 0; i < n; i++) top = Math.max(top, P(i).y);
    // L Lagen von knapp über der Kopfhaut (inner) bis zur Außenform
    const shell = (offsetFn, L = 4, inner = 0.001) => {
      const pos = new Float32Array(n * 3), outer = [];
      for (let i = 0; i < n; i++) {
        const p = P(i), nn = N(i);
        const o = offsetFn(i, p, nn);
        const q = p.clone().addScaledVector(nn, o.n || 0);
        if (o.up) q.y += o.up;
        const b = p.clone().addScaledVector(nn, Math.min(inner, o.n || 0));
        outer.push(q.sub(b));
        b.sub(headRest);
        pos.set([b.x, b.y, b.z], i * 3);
      }
      const g0 = new THREE.BufferGeometry();
      g0.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g0.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(uvA, (v, k) => v * 3), 2));
      g0.setAttribute('hl', new THREE.BufferAttribute(line, 1));
      g0.setIndex(new THREE.BufferAttribute(Uint16Array.from(idx), 1));
      const tv = new THREE.Vector3();
      const g = layered(g0, L, ['uv', 'hl'], (i, lf) => tv.copy(outer[i]).multiplyScalar(lf));
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
      }, 9);
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
      shell(() => ({ n: style === 'cornrows' ? 0.0045 : style === 'bun' ? 0.006 : style === 'buzz' || style === 'fade' || style === 'waves' ? 0.0045 : 0.004 }), 4, 0.0008);
      const extra = [];
      if (style === 'dreads' || style === 'twists') {
        let dz = 0; for (let i = 0; i < n; i++) dz += P(i).z / n;
        const dC = new THREE.Vector3(0, top - 0.1, dz);
        for (let i = 0; i < n; i += style === 'dreads' ? 6 : 3) {
          if (line[i] < 0.08) continue;
          const p = P(i), nn = N(i);
          {
            // Strähne fällt unter Schwerkraft, legt sich um den Schädel und bleibt aus dem Gesicht
            // (Twists: kurz und dicht am Kopf, Dreads: lang)
            const tw = style === 'twists';
            const len = tw ? 0.045 + rnd() * 0.03 : 0.2 + rnd() * 0.14, seg = tw ? 0.009 : 0.016;
            let q = p.clone().addScaledVector(nn, tw ? 0.004 : 0.005);
            const minR = q.distanceTo(dC) + (tw ? 0.001 : 0.004);
            const pts = [q.clone()];
            const v = nn.clone().multiplyScalar(0.4).add(new THREE.Vector3(q.x * 3, 0, -0.9)).normalize();
            for (let d = 0; d < len; d += seg) {
              v.y -= tw ? 0.12 : 0.32; v.x += (rnd() - 0.5) * 0.08; v.normalize();
              q = q.clone().addScaledVector(v, seg);
              const r = q.distanceTo(dC);
              if (r < minR && q.y > dC.y - 0.14) q.sub(dC).multiplyScalar(minR / r).add(dC);
              if (q.y < top - 0.07 && q.z > dC.z + 0.015 && Math.abs(q.x) < 0.085) q.z = dC.z + 0.015;
              pts.push(q);
            }
            extra.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((x) => x.sub(headRest))), pts.length * 2, tw ? 0.0056 : 0.0072, 5, false));
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
        g.setAttribute('hlay', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(-1), 1));   // massiv, nicht ausdünnen
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
    // Augenbrauen: echte Härchen-Lagen; Brauenform pro Pixel aus der Basis-Mesh-Position (scharf trotz grober Dreiecke)
    if (H.blocks.brow && H.blocks.brow.bpos) {
      const bb = H.blocks.brow, bv = H.variants[vi].blocks.brow;
      const bp = A.arr(bv.pos), bn = A.arr(bv.nrm), cnt = bb.count;
      const pos = new Float32Array(cnt * 3), bOut = [];
      for (let i = 0; i < cnt; i++) {
        const nn = new THREE.Vector3(bn[i * 3] / 127, bn[i * 3 + 1] / 127, bn[i * 3 + 2] / 127).normalize();
        const p = new THREE.Vector3(bp[i * 3] / 13000, bp[i * 3 + 1] / 13000, bp[i * 3 + 2] / 13000).addScaledVector(nn, 0.0004).sub(headRest);
        pos.set([p.x, p.y, p.z], i * 3);
        bOut.push(nn.multiplyScalar(0.0011));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('bpos', new THREE.BufferAttribute(A.arr(bb.bpos), 3));
      g.setIndex(new THREE.BufferAttribute(Uint16Array.from(A.arr(bb.index)), 1));
      const em = exprMorphs(A, 'brow', vi);
      if (em) { g.morphAttributes.position = em; g.morphTargetsRelative = true; }
      const tv = new THREE.Vector3();
      const browMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(hairHex).lerp(new THREE.Color(this.skinHex), 0.25).lerp(new THREE.Color(0x6b4a33), 0.25), roughness: 0.75, alphaTest: 0.5 });
      browMat.customProgramCacheKey = () => 'brows3d';
      browMat.onBeforeCompile = (sh) => {
        sh.vertexShader = 'attribute vec3 bpos;\nattribute float hlay;\nvarying vec3 vB;\nvarying float vLay;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vB = bpos; vLay = hlay;');
        sh.fragmentShader = 'varying vec3 vB;\nvarying float vLay;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `
  float bx = abs(vB.x), t = (bx - 0.07) / 0.5;
  float by = 7.56 + sin(clamp(t, 0.0, 1.0) * 3.14159 * 0.85) * 0.07;
  float th = 0.05 * (1.0 - 0.55 * max(0.0, t));
  float m = (1.0 - smoothstep(th * 0.2, th * 0.85, abs(vB.y - by))) * (1.0 - smoothstep(0.88, 1.05, t)) * smoothstep(-0.04, 0.08, t);
  // Härchen: schräg nach außen oben wachsend, innen steiler
  float ang = mix(1.1, 0.25, clamp(t, 0.0, 1.0));
  vec2 q = vec2(bx, vB.y);
  vec2 d = vec2(cos(ang), sin(ang));
  float along = dot(q, d), across = dot(q, vec2(-d.y, d.x));
  float cell = floor(across * 380.0);
  float h = fract(sin(cell * 12.9898 + floor(along * 22.0) * 78.233) * 43758.5453);
  float hair = step(1.0 - m * (0.55 - vLay * 0.25), h);
  diffuseColor.a = hair * step(0.05, m);
  diffuseColor.rgb *= 0.75 + 0.35 * h;
#include <alphatest_fragment>`);
      };
      const mesh = new THREE.Mesh(layered(g, 3, ['bpos'], (i, lf) => tv.copy(bOut[i]).multiplyScalar(lf)), browMat);
      this.head.add(mesh);
      this.faceMeshes.push(mesh);
      this.applyShape(mesh);
      this.hasBrows3d = true;
    }
    // Bart
    if (beard === 'beard' || beard === 'goatee') {
      const bb = H.blocks.beard, bv = H.variants[vi].blocks.beard;
      const bp = A.arr(bv.pos), bn = A.arr(bv.nrm), bu = A.arr(bb.uv);
      const cnt = bb.count;
      const btex = hairTexture(hairHex, 'coil');
      const bmat = new THREE.MeshPhysicalMaterial({ map: btex.map, bumpMap: btex.bump, bumpScale: 3, roughness: 0.8, vertexColors: true, alphaTest: 0.5,
        sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color(hairHex).lerp(new THREE.Color(0xa89080), 0.4) });
      // Bartrand pro Pixel ausfransen (sonst sieht man die Dreieckskanten als Sägezahn)
      bmat.customProgramCacheKey = () => 'beardEdge';
      bmat.onBeforeCompile = (sh) => {
        sh.vertexShader = 'attribute float hlay;\nvarying float vLay;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLay = hlay;');
        sh.fragmentShader = 'varying float vLay;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>',
          '  float bn = fract(sin(dot(floor(vMapUv * 900.0), vec2(12.9898, 78.233))) * 43758.5453);\n  diffuseColor.a = smoothstep(0.3, 0.7, diffuseColor.a + (bn - 0.5) * 0.55 - vLay * 0.15);' + STRAND_GLSL(110, 0.5) + '\n#include <alphatest_fragment>');
      };
      let minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < cnt; i++) { minY = Math.min(minY, bp[i * 3 + 1]); maxY = Math.max(maxY, bp[i * 3 + 1]); }
      const pos = new Float32Array(cnt * 3), colA = new Float32Array(cnt * 4), bOut = [];
      for (let i = 0; i < cnt; i++) {
        const p = new THREE.Vector3(bp[i * 3] / 13000, bp[i * 3 + 1] / 13000, bp[i * 3 + 2] / 13000);
        const nn = new THREE.Vector3(bn[i * 3] / 127, bn[i * 3 + 1] / 127, bn[i * 3 + 2] / 127).normalize();
        const hy = (bp[i * 3 + 1] - minY) / (maxY - minY || 1);
        let a = 1 - s(0.72, 0.98, hy);
        if (beard === 'goatee') a *= 1 - s(0.035, 0.06, Math.abs(p.x));
        const th = (0.004 + 0.007 * (1 - hy)) * (beard === 'goatee' ? 0.8 : 1);
        bOut.push(nn.clone().multiplyScalar(th - 0.0008));
        p.addScaledVector(nn, 0.0008);
        p.sub(headRest);
        pos.set([p.x, p.y, p.z], i * 3);
        colA.set([1, 1, 1, a], i * 4);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(bu, (v) => v * 4), 2));
      g.setAttribute('color', new THREE.BufferAttribute(colA, 4));
      g.setIndex(new THREE.BufferAttribute(Uint16Array.from(A.arr(bb.index)), 1));
      const bm = exprMorphs(A, 'beard', vi);
      if (bm) { g.morphAttributes.position = bm; g.morphTargetsRelative = true; }
      const tv = new THREE.Vector3();
      const beardMesh = new THREE.Mesh(layered(g, 5, ['uv', 'color'], (i, lf) => tv.copy(bOut[i]).multiplyScalar(lf)), bmat);
      beardMesh.castShadow = true;
      this.head.add(beardMesh);
      this.faceMeshes.push(beardMesh);
      this.applyShape(beardMesh);
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

    // ---------------- Grundhaltung, Gangzyklus und Zustände
    const K = this.scaleK;
    const cf = Math.cos(this.f), sf = Math.sin(this.f);
    const lx = (s.vx || 0) * cf - (s.vz || 0) * sf;              // lokal: +x = links der Figur
    const lz = (s.vx || 0) * sf + (s.vz || 0) * cf;              // lokal: +z = vorwärts
    const spd = Math.hypot(lx, lz);
    const onGround = !air && s.st !== 'dunk' && !stun;
    const A = onGround ? Math.min(1, spd / 6.5) : 0;            // 0 = Stand, 1 = Sprint
    const gA = onGround ? Math.min(1, spd / 1.4) : 0;            // Gang ein-/ausblenden
    const back = lz < -0.5 ? Math.min(1, -lz / 3) : 0;           // Rückwärtslaufen
    // Schrittlänge wächst mit dem Tempo → Füße bleiben beim Aufsetzen stehen (kein Rutschen)
    const stride = s.defending ? 0.42 : 1;                     // Verteidigung: kurze, schnelle Schritte ohne Überkreuzen
    if (onGround && spd > 0.1) this.gaitPh = (this.gaitPh + dt * spd / ((0.9 + spd * 0.28) * K * stride)) % 1;
    this.runPhase = this.gaitPh * Math.PI * 2;
    const swing = Math.sin(this.runPhase);                      // +1: linkes Bein vorn
    const breath = Math.sin(t * 1.7);
    const T = {
      pelvisX: 0.1 * A * (1 - back), pelvisY: 0.12 * A * swing, pelvisZ: Math.sin(t * 0.45) * 0.03 * (1 - gA),   // Gewicht verlagern im Stand
      hipLx: 0, hipRx: 0, hipLz: 0.03, hipRz: -0.03, ankLy: 0, ankRy: 0, kneeL: -0.1, kneeR: -0.1,
      shLx: 0.05, shRx: 0.05, shLz: 0.1, shRz: -0.1, elL: 0.2, elR: 0.2, handLx: 0.05, handRx: 0.05,
      spineX: 0.03 + breath * 0.012 + 0.2 * A * (1 - back) - 0.1 * back, spineY: -0.2 * A * swing, spineZ: 0,
      headX: -0.02 - 0.1 * A, headY: 0,
      hipsY: 0,
    };
    // Armschwung gegengleich zu den Beinen, Ellbogen beim Laufen angewinkelt
    const armAmp = (0.22 + 0.7 * A) * gA;
    T.shLx += -armAmp * swing; T.shRx += armAmp * swing;
    T.elL += gA * (0.45 + 0.75 * A + 0.3 * Math.max(0, -swing));
    T.elR += gA * (0.45 + 0.75 * A + 0.3 * Math.max(0, swing));
    T.shLz += 0.06 * gA; T.shRz -= 0.06 * gA;
    // Parameter für die Bein-IK: Hocke, Spurbreite, Schritthöhe, Ausfallschritt
    const G = { legs: onGround, crouch: 0.02 + 0.03 * A, width: 0.015, lift: 1, zL: 0, zR: 0, stride };

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
        T.shRx = ballArm.x; T.shRz = -ballArm.z; T.elR = ballArm.el; T.handRx = 0.4 + push * 0.3;
        T.shLx = guard.x; T.shLz = guard.z; T.elL = guard.el;
      } else {
        T.shLx = ballArm.x; T.shLz = ballArm.z; T.elL = ballArm.el; T.handLx = 0.4 + push * 0.3;
        T.shRx = guard.x; T.shRz = -guard.z; T.elR = guard.el;
      }
      G.crouch = crossing ? 0.13 : 0.08 + 0.03 * A;
      G.width = 0.05;
      T.spineX += 0.2 + G.crouch;
      T.spineY = hd * 0.12 - 0.1 * A * swing;                  // Ballseite leicht vorn
      T.pelvisY *= 0.6;
      T.headX -= 0.15;
      if (crossing && this.crossMv === 'legs') {              // Ausfallschritt beim Beine-Wechsel
        G.zL = hd === 1 ? 0.3 : -0.2; G.zR = hd === 1 ? -0.2 : 0.3; G.crouch = 0.16;
      }
    }

    if (s.defending && !air && !stun) {
      G.crouch = 0.17; G.width = 0.16; G.lift = 0.4;
      T.spineX = 0.42; T.spineY = 0; T.pelvisY = 0;
      T.shLx = 0.6 + Math.sin(t * 7) * 0.1; T.shRx = 0.6 + Math.cos(t * 7) * 0.1;
      T.shLz = 0.85; T.shRz = -0.85;
      T.elL = 1.0; T.elR = 1.0; T.handLx = -0.4; T.handRx = -0.4;
      T.headX = -0.3;
    }

    // Vertikaltempo für Sprungphasen (steigen → Scheitel → fallen)
    const vyRaw = air && this.prevY !== undefined ? (s.y - this.prevY) / Math.max(dt, 1e-3) : 0;
    this.prevY = s.y;
    this.vyS += (vyRaw - this.vyS) * Math.min(1, dt * 12);
    if (air && !shooting && s.st !== 'dunk') {
      const up = Math.max(-1, Math.min(1, this.vyS / 3.5)), apex = 1 - Math.abs(up), down = Math.max(0, -up);
      // steigen: Beine gestreckt, Zehen gestreckt · Scheitel: Knie angezogen · fallen: Beine strecken zur Landung
      T.hipLx = 0.2 + 0.45 * apex - 0.1 * down; T.hipRx = 0.08 + 0.3 * apex;
      T.kneeL = -(0.2 + 0.85 * apex); T.kneeR = -(0.15 + 0.55 * apex);
      T.hipLz = 0.08; T.hipRz = -0.1; T.pelvisY = 0;
      const toe = 0.55 * Math.max(0, up) + 0.25 * apex;
      T.ankL = -(T.hipLx + T.kneeL) * 0.8 - toe; T.ankR = -(T.hipRx + T.kneeR) * 0.8 - toe;
      if (!s.hasBall) { // Block- / Rebound-Sprung: Arme schießen hoch, sinken im Fallen
        T.shLx = T.shRx = 2.95 - 0.55 * down; T.shLz = 0.18 + 0.25 * down; T.shRz = -T.shLz;
        T.elL = T.elR = 0.1 + 0.5 * down;
        T.handLx = T.handRx = 0.3 * apex;
        T.spineX = -0.08 + 0.18 * down; T.headX = 0.3 - 0.2 * down;
      } else { T.spineX = 0.05; }
    }

    // Wurf: Ball zur Brust holen (Dip) → Set-Point über der Stirn → Abdrücken aus den Beinen
    this.shootT = shooting ? this.shootT + dt : 0;
    if (shooting) {
      const k = Math.min(1, this.shootT / 0.24), e = k * k * (3 - 2 * k);
      T.shRx = 1.05 + 1.5 * e; T.shRz = 0.12; T.elR = 2.1 - 0.55 * e; T.handRx = -0.6 * e;   // Wurfhand
      T.shLx = 0.95 + 1.35 * e; T.shLz = -0.28; T.elL = 1.9 - 0.55 * e;                       // Führhand
      T.spineX = 0.12 - 0.16 * e; T.spineY = 0; T.pelvisY = 0; T.headX = 0.12;
      if (air) { T.hipLx = 0.18; T.hipRx = 0.1; T.kneeL = -0.28; T.kneeR = -0.2; }
      else { G.crouch = 0.14 * (1 - e * 0.7); G.width = 0.04; }
    } else if (this.followT > 0) {
      // Nachschwung: Arm gestreckt, Handgelenk abgeklappt ("Goose Neck")
      T.shRx = 2.85; T.shRz = 0.05; T.elR = 0.08; T.handRx = 1.25;
      T.shLx = 2.4; T.shLz = -0.1; T.elL = 0.25;
      T.spineX = -0.05; T.headX = 0.15; T.pelvisY = 0;
      if (air) { T.hipLx = 0.2; T.kneeL = -0.3; T.kneeR = -0.2; }
    }

    // Dunk: Ball hinter dem Kopf ausholen, dann mit Wucht durch den Ring
    this.dunkT = s.st === 'dunk' ? this.dunkT + dt : 0;
    if (s.st === 'dunk') {
      const k = Math.min(1, Math.max(0, (this.dunkT - 0.22) / 0.12));
      T.shRx = 3.35 - 0.55 * k; T.shRz = 0.05; T.elR = 1.35 - 1.2 * k; T.handRx = -0.7 + 1.5 * k;
      T.shLx = 1.4 + 0.6 * (1 - k); T.shLz = 0.6; T.elL = 0.5;
      T.hipLx = 1.0; T.hipRx = 0.25; T.kneeL = -1.45; T.kneeR = -0.55;
      T.spineX = 0.05 + 0.25 * k; T.headX = 0.25 - 0.2 * k; T.pelvisY = 0;
    }

    if (this.reachT > 0) {
      this.reachT -= dt;
      T.shRx = 1.35; T.shRz = 0.15; T.elR = 0.1; T.handRx = 0.3;
      T.spineX = 0.5; T.spineY = 0.25;
      G.zR = 0.32; G.zL = -0.12; G.crouch = 0.13;
    }

    if (this.celebrateT > 0 && !air && !s.hasBall) {
      const pump = Math.sin(this.celebrateT * 14) * 0.25;
      T.shLx = T.shRx = 2.5 + pump; T.shLz = 0.6; T.shRz = -0.6; T.elL = T.elR = 1.5;
      T.spineX = -0.1; T.headX = 0.2;
      T.hipsY = Math.abs(Math.sin(this.celebrateT * 7)) * 0.06;
    }

    if (this.landT > 0 && !stun) G.crouch += 0.15 * (this.landT / 0.22);

    // Drehen im Stand: Füße bleiben stehen, bis die Verdrehung zu groß wird, dann ein Schritt
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    if (!this.fy) { this.fy = [this.f, this.f]; this.stepU = [-1, -1]; this.stepFrom = [0, 0]; }
    G.yaw = [0, 0]; G.stepLift = [0, 0];
    if (G.legs && spd < 0.6) {
      const stepping = this.stepU[0] >= 0 ? 0 : this.stepU[1] >= 0 ? 1 : -1;
      if (stepping < 0) {
        const d0 = Math.abs(wrap(this.f - this.fy[0])), d1 = Math.abs(wrap(this.f - this.fy[1]));
        const i = d0 >= d1 ? 0 : 1;
        if (Math.max(d0, d1) > 0.32) { this.stepU[i] = 0; this.stepFrom[i] = this.fy[i]; }
      }
      for (const i of [0, 1]) {
        if (this.stepU[i] < 0) continue;
        this.stepU[i] = Math.min(1, this.stepU[i] + dt / 0.16);
        const u = this.stepU[i], e = u * u * (3 - 2 * u);
        this.fy[i] = this.stepFrom[i] + wrap(this.f - this.stepFrom[i]) * e;
        G.stepLift[i] = 0.07 * this.scaleK * Math.sin(Math.PI * u);
        if (u >= 1) this.stepU[i] = -1;
      }
      G.yaw = [wrap(this.fy[0] - this.f), wrap(this.fy[1] - this.f)];
    } else { this.fy[0] = this.fy[1] = this.f; this.stepU[0] = this.stepU[1] = -1; }

    if (G.legs) this.legIK(T, G, lx, lz, spd, gA, A);
    else {
      if (T.ankL === undefined) T.ankL = -(T.hipLx + T.kneeL) * 0.8;
      if (T.ankR === undefined) T.ankR = -(T.hipRx + T.kneeR) * 0.8;
    }

    // Hinfallen bei Ankle Breaker: auf den Hintern
    const fall = stun ? 1 : 0;
    this.fallAmt += (fall - this.fallAmt) * Math.min(1, dt * (fall ? 9 : 3.5));
    if (stun) this.stunT += dt;
    else if (this.fallAmt < 0.02) this.stunT = 0;
    if (this.fallAmt > 0.02) {
      // Ablauf: Stolpern mit rudernden Armen → Aufprall auf dem Hintern → sitzen, Kopf schütteln, abstützen
      const f = this.fallAmt, st2 = this.stunT;
      const w = Math.min(1, Math.max(0, (st2 - 0.18) / 0.22)), e = w * w * (3 - 2 * w);
      const flail = Math.sin(st2 * 22) * (1 - e);
      const P = {
        // sitzend: ein Knie aufgestellt, das andere Bein flach nach vorn (Hüfte ~17 cm über dem Boden)
        hipsY: -0.22 - 0.7 * e * e, hipLx: 0.95 + 0.95 * Math.sqrt(e), hipRx: 0.25 + 1.25 * e, kneeL: -0.3 - 0.6 * e, kneeR: -0.55 + 0.5 * e,
        hipLz: 0.2, hipRz: -0.2, ankLy: 0, ankRy: 0,
        spineX: -0.35 - 0.2 * e, spineY: 0.2 * flail, pelvisY: 0, pelvisZ: 0.1 * flail, pelvisX: -0.15 * (1 - e),
        shLx: 1.8 * (1 - e) - 0.75 * e + 0.4 * flail, shRx: 2.3 * (1 - e) - 0.75 * e - 0.4 * flail,
        shLz: 1.0 * (1 - e) + 0.35 * e, shRz: -1.2 * (1 - e) - 0.35 * e, elL: 0.6 * (1 - e) + 0.1 * e, elR: 0.5 * (1 - e) + 0.1 * e,
        handLx: -0.8 * e, handRx: -0.8 * e,
        headX: 0.3 * (1 - e) + 0.25 * e, headY: e * Math.sin(st2 * 5) * 0.25 * Math.max(0, 1 - (st2 - 0.5) * 0.8),
        ankL: -0.3 * e, ankR: -0.9 * e,
      };
      for (const key in P) T[key] = (T[key] === undefined ? P[key] : T[key]) * (1 - f) + P[key] * f;
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
    // ---------------- Mimik je Situation
    const F = {};
    const both = (u, w) => { F[u.replace('*', 'left')] = w; F[u.replace('*', 'right')] = w; };
    F['mouth-corner-puller'] = Math.max(0, this.mood);                 // Grundstimmung
    F['mouth-depression'] = Math.max(0, -this.mood);
    F['mouth-open'] = 0;
    both('eyebrows-*-up', 0.12);                                      // offener, wacher Blick
    if (A > 0.5) {                                                     // Sprint: Atmen durch den Mund, Anstrengung
      F['mouth-open'] = 0.18 + 0.12 * Math.abs(Math.sin(t * 5)); both('eyebrows-*-down', 0.25 * A); F['mouth-retraction'] = 0.15;
    }
    if (s.defending && !air) { both('eyebrows-*-down', 0.3); both('eye-*-slit', 0.12); F['mouth-compression'] = 0.2; }
    if (s.hasBall && !shooting && !air) { both('eyebrows-*-down', 0.3); F['mouth-compression'] = 0.2; }
    if (shooting) { both('eye-*-slit', 0.3); F['mouth-compression'] = 0.5; F['mouth-corner-puller'] = 0; both('eyebrows-*-down', 0.2); }
    if (s.st === 'dunk') {                                             // Schrei beim Dunk
      F['mouth-open'] = 0.95; F['mouth-retraction'] = 0.55; F['mouth-elevation'] = 0.4; both('eyebrows-*-down', 0.8);
      both('nose-*-elevation', 0.5); F['neck-platysma'] = 0.7; both('eye-*-slit', 0.35); F['mouth-corner-puller'] = 0;
    }
    if (air && !shooting && s.st !== 'dunk' && !s.hasBall) { F['mouth-open'] = 0.35; both('eyebrows-*-down', 0.4); F['neck-platysma'] = 0.35; }
    if (this.celebrateT > 0) { F['mouth-corner-puller'] = 1; F['mouth-open'] = 0.55 + 0.2 * Math.sin(t * 9); both('eyebrows-*-up', 0.45); both('eye-*-slit', 0.35); }
    if (this.fallAmt > 0.1) {                                          // Ankle Breaker: Schreck, dann Frust
      const late = Math.min(1, this.stunT / 0.6);
      F['mouth-open'] = 0.6 - 0.35 * late; both('eyebrows-*-inner-up', 0.9); F['mouth-depression'] = 0.5 * late; F['mouth-corner-puller'] = 0;
      both('eyebrows-*-up', 0.4 * (1 - late));
    }
    if (this.emoteT > 0 && this.emoteFace) Object.assign(F, this.emoteFace);
    this.faceUpdate(dt, F, this.lookTarget && !stun ? this.lookTarget : null);

    // Glätten: Beine fast direkt (sonst rutschen die Füße), Oberkörper weich
    // Bein-IK liefert schon stetige Winkel → nach kurzer Überblendzeit ungefiltert übernehmen
    this.ikT = G.legs ? Math.min(1, (this.ikT || 0) + dt * 5) : 0;
    const k = 1 - Math.exp(-dt * 14), kl = G.legs ? (1 - Math.exp(-dt * 16)) * (1 - this.ikT) + this.ikT : 1 - Math.exp(-dt * 16);
    for (const key in T) {
      const kk = LEG_KEYS.has(key) ? kl : k;
      this.q[key] = this.q[key] === undefined ? T[key] : this.q[key] + (T[key] - this.q[key]) * kk;
    }
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

  // Beine per Zwei-Gelenk-IK: Fußziele aus dem Gangzyklus (Standphase = Fuß steht still am Boden)
  legIK(T, G, lx, lz, spd, gA, A) {
    const L = this.leg, K = this.scaleK;
    const beta = 0.62 - 0.26 * A;                             // Anteil Bodenkontakt je Zyklus
    const D = (0.9 + spd * 0.28) * K * G.stride;              // Weg pro Doppelschritt
    const dx = spd > 0.05 ? lx / spd : 0, dz = spd > 0.05 ? lz / spd : 1;
    const lift = (0.05 + 0.3 * A) * K * G.lift;
    const feet = [];
    let bob = 0;
    for (const side of [0, 1]) {
      const ph = (this.gaitPh + (side ? 0.25 : 0.75)) % 1;
      let off, h, pitch, drive = 0;
      if (ph < beta) {                                         // Stand: Fuß wandert mit Bodentempo nach hinten
        const u = ph / beta;
        off = (0.5 - u) * beta * D; h = 0;
        pitch = u > 0.6 ? ((u - 0.6) / 0.4) * 0.6 * A : 0;      // Abdruck über die Zehen
        bob = Math.max(bob, Math.sin(Math.PI * u));
      } else {                                                 // Schwung: Fuß hebt ab und zieht nach vorn
        const u = (ph - beta) / (1 - beta), e = u * u * (3 - 2 * u);
        off = (e - 0.5) * beta * D; h = lift * Math.sin(Math.PI * Math.pow(u, 0.7 + 0.3 * (1 - A)));   // Ferse schwingt beim Rennen früh hoch
        pitch = 0.5 * A * (1 - u) * (1 - u) - 0.25 * A * Math.sin(Math.PI * u);
        drive = Math.sin(Math.PI * Math.min(1, u * 1.15)) * A;   // Knie vorbringen, Unterschenkel faltet ein
      }
      feet.push({ off: off * gA, h: h * gA, pitch: pitch * gA, drive: drive * gA });
      (this.stance || (this.stance = [0, 0]))[side] = ph < beta ? 1 : 0;
    }
    T.hipsY += -G.crouch - 0.05 * A * bob * gA + 0.012 * gA * (1 - A);
    // Becken-Drehung einbeziehen: Hüftgelenke drehen um die Wurzel, Fußziele im Beckenraum rechnen
    const cl = (v) => Math.max(-1, Math.min(1, v));
    const pq = this._q.setFromEuler(this._e.set(T.pelvisX, T.pelvisY, T.pelvisZ));
    const pqi = this._qi || (this._qi = new THREE.Quaternion());
    pqi.copy(pq).invert();
    const root = this._rootP || (this._rootP = new THREE.Vector3());
    root.set(L.rootX, L.rootY + T.hipsY * K, L.rootZ);
    const hp = this._hp || (this._hp = new THREE.Vector3()), o = this._o || (this._o = new THREE.Vector3());
    feet.forEach((f, side) => {
      const sx = side ? -1 : 1;
      let fx = L.restX[side] + sx * G.width * K + dx * f.off;
      let fz = L.restZ + (side ? G.zR : G.zL) * K + dz * f.off;
      const fy = L.ankY + f.h + G.stepLift[side];
      const ya = G.yaw[side];
      if (ya) { const c = Math.cos(ya), sn = Math.sin(ya); [fx, fz] = [fx * c + fz * sn, -fx * sn + fz * c]; }
      hp.set(L.hipX[side] - L.rootX, L.hipY - L.rootY, L.hipZ - L.rootZ).applyQuaternion(pq).add(root);
      o.set(fx - hp.x, fy - hp.y, fz - hp.z).applyQuaternion(pqi);
      const ox = o.x, oy = -o.y, oz = o.z;
      const abd = Math.atan2(ox, oy) - L.restAbd[side];
      const v = Math.hypot(ox, oy);
      const dist = Math.min(L.Lt + L.Ls - 1e-4, Math.max(0.25 * K, Math.hypot(v, oz)));
      const knee = Math.PI - Math.acos(cl((L.Lt * L.Lt + L.Ls * L.Ls - dist * dist) / (2 * L.Lt * L.Ls)));
      const a = Math.acos(cl((L.Lt * L.Lt + dist * dist - L.Ls * L.Ls) / (2 * L.Lt * dist)));
      let hip = Math.atan2(oz, v) + a, kn = knee;
      hip += 0.4 * f.drive; kn += 1.0 * f.drive;
      // Fußstellung folgt der Standposition (Drehung am Sprunggelenk, sonst wandert der Fuß)
      if (side) T.ankRy = ya; else T.ankLy = ya;
      if (side) { T.hipRx = hip; T.hipRz = abd; T.kneeR = -kn; T.ankR = -(hip - kn) - f.pitch; }
      else { T.hipLx = hip; T.hipLz = abd; T.kneeL = -kn; T.ankL = -(hip - kn) - f.pitch; }
    });
  }

  // Mundhöhle + Zahnreihen: sichtbar, wenn der Mund aufgeht; untere Reihe folgt dem Kiefer (Delta von "mouth-open")
  buildMouth(A, vi, headRest) {
    const g = blockGeometry(A, 'body', vi), P = g.attributes.position, M = g.morphAttributes.position;
    if (!M) return;
    const byName = (n) => M.find((a) => a.name === n);
    const open = byName('mouth-open'), elev = byName('mouth-elevation');
    // Unterlippe = größte Mund-auf-Bewegung nahe der Mitte, Oberlippe = größte Anhebung
    let lo = -1, loD = 0, up = -1, upD = 0;
    for (let i = 0; i < P.count; i++) {
      if (Math.abs(P.getX(i)) > 0.006) continue;
      const d1 = Math.hypot(open.getX(i), open.getY(i), open.getZ(i));
      const d2 = Math.hypot(elev.getX(i), elev.getY(i), elev.getZ(i));
      if (d1 > loD && P.getY(i) > P.getY(0) - 1) { loD = d1; lo = i; }
      if (d2 > upD) { upD = d2; up = i; }
    }
    if (lo < 0 || up < 0) return;
    const U = new THREE.Vector3().fromBufferAttribute(P, up), L = new THREE.Vector3().fromBufferAttribute(P, lo);
    // Unterlippe liegt knapp unter der Oberlippe; Kinn-Punkte (weit unten) meiden
    if (U.y - L.y > 0.05) L.set(U.x, U.y - 0.018, U.z - 0.004);
    const c = U.clone().add(L).multiplyScalar(0.5).sub(headRest);
    const cav = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ color: 0x2a0c0c, roughness: 0.9 }));
    cav.scale.set(0.024, 0.017, 0.022);
    cav.position.copy(c).add(new THREE.Vector3(0, -0.004, -0.026));
    this.head.add(cav);
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.35 });
    const row = (h) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, h, 18, 1, true, -0.85, 1.7), toothMat);
      t.material.side = THREE.DoubleSide;
      return t;
    };
    const upT = row(0.009);
    upT.position.copy(c).add(new THREE.Vector3(0, 0.002, -0.028));
    this.head.add(upT);
    const jaw = new THREE.Group();
    const loT = row(0.008);
    loT.position.copy(c).add(new THREE.Vector3(0, -0.008, -0.03));
    jaw.add(loT);
    this.head.add(jaw);
    this.jaw = { g: jaw, d: new THREE.Vector3(open.getX(lo), open.getY(lo), open.getZ(lo)).multiplyScalar(0.8) };
  }

  // Mimik: Zielgewichte je Einheit glätten, Blinzeln, Augen folgen dem Blickziel
  faceUpdate(dt, F, look) {
    if (!this.faceMeshes || !this.faceMeshes.length) return;
    // Blinzeln alle 2–5 s (bei geschlossenen Augen nicht nötig)
    this.blinkT -= dt;
    if (this.blinkT <= 0 && this.blinkP < 0) { this.blinkP = 0; this.blinkT = 2 + Math.random() * 3 + (Math.random() < 0.15 ? -1.8 : 0); }
    let blink = 0;
    if (this.blinkP >= 0) { this.blinkP += dt / 0.16; blink = Math.sin(Math.PI * Math.min(1, this.blinkP)); if (this.blinkP >= 1) this.blinkP = -1; }
    const W = this.faceW, k = 1 - Math.exp(-dt * 9);
    for (const u of this.exprNames) {
      let t = F[u] || 0;
      if (u === 'eye-left-closure' || u === 'eye-right-closure') { W[u] = Math.min(1, Math.max(t, blink)); continue; }
      W[u] = (W[u] || 0) + (t - (W[u] || 0)) * k;
    }
    for (const m of this.faceMeshes) {
      const dict = m.morphTargetDictionary, inf = m.morphTargetInfluences;
      for (const u of this.exprNames) if (dict[u] !== undefined) inf[dict[u]] = W[u] || 0;
    }
    if (this.jaw) this.jaw.g.position.copy(this.jaw.d).multiplyScalar(W['mouth-open'] || 0);
    // Augen: zum Ziel drehen (begrenzt), sonst leicht umherschauen
    if (this.eyeBalls) {
      let yaw = Math.sin(this.time * 0.37) * 0.12, pitch = Math.sin(this.time * 0.23) * 0.05;
      if (look) {
        this.head.updateWorldMatrix(true, false);
        const v = this._v.copy(look); this.head.worldToLocal(v);
        const e = this.eyeBalls[0].position;
        v.sub(e);
        yaw = Math.atan2(v.x, Math.max(0.05, v.z)); pitch = -Math.atan2(v.y, Math.hypot(v.x, v.z));
      }
      yaw = Math.max(-0.45, Math.min(0.45, yaw)); pitch = Math.max(-0.3, Math.min(0.3, pitch));
      for (const eb of this.eyeBalls) { eb.rotation.y += (yaw - eb.rotation.y) * Math.min(1, dt * 14); eb.rotation.x += (pitch - eb.rotation.x) * Math.min(1, dt * 14); }
    }
  }

  // Pose-Winkel (Modellraum-Achsen) auf das Skelett anwenden
  applyPose(q) {
    const R = (bone, x, y, z) => {
      const i = bone.userData.i;
      this._q.setFromEuler(this._e.set(x, y, z));
      bone.quaternion.copy(this.accInv[i]).multiply(this._q).multiply(this.accP[i]).multiply(this.corr[i]);
    };
    this.B.root.position.y = this.rootRestY + q.hipsY * this.scaleK;
    R(this.B.root, q.pelvisX || 0, q.pelvisY || 0, q.pelvisZ || 0);
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
    const L = (bone, x, z = 0, y = 0) => R(bone, -x, y, z);
    L(this.armL.sh, q.shLx, q.shLz);
    L(this.armR.sh, q.shRx, q.shRz);
    L(this.armL.elbow, q.elL);
    L(this.armR.elbow, q.elR);
    L(this.armL.hand, q.handLx);
    L(this.armR.hand, q.handRx);
    L(this.legL.hip, q.hipLx, q.hipLz, q.hipLy || 0);
    L(this.legR.hip, q.hipRx, q.hipRz, q.hipRy || 0);
    L(this.legL.knee, q.kneeL);
    L(this.legR.knee, q.kneeR);
    L(this.legL.ankle, q.ankL !== undefined ? q.ankL : -(q.hipLx + q.kneeL) * 0.8, 0, q.ankLy || 0);
    L(this.legR.ankle, q.ankR !== undefined ? q.ankR : -(q.hipRx + q.kneeR) * 0.8, 0, q.ankRy || 0);
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
    const F = { 'mouth-corner-puller': Math.max(0, this.mood + 0.1), 'mouth-open': 0.03 };
    if (cheer > 0) Object.assign(F, { 'mouth-corner-puller': 1, 'mouth-open': 0.6 + 0.25 * Math.sin(ph * 10 + this.phase), 'eyebrows-left-up': 0.5, 'eyebrows-right-up': 0.5 });
    this.faceUpdate(dt, F, look);
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
    const E = {
      '🔥': { 'mouth-corner-puller': 0.7, 'eyebrows-left-down': 0.4, 'eyebrows-right-down': 0.4, 'eye-left-slit': 0.3, 'eye-right-slit': 0.3 },
      '😂': { 'mouth-corner-puller': 1, 'mouth-open': 0.7, 'eye-left-slit': 0.7, 'eye-right-slit': 0.7, 'eyebrows-left-up': 0.3, 'eyebrows-right-up': 0.3 },
      '💪': { 'mouth-compression': 0.6, 'eyebrows-left-down': 0.6, 'eyebrows-right-down': 0.6, 'neck-platysma': 0.6 },
      '😤': { 'mouth-compression': 0.7, 'eyebrows-left-down': 1, 'eyebrows-right-down': 1, 'nose-left-elevation': 0.7, 'nose-right-elevation': 0.7 },
      '👑': { 'mouth-corner-puller': 0.55, 'eyebrows-left-up': 0.5, 'eye-left-slit': 0.25, 'eye-right-slit': 0.25 },
      '🥶': { 'mouth-retraction': 0.8, 'mouth-open': 0.25, 'eyebrows-left-inner-up': 0.8, 'eyebrows-right-inner-up': 0.8 },
      GG: { 'mouth-corner-puller': 0.8, 'eyebrows-left-up': 0.3, 'eyebrows-right-up': 0.3 },
      'Nochmal!': { 'mouth-open': 0.5, 'eyebrows-left-down': 0.7, 'eyebrows-right-down': 0.7, 'mouth-retraction': 0.3 },
    };
    this.emoteFace = E[text] || null;
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
