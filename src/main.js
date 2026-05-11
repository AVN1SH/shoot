// main.js — Game Loop, Initialization, and Orchestration

import * as THREE from "three";
import { initScene, handleResize } from "./scene.js";
import { initPhysics } from "./physics.js";
import { preloadAll } from "./loader.js";
import { buildStreet, snapPlayerToCover } from "./street.js";
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
} from "./player.js";
import { initInput } from "./input.js";
import { firePlayerBullet } from "./shoot.js";
import { Spawner } from "./spawner.js";
import { getWaveConfig } from "./difficulty.js";
import {
  initHUD,
  updateHUD,
  showLoadingProgress,
  hideLoadingScreen,
  showGameOver,
  showWaveClearMessage,
} from "./hud.js";
import { initPoolSystem } from "./pool.js";
import { SeededRNG } from "./utils.js";

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
};

/* Systems refs */
let renderer, scene, world, playerRig, hud, spawner;
let frameTimes = [];

/* ═══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
async function init() {
  /* HUD */
  hud = initHUD();
  console.log("[Init] HUD ready");

  /* Scene */
  console.log("[Init] Creating scene...");
  ({ renderer, scene } = initScene());
  console.log("[Init] Scene created");

  /* Physics */
  console.log("[Init] Loading physics...");
  showLoadingProgress(hud, 0.05);
  hud.loadingText.textContent = "Loading physics…";
  try {
    world = await initPhysics();
    console.log("[Init] Physics ready");
  } catch (e) {
    console.error("[Init] Physics failed:", e);
    hud.loadingText.textContent = "Physics error: " + e.message;
    return;
  }

  /* Assets */
  console.log("[Init] Preloading assets...");
  hud.loadingText.textContent = "Loading assets…";
  try {
    await preloadAll((p) => showLoadingProgress(hud, 0.1 + p * 0.5));
    console.log("[Init] Assets loaded");
  } catch (e) {
    console.warn("[Init] Asset load warning (continuing):", e);
  }

  /* Pools */
  initPoolSystem(scene);
  console.log("[Init] Pools ready");

  /* Player rig */
  showLoadingProgress(hud, 0.65);
  hud.loadingText.textContent = "Building player…";
  playerRig = await createPlayerRig(scene);
  console.log("[Init] Player rig ready");

  /* Street */
  showLoadingProgress(hud, 0.75);
  hud.loadingText.textContent = "Building world…";
  const rng = new SeededRNG(42);
  const { slots } = await buildStreet(scene, world, rng);
  console.log("[Init] Street ready, slots:", slots.length);
  gameState.coverSlots = slots;

  /* Spawner — create immediately so game loop never gets null reference */
  spawner = new Spawner(scene, world, slots, hud);

  /* Input — wire ADS buttons */
  initInput(playerRig, hud, onFire);
  console.log("[Init] Input ready");

  showLoadingProgress(hud, 0.9);
  hud.loadingText.textContent = "Spawning enemies…";

  /* ── Animated run into first cover ─────────────────────── */
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
      await spawner.spawnWave(gameState.waveIndex);
      console.log("[Init] Wave spawned, enemies:", spawner.enemies.length);
    });
  } else {
    // Fallback — no cover slots, spawn immediately
    await spawner.spawnWave(gameState.waveIndex);
  }

  /* Resize */
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", () => setTimeout(onResize, 200));
  onResize();

  showLoadingProgress(hud, 1.0);
  await delay(300);
  hideLoadingScreen(hud);

  gameState.running = true;
  _prevTime = performance.now();
  console.log("[Init] Game started!");
  gameLoop(performance.now());
}

/* ═══════════════════════════════════════════════════════════
   GAME LOOP
══════════════════════════════════════════════════════════════ */
let _prevTime = 0;
const FIXED_DT = 1 / 60;

function gameLoop(now) {
  requestAnimationFrame(gameLoop);
  if (!gameState.running || gameState.paused) return;

  const wallDt = Math.min((now - _prevTime) / 1000, 0.05);
  _prevTime = now;

  /* Physics */
  world.step();

  /* Updates */
  updatePlayerState(playerRig, FIXED_DT);
  if (spawner) spawner.update(FIXED_DT);

  /* ADS timer (exposure punishment) */
  if (playerState.isADS) {
    playerState.adsTimer += wallDt;
  }

  /* Game logic */
  if (playerState.hp <= 0) {
    endGame();
    return;
  }

  checkWaveClear();
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
  if (!gameState.running || gameState.paused) return;
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
  if (playerState.ammo === 0 && !playerState.isReloading) {
    triggerReload();
  }
}

function triggerReload() {
  playerState.isReloading = true;
  if (hud.ammoCurrent) hud.ammoCurrent.textContent = "…";
  setTimeout(() => {
    playerState.ammo = playerState.maxAmmo;
    playerState.isReloading = false;
  }, 1800);
}

function advanceWave() {
  gameState.waveIndex++;
  gameState.waveCleared = false;
  // Flush dead enemies so isWaveCleared() can't re-fire during the run animation
  if (spawner) spawner.enemies = [];

  const nextSlotIdx = gameState.waveIndex;
  const nextSlot =
    gameState.coverSlots[
      Math.min(nextSlotIdx, gameState.coverSlots.length - 1)
    ];

  if (nextSlot) {
    const prevSlot = gameState.currentSlot ?? nextSlot;
    gameState.currentSlot = nextSlot;
    playerState.isADS = false;

    // Animated run to next cover — enemies spawn AFTER player arrives
    animateCoverMove(playerRig, prevSlot, nextSlot, () => {
      spawner.spawnWave(gameState.waveIndex);
    });
  } else {
    spawner.spawnWave(gameState.waveIndex);
  }
}

function endGame() {
  gameState.running = false;
  showGameOver(hud, playerState.score, gameState.waveIndex, restartGame);
}

function restartGame() {
  window.location.reload();
}

/* ═══════════════════════════════════════════════════════════
   ADAPTIVE QUALITY
══════════════════════════════════════════════════════════════ */
function adaptQuality() {
  if (!frameTimes.length) return;
  // renderer.shadowMap.mapSize does not exist in Three.js —
  // shadow map size is per-light (light.shadow.mapSize), not global.
  // Frame timing is still tracked for future diagnostics.
  // const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;

  // const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  // if (avg > 22 && renderer.shadowMap.mapSize.x > 512) {
  //   renderer.shadowMap.mapSize.set(512, 512);
  //   renderer.shadowMap.needsUpdate = true;
  // } else if (avg < 14 && renderer.shadowMap.mapSize.x < 1024) {
  //   renderer.shadowMap.mapSize.set(1024, 1024);
  //   renderer.shadowMap.needsUpdate = true;
  // }
}

/* ═══════════════════════════════════════════════════════════
   RESIZE
══════════════════════════════════════════════════════════════ */
function onResize() {
  handleResize(renderer, playerRig.camera);
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
