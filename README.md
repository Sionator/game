# 🏀 Streetball 1v1

Ein **3D-Basketballspiel für zwei Spieler**, das du online mit Freunden im Browser spielst – am PC oder am Handy.
Nachts auf einem Streetball-Court mitten in der Stadt: Crossover, Dunks, Blocks und Trash-Talk per Emote.

## Features

- **Echtes 1v1 online** – Raum erstellen, 4-stelligen Code oder Link an einen Freund schicken, los geht's
- **Wurf-Timing wie in NBA 2K** – Leertaste halten, im grünen Bereich loslassen. Zu früh = zu kurz, zu spät = zu lang
- **Dunks** – mit Sprint auf den Korb zu und werfen 💥
- **Blocks** – springen, wenn der Gegner wirft (auch Poster-Blocks gegen Dunks!)
- **Steals** – Ball klauen, wenn du nah genug dran bist
- **Crossover / Ankle Breaker** – mit dem richtigen Move legst du den Verteidiger auf den Boden 🦴
- **ON FIRE** 🔥 – 3 Treffer in Folge und dein grüner Bereich wird größer, bis der Gegner trifft
- **Streetball-Regeln** – nach Rebound oder Steal musst du den Ball erst hinter die Dreierlinie **klären**
- **14-Sekunden-Wurfuhr**, Spiel bis 11 oder 21
- **Übungsmodus gegen Bots** (Rookie, Street, MVP)
- **Emotes** (🔥 😂 💪 GG …), Statistiken am Spielende, Revanche-Button
- **Handy-Steuerung** mit Joystick und Buttons
- Echte Ball-Physik (Ring, Brett, Netz), synthetisierte Sounds – keine externen Dateien

## Steuerung

| Taste | Aktion |
|---|---|
| `W A S D` / Pfeiltasten | Laufen |
| `Shift` | Sprinten (kostet Ausdauer) |
| `Leertaste` halten & loslassen | Werfen (auf den grünen Bereich achten!) |
| `Leertaste` + Sprint nah am Korb | Dunk |
| `Leertaste` ohne Ball | Springen / Blocken |
| `E` | Ball klauen |
| `Q` | Crossover-Move |
| `1`–`8` | Emotes |
| `M` | Ton an/aus |

## Starten

Voraussetzung: [Node.js](https://nodejs.org) ab Version 18.

```bash
npm install
npm start
```

Dann im Browser **http://localhost:3000** öffnen.

## Mit Freunden online spielen

Der Server muss für deinen Freund erreichbar sein. Drei Möglichkeiten:

### 1. Im selben WLAN
Nach `npm start` zeigt die Konsole eine Adresse wie `http://192.168.x.x:3000` – die kann dein Freund
im selben Netzwerk direkt öffnen.

### 2. Schnell übers Internet (Tunnel)
Server lokal starten und in einem zweiten Terminal:

```bash
npx localtunnel --port 3000
```

Den angezeigten `https://…`-Link an deinen Freund schicken.
(Alternativ: `cloudflared tunnel --url http://localhost:3000`)

### 3. Dauerhaft kostenlos hosten (Render)
1. Dieses Repo auf GitHub haben.
2. Auf [render.com](https://render.com) → **New → Blueprint** → Repo auswählen (die `render.yaml` ist schon da).
3. Nach dem Deploy bekommst du eine feste URL wie `https://streetball-1v1.onrender.com` – die teilst du einfach.

Jeder andere Node-Host mit WebSocket-Support funktioniert auch (Railway, Fly.io, eigener Server …).
Der Port wird über die Umgebungsvariable `PORT` gesetzt.

## Technik

- **Server** (`server/`): Node.js + `ws`. Autoritative Simulation mit 60 Ticks/s, 30 Snapshots/s an die Clients.
  Ball-Physik mit Ring-, Brett- und Netz-Kollision, Wurf-Genauigkeit abhängig von Timing, Distanz und Verteidigung.
- **Client** (`public/`): Three.js. Eigene Bewegung wird lokal vorhergesagt (fühlt sich ohne Verzögerung an),
  der Gegner wird flüssig interpoliert.
- **Gemeinsamer Code** (`shared/`): Konstanten und Bewegungsphysik, die Server und Client identisch benutzen.

Tests (Wurfphysik + komplettes Bot-gegen-Bot-Spiel):

```bash
npm test
```
