// enemyGun.js — Enemy gun attachment + firing logic

import * as THREE from "three";
import { loadAsset } from "./loader.js";
import { playerState, addDamageToPlayer } from "./player.js";
import { getFromPool, releaseToPool } from "./pool.js";

export class EnemyGun {
  constructor(scene, skeleton, world, waveIndex) {
    this.scene = scene;
    this.skeleton = skeleton;
    this.world = world;
    this.waveIndex = waveIndex;

    this.mesh = null;
    this.muzzlePoint = null; // THREE.Object3D used as muzzle position
    this.fireTimer = 0;
    this.fireInterval = 4.0;
    this.guaranteedHit = false;
    this._hud = null; // set externally after init
  }

  async init() {
    // ── Try to load GLB gun ──
    try {
      const gltf = await loadAsset("assets/guns/enemy_rifle.glb");
      if (gltf) {
        this.mesh = gltf.scene.clone();

        // Find hand bone (Mixamo naming)
        const boneNames = [
          "mixamorig:RightHand",
          "RightHand",
          "Hand_R",
          "Armature_RightHand",
          "right_hand",
        ];
        let handBone = null;
        for (const n of boneNames) {
          handBone = this.skeleton.getBoneByName(n);
          if (handBone) break;
        }

        if (handBone) {
          this.mesh.position.set(0.0, 0.05, -0.08);
          this.mesh.rotation.set(0, Math.PI, 0);
          this.mesh.scale.setScalar(1.0);
          handBone.add(this.mesh);

          this.muzzlePoint =
            this.mesh.getObjectByName("Muzzle") ||
            this.mesh.getObjectByName("muzzle") ||
            this.mesh.getObjectByName("muzzle_flash_point");
        } else {
          // No bone found — attach to scene as fallback
          console.warn("[EnemyGun] Hand bone not found in skeleton.");
          this.scene.add(this.mesh);
        }
        return;
      }
    } catch (e) {
      console.warn("[EnemyGun] GLB load failed, using procedural gun.");
    }

    // ── Procedural fallback gun ──
    this._buildProceduralGun();
  }

  _buildProceduralGun() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.7,
      roughness: 0.4,
    });
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.018, 0.38, 8),
      mat,
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.22, 0, 0);
    const receiver = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.06, 0.04),
      mat,
    );
    g.add(barrel, receiver);

    // Muzzle marker
    this.muzzlePoint = new THREE.Object3D();
    this.muzzlePoint.position.set(0.42, 0, 0);
    g.add(this.muzzlePoint);

    // Attach to hand bone if possible
    const boneNames = [
      "mixamorig:RightHand",
      "RightHand",
      "Hand_R",
      "Armature_RightHand",
    ];
    let handBone = null;
    for (const n of boneNames) {
      handBone = this.skeleton?.getBoneByName(n);
      if (handBone) break;
    }

    g.scale.setScalar(0.8);
    if (handBone) {
      g.position.set(0, 0.05, -0.1);
      g.rotation.y = Math.PI;
      handBone.add(g);
    } else {
      this.scene.add(g);
    }
    this.mesh = g;
  }

  /* ── Per-frame ────────────────────────────────────────── */
  update(dt, isAiming, playerPos) {
    if (!isAiming) return;
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fire(playerPos);
      this.fireTimer = this.fireInterval + (Math.random() - 0.5) * 0.5;
    }
  }

  fire(playerPos) {
    this._spawnMuzzleFlash();
    this._shootRaycast(playerPos);
  }

  _spawnMuzzleFlash() {
    const flash = getFromPool("muzzleFlash");
    if (!flash) return;

    const pos = new THREE.Vector3();
    if (this.muzzlePoint) {
      this.muzzlePoint.getWorldPosition(pos);
    } else if (this.mesh) {
      this.mesh.getWorldPosition(pos);
    } else return;

    flash.position.copy(pos);
    flash.visible = true;
    setTimeout(() => {
      flash.visible = false;
      releaseToPool("muzzleFlash", flash);
    }, 65);
  }

  _shootRaycast(playerPos) {
    if (!playerPos) return;

    // Miss entirely if player is in cover
    if (!playerState.isExposed && !this.guaranteedHit) return;

    // Spread based on wave
    const spread = this.guaranteedHit ? 0 : 0.08 - 0.005 * this.waveIndex;
    const rnd = (Math.random() - 0.5) * spread;
    if (!this.guaranteedHit && Math.abs(rnd) > 0.04) return; // random miss

    const damage = this._damage ?? Math.round(6 + this.waveIndex * 1.2);
    const dead = addDamageToPlayer(damage, this._hud);

    if (this._hud) {
      this._hud.showHitVignette?.(this._hud);
    }

    this.guaranteedHit = false;
  }

  setFireInterval(interval) {
    this.fireInterval = interval;
  }
  setGuaranteedHit() {
    this.guaranteedHit = true;
  }

  dispose() {
    if (this.mesh?.parent) this.mesh.parent.remove(this.mesh);
    this.mesh = null;
  }
}
