// Bausteine für die detaillierten Spielerfiguren: Haut-Schläuche (Skinning), Kopf, Haare, Hände, Schuhe, Texturen
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvas, speckle } from './textures.js';

// ------------------------------------------------------------------ Skin-Schlauch
// rings (oben → unten): { c:[x,y,z], rx, rz, w:[[boneIndex, weight], ...], yOff?(angle) }
// Winkel a = π + t·2π  →  u = 0.5 ist vorne (+z), die Naht liegt hinten.
export function tube(rings, { seg = 22, u0 = 0, u1 = 1, v0 = 0, v1 = 1 } = {}) {
  const n = rings.length, cols = seg + 1;
  const pos = [], uv = [], si = [], sw = [], idx = [];
  const L = [0];
  for (let i = 1; i < n; i++) {
    const a = rings[i - 1].c, b = rings[i].c;
    L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const total = L[n - 1] || 1;
  rings.forEach((r, i) => {
    const ws = [...r.w].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = ws.reduce((s, x) => s + x[1], 0) || 1;
    for (let j = 0; j < cols; j++) {
      const t = j / seg, a = Math.PI + t * Math.PI * 2;
      const yo = r.yOff ? r.yOff(a) : 0;
      pos.push(r.c[0] + Math.sin(a) * r.rx, r.c[1] + yo, r.c[2] + Math.cos(a) * r.rz);
      uv.push(u0 + (u1 - u0) * t, v0 + (v1 - v0) * (L[i] / total));
      for (let k = 0; k < 4; k++) { si.push(ws[k] ? ws[k][0] : 0); sw.push(ws[k] ? ws[k][1] / sum : 0); }
    }
  });
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const A = i * cols + j, B = A + 1, D = A + cols, C = D + 1;
      idx.push(A, D, B, B, D, C);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nr = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    const a = i * cols, b = a + seg;
    const v = new THREE.Vector3(nr.getX(a) + nr.getX(b), nr.getY(a) + nr.getY(b), nr.getZ(a) + nr.getZ(b)).normalize();
    nr.setXYZ(a, v.x, v.y, v.z); nr.setXYZ(b, v.x, v.y, v.z);
  }
  return g;
}

export function merge(list) {
  const geos = list.map((g) => {
    let x = g.index ? g.toNonIndexed() : g.clone();
    x.clearGroups();
    for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) x.deleteAttribute(k);
    if (!x.attributes.uv) x.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
    return x;
  });
  return mergeGeometries(geos, false);
}

// Geometrie mit Transformation versehen (für das Zusammenführen starrer Teile)
export function placed(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s),
  );
  return geo.clone().applyMatrix4(m);
}

// ------------------------------------------------------------------ Kopf
export const HEAD_R = 0.107;

// Einheitskugel → Kopfform (Kiefer, Kinn, flaches Gesicht, Hinterkopf, Stirnbogen, Wangenknochen)
export function deformHead(x, y, z, shape = 0) {
  const ox = x;
  x *= 0.86 + shape * 0.03; y *= 1.05; z *= 1.0;
  if (y < -0.15) {
    const t = Math.min(1, (-0.15 - y) / 0.85);
    x *= 1 - t * (0.36 - shape * 0.08);
    z = z > 0 ? z * (1 - t * 0.1) + t * 0.045 : z * (1 - t * 0.5);
  }
  if (z > 0.55) z = 0.55 + (z - 0.55) * 0.5;
  if (z < -0.2 && y > -0.3) z *= 1.07;
  z += Math.exp(-((y - 0.27) ** 2) / 0.006) * Math.max(0, z - 0.35) * 0.14;          // Stirnbogen
  x += Math.sign(ox) * Math.exp(-((y + 0.02) ** 2) / 0.012) * Math.exp(-((Math.abs(ox) - 0.55) ** 2) / 0.03) * Math.max(0, z) * 0.07; // Wangenknochen
  return [x, y, z];
}

export function headPoint(dx, dy, dz, scale = 1, shape = 0) {
  const l = Math.hypot(dx, dy, dz) || 1;
  const [x, y, z] = deformHead(dx / l, dy / l, dz / l, shape);
  return new THREE.Vector3(x * HEAD_R * scale, y * HEAD_R * scale, z * HEAD_R * scale);
}

export function headGeometry(shape) {
  const g = new THREE.SphereGeometry(1, 56, 40);
  deformGeo(g, 1, shape);
  return g;
}

function deformGeo(g, scale, shape) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const l = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) || 1;
    const [x, y, z] = deformHead(p.getX(i) / l, p.getY(i) / l, p.getZ(i) / l, shape);
    p.setXYZ(i, x * HEAD_R * scale, y * HEAD_R * scale, z * HEAD_R * scale);
  }
  g.computeVertexNormals();
  return g;
}

// Kappe auf dem Kopf (für Haare), nach hinten gekippt → Haaransatz vorne höher
export function capGeometry(scale, thetaLen, tilt, shape) {
  const g = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, thetaLen);
  g.rotateX(tilt);
  return deformGeo(g, scale, shape);
}

// Richtung → Pixel auf der Kopftextur (SphereGeometry-UV)
function dirToPx(dx, dy, dz, W, H) {
  const l = Math.hypot(dx, dy, dz) || 1;
  const x = dx / l, y = dy / l, z = dz / l;
  let u = Math.atan2(z, -x) / (Math.PI * 2);
  if (u < 0) u += 1;
  return [u * W, (Math.acos(Math.max(-1, Math.min(1, y))) / Math.PI) * H];
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

// Gesichtstextur: Hautschattierung, Lippen, Augenhöhlen, gemalte Frisuren, Bartschatten
export function faceTexture({ skin, hairColor, painted, stubble, lip }) {
  const W = 1024, H = 512;
  const c = makeCanvas(W, H, (g) => {
    g.fillStyle = skin; g.fillRect(0, 0, W, H);
    speckle(g, W, H, 14000, 0.035, '255,230,210', '60,30,20', 2);
    // Kinn/Hals etwas dunkler, Stirn heller
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(255,240,225,.10)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(0.8, 'rgba(40,20,10,.14)'); gr.addColorStop(1, 'rgba(40,20,10,.3)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const blob = (dir, rx, ry, col) => {
      const [x, y] = dirToPx(...dir, W, H);
      const rg = g.createRadialGradient(x, y, 0, x, y, rx);
      rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
      g.fillStyle = rg; g.fillRect(x - rx, y - rx, rx * 2, rx * 2);
      g.restore();
    };
    // Wangen, Augenhöhlen, Nasenschatten
    for (const s of [-1, 1]) {
      blob([s * 0.55, -0.1, 0.83], 60, 45, 'rgba(190,80,60,.13)');
      blob([s * 0.34, 0.14, 0.93], 34, 20, 'rgba(40,15,10,.2)');
    }
    blob([0, -0.2, 0.98], 20, 14, 'rgba(40,15,10,.18)');
    // Lippen
    const [lx, ly] = dirToPx(0, -0.36, 0.93, W, H);
    // Nasolabialfalten und Kinnschatten
    g.strokeStyle = 'rgba(60,25,15,.22)'; g.lineWidth = 5;
    for (const sd of [-1, 1]) {
      const [ax, ay] = dirToPx(sd * 0.2, -0.12, 0.97, W, H), [bx, by] = dirToPx(sd * 0.25, -0.33, 0.93, W, H);
      g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(ax + sd * 10, (ay + by) / 2, bx, by); g.stroke();
    }
    blob([0, -0.55, 0.83], 40, 16, 'rgba(40,15,10,.2)');
    // Lippen: Oberlippe (Amorbogen) + Unterlippe
    g.fillStyle = shade(lip, 0.9);
    g.beginPath();
    g.moveTo(lx - 44, ly); g.quadraticCurveTo(lx - 22, ly - 15, lx - 6, ly - 11); g.lineTo(lx, ly - 8); g.lineTo(lx + 6, ly - 11);
    g.quadraticCurveTo(lx + 22, ly - 15, lx + 44, ly); g.closePath(); g.fill();
    g.fillStyle = lip;
    g.beginPath(); g.moveTo(lx - 42, ly); g.quadraticCurveTo(lx, ly + 24, lx + 42, ly); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.beginPath(); g.ellipse(lx, ly + 9, 14, 4, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(35,8,8,.85)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(lx - 44, ly); g.quadraticCurveTo(lx, ly + 3, lx + 44, ly); g.stroke();
    // Wimpernlinie / Lidschatten
    for (const sd of [-1, 1]) {
      const [ex, ey] = dirToPx(sd * 0.36, 0.16, 0.92, W, H);
      g.fillStyle = 'rgba(30,12,8,.35)';
      g.beginPath(); g.ellipse(ex, ey - 10, 30, 9, 0, 0, Math.PI * 2); g.fill();
    }

    // Bartschatten
    if (stubble) {
      for (let i = 0; i < 9000; i++) {
        const a = (Math.random() - 0.5) * 1.8, e = -0.15 - Math.random() * 0.75;
        const dx = Math.sin(a), dz = Math.cos(a);
        if (e > -0.28 && Math.abs(a) < 0.35) continue; // über der Oberlippe frei
        const [x, y] = dirToPx(dx * Math.cos(e), Math.sin(e), dz * Math.cos(e), W, H);
        g.fillStyle = `rgba(20,14,10,${0.08 + Math.random() * 0.18})`;
        g.fillRect(x, y, 2, 2);
      }
    }

    // Gemalte Frisuren (Buzz, Fade, Waves)
    if (painted) {
      const col = hairColor;
      const hl = (du) => { // Haaransatz (v) abhängig vom Winkel zur Gesichtsmitte
        const a = Math.abs(du);
        const pts = [[0, 0.3], [0.1, 0.33], [0.15, 0.4], [0.19, 0.52], [0.22, 0.44], [0.3, 0.46], [0.5, 0.63]];
        for (let k = 1; k < pts.length; k++) {
          if (a <= pts[k][0]) { const t = (a - pts[k - 1][0]) / (pts[k][0] - pts[k - 1][0]); return pts[k - 1][1] + t * (pts[k][1] - pts[k - 1][1]); }
        }
        return 0.63;
      };
      for (let x = 0; x < W; x += 2) {
        let du = x / W - 0.25; if (du > 0.5) du -= 1; if (du < -0.5) du += 1;
        const v = hl(du) * H;
        const side = Math.min(1, Math.max(0, (Math.abs(du) - 0.1) / 0.1));
        if (painted === 'fade' && side > 0) {
          const fg = g.createLinearGradient(0, 0, 0, v);
          fg.addColorStop(0, col); fg.addColorStop(0.55, col); fg.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = fg;
          g.globalAlpha = 0.95;
        } else {
          g.fillStyle = col;
          g.globalAlpha = painted === 'buzz' ? 0.9 : 0.97;
        }
        g.fillRect(x, 0, 2, v);
      }
      g.globalAlpha = 1;
      // Haarstruktur
      for (let i = 0; i < 26000; i++) {
        const x = Math.random() * W;
        let du = x / W - 0.25; if (du > 0.5) du -= 1; if (du < -0.5) du += 1;
        const y = Math.random() * hl(du) * H;
        g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.07)';
        g.fillRect(x, y, 2, 2);
      }
      if (painted === 'waves') {
        g.strokeStyle = 'rgba(255,255,255,.13)'; g.lineWidth = 3;
        for (let r = 20; r < 260; r += 14) {
          g.beginPath();
          for (let x = 0; x <= W; x += 8) {
            const y = H * 0.02 + r * 0.55 + Math.sin(x / 22 + r) * 4;
            x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
          }
          g.stroke();
        }
      }
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function hairTexture(color, kind = 'strands') {
  const W = 256, H = 256;
  const draw = (g, bump) => {
    g.fillStyle = bump ? '#808080' : color; g.fillRect(0, 0, W, H);
    if (kind === 'cornrows') {
      for (let x = 0; x < W; x += 16) {
        g.fillStyle = bump ? '#202020' : 'rgba(0,0,0,.6)';
        g.fillRect(x, 0, 3, H);                                   // Scheitel zwischen den Zöpfen
        for (let y = 0; y < H; y += 8) {
          g.strokeStyle = bump ? '#ffffff' : 'rgba(255,255,255,.12)'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(x + 4, y); g.lineTo(x + 9, y + 5); g.lineTo(x + 14, y); g.stroke();
        }
      }
    } else if (kind === 'coil') {
      for (let i = 0; i < 5000; i++) {
        g.strokeStyle = bump ? `rgba(255,255,255,${Math.random()})` : `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.12})`;
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 2 + Math.random() * 3, 0, Math.PI * 2); g.stroke();
      }
    } else {
      for (let i = 0; i < 4500; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        g.strokeStyle = bump ? `rgba(255,255,255,${Math.random() * 0.8})` : `rgba(${Math.random() < 0.6 ? '0,0,0' : '255,255,255'},${Math.random() * 0.14})`;
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 4, y + 6 + Math.random() * 10); g.stroke();
      }
    }
  };
  const map = new THREE.CanvasTexture(makeCanvas(W, H, (g) => draw(g, false)));
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(makeCanvas(W, H, (g) => draw(g, true)));
  for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); }
  return { map, bump };
}

// ------------------------------------------------------------------ Hände
// Hand hängt vom Handgelenk (y=0) nach unten; Handfläche zeigt zur Körpermitte.
export function handGeometry(side) {
  const inward = -side;             // Richtung Körpermitte (x)
  const parts = [];
  const palm = new THREE.CapsuleGeometry(0.03, 0.045, 4, 10);
  parts.push(placed(palm, { p: [0, -0.05, 0.004], s: [0.5, 1, 1.18] }));
  const fingers = [[0.026, 0.074], [0.009, 0.081], [-0.009, 0.077], [-0.025, 0.062]];
  for (const [z, len] of fingers) {
    let p = new THREE.Vector3(0, -0.085, z);
    let ang = 0;
    const segs = [0.42, 0.33, 0.25];
    for (let k = 0; k < 3; k++) {
      const l = len * segs[k];
      ang += [0.25, 0.4, 0.35][k];
      const dir = new THREE.Vector3(Math.sin(ang) * inward, -Math.cos(ang), 0);
      const mid = p.clone().addScaledVector(dir, l / 2);
      const g = new THREE.CapsuleGeometry(0.0085 - k * 0.0008, Math.max(0.001, l - 0.012), 3, 8);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
      parts.push(g.applyMatrix4(m));
      p.addScaledVector(dir, l);
    }
  }
  // Daumen
  let p = new THREE.Vector3(inward * 0.008, -0.03, 0.035);
  let dir = new THREE.Vector3(inward * 0.35, -0.7, 0.62).normalize();
  for (let k = 0; k < 2; k++) {
    const l = k ? 0.03 : 0.035;
    const g = new THREE.CapsuleGeometry(0.0105 - k * 0.001, l - 0.012, 3, 8);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    parts.push(g.applyMatrix4(new THREE.Matrix4().compose(p.clone().addScaledVector(dir, l / 2), q, new THREE.Vector3(1, 1, 1))));
    p.addScaledVector(dir, l);
    dir = new THREE.Vector3(inward * 0.55, -0.75, 0.35).normalize();
  }
  return merge(parts);
}

// ------------------------------------------------------------------ Schuhe
function footShape(scale = 1) {
  const s = new THREE.Shape();
  const P = (x, y) => [x * scale, y * scale];
  s.moveTo(...P(0, -0.075));
  s.bezierCurveTo(...P(0.042, -0.075), ...P(0.05, -0.04), ...P(0.052, 0.0));
  s.bezierCurveTo(...P(0.056, 0.06), ...P(0.062, 0.11), ...P(0.058, 0.15));
  s.bezierCurveTo(...P(0.054, 0.205), ...P(0.02, 0.215), ...P(-0.004, 0.214));
  s.bezierCurveTo(...P(-0.04, 0.212), ...P(-0.056, 0.18), ...P(-0.055, 0.13));
  s.bezierCurveTo(...P(-0.052, 0.07), ...P(-0.046, 0.02), ...P(-0.046, -0.02));
  s.bezierCurveTo(...P(-0.046, -0.06), ...P(-0.035, -0.075), ...P(0, -0.075));
  return s;
}

function extrudeFoot(scale, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(footShape(scale), {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 16,
  });
  g.rotateX(Math.PI / 2);   // Form-y → vorne (+z), Extrusion nach unten
  return g;
}

// Liefert Geometrien je Material für einen Schuh (relativ zum Knöchel)
export function shoeGeometry() {
  const top = 0.018;
  // Sohle + Zwischensohle
  const sole = extrudeFoot(1.02, 0.014, 0.004);
  sole.translate(0, top - 0.046, 0);
  const mid = extrudeFoot(1.0, 0.018, 0.005);
  mid.translate(0, top - 0.028, 0);
  // Obermaterial: nach vorne flacher
  const upper = extrudeFoot(0.94, 0.07, 0.014);
  upper.translate(0, top + 0.05, 0);
  const p = upper.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i);
    const base = top - 0.03;
    if (y > base) {
      const f = 1 - 0.62 * THREE.MathUtils.smoothstep(z, 0.0, 0.2);
      p.setY(i, base + (y - base) * f);
    }
  }
  upper.computeVertexNormals();
  // Kragen, Zunge, Fersenkappe
  const collar = placed(new THREE.TorusGeometry(0.044, 0.013, 8, 20), { p: [0, top + 0.05, -0.01], r: [Math.PI / 2 + 0.2, 0, 0], s: [1, 1.15, 1] });
  const tongue = placed(new THREE.BoxGeometry(0.05, 0.06, 0.012), { p: [0, top + 0.055, 0.035], r: [-0.5, 0, 0] });
  const heel = placed(new THREE.CylinderGeometry(0.047, 0.05, 0.045, 16, 1, true, Math.PI * 0.6, Math.PI * 0.8), { p: [0, top + 0.0, -0.028] });
  // Schnürsenkel
  const laces = [];
  for (let k = 0; k < 5; k++) {
    const z = 0.02 + k * 0.022;
    const y = top + 0.046 - k * 0.0085;
    laces.push(placed(new THREE.BoxGeometry(0.046 - k * 0.002, 0.004, 0.006), { p: [0, y, z], r: [-0.35, 0, 0] }));
  }
  // Seitenlogo (geschwungener Streifen)
  const logos = [];
  for (const sx of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.05, top + 0.004, -0.05), new THREE.Vector3(sx * 0.055, top - 0.006, 0.03),
      new THREE.Vector3(sx * 0.054, top + 0.012, 0.1), new THREE.Vector3(sx * 0.046, top + 0.03, 0.15),
    ]);
    logos.push(new THREE.TubeGeometry(curve, 16, 0.0045, 5, false));
  }
  // Etwas schmaler und kürzer, Sohle bleibt am Boden
  const fit = (g) => g.scale(0.86, 0.94, 0.88).translate(0, -0.003, 0.004);
  return {
    upper: fit(merge([upper, collar, tongue])),
    sole: fit(merge([sole])),
    mid: fit(merge([mid, ...laces])),
    accent: fit(merge([heel, ...logos])),
  };
}

// ------------------------------------------------------------------ Textur-Helfer
export function canvasTexture(W, H, draw, { flipY = true, srgb = true, repeat } = {}) {
  const t = new THREE.CanvasTexture(makeCanvas(W, H, draw));
  t.flipY = flipY;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
