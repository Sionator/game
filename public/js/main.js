// Client: Menü, Netzwerk, Steuerung, Vorhersage, HUD
import { createWorld } from './scene.js';
import { initAudio, sfx, toggleMute } from './audio.js';
import { HOOP, METER, PLAYER, THREE_R, lerp, clamp, hoopDist } from '/shared/constants.js';
import { stepMove } from '/shared/sim.js';

const $ = (s) => document.querySelector(s);
const COLORS = ['#e8413c', '#2f7cf6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f8fafc'];
const EMOTES = ['🔥', '😂', '💪', '😤', '👑', '🥶', 'GG', 'Nochmal!'];
const INTERP = 100; // ms Render-Verzögerung für flüssige Interpolation
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ------------------------------------------------------------------ Zustand
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* egal */ } },
};

const S = {
  myId: null,
  name: store.get('sb_name', ''),
  color: store.get('sb_color', COLORS[Math.floor(Math.random() * 4)]),
  target: 11,
  room: null,
  players: {},
  inGame: false,
  snaps: [],
  views: {},
  local: null,
  localY: 0, localVy: 0, localShootGrav: false,
  rtt: 80,
  shoot: { active: false, t: 0, sentAt: 0 },
  statusFlash: { text: '', cls: '', until: 0 },
  shake: 0,
  over: null,
  pending: null,
};

const world = createWorld($('#c'));
const { THREE, camera, ball, hoop, fx } = world;

// ------------------------------------------------------------------ Netzwerk
let ws = null;
let reconnectT = 0;

function connect() {
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  ws = new WebSocket(url);
  ws.onopen = () => {
    reconnectT = 0;
    if (S.pending) { const p = S.pending; S.pending = null; hello(); send(p); }
  };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => {
    if (S.inGame || S.room) { toast('Verbindung verloren – verbinde neu…'); leaveGame(); showScreen('menu'); }
    S.room = null;
    setTimeout(connect, Math.min(5000, 500 + reconnectT++ * 1000));
  };
}

function send(m) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
  else if (m.t === 'create' || m.t === 'join' || m.t === 'bot') S.pending = m;
}

function hello() { send({ t: 'hello', name: S.name || 'Spieler', color: S.color }); }

setInterval(() => send({ t: 'ping', ts: performance.now() }), 2000);

function onMessage(m) {
  switch (m.t) {
    case 'welcome': S.myId = m.id; hello(); break;
    case 'pong': S.rtt = lerp(S.rtt, performance.now() - m.ts, 0.3); $('#ping').textContent = Math.round(S.rtt) + ' ms'; break;
    case 'error': $('#menuErr').textContent = m.msg; toast(m.msg); break;
    case 'room': onRoom(m); break;
    case 'start': startGame(m); break;
    case 's':
      m.recv = performance.now();
      S.snaps.push(m);
      if (S.snaps.length > 40) S.snaps.shift();
      break;
    case 'ev': onEvent(m.e); break;
    case 'rematch': {
      const other = m.ids.filter((id) => id !== S.myId).length;
      const mine = m.ids.includes(S.myId);
      $('#rematchHint').textContent = mine && !other ? 'Warte auf Gegner…' : other && !mine ? 'Dein Gegner will eine Revanche! 🔥' : '';
      break;
    }
    case 'oppLeft':
      toast('Dein Gegner hat das Spiel verlassen.');
      leaveGame();
      showScreen('lobby');
      break;
  }
}

// ------------------------------------------------------------------ Menü
function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('visible', s.id === id);
}

function buildMenu() {
  $('#name').value = S.name;
  const cw = $('#colors');
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.style.background = c;
    b.title = c;
    b.classList.toggle('on', c === S.color);
    b.onclick = () => {
      S.color = c;
      store.set('sb_color', c);
      for (const x of cw.children) x.classList.toggle('on', x === b);
    };
    cw.appendChild(b);
  }
  for (const b of document.querySelectorAll('#targetSeg button')) {
    b.onclick = () => {
      S.target = +b.dataset.v;
      for (const x of document.querySelectorAll('#targetSeg button')) x.classList.toggle('on', x === b);
    };
  }
  const prep = () => {
    initAudio();
    S.name = $('#name').value.trim().slice(0, 16) || 'Spieler' + Math.floor(Math.random() * 90 + 10);
    $('#name').value = S.name;
    store.set('sb_name', S.name);
    $('#menuErr').textContent = '';
    hello();
  };
  $('#btnCreate').onclick = () => { prep(); send({ t: 'create', target: S.target }); };
  $('#btnJoin').onclick = () => {
    const code = $('#code').value.trim().toUpperCase();
    if (code.length !== 4) { $('#menuErr').textContent = 'Bitte 4-stelligen Code eingeben.'; return; }
    prep(); send({ t: 'join', code });
  };
  $('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnJoin').click(); });
  for (const b of document.querySelectorAll('.bot')) b.onclick = () => { prep(); send({ t: 'bot', level: b.dataset.l, target: S.target }); };

  $('#btnCopy').onclick = async () => {
    const link = location.origin + '/?room=' + (S.room && S.room.code);
    try { await navigator.clipboard.writeText(link); toast('Link kopiert! Schick ihn deinem Freund 📲'); }
    catch { prompt('Link kopieren:', link); }
  };
  $('#btnStart').onclick = () => { initAudio(); send({ t: 'start' }); };
  $('#btnLeave').onclick = () => { send({ t: 'leave' }); S.room = null; showScreen('menu'); };
  $('#btnRematch').onclick = () => { send({ t: 'rematch' }); $('#btnRematch').disabled = true; $('#rematchHint').textContent = 'Warte auf Gegner…'; };
  $('#btnToLobby').onclick = () => { send({ t: 'leave' }); S.room = null; leaveGame(); showScreen('menu'); };
  $('#btnMenu').onclick = () => {
    if (confirm('Spiel verlassen?')) { send({ t: 'leave' }); S.room = null; leaveGame(); showScreen('menu'); }
  };

  const code = new URLSearchParams(location.search).get('room');
  if (code) {
    $('#code').value = code.toUpperCase().slice(0, 4);
    $('#btnJoin').classList.add('primary');
    $('#btnCreate').classList.remove('primary');
  }

  const em = $('#emotes');
  EMOTES.forEach((e, i) => {
    const b = document.createElement('button');
    b.innerHTML = isTouch ? e : `<small>${i + 1}</small>${e}`;
    b.onclick = () => send({ t: 'emote', id: i });
    em.appendChild(b);
  });
}

function onRoom(m) {
  S.room = m;
  for (const p of m.players) S.players[p.id] = p;
  if (m.private) return; // Bot-Spiel: kein Warteraum
  if (S.inGame && m.playing) return;
  if (!S.inGame && !$('#over').classList.contains('visible')) showScreen('lobby');
  $('#roomCode').textContent = m.code;
  const list = $('#players');
  list.innerHTML = '';
  for (let i = 0; i < 2; i++) {
    const p = m.players[i];
    const d = document.createElement('div');
    d.className = 'pl' + (p ? '' : ' empty');
    if (p) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;
      const nm = document.createElement('span');
      nm.textContent = p.name + (p.id === S.myId ? ' (du)' : '');
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = p.id === m.host ? 'Host' : '';
      d.append(dot, nm, tag);
    } else d.textContent = 'Wartet auf Spieler…';
    list.appendChild(d);
  }
  const host = m.host === S.myId;
  const full = m.players.length === 2;
  $('#btnStart').classList.toggle('hidden', !host);
  $('#btnStart').disabled = !full;
  $('#lobbyTarget').textContent = `Spiel bis ${m.target} Punkte`;
  $('#lobbyHint').textContent = !full ? 'Schick den Code oder Link an einen Freund!' : host ? 'Bereit? Los geht\'s!' : 'Warte, bis der Host startet…';
}

// ------------------------------------------------------------------ Spielstart
function startGame(m) {
  leaveGame();
  S.inGame = true;
  S.target = m.target;
  S.snaps = [];
  S.local = null;
  S.over = null;
  S.localY = 0; S.localVy = 0;
  S.shoot.active = false;
  for (const p of m.players) {
    S.players[p.id] = p;
    S.views[p.id] = world.addPlayer(p, p.id === S.myId);
  }
  const [a, b] = orderPlayers(m.players);
  setTeam('#sbA', a); setTeam('#sbB', b);
  $('#toWin').textContent = `bis ${m.target}`;
  $('#hud').classList.remove('hidden');
  $('#touch').classList.toggle('hidden', !isTouch);
  $('#btnRematch').disabled = false;
  $('#rematchHint').textContent = '';
  showScreen(null);
  $('#feed').innerHTML = '';
}

function orderPlayers(list) {
  const me = list.find((p) => p.id === S.myId);
  const other = list.find((p) => p.id !== S.myId);
  return [me || list[0], other || list[1]];
}

function setTeam(sel, p) {
  const el = $(sel);
  el.dataset.id = p ? p.id : '';
  el.querySelector('.nm').textContent = p ? p.name : '';
  el.querySelector('.dot').style.background = p ? p.color : '#555';
}

function leaveGame() {
  S.inGame = false;
  for (const v of Object.values(S.views)) v.dispose();
  S.views = {};
  S.snaps = [];
  S.shoot.active = false;
  $('#hud').classList.add('hidden');
  $('#touch').classList.add('hidden');
  $('#meter').classList.add('hidden');
  world.clearLine.visible = false;
}

// ------------------------------------------------------------------ Eingabe
const keys = new Set();
const touchInput = { mx: 0, mz: 0, sprint: false, active: false };
let lastSent = { mx: 9, mz: 9, sprint: null, t: 0 };

function currentInput() {
  let mx = 0, mz = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
  if (touchInput.active) { mx = touchInput.mx; mz = touchInput.mz; }
  const l = Math.hypot(mx, mz);
  if (l > 1) { mx /= l; mz /= l; }
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || touchInput.sprint;
  return { mx, mz, sprint };
}

function sendInput(now) {
  const i = currentInput();
  const changed = Math.abs(i.mx - lastSent.mx) > 0.05 || Math.abs(i.mz - lastSent.mz) > 0.05 || i.sprint !== lastSent.sprint;
  if (changed || now - lastSent.t > 100) {
    send({ t: 'in', mx: +i.mx.toFixed(2), mz: +i.mz.toFixed(2), sprint: i.sprint });
    lastSent = { ...i, t: now };
  }
}

function typing() { return document.activeElement && document.activeElement.tagName === 'INPUT'; }

addEventListener('keydown', (e) => {
  if (typing() || !S.inGame) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space') shootDown();
  else if (e.code === 'KeyE') doSteal();
  else if (e.code === 'KeyQ') doMove();
  else if (e.code === 'KeyM') toast(toggleMute() ? 'Ton aus 🔇' : 'Ton an 🔊');
  else if (/^Digit[1-8]$/.test(e.code)) send({ t: 'emote', id: +e.code.slice(5) - 1 });
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') shootUp();
});
addEventListener('blur', () => { keys.clear(); if (S.shoot.active) shootUp(); });
$('#c').addEventListener('mousedown', (e) => { if (S.inGame && e.button === 0) shootDown(); });
addEventListener('mouseup', (e) => { if (e.button === 0) shootUp(); });

function latest() { return S.snaps[S.snaps.length - 1]; }
function meSnap(s = latest()) { return s && s.p.find((p) => p.id === S.myId); }

function shootDown() {
  const s = latest(), me = meSnap();
  if (!s || !me || s.ph !== 'play' || me.st !== 'free' || S.localY > 0.05 || S.shoot.active) return;
  send({ t: 'shoot' });
  if (s.b.h === S.myId) {
    const inp = currentInput();
    const L = S.local;
    const speed = L ? Math.hypot(L.vx, L.vz) : 0;
    if (L && hoopDist(L.x, L.z) < 2.7 && inp.sprint && speed > 4.2) return; // Dunk – kein Wurfmeter
    S.shoot = { active: true, t: 0, sentAt: performance.now() };
    S.localVy = PLAYER.jumpV * 0.95;
    S.localShootGrav = true;
    const m = $('#meter');
    const me2 = meSnap();
    const green = me2 && me2.fire ? METER.fireGreen : METER.green;
    const g = m.querySelector('.green');
    g.style.bottom = ((METER.center - green) * 100) + '%';
    g.style.height = (green * 2 * 100) + '%';
    m.classList.toggle('fire', !!(me2 && me2.fire));
    m.classList.remove('hidden');
  } else {
    S.localVy = PLAYER.jumpV;
    S.localShootGrav = false;
  }
}

function shootUp() {
  if (!S.shoot.active) return;
  S.shoot.active = false;
  send({ t: 'release', v: +(S.shoot.t / METER.dur).toFixed(3) });
  setTimeout(() => $('#meter').classList.add('hidden'), 350);
}

function doSteal() {
  const s = latest();
  if (!s || s.ph !== 'play') return;
  send({ t: 'steal' });
}

function doMove() {
  const s = latest(), me = meSnap(), L = S.local;
  if (!s || !me || !L || s.ph !== 'play' || me.st !== 'free' || L.dashCd > 0 || S.localY > 0.05) return;
  const i = currentInput();
  let dx = i.mx, dz = i.mz;
  if (Math.hypot(dx, dz) < 0.1) { dx = Math.cos(L.f); dz = -Math.sin(L.f); }
  const l = Math.hypot(dx, dz);
  L.dashDx = dx / l; L.dashDz = dz / l; L.dashT = PLAYER.dashTime; L.dashCd = PLAYER.dashCd;
  send({ t: 'move', dx: +dx.toFixed(2), dz: +dz.toFixed(2) });
}

// Touch
function setupTouch() {
  if (!isTouch) return;
  document.body.classList.add('touch');
  const stick = $('#stick'), knob = $('#knob');
  let pid = null;
  const upd = (e) => {
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const R = r.width / 2 - 10;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const n = Math.hypot(dx, dy) / R;
    touchInput.mx = n > 0.15 ? dx / R : 0;
    touchInput.mz = n > 0.15 ? dy / R : 0;
  };
  stick.addEventListener('pointerdown', (e) => { pid = e.pointerId; stick.setPointerCapture(pid); touchInput.active = true; upd(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === pid) upd(e); });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null; touchInput.active = false; touchInput.mx = touchInput.mz = 0;
    knob.style.transform = '';
  };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
  for (const b of document.querySelectorAll('.tb')) {
    const a = b.dataset.a;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      initAudio();
      b.setPointerCapture(e.pointerId);
      if (a === 'shoot') shootDown();
      else if (a === 'sprint') { touchInput.sprint = true; b.classList.add('on'); }
      else if (a === 'steal') doSteal();
      else if (a === 'move') doMove();
    });
    const up = () => {
      if (a === 'shoot') shootUp();
      else if (a === 'sprint') { touchInput.sprint = false; b.classList.remove('on'); }
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  }
}

// ------------------------------------------------------------------ Ereignisse
function nameOf(id) { return (S.players[id] && S.players[id].name) || '?'; }
function colorOf(id) { return (S.players[id] && S.players[id].color) || '#fff'; }

let bigTimer = 0;
function big(text, small = '', ms = 1400) {
  const el = $('#big');
  el.innerHTML = '';
  el.append(text);
  if (small) { const s = document.createElement('small'); s.textContent = small; el.appendChild(s); }
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(bigTimer);
  bigTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function feed(text, color) {
  const d = document.createElement('div');
  d.textContent = text;
  if (color) d.style.borderLeft = `4px solid ${color}`;
  const f = $('#feed');
  f.appendChild(d);
  while (f.children.length > 5) f.firstChild.remove();
  setTimeout(() => d.remove(), 4000);
}

function flash(text, cls = 'ok', ms = 1200) {
  S.statusFlash = { text, cls, until: performance.now() + ms };
}

let toastT = 0;
function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2600);
}

function onEvent(e) {
  const mine = e.id === S.myId;
  const v = S.views[e.id];
  switch (e.k) {
    case 'check':
      S.shoot.active = false;
      $('#meter').classList.add('hidden');
      sfx.whistle();
      big('CHECK', `${nameOf(e.id)} hat den Ball`, 1100);
      break;
    case 'go': sfx.tick(); break;
    case 'jump': if (mine) sfx.jump(); break;
    case 'release': {
      sfx.shoot();
      if (!mine) break;
      const G = { perfect: ['PERFEKT! 🎯', '#4ade80'], good: ['Gut', '#bef264'], early: ['Zu früh', '#fb923c'], late: ['Zu spät', '#fb923c'] };
      let [txt, col] = G[e.grade];
      if (e.contest > 0.45) txt += ' · bedrängt';
      if (e.layup && e.grade !== 'early' && e.grade !== 'late') txt = 'Korbleger · ' + txt;
      const g = $('#grade');
      g.textContent = txt;
      g.style.color = col;
      g.classList.add('show');
      setTimeout(() => g.classList.remove('show'), 700);
      if (e.grade === 'perfect') sfx.perfect();
      break;
    }
    case 'score': {
      hoop.swish(e.dunk ? 1.6 : e.swish ? 1.2 : 0.9);
      sfx.cheer(e.pts === 3 || e.dunk || e.fire);
      if (!e.dunk) sfx.swish();
      const col = new THREE.Color(colorOf(e.id));
      fx.burst(HOOP.x, HOOP.y - 0.3, HOOP.z, [col, 0xffffff, 0xffd23f], e.pts === 3 || e.dunk ? 90 : 45, e.dunk ? 5 : 3.5);
      const t = e.dunk ? 'DUNK! 💥' : e.pts === 3 ? (e.swish ? 'SWISH – DREIER!' : 'DREIER!') : e.swish ? 'SWISH!' : '+2';
      big(t, `${nameOf(e.id)} +${e.pts}`);
      feed(`${nameOf(e.id)} ${e.dunk ? 'dunkt' : 'trifft'} (+${e.pts})`, colorOf(e.id));
      if (e.fire) {
        setTimeout(() => { big('ON FIRE 🔥', `${nameOf(e.id)} ist heiß!`, 1600); sfx.fire(); }, 900);
        feed(`${nameOf(e.id)} ist ON FIRE 🔥`, '#ff7a1a');
      }
      break;
    }
    case 'noclear':
      sfx.whistle(); sfx.aww();
      big('NICHT GEKLÄRT!', 'Korb zählt nicht – erst hinter die Dreierlinie!', 1800);
      break;
    case 'turnover':
      if (e.reason === 'shotclock') { sfx.buzzer(); big('WURFUHR!', `Ball für ${nameOf(e.id)}`); }
      else if (e.reason === 'out') { sfx.whistle(); big('AUS!', `Ball für ${nameOf(e.id)}`); }
      else if (e.reason === 'stuck') { sfx.whistle(); big('HÄNGT FEST', `Ball für ${nameOf(e.id)}`); }
      break;
    case 'steal':
      sfx.steal();
      big('STEAL! ✋', `${nameOf(e.id)} klaut den Ball`, 1100);
      feed(`${nameOf(e.id)} klaut ${nameOf(e.victim)} den Ball`, colorOf(e.id));
      break;
    case 'reach': if (v) v.reach(); break;
    case 'block':
      sfx.block();
      S.shake = 0.25;
      big(e.dunk ? 'POSTER-BLOCK! 🚫' : 'BLOCK! 🚫', nameOf(e.id), 1300);
      feed(`${nameOf(e.id)} blockt ${nameOf(e.victim)}`, colorOf(e.id));
      break;
    case 'ankle':
      sfx.squeak(); setTimeout(() => sfx.squeak(), 90); sfx.cheer(true);
      big('ANKLE BREAKER! 🦴', `${nameOf(e.id)} legt ${nameOf(e.victim)} hin`, 1600);
      feed(`${nameOf(e.id)} → Ankle Breaker!`, colorOf(e.id));
      break;
    case 'dash': sfx.squeak(); break;
    case 'dunk':
      sfx.dunk();
      S.shake = 0.45;
      break;
    case 'pickup':
      if (e.rebound) feed(`Rebound ${nameOf(e.id)}`, colorOf(e.id));
      break;
    case 'cleared':
      if (mine) { flash('Geklärt ✓', 'ok'); sfx.click(); }
      break;
    case 'fireOut': feed(`${nameOf(e.id)} ist abgekühlt 🧊`); break;
    case 'snd':
      if (e.s === 'bounce') sfx.bounce(e.v);
      else if (e.s === 'rim') sfx.rim(e.v);
      else if (e.s === 'board') sfx.board(e.v);
      break;
    case 'emote': if (v) { v.showEmote(EMOTES[e.e] || '?'); sfx.click(); } break;
    case 'over': {
      S.over = e;
      const won = e.winner === S.myId;
      setTimeout(() => { won ? sfx.win() : sfx.lose(); }, 400);
      big(won ? 'SIEG! 🏆' : 'VERLOREN', `${nameOf(e.winner)} gewinnt`, 2200);
      setTimeout(() => showOver(e), 2300);
      break;
    }
  }
}

function showOver(e) {
  if (!S.inGame) return;
  const won = e.winner === S.myId;
  $('#overTitle').textContent = won ? '🏆 Du hast gewonnen!' : `😤 ${nameOf(e.winner)} gewinnt`;
  const ids = Object.keys(e.score);
  const [a, b] = ids.includes(S.myId) ? [S.myId, ids.find((x) => x !== S.myId)] : ids;
  $('#overScore').textContent = `${e.score[a]} : ${e.score[b]}`;
  const st = e.stats;
  const pct = (m, n) => (n ? Math.round((m / n) * 100) + '%' : '–');
  const rows = [
    ['', nameOf(a), nameOf(b)],
    ['Punkte', st[a].pts, st[b].pts],
    ['Würfe', `${st[a].fgm}/${st[a].fga} (${pct(st[a].fgm, st[a].fga)})`, `${st[b].fgm}/${st[b].fga} (${pct(st[b].fgm, st[b].fga)})`],
    ['Dreier', `${st[a].tpm}/${st[a].tpa}`, `${st[b].tpm}/${st[b].tpa}`],
    ['Dunks', st[a].dunks, st[b].dunks],
    ['Blocks', st[a].blocks, st[b].blocks],
    ['Steals', st[a].steals, st[b].steals],
    ['Ankle Breaker', st[a].ankles, st[b].ankles],
  ];
  const t = $('#statsTable');
  t.innerHTML = '';
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    for (const c of r) { const td = document.createElement(i ? 'td' : 'th'); td.textContent = c; tr.appendChild(td); }
    t.appendChild(tr);
  });
  showScreen('over');
}

// ------------------------------------------------------------------ Interpolation
function sampleSnapshot(now) {
  const snaps = S.snaps;
  if (!snaps.length) return null;
  const rt = now - INTERP;
  let i = snaps.length - 1;
  while (i > 0 && snaps[i - 1].recv > rt) i--;
  const b = snaps[i], a = snaps[i - 1];
  if (!a || rt >= b.recv) return { s: b, lerpP: (id) => b.p.find((p) => p.id === id), ball: b.b };
  const t = clamp((rt - a.recv) / (b.recv - a.recv || 1), 0, 1);
  const lp = (id) => {
    const pa = a.p.find((p) => p.id === id), pb = b.p.find((p) => p.id === id);
    if (!pa || !pb) return pb || pa;
    const tele = Math.hypot(pb.x - pa.x, pb.z - pa.z) > 3;
    if (tele) return pb;
    let df = pb.f - pa.f;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    return { ...pb, x: lerp(pa.x, pb.x, t), y: lerp(pa.y, pb.y, t), z: lerp(pa.z, pb.z, t), vx: lerp(pa.vx, pb.vx, t), vz: lerp(pa.vz, pb.vz, t), f: pa.f + df * t };
  };
  let ball;
  if (a.b.h || b.b.h || Math.hypot(a.b.x - b.b.x, a.b.y - b.b.y, a.b.z - b.b.z) > 3) ball = b.b;
  else ball = { ...b.b, x: lerp(a.b.x, b.b.x, t), y: lerp(a.b.y, b.b.y, t), z: lerp(a.b.z, b.b.z, t) };
  // Ballbesitz wechselt erst mit dem jüngeren Snapshot
  if (t < 0.5 && a.b.h && !b.b.h) ball = { ...b.b, h: a.b.h, x: a.b.x, y: a.b.y, z: a.b.z };
  return { s: b, lerpP: lp, ball };
}

// Eigene Figur: lokal vorhersagen und sanft an den Server angleichen
function updateLocal(dt, now) {
  const s = latest(), me = meSnap(s);
  if (!s || !me) return null;
  if (!S.local) S.local = { x: me.x, z: me.z, vx: 0, vz: 0, f: me.f, stamina: 1, dashT: 0, dashDx: 0, dashDz: 0, dashCd: 0, y: 0 };
  const L = S.local;
  L.dashCd = Math.max(0, L.dashCd - dt);
  const hasBall = s.b.h === S.myId;
  const canPredict = me.st === 'free' && s.ph !== 'check' && s.ph !== 'over' && !S.shoot.active;
  const inp = currentInput();
  if (canPredict) {
    let rest = dt;
    while (rest > 1e-4) {
      const h = Math.min(rest, 1 / 60);
      stepMove(L, inp, h, hasBall);
      rest -= h;
    }
    const lead = Math.min(0.3, S.rtt / 1000 + (now - s.recv) / 1000);
    const tx = me.x + me.vx * lead, tz = me.z + me.vz * lead;
    const ex = tx - L.x, ez = tz - L.z;
    if (Math.hypot(ex, ez) > 2.5) { L.x = me.x; L.z = me.z; }
    else { const k = Math.min(1, dt * 4); L.x += ex * k; L.z += ez * k; }
    L.stamina = lerp(L.stamina, me.sta, Math.min(1, dt * 2));
  } else {
    const k = Math.hypot(me.x - L.x, me.z - L.z) > 2.5 ? 1 : Math.min(1, dt * 14);
    L.x += (me.x - L.x) * k; L.z += (me.z - L.z) * k;
    L.vx = me.vx; L.vz = me.vz;
    if (me.st !== 'shoot' && !S.shoot.active) L.f = me.f;
    else L.f = Math.atan2(HOOP.x - L.x, HOOP.z - L.z);
    L.stamina = me.sta;
    L.dashT = 0;
  }
  // Vertikal lokal simulieren (Sprung ohne Verzögerung), Dunk vom Server
  if (me.st === 'dunk' || s.ph === 'check') {
    S.localY = lerp(S.localY, me.y, Math.min(1, dt * 20));
    S.localVy = 0;
  } else if (S.localY > 0 || S.localVy > 0) {
    S.localVy -= PLAYER.gravity * (S.localShootGrav && S.shoot.active ? PLAYER.shootGravityMul : 1) * dt;
    S.localY += S.localVy * dt;
    if (S.localY <= 0) { S.localY = 0; S.localVy = 0; }
  } else if (me.y > 0.4) {
    S.localY = me.y; // Server sagt: wir springen
  }
  return { ...me, x: L.x, z: L.z, vx: L.vx, vz: L.vz, f: L.f, y: S.localY, shootingLocal: S.shoot.active };
}

// ------------------------------------------------------------------ Hauptschleife
const tmp = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 7, 21);
const camLook = new THREE.Vector3(0, 1.5, 6);
const prevBall = new THREE.Vector3();
let last = performance.now();
let time = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  if (S.inGame) {
    sendInput(now);
    if (S.shoot.active) {
      S.shoot.t = (now - S.shoot.sentAt) / 1000;
      if (S.shoot.t > METER.dur * 1.3) shootUp();
      const me = meSnap();
      if (me && me.st !== 'shoot' && now - S.shoot.sentAt > 250 + S.rtt) { S.shoot.active = false; $('#meter').classList.add('hidden'); }
    }
    updateGame(dt, now);
  } else {
    // Menü: langsame Kamerafahrt
    const a = time * 0.08;
    camPos.set(Math.sin(a) * 13, 6 + Math.sin(time * 0.3), 7 + Math.cos(a) * 13);
    camLook.set(0, 2, 3);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    if (S.camOverride) S.camOverride(camera);
    ball.position.set(Math.sin(time * 0.7) * 2, BALL_BOUNCE(time), 5 + Math.cos(time * 0.7) * 2);
  }
  hoop.update(dt, time);
  fx.update(dt);
  world.render();
}

function BALL_BOUNCE(t) { return 0.12 + Math.abs(Math.sin(t * 3)) * 1.1; }

function updateGame(dt, now) {
  const samp = sampleSnapshot(now);
  if (!samp) return;
  const { s, lerpP } = samp;
  const myState = updateLocal(dt, now);
  const holder = samp.ball.h;

  for (const id in S.views) {
    const view = S.views[id];
    const ps = id === S.myId && myState ? myState : lerpP(id);
    if (!ps) continue;
    const other = Object.keys(S.views).find((x) => x !== id);
    const defending = holder && holder === other && s.ph === 'play';
    view.update({ ...ps, hasBall: holder === id, defending }, dt, (vw) => sfx.dribble(vw.id === S.myId ? 0.22 : 0.1));
    view._state = { ...ps, hasBall: holder === id };
    if (ps.fire && Math.random() < 0.5) fx.fire(ps.x, 0.1, ps.z, 1);
  }

  // Ball
  prevBall.copy(ball.position);
  let fireBall = false;
  if (holder && S.views[holder]) {
    const vw = S.views[holder];
    vw.ballAnchor(vw._state, tmp);
    ball.position.copy(tmp);
    const hp = s.p.find((p) => p.id === holder);
    fireBall = hp && hp.fire;
  } else {
    ball.position.set(samp.ball.x, samp.ball.y, samp.ball.z);
    const sp = samp.ball.sb && s.p.find((p) => p.id === samp.ball.sb);
    fireBall = sp && sp.fire && samp.ball.s;
  }
  const mv = tmp.subVectors(ball.position, prevBall);
  const dist = mv.length();
  if (dist > 0.001 && dist < 2) {
    const axis = new THREE.Vector3(mv.z, 0, -mv.x).normalize();
    if (axis.lengthSq() > 0) ball.rotateOnWorldAxis(axis, holder ? dist / 0.12 : -dist / 0.12);
  }
  if (fireBall) fx.fire(ball.position.x, ball.position.y, ball.position.z, 3);

  // Kamera
  const L = myState || lerpP(S.myId) || { x: 0, z: 8 };
  const portrait = camera.aspect < 0.8;
  const fxp = L.x * 0.6;
  const fzp = lerp(L.z, HOOP.z, 0.3);
  const back = portrait ? 13 : 10.5, up = portrait ? 8 : 6.2;
  camPos.lerp(tmp.set(fxp * 0.85, up, Math.max(fzp + back, 12)), Math.min(1, dt * 3));
  camLook.lerp(tmp.set(fxp * 0.9, 1.3, fzp - 2), Math.min(1, dt * 3));
  camera.position.copy(camPos);
  if (S.shake > 0) {
    S.shake -= dt;
    camera.position.x += (Math.random() - 0.5) * S.shake * 0.8;
    camera.position.y += (Math.random() - 0.5) * S.shake * 0.8;
  }
  camera.lookAt(camLook);
  if (S.camOverride) S.camOverride(camera);

  updateHud(s, myState, now);
}

function updateHud(s, me, now) {
  for (const sel of ['#sbA', '#sbB']) {
    const el = $(sel);
    const id = el.dataset.id;
    el.querySelector('.pts').textContent = s.score[id] ?? 0;
    el.classList.toggle('poss', s.b.h === id);
    const p = s.p.find((x) => x.id === id);
    el.classList.toggle('fire', !!(p && p.fire));
  }
  const sc = $('#shotClock');
  const secs = s.b.h ? Math.ceil(s.sc) : Math.ceil(s.sc);
  sc.textContent = s.ph === 'over' ? '–' : secs;
  sc.classList.toggle('low', s.sc < 5 && !!s.b.h);

  // Status / Klären
  const st = $('#status');
  let text = '', cls = '';
  const holder = s.b.h && s.p.find((p) => p.id === s.b.h);
  const needClear = holder && !holder.cl && s.ph === 'play';
  if (S.statusFlash.until > now) { text = S.statusFlash.text; cls = S.statusFlash.cls; }
  else if (s.ph === 'check') text = `Check-Ball · ${nameOf(s.b.h)} greift an`;
  else if (needClear && holder.id === S.myId) { text = '⤴ Ball klären! Raus hinter die Dreierlinie'; cls = 'warn'; }
  else if (needClear) text = `${nameOf(holder.id)} muss klären`;
  st.textContent = text;
  st.className = cls;
  world.clearLine.visible = !!needClear;
  if (needClear) {
    const mat = world.clearLine.material;
    mat.opacity = 0.5 + Math.sin(now / 150) * 0.35;
    mat.color.set(holder.id === S.myId ? 0xffb020 : 0x94a3b8);
  }

  if (me) $('#stamina div').style.width = Math.round(me.sta * 100) + '%';

  // Wurfmeter neben dem eigenen Spieler
  const view = S.views[S.myId];
  if (view && me) {
    tmp.set(me.x, me.y + 1.6, me.z).project(camera);
    const x = (tmp.x * 0.5 + 0.5) * innerWidth, y = (-tmp.y * 0.5 + 0.5) * innerHeight;
    const m = $('#meter');
    m.style.left = x + 70 + 'px';
    m.style.top = y + 'px';
    if (S.shoot.active) m.querySelector('.fill').style.height = Math.min(100, (S.shoot.t / METER.dur) * 100) + '%';
    const g = $('#grade');
    g.style.left = x + 'px';
    g.style.top = y - 90 + 'px';
  }
}

buildMenu();
setupTouch();
connect();
requestAnimationFrame(frame);

// Für Debugging in der Konsole
window.__sb = { S, world, onMessage };
