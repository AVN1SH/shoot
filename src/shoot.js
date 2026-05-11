// shoot.js — Player Bullet System: Three.js Raycasting, Hit Detection, FX

import * as THREE from "three";
import { playerState, consumeAmmo, applyRecoil } from "./player.js";
import { getFromPool, releaseToPool } from "./pool.js";

const _raycaster = new THREE.Raycaster();
_raycaster.near = 0.1;
_raycaster.far = 200;

/* ── Main fire function ──────────────────────────────────── */
export function firePlayerBullet(scene, camera, enemies, hud, addScoreFn) {
  // 1. Check ammo
  if (!consumeAmmo()) {
    hud?.showPopup?.("NO AMMO", "warn");
    return;
  }

  // 2. Apply recoil
  applyRecoil();

  // 3. Collect all enemy meshes (map mesh → enemy)
  const meshToEnemy = new Map();
  const allMeshes = [];

  for (const enemy of enemies) {
    if (enemy.isDead || !enemy.root) continue;
    enemy.root.traverse((obj) => {
      if (obj.isMesh) {
        meshToEnemy.set(obj, enemy);
        allMeshes.push(obj);
      }
    });
  }

  // 4. Raycast from camera center
  _raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = _raycaster.intersectObjects(allMeshes, false);

  // 5. Muzzle flash
  _spawnMuzzleFlash(scene, camera);

  if (hits.length === 0) {
    _spawnDecal(scene, camera); // bullet hole on environment
    return;
  }

  const hit = hits[0];
  const enemy = meshToEnemy.get(hit.object);
  if (!enemy) return;

  // 6. Calculate damage
  const hitPoint = hit.point;
  const headCenter = new THREE.Vector3();
  const bodyCenter = new THREE.Vector3();

  // Determine head vs body hit by Y position
  const rootY = enemy.root.position.y;
  const headY = rootY + 1.65; // approx head height for 1.8m character
  const distToHead = Math.abs(hitPoint.y - headY);
  const isHeadshot = distToHead < 0.25;

  const baseDmg = playerState.isADS ? 28 : 22;
  const dmg = isHeadshot ? baseDmg * 2.5 : baseDmg;

  // 7. Apply damage to enemy
  const killed = enemy.takeDamage(Math.round(dmg), isHeadshot);

  // 8. Hit marker + score
  hud?.showHitMarker?.(isHeadshot);

  const baseScore = isHeadshot ? 150 : 80;
  const gained = Math.round(baseScore * playerState.combo);
  playerState.score += gained;
  playerState.combo = Math.min(playerState.combo + 0.25, 8);
  playerState.comboTimer = 3.0;
  hud?.setScore?.(playerState.score);

  if (typeof addScoreFn === "function") addScoreFn(gained, isHeadshot);
  if (killed) hud?.showPopup?.(`+${gained}`, isHeadshot ? "headshot" : "kill");

  // 10. Alert nearby enemies — hearing the gunshot wakes them up
  _alertNearbyEnemies(enemies, camera, 30);

  // 9. Hit spark at impact point
  _spawnImpactSpark(scene, hitPoint);
}

/* ── Alert enemies within earshot radius ─────────────────── */
function _alertNearbyEnemies(enemies, camera, radius) {
  const shooterPos = new THREE.Vector3();
  camera.getWorldPosition(shooterPos);
  for (const enemy of enemies) {
    if (enemy.isDead || !enemy.root) continue;
    const dist = enemy.root.position.distanceTo(shooterPos);
    if (dist <= radius) {
      // Stagger alert time by distance so closer enemies react first
      const delay = (dist / radius) * 600; // 0–600 ms
      setTimeout(() => enemy.alert?.(), delay);
    }
  }
}

/* ── Muzzle flash ────────────────────────────────────────── */
const _flashMat = new THREE.MeshBasicMaterial({
  color: 0xffdd44,
  transparent: true,
  opacity: 0.85,
  depthTest: false,
  depthWrite: false,
});

function _spawnMuzzleFlash(scene, camera) {
  const geo = new THREE.SphereGeometry(0.06, 6, 6);
  const flash = new THREE.Mesh(geo, _flashMat.clone());
  // Place at gun muzzle (in front of camera, offset right-down)
  const muzzlePos = new THREE.Vector3(0.32, -0.26, -0.65);
  flash.position.copy(muzzlePos);
  flash.renderOrder = 2;
  camera.add(flash);

  const light = new THREE.PointLight(0xffcc55, 8, 3.5);
  light.position.copy(muzzlePos);
  camera.add(light);

  setTimeout(() => {
    camera.remove(flash);
    camera.remove(light);
    flash.geometry.dispose();
  }, 55);
}

/* ── Impact spark ────────────────────────────────────────── */
const _sparkMat = new THREE.MeshBasicMaterial({
  color: 0xff6622,
  depthTest: true,
});

function _spawnImpactSpark(scene, pos) {
  const geo = new THREE.SphereGeometry(0.04, 4, 4);
  const spark = new THREE.Mesh(geo, _sparkMat);
  spark.position.copy(pos);
  scene.add(spark);
  setTimeout(() => {
    scene.remove(spark);
    spark.geometry.dispose();
  }, 80);
}

/* ── Bullet decal (env) ──────────────────────────────────── */
const _decalMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

function _spawnDecal(scene, camera) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = new THREE.Vector3();
  camera.getWorldPosition(origin);

  // Environment raycast
  _raycaster.set(origin, dir);
  const envHits = _raycaster.intersectObjects(scene.children, true);
  if (!envHits.length) return;
  const h = envHits[0];
  const d = new THREE.Mesh(
    new THREE.PlaneGeometry(0.06, 0.06),
    _decalMat.clone(),
  );
  d.position.copy(h.point).addScaledVector(h.face.normal, 0.002);
  d.lookAt(h.point.clone().add(h.face.normal));
  scene.add(d);
  setTimeout(() => {
    scene.remove(d);
    d.geometry.dispose();
  }, 8000);
}
