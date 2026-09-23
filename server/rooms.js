// Räume, Spieler-Verbindungen und Nachrichten-Routing
import { Match } from './match.js';
import { Bot } from './bot.js';
import { SNAP_EVERY } from '../shared/constants.js';

const COLORS = ['#e8413c', '#2f7cf6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f8fafc'];
const EMOTES = 8;
let nextId = 1;

function makeCode(rooms) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); }
  while (rooms.has(c));
  return c;
}

const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);

export class Lobby {
  constructor() {
    this.rooms = new Map();
  }

  connect(ws) {
    const client = { id: 'p' + nextId++, ws, name: 'Spieler', color: COLORS[0], room: null };
    send(ws, { t: 'welcome', id: client.id });
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      try { this.handle(client, msg); } catch (e) { console.error('Fehler bei Nachricht', msg && msg.t, e); }
    });
    ws.on('close', () => this.leave(client));
  }

  handle(c, m) {
    switch (m.t) {
      case 'ping': send(c.ws, { t: 'pong', ts: m.ts }); break;
      case 'hello':
        c.name = clean(m.name, 16) || 'Spieler';
        c.color = /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : COLORS[0];
        break;
      case 'create': this.create(c, m); break;
      case 'join': this.join(c, clean(m.code, 4).toUpperCase()); break;
      case 'bot': this.createBot(c, m); break;
      case 'leave': this.leave(c); break;
      case 'settings': {
        const r = c.room;
        if (r && r.host === c.id && !r.match) { r.target = m.target === 21 ? 21 : 11; this.broadcastRoom(r); }
        break;
      }
      case 'start': {
        const r = c.room;
        if (r && r.host === c.id && r.members.length === 2 && (!r.match || r.match.phase === 'over')) this.startMatch(r);
        break;
      }
      case 'rematch': {
        const r = c.room;
        if (!r || !r.match || r.match.phase !== 'over') break;
        r.rematch.add(c.id);
        if (r.bot) r.rematch.add(r.bot.id);
        this.broadcast(r, { t: 'rematch', ids: [...r.rematch] });
        if (r.rematch.size >= 2 && r.members.length === 2) this.startMatch(r);
        break;
      }
      case 'emote': {
        const r = c.room;
        const id = m.id | 0;
        if (r && id >= 0 && id < EMOTES) {
          const now = Date.now();
          if (now - (c.lastEmote || 0) < 700) break;
          c.lastEmote = now;
          this.broadcast(r, { t: 'ev', e: { k: 'emote', id: c.id, e: id } });
        }
        break;
      }
      default: {
        const r = c.room;
        if (!r || !r.match) return;
        const g = r.match;
        if (m.t === 'in') g.onInput(c.id, m);
        else if (m.t === 'shoot') g.onShootStart(c.id);
        else if (m.t === 'release') g.onShootRelease(c.id, m.v);
        else if (m.t === 'steal') g.onSteal(c.id);
        else if (m.t === 'move') g.onMove(c.id, +m.dx || 0, +m.dz || 0);
      }
    }
  }

  newRoom(c, target) {
    this.leave(c);
    const code = makeCode(this.rooms);
    const r = { code, host: c.id, members: [c], target: target === 21 ? 21 : 11, match: null, bot: null, rematch: new Set(), tick: 0 };
    this.rooms.set(code, r);
    c.room = r;
    return r;
  }

  create(c, m) {
    const r = this.newRoom(c, m.target);
    this.broadcastRoom(r);
  }

  createBot(c, m) {
    const r = this.newRoom(c, m.target);
    const level = ['easy', 'medium', 'hard'].includes(m.level) ? m.level : 'medium';
    const names = { easy: 'Rookie-Bot', medium: 'Street-Bot', hard: 'MVP-Bot' };
    const color = COLORS.find((x) => x.toLowerCase() !== c.color.toLowerCase()) || COLORS[1];
    r.bot = { id: 'bot' + nextId++, name: names[level], color, level, bot: true };
    r.members.push(r.bot);
    r.private = true;
    this.startMatch(r);
  }

  join(c, code) {
    const r = this.rooms.get(code);
    if (!r || r.private) return send(c.ws, { t: 'error', msg: 'Raum nicht gefunden.' });
    if (r.members.includes(c)) return;
    if (r.members.length >= 2) return send(c.ws, { t: 'error', msg: 'Raum ist voll.' });
    this.leave(c);
    r.members.push(c);
    c.room = r;
    this.broadcastRoom(r);
  }

  leave(c) {
    const r = c.room;
    if (!r) return;
    c.room = null;
    r.members = r.members.filter((x) => x !== c);
    const humans = r.members.filter((x) => !x.bot);
    if (humans.length === 0) { this.rooms.delete(r.code); return; }
    if (r.host === c.id) r.host = humans[0].id;
    if (r.match) {
      r.match = null;
      this.broadcast(r, { t: 'oppLeft' });
    }
    this.broadcastRoom(r);
  }

  roomInfo(r) {
    return {
      t: 'room', code: r.code, host: r.host, target: r.target, playing: !!r.match, private: !!r.private,
      players: r.members.map((x) => ({ id: x.id, name: x.name, color: x.color, bot: !!x.bot })),
    };
  }

  broadcastRoom(r) { this.broadcast(r, this.roomInfo(r)); }

  broadcast(r, msg) {
    const s = JSON.stringify(msg);
    for (const m of r.members) if (m.ws && m.ws.readyState === 1) m.ws.send(s);
  }

  startMatch(r) {
    r.rematch = new Set();
    // Gleiche Trikotfarbe? Dann bekommt der zweite Spieler eine andere.
    const [a, b] = r.members;
    if (a && b && a.color.toLowerCase() === b.color.toLowerCase()) {
      b.color = COLORS.find((c) => c.toLowerCase() !== a.color.toLowerCase());
    }
    const events = [];
    r.events = events;
    r.match = new Match(r.members.map((x) => ({ id: x.id, name: x.name, color: x.color, bot: !!x.bot })),
      { target: r.target }, (e) => events.push(e));
    r.botAI = r.bot ? new Bot(r.match, r.bot.id, r.bot.level) : null;
    r.tick = 0;
    this.broadcastRoom(r);
    this.broadcast(r, {
      t: 'start', target: r.target,
      players: r.members.map((x) => ({ id: x.id, name: x.name, color: x.color, bot: !!x.bot })),
    });
    this.flush(r);
  }

  flush(r) {
    if (r.events.length) {
      for (const e of r.events.splice(0)) this.broadcast(r, { t: 'ev', e });
    }
  }

  step(dt) {
    for (const r of this.rooms.values()) {
      if (!r.match) continue;
      if (r.botAI) r.botAI.update(dt);
      r.match.tick(dt);
      this.flush(r);
      r.tick++;
      if (r.tick % SNAP_EVERY === 0) this.broadcast(r, { t: 's', ...r.match.snapshot() });
    }
  }
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}
