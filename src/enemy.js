// enemy.js — Enemy Class: FSM, Animation, Physics, Gun, Grenade

import * as THREE from "three";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";
import { loadAsset } from "./loader.js";
import { EnemyGun } from "./enemyGun.js";
import { playerState } from "./player.js";
import {
  addCapsuleCollider,
  addHeadCollider,
  addBallCollider,
  getRapier,
} from "./physics.js";

/* Procedural enemy body colours */
const BODY_COLORS = [0x2c3e50, 0x922b21, 0x1a5276, 0x145a32, 0x4a235a];
const CLOTH_COLORS = [0x212f3c, 0x641e16, 0x154360, 0x0e3d1f, 0x2e1553];

export class Enemy {
  constructor(scene, world, spawnPos, waveConfig, waveIndex, hud) {
    this.scene = scene;
    this.world = world;
    this.spawnPos = spawnPos.clone();
    this.waveConfig = waveConfig;
    this.waveIndex = waveIndex;
    this.hud = hud;

    this.hp = waveConfig.hp;
    this.isDead = false;
    this.alerted = false;
    this.state = "PATROL_IDLE";
    this.stateTimer = 0;
    this.distToPlayer = Infinity;
    this.isFlanker = false;
    this.isSuppressor = false;

    this.root = null;
    this.skeleton = null;
    this.mixer = null;
    this.clips = {};
    this.currentAction = null;

    this.bodyRB = null;
    this.headRB = null;
    this.gun = null;

    this.peekSide = Math.random() > 0.5 ? "left" : "right";
    this.grenadeEnabled = waveConfig.grenadeEnabled;
    this.grenadeTimer = waveConfig.grenadeTimer;
    this._colorIdx = Math.floor(Math.random() * BODY_COLORS.length);
    this._pendingDeathClip = null;

    // Personality
    const styles = ["aggressive", "cautious", "scanner", "walker"];
    this._style = styles[Math.floor(Math.random() * styles.length)];
    this._timeScale = 0.65 + Math.random() * 0.8;
    this._phaseOffset = Math.random() * 4.0;
    this._firstPatrol = true;

    // Which direction to walk during PATROL_WALK (+1 = right, -1 = left)
    this._patrolDir = Math.random() > 0.5 ? 1 : -1;
    // Road half-width in world units — enemies won't cross this boundary
    this._roadHalfW = 5.0;
  }

  /* ── Init ──────────────────────────────────────────────── */
  async init() {
    // Loads assets/sprites/person1.glb via ASSET_MAP in loader.js
    const gltf = await loadAsset("assets/enemies/enemy_character.glb");
    if (gltf) {
      this.root = skeletonClone(gltf.scene);
      this.root.traverse((obj) => {
        obj.castShadow = true;
        if (obj.isSkinnedMesh) this.skeleton = obj.skeleton;
      });
      this.mixer = new THREE.AnimationMixer(this.root);
      gltf.animations.forEach((clip) => {
        // ── Strip root motion ONLY from walking/turning ───────────────
        // We only want to strip root motion from walk/turn loops so they don't slide.
        // For death and crouch animations, we MUST KEEP the root position,
        // otherwise their hips stay floating in the air instead of dropping to the floor.
        const isWalkOrTurn = /walk|turn/i.test(clip.name);

        if (isWalkOrTurn) {
          clip.tracks = clip.tracks.filter((track) => {
            // track.name format: "BoneName.property"
            const isPosition = track.name.endsWith(".position");
            const isRootBone = /hips|root|pelvis/i.test(track.name);
            return !(isPosition && isRootBone); // drop root position
          });
        }
        this.clips[clip.name] = clip;
      });
    } else {
      // Procedural humanoid
      this.root = this._buildProceduralHumanoid();
    }

    this.root.position.copy(this.spawnPos);
    this.scene.add(this.root);

    // Physics
    this.bodyRB = addCapsuleCollider(this.world, this.spawnPos, 0.8, 0.35);
    this.bodyRB.userData = { tag: "body", owner: this };

    const headPos = {
      x: this.spawnPos.x,
      y: this.spawnPos.y + 1.7,
      z: this.spawnPos.z,
    };
    this.headRB = addHeadCollider(this.world, headPos);
    this.headRB.userData = { tag: "head", owner: this };

    // Gun
    if (this.skeleton) {
      this.gun = new EnemyGun(
        this.scene,
        this.skeleton,
        this.world,
        this.waveIndex,
      );
      this.gun._hud = this.hud;
      this.gun._damage = this.waveConfig.damage; // wave-scaled damage
      await this.gun.init();
      this.gun.setFireInterval(this.waveConfig.fireInterval);
    }

    this.transition("PATROL_IDLE");
  }

  /* ── Public: alert this enemy to combat ────────────────── */
  alert() {
    if (this.isDead || this.alerted) return;
    this.alerted = true;
    this.transition("ALERT");
  }

  /* ── Procedural humanoid (fallback when no GLB) ────────── */
  _buildProceduralHumanoid() {
    const g = new THREE.Group();
    const c = BODY_COLORS[this._colorIdx];
    const cl = CLOTH_COLORS[this._colorIdx];
    const skin = new THREE.MeshStandardMaterial({
      color: 0xd4a476,
      roughness: 0.8,
    });
    const body = new THREE.MeshStandardMaterial({ color: cl, roughness: 0.85 });
    const pant = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });

    const mk = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };

    // torso
    mk(new THREE.BoxGeometry(0.44, 0.52, 0.24), body, 0, 1.18, 0);
    // head
    mk(new THREE.BoxGeometry(0.28, 0.28, 0.26), skin, 0, 1.66, 0);
    // legs
    mk(new THREE.BoxGeometry(0.18, 0.54, 0.2), pant, -0.12, 0.63, 0);
    mk(new THREE.BoxGeometry(0.18, 0.54, 0.2), pant, 0.12, 0.63, 0);
    // feet
    mk(
      new THREE.BoxGeometry(0.18, 0.12, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x111111 }),
      -0.12,
      0.36,
      0.05,
    );
    mk(
      new THREE.BoxGeometry(0.18, 0.12, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x111111 }),
      0.12,
      0.36,
      0.05,
    );
    // arms
    mk(new THREE.BoxGeometry(0.14, 0.46, 0.16), body, -0.32, 1.06, 0);
    mk(new THREE.BoxGeometry(0.14, 0.46, 0.16), body, 0.32, 1.06, 0);
    // hands
    mk(new THREE.BoxGeometry(0.12, 0.14, 0.12), skin, -0.32, 0.8, 0);
    mk(new THREE.BoxGeometry(0.12, 0.14, 0.12), skin, 0.32, 0.8, 0);

    // Attach a small gun to right side
    const gunBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.06, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 }),
    );
    gunBar.position.set(0.36, 0.82, -0.18);
    gunBar.castShadow = true;
    g.add(gunBar);

    return g;
  }

  /* ── Per-frame ─────────────────────────────────────────── */
  update(dt) {
    // Even when dead, keep ticking the mixer so clampWhenFinished
    // holds the last frame — without this the skeleton snaps to T-pose.
    if (this.isDead) {
      if (this.mixer) this.mixer.update(dt);
      return;
    }

    // Sync mesh to physics body
    if (this.bodyRB) {
      const p = this.bodyRB.translation();
      // Capsule center is p.y. Half-height (0.8) + radius (0.35) = 1.15 total bottom offset
      this.root.position.set(p.x, p.y - 1.15, p.z);

      // Keep head collider above body
      this.headRB?.setTranslation({ x: p.x, y: p.y + 0.9, z: p.z }, true);
    }

    this.distToPlayer = this.root.position.distanceTo(
      playerState.cameraWorldPos,
    );

    if (this.mixer) this.mixer.update(dt);
    this.stateTimer -= dt;

    this.tickFSM(dt);

    // Gun is active only during alerted combat states
    const aiming =
      this.alerted &&
      [
        "AIM",
        "AIM_DOWN",
        "FIRE",
        "CROUCH_FIRE",
        "STRAFE",
        "TURN_LEFT",
        "TURN_RIGHT",
        "CROUCH",
        "CROUCH_RISE",
        "SUPPRESS",
      ].includes(this.state);
    this.gun?.update(dt, aiming, playerState.cameraWorldPos);

    if (this.grenadeEnabled) {
      this.grenadeTimer -= dt;
      if (this.grenadeTimer <= 0) this.throwGrenade();
    }
  }

  /* ── FSM ────────────────────────────────────────────── */
  tickFSM(dt) {
    const cfg = this.waveConfig;
    const style = this._style ?? "cautious";

    switch (this.state) {
      /* ─────────────────────────────────────────────────────────────── */
      /*  PATROL — guard routine, enemies NOT yet alerted                  */
      /* ─────────────────────────────────────────────────────────────── */
      case "PATROL_IDLE":
        if (this.stateTimer <= 0) {
          const r = Math.random();
          // walker: mostly walks; scanner: mostly turns; aggressive: shorter idle
          const walkChance =
            style === "walker" ? 0.55 : style === "aggressive" ? 0.25 : 0.4;
          const scanChance = style === "scanner" ? 0.85 : 0.75;
          if (r < walkChance) this.transition("PATROL_TURN_L");
          else if (r < scanChance) this.transition("PATROL_TURN_R");
          else this.transition("PATROL_IDLE"); // stay put
        }
        break;

      case "PATROL_TURN_L":
        // Turn left anim plays once, then walk
        if (this.stateTimer <= 0) this.transition("PATROL_WALK");
        break;

      case "PATROL_TURN_R":
        // Turn right anim plays once, then walk
        if (this.stateTimer <= 0) this.transition("PATROL_WALK");
        break;

      case "PATROL_WALK": {
        // Actually move the enemy along the road (X axis), clamped to road bounds
        const WALK_SPEED = 0.8; // units per second — slow patrol pace
        if (this.bodyRB) {
          const p = this.bodyRB.translation();
          const nx = p.x + this._patrolDir * WALK_SPEED * dt;
          // Clamp to road edges — flip direction if we'd overshoot
          if (Math.abs(nx) >= this._roadHalfW) {
            this._patrolDir *= -1; // bounce at boundary
            this.transition("PATROL_WALK_STOP"); // stop and re-orient
            break;
          }
          this.bodyRB.setTranslation({ x: nx, y: p.y, z: p.z }, true);
        }
        if (this.stateTimer <= 0) this.transition("PATROL_WALK_STOP");
        break;
      }

      case "PATROL_WALK_STOP":
        if (this.stateTimer <= 0) {
          const r = Math.random();
          if (this._style === "walker" && r < 0.4)
            this.transition("PATROL_TURN_L");
          else if (this._style === "scanner" && r < 0.5)
            this.transition("PATROL_TURN_R");
          else this.transition("PATROL_IDLE");
        }
        break;

      /* ─────────────────────────────────────────────────────────────── */
      /*  COMBAT — alerted states                                          */
      /* ─────────────────────────────────────────────────────────────── */
      case "ALERT":
        this._facePlayer();
        if (this.stateTimer <= 0) this.transition("AIM");
        break;

      case "AIM":
        this._facePlayer();
        if (this.stateTimer <= 0) {
          const roll = Math.random();
          if (cfg.movingFireEnabled && this.isFlanker && roll < 0.25)
            this.transition("STRAFE");
          else if (cfg.crouchFireEnabled && style === "cautious" && roll < 0.3)
            this.transition("CROUCH_FIRE");
          else if (cfg.crouchFireEnabled && roll < 0.12)
            this.transition("CROUCH_FIRE");
          else if (!cfg.crouchFireEnabled && style === "cautious" && roll < 0.2)
            this.transition("CROUCH");
          else if (style === "scanner" && roll < 0.12)
            this.transition(roll < 0.06 ? "TURN_LEFT" : "TURN_RIGHT");
          else if (roll < 0.04)
            this.transition(roll < 0.02 ? "TURN_LEFT" : "TURN_RIGHT");
          else if (style !== "aggressive" && roll < 0.28)
            this.transition("AIM_DOWN"); // lower gun briefly before re-aiming
          else this.transition("FIRE");
        }
        break;

      case "FIRE":
        this._facePlayer();
        // After fire: go to idle-aiming (ALERT) briefly then re-aim — smooth loop
        if (this.stateTimer <= 0)
          this.transition(Math.random() < 0.3 ? "AIM_DOWN" : "ALERT");
        break;

      case "CROUCH_FIRE":
        this._facePlayer();
        if (this.stateTimer <= 0) this.transition("CROUCH_RISE");
        break;

      case "AIM_DOWN":
        if (this.stateTimer <= 0) this.transition("ALERT");
        break;

      case "STRAFE":
        this._facePlayer();
        if (this.stateTimer <= 0) this.transition("AIM");
        break;

      // TURN_LEFT/RIGHT: enemy scans, then snaps back to idle-aiming, then re-aims
      case "TURN_LEFT":
      case "TURN_RIGHT":
        if (this.stateTimer <= 0) this.transition("TURN_BACK");
        break;

      case "TURN_BACK":
        if (this.stateTimer <= 0) this.transition("ALERT"); // back to idle-aiming, not AIM
        break;

      case "CROUCH":
        if (this.stateTimer <= 0) this.transition("CROUCH_RISE");
        break;

      case "CROUCH_RISE":
        if (this.stateTimer <= 0) this.transition("ALERT");
        break;
    }
  }

  /* ── Helper: face the player on Y axis only ───────────────── */
  _facePlayer() {
    this.root?.lookAt(
      playerState.cameraWorldPos.x,
      this.root.position.y,
      playerState.cameraWorldPos.z,
    );
  }

  transition(newState) {
    this.state = newState;

    // ── Clip map — every state gets an animation
    const clipMap = {
      // Patrol: guard routine
      PATROL_IDLE: Math.random() > 0.5 ? "idle" : "idle-2",
      PATROL_TURN_L: "rifle-turn-left",
      PATROL_TURN_R: "rifle-turn-right",
      PATROL_WALK: "rifle-walk-loop",
      PATROL_WALK_STOP: "rifle-walk-stop",
      // Combat
      ALERT: Math.random() > 0.5 ? "idle-aiming" : "idle-aiming-2",
      AIM: "rifle-down-to-aim",
      AIM_DOWN: "rifle-aim-to-down",
      FIRE: "fire-once",
      CROUCH_FIRE: "crouch-fire",
      STRAFE:
        this.peekSide === "left" ? "rifle-up-walk-left" : "rifle-up-walk-right",
      TURN_LEFT: "rifle-turn-left",
      TURN_RIGHT: "rifle-turn-right",
      TURN_BACK: "rifle-turn-back",
      CROUCH: "rifle-stand-to-crouch",
      CROUCH_RISE: "crouch-to-stand",
      DEAD: this._pendingDeathClip ?? "bodyshot-death",
    };

    // Per-enemy timeScale (0.65–1.45) desynchronises the whole squad
    const ts = this._timeScale ?? 1.0;
    const idleBase =
      this._style === "walker"
        ? 1.2
        : this._style === "scanner"
          ? 2.2
          : this._style === "aggressive"
            ? 0.9
            : 1.6;
    // First PATROL_IDLE gets extra phase offset so squad spawns staggered
    const firstBonus =
      newState === "PATROL_IDLE" && this._firstPatrol
        ? (this._phaseOffset ?? 0)
        : 0;
    if (newState === "PATROL_IDLE") this._firstPatrol = false;

    const timers = {
      // Patrol — turns are slower, walk duration varies
      PATROL_IDLE: (idleBase + Math.random() * 1.5 + firstBonus) * ts,
      PATROL_TURN_L: (1.0 + Math.random() * 0.6) * ts,
      PATROL_TURN_R: (1.0 + Math.random() * 0.6) * ts,
      PATROL_WALK: (1.8 + Math.random() * 1.4) * ts,
      PATROL_WALK_STOP: (0.5 + Math.random() * 0.3) * ts,
      // Combat
      ALERT: (0.55 + Math.random() * 0.35) * ts,
      AIM: (0.45 + Math.random() * 0.5) * ts,
      AIM_DOWN: (0.45 + Math.random() * 0.25) * ts,
      FIRE: (0.35 + Math.random() * 0.25) * ts,
      CROUCH_FIRE: (0.9 + Math.random() * 0.6) * ts,
      STRAFE: (1.0 + Math.random() * 0.6) * ts,
      TURN_LEFT: (0.8 + Math.random() * 0.5) * ts,
      TURN_RIGHT: (0.8 + Math.random() * 0.5) * ts,
      TURN_BACK: (0.55 + Math.random() * 0.3) * ts,
      CROUCH: (0.9 + Math.random() * 0.5) * ts,
      CROUCH_RISE: (0.6 + Math.random() * 0.3) * ts,
    };

    // ── Resolve clip: exact name first, then case-insensitive fallback ────
    const resolveClip = (name) => {
      if (!name) return null;
      if (this.clips[name]) return this.clips[name];
      // Case-insensitive search
      const lower = name.toLowerCase();
      const found = Object.keys(this.clips).find(
        (k) => k.toLowerCase() === lower,
      );
      if (found) return this.clips[found];
      // Contains-match fallback (e.g. "death" matches "Death_01")
      const partial = Object.keys(this.clips).find((k) =>
        k.toLowerCase().includes(lower),
      );
      return partial ? this.clips[partial] : null;
    };

    const clipName = clipMap[newState];
    const clip = resolveClip(clipName);

    if (this.mixer && clip) {
      const action = this.mixer.clipAction(clip);

      if (newState === "DEAD") {
        // Hard-stop all, play once, freeze on last frame
        this.mixer.stopAllAction();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.enabled = true;
        action.reset();
        action.play();
        console.log("[Enemy] Playing death clip:", clip.name);
      } else {
        // Smooth crossfade from previous
        const fadeTime = 0.18;
        if (this.currentAction && this.currentAction !== action) {
          this.currentAction.crossFadeTo(action, fadeTime, true);
        }
        action.reset();
        // Slow down turn animations so they don't look snappy
        if (newState === "PATROL_TURN_L" || newState === "PATROL_TURN_R") {
          action.setEffectiveTimeScale(0.5); // half speed turn
          // Lock walk direction to match the turn
          this._patrolDir = newState === "PATROL_TURN_L" ? -1 : 1;
        } else if (newState === "TURN_LEFT" || newState === "TURN_RIGHT") {
          action.setEffectiveTimeScale(0.55); // slightly slower combat scan too
        } else {
          action.setEffectiveTimeScale(1.0); // all other animations normal speed
        }
        action.play();
      }
      this.currentAction = action;
    } else if (this.mixer) {
      // ── No matching clip — pick best fallback to avoid T-pose ──
      if (newState === "DEAD") {
        const deathKey = Object.keys(this.clips).find(
          (k) =>
            k.toLowerCase().includes("death") ||
            k.toLowerCase().includes("die") ||
            k.toLowerCase().includes("dead"),
        );
        if (deathKey) {
          const fallback = this.mixer.clipAction(this.clips[deathKey]);
          this.mixer.stopAllAction();
          fallback.setLoop(THREE.LoopOnce, 1);
          fallback.clampWhenFinished = true;
          fallback.enabled = true;
          fallback.reset().play();
          this.currentAction = fallback;
          console.warn("[Enemy] Death fallback:", deathKey);
        } else {
          console.warn(
            "[Enemy] No death clip found in:",
            Object.keys(this.clips),
          );
        }
      } else {
        // For any non-death state with no matching clip,
        // stay on the current action rather than snapping to T-pose
        console.warn(
          `[Enemy] No clip for state "${newState}" (wanted "${clipName}"). Staying on current.`,
        );
        // Don't clear currentAction — keep playing whatever is running
      }
    } else if (this.root && !this.skeleton) {
      // Procedural fallback
      const s = newState === "FIRE" ? 1.05 : 1.0;
      this.root.scale.setScalar(s);
    }

    this.stateTimer = timers[newState] ?? 1.0;
  }

  /* ── Damage / Death ────────────────────────────────────── */
  kill(method = "bodyshot", hitDir = null) {
    if (this.isDead) return;
    this.isDead = true;

    // Headshot → random from 2 variants; bodyshot → random from 2 variants
    const HEADSHOT_CLIPS = ["death-from-back-headshot", "death-from-right"];
    const BODYSHOT_CLIPS = ["bodyshot-death", "death-from-right"];
    const pool = method === "headshot" ? HEADSHOT_CLIPS : BODYSHOT_CLIPS;
    this._pendingDeathClip = pool[Math.floor(Math.random() * pool.length)];

    this.transition("DEAD");

    this.gun?.dispose();
    this.gun = null;

    // Remove physics
    if (this.bodyRB) {
      try {
        this.world.removeRigidBody(this.bodyRB);
      } catch {}
      this.bodyRB = null;
    }
    if (this.headRB) {
      try {
        this.world.removeRigidBody(this.headRB);
      } catch {}
      this.headRB = null;
    }

    // Let the death animation handle the fall — no forced tilt
    // Fade out after 4 s (enough for the full death clip to play)
    setTimeout(() => {
      if (this.root?.parent) this.scene.remove(this.root);
    }, 4000);
  }

  takeDamage(amount, isHeadshot = false) {
    if (this.isDead) return false;

    // Headshot one-shot: waves 0-2 headshots instantly kill
    if (isHeadshot && this.waveConfig.headshotOneShot) {
      this.kill("headshot");
      return true;
    }

    this.hp -= amount;

    // Flash red tint on hit
    this.root?.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        obj.material.emissive?.setHex(0xff2200);
        setTimeout(() => {
          obj.material.emissive?.setHex(0x000000);
        }, 120);
      }
    });

    if (this.hp <= 0) {
      this.kill(isHeadshot ? "headshot" : "bodyshot");
      return true;
    }

    // Stagger on hit
    if (this.mixer) {
      this.mixer.timeScale = 0.25;
      setTimeout(() => {
        if (this.mixer) this.mixer.timeScale = 1.0;
      }, 280);
    }
    // Flinch — interrupt any active combat state
    const activeCombatStates = [
      "FIRE",
      "CROUCH_FIRE",
      "AIM",
      "AIM_DOWN",
      "STRAFE",
      "TURN_LEFT",
      "TURN_RIGHT",
    ];
    if (activeCombatStates.includes(this.state)) {
      this.transition("ALERT");
    }
    return false;
  }

  scheduleReturnFire(delay) {
    setTimeout(() => {
      if (!this.isDead && this.gun) this.gun.fire(playerState.cameraWorldPos);
    }, delay * 1000);
  }

  /* ── Strafe: move along Z (down street) to stay on road ── */
  _doStrafe() {
    if (!this.bodyRB) return;
    const dir = this.peekSide === "left" ? -1 : 1;
    const speed = 2.0 * (this.waveConfig.strafeSpeed ?? 1);
    // Z-axis = along the street — keeps enemy within lane, not sliding off sideways
    this.bodyRB.setLinvel({ x: 0, y: 0, z: dir * speed }, true);
  }

  /* ── Grenade ───────────────────────────────────────────── */
  async throwGrenade() {
    this.grenadeEnabled = false;

    const gltf = await loadAsset("assets/guns/grenade.glb");
    const grenadePos = this.root.position.clone();
    grenadePos.y += 1.5;

    let grenadeMesh = null;
    if (gltf) {
      grenadeMesh = gltf.scene.clone();
    } else {
      grenadeMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.6 }),
      );
    }

    grenadeMesh.position.copy(grenadePos);
    this.scene.add(grenadeMesh);

    const body = addBallCollider(this.world, grenadePos, 0.1, 0.4);
    const vel = playerState.cameraWorldPos
      .clone()
      .sub(grenadePos)
      .normalize()
      .multiplyScalar(12);
    vel.y = 7;
    body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);

    // Sync mesh to physics each frame via quick update loop
    const syncId = setInterval(() => {
      if (!body) {
        clearInterval(syncId);
        return;
      }
      try {
        const t = body.translation();
        grenadeMesh.position.set(t.x, t.y, t.z);
        grenadeMesh.rotation.x += 0.1;
      } catch {
        clearInterval(syncId);
      }
    }, 16);

    setTimeout(() => {
      clearInterval(syncId);
      this._explode(grenadePos);
      try {
        this.world.removeRigidBody(body);
      } catch {}
      if (grenadeMesh.parent) this.scene.remove(grenadeMesh);
    }, 3000);
  }

  _explode(pos) {
    const RADIUS = 3.5;
    const DAMAGE = 40;

    if (pos.distanceTo(playerState.cameraWorldPos) < RADIUS) {
      const dead = playerState.hp - DAMAGE <= 0;
      playerState.hp = Math.max(0, playerState.hp - DAMAGE);
      this.hud?.showHitVignette?.(this.hud);
    }

    // Explosion flash
    const flash = new THREE.PointLight(0xff6600, 8, 8);
    flash.position.copy(pos);
    this.scene.add(flash);

    const ballGeo = new THREE.SphereGeometry(RADIUS * 0.6, 10, 10);
    const ballMat = new THREE.MeshBasicMaterial({
      color: 0xff5500,
      transparent: true,
      opacity: 0.4,
    });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    ball.position.copy(pos);
    this.scene.add(ball);

    setTimeout(() => {
      this.scene.remove(flash, ball);
      ballGeo.dispose();
      ballMat.dispose();
    }, 120);
  }
}
