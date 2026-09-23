// Baut die Spielerfiguren aus den CC0-Daten von MakeHuman (https://github.com/makehumancommunity/makehuman).
// Ergebnis: public/assets/char/{char.bin, skin_mask.png, skin_pos.png, eye.png}
//
//   node tools/build-character.mjs /pfad/zu/makehuman/makehuman/data
//
// Schritte: Basis-Mesh laden → Körpervarianten über Morph-Targets → Skelett reduzieren + Gewichte →
// Kleidung aus der "tights"-Hilfshülle ableiten → Kopfhaut/Bart-Regionen → AO + Gesichtsmasken in UV backen.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const MH = process.argv[2] || '/home/user/makehumancommunity/makehuman/makehuman/data';
// MPFB2 (ebenfalls CC0) liefert zusätzliche Detail-Targets (Augen) und die Mimik-Einheiten
const MPFB = process.argv[3] || '/home/user/makehumancommunity/mpfb2/src/mpfb/data';
const OUT = path.resolve('public/assets/char');
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ------------------------------------------------------------------ OBJ
function parseObj(file) {
  const V = [], T = [], faces = [];
  let g = '';
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (l.startsWith('v ')) V.push(l.split(/\s+/).slice(1, 4).map(Number));
    else if (l.startsWith('vt ')) T.push(l.split(/\s+/).slice(1, 3).map(Number));
    else if (l.startsWith('g ')) g = l.slice(2).trim();
    else if (l.startsWith('f ')) {
      const parts = l.split(/\s+/).slice(1).filter(Boolean).map((p) => p.split('/').map((x) => parseInt(x) - 1));
      faces.push({ g, v: parts.map((p) => p[0]), t: parts.map((p) => p[1]) });
    }
  }
  return { V, T, faces };
}
const base = parseObj(`${MH}/3dobjs/base.obj`);
const NV = base.V.length;
log('Basis-Mesh', NV, 'Vertices,', base.faces.length, 'Faces');

// ------------------------------------------------------------------ Targets
const targetCache = new Map();
function loadTarget(rel) {
  if (targetCache.has(rel)) return targetCache.get(rel);
  const file = rel.startsWith('/') ? rel : fs.existsSync(`${MH}/targets/${rel}`) ? `${MH}/targets/${rel}` : `${MPFB}/targets/${rel}.gz`;
  if (!fs.existsSync(file)) throw new Error('Target fehlt: ' + rel);
  const out = [];
  const txt = file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)).toString('utf8') : fs.readFileSync(file, 'utf8');
  for (const l of txt.split('\n')) {
    if (!l || l[0] === '#') continue;
    const p = l.trim().split(/\s+/);
    if (p.length < 4) continue;
    out.push([+p[0], +p[1], +p[2], +p[3]]);
  }
  targetCache.set(rel, out);
  return out;
}

const lvl = (v, name) => {                 // min/average/max-Anteile wie in MakeHuman
  const max = Math.max(0, v * 2 - 1), min = Math.max(0, 1 - v * 2);
  return { [`min${name}`]: min, [`max${name}`]: max, [`average${name}`]: 1 - max - min };
};

function morph(cfg) {
  const P = new Float64Array(NV * 3);
  base.V.forEach((v, i) => { P[i * 3] = v[0]; P[i * 3 + 1] = v[1]; P[i * 3 + 2] = v[2]; });
  const add = (rel, w) => {
    if (w < 1e-4) return;
    for (const [i, dx, dy, dz] of loadTarget(rel)) { P[i * 3] += dx * w; P[i * 3 + 1] += dy * w; P[i * 3 + 2] += dz * w; }
  };
  const G = { male: cfg.gender, female: 1 - cfg.gender };
  const M = lvl(cfg.muscle, 'muscle'), W = lvl(cfg.weight, 'weight');
  const Hh = { maxheight: Math.max(0, cfg.height * 2 - 1), minheight: Math.max(0, 1 - cfg.height * 2) };
  const Pr = { idealproportions: Math.max(0, cfg.prop * 2 - 1), uncommonproportions: Math.max(0, 1 - cfg.prop * 2) };
  for (const [g, gw] of Object.entries(G)) {
    for (const [m, mw] of Object.entries(M)) {
      for (const [w, ww] of Object.entries(W)) {
        const f = gw * mw * ww;
        add(`macrodetails/universal-${g}-young-${m}-${w}.target`, f);
        for (const [h, hw] of Object.entries(Hh)) add(`macrodetails/height/${g}-young-${m}-${w}-${h}.target`, f * hw);
        for (const [p, pw] of Object.entries(Pr)) add(`macrodetails/proportions/${g}-young-${m}-${w}-${p}.target`, f * pw);
      }
    }
    for (const [race, rw] of Object.entries(cfg.race)) add(`macrodetails/${race}-${g}-young.target`, gw * rw);
  }
  for (const [rel, w] of Object.entries(cfg.extra || {})) add(rel, w);
  return P;
}

// Varianten: sportliche Spieler(innen) mit unterschiedlicher Herkunft, Größe und Statur
const VARIANTS = [
  { id: 'm_af', gender: 1, muscle: 0.86, weight: 0.5, height: 0.75, prop: 0.9, h: 1.99, race: { african: 0.92, caucasian: 0.08, asian: 0 } },
  { id: 'm_ca', gender: 1, muscle: 0.78, weight: 0.45, height: 0.7, prop: 0.85, h: 1.95, race: { african: 0, caucasian: 1, asian: 0 } },
  { id: 'm_as', gender: 1, muscle: 0.74, weight: 0.42, height: 0.62, prop: 0.85, h: 1.87, race: { african: 0, caucasian: 0.15, asian: 0.85 } },
  { id: 'm_mx', gender: 1, muscle: 0.82, weight: 0.52, height: 0.68, prop: 0.8, h: 1.93, race: { african: 0.45, caucasian: 0.4, asian: 0.15 } },
  { id: 'm_big', gender: 1, muscle: 0.95, weight: 0.66, height: 0.8, prop: 0.75, h: 2.04, race: { african: 0.7, caucasian: 0.3, asian: 0 } },
  { id: 'f_af', gender: 0, muscle: 0.72, weight: 0.45, height: 0.72, prop: 0.9, h: 1.84, race: { african: 0.85, caucasian: 0.15, asian: 0 } },
  { id: 'f_ca', gender: 0, muscle: 0.7, weight: 0.42, height: 0.66, prop: 0.9, h: 1.79, race: { african: 0, caucasian: 0.75, asian: 0.25 } },
  // Power-Forward: sehr groß, massiv, breites kantiges Gesicht (eigene, erfundene Figur)
  { id: 'm_king', gender: 1, muscle: 1.0, weight: 0.64, height: 0.85, prop: 0.8, h: 2.06, race: { african: 1, caucasian: 0, asian: 0 } },
];
// Gesichtszüge je Variante (MakeHuman-Detail-Targets; beidseitige werden gespiegelt gesetzt)
// Augen etwas weiter geöffnet, weniger Tränensäcke (wirkt wacher als das MakeHuman-Grundgesicht)
const FACE_EYES = { 'eyes/eye-height2-incr': 0.45, 'eyes/eye-bag-decr': 0.6, 'eyes/eye-bag-height-decr': 0.3, 'eyes/eye-eyefold-up': 0.25 };
const FACE_BASE_M = { 'chin/chin-width-incr': 0.3, 'chin/chin-prominent-incr': 0.25, 'cheek/cheek-bones-incr': 0.35, 'head/head-square': 0.25,
  'eyebrows/eyebrows-trans-up': 0.25, 'mouth/mouth-upperlip-volume-incr': 0.2, 'nose/nose-point-width-decr': 0.15, 'neck/neck-scale-horiz-incr': 0.2 };
const FACE_BASE_F = { 'head/head-oval': 0.45, 'cheek/cheek-bones-incr': 0.4, 'chin/chin-width-decr': 0.25, 'eyebrows/eyebrows-trans-up': 0.3,
  'mouth/mouth-lowerlip-volume-incr': 0.3, 'mouth/mouth-upperlip-volume-incr': 0.2, 'nose/nose-scale-horiz-decr': 0.2, 'nose/nose-point-up': 0.2 };
const FACE = {
  m_af: { 'nose/nose-flaring-incr': 0.35, 'mouth/mouth-lowerlip-volume-incr': 0.35, 'chin/chin-height-incr': 0.2 },
  m_ca: { 'nose/nose-hump-incr': 0.2, 'nose/nose-scale-horiz-decr': 0.2, 'chin/chin-cleft-incr': 0.3, 'head/head-rectangular': 0.3 },
  m_as: { 'cheek/cheek-bones-incr': 0.2, 'head/head-diamond': 0.25, 'nose/nose-base-up': 0.2 },
  m_mx: { 'nose/nose-flaring-incr': 0.2, 'mouth/mouth-lowerlip-volume-incr': 0.2, 'head/head-oval': 0.2 },
  m_big: { 'head/head-square': 0.35, 'chin/chin-width-incr': 0.3, 'head/head-fat-incr': 0.25 },
  f_af: { 'nose/nose-flaring-incr': 0.25, 'mouth/mouth-lowerlip-volume-incr': 0.2 },
  f_ca: { 'nose/nose-point-width-decr': 0.2 },
  m_king: { 'head/head-square': 0.55, 'chin/chin-width-incr': 0.45, 'chin/chin-prominent-incr': 0.35, 'chin/chin-height-incr': 0.25,
    'nose/nose-flaring-incr': 0.4, 'nose/nose-scale-horiz-incr': 0.25, 'mouth/mouth-lowerlip-volume-incr': 0.35, 'neck/neck-scale-horiz-incr': 0.5,
    'eyebrows/eyebrows-trans-down': 0.15 },
};
for (const v of VARIANTS) {
  v.extra = {
    'torso/torso-muscle-pectoral-incr.target': v.gender ? 0.45 : 0.1,
    'torso/torso-muscle-dorsi-incr.target': v.gender ? 0.55 : 0.2,
    'stomach/stomach-pregnant-decr.target': 0.4,
  };
  const face = { ...(v.gender ? FACE_BASE_M : FACE_BASE_F), ...FACE_EYES };
  for (const [k, w] of Object.entries(FACE[v.id] || {})) face[k] = (face[k] || 0) + w;
  for (const [k, w] of Object.entries(face)) {
    const [dir, name] = k.split('/');
    const has = (f) => fs.existsSync(`${MH}/targets/${dir}/${f}.target`) || fs.existsSync(`${MPFB}/targets/${dir}/${f}.target.gz`);
    const files = has(name) ? [name] : [`l-${name}`, `r-${name}`];
    for (const f of files) {
      if (!has(f)) { console.warn('fehlt:', dir, f); continue; }
      v.extra[`${dir}/${f}.target`] = Math.min(1, w);
    }
  }
}

// ------------------------------------------------------------------ Skelett
const SK = JSON.parse(fs.readFileSync(`${MH}/rigs/default.mhskel`, 'utf8'));
const FINGERS = [];
for (const s of ['L', 'R']) for (let f = 1; f <= 5; f++) for (let k = 1; k <= 3; k++) FINGERS.push(`finger${f}-${k}.${s}`);
const KEEP = ['root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head'];
for (const s of ['L', 'R']) KEEP.push(`clavicle.${s}`, `upperarm01.${s}`, `lowerarm01.${s}`, `wrist.${s}`, `upperleg01.${s}`, `lowerleg01.${s}`, `foot.${s}`);
KEEP.push(...FINGERS);
const keptIndex = new Map(KEEP.map((n, i) => [n, i]));
const keptAncestor = (name) => { let n = name; while (n && !keptIndex.has(n)) n = SK.bones[n].parent; return n || 'root'; };
const BONES = KEEP.map((n) => ({ name: n, parent: n === 'root' ? -1 : keptIndex.get(keptAncestor(SK.bones[n].parent)) }));
// Eltern müssen vor Kindern stehen
for (const b of BONES) if (b.parent >= 0 && b.parent >= keptIndex.get(b.name)) throw new Error('Reihenfolge ' + b.name);

const jointPos = (P, jname, scale, shift) => {
  const ids = SK.joints[jname];
  const p = [0, 0, 0];
  for (const i of ids) for (let k = 0; k < 3; k++) p[k] += P[i * 3 + k] / ids.length;
  return [p[0] * scale, p[1] * scale + shift, p[2] * scale];
};

// Gewichte: auf behaltene Knochen zusammenfassen, max. 4 je Vertex
const WJ = JSON.parse(fs.readFileSync(`${MH}/rigs/default_weights.mhw`, 'utf8')).weights;
const perVert = Array.from({ length: NV }, () => new Map());
for (const [bone, list] of Object.entries(WJ)) {
  const k = keptIndex.get(keptAncestor(bone));
  for (const [vi, w] of list) perVert[vi].set(k, (perVert[vi].get(k) || 0) + w);
}
const skinIdx = new Uint8Array(NV * 4), skinW = new Uint8Array(NV * 4);
for (let i = 0; i < NV; i++) {
  const top = [...perVert[i].entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((s, x) => s + x[1], 0) || 1;
  let acc = 0;
  top.forEach(([b, w], k) => {
    skinIdx[i * 4 + k] = b;
    const q = k === top.length - 1 ? Math.max(0, 255 - acc) : Math.min(255 - acc, Math.floor((w / sum) * 255 + 0.5));
    skinW[i * 4 + k] = q; acc += q;
  });
  if (!top.length) { skinIdx[i * 4] = 0; skinW[i * 4] = 255; }
}
const boneWeight = (vi, names) => {
  let s = 0;
  for (const n of names) { const k = keptIndex.get(n); for (let j = 0; j < 4; j++) if (skinIdx[vi * 4 + j] === k) s += skinW[vi * 4 + j] / 255; }
  return s;
};
log('Skelett', BONES.length, 'Knochen');

// ------------------------------------------------------------------ Mesh-Blöcke
const facesOf = (pred) => base.faces.filter(pred);
const tri = (f) => (f.v.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]]);

// Aus Faces (mit OBJ-UVs oder eigener UV-Funktion) einen Block mit eindeutigen Vertices bauen
function makeBlock(faces, uvFn) {
  const key = new Map(), orig = [], uv = [], index = [];
  const vert = (v, t, u) => {
    const k = uvFn ? `${v}|${u[0].toFixed(4)}` : `${v}/${t}`;
    if (key.has(k)) return key.get(k);
    const id = orig.length;
    orig.push(v);
    if (uvFn) uv.push(u[0], u[1]);
    else uv.push(base.T[t][0], base.T[t][1]);
    key.set(k, id);
    return id;
  };
  for (const f of faces) {
    for (const [a, b, c] of tri(f)) {
      const vs = [f.v[a], f.v[b], f.v[c]];
      let uvs = null;
      if (uvFn) {
        uvs = vs.map((v) => uvFn(v));
        // Naht bei u=0/1 (hinten): u der Ecken angleichen
        const us = uvs.map((u) => u[0]);
        if (Math.max(...us) - Math.min(...us) > 0.5) uvs = uvs.map(([u, w]) => [u < 0.5 ? u + 1 : u, w]);
      }
      index.push(vert(vs[0], f.t[a], uvs && uvs[0]), vert(vs[1], f.t[b], uvs && uvs[1]), vert(vs[2], f.t[c], uvs && uvs[2]));
    }
  }
  return { orig: Uint32Array.from(orig), uv: Float32Array.from(uv), index: Uint32Array.from(index), faces };
}

// Glatte Normalen je Original-Vertex über eine Face-Menge
function smoothNormals(P, faces) {
  const N = new Float64Array(NV * 3);
  for (const f of faces) {
    for (const [a, b, c] of tri(f)) {
      const i = f.v[a] * 3, j = f.v[b] * 3, k = f.v[c] * 3;
      const ux = P[j] - P[i], uy = P[j + 1] - P[i + 1], uz = P[j + 2] - P[i + 2];
      const vx = P[k] - P[i], vy = P[k + 1] - P[i + 1], vz = P[k + 2] - P[i + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const o of [i, j, k]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
    }
  }
  for (let i = 0; i < NV; i++) {
    const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
    N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l;
  }
  return N;
}

// Neutrale Referenz für Regionen/UVs: Mittelwert der männlichen Varianten wäre aufwendig → Basis-Mesh
const B = new Float64Array(NV * 3);
base.V.forEach((v, i) => { B[i * 3] = v[0]; B[i * 3 + 1] = v[1]; B[i * 3 + 2] = v[2]; });
const bx = (i) => B[i * 3], by = (i) => B[i * 3 + 1], bz = (i) => B[i * 3 + 2];
const BJ = (n) => jointPos(B, SK.bones[n].head, 1, 0);

const bodyFaces = facesOf((f) => f.g === 'body');
const body = makeBlock(bodyFaces);
// Index nur mit sichtbaren Dreiecken (verdeckte werden erst nach der Kleidungsauswahl bestimmt)
function visibleIndex(blk) {
  const out = [];
  for (let i = 0; i < blk.index.length; i += 3) {
    const a = blk.orig[blk.index[i]], b = blk.orig[blk.index[i + 1]], c = blk.orig[blk.index[i + 2]];
    if (covered[a] === 1 && covered[b] === 1 && covered[c] === 1) continue;
    out.push(blk.index[i], blk.index[i + 1], blk.index[i + 2]);
  }
  return Uint32Array.from(out);
}
log('Körper-Block', body.orig.length, 'Vertices,', body.index.length / 3, 'Dreiecke');

// Kleidung aus der Tights-Hülle
const tightsFaces = facesOf((f) => f.g.startsWith('helper-tights'));
const ARM_BONES = ['upperarm01.L', 'lowerarm01.L', 'wrist.L', 'upperarm01.R', 'lowerarm01.R', 'wrist.R', ...FINGERS];
const LEG_BONES = ['upperleg01.L', 'lowerleg01.L', 'foot.L', 'upperleg01.R', 'lowerleg01.R', 'foot.R'];
const yNeck = BJ('neck01')[1], yHip = BJ('upperleg01.L')[1], yKnee = BJ('lowerleg01.L')[1];
const ySpine3 = BJ('spine03')[1], yShoulder = BJ('upperarm01.L')[1], yClav = BJ('clavicle.L')[1];
const faceAll = (f, fn) => f.v.every(fn);
const faceCenter = (f) => {
  const c = [0, 0, 0];
  for (const v of f.v) { c[0] += bx(v); c[1] += by(v); c[2] += bz(v); }
  return c.map((x) => x / f.v.length);
};
// Schnittfeld (dm, >0 = Stoff): glatte Armausschnitte, Halsausschnitt und Saum statt Treppenkanten
const SH_L = BJ('upperarm01.L');
const ell = (p, c, r) => {
  const q = Math.hypot((p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]);
  return (q - 1) * Math.min(...r);
};
const yHem = yHip - 0.95;
const BP = (v) => [bx(v), by(v), bz(v)];
// Armloch: Ellipsoid seitlich am Rumpf (tief ausgeschnitten wie beim Basketball-Trikot), Träger bleibt auf der Schulter
const armC = [SH_L[0] + 0.02, SH_L[1] - 0.25, SH_L[2] + 0.05], armR = [0.64, 1.1, 0.72];
function jerseyFieldP(p) {
  const dArm = Math.min(ell(p, armC, armR), ell(p, [-armC[0], armC[1], armC[2]], armR));
  const dNeck = ell(p, [0, yNeck - 0.02, 0.62], [0.78, 0.95, 1.0]);
  const dBack = ell(p, [0, yNeck + 0.35, -0.15], [0.72, 0.5, 0.85]);
  return Math.min(dArm, dNeck, dBack, p[1] - yHem);
}
const jerseyField = (v) => jerseyFieldP(BP(v));
const yShortsTop = yHip + 1.1, yShortsHem = yKnee + 0.1;      // Bund auf der Hüfte, Saum knapp übers Knie
const shortsFieldP = (p) => Math.min(yShortsTop - p[1], p[1] - yShortsHem);
const shortsField = (v) => shortsFieldP(BP(v));
const jerseyFaces = tightsFaces.filter((f) => {
  const [, y] = faceCenter(f);
  if (y < yHem - 0.5 || y > yNeck + 0.6) return false;
  if (f.v.every((v) => boneWeight(v, ARM_BONES) > 0.8)) return false;
  return Math.max(...f.v.map(jerseyField)) > -0.12;
});
const shortsFaces = tightsFaces.filter((f) => {
  if (f.v.some((v) => boneWeight(v, ARM_BONES) > 0.3)) return false;
  return Math.max(...f.v.map(shortsField)) > -0.12;
});
// Welche Körper-Faces liegen sicher unter Trikot/Shorts oder im Schuh? → werden nicht gezeichnet
const tightsVerts = [...new Set(tightsFaces.flatMap((f) => f.v))];
const covered = new Uint8Array(NV);
for (const f of facesOf((f) => f.g === 'body')) for (const v of f.v) {
  if (covered[v]) continue;
  let best = -1, bd = Infinity;
  for (const t of tightsVerts) {
    const d = (bx(v) - bx(t)) ** 2 + (by(v) - by(t)) ** 2 + (bz(v) - bz(t)) ** 2;
    if (d < bd) { bd = d; best = t; }
  }
  const inside = bd < 0.4 * 0.4 && (jerseyField(best) > 0.45 || shortsField(best) > 0.45) && boneWeight(best, ARM_BONES) < 0.5;
  covered[v] = inside ? 1 : 2;
  if (boneWeight(v, ['foot.L', 'foot.R']) > 0.6) covered[v] = 1;
}
const cyl = (cx, cz, y0, y1) => (v) => [0.5 + Math.atan2(bx(v) - cx, bz(v) - cz) / (Math.PI * 2), (y0 - by(v)) / (y0 - y1)];
// Unterteilung (jede Kante halbiert): neue Vertices = Mittelpunkt zweier Eltern, Position je Variante
// als PN-Mittelpunkt (kubische Hermite-Kurve über die Normalen) → runde Silhouette, feine Schnittkanten
function subdivide(blk, levels) {
  const parents = Array.from(blk.orig, () => null);
  const uv = Array.from(blk.uv);
  let index = Array.from(blk.index);
  for (let l = 0; l < levels; l++) {
    const em = new Map(), ni = [];
    const mid = (a, b) => {
      const k = a < b ? a * 1e6 + b : b * 1e6 + a;
      let id = em.get(k);
      if (id === undefined) {
        id = parents.length; parents.push([a, b]); em.set(k, id);
        uv.push((uv[a * 2] + uv[b * 2]) / 2, (uv[a * 2 + 1] + uv[b * 2 + 1]) / 2);
      }
      return id;
    };
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t], b = index[t + 1], c = index[t + 2];
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      ni.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    index = ni;
  }
  // Basis-Positionen (für Schnittfeld) und Gewichte der neuen Vertices
  const base0 = [], wts = [];
  parents.forEach((pr, i) => {
    if (!pr) {
      const v = blk.orig[i];
      base0.push(BP(v));
      const m = new Map(); for (let k = 0; k < 4; k++) if (skinW[v * 4 + k]) m.set(skinIdx[v * 4 + k], skinW[v * 4 + k] / 255);
      wts.push(m);
    } else {
      const [a, b] = pr;
      base0.push([0, 1, 2].map((k) => (base0[a][k] + base0[b][k]) / 2));
      const m = new Map(wts[a]); for (const [bn, w] of wts[b]) m.set(bn, (m.get(bn) || 0) + w);
      for (const [bn, w] of m) m.set(bn, w / 2);
      wts.push(m);
    }
  });
  return { ...blk, parents, n0: blk.orig.length, count: parents.length, uv: Float32Array.from(uv), index: Uint32Array.from(index), basePos: base0, wts };
}
const jersey = subdivide(makeBlock(jerseyFaces, cyl(0, 0.35, yNeck + 0.6, yHem)), 1);
const shorts = subdivide(makeBlock(shortsFaces, cyl(0, 0.35, yShortsTop, yShortsHem)), 1);
log('Trikot', jersey.count, 'V, Shorts', shorts.count, 'V (unterteilt)');
if (process.env.DUMP_FIELD) {
  const pts = jersey.basePos.map((q) => [...q, jerseyFieldP(q)]);
  const bodyPts = [...new Set(bodyFaces.flatMap((f) => f.v))].filter((v, k) => k % 3 === 0).map((v) => [bx(v), by(v), bz(v)]);
  fs.writeFileSync(process.env.DUMP_FIELD, JSON.stringify({ pts, bodyPts, J: { SH_L, yNeck, yHip, yKnee, ySpine3, yClav } }));
  process.exit(0);
}

// Kopfhaut (für Frisuren) und Bartregion: Körper-Faces am Kopf
const HC = [0, 7.35, 0.35];                       // Kopfmitte (Basis-Mesh, dm)
const headW = (v) => boneWeight(v, ['head']);
const azim = (x, z) => Math.atan2(x, z - HC[2]);  // 0 = vorne
function hairlineY(x, z) {
  const a = Math.abs(azim(x, z));
  const pts = [[0, 7.96], [0.45, 7.92], [0.75, 7.82], [1.0, 7.7], [1.2, 7.52], [1.38, 7.1], [1.55, 7.45], [1.85, 7.55], [2.3, 7.05], [Math.PI, 6.85]];
  for (let k = 1; k < pts.length; k++) if (a <= pts[k][0]) { const t = (a - pts[k - 1][0]) / (pts[k][0] - pts[k - 1][0]); return pts[k - 1][1] + t * (pts[k][1] - pts[k - 1][1]); }
  return 6.85;
}
const scalpFaces = bodyFaces.filter((f) => faceAll(f, (v) => headW(v) > 0.5) && f.v.every((v) => by(v) > hairlineY(bx(v), bz(v)) - 0.45));
const sph = (v) => [0.5 + Math.atan2(bx(v), bz(v) - HC[2]) / (Math.PI * 2), Math.acos(Math.max(-1, Math.min(1, (by(v) - HC[1]) / Math.hypot(bx(v), by(v) - HC[1], bz(v) - HC[2])))) / Math.PI];
const scalp = makeBlock(scalpFaces, sph);
// Hairline-Abstand je Scalp-Vertex (dm, positiv = im Haar)
const scalpLine = Float32Array.from(scalp.orig, (v) => by(v) - hairlineY(bx(v), bz(v)));
const mouthC = [0, 6.66, 1.5];
const beardFaces = bodyFaces.filter((f) => f.v.every((v) => {
  const x = bx(v), y = by(v), z = bz(v);
  if (headW(v) < 0.3 && y > 6.2) return false;
  if (z < -0.1 || y > 7.05 || y < 5.95) return false;
  if (Math.abs(azim(x, z)) > 1.45) return false;
  const lips = ((x / 0.3) ** 2 + ((y - mouthC[1]) / 0.2) ** 2) < 1 && z > 1.2;
  const nose = y > 6.78 && Math.abs(x) < 0.26 && z > 1.2;
  return !lips && !nose;
}));
const beard = makeBlock(beardFaces, sph);
log('Kopfhaut', scalp.orig.length, 'V, Bart', beard.orig.length, 'V');

// Wimpern
const lashFaces = facesOf((f) => f.g.includes('eyelashes'));
const lashes = makeBlock(lashFaces);
// Eigene UVs für eine prozedurale Wimpern-Textur: u = entlang des Lids, v = Wurzel (0) → Spitze (1)
{
  const up = (i) => lashes.uv[i * 2 + 1] < 0.955;
  const rng = { true: [Infinity, -Infinity, Infinity, -Infinity], false: [Infinity, -Infinity, Infinity, -Infinity] };
  for (let i = 0; i < lashes.orig.length; i++) {
    const r = rng[up(i)], u = lashes.uv[i * 2], v = lashes.uv[i * 2 + 1];
    r[0] = Math.min(r[0], u); r[1] = Math.max(r[1], u); r[2] = Math.min(r[2], v); r[3] = Math.max(r[3], v);
  }
  const uv = new Float32Array(lashes.uv.length);
  for (let i = 0; i < lashes.orig.length; i++) {
    const U = up(i), r = rng[U], u = lashes.uv[i * 2], v = lashes.uv[i * 2 + 1];
    const t = (v - r[2]) / (r[3] - r[2] || 1);
    uv[i * 2] = ((u - r[0]) / (r[1] - r[0] || 1)) * 0.5 + (U ? 0 : 0.5);   // oben: linke Hälfte, unten: rechte Hälfte
    uv[i * 2 + 1] = U ? t : 1 - t;
  }
  lashes.uv = uv;
  log('Wimpern-UV oben', rng.true.map((x) => x.toFixed(3)).join('/'), 'unten', rng.false.map((x) => x.toFixed(3)).join('/'));
}

// Augen (High-Poly, CC0) – auf die Augen-Hilfsgeometrie der Variante gesetzt
const eyeObj = parseObj(`${MH}/eyes/high-poly/high-poly.obj`);
const eyeFaces = eyeObj.faces.filter((f) => eyeObj.V[f.v[0]][0] > 0);   // linkes Auge, rechtes wird gespiegelt
const eyeKey = new Map(), eyePos = [], eyeUv = [], eyeIdx = [], corneaIdx = [];
// Hornhaut (UV im hellblauen Kreis unten rechts der Textur) wird eine eigene, transparente Schicht
const isCornea = (f) => f.t.every((t) => Math.hypot(eyeObj.T[t][0] - 0.935, eyeObj.T[t][1] - 0.065) < 0.08);
for (const f of eyeFaces) for (const [a, b, c] of tri(f)) for (const k of [a, b, c]) {
  const kk = `${f.v[k]}/${f.t[k]}`;
  if (!eyeKey.has(kk)) { eyeKey.set(kk, eyePos.length / 3); eyePos.push(...eyeObj.V[f.v[k]]); eyeUv.push(...eyeObj.T[f.t[k]]); }
  (isCornea(f) ? corneaIdx : eyeIdx).push(eyeKey.get(kk));
}
log('Auge', eyeIdx.length / 3, 'Dreiecke, Hornhaut', corneaIdx.length / 3);
// Mittelpunkt = Mitte der Bounding-Box (der Vertex-Schwerpunkt liegt wegen der dichten Iris zu weit vorn)
const ecObj = [0, 0, 0]; let erObj = 0;
for (let k = 0; k < 3; k++) {
  let mn = Infinity, mx = -Infinity;
  for (let i = k; i < eyePos.length; i += 3) { mn = Math.min(mn, eyePos[i]); mx = Math.max(mx, eyePos[i]); }
  ecObj[k] = (mn + mx) / 2;
}
for (let i = 0; i < eyePos.length; i += 3) erObj = Math.max(erObj, Math.hypot(eyePos[i] - ecObj[0], eyePos[i + 1] - ecObj[1], eyePos[i + 2] - ecObj[2]));
const eyeLocal = Float32Array.from(eyePos, (v, i) => (v - ecObj[i % 3]) / erObj);   // Einheitskugel
const helperEye = (P, s) => {
  const ids = []; base.faces.filter((f) => f.g === `helper-${s}-eye`).forEach((f) => ids.push(...f.v));
  const u = [...new Set(ids)];
  const c = [0, 0, 0]; for (const i of u) for (let k = 0; k < 3; k++) c[k] += P[i * 3 + k] / u.length;
  let r = 0; for (const i of u) r = Math.max(r, Math.hypot(P[i * 3] - c[0], P[i * 3 + 1] - c[1], P[i * 3 + 2] - c[2]));
  return { c, r };
};

// ------------------------------------------------------------------ Varianten berechnen
const variants = [];
const blocks = { body, jersey, shorts, scalp, beard, lashes };
for (const cfg of VARIANTS) {
  const P = morph(cfg);
  let minY = Infinity, maxY0 = -Infinity;
  for (const f of bodyFaces) for (const v of f.v) { minY = Math.min(minY, P[v * 3 + 1]); maxY0 = Math.max(maxY0, P[v * 3 + 1]); }
  // Auf realistische Körpergröße normieren (Proportionen bleiben)
  const SCALE = cfg.h / ((maxY0 - minY) * 0.1) * 0.1;
  const shift = -minY * SCALE + 0.022;                 // Fußsohle + Schuhsohle
  const Nb = smoothNormals(P, bodyFaces);
  const Nt = smoothNormals(P, tightsFaces);
  const Nl = smoothNormals(P, lashFaces);           // Wimpern gehören nicht zum Körper → eigene Normalen (sonst 0 → NaN im Shader)
  // Kleidung aufblähen: Trikot locker, Shorts weit
  const inflate = (blk, fn) => {
    const n = blk.count || blk.orig.length;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
    blk.orig.forEach((v, i) => {
      const off = fn(v);
      for (let k = 0; k < 3; k++) {
        pos[i * 3 + k] = (P[v * 3 + k] + Nt[v * 3 + k] * off) * SCALE + (k === 1 ? shift : 0);
        nrm[i * 3 + k] = Nt[v * 3 + k];
      }
    });
    if (blk.parents) for (let i = blk.n0; i < n; i++) {
      const [a, b] = blk.parents[i];
      const A = [0, 1, 2].map((k) => pos[a * 3 + k]), Bq = [0, 1, 2].map((k) => pos[b * 3 + k]);
      const na = [0, 1, 2].map((k) => nrm[a * 3 + k]), nb = [0, 1, 2].map((k) => nrm[b * 3 + k]);
      const e = [0, 1, 2].map((k) => Bq[k] - A[k]);
      const da = e[0] * na[0] + e[1] * na[1] + e[2] * na[2], db = e[0] * nb[0] + e[1] * nb[1] + e[2] * nb[2];
      const nm = [0, 1, 2].map((k) => na[k] + nb[k]), l = Math.hypot(...nm) || 1;
      for (let k = 0; k < 3; k++) {
        pos[i * 3 + k] = (A[k] + Bq[k]) / 2 + (db * nb[k] - da * na[k]) / 8;
        nrm[i * 3 + k] = nm[k] / l;
      }
    }
    return { pos, nrm };
  };
  const smooth01 = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const out = { id: cfg.id, gender: cfg.gender, shift, scale: SCALE, race: cfg.race, blocks: {} };
  for (const [name, blk] of Object.entries(blocks)) {
    let data;
    // Versatz in dm entlang der Hüllen-Normalen: Trikot unten lockerer, Shorts zum Knie hin weiter
    if (name === 'jersey') data = inflate(blk, (v) => 0.18 + 0.34 * smooth01(ySpine3 + 1.6, ySpine3 - 0.2, by(v)) + 0.1 * smooth01(ySpine3 - 0.2, yHem, by(v)));   // Brust anliegend, ab Taille locker und gerade fallend
    else if (name === 'shorts') data = inflate(blk, (v) => 0.3 + 0.5 * smooth01(yHip - 0.3, yShortsHem, by(v)));   // weite, lange Hosenbeine
    else {
      const pos = new Float32Array(blk.orig.length * 3), nrm = new Float32Array(blk.orig.length * 3);
      const N = name === 'lashes' ? Nl : Nb;
      blk.orig.forEach((v, i) => {
        for (let k = 0; k < 3; k++) {
          pos[i * 3 + k] = P[v * 3 + k] * SCALE + (k === 1 ? shift : 0);
          nrm[i * 3 + k] = N[v * 3 + k];
        }
      });
      data = { pos, nrm };
    }
    out.blocks[name] = data;
  }
  // Gelenke
  out.joints = BONES.map((b) => jointPos(P, SK.bones[b.name].head, SCALE, shift));
  out.tails = BONES.map((b) => jointPos(P, SK.bones[b.name].tail, SCALE, shift));
  const eL = helperEye(P, 'l'), eR = helperEye(P, 'r');
  out.eyes = [eL, eR].map((e) => ({ c: [e.c[0] * SCALE, e.c[1] * SCALE + shift, e.c[2] * SCALE], r: e.r * SCALE }));
  let maxY = -Infinity; for (const f of bodyFaces) for (const v of f.v) maxY = Math.max(maxY, P[v * 3 + 1]);
  out.height = maxY * SCALE + shift;
  variants.push(out);
  log('Variante', cfg.id, 'Größe', out.height.toFixed(2), 'm');
}

// ------------------------------------------------------------------ AO (Raycasting mit BVH) auf dem Körper
function buildBVH(P, faces) {
  const tris = [];
  for (const f of faces) for (const [a, b, c] of tri(f)) tris.push([f.v[a], f.v[b], f.v[c]]);
  const T = tris.map((t) => {
    const p = t.map((v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
    const mn = [0, 1, 2].map((k) => Math.min(p[0][k], p[1][k], p[2][k])), mx = [0, 1, 2].map((k) => Math.max(p[0][k], p[1][k], p[2][k]));
    return { p, mn, mx, c: [0, 1, 2].map((k) => (mn[k] + mx[k]) / 2) };
  });
  const build = (items) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const t of items) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], t.mn[k]); mx[k] = Math.max(mx[k], t.mx[k]); }
    if (items.length <= 8) return { mn, mx, items };
    const ax = [0, 1, 2].reduce((a, k) => (mx[k] - mn[k] > mx[a] - mn[a] ? k : a), 0);
    items.sort((a, b) => a.c[ax] - b.c[ax]);
    const h = items.length >> 1;
    return { mn, mx, l: build(items.slice(0, h)), r: build(items.slice(h)) };
  };
  return build(T);
}
function rayHit(node, o, d, maxT) {
  // Slab-Test
  let t0 = 0, t1 = maxT;
  for (let k = 0; k < 3; k++) {
    const inv = 1 / d[k];
    let a = (node.mn[k] - o[k]) * inv, b = (node.mx[k] - o[k]) * inv;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  if (node.items) {
    for (const t of node.items) {
      const [p0, p1, p2] = t.p;
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
      const a = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
      if (Math.abs(a) < 1e-9) continue;
      const f = 1 / a, s = [o[0] - p0[0], o[1] - p0[1], o[2] - p0[2]];
      const u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
      if (u < 0 || u > 1) continue;
      const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
      const v = f * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]);
      if (v < 0 || u + v > 1) continue;
      const t2 = f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]);
      if (t2 > 1e-4 && t2 < maxT) return true;
    }
    return false;
  }
  return rayHit(node.l, o, d, maxT) || rayHit(node.r, o, d, maxT);
}
const refP = morph(VARIANTS[0]);
const refN = smoothNormals(refP, bodyFaces);
const bvh = buildBVH(refP, bodyFaces);
const AO = new Float32Array(NV).fill(1);
const RAYS = 40;
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const used = new Set(); bodyFaces.forEach((f) => f.v.forEach((v) => used.add(v)));
for (const v of used) {
  const n = [refN[v * 3], refN[v * 3 + 1], refN[v * 3 + 2]];
  const o = [refP[v * 3] + n[0] * 0.01, refP[v * 3 + 1] + n[1] * 0.01, refP[v * 3 + 2] + n[2] * 0.01];
  // Tangentenbasis
  const up = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let tx = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]];
  const tl = Math.hypot(...tx); tx = tx.map((x) => x / tl);
  const ty = [n[1] * tx[2] - n[2] * tx[1], n[2] * tx[0] - n[0] * tx[2], n[0] * tx[1] - n[1] * tx[0]];
  let hits = 0;
  for (let r = 0; r < RAYS; r++) {
    const u1 = rand(), u2 = rand();
    const rr = Math.sqrt(u1), th = 2 * Math.PI * u2;
    const a = rr * Math.cos(th), b = rr * Math.sin(th), c = Math.sqrt(1 - u1);
    const d = [tx[0] * a + ty[0] * b + n[0] * c, tx[1] * a + ty[1] * b + n[1] * c, tx[2] * a + ty[2] * b + n[2] * c];
    if (rayHit(bvh, o, d, 2.5)) hits++;
  }
  AO[v] = 1 - hits / RAYS;
}
log('AO berechnet');

// ------------------------------------------------------------------ Masken in UV backen
let TEX = 1024;
function rasterizeAt(size, blk, shade, channels, vattr) { const t = TEX; TEX = size; try { return rasterize(blk, shade, channels, vattr); } finally { TEX = t; } }
function rasterize(blk, shade, channels = 4, vattr = null) {
  const img = new Float32Array(TEX * TEX * channels);
  const cov = new Uint8Array(TEX * TEX);
  const zb = blk.depth ? new Float32Array(TEX * TEX).fill(-Infinity) : null;   // äußerste Fläche gewinnt
  const idx = blk.index;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const P = [a, b, c].map((k) => [blk.uv[k * 2] * TEX, (1 - blk.uv[k * 2 + 1]) * TEX]);
    const O = [a, b, c].map((k) => blk.orig[k]);
    const minx = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), maxx = Math.min(TEX - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const miny = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), maxy = Math.min(TEX - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    const den = (P[1][1] - P[2][1]) * (P[0][0] - P[2][0]) + (P[2][0] - P[1][0]) * (P[0][1] - P[2][1]);
    if (Math.abs(den) < 1e-9) continue;
    for (let y = miny; y <= maxy; y++) {
      for (let x = minx; x <= maxx; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((P[1][1] - P[2][1]) * (px - P[2][0]) + (P[2][0] - P[1][0]) * (py - P[2][1])) / den;
        const w1 = ((P[2][1] - P[0][1]) * (px - P[2][0]) + (P[0][0] - P[2][0]) * (py - P[2][1])) / den;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
        if (zb) {
          const z = blk.depth[a] * w0 + blk.depth[b] * w1 + blk.depth[c] * w2;
          if (z <= zb[y * TEX + x]) continue;
          zb[y * TEX + x] = z;
        }
        const pos = [0, 1, 2].map((k) => B[O[0] * 3 + k] * w0 + B[O[1] * 3 + k] * w1 + B[O[2] * 3 + k] * w2);
        const ao = AO[O[0]] * w0 + AO[O[1]] * w1 + AO[O[2]] * w2;
        const val = shade(pos, ao, vattr ? vattr[O[0]] * w0 + vattr[O[1]] * w1 + vattr[O[2]] * w2 : 0);
        const o = (y * TEX + x) * channels;
        for (let k = 0; k < channels; k++) img[o + k] = val[k];
        cov[y * TEX + x] = 1;
      }
    }
  }
  if (zb) blk.zbuf = zb;
  // Ränder erweitern (gegen Nähte)
  for (let pass = 0; pass < 6; pass++) {
    const next = cov.slice();
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
      if (cov[y * TEX + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= TEX || ny >= TEX || !cov[ny * TEX + nx]) continue;
        for (let k = 0; k < channels; k++) img[(y * TEX + x) * channels + k] = img[(ny * TEX + nx) * channels + k];
        next[y * TEX + x] = 1;
        break;
      }
    }
    cov.set(next);
  }
  return img;
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const eyeLc = helperEye(B, 'l').c;
function faceMasks([x, y, z], ao) {
  const ax = Math.abs(x);
  // Lippen: Ellipse um den Mund, vorne
  const lx = x / 0.27, ly = (y - 6.66) / (y > 6.66 ? 0.13 : 0.16);
  const lips = z > 1.25 ? 1 - smooth(0.75, 1.05, Math.hypot(lx, ly)) : 0;
  // Augenbrauen: Bogen über den Augen
  const t = (ax - 0.07) / 0.5;
  const browY = 7.56 + Math.sin(Math.max(0, Math.min(1, t)) * Math.PI * 0.85) * 0.07;
  const thick = 0.05 * (1 - 0.55 * Math.max(0, t));
  let brow = 0;
  if (t > 0 && t < 1.05 && z > 1.0) brow = (1 - smooth(thick * 0.6, thick * 1.2, Math.abs(y - browY))) * (1 - smooth(0.9, 1.05, t)) * smooth(0, 0.08, t);
  // Bartschatten (Kiefer, Kinn, Oberlippe) – ohne Lippen
  const az = Math.abs(azim(x, z));
  let stub = 0;
  if (y < 6.98 && y > 6.12 && az < 1.5 && z > -0.1) {
    stub = smooth(1.5, 1.2, az) * smooth(6.12, 6.35, y + (az > 0.6 ? 0 : (1.2 - z) * 0.15)) * (1 - smooth(6.82, 6.98, y));
    if (y > 6.8 && ax < 0.3) stub *= smooth(6.95, 6.85, y);           // Nase frei
    stub *= 1 - lips;
    const cheekTop = 6.85 - (az - 0.4) * 0.5;
    if (az > 0.45 && y > cheekTop) stub *= 1 - smooth(cheekTop, cheekTop + 0.12, y);
  }
  // Kopfhaut (gemalte kurze Haare), weicher Haaransatz
  const hl = hairlineY(x, z);
  const scalp = headLike(x, y, z) ? smooth(hl - 0.08, hl + 0.06, y) : 0;
  return [ao, lips, brow, scalp, stub];
}
const headLike = (x, y, z) => y > 6.6 && Math.hypot(x, (y - HC[1]) * 0.8, z - HC[2]) < 1.35;

// Arm-Gewicht je Vertex (für gemalte Ärmel bei Zuschauer-Kleidung)
const armW = Float32Array.from({ length: NV }, (_, v) => Math.min(1, boneWeight(v, ARM_BONES)));
const maskImg = rasterize(body, (p, ao, arm) => [...faceMasks(p, ao), arm], 6, armW);
// PNG 1: R=AO, G=Lippen, B=Brauen, A=Kopfhaut
// PNG 2: R/G/B = Position (für Socken, Tattoos, Sleeves zur Laufzeit), A = Bartschatten
const bb = { min: [-5.2, -8.3, -1.3], max: [5.2, 8.6, 3.4] };
const posImg = rasterize(body, (p) => p.map((v, k) => (v - bb.min[k]) / (bb.max[k] - bb.min[k])), 3);
// Keine Daten im Alpha-Kanal (Browser multiplizieren Alpha vor → RGB ginge verloren)
const pngA = new Uint8Array(TEX * TEX * 4), pngB = new Uint8Array(TEX * TEX * 4), pngP = new Uint8Array(TEX * TEX * 4);
const c255 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
for (let i = 0; i < TEX * TEX; i++) {
  pngA[i * 4] = c255(maskImg[i * 6]); pngA[i * 4 + 1] = c255(maskImg[i * 6 + 1]); pngA[i * 4 + 2] = c255(maskImg[i * 6 + 2]);
  pngB[i * 4] = c255(maskImg[i * 6 + 3]); pngB[i * 4 + 1] = c255(maskImg[i * 6 + 4]); pngB[i * 4 + 2] = c255(maskImg[i * 6 + 5]);
  for (let k = 0; k < 3; k++) pngP[i * 4 + k] = c255(posImg[i * 3 + k]);
  pngA[i * 4 + 3] = pngB[i * 4 + 3] = pngP[i * 4 + 3] = 255;
}
function writePNG(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}
writePNG(`${OUT}/skin_a.png`, TEX, TEX, pngA);
writePNG(`${OUT}/skin_b.png`, TEX, TEX, pngB);
writePNG(`${OUT}/skin_pos.png`, TEX, TEX, pngP);
// ---- Hochauflösende Gesichtstextur: eigene UV (Zylinder um den Kopf, vorne gedehnt) nur für Kopf/Hals-Vertices.
// fw = Überblendgewicht (1 = Gesichtstextur, 0 = normale Hauttextur), damit am Rand keine Naht entsteht.
const FY0 = 5.75, FY1 = 8.75, FA = 2.3;
const faceU = new Float32Array(body.orig.length * 2), faceW = new Float32Array(body.orig.length);
body.orig.forEach((v, j) => {
  const a = azim(bx(v), bz(v)), y = by(v);
  const t = Math.sign(a) * Math.pow(Math.min(1, Math.abs(a) / FA), 0.8);
  faceU[j * 2] = 0.5 + 0.5 * t;
  faceU[j * 2 + 1] = 1 - (FY1 - y) / (FY1 - FY0);
  const inside = Math.min(1, (FA - Math.abs(a)) / 0.35, (y - FY0) / 0.3, (FY1 - y) / 0.2);
  faceW[j] = Math.max(0, Math.min(1, inside)) * (boneWeight(v, ARM_BONES) < 0.1 ? 1 : 0);
});
const faceTris = [];
for (let i = 0; i < body.index.length; i += 3) {
  const t = [body.index[i], body.index[i + 1], body.index[i + 2]];
  if (t.some((j) => faceW[j] > 0)) faceTris.push(...t);
}
// Tiefe = Abstand von der Kopfachse: Innenflächen (Mundhöhle, Lidinnenseiten) überdecken die Haut nicht
const faceDepth = Float32Array.from(body.orig, (v) => Math.hypot(bx(v), bz(v) - HC[2]) + Math.max(0, by(v) - 8.0));
const faceBlk = { orig: body.orig, uv: faceU, index: faceTris, depth: faceDepth };
const FTEX = 1024;
const TEX0 = TEX;
const fMask = rasterizeAt(FTEX, faceBlk, (p, ao) => [...faceMasks(p, ao), 0], 6);
// verdeckte Vertices (liegen deutlich hinter der äußersten Fläche) bekommen die normale Hauttextur
{
  const zb = faceBlk.zbuf;
  let hidden = 0;
  body.orig.forEach((v, j) => {
    if (!faceW[j]) return;
    const x = Math.min(FTEX - 1, Math.max(0, Math.floor(faceU[j * 2] * FTEX))), y = Math.min(FTEX - 1, Math.max(0, Math.floor((1 - faceU[j * 2 + 1]) * FTEX)));
    if (zb[y * FTEX + x] - faceDepth[j] > 0.06) { faceW[j] = 0; hidden++; }
  });
  log('Gesicht: verdeckte Vertices', hidden);
}
const fPos = rasterizeAt(FTEX, faceBlk, (p) => p.map((v, k) => (v - bb.min[k]) / (bb.max[k] - bb.min[k])), 3);
// weiche Maskenränder (Bartschatten, Brauen): Box-Blur in Texturraum
function blurChannel(img, size, ch, stride, r) {
  const tmp = new Float32Array(size * size);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let sum = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = pass ? x : x + k, yy = pass ? y + k : y;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        sum += img[(yy * size + xx) * stride + ch]; n++;
      }
      tmp[y * size + x] = sum / n;
    }
    for (let i = 0; i < size * size; i++) img[i * stride + ch] = tmp[i];
  }
}
blurChannel(fMask, FTEX, 4, 6, 10);
blurChannel(fMask, FTEX, 2, 6, 2);
const fA = new Uint8Array(FTEX * FTEX * 4), fB = new Uint8Array(FTEX * FTEX * 4), fP = new Uint8Array(FTEX * FTEX * 4);
for (let i = 0; i < FTEX * FTEX; i++) {
  fA[i * 4] = c255(fMask[i * 6]); fA[i * 4 + 1] = c255(fMask[i * 6 + 1]); fA[i * 4 + 2] = c255(fMask[i * 6 + 2]);
  fB[i * 4] = c255(fMask[i * 6 + 3]); fB[i * 4 + 1] = c255(fMask[i * 6 + 4]);
  for (let k = 0; k < 3; k++) fP[i * 4 + k] = c255(fPos[i * 3 + k]);
  fA[i * 4 + 3] = fB[i * 4 + 3] = fP[i * 4 + 3] = 255;
}
writePNG(`${OUT}/face_a.png`, FTEX, FTEX, fA);
writePNG(`${OUT}/face_b.png`, FTEX, FTEX, fB);
writePNG(`${OUT}/face_pos.png`, FTEX, FTEX, fP);
log('Gesichtstextur', FTEX, 'px,', faceTris.length / 3, 'Dreiecke');
for (const old of ['skin_mask.png']) if (fs.existsSync(`${OUT}/${old}`)) fs.unlinkSync(`${OUT}/${old}`);
fs.copyFileSync(`${MH}/eyes/materials/brown_eye.png`, `${OUT}/eye.png`);
log('Texturen geschrieben');

// ------------------------------------------------------------------ Binärdatei
const parts = [];
const header = { version: 1, license: 'CC0 – abgeleitet aus MakeHuman (makehumancommunity/makehuman)', bones: BONES, bbox: bb, variants: [], blocks: {}, eye: {} };
let offset = 0;
const push = (arr) => {
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  parts.push(buf);
  const desc = { o: offset, n: arr.length, t: arr.constructor.name };
  offset += buf.length;
  return desc;
};
const q16 = (f) => Int16Array.from(f, (v) => Math.round(v * 13000));        // Positionen in m (±2,5 m)
const q8 = (f) => Int8Array.from(f, (v) => Math.round(v * 127));
for (const [name, blk] of Object.entries(blocks)) {
  const n = blk.count || blk.orig.length;
  const skI = new Uint8Array(n * 4), skW = new Uint8Array(n * 4);
  if (blk.wts) blk.wts.forEach((m, i) => {
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s, x) => s + x[1], 0) || 1;
    let acc = 0;
    top.forEach(([bn, w], k) => { const q = k === top.length - 1 ? Math.max(0, 255 - acc) : Math.min(255 - acc, Math.floor((w / sum) * 255 + 0.5)); skI[i * 4 + k] = bn; skW[i * 4 + k] = q; acc += q; });
  });
  else blk.orig.forEach((v, i) => { for (let k = 0; k < 4; k++) { skI[i * 4 + k] = skinIdx[v * 4 + k]; skW[i * 4 + k] = skinW[v * 4 + k]; } });
  const big = n > 65535;
  header.blocks[name] = {
    count: n,
    index: push(big ? blk.index : Uint16Array.from(blk.index)),
    uv: push(blk.uv), skinIndex: push(skI), skinWeight: push(skW),
  };
}
header.blocks.scalp.line = push(scalpLine);
header.blocks.jersey.cut = push(Float32Array.from(jersey.basePos, jerseyFieldP));
header.blocks.shorts.cut = push(Float32Array.from(shorts.basePos, shortsFieldP));
const vis = visibleIndex(body);
header.blocks.body.visible = push(Uint16Array.from(vis));
header.blocks.body.faceUv = push(faceU);
header.blocks.body.faceW = push(faceW);
log('Körper sichtbar', vis.length / 3, 'von', body.index.length / 3, 'Dreiecken');
for (const v of variants) {
  const vd = { id: v.id, gender: v.gender, height: v.height, scale: v.scale, race: v.race, joints: v.joints, tails: v.tails, eyes: v.eyes, blocks: {} };
  for (const [name, d] of Object.entries(v.blocks)) vd.blocks[name] = { pos: push(q16(d.pos)), nrm: push(q8(d.nrm)) };
  header.variants.push(vd);
}
// Mimik-Einheiten (MPFB2, CC0): je Herkunft dünn besetzte Deltas auf dem Basis-Mesh (dm)
const EXPR = [
  'mouth-open', 'mouth-corner-puller', 'mouth-depression', 'mouth-compression', 'mouth-retraction', 'mouth-elevation', 'mouth-pursing',
  'eyebrows-left-up', 'eyebrows-right-up', 'eyebrows-left-down', 'eyebrows-right-down', 'eyebrows-left-inner-up', 'eyebrows-right-inner-up',
  'eye-left-closure', 'eye-right-closure', 'eye-left-slit', 'eye-right-slit', 'nose-left-elevation', 'nose-right-elevation', 'neck-platysma',
];
header.expr = { names: EXPR, races: ['african', 'asian', 'caucasian'], units: {} };
let exprN = 0;
for (const u of EXPR) {
  header.expr.units[u] = {};
  for (const r of header.expr.races) {
    const t = loadTarget(`${MPFB}/targets/expression/units/${r}/${u}.target.gz`).filter(([i]) => i < NV);
    header.expr.units[u][r] = { idx: push(Uint16Array.from(t, (x) => x[0])), d: push(Int16Array.from(t.flatMap((x) => [x[1], x[2], x[3]]), (v) => Math.round(v * 4000))) };
    exprN += t.length;
  }
}
// Gesichtsform-Achsen (MakeHuman-Detail-Targets): je Achse ein "+" und ein "-" Delta, zur Laufzeit pro Spieler gemischt
const SHAPE = {
  noseW: ['nose/nose-scale-horiz-incr', 'nose/nose-scale-horiz-decr'],
  noseL: ['nose/nose-scale-vert-incr', 'nose/nose-scale-vert-decr'],
  noseTip: ['nose/nose-point-width-incr', 'nose/nose-point-width-decr'],
  noseHump: ['nose/nose-hump-incr', 'nose/nose-hump-decr'],
  mouthW: ['mouth/mouth-scale-horiz-incr', 'mouth/mouth-scale-horiz-decr'],
  lipLo: ['mouth/mouth-lowerlip-volume-incr', 'mouth/mouth-lowerlip-volume-decr'],
  lipUp: ['mouth/mouth-upperlip-volume-incr', 'mouth/mouth-upperlip-volume-decr'],
  chinW: ['chin/chin-width-incr', 'chin/chin-width-decr'],
  chinP: ['chin/chin-prominent-incr', 'chin/chin-prominent-decr'],
  chinH: ['chin/chin-height-incr', 'chin/chin-height-decr'],
  cheeks: [['cheek/l-cheek-bones-incr', 'cheek/r-cheek-bones-incr'], ['cheek/l-cheek-bones-decr', 'cheek/r-cheek-bones-decr']],
  brows: ['eyebrows/eyebrows-trans-up', 'eyebrows/eyebrows-trans-down'],
  ears: [['ears/l-ear-scale-incr', 'ears/r-ear-scale-incr'], ['ears/l-ear-scale-decr', 'ears/r-ear-scale-decr']],
};
header.shape = { axes: Object.keys(SHAPE), units: {} };
const sparse = (list) => {
  const m = new Map();
  for (const rel of [].concat(list)) for (const [i, dx, dy, dz] of loadTarget(rel + '.target')) {
    if (i >= NV) continue;
    const o = m.get(i) || [0, 0, 0]; o[0] += dx; o[1] += dy; o[2] += dz; m.set(i, o);
  }
  const ks = [...m.keys()];
  return { idx: push(Uint16Array.from(ks)), d: push(Int16Array.from(ks.flatMap((k) => m.get(k)), (v) => Math.round(v * 4000))) };
};
for (const [ax, [plus, minus]] of Object.entries(SHAPE)) header.shape.units[ax] = { p: sparse(plus), m: sparse(minus) };
log('Gesichtsform', Object.keys(SHAPE).length, 'Achsen');
for (const n of ['body', 'lashes', 'beard']) header.blocks[n].orig = push(Uint16Array.from(blocks[n].orig));
log('Mimik', EXPR.length, 'Einheiten,', exprN, 'Deltas');
header.eye = { pos: push(eyeLocal), uv: push(Float32Array.from(eyeUv)), index: push(Uint16Array.from(eyeIdx)), cornea: push(Uint16Array.from(corneaIdx)) };
const hjson = Buffer.from(JSON.stringify(header));
const hl = Buffer.alloc(4); hl.writeUInt32LE(hjson.length);
const pre = Buffer.concat([hl, hjson]);
const prePad = Buffer.alloc((4 - (pre.length % 4)) % 4);
fs.writeFileSync(`${OUT}/char.bin`, Buffer.concat([pre, prePad, ...parts]));
fs.writeFileSync(`${OUT}/LICENSE.txt`, 'Die Figuren-Daten in diesem Ordner wurden aus Assets von MakeHuman erzeugt\n(https://github.com/makehumancommunity/makehuman) und MPFB2 (https://github.com/makehumancommunity/mpfb2),\ndie unter CC0 1.0 veröffentlicht sind.\nDie abgeleiteten Daten stehen ebenfalls unter CC0 1.0.\n');
log('char.bin', ((pre.length + offset) / 1024).toFixed(0), 'KB');

