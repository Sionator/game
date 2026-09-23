// 3D-Welt: Court, Korb, Umgebung, Spielerfiguren, Ball und Effekte
import * as THREE from 'three';
import { COURT, HOOP, BOARD, BALL_R, THREE_R } from '/shared/constants.js';

const PX = 48; // Pixel pro Meter für die Court-Textur
const FLOOR = { x0: -10, x1: 10, z0: -3, z1: 17 };

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0x1b1535, 35, 110);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  camera.position.set(0, 7, 20);
  camera.lookAt(0, 1.5, 6);

  // Licht
  scene.add(new THREE.HemisphereLight(0x8aa4ff, 0x2a1f14, 0.9));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(7, 18, 14);
  sun.target.position.set(0, 0, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -13; sc.right = 13; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 50;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xff9a5a, 0.6);
  fill.position.set(-10, 6, -6);
  scene.add(fill);

  buildCourt(scene);
  const clearLine = buildClearLine(scene);
  const hoop = buildHoop(scene);
  buildSurroundings(scene);

  // Ball
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 32, 18),
    new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.75, metalness: 0 }),
  );
  ball.castShadow = true;
  scene.add(ball);

  const fx = new Particles(scene);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 72 : w / h < 1.3 ? 60 : 50;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  return {
    THREE, renderer, scene, camera, ball, hoop, fx, clearLine,
    addPlayer: (info, isMe) => new PlayerView(scene, info, isMe),
    render() { renderer.render(scene, camera); },
  };
}

// ------------------------------------------------------------------ Texturen
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function skyTexture() {
  return canvasTex(16, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#0a0b24');
    gr.addColorStop(0.45, '#2c1d57');
    gr.addColorStop(0.72, '#8a3b6b');
    gr.addColorStop(0.9, '#f07a4a');
    gr.addColorStop(1, '#ffb35c');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}

function ballTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#d9621f';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,200,150'},${Math.random() * 0.08})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = '#1a0d05';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    for (const x of [w / 4, (3 * w) / 4]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (const off of [0, w / 2]) {
      g.beginPath();
      for (let x = 0; x <= w / 2; x += 4) {
        const y = h / 2 + Math.sin((x / (w / 2)) * Math.PI) * h * 0.36 * (off ? -1 : 1);
        x === 0 ? g.moveTo(x + off, y) : g.lineTo(x + off, y);
      }
      g.stroke();
    }
  });
}

// ------------------------------------------------------------------ Court
function buildCourt(scene) {
  const W = (FLOOR.x1 - FLOOR.x0) * PX, H = (FLOOR.z1 - FLOOR.z0) * PX;
  const P = (x, z) => [(x - FLOOR.x0) * PX, (z - FLOOR.z0) * PX];
  const tex = canvasTex(W, H, (g) => {
    g.fillStyle = '#2b2f38';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 20000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.06})`;
      g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    const [cx0, cz0] = P(-COURT.halfW, 0);
    const [cx1, cz1] = P(COURT.halfW, COURT.len);
    g.fillStyle = '#1e4f8f';
    g.fillRect(cx0, cz0, cx1 - cx0, cz1 - cz0);
    // Dreier-Zone etwas heller
    g.fillStyle = '#2461ab';
    g.beginPath();
    const [hx, hz] = P(HOOP.x, HOOP.z);
    g.moveTo(...P(-THREE_R, 0));
    g.lineTo(...P(-THREE_R, HOOP.z));
    g.arc(hx, hz, THREE_R * PX, Math.PI, 0, true);
    g.lineTo(...P(THREE_R, 0));
    g.closePath();
    g.fill();
    // Zone
    g.fillStyle = '#e0561c';
    const [kx0, kz0] = P(-2.45, 0);
    const [kx1, kz1] = P(2.45, 5.8);
    g.fillRect(kx0, kz0, kx1 - kx0, kz1 - kz0);
    // Mittelkreis-Logo
    const [mx, mz] = P(0, COURT.len);
    g.fillStyle = '#e0561c';
    g.beginPath(); g.arc(mx, mz, 1.8 * PX, Math.PI, 2 * Math.PI); g.fill();

    g.strokeStyle = '#f4f4f4';
    g.lineWidth = 0.06 * PX;
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
    // Check-Markierung
    const [ckx, ckz] = P(0, 9.8);
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.beginPath(); g.arc(ckx, ckz, 0.15 * PX, 0, Math.PI * 2); g.fill();

    g.save();
    g.translate(...P(0, 11.9));
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.font = `900 italic ${1.3 * PX}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('STREETBALL', 0, 0);
    g.restore();
    // Graffiti-Kleckse außerhalb
    const cols = ['#ff4d6d', '#ffd23f', '#3bceac', '#7b2cbf'];
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const [x, z] = P(side * (8 + Math.random() * 1.8), -2 + Math.random() * 18);
      g.fillStyle = cols[i % 4] + '33';
      g.beginPath(); g.arc(x, z, (0.2 + Math.random() * 0.6) * PX, 0, Math.PI * 2); g.fill();
    }
  });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR.x1 - FLOOR.x0, FLOOR.z1 - FLOOR.z0),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((FLOOR.x0 + FLOOR.x1) / 2, 0, (FLOOR.z0 + FLOOR.z1) / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: 0x16181f, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);
}

function buildClearLine(scene) {
  // Leuchtende Dreierlinie – zeigt an, dass der Ball geklärt werden muss
  const pts = [];
  pts.push(new THREE.Vector3(-THREE_R, 0.02, 0));
  for (let a = 0; a <= 64; a++) {
    const t = Math.PI - (a / 64) * Math.PI;
    pts.push(new THREE.Vector3(HOOP.x + Math.cos(t) * THREE_R, 0.02, HOOP.z + Math.sin(t) * THREE_R));
  }
  pts.push(new THREE.Vector3(THREE_R, 0.02, 0));
  const curve = new THREE.CatmullRomCurve3(pts);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 200, 0.07, 6, false),
    new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.8 }),
  );
  mesh.scale.y = 0.2;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

function buildHoop(scene) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x3b4252, metalness: 0.6, roughness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.9, 12), metal);
  pole.position.set(0, 1.95, -0.7);
  pole.castShadow = true;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.85), metal);
  arm.position.set(0, 3.55, 0.2);
  arm.castShadow = true;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.8, 12), new THREE.MeshStandardMaterial({ color: 0xe0561c }));
  pad.position.set(0, 0.9, -0.7);

  const boardTex = canvasTex(360, 210, (c, w, h) => {
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#fff'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
    c.strokeStyle = '#ff5a1f'; c.lineWidth = 8;
    c.strokeRect(w / 2 - 59, h - 30 - 90, 118, 90);
  });
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD.x1 - BOARD.x0, BOARD.y1 - BOARD.y0, BOARD.thick),
    [metal, metal, metal, metal,
      new THREE.MeshStandardMaterial({ map: boardTex, transparent: true, roughness: 0.1, metalness: 0.1 }),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, transparent: true, opacity: 0.5 })],
  );
  board.position.set(0, (BOARD.y0 + BOARD.y1) / 2, BOARD.z - BOARD.thick / 2);
  board.castShadow = true;

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(HOOP.r, 0.018, 10, 40),
    new THREE.MeshStandardMaterial({ color: 0xff4d1a, metalness: 0.5, roughness: 0.35, emissive: 0x401000 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(HOOP.x, HOOP.y, HOOP.z);
  rim.castShadow = true;
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), rim.material);
  bracket.position.set(0, HOOP.y, BOARD.z + 0.08);

  // Netz
  const net = new THREE.Group();
  net.position.set(HOOP.x, HOOP.y, HOOP.z);
  const segs = 12, rings = 5, depth = 0.45;
  const verts = [];
  const pt = (i, j) => {
    const f = j / rings;
    const r = HOOP.r * (1 - f * 0.42);
    const a = (i / segs) * Math.PI * 2 + (j % 2) * (Math.PI / segs);
    return [Math.cos(a) * r, -f * depth, Math.sin(a) * r];
  };
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      verts.push(...pt(i, j), ...pt(i, j + 1));
      verts.push(...pt(i + 1, j), ...pt(i, j + 1));
    }
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  net.add(new THREE.LineSegments(ng, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })));

  g.add(pole, arm, pad, board, rim, bracket, net);
  scene.add(g);

  let anim = 0;
  return {
    net, rim,
    swish(strength = 1) { anim = strength; },
    update(dt, time) {
      anim = Math.max(0, anim - dt * 1.6);
      const w = Math.sin(time * 30) * anim;
      net.scale.set(1 - anim * 0.15 + w * 0.03, 1 + anim * 0.45, 1 - anim * 0.15 - w * 0.03);
      rim.position.y = HOOP.y - Math.max(0, Math.sin(time * 40)) * anim * 0.03;
    },
  };
}

function buildSurroundings(scene) {
  // Zaun (Maschendraht)
  const chain = canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(200,210,220,0.9)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
  }, [30, 5]);
  const fenceMat = new THREE.MeshStandardMaterial({ map: chain, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.6 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x55606e, metalness: 0.6, roughness: 0.4 });
  const fh = 4;
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, fh), fenceMat.clone());
    m.material.map = chain.clone();
    m.material.map.repeat.set(len * 1.5, fh * 1.5);
    m.material.map.needsUpdate = true;
    m.position.set((x0 + x1) / 2, fh / 2, (z0 + z1) / 2);
    m.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
    scene.add(m);
    const n = Math.ceil(len / 4);
    for (let i = 0; i <= n; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, fh, 6), postMat);
      p.position.set(x0 + ((x1 - x0) * i) / n, fh / 2, z0 + ((z1 - z0) * i) / n);
      scene.add(p);
    }
  };
  fence(-11, -4, 11, -4);
  fence(-11, -4, -11, 16);
  fence(11, -4, 11, 16);

  // Flutlichter
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 3 });
  for (const [x, z] of [[-10.5, -3.5], [10.5, -3.5], [-10.5, 12], [10.5, 12]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 8, 8), postMat);
    p.position.set(x, 4, z);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.3), lampMat);
    head.position.set(x - Math.sign(x) * 0.4, 8, z);
    head.lookAt(0, 0, 6);
    scene.add(p, head);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff0c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.copy(head.position);
    glow.scale.set(4, 4, 1);
    scene.add(glow);
  }

  // Bänke
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 });
  for (const z of [3, 10]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 2.4), benchMat);
    b.position.set(-9.3, 0.225, z);
    b.castShadow = true;
    scene.add(b);
  }

  // Skyline
  const winTex = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#0d1020'; g.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) {
      if (Math.random() < 0.35) { g.fillStyle = Math.random() < 0.7 ? '#ffd27a' : '#9ad0ff'; g.fillRect(x, y, 4, 5); }
    }
  });
  const rand = mulberry(7);
  for (let i = 0; i < 70; i++) {
    const ang = -Math.PI * 0.95 + rand() * Math.PI * 0.9;
    const dist = 38 + rand() * 40;
    const w = 5 + rand() * 9, h = 8 + rand() * 30, d = 5 + rand() * 8;
    const t = winTex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.round(w / 4), Math.round(h / 6));
    t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0x151a2b, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.9, roughness: 1 }));
    m.position.set(Math.cos(ang) * dist, h / 2, 6 + Math.sin(ang) * dist);
    m.lookAt(0, h / 2, 6);
    scene.add(m);
  }

  // Sterne
  const sg = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 600; i++) {
    const a = rand() * Math.PI * 2, e = 0.15 + rand() * 1.3;
    sp.push(Math.cos(a) * Math.cos(e) * 150, Math.sin(e) * 150, Math.sin(a) * Math.cos(e) * 150);
  }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, fog: false }));
  scene.add(stars);
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

let _glow = null;
function glowTex() {
  if (_glow) return _glow;
  _glow = canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(255,255,255,.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  return _glow;
}

function textSprite(text, { size = 40, color = '#fff', bg = 'rgba(0,0,0,.55)', w = 256, h = 64, scale = 1.6 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const draw = (t) => {
    g.clearRect(0, 0, w, h);
    g.font = `800 ${size}px system-ui, sans-serif`;
    const tw = Math.min(w - 8, g.measureText(t).width + 28);
    if (bg) { g.fillStyle = bg; roundRect(g, (w - tw) / 2, 6, tw, h - 12, (h - 12) / 2); g.fill(); }
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, w / 2, h / 2 + 2, w - 20);
  };
  draw(text);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(scale, (scale * h) / w, 1);
  s.renderOrder = 10;
  s.userData.draw = (t) => { draw(t); tex.needsUpdate = true; };
  return s;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ------------------------------------------------------------------ Spieler
const SKINS = ['#f1c7a3', '#d9a27a', '#b87a50', '#8d5a3b', '#5e3b26'];
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

class PlayerView {
  constructor(scene, info, isMe) {
    this.id = info.id;
    this.scene = scene;
    const col = new THREE.Color(info.color);
    const h = hash(info.name + info.id);
    const skin = new THREE.MeshStandardMaterial({ color: SKINS[h % SKINS.length], roughness: 0.7 });
    const number = String(h % 99 + 1);
    const jerseyFront = new THREE.MeshStandardMaterial({ map: numberTex(number, info.color), roughness: 0.8 });
    const jersey = new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 });
    const shorts = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.55), roughness: 0.8 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const sole = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 });

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const cast = (m) => { m.castShadow = true; return m; };
    // Beine
    const legGeo = new THREE.CapsuleGeometry(0.075, 0.62, 4, 8);
    legGeo.translate(0, -0.38, 0);
    this.legL = new THREE.Group(); this.legR = new THREE.Group();
    for (const [leg, x] of [[this.legL, 0.12], [this.legR, -0.12]]) {
      leg.position.set(x, 0.92, 0);
      leg.add(cast(new THREE.Mesh(legGeo, skin)));
      const s = cast(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.3), shoe));
      s.position.set(0, -0.83, 0.05);
      const so = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.31), sole);
      so.position.set(0, -0.88, 0.05);
      leg.add(s, so);
      this.body.add(leg);
    }
    const sh = cast(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.26), shorts));
    sh.position.y = 0.88;
    const torso = cast(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.25), [jersey, jersey, jersey, jersey, jerseyFront, jerseyFront]));
    torso.position.y = 1.3;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), skin);
    neck.position.y = 1.64;
    this.head = cast(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), skin));
    this.head.position.y = 1.78;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.133, 0.133, 0.04, 16), jersey);
    band.position.y = 1.83;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), new THREE.MeshStandardMaterial({ color: 0x1b120c }));
    hair.position.y = 1.8;
    this.body.add(sh, torso, neck, this.head, band, hair);
    // Arme
    const armGeo = new THREE.CapsuleGeometry(0.06, 0.6, 4, 8);
    armGeo.translate(0, -0.33, 0);
    this.armL = new THREE.Group(); this.armR = new THREE.Group();
    for (const [arm, x] of [[this.armL, 0.3], [this.armR, -0.3]]) {
      arm.position.set(x, 1.55, 0);
      arm.add(cast(new THREE.Mesh(armGeo, skin)));
      const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.075, 0.12, 8), jersey);
      sl.position.y = -0.02;
      arm.add(sl);
      this.body.add(arm);
    }

    // Name + Markierung
    this.label = textSprite(info.name + (info.bot ? ' 🤖' : ''), { color: isMe ? '#ffe08a' : '#fff' });
    this.label.position.y = 2.35;
    this.root.add(this.label);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: isMe ? 0.9 : 0.45, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.015;
    this.ringHolder = new THREE.Group();
    this.ringHolder.add(this.ring);
    scene.add(this.ringHolder);

    this.emote = textSprite('', { size: 46, bg: 'rgba(255,255,255,.92)', color: '#111', scale: 1.4 });
    this.emote.position.y = 2.75;
    this.emote.visible = false;
    this.root.add(this.emote);
    this.emoteT = 0;

    scene.add(this.root);
    this.runPhase = 0;
    this.dribblePhase = Math.random() * 6;
    this.lastBounce = 1;
    this.reachT = 0;
    this.fallAmt = 0;
    this.f = 0;
    this._v = new THREE.Vector3();
  }

  showEmote(text) {
    this.emote.userData.draw(text);
    this.emote.visible = true;
    this.emoteT = 2.4;
  }

  reach() { this.reachT = 0.3; }

  // s: {x,y,z,f,vx,vz,st, hasBall, defending, shootingLocal}
  update(s, dt, onDribble) {
    const speed = Math.hypot(s.vx || 0, s.vz || 0);
    this.root.position.set(s.x, s.y, s.z);
    let d = s.f - this.f;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.f += d * Math.min(1, dt * 18);
    this.root.rotation.y = this.f;
    this.ringHolder.position.set(s.x, 0, s.z);

    const air = s.y > 0.05;
    this.runPhase += dt * (4 + speed * 1.9);
    const amp = air ? 0 : Math.min(1, speed / 5) * 0.85;
    const sw = Math.sin(this.runPhase) * amp;
    let lL = sw, lR = -sw, aL = -sw * 0.8, aR = sw * 0.8, aLz = 0, aRz = 0;
    let crouch = 0, lean = Math.min(0.25, speed * 0.035);
    if (air) { lL = -0.5; lR = 0.15; }

    const shooting = s.st === 'shoot' || s.shootingLocal;
    if (s.hasBall && !shooting && s.st !== 'dunk') {
      this.dribblePhase += dt * (speed > 3 ? 11 : 8);
      const c = Math.abs(Math.cos(this.dribblePhase));
      if (c < this.lastBounce && c < 0.12 && this.lastBounce >= 0.12) onDribble && onDribble(this);
      this.lastBounce = c;
      aR = -0.45 - (1 - c) * 0.25;
      aRz = -0.25;
      crouch = 0.06;
    }
    if (s.defending && !air) { aLz = 0.9; aRz = -0.9; aL = -0.3; aR = -0.3; crouch = 0.12; }
    if (shooting) { aL = aR = -2.75; aLz = -0.15; aRz = 0.15; lean = 0; }
    if (s.st === 'dunk') { aL = aR = -2.9; lean = 0.1; }
    if (air && !s.hasBall && !shooting) { aL = aR = -2.6; }
    if (this.reachT > 0) { this.reachT -= dt; aR = -1.5; lean = 0.35; }

    const k = Math.min(1, dt * 16);
    this.legL.rotation.x += (lL - this.legL.rotation.x) * k;
    this.legR.rotation.x += (lR - this.legR.rotation.x) * k;
    this.armL.rotation.x += (aL - this.armL.rotation.x) * k;
    this.armR.rotation.x += (aR - this.armR.rotation.x) * k;
    this.armL.rotation.z += (aLz - this.armL.rotation.z) * k;
    this.armR.rotation.z += (aRz - this.armR.rotation.z) * k;

    // Hinfallen bei Ankle Breaker
    const fall = s.st === 'stun' ? 1 : 0;
    this.fallAmt += (fall - this.fallAmt) * Math.min(1, dt * (fall ? 10 : 4));
    this.body.rotation.x = lean * (1 - this.fallAmt) - this.fallAmt * 1.25;
    this.body.position.y = -crouch - this.fallAmt * 0.35;
    this.body.position.z = -this.fallAmt * 0.3;

    if (this.emoteT > 0) {
      this.emoteT -= dt;
      this.emote.position.y = 2.75 + (2.4 - this.emoteT) * 0.12;
      this.emote.material.opacity = Math.min(1, this.emoteT * 2);
      if (this.emoteT <= 0) this.emote.visible = false;
    }
    this.root.updateMatrixWorld(true);
  }

  ballAnchor(s, out) {
    const shooting = s.st === 'shoot' || s.shootingLocal;
    if (s.st === 'dunk') out.set(0, 2.45, 0.3);
    else if (shooting) out.set(0, 2.25, 0.18);
    else {
      const c = Math.abs(Math.cos(this.dribblePhase));
      out.set(-0.36, BALL_R + c * 0.78, 0.32);
      this.root.localToWorld(out);
      out.y = BALL_R + c * 0.78 + Math.max(0, s.y) * 0.8;
      return out;
    }
    return this.root.localToWorld(out);
  }

  dispose() {
    this.scene.remove(this.root);
    this.scene.remove(this.ringHolder);
  }
}

function numberTex(n, color) {
  return canvasTex(128, 160, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
    const light = new THREE.Color(color).getHSL({}).l > 0.6;
    g.fillStyle = light ? '#111' : '#fff';
    g.strokeStyle = light ? '#fff' : '#111';
    g.lineWidth = 4;
    g.font = '900 86px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeText(n, w / 2, h / 2 + 6);
    g.fillText(n, w / 2, h / 2 + 6);
  });
}

// ------------------------------------------------------------------ Partikel
class Particles {
  constructor(scene) {
    this.pool = [];
    this.scene = scene;
    const tex = glowTex();
    for (let i = 0; i < 260; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xff8a20, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.visible = false;
      s.userData = { life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, size: 0.3 };
      scene.add(s);
      this.pool.push(s);
    }
    this.i = 0;
  }

  spawn(x, y, z, o = {}) {
    const s = this.pool[this.i++ % this.pool.length];
    const u = s.userData;
    s.position.set(x, y, z);
    u.vx = o.vx || 0; u.vy = o.vy || 0; u.vz = o.vz || 0;
    u.g = o.g || 0;
    u.life = u.max = o.life || 0.6;
    u.size = o.size || 0.3;
    s.material.color.set(o.color || 0xff8a20);
    s.visible = true;
  }

  fire(x, y, z, n = 2) {
    for (let i = 0; i < n; i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.15, y + (Math.random() - 0.5) * 0.15, z + (Math.random() - 0.5) * 0.15, {
        vy: 0.8 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.3,
        life: 0.35 + Math.random() * 0.3, size: 0.28 + Math.random() * 0.2,
        color: Math.random() < 0.5 ? 0xff5a10 : 0xffc040,
      });
    }
  }

  burst(x, y, z, colors, n = 60, power = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI / 2;
      const v = power * (0.4 + Math.random() * 0.6);
      this.spawn(x, y, z, {
        vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(e) * v, vz: Math.sin(a) * Math.cos(e) * v,
        g: 6, life: 0.7 + Math.random() * 0.6, size: 0.12 + Math.random() * 0.12,
        color: colors[i % colors.length],
      });
    }
  }

  update(dt) {
    for (const s of this.pool) {
      if (!s.visible) continue;
      const u = s.userData;
      u.life -= dt;
      if (u.life <= 0) { s.visible = false; continue; }
      u.vy -= u.g * dt;
      s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt;
      const f = u.life / u.max;
      s.material.opacity = f;
      const sz = u.size * (0.5 + f * 0.5);
      s.scale.set(sz, sz, 1);
    }
  }
}
