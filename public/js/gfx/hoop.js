// Korb: Schwanenhals-Mast, Glasbrett mit Rahmen, Ring mit Halterung und ein verformbares Netz
import * as THREE from 'three';
import { HOOP, BOARD, BALL_R } from '/shared/constants.js';
import { canvasTex } from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const NET_N = 12;       // Aufhängepunkte
const NET_R = 8;        // Ebenen
const NET_DEPTH = 0.44;

export function buildHoop(scene, ball) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x8d96a0, metalness: 0.85, roughness: 0.32 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x1d2128, metalness: 0.7, roughness: 0.4 });
  const cast = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  // Fundament + Mast
  const base = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.12, 24), new THREE.MeshStandardMaterial({ color: 0x5c6068, roughness: 0.95 })));
  base.position.set(0, 0.06, -1.25);
  const pole = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 3.1, 20), steel));
  pole.position.set(0, 1.55, -1.25);
  const pad = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.8, 20), new THREE.MeshStandardMaterial({ color: 0xd4501c, roughness: 0.6 })));
  pad.position.set(0, 1.0, -1.25);
  const padTop = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 24), new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.6 }));
  padTop.rotation.x = Math.PI / 2; padTop.position.set(0, 1.9, -1.25);
  // Schwanenhals
  const neckCurve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 3.05, -1.25), new THREE.Vector3(0, 3.75, -1.25),
    new THREE.Vector3(0, 3.7, 0.45), new THREE.Vector3(0, 3.45, BOARD.z - BOARD.thick - 0.06),
  );
  const neck = cast(new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 40, 0.095, 16, false), steel));
  // Streben
  const strut = (a, b, r = 0.03) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = cast(new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), steel));
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  };
  const back = BOARD.z - BOARD.thick - 0.05;
  const s1 = strut(new THREE.Vector3(0, 2.75, -1.2), new THREE.Vector3(-0.22, 3.28, back));
  const s2 = strut(new THREE.Vector3(0, 2.75, -1.2), new THREE.Vector3(0.22, 3.28, back));
  const mount = cast(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.04), darkSteel));
  mount.position.set(0, 3.42, back);

  // Glasbrett
  const bw = BOARD.x1 - BOARD.x0, bh = BOARD.y1 - BOARD.y0;
  const cy = (BOARD.y0 + BOARD.y1) / 2, cz = BOARD.z - BOARD.thick / 2;
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(bw, bh, BOARD.thick * 0.5),
    new THREE.MeshPhysicalMaterial({
      color: 0xdff4ff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.22,
      clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.2, depthWrite: false,
    }),
  );
  glass.position.set(0, cy, cz);
  glass.renderOrder = 2;
  const lines = new THREE.Mesh(
    new THREE.PlaneGeometry(bw, bh),
    new THREE.MeshBasicMaterial({
      map: canvasTex(512, 300, (c, w, h) => {
        c.clearRect(0, 0, w, h);
        c.strokeStyle = '#ffffff'; c.lineWidth = 12; c.strokeRect(8, 8, w - 16, h - 16);
        const sw = w * (0.59 / bw), sh = h * (0.45 / bh);
        c.strokeStyle = '#ff5a1f'; c.lineWidth = 10;
        c.strokeRect(w / 2 - sw / 2, h - h * ((HOOP.y - BOARD.y0 + 0.02) / bh) - sh + 10, sw, sh);
        c.fillStyle = 'rgba(255,255,255,.55)';
        c.font = '800 22px system-ui, sans-serif'; c.textAlign = 'center';
        c.fillText('NIGHT COURT', w / 2, 44);
      }),
      transparent: true, depthWrite: false,
    }),
  );
  lines.position.set(0, cy, BOARD.z + 0.002);
  lines.renderOrder = 3;
  // Rahmen
  const frameMat = darkSteel;
  const bar = (w, h, x, y) => { const m = cast(new THREE.Mesh(new THREE.BoxGeometry(w, h, BOARD.thick + 0.02), frameMat)); m.position.set(x, y, cz); return m; };
  const f1 = bar(bw + 0.06, 0.04, 0, BOARD.y1 + 0.01);
  const f2 = bar(0.04, bh, BOARD.x0 - 0.01, cy);
  const f3 = bar(0.04, bh, BOARD.x1 + 0.01, cy);
  const padB = cast(new THREE.Mesh(new THREE.BoxGeometry(bw + 0.08, 0.07, BOARD.thick + 0.08), new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.7 })));
  padB.position.set(0, BOARD.y0 - 0.025, cz);

  // Ring + Halterung
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xff4812, metalness: 0.55, roughness: 0.3, emissive: 0x3a0c00 });
  const rimG = new THREE.Group();
  rimG.position.set(HOOP.x, HOOP.y, HOOP.z);
  const rim = cast(new THREE.Mesh(new THREE.TorusGeometry(HOOP.r, 0.019, 12, 56), rimMat));
  rim.rotation.x = Math.PI / 2;
  rimG.add(rim);
  const plate = cast(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.02), rimMat));
  plate.position.set(0, -0.04, BOARD.z + 0.012 - HOOP.z);
  const arm = cast(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, HOOP.z - BOARD.z - HOOP.r + 0.02), rimMat));
  arm.position.set(0, -0.005, (BOARD.z - HOOP.z - HOOP.r) / 2 + 0.005);
  for (const sx of [-1, 1]) {
    const brace = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), rimMat));
    brace.position.set(sx * 0.07, -0.06, BOARD.z - HOOP.z + 0.07);
    brace.rotation.x = -0.9;
    rimG.add(brace);
  }
  // Netzhaken (ein Mesh)
  const hooks = [];
  for (let i = 0; i < NET_N; i++) {
    const a = (i / NET_N) * Math.PI * 2;
    hooks.push(new THREE.TorusGeometry(0.012, 0.004, 4, 8).rotateY(-a).translate(Math.cos(a) * HOOP.r, -0.022, Math.sin(a) * HOOP.r));
  }
  rimG.add(new THREE.Mesh(mergeGeometries(hooks), rimMat));
  rimG.add(plate, arm);

  g.add(base, pole, pad, padTop, neck, s1, s2, mount, glass, lines, f1, f2, f3, padB, rimG);
  scene.add(g);

  const net = new Net(scene, ball);
  const boardGroup = [glass, lines, f1, f2, f3, padB, mount];
  const boardBase = boardGroup.map((m) => m.position.y);

  let swishA = 0, rimA = 0, boardA = 0;
  return {
    group: g,
    swish(strength = 1) { swishA = Math.max(swishA, strength); if (strength > 1.4) boardA = 1; },
    rimHit(v = 1) { rimA = Math.min(1, rimA + 0.2 + v * 0.12); },
    boardHit(v = 1) { boardA = Math.min(1, boardA + v * 0.08); },
    update(dt, time) {
      swishA = Math.max(0, swishA - dt * 1.4);
      rimA = Math.max(0, rimA - dt * 2.5);
      boardA = Math.max(0, boardA - dt * 2);
      // Ring federt nach unten, Brett zittert
      const wob = Math.sin(time * 55) * rimA;
      rimG.rotation.x = wob * 0.05 + Math.max(0, Math.sin(time * 40)) * swishA * 0.04;
      rimG.position.y = HOOP.y - Math.abs(wob) * 0.012;
      const shake = Math.sin(time * 60) * boardA * 0.012;
      boardGroup.forEach((m, i) => { m.position.y = boardBase[i] + shake; });
      net.update(dt, time, swishA, rimG.position.y);
    },
  };
}

// Netz aus einzelnen Schnüren (InstancedMesh), das auf den Ball reagiert
class Net {
  constructor(scene, ball) {
    this.ball = ball;
    this.nodes = [];
    for (let j = 0; j <= NET_R; j++) {
      const f = j / NET_R;
      const r = HOOP.r * (1 - 0.42 * Math.pow(f, 0.85)) - 0.004;
      for (let i = 0; i < NET_N; i++) {
        const a = ((i + j * 0.5) / NET_N) * Math.PI * 2;
        this.nodes.push({ a, r0: r, y0: -0.02 - f * NET_DEPTH, r, y: -0.02 - f * NET_DEPTH, j, vr: 0 });
      }
    }
    this.links = [];
    const id = (i, j) => j * NET_N + (((i % NET_N) + NET_N) % NET_N);
    for (let j = 0; j < NET_R; j++) {
      for (let i = 0; i < NET_N; i++) {
        this.links.push([id(i, j), id(i, j + 1)]);
        this.links.push([id(i, j), id(i - 1, j + 1)]);
      }
    }
    const geo = new THREE.CylinderGeometry(0.0065, 0.0065, 1, 4, 1, true);
    geo.translate(0, 0.5, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.9 }), this.links.length);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
    this.d = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.p = [];
  }

  update(dt, time, swish, rimY) {
    const b = this.ball.position;
    const bx = b.x - HOOP.x, by = b.y - rimY, bz = b.z - HOOP.z;
    const k = Math.min(1, dt * 14);
    for (let ni = 0; ni < this.nodes.length; ni++) {
      const n = this.nodes[ni];
      const ux = Math.cos(n.a), uz = Math.sin(n.a);
      // Ball drückt das Netz nach außen
      let target = n.r0;
      const w = Math.max(0, 1 - Math.abs(n.y0 - by) / 0.17);
      if (w > 0 && Math.hypot(bx, bz) < 0.35) {
        const need = bx * ux + bz * uz + BALL_R + 0.01;
        target = Math.max(target, n.r0 + (need - n.r0) * w);
      }
      // Swish: Netz schwingt und streckt sich
      const f = n.j / NET_R;
      target += Math.sin(time * 18 - n.j * 0.9) * swish * 0.02 * f;
      n.r += (target - n.r) * k;
      const stretch = 1 + swish * 0.3 * Math.max(0, Math.sin(time * 9 - n.j * 0.4));
      const sway = Math.sin(time * 1.3 + n.a) * 0.004 * f;
      n.y = n.y0 * stretch;
      this.p[ni] = [HOOP.x + ux * n.r + sway, rimY + n.y, HOOP.z + uz * n.r];
    }
    const P = this.p;
    this.links.forEach(([i, j], idx) => {
      this.a.set(P[i][0], P[i][1], P[i][2]);
      this.b.set(P[j][0], P[j][1], P[j][2]);
      this.d.subVectors(this.a, this.b);
      const len = this.d.length();
      this.q.setFromUnitVectors(this.up, this.d.multiplyScalar(1 / (len || 1)));
      this.s.set(1, len, 1);
      this.m.compose(this.b, this.q, this.s);
      this.mesh.setMatrixAt(idx, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
