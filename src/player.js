// player.js — FPS Rig, State, ADS, Recoil, Cover Peek

import * as THREE from "three";
import { loadAsset } from "./loader.js";
import gsap from "gsap";

/* ── Shared player state (singleton) ────────────────────── */
export const playerState = {
  hp: 99999,
  maxHp: 100,
  ammo: 30,
  maxAmmo: 30,
  score: 0,
  combo: 1,
  comboTimer: 0,
  isADS: false,
  isExposed: false,
  isMoving: false,
  isReloading: false,
  adsTimer: 0,
  coverNode: null,
  // Updated each frame
  cameraWorldPos: new THREE.Vector3(),
  cameraWorldDir: new THREE.Vector3(),
  // Recoil
  recoilPitch: 0,
  recoilDecay: 0.88,
  // Cover peek state
  behindCover: false,
  isAnimatingMove: false,
  coverPeekHeight: 1.65, // camera Y when ADS-peeking over cover
  coverCrouchHeight: 1.25, // camera Y at rest — high enough to see enemies without ADS
};

/* ── Constants ───────────────────────────────────────────── */
const NORMAL_FOV = 75;
const ADS_FOV = 45;

/* ── Create the FPS rig ──────────────────────────────────── */
export async function createPlayerRig(scene) {
  // Body (pivot at feet level)
  const body = new THREE.Object3D();
  body.position.set(0, 0, 5); // start behind first cover
  scene.add(body);

  // Camera — single camera for the whole scene
  const camera = new THREE.PerspectiveCamera(
    NORMAL_FOV,
    window.innerWidth / window.innerHeight,
    0.05,
    200,
  );
  camera.rotation.order = "YXZ";
  camera.position.set(0, 1.7, 0); // eyes at ~1.7m
  body.add(camera);

  // ── Gun viewmodel ──────────────────────────────────────
  let gun = null;
  let gunMixer = null;

  try {
    const gltf = await loadAsset("assets/guns/player_rifle.glb");
    if (gltf) {
      gun = gltf.scene.clone();
      _applyGunTransform(gun);
      gun.traverse((m) => {
        if (m.isMesh) {
          m.renderOrder = 1;
          m.material = m.material.clone();
          // m.material.depthTest = false;
        }
      });
      camera.add(gun);
      gunMixer = new THREE.AnimationMixer(gun);
    }
  } catch (e) {
    console.warn("[Player] Gun GLB failed:", e.message);
  }

  if (!gun) {
    gun = _buildProceduralGun();
    camera.add(gun);
  }

  return { body, camera, gun, gunMixer };
}

/* ── Natural right-hand FPS gun transform ────────────────── */
function _applyGunTransform(gun, isADS = false) {
  if (isADS) {
    // Centered, iron-sights position
    gun.position.set(0, -0.1, -0.1);
    gun.rotation.set(0, Math.PI - 1.57, 0);
  } else {
    // Hip / lowered: to the right, barrel forward, tilted naturally
    gun.position.set(0.15, -0.1, -0.2);
    // x=barrel up, y=flip 180 + very slight cant, z=natural inward roll
    gun.rotation.set(0, Math.PI - 1.3, 0);
  }
}

/* ── Procedural gun fallback ─────────────────────────────── */
function _buildProceduralGun() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    metalness: 0.8,
    roughness: 0.3,
  });

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.022, 0.42, 8),
    mat.clone(),
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -0.2);

  const receiver = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.07, 0.28),
    mat.clone(),
  );

  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.038, 0.055, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x5c3d2e, roughness: 0.8 }),
  );
  stock.position.set(0, -0.01, 0.2);

  [barrel, receiver, stock].forEach((m) => {
    m.traverse((x) => {
      if (x.isMesh) {
        x.renderOrder = 1;
        x.material.depthTest = false;
      }
    });
    g.add(m);
  });

  // Hip position
  g.position.set(0.28, -0.34, -0.5);
  g.rotation.set(-0.06, Math.PI + 0.03, 0.08);
  return g;
}

/* ── Per-frame update ────────────────────────────────────── */
export function updatePlayerState(playerRig, dt) {
  const { camera, gunMixer } = playerRig;

  camera.getWorldPosition(playerState.cameraWorldPos);
  camera.getWorldDirection(playerState.cameraWorldDir);

  // Combo decay
  if (playerState.comboTimer > 0) {
    playerState.comboTimer -= dt;
    if (playerState.comboTimer <= 0) playerState.combo = 1;
  }

  // Recoil recovery
  if (Math.abs(playerState.recoilPitch) > 0.0005) {
    playerState.recoilPitch *= playerState.recoilDecay;
    camera.rotation.x = Math.max(
      -0.4,
      Math.min(0.4, camera.rotation.x + playerState.recoilPitch),
    );
  } else {
    playerState.recoilPitch = 0;
  }

  if (gunMixer) gunMixer.update(dt);
}

/* ── Cover snap ──────────────────────────────────────────── */
export function snapToCover(playerRig, coverNode) {
  playerState.coverNode = coverNode;
  playerState.behindCover = true;

  // Position body behind the cover (slightly back from the cover mesh)
  playerRig.body.position.set(
    coverNode.xPos,
    0,
    coverNode.zPos + 1.8, // stand 1.8m behind cover front face
  );

  // Camera at crouch height (hiding)
  playerRig.camera.position.y = playerState.coverCrouchHeight;
  playerRig.body.rotation.y = 0; // face forward (toward enemies)
}

/* ── GSAP Animated Movement ──────────────────────────────── */

/** Run the player in from the side at game start. */
export function animateSpawnIn(playerRig, firstCover, onComplete) {
  playerState.isAnimatingMove = true;
  playerState.behindCover = false;

  // Start off to the right, camera up, facing diagonally
  playerRig.body.position.set(firstCover.xPos + 6, 0, firstCover.zPos + 1.8);
  playerRig.body.rotation.y = -Math.PI / 5;
  playerRig.camera.position.y = playerState.coverPeekHeight;

  const tl = gsap.timeline();

  // Run into cover position
  tl.to(
    playerRig.body.position,
    {
      x: firstCover.xPos,
      z: firstCover.zPos + 1.8,
      duration: 1.0,
      ease: "power2.out",
    },
    0,
  );

  // Straighten up body rotation
  tl.to(
    playerRig.body.rotation,
    {
      y: 0,
      duration: 1.0,
      ease: "power2.out",
    },
    0,
  );

  // Quick head bob during run (3 bobs over 0.9s)
  tl.to(
    playerRig.camera.position,
    {
      y: playerState.coverPeekHeight + 0.08,
      duration: 0.15,
      ease: "sine.inOut",
      yoyo: true,
      repeat: 5,
    },
    0,
  );

  // Duck down into cover once arrived
  tl.to(playerRig.camera.position, {
    y: playerState.coverCrouchHeight,
    duration: 0.35,
    ease: "power2.out",
    onComplete: () => {
      playerState.coverNode = firstCover;
      playerState.behindCover = true;
      playerState.isAnimatingMove = false;
      if (onComplete) onComplete();
    },
  });
}

/** Animate player running from one cover to the next. */
export function animateCoverMove(
  playerRig,
  currentCover,
  nextCover,
  onComplete,
) {
  // Kill any previous tweens to avoid conflicts
  gsap.killTweensOf(playerRig.body.position);
  gsap.killTweensOf(playerRig.camera.position);
  if (playerRig.gun) gsap.killTweensOf(playerRig.gun.rotation);

  playerState.isAnimatingMove = true;
  playerState.behindCover = false;

  const toX = nextCover.xPos;
  const toZ = nextCover.zPos + 1.8;
  const fromX = playerRig.body.position.x;
  const fromZ = playerRig.body.position.z;

  const dist = Math.sqrt((toX - fromX) ** 2 + (toZ - fromZ) ** 2);
  const runDuration = Math.max(0.9, dist / 14); // ~14 units/sec

  // 1. Stand camera to run height
  gsap.to(playerRig.camera.position, {
    y: playerState.coverPeekHeight * 0.85,
    duration: 0.25,
    ease: "power1.out",
  });

  // 2. Infinite head bob — killed when body arrives
  const bobTween = gsap.to(playerRig.camera.position, {
    y: "+=0.09",
    yoyo: true,
    repeat: -1, // infinite — we kill it in onComplete
    duration: 0.18,
    ease: "sine.inOut",
    delay: 0.25, // start after stand-up
  });

  // 3. Weapon sway — also infinite, killed when body arrives
  let gunTween = null;
  if (playerRig.gun) {
    gunTween = gsap.to(playerRig.gun.rotation, {
      z: "+=0.12",
      yoyo: true,
      repeat: -1,
      duration: 0.18,
      ease: "sine.inOut",
      delay: 0.25,
    });
  }

  // 4. Move body — when done, kill bobs and duck into cover
  gsap.to(playerRig.body.position, {
    x: toX,
    z: toZ,
    duration: runDuration,
    ease: "power1.inOut",
    delay: 0.2,
    onComplete: () => {
      bobTween.kill();
      if (gunTween) gunTween.kill();

      // 5. Duck into new cover
      gsap.to(playerRig.camera.position, {
        y: playerState.coverCrouchHeight,
        duration: 0.35,
        ease: "power2.out",
        onComplete: () => {
          playerState.coverNode = nextCover;
          playerState.behindCover = true;
          playerState.isAnimatingMove = false;
          if (onComplete) onComplete();
        },
      });
    },
  });
}

/* ── ADS enter / exit (with cover peek) ─────────────────── */
let _adsTweenId = null;

export function enterADS(playerRig, hud) {
  if (playerState.isADS) return;
  playerState.isADS = true;
  playerState.isExposed = true;

  // Smoothly raise camera if behind cover
  if (playerState.behindCover) {
    _tweenCameraY(
      playerRig.camera,
      playerState.coverCrouchHeight,
      playerState.coverPeekHeight,
      0.15,
    );
  }

  _tweenFOV(playerRig.camera, playerRig.camera.fov, ADS_FOV, 0.14);

  // Move gun to iron sights
  if (playerRig.gun) _applyGunTransform(playerRig.gun, true);
}

export function exitADS(playerRig, hud) {
  if (!playerState.isADS) return;
  playerState.isADS = false;
  playerState.isExposed = false;
  playerState.adsTimer = 0;

  // Lower camera back behind cover
  if (playerState.behindCover) {
    _tweenCameraY(
      playerRig.camera,
      playerState.coverPeekHeight,
      playerState.coverCrouchHeight,
      0.15,
    );
  }

  _tweenFOV(playerRig.camera, playerRig.camera.fov, NORMAL_FOV, 0.14);

  // Return gun to hip
  if (playerRig.gun) _applyGunTransform(playerRig.gun, false);
}

/* ── Tween helpers ───────────────────────────────────────── */
function _tweenFOV(camera, from, to, duration) {
  if (_adsTweenId) cancelAnimationFrame(_adsTweenId);
  let start = null;
  const step = (ts) => {
    if (!start) start = ts;
    const t = Math.min((ts - start) / (duration * 1000), 1);
    camera.fov = from + (to - from) * _ease(t);
    camera.updateProjectionMatrix();
    if (t < 1) _adsTweenId = requestAnimationFrame(step);
  };
  _adsTweenId = requestAnimationFrame(step);
}

function _tweenCameraY(camera, from, to, duration) {
  let start = null;
  const step = (ts) => {
    if (!start) start = ts;
    const t = Math.min((ts - start) / (duration * 1000), 1);
    camera.position.y = from + (to - from) * _ease(t);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function _ease(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/* ── Recoil ──────────────────────────────────────────────── */
export function applyRecoil() {
  playerState.recoilPitch -= 0.028;
}

/* ── Damage / heal / ammo ────────────────────────────────── */
export function addDamageToPlayer(amount, hud) {
  playerState.hp = Math.max(0, playerState.hp - amount);
  if (amount > 0) {
    playerState.combo = 1;
    playerState.comboTimer = 0;
    hud?.showHitVignette?.();
  }
  return playerState.hp <= 0;
}

export function healPlayer(amount) {
  playerState.hp = Math.min(playerState.maxHp, playerState.hp + amount);
}

export function addAmmo(amount) {
  playerState.ammo = Math.min(playerState.maxAmmo, playerState.ammo + amount);
}

export function consumeAmmo() {
  if (playerState.ammo <= 0) return false;
  playerState.ammo--;
  return true;
}
