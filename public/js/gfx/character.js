// Detaillierte Spielerfigur: Skelett mit durchgehender Haut (Skinning), modellierter Kopf mit Gesicht,
// Frisuren, Händen mit Fingern, Sneakern, Trikot, Shorts und Accessoires – plus prozedurale Animationen.
import * as THREE from 'three';
import { PLAYER, BALL_R } from '/shared/constants.js';
import { textSprite, ringTex, blobTex, mulberry, hash, speckle } from './textures.js';
import {
  tube, merge, placed, headGeometry, headPoint, capGeometry, faceTexture, hairTexture,
  handGeometry, shoeGeometry, canvasTexture, HEAD_R,
} from './charParts.js';

const SKINS = ['#f3d2b3', '#e6b58f', '#cf9468', '#a96e45', '#80502f', '#5a3622', '#3f261a'];
const HAIR = ['#0e0a08', '#16100c', '#2a1a10', '#4a2e1a', '#7a5530', '#c9a063', '#6b2a16'];
const IRIS = ['#3b2416', '#2a1a10', '#4f3a22', '#5b6b3a', '#3d5f86'];
const STYLES = ['buzz', 'fade', 'waves', 'afro', 'dreads', 'cornrows', 'twists', 'hightop', 'bun', 'bald', 'fade', 'buzz'];
const BEARDS = ['none', 'none', 'stubble', 'beard', 'goatee', 'stubble'];
const WORDMARKS = ['KINGS', 'BALLERS', 'NIGHT', 'ASPHALT', 'ROCKETS', 'HOOPERS', 'SKYLINE', 'CAGE'];

// Knochen-Indizes
const HIPS = 0, SP = 1, HEAD = 2, SH_L = 3, EL_L = 4, HA_L = 5, SH_R = 6, EL_R = 7, HA_R = 8;
const HIP_L = 9, KN_L = 10, AN_L = 11, HIP_R = 12, KN_R = 13, AN_R = 14;

// Ruhepose (Körper-lokal)
const REST = { hipsY: 0.93, spineY: 0.1, headY: 0.615, shX: 0.215, shY: 0.43, upper: 0.3, fore: 0.28, hipX: 0.095, thigh: 0.43, shin: 0.43 };

// Ringe: [s, rx, rz, zc, weights, dx?]
const ARM = (SH, EL, HA) => [
  [-0.075, 0.032, 0.042, 0, [[SP, 0.8], [SH, 0.2]], -0.05],
  [-0.045, 0.053, 0.058, 0, [[SP, 0.45], [SH, 0.55]], -0.02],
  [0.0, 0.063, 0.066, 0, [[SH, 0.85], [SP, 0.15]]],
  [0.05, 0.061, 0.062, 0, [[SH, 1]]],
  [0.1, 0.052, 0.057, 0.004, [[SH, 1]]],
  [0.16, 0.049, 0.058, 0.009, [[SH, 1]]],
  [0.22, 0.045, 0.049, 0.004, [[SH, 1]]],
  [0.27, 0.041, 0.043, 0, [[SH, 0.8], [EL, 0.2]]],
  [0.3, 0.039, 0.041, -0.002, [[SH, 0.5], [EL, 0.5]]],
  [0.33, 0.043, 0.042, 0, [[EL, 0.85], [SH, 0.15]]],
  [0.37, 0.046, 0.043, 0.004, [[EL, 1]]],
  [0.43, 0.041, 0.037, 0.002, [[EL, 1]]],
  [0.5, 0.031, 0.031, 0, [[EL, 1]]],
  [0.555, 0.022, 0.028, 0, [[EL, 0.7], [HA, 0.3]]],
  [0.585, 0.022, 0.029, 0, [[HA, 0.8], [EL, 0.2]]],
];
const LEG = (HIP, KN, AN) => [
  [-0.08, 0.075, 0.09, -0.012, [[HIPS, 0.85], [HIP, 0.15]]],
  [-0.03, 0.09, 0.098, -0.006, [[HIPS, 0.45], [HIP, 0.55]]],
  [0.04, 0.09, 0.096, 0, [[HIP, 0.9], [HIPS, 0.1]]],
  [0.12, 0.085, 0.09, 0.005, [[HIP, 1]]],
  [0.22, 0.077, 0.081, 0.004, [[HIP, 1]]],
  [0.32, 0.066, 0.068, 0, [[HIP, 1]]],
  [0.39, 0.057, 0.059, 0.004, [[HIP, 0.85], [KN, 0.15]]],
  [0.43, 0.054, 0.056, 0.007, [[HIP, 0.5], [KN, 0.5]]],
  [0.47, 0.052, 0.055, 0.002, [[KN, 0.85], [HIP, 0.15]]],
  [0.53, 0.054, 0.062, -0.012, [[KN, 1]]],
  [0.6, 0.055, 0.064, -0.014, [[KN, 1]]],
  [0.68, 0.045, 0.05, -0.007, [[KN, 1]]],
  [0.76, 0.036, 0.039, 0, [[KN, 1]]],
  [0.82, 0.033, 0.036, 0, [[KN, 0.6], [AN, 0.4]]],
  [0.87, 0.036, 0.04, 0.004, [[AN, 0.85], [KN, 0.15]]],
];
// Rumpf relativ zur Hüfte (y nach oben)
const TORSO = [
  [0.78, 0.05, 0.052, 0.008, [[HEAD, 0.85], [SP, 0.15]]],
  [0.725, 0.053, 0.056, 0.006, [[HEAD, 0.5], [SP, 0.5]]],
  [0.675, 0.058, 0.06, 0, [[SP, 0.85], [HEAD, 0.15]]],
  [0.635, 0.1, 0.074, -0.01, [[SP, 1]]],
  [0.585, 0.16, 0.088, -0.008, [[SP, 1]]],
  [0.535, 0.188, 0.104, 0.004, [[SP, 1]]],
  [0.46, 0.192, 0.112, 0.012, [[SP, 1]]],
  [0.37, 0.18, 0.108, 0.01, [[SP, 1]]],
  [0.27, 0.163, 0.1, 0.004, [[SP, 1]]],
  [0.18, 0.152, 0.097, 0.002, [[SP, 0.8], [HIPS, 0.2]]],
  [0.1, 0.15, 0.097, 0, [[SP, 0.45], [HIPS, 0.55]]],
  [0.02, 0.155, 0.1, -0.004, [[HIPS, 1]]],
  [-0.06, 0.156, 0.103, -0.014, [[HIPS, 1]]],
  [-0.13, 0.13, 0.09, -0.012, [[HIPS, 1]]],
];
const JERSEY = [
  [0.645, 0.108, 0.082, -0.01, [[SP, 1]]],
  [0.6, 0.168, 0.097, -0.007, [[SP, 1]]],
  [0.545, 0.197, 0.116, 0.004, [[SP, 1]]],
  [0.46, 0.204, 0.125, 0.012, [[SP, 1]]],
  [0.37, 0.193, 0.121, 0.01, [[SP, 1]]],
  [0.27, 0.177, 0.114, 0.004, [[SP, 1]]],
  [0.18, 0.169, 0.111, 0.002, [[SP, 0.8], [HIPS, 0.2]]],
  [0.1, 0.169, 0.113, 0, [[SP, 0.45], [HIPS, 0.55]]],
  [0.02, 0.175, 0.117, -0.004, [[HIPS, 1]]],
  [-0.07, 0.181, 0.121, -0.01, [[HIPS, 1]]],
];
const SHORTS_WAIST = [
  [0.13, 0.163, 0.108, 0, [[HIPS, 0.8], [SP, 0.2]]],
  [0.07, 0.169, 0.113, 0, [[HIPS, 1]]],
  [0.0, 0.179, 0.119, -0.002, [[HIPS, 1]]],
  [-0.08, 0.187, 0.125, -0.012, [[HIPS, 1]]],
  [-0.13, 0.172, 0.116, -0.01, [[HIPS, 1]]],
];
const SHORTS_LEG = (HIP) => [
  [-0.05, 0.1, 0.106, -0.006, [[HIPS, 0.6], [HIP, 0.4]]],
  [0.03, 0.104, 0.11, 0, [[HIP, 0.9], [HIPS, 0.1]]],
  [0.15, 0.108, 0.112, 0, [[HIP, 1]]],
  [0.28, 0.112, 0.115, 0, [[HIP, 1]]],
  [0.4, 0.117, 0.118, 0, [[HIP, 1]]],
];

function isLight(col) { return new THREE.Color(col).getHSL({}).l > 0.62; }
function shade(hex, f) { const c = new THREE.Color(hex).multiplyScalar(f); return '#' + c.getHexString(); }

// ------------------------------------------------------------------ Texturen
function jerseyTexture(color, number, name, wordmark) {
  return canvasTexture(1024, 512, (g, W, H) => {
    const trim = isLight(color) ? '#15171c' : '#f4f4f4';
    const text = isLight(color) ? '#15171c' : '#ffffff';
    const outline = isLight(color) ? '#ffffff' : '#0d0f14';
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, shade(color, 1.08)); gr.addColorStop(1, shade(color, 0.9));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // Mesh-Stoff
    g.fillStyle = 'rgba(0,0,0,.09)';
    for (let y = 2; y < H; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < W; x += 6) g.fillRect(x, y, 2, 2);
    // Seitenpaneele
    for (const cx of [W * 0.25, W * 0.75]) {
      g.fillStyle = shade(color, 0.62); g.fillRect(cx - 40, 0, 80, H);
      g.fillStyle = trim; g.fillRect(cx - 44, 0, 5, H); g.fillRect(cx + 39, 0, 5, H);
    }
    // Paspel an Hals/Armausschnitt und Saum
    g.fillStyle = trim; g.fillRect(0, 0, W, 16);
    g.fillStyle = shade(color, 0.7); g.fillRect(0, 16, W, 5);
    g.fillStyle = trim; g.fillRect(0, H - 14, W, 8);
    const txt = (t, x, y, size, italic = false) => {
      g.font = `${italic ? 'italic ' : ''}900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = size * 0.16; g.strokeStyle = outline; g.strokeText(t, x, y);
      g.lineWidth = size * 0.06; g.strokeStyle = trim === '#f4f4f4' ? shade(color, 0.5) : '#ffffff'; g.strokeText(t, x, y);
      g.fillStyle = text; g.fillText(t, x, y);
    };
    // Vorne: Schriftzug im Bogen + Nummer
    const arc = (word, cx, cy, size) => {
      g.save();
      const R = 520, span = Math.min(0.5, word.length * 0.055);
      for (let i = 0; i < word.length; i++) {
        const a = -span / 2 + (span * (i + 0.5)) / word.length;
        g.save();
        g.translate(cx + Math.sin(a) * R, cy + R - Math.cos(a) * R);
        g.rotate(a);
        txt(word[i], 0, 0, size, true);
        g.restore();
      }
      g.restore();
    };
    arc(wordmark, W * 0.5, H * 0.29, 50);
    txt(number, W * 0.5, H * 0.56, 132);
    // Kleines Logo auf der Brust
    g.fillStyle = trim; g.beginPath(); g.arc(W * 0.56, H * 0.12, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = color; g.font = '900 13px system-ui'; g.fillText('SB', W * 0.56, H * 0.12 + 1);
    // Hinten (über die Naht gezeichnet): Name + große Nummer
    for (const x of [0, W]) {
      txt(name.toUpperCase().slice(0, 12), x, H * 0.24, 40);
      txt(number, x, H * 0.55, 170);
    }
    // Armausschnitte und Halsausschnitt mit Paspel, dann ausstanzen (Alpha)
    const cut = (x, y, rx, ry) => {
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = trim; g.lineWidth = 22;
      g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.stroke();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
    };
    cut(W * 0.25, -6, W * 0.075, H * 0.34);
    cut(W * 0.75, -6, W * 0.075, H * 0.34);
    cut(W * 0.5, -4, W * 0.085, H * 0.15);
    cut(0, -4, W * 0.07, H * 0.07);
    cut(W, -4, W * 0.07, H * 0.07);
  }, { flipY: false });
}

function jerseyBump() {
  return canvasTexture(32, 32, (g, W, H) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#4a4a4a';
    for (let y = 2; y < H; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < W; x += 8) { g.beginPath(); g.arc(x + 2, y + 2, 1.6, 0, Math.PI * 2); g.fill(); }
  }, { srgb: false, repeat: [40, 20] });
}

function shortsTexture(color, logo) {
  return canvasTexture(512, 256, (g, W, H) => {
    const trim = isLight(color) ? '#15171c' : '#f4f4f4';
    const base = shade(color, 0.85);
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    speckle(g, W, H, 3000, 0.05, '255,255,255', '0,0,0', 2);
    // Bund (oberer Teil der Taille, v 0..0.28)
    g.fillStyle = shade(color, 0.55); g.fillRect(0, 0, W, 34);
    g.fillStyle = trim; g.fillRect(0, 34, W, 4);
    g.strokeStyle = '#f4f4f4'; g.lineWidth = 3;           // Kordel vorne
    g.beginPath(); g.moveTo(W / 2 - 6, 18); g.lineTo(W / 2 - 10, 50); g.moveTo(W / 2 + 6, 18); g.lineTo(W / 2 + 10, 50); g.stroke();
    // Seitenstreifen
    for (const cx of [W * 0.25, W * 0.75]) {
      g.fillStyle = shade(color, 0.6); g.fillRect(cx - 22, 38, 44, H);
      g.fillStyle = trim; g.fillRect(cx - 25, 38, 4, H); g.fillRect(cx + 21, 38, 4, H);
    }
    // Saum
    g.fillStyle = trim; g.fillRect(0, H - 16, W, 6);
    // Logo vorne am Bein
    g.fillStyle = trim;
    g.beginPath(); g.arc(W * 0.5, H * 0.62, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = base; g.font = '900 14px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(logo, W * 0.5, H * 0.62 + 1);
  }, { flipY: false });
}

// Arme als Atlas: linke Hälfte = linker Arm, rechte Hälfte = rechter Arm
function armTexture(skin, opts) {
  return canvasTexture(512, 256, (g, W, H) => {
    g.fillStyle = skin; g.fillRect(0, 0, W, H);
    speckle(g, W, H, 5000, 0.04, '255,230,210', '60,30,20', 2);
    const vOf = (s) => ((s + 0.075) / 0.66) * H;
    // leichte Schattierung an Ellbogen und Handgelenk
    for (const s of [0.3, 0.57]) {
      const y = vOf(s);
      const gr = g.createLinearGradient(0, y - 10, 0, y + 10);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(50,25,15,.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, y - 10, W, 20);
    }
    ['L', 'R'].forEach((side, k) => {
      const x0 = k * W / 2, w = W / 2;
      const o = opts[side];
      if (o.sleeve) {
        g.fillStyle = '#121418'; g.fillRect(x0, vOf(-0.01), w, vOf(0.5) - vOf(-0.01));
        g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '900 12px system-ui'; g.textAlign = 'center';
        g.fillText('SB', x0 + w * 0.5, vOf(0.1));
        g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x0, vOf(0.28), w, 3);
      }
      if (o.tattoo) {
        g.strokeStyle = 'rgba(15,15,25,.78)'; g.fillStyle = 'rgba(15,15,25,.78)';
        if (o.tattoo === 'band') {
          g.lineWidth = 4;
          const y = vOf(0.13);
          g.beginPath(); g.moveTo(x0, y - 8); g.lineTo(x0 + w, y - 8); g.moveTo(x0, y + 10); g.lineTo(x0 + w, y + 10); g.stroke();
          for (let x = x0; x < x0 + w; x += 16) { g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 8, y + 8); g.lineTo(x + 16, y - 6); g.fill(); }
        } else if (o.tattoo === 'script') {
          g.font = 'italic 700 26px "Brush Script MT", cursive, serif'; g.textAlign = 'center';
          g.save(); g.translate(x0 + w * 0.5, vOf(0.44)); g.fillText(o.word, 0, 0); g.restore();
        } else {
          // Ärmel-Tattoo aus Sternen und Ornamenten
          for (let i = 0; i < 14; i++) {
            const x = x0 + Math.random() * w, y = vOf(0.02 + Math.random() * 0.45);
            star(g, x, y, 5 + Math.random() * 7);
          }
          g.lineWidth = 2;
          for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(x0 + Math.random() * w, vOf(Math.random() * 0.5), 6 + Math.random() * 10, 0, Math.PI * 1.5); g.stroke(); }
        }
      }
    });
  }, { flipY: false });
}

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    i ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}

// Beine als Atlas: Haut, Socken, optional Tights / Kniebandage
function legTexture(skin, opts) {
  return canvasTexture(512, 256, (g, W, H) => {
    g.fillStyle = skin; g.fillRect(0, 0, W, H);
    speckle(g, W, H, 5000, 0.04, '255,230,210', '60,30,20', 2);
    const vOf = (s) => ((s + 0.08) / 0.95) * H;
    const ky = vOf(0.43);
    const kg = g.createLinearGradient(0, ky - 12, 0, ky + 12);
    kg.addColorStop(0, 'rgba(0,0,0,0)'); kg.addColorStop(0.5, 'rgba(50,25,15,.12)'); kg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = kg; g.fillRect(0, ky - 12, W, 24);
    ['L', 'R'].forEach((side, k) => {
      const x0 = k * W / 2, w = W / 2;
      if (opts.tights) { g.fillStyle = '#121418'; g.fillRect(x0, 0, w, vOf(0.62)); }
      if (opts.kneeSleeve === side) {
        g.fillStyle = '#16181d'; g.fillRect(x0, vOf(0.34), w, vOf(0.53) - vOf(0.34));
        g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x0, vOf(0.34), w, 2); g.fillRect(x0, vOf(0.53) - 2, w, 2);
      }
      // Socken
      const sy = vOf(opts.sockTop);
      g.fillStyle = opts.sock; g.fillRect(x0, sy, w, H - sy);
      g.fillStyle = opts.sockStripe; g.fillRect(x0, sy + 6, w, 4); g.fillRect(x0, sy + 13, w, 4);
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x0, sy, w, 3);
    });
  }, { flipY: false });
}

// ------------------------------------------------------------------ Spieler
export class PlayerView {
  constructor(scene, info, { isMe, isMate, fx, lookTarget }) {
    this.id = info.id;
    this.scene = scene;
    this.fx = fx;
    this.lookTarget = lookTarget;
    const seed = hash(info.name + '|' + info.id);
    const rnd = mulberry(seed);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const col = new THREE.Color(info.color);
    const skinC = pick(SKINS);
    const hairC = rnd() < 0.07 ? info.color : pick(HAIR);
    const style = pick(STYLES);
    const beard = pick(BEARDS);
    const number = String((seed % 98) + 1);
    const headShape = rnd();
    const light = isLight(info.color);

    // --- Materialien
    const physSkin = (map) => new THREE.MeshPhysicalMaterial({
      color: map ? 0xffffff : skinC, map, roughness: 0.52, sheen: 0.45, sheenRoughness: 0.5,
      sheenColor: new THREE.Color(skinC).lerp(new THREE.Color(0xffc2a0), 0.5),
    });
    const skin = physSkin(null);
    const lip = shade(skinC, 0.78).replace('#', '#');
    const painted = ['buzz', 'fade', 'waves'].includes(style) ? style
      : ['dreads', 'twists', 'afro', 'cornrows', 'bun'].includes(style) ? 'buzz' : style === 'hightop' ? 'fade' : null;
    const faceMat = physSkin(faceTexture({ skin: skinC, hairColor: hairC, painted, stubble: beard === 'stubble' || beard === 'beard', lip }));
    const armOpts = {
      L: { tattoo: rnd() < 0.3 ? pick(['band', 'script', 'sleeve']) : null, sleeve: false, word: pick(['Loyalty', 'Family', 'Ball is Life', 'Hustle']) },
      R: { tattoo: rnd() < 0.2 ? pick(['band', 'sleeve']) : null, sleeve: rnd() < 0.3, word: 'Hustle' },
    };
    const armMat = physSkin(armTexture(skinC, armOpts));
    const sock = rnd() < 0.55 ? '#f2f2f2' : '#15171c';
    const legOpts = {
      tights: rnd() < 0.2, kneeSleeve: rnd() < 0.3 ? pick(['L', 'R']) : null,
      sock, sockStripe: rnd() < 0.5 ? info.color : (sock === '#f2f2f2' ? '#15171c' : '#f2f2f2'), sockTop: 0.7 + rnd() * 0.08,
    };
    const legMat = physSkin(legTexture(skinC, legOpts));
    const jerseyMat = new THREE.MeshStandardMaterial({
      map: jerseyTexture(info.color, number, info.name, WORDMARKS[hash(info.color) % WORDMARKS.length]),
      bumpMap: jerseyBump(), bumpScale: 0.6, roughness: 0.78, side: THREE.DoubleSide, alphaTest: 0.5,
    });
    const shortsMat = new THREE.MeshPhysicalMaterial({
      map: shortsTexture(info.color, 'SB'), roughness: 0.55, sheen: 0.8, sheenRoughness: 0.35,
      sheenColor: new THREE.Color(info.color).lerp(new THREE.Color(0xffffff), 0.4), side: THREE.DoubleSide,
    });
    const hairKind = style === 'cornrows' ? 'cornrows' : ['afro', 'twists'].includes(style) ? 'coil' : 'strands';
    const hairTex = hairTexture(hairC, hairKind);
    const hairMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: hairTex.map, bumpMap: hairTex.bump, bumpScale: 2, roughness: 0.9 });
    const beardTex = hairTexture(hairC, 'coil');
    const beardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: beardTex.map, bumpMap: beardTex.bump, bumpScale: 2.5, roughness: 0.8, transparent: true, opacity: 0.92 });
    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xefe9e1, roughness: 0.25 });
    const iris = new THREE.MeshStandardMaterial({ color: pick(IRIS), roughness: 0.15 });
    const pupil = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1 });
    const shoeC = pick(['#f5f5f5', '#f5f5f5', '#111317', info.color, '#e11d48', '#f5f5f5']);
    const shoeMat = new THREE.MeshPhysicalMaterial({ color: shoeC, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.4 });
    const soleMat = new THREE.MeshStandardMaterial({ color: rnd() < 0.3 ? 0xb5702e : (shoeC === '#111317' ? 0xf2f2f2 : 0x1d2026), roughness: 0.8 });
    const midMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 });
    const accentC = shoeC.toLowerCase() === info.color.toLowerCase() ? (light ? '#15171c' : '#f5f5f5') : info.color;
    const accentMat = new THREE.MeshStandardMaterial({ color: accentC, roughness: 0.45 });
    const bandMat = new THREE.MeshStandardMaterial({ color: light ? 0x15171c : col, roughness: 0.75 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 1, roughness: 0.25 });

    // --- Skelett
    this.root = new THREE.Group();
    this.body = new THREE.Group();          // für Hinfallen
    this.root.add(this.body);
    const s = 0.97 + rnd() * 0.06;          // Größe
    this.body.scale.setScalar(s);
    const bone = (parent, x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); parent.add(b); return b; };
    this.hips = bone(this.body, 0, REST.hipsY, 0);
    this.spine = bone(this.hips, 0, REST.spineY, 0);
    this.head = bone(this.spine, 0, REST.headY, 0);
    const mkArm = (side) => {
      const sh = bone(this.spine, side * REST.shX, REST.shY, 0);
      const elbow = bone(sh, 0, -REST.upper, 0);
      const hand = bone(elbow, 0, -REST.fore, 0);
      return { sh, elbow, hand };
    };
    this.armL = mkArm(1);
    this.armR = mkArm(-1);
    const mkLeg = (side) => {
      const hip = bone(this.hips, side * REST.hipX, -0.02, 0);
      const knee = bone(hip, 0, -REST.thigh, 0);
      const ankle = bone(knee, 0, -REST.shin, 0);
      return { hip, knee, ankle };
    };
    this.legL = mkLeg(1);
    this.legR = mkLeg(-1);
    const bones = [this.hips, this.spine, this.head, this.armL.sh, this.armL.elbow, this.armL.hand,
      this.armR.sh, this.armR.elbow, this.armR.hand, this.legL.hip, this.legL.knee, this.legL.ankle,
      this.legR.hip, this.legR.knee, this.legR.ankle];
    const skeleton = new THREE.Skeleton(bones);

    // --- Haut und Kleidung (durchgehend, mit Skinning)
    const hy = REST.hipsY;
    const shY = hy + REST.spineY + REST.shY;
    const ring = ([s0, rx, rz, zc, w, extra], toPos) => {
      const r = { c: toPos(s0, zc), rx, rz, w };
      if (typeof extra === 'function') r.yOff = extra;
      if (typeof extra === 'number') r.c[0] += extra;
      return r;
    };
    const armRings = (side, SH, EL, HA) => ARM(SH, EL, HA).map((r) => {
      const rr = ring(r, (s0, zc) => [side * REST.shX, shY - s0, zc]);
      if (typeof r[5] === 'number') rr.c[0] = side * (REST.shX + r[5]);
      return rr;
    });
    const legRings = (side, HIP, KN, AN) => LEG(HIP, KN, AN).map((r) => ring(r, (s0, zc) => [side * REST.hipX, hy - 0.02 - s0, zc]));
    const up = (r) => ring(r, (y, zc) => [0, hy + y, zc]);

    const skinned = (geo, mat, shadow = true) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.castShadow = shadow;
      m.frustumCulled = false;
      this.body.add(m);
      return m;
    };
    const meshes = [
      skinned(tube(TORSO.map(up), { seg: 26 }), skin),
      skinned(merge([
        tube(armRings(1, SH_L, EL_L, HA_L), { seg: 18, u0: 0, u1: 0.5 }),
        tube(armRings(-1, SH_R, EL_R, HA_R), { seg: 18, u0: 0.5, u1: 1 }),
      ]), armMat),
      skinned(merge([
        tube(legRings(1, HIP_L, KN_L, AN_L), { seg: 18, u0: 0, u1: 0.5 }),
        tube(legRings(-1, HIP_R, KN_R, AN_R), { seg: 18, u0: 0.5, u1: 1 }),
      ]), legMat),
      skinned(tube(JERSEY.map(up), { seg: 30 }), jerseyMat),
      skinned(merge([
        tube(SHORTS_WAIST.map(up), { seg: 28, v0: 0, v1: 0.28 }),
        tube(SHORTS_LEG(HIP_L).map((r) => ring(r, (s0, zc) => [REST.hipX, hy - 0.02 - s0, zc])), { seg: 20, v0: 0.28, v1: 1 }),
        tube(SHORTS_LEG(HIP_R).map((r) => ring(r, (s0, zc) => [-REST.hipX, hy - 0.02 - s0, zc])), { seg: 20, v0: 0.28, v1: 1 }),
      ]), shortsMat),
    ];
    this.root.updateMatrixWorld(true);
    for (const m of meshes) m.bind(skeleton);

    // --- Starre Teile je Knochen und Material zusammenführen
    const rigid = new Map();
    const addRigid = (b, mat, geo, shadow = false) => {
      if (!rigid.has(b)) rigid.set(b, new Map());
      const m = rigid.get(b);
      if (!m.has(mat)) m.set(mat, { geos: [], shadow: false });
      const e = m.get(mat);
      e.geos.push(geo);
      e.shadow = e.shadow || shadow;
    };

    // Kopf
    const C = new THREE.Vector3(0, 0.1, 0.008);           // Kopfmitte relativ zum Kopfknochen
    const hp = (x, y, z, sc = 1) => headPoint(x, y, z, sc, headShape).add(C);
    const headGeo = headGeometry(headShape);
    headGeo.translate(C.x, C.y, C.z);
    addRigid(this.head, faceMat, headGeo, true);
    // Ohren
    for (const sd of [-1, 1]) {
      const p = hp(sd, 0.02, -0.08);
      addRigid(this.head, skin, placed(new THREE.SphereGeometry(0.028, 14, 10), { p: [p.x + sd * 0.004, p.y, p.z], r: [0, sd * 0.35, 0], s: [0.38, 1, 0.7] }));
      addRigid(this.head, skin, placed(new THREE.SphereGeometry(0.011, 8, 6), { p: [p.x + sd * 0.004, p.y - 0.025, p.z + 0.004] }));
      if (rnd() < 0.3) addRigid(this.head, gold, placed(new THREE.SphereGeometry(0.0055, 8, 6), { p: [p.x + sd * 0.009, p.y - 0.03, p.z + 0.004] }));
    }
    // Nase
    {
      const top = hp(0, 0.07, 1), tip = hp(0, -0.13, 1);
      tip.z += 0.016;
      const d = new THREE.Vector3().subVectors(tip, top);
      const bridge = new THREE.CylinderGeometry(0.006, 0.0105, d.length(), 10);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.clone().normalize());
      addRigid(this.head, skin, bridge.applyMatrix4(new THREE.Matrix4().compose(top.clone().addScaledVector(d, 0.5), q, new THREE.Vector3(1, 1, 0.8))));
      addRigid(this.head, skin, placed(new THREE.SphereGeometry(0.0112, 12, 10), { p: [tip.x, tip.y, tip.z - 0.004] }));
      for (const sd of [-1, 1]) addRigid(this.head, skin, placed(new THREE.SphereGeometry(0.0078, 10, 8), { p: [sd * 0.0115, tip.y - 0.003, tip.z - 0.011], s: [1, 0.85, 1] }));
    }
    // Augen mit Lidern und Brauen
    for (const sd of [-1, 1]) {
      const e = hp(sd * 0.36, 0.16, 0.92, 0.972);
      addRigid(this.head, eyeWhite, placed(new THREE.SphereGeometry(0.0135, 16, 12), { p: [e.x, e.y, e.z], s: [1, 0.78, 0.75] }));
      addRigid(this.head, iris, placed(new THREE.SphereGeometry(0.0074, 14, 10), { p: [e.x, e.y, e.z + 0.0088], s: [1, 1, 0.45] }));
      addRigid(this.head, pupil, placed(new THREE.SphereGeometry(0.0036, 10, 8), { p: [e.x, e.y, e.z + 0.0115], s: [1, 1, 0.4] }));
      addRigid(this.head, skin, placed(new THREE.SphereGeometry(0.0148, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), { p: [e.x, e.y + 0.001, e.z], r: [0.55, 0, 0], s: [1.04, 0.85, 0.82] }));
      addRigid(this.head, skin, placed(new THREE.TorusGeometry(0.0115, 0.0022, 6, 14, Math.PI), { p: [e.x, e.y - 0.004, e.z + 0.003], r: [Math.PI + 0.2, 0, 0], s: [1.05, 0.55, 1] }));
      const brow = new THREE.CatmullRomCurve3([hp(sd * 0.15, 0.3, 0.95, 1.02), hp(sd * 0.34, 0.335, 0.9, 1.02), hp(sd * 0.52, 0.28, 0.82, 1.02)]);
      addRigid(this.head, beardMat, new THREE.TubeGeometry(brow, 10, 0.0045, 5, false));
    }
    // Haare
    this.buildHair(style, (g, sh = true) => addRigid(this.head, hairMat, g, sh), hp, C, headShape, rnd);
    // Bart
    if (beard === 'beard' || beard === 'goatee') {
      const mus = hp(0, -0.27, 0.97, 1.02);
      addRigid(this.head, beardMat, placed(new THREE.CapsuleGeometry(0.006, 0.03, 3, 8), { p: [mus.x, mus.y, mus.z], r: [0, 0, Math.PI / 2], s: [1, 1, 0.8] }));
    }
    if (beard === 'beard') {
      const bg = new THREE.SphereGeometry(1, 36, 14, Math.PI / 2 - 1.45, 2.9, Math.PI * 0.67, Math.PI * 0.22);
      const p = bg.attributes.position;
      for (let i = 0; i < p.count; i++) {
        // am Kinn etwas dicker, zu den Ohren hin dünner
        const front = Math.max(0, p.getZ(i));
        const v = headPoint(p.getX(i), p.getY(i), p.getZ(i), 1.018 + front * 0.03, headShape).add(C);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      bg.computeVertexNormals();
      addRigid(this.head, beardMat, bg, true);
    } else if (beard === 'goatee') {
      const ch = hp(0, -0.62, 0.8, 1.02);
      addRigid(this.head, beardMat, placed(new THREE.SphereGeometry(0.02, 12, 10), { p: [ch.x, ch.y, ch.z], s: [1, 1.2, 0.7] }));
    }
    // Stirnband
    if (rnd() < 0.45 && !['afro', 'hightop'].includes(style)) {
      const hb = new THREE.CylinderGeometry(1, 1.02, 0.026, 40, 1, true);
      const p = hb.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = headPoint(p.getX(i), 0.38 + p.getY(i) * 0.9, p.getZ(i), 1.035, headShape).add(C);
        p.setXYZ(i, v.x, v.y + p.getY(i) * 0.9, v.z);
      }
      hb.computeVertexNormals();
      addRigid(this.head, bandMat, hb);
    }
    // Kette
    if (rnd() < 0.3) {
      addRigid(this.spine, gold, placed(new THREE.TorusGeometry(0.075, 0.0042, 6, 40), { p: [0, 0.575, 0.012], r: [Math.PI / 2 - 0.45, 0, 0], s: [1, 0.85, 1] }));
      addRigid(this.spine, gold, placed(new THREE.CylinderGeometry(0.013, 0.013, 0.004, 16), { p: [0, 0.535, 0.108], r: [Math.PI / 2 - 0.2, 0, 0] }));
    }
    // Hände
    addRigid(this.armL.hand, skin, handGeometry(1), true);
    addRigid(this.armR.hand, skin, handGeometry(-1), true);
    // Schweißbänder
    const wbL = rnd() < 0.5, wbR = rnd() < 0.4;
    if (wbL) addRigid(this.armL.elbow, bandMat, placed(new THREE.CylinderGeometry(0.034, 0.033, 0.05, 18), { p: [0, -0.235, 0], s: [0.85, 1, 1.05] }));
    if (wbR) addRigid(this.armR.elbow, bandMat, placed(new THREE.CylinderGeometry(0.034, 0.033, 0.05, 18), { p: [0, -0.235, 0], s: [0.85, 1, 1.05] }));
    // Schuhe
    const shoe = shoeGeometry();
    for (const leg of [this.legL, this.legR]) {
      addRigid(leg.ankle, shoeMat, shoe.upper, true);
      addRigid(leg.ankle, soleMat, shoe.sole, true);
      addRigid(leg.ankle, midMat, shoe.mid);
      addRigid(leg.ankle, accentMat, shoe.accent);
    }
    for (const [b, mats] of rigid) {
      for (const [mat, e] of mats) {
        const m = new THREE.Mesh(merge(e.geos), mat);
        m.castShadow = e.shadow;
        b.add(m);
      }
    }

    // --- Namensschild, Ring, Schatten, Emote
    this.label = textSprite(info.name + (info.bot ? ' 🤖' : ''), {
      color: isMe ? '#ffe08a' : isMate ? '#bbf7d0' : '#ffffff', accent: info.color,
    });
    this.label.position.y = 2.35;
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
    this.emote.position.y = 2.75;
    this.emote.visible = false;
    this.root.add(this.emote);
    this.emoteT = 0;

    scene.add(this.root);
    this.runPhase = rnd() * 6;
    this.dribblePhase = rnd() * 6;
    this.lastBounce = 1;
    this.reachT = 0;
    this.celebrateT = 0;
    this.followT = 0;
    this.landT = 0;
    this.wasShooting = false;
    this.wasAir = false;
    this.fallAmt = 0;
    this.f = 0;
    this.time = rnd() * 10;
    this.handX = -PLAYER.handX;   // lokales x des Balls: negativ = rechte Hand
    this.crossMv = '';
    this.q = {};                  // aktuelle Gelenkwinkel (geglättet)
    this._v = new THREE.Vector3();
  }

  // Frisuren: add(geo) fügt Haar-Geometrie am Kopf hinzu
  buildHair(style, add, hp, C, shape, rnd) {
    const cap = (scale, theta, tilt) => { const g = capGeometry(scale, theta, tilt, shape); g.translate(C.x, C.y, C.z); return g; };
    if (style === 'afro') {
      const g = new THREE.IcosahedronGeometry(1, 5);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = 1 + (Math.sin(x * 23) * Math.sin(y * 19) * Math.sin(z * 21)) * 0.035 + (Math.random() - 0.5) * 0.02;
        p.setXYZ(i, x * n * 0.158, y * n * 0.14, z * n * 0.162);
      }
      g.computeVertexNormals();
      g.translate(C.x, C.y + 0.06, C.z - 0.018);
      add(g);
    } else if (style === 'dreads') {
      add(cap(1.03, Math.PI * 0.52, -0.42));
      const parts = [];
      for (let k = 0; k < 26; k++) {
        const a = Math.PI * 0.5 + (k / 26) * Math.PI * 1.9 - Math.PI * 0.95 + Math.PI; // um den Hinterkopf herum
        const el = 0.15 + (k % 3) * 0.12;
        const dx = Math.sin(a) * Math.cos(el), dz = Math.cos(a) * Math.cos(el), dy = Math.sin(el);
        if (dz > 0.3) continue;
        const start = hp(dx, dy, dz, 1.03);
        const out = new THREE.Vector3(dx, 0, dz).normalize();
        const len = 0.2 + rnd() * 0.1;
        const pts = [start, start.clone().addScaledVector(out, 0.03).add(new THREE.Vector3(0, -0.04, 0)),
          start.clone().addScaledVector(out, 0.045).add(new THREE.Vector3(0, -len * 0.6, 0)),
          start.clone().addScaledVector(out, 0.05).add(new THREE.Vector3((rnd() - 0.5) * 0.03, -len, (rnd() - 0.5) * 0.02))];
        parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.011, 6, false));
      }
      add(merge(parts));
    } else if (style === 'cornrows') {
      const g = cap(1.022, Math.PI * 0.6, -0.45);
      // Planare UVs von vorne nach hinten → parallele Zöpfe
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) / HEAD_R + 1) * 0.5 * 1.6, (p.getZ(i) / HEAD_R + 1) * 0.5 * 1.6);
      add(g);
    } else if (style === 'twists') {
      const parts = [];
      for (let k = 0; k < 70; k++) {
        const a = rnd() * Math.PI * 2, el = 0.25 + rnd() * 1.25;
        const dx = Math.sin(a) * Math.cos(el), dz = Math.cos(a) * Math.cos(el), dy = Math.sin(el);
        if (dz > 0.55 && dy < 0.55) continue;
        const p = hp(dx, dy, dz, 1.05);
        const n = new THREE.Vector3(dx, dy, dz).normalize();
        const g = new THREE.CapsuleGeometry(0.013, 0.02, 3, 6);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
        parts.push(g.applyMatrix4(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1))));
      }
      add(merge(parts));
    } else if (style === 'hightop') {
      const g = new THREE.CylinderGeometry(0.072, 0.08, 0.085, 28, 2);
      g.scale(1, 1, 1.13);
      g.translate(C.x, C.y + 0.1, C.z - 0.006);
      add(g);
    } else if (style === 'bun') {
      add(cap(1.028, Math.PI * 0.58, -0.3));
      const b = hp(0, 0.55, -0.8, 1.15);
      add(placed(new THREE.SphereGeometry(0.036, 16, 12), { p: [b.x, b.y, b.z] }));
      add(placed(new THREE.TorusGeometry(0.02, 0.006, 6, 16), { p: [b.x, b.y - 0.018, b.z + 0.02], r: [1.1, 0, 0] }), false);
    }
  }

  showEmote(text) {
    this.emote.userData.draw(text);
    this.emote.visible = true;
    this.emoteT = 2.4;
  }

  reach() { this.reachT = 0.32; }
  celebrate() { this.celebrateT = 1.8; }

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
    this.hips.position.y = 0.93 + q.hipsY;
    this.legL.hip.rotation.set(q.hipLx, 0, q.hipLz);
    this.legR.hip.rotation.set(q.hipRx, 0, q.hipRz);
    this.legL.knee.rotation.x = q.kneeL;
    this.legR.knee.rotation.x = q.kneeR;
    // Füße bleiben ungefähr flach
    this.legL.ankle.rotation.x = -(q.hipLx + q.kneeL) * 0.8;
    this.legR.ankle.rotation.x = -(q.hipRx + q.kneeR) * 0.8;
    this.armL.sh.rotation.set(q.shLx, 0, q.shLz);
    this.armR.sh.rotation.set(q.shRx, 0, q.shRz);
    this.armL.elbow.rotation.x = q.elL;
    this.armR.elbow.rotation.x = q.elR;
    this.armL.hand.rotation.x = q.handLx;
    this.armR.hand.rotation.x = q.handRx;
    this.spine.rotation.set(q.spineX, q.spineY, q.spineZ);
    this.head.rotation.set(q.headX, q.headY, 0);
    this.body.rotation.x = 0;
    this.body.position.z = -this.fallAmt * 0.15;

    // Staub beim Sprinten
    if (this.fx && !air && speed > 6 && Math.random() < dt * 6) this.fx.dust(s.x, s.z, 1, 0.35);

    if (this.emoteT > 0) {
      this.emoteT -= dt;
      this.emote.position.y = 2.75 + (2.4 - this.emoteT) * 0.12;
      this.emote.material.opacity = Math.min(1, this.emoteT * 2);
      if (this.emoteT <= 0) this.emote.visible = false;
    }
    this.label.position.y = 2.35 - this.fallAmt * 0.6;
    this.root.updateMatrixWorld(true);
  }

  ballAnchor(s, out) {
    const shooting = s.st === 'shoot' || s.shootingLocal;
    if (s.st === 'dunk' || shooting || this.followT > 0.45) {
      // Ball liegt in der Wurfhand (auf der Handfläche)
      this.armR.hand.localToWorld(out.set(0, -0.07, 0.01));
      out.y += BALL_R * 0.75;
      return out;
    }
    const c = Math.abs(Math.cos(this.dribblePhase));
    const cross = 1 - Math.min(1, Math.abs(this.handX) / PLAYER.handX); // 0 = in der Hand, 1 = mitten im Wechsel
    const z = 0.34 + cross * (this.crossMv === 'legs' ? -0.3 : 0.14);
    const h = BALL_R + c * (0.74 - cross * 0.4);
    out.set(this.handX, h, z);
    this.root.localToWorld(out);
    out.y = h + Math.max(0, s.y) * 0.8;
    return out;
  }

  dispose() {
    this.scene.remove(this.root);
    this.scene.remove(this.ground);
  }
}
