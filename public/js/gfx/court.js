// Court: Asphalt mit Farbe, Abnutzung, Rissen und Pfützen (Farb-, Rauheits- und Bump-Map aus derselben Zeichnung)
import * as THREE from 'three';
import { COURT, HOOP, THREE_R, BALL_R } from '/shared/constants.js';
import { makeCanvas, canvasTex, mulberry, speckle } from './textures.js';

export const FLOOR = { x0: -11, x1: 11, z0: -4.2, z1: 17 };

const PAL = {
  color: {
    asphalt: '#23272e', court: '#1c4d8f', three: '#2360ab', key: '#d0501c', line: '#efeee8',
    stain: 'rgba(0,0,0,.32)', crack: 'rgba(8,8,10,.45)', puddle: 'rgba(6,10,20,.55)', logo: 'rgba(255,255,255,.16)',
  },
  rough: {
    asphalt: '#f2f2f2', court: '#9c9c9c', three: '#9c9c9c', key: '#949494', line: '#888888',
    stain: 'rgba(170,170,170,.6)', crack: '#ffffff', puddle: '#0c0c0c', logo: 'rgba(120,120,120,.5)',
  },
  bump: {
    asphalt: '#7a7a7a', court: '#8c8c8c', three: '#8c8c8c', key: '#8c8c8c', line: '#939393',
    stain: 'rgba(128,128,128,0)', crack: '#262626', puddle: '#747474', logo: 'rgba(150,150,150,.4)',
  },
};

export function buildCourt(scene, Q) {
  const PX = Q.courtPx;
  const W = Math.round((FLOOR.x1 - FLOOR.x0) * PX), H = Math.round((FLOOR.z1 - FLOOR.z0) * PX);
  const P = (x, z) => [(x - FLOOR.x0) * PX, (z - FLOOR.z0) * PX];

  const paint = (g, mode) => {
    const c = PAL[mode];
    const rng = mulberry(4242);
    g.fillStyle = c.asphalt;
    g.fillRect(0, 0, W, H);
    if (mode === 'color') speckle(g, W, H, (W * H) / 35, 0.08, '255,255,255', '0,0,0', PX / 30);
    if (mode === 'bump') speckle(g, W, H, (W * H) / 12, 0.55, '255,255,255', '0,0,0', PX / 28);
    if (mode === 'rough') speckle(g, W, H, (W * H) / 60, 0.2, '255,255,255', '90,90,90', PX / 25);

    // Flecken
    for (let i = 0; i < 16; i++) {
      const [x, z] = P(-10 + rng() * 20, -3 + rng() * 19);
      const r = (0.4 + rng() * 1.4) * PX;
      const gr = g.createRadialGradient(x, z, 0, x, z, r);
      gr.addColorStop(0, c.stain); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, z - r, r * 2, r * 2);
    }

    // Spielfeld-Farbe
    const [cx0, cz0] = P(-COURT.halfW, 0);
    const [cx1, cz1] = P(COURT.halfW, COURT.len);
    const [hx, hz] = P(HOOP.x, HOOP.z);
    g.fillStyle = c.court;
    g.fillRect(cx0, cz0, cx1 - cx0, cz1 - cz0);
    g.fillStyle = c.three;
    g.beginPath();
    g.moveTo(...P(-THREE_R, 0)); g.lineTo(...P(-THREE_R, HOOP.z));
    g.arc(hx, hz, THREE_R * PX, Math.PI, 0, true);
    g.lineTo(...P(THREE_R, 0)); g.closePath(); g.fill();
    g.fillStyle = c.key;
    const [kx0, kz0] = P(-2.45, 0);
    const [kx1, kz1] = P(2.45, 5.8);
    g.fillRect(kx0, kz0, kx1 - kx0, kz1 - kz0);
    const [mx, mz] = P(0, COURT.len);
    g.beginPath(); g.arc(mx, mz, 1.8 * PX, Math.PI, 2 * Math.PI); g.fill();

    // Abnutzung der Farbe (mehr in der Zone und oben am Kreis)
    for (let i = 0; i < 5000; i++) {
      const hot = rng() < 0.6;
      const x = hot ? (rng() - 0.5) * 7 : (rng() - 0.5) * 15;
      const z = hot ? 1 + rng() * 9 : rng() * 14;
      const s = (0.008 + rng() * rng() * 0.04) * PX;
      if (Math.abs(x) > COURT.halfW || z > COURT.len) continue;
      const [px, pz] = P(x, z);
      g.globalAlpha = 0.12 + rng() * 0.25;
      g.fillStyle = c.asphalt;
      g.fillRect(px, pz, s, s * (0.5 + rng()));
    }
    g.globalAlpha = 1;

    // Linien
    g.strokeStyle = c.line;
    g.lineWidth = 0.055 * PX;
    g.strokeRect(cx0, cz0, cx1 - cx0, cz1 - cz0);
    g.strokeRect(kx0, kz0, kx1 - kx0, kz1 - kz0);
    g.beginPath(); g.moveTo(...P(-THREE_R, 0)); g.lineTo(...P(-THREE_R, HOOP.z));
    g.arc(hx, hz, THREE_R * PX, Math.PI, 0, true); g.lineTo(...P(THREE_R, 0)); g.stroke();
    const [fx, fz] = P(0, 5.8);
    g.beginPath(); g.arc(fx, fz, 1.8 * PX, 0, Math.PI); g.stroke();
    g.setLineDash([0.3 * PX, 0.25 * PX]);
    g.beginPath(); g.arc(fx, fz, 1.8 * PX, Math.PI, 2 * Math.PI); g.stroke();
    g.setLineDash([]);
    g.beginPath(); g.arc(hx, hz, 1.25 * PX, 0, Math.PI); g.stroke();
    g.beginPath(); g.arc(mx, mz, 1.8 * PX, Math.PI, 2 * Math.PI); g.stroke();
    // Hash-Markierungen an der Zone
    for (const z of [2.2, 3.1, 4.0]) {
      for (const sx of [-1, 1]) {
        g.beginPath(); g.moveTo(...P(sx * 2.45, z)); g.lineTo(...P(sx * 2.75, z)); g.stroke();
      }
    }
    const [ckx, ckz] = P(0, 9.8);
    g.fillStyle = c.line;
    g.beginPath(); g.arc(ckx, ckz, 0.12 * PX, 0, Math.PI * 2); g.fill();


    // Logo
    g.save();
    g.translate(...P(0, 11.7));
    g.fillStyle = c.logo;
    g.font = `900 italic ${1.25 * PX}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('STREETBALL', 0, 0);
    g.font = `800 ${0.42 * PX}px system-ui, sans-serif`;
    g.fillText('• EST. 2026 • NIGHT COURT •', 0, 0.95 * PX);
    g.restore();

    // Risse
    g.strokeStyle = c.crack;
    g.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      let x = -10 + rng() * 20, z = -3.5 + rng() * 20;
      let a = rng() * Math.PI * 2;
      g.lineWidth = (0.006 + rng() * 0.012) * PX;
      g.beginPath(); g.moveTo(...P(x, z));
      const n = 8 + Math.floor(rng() * 16);
      for (let k = 0; k < n; k++) {
        a += (rng() - 0.5) * 1.1;
        x += Math.cos(a) * 0.18; z += Math.sin(a) * 0.18;
        g.lineTo(...P(x, z));
      }
      g.stroke();
    }

    // Pfützen (spiegeln die Flutlichter)
    for (const [px, pz, sz] of [[-6.6, 11.8, 1], [5.9, 12.8, 0.8], [-9.4, 3.5, 1.2], [9.2, 7.5, 0.9], [3.2, -2.6, 0.9], [-1.5, 15.5, 1.1]]) {
      for (let k = 0; k < 6; k++) {
        const [x, z] = P(px + (rng() - 0.5) * 1.3 * sz, pz + (rng() - 0.5) * 0.8 * sz);
        const r = (0.3 + rng() * 0.5) * sz * PX;
        const gr = g.createRadialGradient(x, z, 0, x, z, r);
        gr.addColorStop(0, c.puddle);
        gr.addColorStop(0.7, c.puddle);
        gr.addColorStop(1, mode === 'color' ? 'rgba(0,0,0,0)' : mode === 'rough' ? 'rgba(12,12,12,0)' : 'rgba(116,116,116,0)');
        g.fillStyle = gr; g.fillRect(x - r, z - r, r * 2, r * 2);
      }
    }
  };

  const tex = (mode, srgb) => {
    const t = new THREE.CanvasTexture(makeCanvas(W, H, (g) => paint(g, mode)));
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR.x1 - FLOOR.x0, FLOOR.z1 - FLOOR.z0),
    new THREE.MeshStandardMaterial({
      map: tex('color', true), roughnessMap: tex('rough', false), roughness: 1,
      bumpMap: tex('bump', false), bumpScale: 1.2, metalness: 0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((FLOOR.x0 + FLOOR.x1) / 2, 0, (FLOOR.z0 + FLOOR.z1) / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // Asphalt außerhalb
  const outer = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#1b1e24'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, 0.12, '255,255,255', '0,0,0', 2);
  }, { repeat: [60, 60] });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ map: outer, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.015;
  ground.receiveShadow = true;
  scene.add(ground);

  // Bordstein um den Platz
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x6b6f76, roughness: 0.85 });
  const curb = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), curbMat);
    m.position.set(x, 0.05, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  curb(FLOOR.x1 - FLOOR.x0 + 0.3, 0.15, 0, FLOOR.z1);
  curb(0.15, FLOOR.z1 - FLOOR.z0, FLOOR.x0, (FLOOR.z0 + FLOOR.z1) / 2);
  curb(0.15, FLOOR.z1 - FLOOR.z0, FLOOR.x1, (FLOOR.z0 + FLOOR.z1) / 2);

  return { floor, clearLine: buildClearLine(scene) };
}

function buildClearLine(scene) {
  // Leuchtende Dreierlinie – zeigt an, dass der Ball geklärt werden muss
  const pts = [new THREE.Vector3(-THREE_R, 0.02, 0)];
  for (let a = 0; a <= 64; a++) {
    const t = Math.PI - (a / 64) * Math.PI;
    pts.push(new THREE.Vector3(HOOP.x + Math.cos(t) * THREE_R, 0.02, HOOP.z + Math.sin(t) * THREE_R));
  }
  pts.push(new THREE.Vector3(THREE_R, 0.02, 0));
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.07, 6, false),
    new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.8, toneMapped: false }),
  );
  mesh.scale.y = 0.2;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

// Basketball mit Noppen und Nähten
export function buildBall() {
  const W = 1024, H = 512;
  const seams = (g, col, width) => {
    g.strokeStyle = col;
    g.lineWidth = width;
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    for (const x of [W / 4, (3 * W) / 4]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (const [off, dir] of [[0, 1], [W / 2, -1]]) {
      g.beginPath();
      for (let x = 0; x <= W / 2; x += 4) {
        const y = H / 2 + Math.sin((x / (W / 2)) * Math.PI) * H * 0.34 * dir;
        x === 0 ? g.moveTo(x + off, y) : g.lineTo(x + off, y);
      }
      g.stroke();
    }
  };
  const map = canvasTex(W, H, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#c8581c'); gr.addColorStop(0.5, '#dc6a26'); gr.addColorStop(1, '#c4541a');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    speckle(g, W, H, 26000, 0.1, '255,210,160', '60,20,0', 3);
    seams(g, '#1b0e06', 9);
    g.fillStyle = 'rgba(20,10,4,.55)';
    g.font = '900 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('STREET', W * 0.125, H * 0.42);
    g.fillText('PRO 7', W * 0.625, H * 0.62);
  });
  const bump = canvasTex(W, H, (g) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 60000; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.4})`;
      g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 1.4 + Math.random(), 0, Math.PI * 2); g.fill();
    }
    seams(g, '#202020', 11);
  }, { srgb: false });
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 40, 24),
    new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.5, roughness: 0.72, metalness: 0 }),
  );
  ball.castShadow = true;
  return ball;
}
