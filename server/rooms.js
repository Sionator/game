// Räume, Teams, Spieler-Verbindungen und Nachrichten-Routing
import { Match } from './match.js';
import { Bot } from './bot.js';
import { SNAP_EVERY } from '../shared/constants.js';

const COLORS = ['#e8413c', '#2f7cf6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f8fafc'];
const EMOTES = 8;
const LEVELS = ['easy', 'medium', 'hard'];
const BOT_NAMES = {
  easy: ['Rookie-Bot', 'Bankdrücker-Bot', 'Airball-Bot'],
  medium: ['Street-Bot', 'Asphalt-Bot', 'Käfig-Bot'],
  hard: ['MVP-Bot', 'Legenden-Bot', 'Hall-of-Fame-Bot'],
};
let nextId = 1;

function makeCode(rooms) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); }
  while (rooms.has(c));
  return c;
}

const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
const capOf = (mode) => (mode === '2v2' ? 4 : 2);

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
    const r = c.room;
    switch (m.t) {
      case 'ping': send(c.ws, { t: 'pong', ts: m.ts }); break;
      case 'hello':
        c.name = clean(m.name, 16) || 'Spieler';
        c.color = /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : COLORS[0];
        c.body = ['m', 'f'].includes(m.body) ? m.body : 'auto';
        break;
      case 'create': {
        const room = this.newRoom(c, m);
        this.broadcastRoom(room);
        break;
      }
      case 'join': this.join(c, clean(m.code, 4).toUpperCase()); break;
      case 'bot': this.createBot(c, m); break;
      case 'leave': this.leave(c); break;
      case 'team': {
        if (!r || r.match) break;
        const want = c.team === 'A' ? 'B' : 'A';
        if (r.members.filter((x) => x.team === want).length < r.cap / 2) { c.team = want; this.broadcastRoom(r); }
        break;
      }
      case 'settings': {
        if (!r || r.host !== c.id || r.match) break;
        if (m.target === 11 || m.target === 21) r.target = m.target;
        if ((m.mode === '1v1' || m.mode === '2v2') && r.members.length <= capOf(m.mode)) {
          r.mode = m.mode;
          r.cap = capOf(m.mode);
          this.balanceTeams(r);
        }
        if (LEVELS.includes(m.level)) r.level = m.level;
        this.broadcastRoom(r);
        break;
      }
      case 'start':
        if (r && r.host === c.id && (!r.match || r.match.phase === 'over')) this.startMatch(r);
        break;
      case 'rematch': {
        if (!r || !r.match || r.match.phase !== 'over') break;
        r.rematch.add(c.id);
        const humans = r.members.filter((x) => !x.bot);
        this.broadcast(r, { t: 'rematch', ids: [...r.rematch], need: humans.length });
        if (humans.every((x) => r.rematch.has(x.id))) this.startMatch(r);
        break;
      }
      case 'emote': {
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
        if (!r || !r.match) return;
        const g = r.match;
        if (m.t === 'in') g.onInput(c.id, m);
        else if (m.t === 'shoot') g.onShootStart(c.id);
        else if (m.t === 'release') g.onShootRelease(c.id, m.v);
        else if (m.t === 'dribble') g.onDribble(c.id, m.side);
        else if (m.t === 'switch') g.onSwitch(c.id);
        else if (m.t === 'pass') g.onPass(c.id);
      }
    }
  }

  newRoom(c, m) {
    this.leave(c);
    const code = makeCode(this.rooms);
    const mode = m.mode === '2v2' ? '2v2' : '1v1';
    const r = {
      code, host: c.id, mode, cap: capOf(mode), members: [c],
      target: m.target === 21 ? 21 : 11, level: LEVELS.includes(m.level) ? m.level : 'medium',
      match: null, botAIs: [], rematch: new Set(), tick: 0, private: false,
    };
    c.team = 'A';
    this.rooms.set(code, r);
    c.room = r;
    return r;
  }

  createBot(c, m) {
    const r = this.newRoom(c, m);
    r.private = true;
    this.startMatch(r);
  }

  join(c, code) {
    const r = this.rooms.get(code);
    if (!r || r.private) return send(c.ws, { t: 'error', msg: 'Raum nicht gefunden.' });
    if (r.members.includes(c)) return;
    if (r.match && r.match.phase !== 'over') return send(c.ws, { t: 'error', msg: 'Dort läuft gerade ein Spiel.' });
    const humans = r.members.filter((x) => !x.bot);
    if (humans.length >= r.cap) return send(c.ws, { t: 'error', msg: 'Raum ist voll.' });
    this.leave(c);
    r.members = r.members.filter((x) => !x.bot); // Bots aus dem letzten Spiel machen Platz
    const a = r.members.filter((x) => x.team === 'A').length;
    const b = r.members.filter((x) => x.team === 'B').length;
    c.team = a <= b ? 'A' : 'B';
    r.members.push(c);
    c.room = r;
    if (r.match && r.match.phase === 'over') { r.match = null; r.botAIs = []; this.broadcast(r, { t: 'toLobby' }); }
    this.broadcastRoom(r);
  }

  balanceTeams(r) {
    const half = r.cap / 2;
    for (const t of ['A', 'B']) {
      const list = r.members.filter((x) => x.team === t);
      for (const x of list.slice(half)) x.team = t === 'A' ? 'B' : 'A';
    }
  }

  leave(c) {
    const r = c.room;
    if (!r) return;
    c.room = null;
    const humansLeft = r.members.filter((x) => !x.bot && x !== c);
    if (humansLeft.length === 0) { this.rooms.delete(r.code); return; }
    if (r.host === c.id) r.host = humansLeft[0].id;
    if (r.match && r.match.phase !== 'over') {
      // Ein Bot übernimmt den Platz, damit das Spiel weiterlaufen kann
      const bot = { id: c.id, name: c.name + ' (Bot)', color: c.color, team: c.team, bot: true, level: 'medium' };
      r.members = r.members.map((x) => (x === c ? bot : x));
      const p = r.match.get(c.id);
      if (p) { p.bot = true; p.name = bot.name; }
      r.botAIs.push(new Bot(r.match, c.id, 'medium'));
      this.broadcast(r, { t: 'ev', e: { k: 'replaced', id: c.id, name: c.name } });
    } else {
      r.members = r.members.filter((x) => x !== c && !x.bot);
      if (r.match) { r.match = null; r.botAIs = []; this.broadcast(r, { t: 'toLobby', msg: c.name + ' hat den Raum verlassen.' }); }
    }
    r.rematch.delete(c.id);
    this.broadcastRoom(r);
  }

  roomInfo(r) {
    return {
      t: 'room', code: r.code, host: r.host, target: r.target, mode: r.mode, cap: r.cap, level: r.level,
      playing: !!(r.match && r.match.phase !== 'over'), private: r.private,
      players: r.members.map((x) => ({ id: x.id, name: x.name, color: x.color, team: x.team, bot: !!x.bot })),
    };
  }

  broadcastRoom(r) { this.broadcast(r, this.roomInfo(r)); }

  broadcast(r, msg) {
    const s = JSON.stringify(msg);
    for (const m of r.members) if (m.ws && m.ws.readyState === 1) m.ws.send(s);
  }

  startMatch(r) {
    r.rematch = new Set();
    // Freie Plätze mit Bots füllen
    const half = r.cap / 2;
    const names = [...BOT_NAMES[r.level]];
    for (const t of ['A', 'B']) {
      while (r.members.filter((x) => x.team === t).length < half) {
        r.members.push({ id: 'bot' + nextId++, name: names.shift() || 'Bot', color: COLORS[1], team: t, bot: true, level: r.level });
      }
    }
    // Trikotfarben pro Team
    const pick = (t) => (r.members.find((x) => x.team === t && !x.bot) || r.members.find((x) => x.team === t)).color;
    const colA = pick('A');
    let colB = pick('B');
    if (colB.toLowerCase() === colA.toLowerCase()) colB = COLORS.find((c) => c.toLowerCase() !== colA.toLowerCase());
    const teamColor = { A: colA, B: colB };

    const players = r.members.map((x) => ({ id: x.id, name: x.name, color: teamColor[x.team], team: x.team, bot: !!x.bot, body: x.body || 'auto' }));
    const events = [];
    r.events = events;
    r.match = new Match(players, { target: r.target }, (e) => events.push(e));
    r.botAIs = r.members.filter((x) => x.bot).map((x) => new Bot(r.match, x.id, x.level || r.level));
    r.tick = 0;
    this.broadcastRoom(r);
    this.broadcast(r, { t: 'start', target: r.target, mode: r.mode, players });
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
      for (const b of r.botAIs) b.update(dt);
      r.match.tick(dt);
      this.flush(r);
      r.tick++;
      if (r.match.phase !== 'over' && r.tick % SNAP_EVERY === 0) this.broadcast(r, { t: 's', ...r.match.snapshot() });
    }
  }
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}
