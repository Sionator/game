# 🏀 Streetball 1v1 · 2v2

Ein **3D-Basketballspiel**, das du online mit Freunden im Browser spielst – **1 gegen 1 oder 2 gegen 2**, am PC oder am Handy.
Nachts auf einem Streetball-Court mitten in der Stadt: Crossover, Dunks, Blocks und Trash-Talk per Emote.

## Features

- **1v1 und 2v2 online** – Raum erstellen, 4-stelligen Code oder Link verschicken, Teams wählen, los geht's
- **Freie Plätze füllen Bots** – z. B. du + Freund gegen 2 Bots. Verlässt jemand das Spiel, übernimmt ein Bot
- **Ball-Handling** – der Ball ist in der rechten oder linken Hand: Drives, Crossover, zwischen den Beinen
- **Combos** – Doppel-Crossover, Hesi-Cross, Beine→Drive … erhöhen die Chance auf einen Ankle Breaker
- **Passen & Assists** im 2v2, Ball fordern, Pässe können abgefangen werden
- **Wurf-Timing wie in NBA 2K** – Leertaste halten, im grünen Bereich loslassen. Zu früh = zu kurz, zu spät = zu lang
- **Dunks** – mit Sprint auf den Korb zu und werfen 💥
- **Blocks** – springen, wenn der Gegner wirft (auch Poster-Blocks gegen Dunks!)
- **Steals** – je nachdem, auf welcher Seite der Ball ist: geschützt oder angreifbar
- **Ankle Breaker** 🦴 – Move gegen einen Verteidiger, der in die falsche Richtung läuft oder gerade daneben gegriffen hat
- **ON FIRE** 🔥 – 3 Treffer in Folge und dein grüner Bereich wird größer, bis der Gegner trifft
- **Streetball-Regeln** – nach Rebound oder Steal musst du den Ball erst hinter die Dreierlinie **klären**
- **14-Sekunden-Wurfuhr**, Spiel bis 11 oder 21
- **Übungsmodus gegen Bots** (Rookie, Street, MVP, King) – im 2v2 mit Bot-Mitspieler
- **Emotes** (🔥 😂 💪 GG …), Statistiken am Spielende, Revanche-Button
- **Handy-Steuerung** mit Joystick und Buttons
- Echte Ball-Physik (Ring, Brett, Netz), synthetisierte Sounds – keine externen Dateien
- **Grafik:** Nacht-Court mit Flutlicht, mehreren Schatten, Lichtkegeln, Bloom, spiegelnden Pfützen,
  Graffiti-Wand, Skyline mit Neonschildern und jubelnden Zuschauern; ein Netz, das sich um den Ball verformt
- **Realistische Spieler:** echte Menschmodelle (abgeleitet aus MakeHuman, CC0) mit 54-Knochen-Skelett,
  7 Körpertypen (Spieler und Spielerinnen, verschiedene Größen und Herkünfte), gebackener Umgebungsverdeckung,
  Poren, warmer Haut, Augen mit Hornhaut-Glanz, Wimpern und Augenbrauen; Frisuren (Afro, Dreads, Cornrows,
  Twists, Hightop, Dutt, Fade, Waves, …), Bärte, Tattoos, Sleeves, Stirnbänder, Ketten, Sneaker;
  Tank-Top-Trikots mit Paspel, Teamname, Nummer und Name auf dem Rücken, weite Shorts
- Im Menü wählbar: Figur **Zufall / Spieler / Spielerin / Power-Forward** (2,06 m, Vollbart, Stirnband, Kette)
- Bot-Stufe **King**: ein Power-Forward als stärkster Bot – zieht zum Korb, dunkt, trifft sicher
- **Grafikqualität** im Menü einstellbar (Hoch / Mittel / Niedrig) – am Handy automatisch „Mittel“

## Steuerung

| Taste | Aktion |
|---|---|
| `W A S D` / Pfeiltasten | Laufen |
| `Shift` | Sprinten (kostet Ausdauer) |
| `Leertaste` halten & loslassen | Werfen (auf den grünen Bereich achten!) |
| `Leertaste` + Sprint nah am Korb | Dunk |
| `Q` | Dribble-Move nach **rechts** |
| `E` | Dribble-Move nach **links** |
| `C` | Handwechsel (zwischen den Beinen) |
| `F` | Pass zum Mitspieler (2v2) – ohne Ball: Ball fordern |
| `Leertaste` ohne Ball | Springen / Blocken |
| `Q` / `E` ohne Ball | Ball klauen |
| `1`–`8` | Emotes |
| `M` | Ton an/aus |

### Handling im Detail

- Dribbelst du in Richtung deiner **Ballhand**, ist es ein schneller **Drive**.
- Dribbelst du **zur anderen Seite**, ist es ein **Crossover**: der Ball wandert vor dem Körper in die andere Hand.
  Das ist stark, aber in dem Moment kann der Verteidiger den Ball leichter klauen.
- `C` wechselt die Hand **zwischen den Beinen** – sicherer, aber langsamer.
- Halte den Ball auf der Seite **weg vom Verteidiger**, dann ist er schwer zu klauen.
- **Combos** (innerhalb von ~1 Sekunde): Crossover → Crossover zurück, Drive → Crossover, `C` → Drive/Crossover.

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

Den angezeigten `https://…`-Link an deine Freunde schicken.
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
  der Gegner wird flüssig interpoliert. Die 3D-Welt liegt in `public/js/gfx/` (Court, Korb, Stadt, Figuren, Effekte);
  Court, Stadt und Kleidung werden prozedural erzeugt. Die Figuren-Daten (`public/assets/char/`) erzeugt
  `node tools/build-character.mjs [Pfad/zu/makehuman/data]` aus den CC0-Daten von
  [MakeHuman](https://github.com/makehumancommunity/makehuman) (Morphs, Skelett, Gewichte, AO- und Masken-Texturen).
- **Gemeinsamer Code** (`shared/`): Konstanten und Bewegungsphysik, die Server und Client identisch benutzen.

Tests (Wurfphysik + komplettes Bot-gegen-Bot-Spiel):

```bash
npm test
```
