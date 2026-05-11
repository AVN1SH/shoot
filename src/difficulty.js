// difficulty.js — Wave configuration scaling

export function getWaveConfig(wave) {
  return {
    // ── Enemy count & HP ──────────────────────────────────
    count:              2 + Math.floor(wave * 1.2),
    hp:                 Math.round(60 * Math.pow(1.18, wave)),  // softer early HP

    // ── Headshot one-shot kills waves 0-2 ─────────────────
    headshotOneShot:    wave <= 2,

    // ── Fire behaviour ────────────────────────────────────
    fireInterval:       Math.max(1.2, 5.0 * Math.pow(0.88, wave)),
    damage:             Math.round(6 + wave * 1.2),   // starts very low, grows slowly

    // ── Grenades ─────────────────────────────────────────
    grenadeEnabled:     wave >= 6,
    grenadeTimer:       Math.max(5, 14 - 0.5 * Math.max(0, wave - 6)),

    // ── Special roles ─────────────────────────────────────
    flankers:           wave >= 8 ? 2 : wave >= 4 ? 1 : 0,
    suppressorEnabled:  wave >= 5,
    suppressorInterval: Math.max(3, 5 - 0.2 * Math.max(0, wave - 5)),
    suppressionDamage:  5 + wave,

    // ── Pickup drops ──────────────────────────────────────
    pickupChance:       Math.max(0.1, 0.35 - 0.02 * wave),

    // ── Advanced combat unlocked by wave ─────────────────
    crouchFireEnabled:  wave >= 3,   // enemies fire from crouch after wave 3
    movingFireEnabled:  wave >= 5,   // enemies strafe while shooting after wave 5
    aggressiveAI:       wave >= 4,   // shorter idle/patrol before engaging

    // ── Gun accuracy ──────────────────────────────────────
    gunSpread:          Math.max(0.015, 0.10 - 0.006 * wave),
    strafeSpeed:        1 + wave * 0.07,
    adsOverstayTimer:   2.0,
  };
}
