// Grafikqualität: hoch / mittel / niedrig (im Menü einstellbar)
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

let saved = null;
try { saved = localStorage.getItem('sb_gfx'); } catch { /* egal */ }

export const QUALITY_NAME = ['high', 'mid', 'low'].includes(saved) ? saved : (isTouch ? 'mid' : 'high');

const PRESETS = {
  high: { pixelRatio: 2, post: true, msaa: 4, bloom: true, shadowSize: 2048, spotShadows: 2, courtPx: 80, crowd: 14, cones: true },
  mid: { pixelRatio: 1.5, post: true, msaa: 2, bloom: true, shadowSize: 1024, spotShadows: 1, courtPx: 56, crowd: 8, cones: true },
  low: { pixelRatio: 1, post: false, msaa: 0, bloom: false, shadowSize: 1024, spotShadows: 0, courtPx: 40, crowd: 0, cones: false },
};

export const Q = PRESETS[QUALITY_NAME];

export function setQuality(name) {
  try { localStorage.setItem('sb_gfx', name); } catch { /* egal */ }
}
