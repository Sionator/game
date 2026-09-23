// Umgebung: Himmel, Graffiti-Wand, Zäune, Flutlichter, Skyline, Neonschilder, Zuschauer
import * as THREE from 'three';
import { canvasTex, makeCanvas, mulberry, speckle, glowTex } from './textures.js';
import { FLOOR } from './court.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const FLOODLIGHTS = [
  { pole: [-10.4, -3.6], target: [1.5, 0, 6] },
  { pole: [10.4, -3.6], target: [-1.5, 0, 6] },
  { pole: [-10.4, 11.5], target: [2, 0, 4] },
  { pole: [10.4, 11.5], target: [-2, 0, 4] },
];
export const LAMP_Y = 8.6;

// ------------------------------------------------------------------ Himmel
export function skyTexture() {
  return canvasTex(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#04050f');
    gr.addColorStop(0.3, '#0c0d26');
    gr.addColorStop(0.43, '#261a4a');
    gr.addColorStop(0.49, '#6a2f5c');
    gr.addColorStop(0.515, '#c2553e');
    gr.addColorStop(0.53, '#2a1a2a');
    gr.addColorStop(1, '#07070b');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const rnd = mulberry(99);
    for (let i = 0; i < 1400; i++) {
      const y = rnd() * h * 0.46;
      const a = (0.25 + rnd() * 0.75) * (1 - y / (h * 0.5));
      g.fillStyle = `rgba(255,255,255,${a})`;
      const s = rnd() < 0.05 ? 2 : 1;
      g.fillRect(rnd() * w, y, s, s);
    }
    // Mond
    const mx = w * 0.79, my = h * 0.36;
    const glow = g.createRadialGradient(mx, my, 0, mx, my, 40);
    glow.addColorStop(0, 'rgba(255,245,220,.55)'); glow.addColorStop(1, 'rgba(255,245,220,0)');
    g.fillStyle = glow; g.fillRect(mx - 40, my - 40, 80, 80);
    g.fillStyle = '#fff6df';
    g.beginPath(); g.arc(mx, my, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(200,190,170,.5)';
    g.beginPath(); g.arc(mx - 2, my - 2, 1.6, 0, Math.PI * 2); g.arc(mx + 3, my + 2, 1.2, 0, Math.PI * 2); g.fill();
  });
}

export function buildSky(scene, tex) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(220, 48, 24),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }),
  );
  sky.renderOrder = -10;
  scene.add(sky);
  return sky;
}

// ------------------------------------------------------------------ Wand mit Graffiti
function graffitiWallTex() {
  const W = 2048, H = 316;
  const color = makeCanvas(W, H, (g) => {
    const rnd = mulberry(7);
    g.fillStyle = '#3a2520'; g.fillRect(0, 0, W, H);
    const bw = 24, bh = 8;
    for (let row = 0; row * bh < H; row++) {
      const off = (row % 2) * (bw / 2);
      for (let x = -bw; x < W; x += bw) {
        const l = 26 + rnd() * 14, r = 55 + rnd() * 30;
        g.fillStyle = `rgb(${r + 40},${l + 12},${l})`;
        g.fillRect(x + off + 1, row * bh + 1, bw - 2, bh - 2);
      }
    }
    speckle(g, W, H, 30000, 0.12, '255,255,255', '0,0,0', 2);

    const bubble = (text, x, y, size, c1, c2, rot = -0.06) => {
      g.save();
      g.translate(x, y); g.rotate(rot);
      g.font = `900 italic ${size}px Impact, "Arial Black", system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = size * 0.2; g.strokeStyle = '#0d0b10'; g.strokeText(text, 0, 0);
      g.lineWidth = size * 0.08; g.strokeStyle = '#ffffff'; g.strokeText(text, 0, 0);
      const gr = g.createLinearGradient(0, -size / 2, 0, size / 2);
      gr.addColorStop(0, c1); gr.addColorStop(1, c2);
      g.fillStyle = gr; g.fillText(text, 0, 0);
      // Tropfen
      g.fillStyle = c2;
      const m = g.measureText(text).width;
      for (let i = 0; i < 7; i++) {
        const dx = -m / 2 + rnd() * m, len = 10 + rnd() * 40;
        g.fillRect(dx, size * 0.3, 4, len);
        g.beginPath(); g.arc(dx + 2, size * 0.3 + len, 4, 0, Math.PI * 2); g.fill();
      }
      // Glanzpunkte
      g.fillStyle = 'rgba(255,255,255,.8)';
      for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(-m / 2 + rnd() * m, -size * 0.2 + rnd() * size * 0.2, 3, 0, Math.PI * 2); g.fill(); }
      g.restore();
    };
    // Hintergrund-Wolken hinter den Schriftzügen
    const cloud = (x, y, r, c) => {
      g.fillStyle = c;
      for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(x + (rnd() - 0.5) * r * 2.4, y + (rnd() - 0.5) * r * 0.8, r * (0.5 + rnd() * 0.5), 0, Math.PI * 2); g.fill(); }
    };
    cloud(460, 170, 90, 'rgba(90,40,160,.55)');
    cloud(1600, 165, 95, 'rgba(10,120,140,.55)');
    bubble('STREET', 470, 160, 150, '#ff4fa3', '#ff9a3c');
    bubble('KINGS', 1600, 165, 150, '#35f2d3', '#2f7cf6', 0.05);
    // Krone
    g.save(); g.translate(1024, 70);
    g.fillStyle = '#ffd23f'; g.strokeStyle = '#0d0b10'; g.lineWidth = 8;
    g.beginPath(); g.moveTo(-60, 30); g.lineTo(-70, -30); g.lineTo(-30, 0); g.lineTo(0, -40); g.lineTo(30, 0); g.lineTo(70, -30); g.lineTo(60, 30); g.closePath();
    g.stroke(); g.fill();
    g.restore();
    // Tags
    const tags = ['SB', 'NITE', '1v1', 'ACE', 'K.O.', 'DUNK', '23', 'LOB', 'OG', 'ZONE'];
    const tagCols = ['#f4f4f4', '#ffd23f', '#35f2d3', '#ff4fa3', '#9dff5c', '#ff7a1a'];
    for (let i = 0; i < 26; i++) {
      g.save();
      g.translate(rnd() * W, 40 + rnd() * (H - 80));
      g.rotate((rnd() - 0.5) * 0.5);
      g.font = `italic ${22 + rnd() * 30}px "Brush Script MT", cursive, system-ui`;
      g.fillStyle = tagCols[i % tagCols.length];
      g.globalAlpha = 0.6 + rnd() * 0.4;
      g.fillText(tags[i % tags.length], 0, 0);
      g.restore();
    }
    g.globalAlpha = 1;
    // Schmutz unten
    const dirt = g.createLinearGradient(0, H * 0.6, 0, H);
    dirt.addColorStop(0, 'rgba(0,0,0,0)'); dirt.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = dirt; g.fillRect(0, 0, W, H);
  });
  const t = new THREE.CanvasTexture(color);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ Aufbau
export function buildSurroundings(scene, Q) {
  const rnd = mulberry(1337);
  const updaters = [];

  // Graffiti-Wand hinter dem Korb
  const wallW = FLOOR.x1 - FLOOR.x0 + 0.6, wallH = 3.4;
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(wallW, wallH, 0.35),
    [null, null, null, null, null, null].map((_, i) => (i === 4
      ? new THREE.MeshStandardMaterial({ map: graffitiWallTex(), roughness: 0.92 })
      : new THREE.MeshStandardMaterial({ color: 0x3a2520, roughness: 0.95 }))),
  );
  wall.position.set(0, wallH / 2, FLOOR.z0 - 0.2);
  wall.receiveShadow = true; wall.castShadow = true;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(wallW + 0.1, 0.12, 0.45), new THREE.MeshStandardMaterial({ color: 0x7a7c80, roughness: 0.9 }));
  cap.position.set(0, wallH + 0.06, FLOOR.z0 - 0.2);
  scene.add(wall, cap);

  // Maschendrahtzäune an den Seiten
  const chain = canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(205,215,225,0.95)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
  }, { repeat: [1, 1] });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x7d8792, metalness: 0.8, roughness: 0.35 });
  const fh = 3.6;
  const fence = (x, z0, z1) => {
    const len = z1 - z0;
    const t = chain.clone();
    t.repeat.set(len * 1.6, fh * 1.6);
    t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, fh), new THREE.MeshStandardMaterial({
      map: t, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4,
    }));
    m.position.set(x, fh / 2, (z0 + z1) / 2);
    m.rotation.y = Math.PI / 2;
    scene.add(m);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 8), postMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x, fh, (z0 + z1) / 2);
    scene.add(rail);
    const n = Math.ceil(len / 3);
    const posts = [];
    for (let i = 0; i <= n; i++) posts.push(new THREE.CylinderGeometry(0.045, 0.045, fh + 0.1, 8).translate(x, (fh + 0.1) / 2, z0 + (len * i) / n));
    const pm = new THREE.Mesh(mergeGeometries(posts), postMat);
    pm.castShadow = true;
    scene.add(pm);
  };
  fence(FLOOR.x0 + 0.05, FLOOR.z0, FLOOR.z1);
  fence(FLOOR.x1 - 0.05, FLOOR.z0, FLOOR.z1);

  // Flutlichter
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(1, 0.95, 0.85), emissiveIntensity: 7, roughness: 0.3 });
  const housing = new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: 0.7, roughness: 0.4 });
  const coneTex = canvasTex(8, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { srgb: false });
  const lamps = [];
  const poleGeos = [], housingGeos = [], lensGeos = [];
  for (const fl of FLOODLIGHTS) {
    const [px, pz] = fl.pole;
    poleGeos.push(new THREE.CylinderGeometry(0.09, 0.14, LAMP_Y, 10).translate(px, LAMP_Y / 2, pz));
    const head = new THREE.Object3D();
    head.position.set(px - Math.sign(px) * 0.5, LAMP_Y, pz);
    head.lookAt(fl.target[0], 0, fl.target[2]);
    head.updateMatrixWorld(true);
    for (let i = 0; i < 4; i++) {
      const lx = (i % 2 - 0.5) * 0.52, ly = (Math.floor(i / 2) - 0.5) * 0.4;
      housingGeos.push(new THREE.BoxGeometry(0.46, 0.34, 0.16).translate(lx, ly, 0).applyMatrix4(head.matrixWorld));
      lensGeos.push(new THREE.PlaneGeometry(0.4, 0.28).translate(lx, ly, 0.085).applyMatrix4(head.matrixWorld));
    }
    housingGeos.push(new THREE.BoxGeometry(1.2, 0.08, 0.08).translate(px - Math.sign(px) * 0.25, LAMP_Y - 0.1, pz));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(1.3, 1.2, 1.0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.position.copy(head.position);
    glow.scale.set(3.2, 3.2, 1);
    scene.add(glow);
    lamps.push({ pos: head.position.clone(), target: new THREE.Vector3(...fl.target) });
    if (fl === FLOODLIGHTS[FLOODLIGHTS.length - 1]) {
      const poles = new THREE.Mesh(mergeGeometries(poleGeos), postMat);
      poles.castShadow = true;
      scene.add(poles, new THREE.Mesh(mergeGeometries(housingGeos), housing), new THREE.Mesh(mergeGeometries(lensGeos), lampMat));
    }

    if (Q.cones) {
      const from = head.position.clone();
      const to = new THREE.Vector3(...fl.target);
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length() * 0.95;
      dir.normalize();
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(len * 0.42, len, 32, 1, true),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(1, 0.93, 0.78), alphaMap: coneTex, transparent: true, opacity: 0.016,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
        }),
      );
      cone.position.copy(from).addScaledVector(dir, len / 2);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
      scene.add(cone);
    }
  }

  // Requisiten: Bänke, Mülleimer, Tasche, Flaschen
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3b4048, metalness: 0.6, roughness: 0.5 });
  const bench = (x, z, rot) => {
    const b = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 0.12), wood);
      s.position.set(0, 0.46, (i - 1) * 0.14);
      s.castShadow = true;
      b.add(s);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.04), wood);
    back.position.set(0, 0.75, -0.24);
    b.add(back);
    for (const sx of [-0.95, 0.95]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.46), metal);
      leg.position.set(sx, 0.23, -0.02);
      b.add(leg);
    }
    b.position.set(x, 0, z);
    b.rotation.y = rot;
    scene.add(b);
  };
  bench(-9.7, 3.2, Math.PI / 2);
  bench(-9.7, 9.5, Math.PI / 2);
  bench(9.7, 6.5, -Math.PI / 2);
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.9, 16), new THREE.MeshStandardMaterial({ color: 0x2f5d3a, metalness: 0.4, roughness: 0.6 }));
  can.position.set(9.9, 0.45, 13.5); can.castShadow = true;
  const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.5, 4, 10), new THREE.MeshStandardMaterial({ color: 0x1b1e25, roughness: 0.7 }));
  bag.rotation.z = Math.PI / 2; bag.position.set(-9.6, 0.18, 6.4); bag.castShadow = true;
  scene.add(can, bag);
  for (let i = 0; i < 3; i++) {
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), new THREE.MeshPhysicalMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.6, roughness: 0.1 }));
    bottle.position.set(-9.3 + i * 0.12, 0.11, 7.2 + (i % 2) * 0.1);
    scene.add(bottle);
  }
  // Ersatzbälle am Rand
  updaters.push(...buildBallRack(scene));

  buildSkyline(scene, rnd, updaters);
  const crowd = buildCrowd(scene, Q, rnd);

  return {
    lamps,
    cheer: (level) => crowd.cheer(level),
    update(dt, time, ballPos) {
      crowd.update(dt, time, ballPos);
      for (const u of updaters) u(dt, time);
    },
  };
}

function buildBallRack(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xc85a1e, roughness: 0.75 });
  for (const [x, z] of [[9.6, 2.1], [9.35, 2.3], [9.75, 2.45]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), mat);
    b.position.set(x, 0.12, z);
    b.castShadow = true;
    scene.add(b);
  }
  return [];
}

// ------------------------------------------------------------------ Skyline
function windowTex(seed, warm) {
  return canvasTex(64, 128, (g, w, h) => {
    const rnd = mulberry(seed);
    g.fillStyle = '#07080f'; g.fillRect(0, 0, w, h);
    for (let y = 3; y < h; y += 8) {
      const floorLit = rnd() < 0.85;
      for (let x = 3; x < w; x += 8) {
        if (!floorLit || rnd() > 0.3) continue;
        const r = rnd();
        g.fillStyle = r < 0.6 ? (warm ? '#ffcf73' : '#ffe2a8') : r < 0.85 ? '#a8d4ff' : '#ff9d6b';
        g.globalAlpha = 0.55 + rnd() * 0.45;
        g.fillRect(x, y, 4, 5);
      }
    }
    g.globalAlpha = 1;
  }, { aniso: 4 });
}

function neonTex(text, color) {
  return canvasTex(512, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = `900 ${text.length > 6 ? 86 : 110}px "Arial Black", system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 30;
    g.strokeStyle = color; g.lineWidth = 10;
    g.strokeText(text, w / 2, h / 2);
    g.shadowBlur = 8;
    g.strokeStyle = '#ffffff'; g.lineWidth = 3;
    g.strokeText(text, w / 2, h / 2);
  });
}

function buildSkyline(scene, rnd, updaters) {
  // Alle Gebäude und Dachaufbauten werden zu wenigen Meshes zusammengeführt (wenige Draw-Calls)
  const texs = [windowTex(1, true), windowTex(2, false), windowTex(3, true), windowTex(4, false)];
  for (const t of texs) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  const bodyCols = [0x080a12, 0x0b0d17, 0x0d0b16, 0x07090c];
  const groups = texs.map(() => []);
  const parts = { tank: [], roof: [], dark: [], ac: [] };
  const lights = [[], []];
  const put = (list, geo, x, y, z, rotY, lx = 0, ly = 0, lz = 0) => {
    geo.translate(lx, ly, lz);
    geo.rotateY(rotY);
    geo.translate(x, y, z);
    list.push(geo);
  };
  for (let i = 0; i < 150; i++) {
    const ang = rnd() * Math.PI * 2;
    // Vorne (hinter der Kamera) etwas weiter weg; zweite Reihe füllt Lücken
    const front = Math.sin(ang) > 0.6;
    const far = i >= 95;
    const dist = far ? 120 + rnd() * 40 : (front ? 70 : 52) + rnd() * 55;
    const w = 7 + rnd() * 12, hgt = (far ? 18 : 8) + Math.pow(rnd(), 1.8) * 38 * (dist / 80), d = 7 + rnd() * 10;
    const x = Math.cos(ang) * dist, z = 6 + Math.sin(ang) * dist;
    const rotY = Math.atan2(-x, 6 - z);
    const geo = new THREE.BoxGeometry(w, hgt, d);
    const rx = Math.max(1, Math.round(w / 4)), ry = Math.max(1, Math.round(hgt / 6));
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * rx, uv.getY(k) * ry);
    put(groups[i % 4], geo, x, 0, z, rotY, 0, hgt / 2, 0);
    const r = rnd();
    if (r < 0.2) {
      put(parts.tank, new THREE.CylinderGeometry(1.2, 1.2, 2.2, 14), x, hgt, z, rotY, 0, 3, 0);
      put(parts.roof, new THREE.ConeGeometry(1.35, 1, 14), x, hgt, z, rotY, 0, 4.6, 0);
      for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) put(parts.dark, new THREE.BoxGeometry(0.12, 2, 0.12), x, hgt, z, rotY, lx, 1, lz);
    } else if (r < 0.5) {
      put(parts.dark, new THREE.CylinderGeometry(0.06, 0.1, 6, 6), x, hgt, z, rotY, 0, 3, 0);
      lights[i % 2].push(x, hgt + 6.1, z);
    } else if (r < 0.75) {
      for (let k = 0; k < 3; k++) {
        put(parts.ac, new THREE.BoxGeometry(1 + rnd(), 0.8, 1 + rnd()), x, hgt, z, rotY, (rnd() - 0.5) * w * 0.6, 0.4, (rnd() - 0.5) * d * 0.6);
      }
    }
  }
  groups.forEach((list, i) => {
    const m = new THREE.Mesh(mergeGeometries(list), new THREE.MeshStandardMaterial({
      color: bodyCols[i], emissive: 0xffffff, emissiveMap: texs[i], emissiveIntensity: 0.55, roughness: 0.9, metalness: 0.2,
    }));
    scene.add(m);
  });
  const partMat = {
    tank: new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x2a1e16, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.8 }),
    ac: new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.8 }),
  };
  for (const k in parts) if (parts[k].length) scene.add(new THREE.Mesh(mergeGeometries(parts[k]), partMat[k]));
  // Blinkende Warnlichter als Punktwolken (zwei Phasen)
  const blink = lights.map((pos) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({
      map: glowTex(), size: 1.8, color: new THREE.Color(3, 0.25, 0.1), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    scene.add(pts);
    return pts;
  });
  updaters.push((dt, time) => {
    const on = Math.sin(time * 2) > 0.2;
    blink[0].material.opacity = on ? 1 : 0.1;
    blink[1].material.opacity = on ? 0.1 : 1;
  });

  // Neonschilder an nahen Gebäuden
  const signs = [
    ['HOOPS', '#ff3da8', -26, -22, 0.35], ['24/7', '#35f2d3', 24, -26, -0.4], ['PIZZA', '#ffb020', -32, 2, 1.1],
    ['BARBER', '#5aa2ff', 30, 4, -1.1], ['NIGHT', '#b36bff', 6, -34, 0],
  ];
  const flick = [];
  for (const [text, col, x, z, rot] of signs) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.2), new THREE.MeshBasicMaterial({
      map: neonTex(text, col), transparent: true, depthWrite: false, toneMapped: false,
      color: new THREE.Color(2.2, 2.2, 2.2), blending: THREE.AdditiveBlending, fog: false,
    }));
    m.position.set(x, 9 + rnd() * 6, z);
    m.rotation.y = rot;
    scene.add(m);
    const back = new THREE.Mesh(new THREE.BoxGeometry(7.4, 2.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x0b0c12, roughness: 0.9 }));
    back.position.copy(m.position).add(new THREE.Vector3(Math.sin(rot) * -0.2, 0, Math.cos(rot) * -0.2));
    back.rotation.y = rot;
    scene.add(back);
    flick.push({ m });
  }
  updaters.push((dt, time) => {
    // Ein Schild flackert
    const f = flick[1];
    const on = Math.sin(time * 23) > -0.2 || Math.sin(time * 1.7) > 0.3;
    f.m.material.opacity = on ? 1 : 0.25;
  });
}

// ------------------------------------------------------------------ Zuschauer
function buildCrowd(scene, Q, rnd) {
  const people = [];
  const SK = ['#f2cfae', '#e3b08a', '#c98d62', '#a36a42', '#7c4b2c', '#533322'];
  const SHIRTS = [0xe8413c, 0x2f7cf6, 0x22c55e, 0xf59e0b, 0xf4f4f4, 0x16181d, 0xa855f7, 0x64748b, 0xec4899];
  const spots = [];
  for (let i = 0; i < Q.crowd; i++) {
    const side = i % 2 ? 1 : -1;
    const z = 0.6 + ((i >> 1) / Math.max(1, Q.crowd / 2)) * 12.5 + rnd() * 0.6;
    const onBench = side === -1 && (Math.abs(z - 3.2) < 1 || Math.abs(z - 9.5) < 1);
    spots.push({ x: side * (onBench ? 9.62 : 8.9 + rnd() * 0.9), z, sit: onBench });
  }
  // Ein gemeinsames Material mit Vertex-Farben für alle Zuschauer
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const colored = (geo, hex, m) => {
    if (m) geo.applyMatrix4(m);
    const c = new THREE.Color(hex);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo.index ? geo.toNonIndexed() : geo;
  };
  const M = (x, y, z, rx = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(sx, sy, sz));
  for (const sp of spots) {
    const g = new THREE.Group();
    const skinC = SK[Math.floor(rnd() * SK.length)];
    const shirtC = SHIRTS[Math.floor(rnd() * SHIRTS.length)];
    const pantsC = rnd() < 0.5 ? 0x1d2433 : 0x3b3f47;
    const s = 0.9 + rnd() * 0.15;
    g.scale.setScalar(s);
    const hipY = sp.sit ? 0.48 : 0.9;
    const body = [];
    for (const lx of [-0.09, 0.09]) {
      if (sp.sit) {
        body.push(colored(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), pantsC, M(lx, hipY, 0.2, Math.PI / 2)));
        body.push(colored(new THREE.CapsuleGeometry(0.06, 0.34, 4, 8), pantsC, M(lx, 0.22, 0.38)));
      } else {
        body.push(colored(new THREE.CapsuleGeometry(0.07, 0.7, 4, 8), pantsC, M(lx, 0.45, 0)));
      }
      body.push(colored(new THREE.BoxGeometry(0.1, 0.06, 0.2), 0xeeeeee, M(lx, 0.03, sp.sit ? 0.44 : 0.04)));
    }
    body.push(colored(new THREE.CapsuleGeometry(0.17, 0.4, 4, 10), shirtC, M(0, hipY + 0.32, 0, 0, 1, 1, 0.7)));
    body.push(colored(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), skinC, M(0, hipY + 0.6, 0)));
    const bodyMesh = new THREE.Mesh(mergeGeometries(body), mat);
    bodyMesh.castShadow = true;
    g.add(bodyMesh);
    const headParts = [colored(new THREE.SphereGeometry(0.11, 14, 10), skinC)];
    if (rnd() < 0.4) {
      const capC = SHIRTS[Math.floor(rnd() * SHIRTS.length)];
      headParts.push(colored(new THREE.SphereGeometry(0.115, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), capC, M(0, 0.03, 0)));
      headParts.push(colored(new THREE.BoxGeometry(0.16, 0.015, 0.12), capC, M(0, 0.04, 0.1)));
    } else if (rnd() < 0.5) {
      headParts.push(colored(new THREE.SphereGeometry(0.114, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), 0x16100c, M(0, 0.012, -0.004)));
    }
    const head = new THREE.Mesh(mergeGeometries(headParts), mat);
    head.position.y = hipY + 0.72;
    head.castShadow = true;
    g.add(head);
    const arms = [];
    for (const ax of [-0.22, 0.22]) {
      const sh = new THREE.Group();
      sh.position.set(ax, hipY + 0.5, 0);
      const arm = new THREE.Mesh(mergeGeometries([
        colored(new THREE.CapsuleGeometry(0.055, 0.2, 4, 8), shirtC, M(0, -0.12, 0)),
        colored(new THREE.CapsuleGeometry(0.045, 0.3, 4, 8), skinC, M(0, -0.35, 0)),
      ]), mat);
      sh.add(arm);
      g.add(sh);
      arms.push(sh);
    }
    g.position.set(sp.x, 0, sp.z);
    g.rotation.y = Math.atan2(-sp.x, 6 - sp.z);
    scene.add(g);
    people.push({ g, head, arms, sit: sp.sit, cheerT: 0, delay: 0, phase: rnd() * 6, base: g.rotation.y });
  }
  const v = new THREE.Vector3();
  return {
    cheer(level = 1) {
      for (const p of people) { p.delay = Math.random() * 0.35; p.cheerT = 1.2 + level * 0.8 + Math.random() * 0.4; }
    },
    update(dt, time, ballPos) {
      for (const p of people) {
        if (p.delay > 0) { p.delay -= dt; continue; }
        p.cheerT = Math.max(0, p.cheerT - dt);
        const c = p.cheerT > 0 ? 1 : 0;
        const jump = c && !p.sit ? Math.abs(Math.sin(time * 9 + p.phase)) * 0.18 : 0;
        p.g.position.y = jump;
        const armUp = c ? 2.7 + Math.sin(time * 12 + p.phase) * 0.3 : 0.1 + Math.sin(time * 1.5 + p.phase) * 0.05;
        p.arms[0].rotation.z = c ? -0.5 : -0.12; p.arms[1].rotation.z = c ? 0.5 : 0.12;
        p.arms[0].rotation.x += (armUp - p.arms[0].rotation.x) * Math.min(1, dt * 10);
        p.arms[1].rotation.x += (armUp - p.arms[1].rotation.x) * Math.min(1, dt * 10);
        if (ballPos) {
          v.copy(ballPos);
          p.g.worldToLocal(v);
          const yaw = Math.max(-1, Math.min(1, Math.atan2(v.x, v.z)));
          p.head.rotation.y += (yaw - p.head.rotation.y) * Math.min(1, dt * 4);
        }
        p.g.rotation.z = Math.sin(time * 1.2 + p.phase) * 0.02;
      }
    },
  };
}
