// Spieler-Aussehen aus dem Editor: Optionen (für Menü und Figur) und Prüfung (für den Server)

export const LOOK_BODIES = [
  { id: 'm_af', name: 'Athlet', h: '2,01 m' },
  { id: 'm_ca', name: 'Shooter', h: '1,97 m' },
  { id: 'm_as', name: 'Point Guard', h: '1,89 m' },
  { id: 'm_mx', name: 'Allrounder', h: '1,95 m' },
  { id: 'm_big', name: 'Center', h: '2,06 m' },
  { id: 'm_king', name: 'Power-Forward', h: '2,08 m' },
  { id: 'f_af', name: 'Spielerin (Athletin)', h: '1,86 m' },
  { id: 'f_ca', name: 'Spielerin (Shooterin)', h: '1,81 m' },
];
export const LOOK_SKIN = ['#f1cfb4', '#e8bfa0', '#e2b48f', '#d9a988', '#c48d64', '#b07b55', '#9c6a48', '#8a5a3c', '#7c5038', '#6b4430', '#5a3826', '#4a2e20'];
export const LOOK_HAIR = [
  ['bald', 'Glatze'], ['buzz', 'Buzz Cut'], ['fade', 'Fade'], ['waves', 'Waves'], ['afro', 'Afro'], ['hightop', 'Hightop'],
  ['dreads', 'Dreads'], ['twists', 'Twists'], ['cornrows', 'Cornrows'], ['bun', 'Dutt'], ['cap', 'Cap'],
];
export const LOOK_HAIR_COL = ['#1a1310', '#2b1c13', '#3d2616', '#6b4a2a', '#b08850', '#d9c08a', '#5a2414', '#9a9a9a', '#e8413c', '#2f7cf6'];
export const LOOK_BEARD = [['none', 'Kein Bart'], ['stubble', 'Stoppeln'], ['goatee', 'Kinnbart'], ['beard', 'Vollbart']];
export const LOOK_SHOE = ['#f5f5f5', '#111317', '#e11d48', '#f59e0b', '#22c55e', '#2f7cf6', '#a855f7', 'team'];
export const LOOK_TATTOO = [['none', 'Keins'], ['band', 'Armband'], ['sleeve', 'Sleeve']];

export const DEFAULT_LOOK = {
  body: 'm_af', skin: '#7c5038', hair: 'fade', hairCol: '#1a1310', beard: 'stubble', num: 23, shoe: '#f5f5f5',
  headband: false, wristbands: true, chain: false, armSleeve: false, kneeSleeve: false, tattoo: 'none',
};

const hex = (v, list, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) && (!list || list.includes(v.toLowerCase())) ? v.toLowerCase() : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);

// Unbekannte Felder verwerfen, alles auf erlaubte Werte begrenzen
export function sanitizeLook(l) {
  if (!l || typeof l !== 'object') return null;
  const D = DEFAULT_LOOK;
  const num = Math.round(Number(l.num));
  return {
    body: oneOf(l.body, LOOK_BODIES.map((b) => b.id), D.body),
    skin: hex(l.skin, LOOK_SKIN, D.skin),
    hair: oneOf(l.hair, LOOK_HAIR.map((h) => h[0]), D.hair),
    hairCol: hex(l.hairCol, LOOK_HAIR_COL, D.hairCol),
    beard: oneOf(l.beard, LOOK_BEARD.map((b) => b[0]), D.beard),
    num: Number.isFinite(num) ? Math.max(0, Math.min(99, num)) : D.num,
    shoe: l.shoe === 'team' ? 'team' : hex(l.shoe, LOOK_SHOE, D.shoe),
    headband: !!l.headband, wristbands: !!l.wristbands, chain: !!l.chain,
    armSleeve: !!l.armSleeve, kneeSleeve: !!l.kneeSleeve,
    tattoo: oneOf(l.tattoo, LOOK_TATTOO.map((t) => t[0]), D.tattoo),
  };
}
