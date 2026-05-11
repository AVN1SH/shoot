// hud.js — DOM-based HUD: HP, Ammo, Score, Wave, Combo, Popups

/* ── Init ─────────────────────────────────────────────────── */
export function initHUD() {
  const hud = {
    hpBar:           document.getElementById('hp-bar'),
    ammoCurrent:     document.getElementById('ammo-current'),
    ammoMax:         document.getElementById('ammo-max'),
    scoreDisplay:    document.getElementById('score-display'),
    waveDisplay:     document.getElementById('wave-display'),
    comboDisplay:    document.getElementById('combo-display'),
    crosshair:       document.getElementById('crosshair'),
    hitMarker:       document.getElementById('hit-marker'),
    hitVignette:     document.getElementById('hit-vignette'),
    loadingScreen:   document.getElementById('loading-screen'),
    loadingProgress: document.getElementById('loading-progress'),
    loadingText:     document.getElementById('loading-text'),
    gameOverScreen:  document.getElementById('game-over-screen'),
    finalScore:      document.getElementById('final-score'),
    finalWave:       document.getElementById('final-wave'),
    restartBtn:      document.getElementById('restart-btn'),
    advanceBtn:      document.getElementById('advance-btn'),
    adsBtn:          document.getElementById('ads-btn'),
    waveClearMsg:    document.getElementById('wave-clear-msg'),
  };

  // Bind convenience methods directly on the hud object so callers can do
  // hud.showHitVignette() without importing the function separately.
  hud.showHitVignette = () => showHitVignette(hud);
  hud.showHitMarker   = () => showHitMarker(hud);

  return hud;
}

/* ── Per-frame HUD update ────────────────────────────────── */
export function updateHUD(hud, playerState, waveIndex) {
  const pct = Math.max(0, (playerState.hp / playerState.maxHp) * 100);
  hud.hpBar.style.width = pct + '%';

  // HP colour: green → yellow → red
  const r = Math.round(255 * (1 - pct / 100));
  const g = Math.round(255 * (pct / 100));
  hud.hpBar.style.background = `linear-gradient(90deg, rgb(${r},${g},20), rgb(${r},${g*0.8|0},0))`;

  hud.ammoCurrent.textContent = playerState.ammo;
  hud.ammoMax.textContent     = playerState.maxAmmo;
  hud.scoreDisplay.textContent = playerState.score.toLocaleString();
  hud.waveDisplay.textContent  = `WAVE ${waveIndex + 1}`;

  if (playerState.combo > 1) {
    hud.comboDisplay.textContent   = `×${playerState.combo}`;
    hud.comboDisplay.style.display = 'block';
  } else {
    hud.comboDisplay.style.display = 'none';
  }
}

/* ── Loading ─────────────────────────────────────────────── */
export function showLoadingProgress(hud, progress) {
  hud.loadingProgress.style.width = (progress * 100).toFixed(1) + '%';
  if (progress >= 1) {
    hud.loadingText.textContent = 'Ready!';
  }
}

export function hideLoadingScreen(hud) {
  hud.loadingScreen.style.transition = 'opacity 0.5s ease';
  hud.loadingScreen.style.opacity    = '0';
  setTimeout(() => { hud.loadingScreen.style.display = 'none'; }, 520);
}

/* ── Game Over ───────────────────────────────────────────── */
export function showGameOver(hud, score, wave, onRestart) {
  hud.gameOverScreen.style.display = 'flex';
  hud.finalScore.textContent = `Score: ${score.toLocaleString()}`;
  hud.finalWave.textContent  = `Wave Reached: ${wave + 1}`;
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
  void el.offsetHeight; // reflow to restart animation
  el.style.animation = 'wave-clear-pop 2s ease-out forwards';
  setTimeout(() => { el.style.display = 'none'; }, 2100);
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
