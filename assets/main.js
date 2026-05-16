// main.js — Game Loop, Initialization, and Orchestration
//
// Two-phase init:
//   Phase 1 (on page load): Show initial loading poster briefly, then show lobby.
//                           NO canvas / 3D resources are created yet.
//   Phase 2 (on START click): Re-show the same loading poster, initialise the
//                           Three.js scene, physics, assets, etc., then start.

import * as THREE from "three";
import { initScene, handleResize } from "./scene.js";
import { initPhysics } from "./physics.js";
import { preloadAll } from "./loader.js";
import { buildStreet, snapPlayerToCover, updateStreet } from "./street.js";
import {
  createPlayerRig,
  playerState,
  updatePlayerState,
  snapToCover,
  enterADS,
  exitADS,
  addDamageToPlayer,
  animateCoverMove,
  animateSpawnIn,
  switchWeapon,
  isOutOfAmmo,
  saveCurrentWeaponAmmo,
  playDeathSequence,
  playAmmoOutSequence,
} from "./player.js";
import { Enemy, setSharedCamera } from "./enemy.js";
import { initInput } from "./input.js";
import { firePlayerBullet } from "./shoot.js";
import { Spawner } from "./spawner.js";
import { getWaveConfig } from "./difficulty.js";
import {
  initHUD,
  updateHUD,
  showLoadingProgress,
  hideLoadingScreen,
  showLoadingScreen,
  showGameOver,
  showWaveClearMessage,
  startLoadingTips,
  showDeathVignette,
  showAmmoOutVignette,
} from "./hud.js";
import { initPoolSystem } from "./pool.js";
import {
  spawnCollectables,
  updateCollectables,
  clearCollectables,
  setCollectableCamera,
  updateGrenadeHUD,
  updateGrenadeAim,
  startGrenadeAim,
  cancelGrenadeAim,
  throwPlayerGrenade,
  createGrenadeHUD,
  injectCollectableCSS,
} from "./collectables.js";
import { SeededRNG } from "./utils.js";
import { initLobby, showLobby, hideLobby } from "./lobby.js";

/* ═══════════════════════════════════════════════════════════
   GLOBAL STATE
══════════════════════════════════════════════════════════════ */
const gameState = {
  running: false,
  paused: false,
  waveIndex: 0,
  waveCleared: false,
  coverSlots: [],
  currentSlot: null,
  highScore: 0,
};

/* Systems refs */
let renderer, scene, sky, world, playerRig, hud, spawner;
let frameTimes = [];
let streetRNG;

/* Grenade aim state */
let _grenadeAimActive = false; // true while player is holding grenade icon
let _grenadeAimWasADS = false; // was ADS already active before aim started

/* Ammo-out deferred check: timestamp when ammo was first detected as empty */
let _ammoOutDetectedAt = 0;

/* Track whether the heavy 3D init has been done already */
let _gameInitialized = false;

/* ═══════════════════════════════════════════════════════════
   PHASE 1 — ASSET PRELOAD + LOBBY (no canvas, no 3D)
══════════════════════════════════════════════════════════════ */
async function init() {
  /* HUD — just grab DOM references; no 3D yet */
  hud = initHUD();

  // Collectables: inject CSS and build grenade HUD widget (lightweight)
  injectCollectableCSS();
  createGrenadeHUD({
    onAimStart: _onGrenadeAimStart,
    onAimEnd: _onGrenadeAimEnd,
    onAimCancel: _onGrenadeAimCancel,
    onQuickThrow: _onThrowGrenade,
  });

  /* YouTube Playables: Load cloud save data (high score) */
  if (typeof ytgame !== "undefined" && ytgame.game && ytgame.game.loadData) {
    try {
      const saved = await ytgame.game.loadData();
      if (saved) {
        const data = JSON.parse(saved);
        if (data && typeof data.highScore === "number") {
          gameState.highScore = data.highScore;
          console.log("[YT] Loaded high score:", gameState.highScore);
        }
      }
    } catch (e) {
      console.warn("[YT] Cloud load failed:", e);
    }
  }

  /* YouTube Playables: First frame is now visible (loading screen) */
  if (typeof ytgame !== "undefined") {
    ytgame.game.firstFrameReady();
  }

  /* Show the initial loading screen with progress bar */
  showLoadingScreen(hud);
  startLoadingTips();
  hud.loadingText.textContent = "Loading assets…";

  /* ── PHASE 1A: Preload all game assets ── */
  console.log("[Init] Preloading assets...");
  try {
    await preloadAll((p) => {
      showLoadingProgress(hud, p);
    });
    console.log("[Init] Assets preloaded successfully");
  } catch (e) {
    console.warn("[Init] Asset preload warning:", e);
  }

  // Show "GET READY!" when complete
  showLoadingProgress(hud, 1.0);
  hud.loadingText.textContent = "GET READY!";
  await delay(1000);

  /* Hide loading screen and show the Lobby */
  hideLoadingScreen(hud);

  // ── Initialize and show the Lobby ──
  initLobby(() => {
    // This callback runs when "START" is clicked in the lobby
    _onStartClicked();
  });
  showLobby();

  /* YouTube Playables: Cloud save — load then immediately write back.
     IMPORTANT: loadData() MUST be awaited before saveData() is called,
     otherwise YouTube rejects the save. The test suite calls loadData()
     right after gameReady() and checks the byte size < 3 MiB. */
  if (typeof ytgame !== "undefined" && ytgame.game) {
    ytgame.game.gameReady();

    if (ytgame.game.loadData && ytgame.game.saveData) {
      try {
        // Step 1: must load first (SDK requirement)
        await ytgame.game.loadData();
        // Step 2: write a tiny payload so test suite finds valid data
        const payload = JSON.stringify({ highScore: gameState.highScore || 0 });
        await ytgame.game.saveData(payload);
        console.log("[YT] Cloud save written after gameReady.");
      } catch (e) {
        console.warn("[YT] Cloud save init failed:", e);
      }
    }
  }

  // Start the game loop early — it will simply no-op until gameState.running = true
  _prevTime = performance.now();
  gameLoop(performance.now());
}

/* ═══════════════════════════════════════════════════════════
   PHASE 2 — HEAVY 3D INIT (triggered by START button)
                 Assets already preloaded!
══════════════════════════════════════════════════════════════ */
async function _onStartClicked() {
  // Prevent double-click
  if (_gameInitialized) return;
  _gameInitialized = true;

  // Hide the lobby
  hideLobby();

  // Show a brief loading screen (assets already loaded, so this is quick)
  showLoadingScreen(hud);
  hud.loadingText.textContent = "Starting game…";
  showLoadingProgress(hud, 0.0);
  startLoadingTips();

  /* Scene */
  console.log("[Init] Creating scene...");
  ({ renderer, scene, sky } = initScene());
  console.log("[Init] Scene created");

  /* Physics */
  console.log("[Init] Loading physics...");
  showLoadingProgress(hud, 0.1);
  hud.loadingText.textContent = "Loading physics…";
  try {
    world = await initPhysics();
    console.log("[Init] Physics ready");
  } catch (e) {
    console.error("[Init] Physics failed:", e);
    hud.loadingText.textContent = "Physics error: " + e.message;
    return;
  }

  // Assets already loaded, just initialize sky clouds
  if (sky) sky.initClouds();

  /* Pools */
  showLoadingProgress(hud, 0.2);
  initPoolSystem(scene);
  console.log("[Init] Pools ready");

  /* Player rig */
  showLoadingProgress(hud, 0.4);
  hud.loadingText.textContent = "Building player…";
  playerRig = await createPlayerRig(scene);
  console.log("[Init] Player rig ready");
  setCollectableCamera(playerRig.camera);
  setSharedCamera(playerRig.camera); // REQUIRED for enemy UI projection

  /* Street */
  showLoadingProgress(hud, 0.6);
  hud.loadingText.textContent = "Building world…";
  streetRNG = new SeededRNG(42);
  const { slots } = await buildStreet(scene, world, streetRNG);
  console.log("[Init] Street ready, slots:", slots.length);
  gameState.coverSlots = slots;

  /* Spawner — create immediately so game loop never gets null reference */
  spawner = new Spawner(scene, world, slots, hud);

  /* Input — wire ADS buttons */
  initInput(playerRig, hud, onFire);
  console.log("[Init] Input ready");

  /* Weapon switch button */
  const switchBtn = document.getElementById("weapon-switch-btn");
  if (switchBtn) {
    switchBtn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      switchWeapon(playerRig, hud);
    });
  }
  /* Keyboard: Tab or number keys to switch */
  window.addEventListener("keydown", (e) => {
    if (e.code === "Tab" || e.code === "Digit1" || e.code === "Digit2") {
      e.preventDefault();
      switchWeapon(playerRig, hud);
    }
    if (e.code === "KeyG") {
      // Keyboard G = instant throw (no aim preview)
      _onThrowGrenade();
    }
  });

  showLoadingProgress(hud, 0.9);
  hud.loadingText.textContent = "Spawning enemies…";

  showLoadingProgress(hud, 1.0);
  await delay(300);
  hideLoadingScreen(hud);

  // Now actually start the gameplay
  _startGame();
}

async function _startGame() {
  /* ── Animated run into first cover ─────────────────────── */
  const slots = gameState.coverSlots;
  if (slots.length > 0) {
    const firstCover = slots[0];
    gameState.currentSlot = firstCover;

    console.log(
      "[Init] Animating player into cover at",
      firstCover.xPos.toFixed(1),
      firstCover.zPos.toFixed(1),
    );

    // Start spawn-in animation; enemies appear after player reaches cover
    animateSpawnIn(playerRig, firstCover, async () => {
      await spawner.spawnWave(gameState.waveIndex, playerRig.body.position.z);
      console.log("[Init] Wave spawned, enemies:", spawner.enemies.length);
    });
  } else {
    // Fallback — no cover slots, spawn immediately
    await spawner.spawnWave(gameState.waveIndex, playerRig.body.position.z);
  }

  gameState.running = true;
  _prevTime = performance.now();
  console.log("[Init] Game started!");
}

/* ═══════════════════════════════════════════════════════════
   GAME LOOP
══════════════════════════════════════════════════════════════ */
let _prevTime = 0;
const FIXED_DT = 1 / 60;

function gameLoop(now) {
  requestAnimationFrame(gameLoop);
  if (!gameState.running) return;

  const wallDt = Math.min((now - _prevTime) / 1000, 0.05);
  _prevTime = now;

  // During death sequence: keep rendering but skip game logic
  if (gameState.paused || playerState.isDying) {
    // Still update the renderer so the death camera animation is visible
    renderer.render(scene, playerRig.camera);
    return;
  }

  /* Physics */
  world.step();

  /* Updates */
  updatePlayerState(playerRig, FIXED_DT);
  if (spawner) spawner.update(FIXED_DT);

  // Update collectables (bob, spin, proximity collect)
  updateCollectables(FIXED_DT, playerState.cameraWorldPos, scene, hud);
  updateGrenadeHUD();

  // Update grenade aim trajectory preview while aiming
  if (_grenadeAimActive && playerRig) {
    updateGrenadeAim(playerRig.camera);
  }
  updateStreet(playerRig.body.position.z, scene, world, streetRNG);
  if (sky) sky.update(FIXED_DT, playerRig.body.position.z);

  /* ADS timer (exposure punishment) */
  if (playerState.isADS) {
    playerState.adsTimer += wallDt;
  }

  /* Game logic — health death is immediate; ammo-out is deferred */
  if (!playerState.isDying) {
    if (playerState.hp <= 0) {
      playerState.isGameOver = true;
      playerState.gameOverReason = "health";
      // Ensure HUD shows 0 HP before we stop updating logic
      updateHUD(hud, playerState, gameState.waveIndex);
      triggerDeathSequence("health");
      return;
    }

    // Detect ammo depletion — but DON'T trigger game over immediately.
    // Wait for: (a) current enemy death to play out,
    //           (b) wave to clear and player to reach next cover,
    //           (c) future: ammo pickups during travel).
    if (isOutOfAmmo() && !playerState.pendingAmmoOut) {
      playerState.pendingAmmoOut = true;
      _ammoOutDetectedAt = now;
      console.log("[Game] Player out of ammo — deferring game over check");
    }
  }

  checkWaveClear();
  checkPendingAmmoOut(now);
  checkADSPunishment();
  checkAutoReload();

  /* Render */
  updateHUD(hud, playerState, gameState.waveIndex);
  renderer.render(scene, playerRig.camera);

  /* Perf */
  frameTimes.push(wallDt * 1000);
  if (frameTimes.length >= 60) {
    adaptQuality();
    frameTimes = [];
  }
}

/* ═══════════════════════════════════════════════════════════
   FIRE
══════════════════════════════════════════════════════════════ */
function onFire() {
  if (!gameState.running || gameState.paused || playerState.isDying) return;
  if (playerState.isAnimatingMove) return; // no shooting while running
  // Only allow shooting when ADS (peeking over cover) or if exposed
  if (!playerState.isADS && playerState.behindCover) return;
  firePlayerBullet(scene, playerRig.camera, spawner.enemies, hud, null);
}

/* ═══════════════════════════════════════════════════════════
   WAVE LOGIC
══════════════════════════════════════════════════════════════ */
function checkWaveClear() {
  // Guard: spawner not ready, wave already cleared, or player still running
  if (!spawner || gameState.waveCleared || playerState.isAnimatingMove) return;
  // Guard: no enemies have been spawned yet for this wave
  if (spawner.enemies.length === 0) return;
  // Guard: still alive enemies remain
  if (!spawner.isWaveCleared()) return;

  gameState.waveCleared = true;

  // ── Block ADS after wave clear (re-enabled when player reaches next block) ──
  playerState.adsBlocked = true;
  // If currently ADS, force exit
  if (playerState.isADS) {
    exitADS(playerRig, hud);
  }

  const bonus = 500 * (gameState.waveIndex + 1) * playerState.combo;
  playerState.score += bonus;

  showWaveClearMessage(hud);

  // Auto-advance after 2 s — no button press needed
  setTimeout(() => {
    if (gameState.running) advanceWave();
  }, 2000);
}

function checkADSPunishment() {
  if (!playerState.isADS) return;
  const cfg = getWaveConfig(gameState.waveIndex);
  if (playerState.adsTimer < (cfg.adsOverstayTimer ?? 4.0)) return;

  const alive = spawner.getAliveEnemies?.() ?? [];
  if (alive.length > 0 && alive[0].gun) {
    alive[0].gun.setGuaranteedHit?.();
  }
}

function checkAutoReload() {
  if (
    playerState.ammo === 0 &&
    !playerState.isReloading &&
    playerState.totalAmmo > 0
  ) {
    triggerReload();
  }
}

/**
 * Deferred ammo-out check: triggers game over only when the time is right.
 *
 * - If wave just cleared (waveCleared=true): wait for advanceWave to move player
 *   to next cover, then check there (future: ammo pickups during travel).
 * - If player is currently moving (isAnimatingMove): wait until they arrive.
 * - If 2+ seconds have passed and wave hasn't cleared (enemies still alive,
 *   player has no ammo to fight): trigger the ammo-out animation.
 * - After arriving at next cover, advanceWave's onComplete will re-check
 *   isOutOfAmmo() and trigger if still empty.
 */
function checkPendingAmmoOut(now) {
  if (!playerState.pendingAmmoOut || playerState.isDying) return;

  // Wave is clearing — wait for advanceWave to run and move player to next cover.
  // The advanceWave onComplete callback will handle the final check.
  if (gameState.waveCleared) return;

  // Player is running to next cover — wait until they arrive.
  if (playerState.isAnimatingMove) return;

  // Enough time has passed for the killed enemy's death to play out.
  // If the wave still hasn't cleared, the player is stuck with no ammo.
  const elapsed = now - _ammoOutDetectedAt;
  if (elapsed > 2000) {
    playerState.pendingAmmoOut = false;
    playerState.isGameOver = true;
    playerState.gameOverReason = "ammo";
    triggerDeathSequence("ammo");
  }
}

function triggerReload() {
  playerState.isReloading = true;
  if (hud.ammoCurrent) hud.ammoCurrent.textContent = "…";
  setTimeout(() => {
    // Reload from reserve: fill magazine up to maxAmmo or whatever reserve allows
    const needed = playerState.maxAmmo - playerState.ammo;
    const available = Math.min(needed, playerState.totalAmmo);
    playerState.ammo += available;
    playerState.totalAmmo -= available; // Deduct transferred bullets from reserve
    playerState.isReloading = false;
    // Sync the updated ammo to per-weapon storage
    saveCurrentWeaponAmmo();
  }, 1800);
}

function advanceWave() {
  gameState.waveIndex++;
  // Don't reset waveCleared or flush enemies yet — let death animations finish.
  // waveCleared stays true so checkWaveClear() won't re-fire during the run.
  // Dead enemies are cleaned up by spawnWave's filter when the next wave starts.

  const nextSlotIdx = gameState.waveIndex;
  const nextSlot =
    gameState.coverSlots[
      Math.min(nextSlotIdx, gameState.coverSlots.length - 1)
    ];

  if (nextSlot) {
    const prevSlot = gameState.currentSlot ?? nextSlot;
    gameState.currentSlot = nextSlot;
    playerState.isADS = false;

    // Clear leftover collectables and spawn new ones along this run path
    clearCollectables(scene);
    spawnCollectables(scene, prevSlot, nextSlot, gameState.waveIndex - 1).catch(
      (e) => console.warn("[Collectables] Spawn error:", e),
    );

    // Animated run to next cover — enemies spawn AFTER player arrives
    animateCoverMove(playerRig, prevSlot, nextSlot, () => {
      // Clear any uncollected items once player reaches new cover
      clearCollectables(scene);

      // ── Re-enable ADS now that player has reached the next block ──
      playerState.adsBlocked = false;

      // ── After arriving at new cover, check if player is out of ammo ──
      if (playerState.pendingAmmoOut && isOutOfAmmo()) {
        playerState.pendingAmmoOut = false;
        playerState.isGameOver = true;
        playerState.gameOverReason = "ammo";
        triggerDeathSequence("ammo");
        return; // Don't spawn next wave — game is over
      }
      // Ammo was picked up during travel or flag was cleared — continue
      playerState.pendingAmmoOut = false;
      gameState.waveCleared = false; // Reset now — new wave is about to spawn
      spawner.spawnWave(gameState.waveIndex, playerRig.body.position.z);
    });
  } else {
    // No next cover slot — check ammo before spawning
    if (playerState.pendingAmmoOut && isOutOfAmmo()) {
      playerState.pendingAmmoOut = false;
      playerState.isGameOver = true;
      playerState.gameOverReason = "ammo";
      triggerDeathSequence("ammo");
      return;
    }
    playerState.pendingAmmoOut = false;
    playerState.adsBlocked = false; // re-enable ADS at next block (no cover slot case)
    gameState.waveCleared = false; // Reset now — new wave is about to spawn
    spawner.spawnWave(gameState.waveIndex, playerRig.body.position.z);
  }
}

/** Start the smooth game-over animation, then show game over screen.
 *  Branches based on reason:
 *    - 'health' → death animation (red vignette, camera collapse)
 *    - 'ammo'   → ammo-out animation (amber vignette, weapon lowers, look down)
 */
function triggerDeathSequence(reason) {
  if (reason === "ammo") {
    // Ammo-out: yellow/amber vignette + weapon-lowering animation
    showAmmoOutVignette(hud);
    playAmmoOutSequence(playerRig, () => {
      endGame();
    });
  } else {
    // Health depleted: red damage vignette + death collapse animation
    showDeathVignette(hud);
    playDeathSequence(playerRig, () => {
      endGame();
    });
  }
}

/* ═══════════════════════════════════════════════════════════
   GRENADE AIM & THROW (Hold-to-aim system)
══════════════════════════════════════════════════════════════ */

/** Shared damage callback for grenade explosions */
function _grenadeExplodeHandler(explodePos, radius, damage) {
  if (!spawner) return;
  // ── Kill max 4 nearest enemies to the grenade ──
  // Use 2D distance (XZ plane) for more reliable blast detection
  // since explosion is at ground level and enemies stand on ground
  const candidates = spawner.enemies
    .filter((e) => !e.isDead && e.root)
    .map((e) => ({
      enemy: e,
      dist: new THREE.Vector2(
        e.root.position.x - explodePos.x,
        e.root.position.z - explodePos.z,
      ).length(),
    }))
    .filter((c) => c.dist < radius)
    .sort((a, b) => a.dist - b.dist); // nearest first

  console.log(
    "[Grenade] Explosion at",
    explodePos.x.toFixed(1),
    explodePos.z.toFixed(1),
    "| candidates in radius:",
    candidates.length,
    "| radius:",
    radius,
    "| damage:",
    damage,
  );

  for (const { enemy, dist } of candidates) {
    const falloff = 1 - dist / radius;
    const dmg = Math.round(damage * falloff);
    console.log(
      "[Grenade] Hitting enemy at dist",
      dist.toFixed(1),
      "dmg:",
      dmg,
      "hp before:",
      enemy.hp,
    );
    enemy.takeDamage(dmg, false);
  }
}

/** Instant throw — keyboard G or fallback */
function _onThrowGrenade() {
  if (!gameState.running || gameState.paused) return;
  if (!playerState.grenades || playerState.grenades <= 0) return;
  if (playerState.isAnimatingMove || playerState.isGameOver) return;

  // ── Peek over cover before throwing ──
  const wasADS = playerState.isADS;
  if (!wasADS && playerState.behindCover && !playerState.adsBlocked) {
    enterADS(playerRig, hud);
  }

  throwPlayerGrenade(
    scene,
    playerRig.camera,
    world,
    hud,
    _grenadeExplodeHandler,
  );

  // ── Exit ADS (duck back behind cover) after a short peek ──
  if (!wasADS && playerState.isADS) {
    setTimeout(() => {
      if (playerState.isADS && !playerState.isDying) {
        exitADS(playerRig, hud);
      }
    }, 600);
  }
}

/** Hold started — enter aim mode with trajectory preview */
function _onGrenadeAimStart() {
  if (!gameState.running || gameState.paused) return;
  if (!playerState.grenades || playerState.grenades <= 0) return;
  if (playerState.isAnimatingMove || playerState.isGameOver) return;
  if (_grenadeAimActive) return;

  // Track whether ADS was already active
  _grenadeAimWasADS = playerState.isADS;

  // ── Peek over cover to aim ──
  if (
    !_grenadeAimWasADS &&
    playerState.behindCover &&
    !playerState.adsBlocked
  ) {
    enterADS(playerRig, hud);
  }

  // ── Start trajectory preview ──
  if (startGrenadeAim(scene, playerRig.camera)) {
    _grenadeAimActive = true;
  }
}

/** Hold released — throw grenade along aimed trajectory */
function _onGrenadeAimEnd() {
  if (!_grenadeAimActive) return;
  _grenadeAimActive = false;

  // ── Throw grenade ──
  throwPlayerGrenade(
    scene,
    playerRig.camera,
    world,
    hud,
    _grenadeExplodeHandler,
  );

  // ── Exit ADS after a short peek ──
  if (!_grenadeAimWasADS && playerState.isADS) {
    setTimeout(() => {
      if (playerState.isADS && !playerState.isDying) {
        exitADS(playerRig, hud);
      }
    }, 600);
  }
}

/** Aim cancelled (pointer left button, etc.) — cancel without throwing */
function _onGrenadeAimCancel() {
  if (!_grenadeAimActive) return;
  _grenadeAimActive = false;

  // ── Remove trajectory preview ──
  cancelGrenadeAim(scene);

  // ── Exit ADS if we entered it for aiming ──
  if (!_grenadeAimWasADS && playerState.isADS) {
    exitADS(playerRig, hud);
  }
}

function endGame() {
  gameState.running = false;
  clearCollectables(scene);

  /* YouTube Playables: Save high score to cloud on game over */
  if (typeof ytgame !== "undefined" && ytgame.game && ytgame.game.saveData) {
    const best = Math.max(playerState.score, gameState.highScore || 0);
    gameState.highScore = best;

    // Save max kills too
    const prevMaxKills = parseInt(localStorage.getItem("maxKills") || "0");
    localStorage.setItem("maxKills", Math.max(prevMaxKills, playerState.kills));
    localStorage.setItem("highScore", best);

    const payload = JSON.stringify({ highScore: best });
    ytgame.game
      .saveData(payload)
      .catch((e) => console.warn("[YT] Cloud save on game over failed:", e));
  }

  showGameOver(
    hud,
    playerState.score,
    gameState.waveIndex,
    restartGame,
    playerState.gameOverReason,
  );
}

function restartGame() {
  window.location.reload();
}

/* ═══════════════════════════════════════════════════════════
   ADAPTIVE QUALITY
══════════════════════════════════════════════════════════════ */
function adaptQuality() {
  if (!frameTimes.length) return;
  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;

  // Adapt renderer pixel ratio based on frame time. High ms → lower DPR.
  // Three.js accepts fractional pixel ratios; default is window.devicePixelRatio.
  const currentDPR = renderer.getPixelRatio();
  const maxDPR = Math.min(window.devicePixelRatio || 1, 1.5); // capped at 1.5 to control heap
  const minDPR = 2.75;

  if (avg > 24 && currentDPR > minDPR) {
    // Struggling: drop DPR by ~25%
    const next = Math.max(minDPR, currentDPR * 0.85);
    if (Math.abs(next - currentDPR) > 0.02) renderer.setPixelRatio(next);
  } else if (avg < 14 && currentDPR < maxDPR) {
    // Headroom: raise DPR slightly
    const next = Math.min(maxDPR, currentDPR * 1.08);
    if (Math.abs(next - currentDPR) > 0.02) renderer.setPixelRatio(next);
  }

  // Toggle shadow map entirely if we're REALLY struggling.
  if (avg > 40 && renderer.shadowMap.enabled) {
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.needsUpdate = true;
  } else if (avg < 16 && !renderer.shadowMap.enabled) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.needsUpdate = true;
  }
}

/* ═══════════════════════════════════════════════════════════
   RESIZE
══════════════════════════════════════════════════════════════ */
function onResize() {
  // Only resize if the renderer has been created (Phase 2)
  if (renderer && playerRig) {
    handleResize(renderer, playerRig.camera);
  }
  const isLandscape = window.innerWidth > window.innerHeight;
  document.body.classList.toggle("landscape", isLandscape);
  document.body.classList.toggle("portrait", !isLandscape);
}

/* ═══════════════════════════════════════════════════════════
   UTIL
══════════════════════════════════════════════════════════════ */
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ═══════════════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════════════════ */
init().catch((err) => {
  console.error("[Init] Fatal error:", err);
  const lt = document.getElementById("loading-text");
  const ls = document.getElementById("loading-screen");
  if (lt) lt.textContent = `Error: ${err.message}`;
  if (ls) ls.style.display = "flex";
});
