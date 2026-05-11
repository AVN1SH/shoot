// utils.js — Seeded RNG, math helpers, score utilities

/* ── Seeded RNG ──────────────────────────────────────────── */
export class SeededRNG {
  constructor(seed = 42) { this.seed = seed; }
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  nextInt(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
  pick(arr) { return arr[this.nextInt(0, arr.length - 1)]; }
}

/* ── Math helpers ────────────────────────────────────────── */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp  = (a, b, t)   => a + (b - a) * clamp(t, 0, 1);

/* ── Score helpers ───────────────────────────────────────── */

/**
 * Add points × combo to playerState.score.
 * Returns the actual points added.
 */
export function addScore(playerState, points) {
  const earned = Math.floor(points * playerState.combo);
  playerState.score += earned;
  return earned;
}

export function incrementCombo(playerState) {
  playerState.combo = Math.min(4, playerState.combo + 1);
  playerState.comboTimer = 5.0; // seconds before decay
}

export function resetCombo(playerState) {
  playerState.combo = 1;
  playerState.comboTimer = 0;
}

/* ── Misc ────────────────────────────────────────────────── */
export function debounce(fn, ms) {
  let id;
  return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
}
