// hud.js — DOM-based HUD: HP, Ammo Ring, Score, Wave, Combo, Popups

/* ── Init ─────────────────────────────────────────────────── */
export function initHUD() {
  const hud = {
    hpBar:           document.getElementById('hp-bar'),
    hpValue:         document.getElementById('hp-value'),
    ammoCurrent:     document.getElementById('ammo-current'),
    ammoMax:         document.getElementById('ammo-max'),
    ammoRingFill:    document.getElementById('ammo-ring-fill'),
    // score & wave: write to inner span
    scoreDisplay:    document.getElementById('score-value'),
    waveDisplay:     document.getElementById('wave-text'),
    comboDisplay:    document.getElementById('combo-display'),
    crosshair:       document.getElementById('crosshair'),
    hitMarker:       document.getElementById('hit-marker'),
    hitVignette:     document.getElementById('hit-vignette'),
    loadingScreen:   document.getElementById('loading-screen'),
    loadingProgress: document.getElementById('loading-progress'),
    loadingText:     document.getElementById('loading-text'),
    gameOverScreen:  document.getElementById('game-over-screen'),
    finalScore:      document.getElementById('go-score-val'),
    finalWave:       document.getElementById('go-wave-val'),
    restartBtn:      document.getElementById('restart-btn'),
    advanceBtn:      document.getElementById('advance-btn'),
    adsBtn:          document.getElementById('ads-btn'),
    waveClearMsg:    document.getElementById('wave-clear-msg'),
  };

  // Ammo ring circumference: 2 * π * 40 ≈ 251.2
  hud._ammoRingCirc = 251.2;

  hud.showHitVignette = () => showHitVignette(hud);
  hud.showHitMarker   = () => showHitMarker(hud);

  return hud;
}

/* ── Per-frame HUD update ────────────────────────────────── */
export function updateHUD(hud, playerState, waveIndex) {
  // HP bar
  const pct = Math.max(0, (playerState.hp / playerState.maxHp) * 100);
  hud.hpBar.style.width = pct + '%';

  // HP colour: tactical green, red when low
  hud.hpBar.style.background = pct > 25 ? 'var(--accent)' : 'var(--accent-alert)';
  if (hud.hpValue) hud.hpValue.textContent = Math.ceil(playerState.hp);

  // Ammo text
  hud.ammoCurrent.textContent = playerState.ammo;
  hud.ammoMax.textContent     = '/' + playerState.maxAmmo;

  // Ammo ring
  if (hud.ammoRingFill) {
    const ratio   = Math.max(0, playerState.ammo / playerState.maxAmmo);
    const offset  = hud._ammoRingCirc * (1 - ratio);
    hud.ammoRingFill.style.strokeDashoffset = offset;
    // colour: full=white, low=red
    hud.ammoRingFill.style.stroke = ratio > 0.25 ? 'var(--text-main)' : 'var(--accent-alert)';
  }

  // Score & wave
  hud.scoreDisplay.textContent = playerState.score.toLocaleString();
  hud.waveDisplay.textContent  = `WAVE ${waveIndex + 1}`;

  // Combo
  if (playerState.combo > 1) {
    hud.comboDisplay.textContent   = `×${playerState.combo} COMBO`;
    hud.comboDisplay.style.display = 'block';
  } else {
    hud.comboDisplay.style.display = 'none';
  }
}

/* ── Loading ─────────────────────────────────────────────── */
export function showLoadingProgress(hud, progress) {
  hud.loadingProgress.style.width = (progress * 100).toFixed(1) + '%';
  if (progress >= 1) hud.loadingText.textContent = 'Get Ready!';
}

export function hideLoadingScreen(hud) {
  hud.loadingScreen.style.transition = 'opacity 0.5s ease';
  hud.loadingScreen.style.opacity    = '0';
  setTimeout(() => { hud.loadingScreen.style.display = 'none'; }, 520);
}

/* ── Game Over ───────────────────────────────────────────── */
export function showGameOver(hud, score, wave, onRestart) {
  hud.gameOverScreen.style.display = 'flex';
  hud.finalScore.textContent = score.toLocaleString();
  hud.finalWave.textContent  = wave + 1;
  hud.restartBtn.onclick     = onRestart;
}

export function hideGameOver(hud) {
  hud.gameOverScreen.style.display = 'none';
}

/* ── Advance button ──────────────────────────────────────── */
export function showAdvanceButton(hud, onAdvance) {
  hud.advanceBtn.style.display = 'block';
  hud.advanceBtn.onclick       = onAdvance;
}

export function hideAdvanceButton(hud) {
  hud.advanceBtn.style.display = 'none';
}

/* ── Wave clear ──────────────────────────────────────────── */
export function showWaveClearMessage(hud) {
  const el = hud.waveClearMsg;
  el.style.display   = 'block';
  el.style.animation = 'none';
  void el.offsetHeight;
  el.style.animation = 'wc-fade 2.5s ease-out forwards';
  setTimeout(() => { el.style.display = 'none'; }, 2300);
}

/* ── Hit feedback ────────────────────────────────────────── */
export function showHitMarker(hud) {
  const el = hud.hitMarker;
  el.classList.remove('show');
  void el.offsetHeight;
  el.classList.add('show');
}

export function showHitVignette(hud) {
  hud.hitVignette.style.opacity = '1';
  setTimeout(() => { hud.hitVignette.style.opacity = '0'; }, 220);
}

/* ── Score popup ─────────────────────────────────────────── */
export function showScorePopup(points, type = 'normal') {
  const el = document.createElement('div');
  el.className = 'score-popup' + (type !== 'normal' ? ' ' + type : '');
  el.textContent = `+${points}`;

  const cx = window.innerWidth  / 2 + (Math.random() - 0.5) * 90;
  const cy = window.innerHeight / 2 - 50 + (Math.random() - 0.5) * 40;
  el.style.left = cx + 'px';
  el.style.top  = cy + 'px';

  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1050);
}

/* ── ADS crosshair ───────────────────────────────────────── */
export function setCrosshairADS(hud, active) {
  hud.crosshair.classList.toggle('ads', active);
}

/* ── Responsive layout ───────────────────────────────────── */
export function updateHUDLayout(orientation) {
  document.body.classList.toggle('landscape', orientation === 'landscape');
  document.body.classList.toggle('portrait',  orientation === 'portrait');
}
