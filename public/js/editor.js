// Spieler-Editor: Aussehen zusammenstellen, 3D-Vorschau im Canvas, Speichern im Browser
import {
  LOOK_BODIES, LOOK_SKIN, LOOK_HAIR, LOOK_HAIR_COL, LOOK_BEARD, LOOK_SHOE, LOOK_TATTOO, LOOK_FACE, LOOK_EYES, DEFAULT_LOOK, sanitizeLook,
} from '/shared/look.js';

const $ = (s) => document.querySelector(s);
const ACC = [['headband', 'Stirnband'], ['wristbands', 'Schweißbänder'], ['chain', 'Kette'], ['armSleeve', 'Arm-Sleeve'], ['kneeSleeve', 'Knie-Bandage']];
const SPOT = { x: 0, z: 9 };

export function loadLook(store) {
  try { return sanitizeLook(JSON.parse(store.get('sb_look', 'null'))) || { ...DEFAULT_LOOK }; } catch { return { ...DEFAULT_LOOK }; }
}

export function createEditor({ world, S, store, showScreen, onSave }) {
  let look = null, view = null, yaw = 0.35, camMode = 'full', open = false, dirty = 0;
  const { THREE } = world;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();

  const isFemale = () => look.body.startsWith('f_');

  // ---------- UI-Bausteine
  const grid = (el, items, key, label, sub) => {
    el.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.dataset.v = it[0];
      b.innerHTML = label(it) + (sub ? `<small>${sub(it)}</small>` : '');
      b.onclick = () => { look[key] = it[0]; refresh(); };
      el.appendChild(b);
    }
  };
  const swatches = (el, list, key) => {
    el.innerHTML = '';
    for (const c of list) {
      const b = document.createElement('button');
      b.dataset.v = c;
      if (c === 'team') { b.classList.add('team'); b.title = 'Teamfarbe'; } else { b.style.background = c; b.title = c; }
      b.onclick = () => { look[key] = c; refresh(); };
      el.appendChild(b);
    }
  };
  const mark = (el, v) => { for (const b of el.children) b.classList.toggle('on', b.dataset.v === String(v)); };

  grid($('#edBody'), LOOK_BODIES.map((b) => [b.id, b]), 'body', ([, b]) => b.name, ([, b]) => b.h);
  swatches($('#edSkin'), LOOK_SKIN, 'skin');
  swatches($('#edEyes'), LOOK_EYES, 'eyes');
  const faceEl = $('#edFace');
  for (const [k, lo, hi] of LOOK_FACE) {
    const l = document.createElement('label');
    l.innerHTML = `<span>${lo}</span><input type="range" min="-100" max="100" step="5" data-k="${k}"><span>${hi}</span>`;
    l.querySelector('input').oninput = (e) => { look.face = { ...look.face, [k]: +e.target.value / 100 }; dirty = 0.25; };
    faceEl.appendChild(l);
  }
  $('#edFaceReset').onclick = () => { look.face = {}; refresh(); };
  grid($('#edHair'), LOOK_HAIR, 'hair', (h) => h[1]);
  swatches($('#edHairCol'), LOOK_HAIR_COL, 'hairCol');
  grid($('#edBeard'), LOOK_BEARD, 'beard', (b) => b[1]);
  swatches($('#edShoe'), LOOK_SHOE, 'shoe');
  grid($('#edTattoo'), LOOK_TATTOO, 'tattoo', (t) => t[1]);
  const acc = $('#edAcc');
  for (const [k, name] of ACC) {
    const b = document.createElement('button');
    b.dataset.k = k; b.textContent = name;
    b.onclick = () => { look[k] = !look[k]; refresh(); };
    acc.appendChild(b);
  }
  $('#edNum').oninput = () => { look.num = Math.max(0, Math.min(99, parseInt($('#edNum').value, 10) || 0)); dirty = 0.35; };

  function refresh(rebuild = true) {
    look = sanitizeLook(look);
    mark($('#edBody'), look.body); mark($('#edSkin'), look.skin); mark($('#edHair'), look.hair); mark($('#edHairCol'), look.hairCol);
    mark($('#edEyes'), look.eyes);
    for (const inp of faceEl.querySelectorAll('input')) inp.value = Math.round((look.face[inp.dataset.k] || 0) * 100);
    mark($('#edBeard'), look.beard); mark($('#edShoe'), look.shoe); mark($('#edTattoo'), look.tattoo);
    for (const b of acc.children) b.classList.toggle('on', !!look[b.dataset.k]);
    $('#edBeardF').style.display = isFemale() ? 'none' : '';
    if (document.activeElement !== $('#edNum')) $('#edNum').value = look.num;
    if (rebuild) dirty = 0.05;                               // kurz sammeln, dann neu bauen
  }

  function rebuildView() {
    if (view) view.dispose();
    view = world.addPlayer({ id: 'editor', name: S.name || 'Du', color: S.color, body: 'c', look }, true, false);
    view.lookTarget = null;
    view.label.visible = false;
  }

  function randomize() {
    const r = (a) => a[Math.floor(Math.random() * a.length)];
    look = {
      body: r(LOOK_BODIES).id, skin: r(LOOK_SKIN), hair: r(LOOK_HAIR)[0], hairCol: r(LOOK_HAIR_COL.slice(0, 7)),
      beard: r(LOOK_BEARD)[0], num: Math.floor(Math.random() * 100), shoe: r(LOOK_SHOE),
      headband: Math.random() < 0.3, wristbands: Math.random() < 0.5, chain: Math.random() < 0.3,
      armSleeve: Math.random() < 0.3, kneeSleeve: Math.random() < 0.2, tattoo: r(LOOK_TATTOO)[0],
      eyes: r(LOOK_EYES), face: Object.fromEntries(LOOK_FACE.map(([k]) => [k, Math.round((Math.random() * 2 - 1) * 0.7 * 20) / 20])),
    };
    refresh();
  }

  // Drehen per Ziehen
  const vp = $('.edview');
  let drag = null;
  vp.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; drag = e.clientX; vp.setPointerCapture(e.pointerId); vp.style.cursor = 'grabbing'; });
  vp.addEventListener('pointermove', (e) => { if (drag === null) return; yaw += (e.clientX - drag) * 0.012; drag = e.clientX; });
  const end = () => { drag = null; vp.style.cursor = ''; };
  vp.addEventListener('pointerup', end); vp.addEventListener('pointercancel', end);
  for (const b of document.querySelectorAll('#edCam button')) {
    b.onclick = () => { camMode = b.dataset.v; for (const x of document.querySelectorAll('#edCam button')) x.classList.toggle('on', x === b); };
  }

  function close() {
    open = false;
    if (view) { view.dispose(); view = null; }
    S.camOverride = null;
    world.ball.visible = true;
    showScreen('menu');
  }
  $('#edRandom').onclick = randomize;
  $('#edCancel').onclick = close;
  $('#edSave').onclick = () => {
    store.set('sb_look', JSON.stringify(look));
    onSave(look);
    close();
  };

  return {
    open() {
      look = loadLook(store);
      open = true;
      world.ball.visible = false;
      showScreen('editor');
      refresh(false);
      rebuildView();
      const narrow = innerWidth < 720;
      S.camOverride = (c) => {
        const h = view && view.ready ? view.variant.height : 1.95;
        const face = camMode === 'face';
        const dist = face ? 0.8 : h * 1.75;
        const lookY = face ? h - 0.16 : narrow ? h * 0.32 : h * 0.52;
        // Figur rechts vom Panel (Desktop) bzw. oberhalb (Handy) ins Bild rücken
        const side = narrow ? 0 : face ? -0.24 : -0.62;
        camPos.set(SPOT.x, lookY + (face ? 0.02 : 0.15), SPOT.z + dist);
        camLook.set(SPOT.x + side, lookY, SPOT.z);
        c.position.copy(camPos);
        c.lookAt(camLook);
      };
    },
    // läuft jede Frame im Menü
    tick(dt) {
      if (!open) return;
      if (dirty > 0 && (dirty -= dt) <= 0) rebuildView();
      if (view) view.update({ x: SPOT.x, y: 0, z: SPOT.z, f: yaw, vx: 0, vz: 0, st: 'free', hd: 1 }, dt);
    },
  };
}
