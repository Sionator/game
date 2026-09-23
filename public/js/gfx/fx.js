// Partikel-Effekte: Feuer, Konfetti/Funken, Staub, Schockwelle, Ball-Schweif
import * as THREE from 'three';
import { glowTex, smokeTex } from './textures.js';

class Pool {
  constructor(scene, n, tex, blending) {
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, blending, depthWrite: false }));
      s.visible = false;
      s.userData = { life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, size: 0.3, grow: 0, drag: 0 };
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
    u.grow = o.grow || 0;
    u.drag = o.drag || 0;
    u.alpha = o.alpha ?? 1;
    s.material.color.set(o.color ?? 0xff8a20);
    if (o.hdr) s.material.color.multiplyScalar(o.hdr);
    s.material.rotation = Math.random() * Math.PI * 2;
    s.visible = true;
  }

  update(dt) {
    for (const s of this.pool) {
      if (!s.visible) continue;
      const u = s.userData;
      u.life -= dt;
      if (u.life <= 0) { s.visible = false; continue; }
      u.vy -= u.g * dt;
      if (u.drag) { const d = Math.max(0, 1 - u.drag * dt); u.vx *= d; u.vy *= d; u.vz *= d; }
      s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt;
      const f = u.life / u.max;
      s.material.opacity = f * u.alpha;
      const sz = u.size * (u.grow ? 1 + (1 - f) * u.grow : 0.5 + f * 0.5);
      s.scale.set(sz, sz, 1);
    }
  }
}

export class Effects {
  constructor(scene) {
    this.glow = new Pool(scene, 320, glowTex(), THREE.AdditiveBlending);
    this.smoke = new Pool(scene, 90, smokeTex(), THREE.NormalBlending);
    // Schockwellen-Ringe (Dunk)
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.8, 1.2, 0.6), transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.userData.t = 0;
      scene.add(m);
      this.rings.push(m);
    }
    this.ri = 0;
  }

  fire(x, y, z, n = 2) {
    for (let i = 0; i < n; i++) {
      this.glow.spawn(x + (Math.random() - 0.5) * 0.15, y + (Math.random() - 0.5) * 0.15, z + (Math.random() - 0.5) * 0.15, {
        vy: 0.8 + Math.random() * 0.9, vx: (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.3,
        life: 0.3 + Math.random() * 0.3, size: 0.26 + Math.random() * 0.22,
        color: Math.random() < 0.5 ? 0xff5a10 : 0xffb030, hdr: 2.6,
      });
    }
  }

  burst(x, y, z, colors, n = 60, power = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI / 2;
      const v = power * (0.4 + Math.random() * 0.6);
      this.glow.spawn(x, y, z, {
        vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(e) * v, vz: Math.sin(a) * Math.cos(e) * v,
        g: 6, life: 0.7 + Math.random() * 0.7, size: 0.1 + Math.random() * 0.12, drag: 0.8,
        color: colors[i % colors.length], hdr: 2.2,
      });
    }
  }

  dust(x, z, n = 4, strength = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.spawn(x + Math.cos(a) * 0.15, 0.08, z + Math.sin(a) * 0.15, {
        vx: Math.cos(a) * 0.9 * strength, vy: 0.25 + Math.random() * 0.3, vz: Math.sin(a) * 0.9 * strength,
        life: 0.6 + Math.random() * 0.4, size: 0.35 * strength + 0.15, grow: 1.6, drag: 2.5,
        color: 0xb9b4ad, alpha: 0.4,
      });
    }
  }

  trail(x, y, z, color = 0xffffff) {
    this.glow.spawn(x, y, z, { life: 0.22, size: 0.2, color, hdr: 0.6, alpha: 0.5 });
  }

  shock(x, y, z) {
    const m = this.rings[this.ri++ % this.rings.length];
    m.position.set(x, y + 0.03, z);
    m.userData.t = 0.6;
    m.visible = true;
    this.dust(x, z, 14, 1.6);
  }

  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
    for (const m of this.rings) {
      if (!m.visible) continue;
      m.userData.t -= dt;
      const f = Math.max(0, m.userData.t / 0.6);
      const s = 0.4 + (1 - f) * 3.2;
      m.scale.set(s, s, s);
      m.material.opacity = f * 0.9;
      if (m.userData.t <= 0) m.visible = false;
    }
  }
}
