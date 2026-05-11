// spawner.js — Wave Spawning and Enemy Management

import * as THREE from "three";
import { Enemy } from "./enemy.js";
import { getWaveConfig } from "./difficulty.js";
import { SeededRNG } from "./utils.js";

export class Spawner {
  constructor(scene, world, coverSlots, hud) {
    this.scene = scene;
    this.world = world;
    this.coverSlots = coverSlots;
    this.hud = hud;
    this.enemies = [];
    this.waveIndex = 0;
    this.rng = new SeededRNG(77);
  }

  async spawnWave(waveIndex) {
    this.waveIndex = waveIndex;
    // Clear dead from previous wave
    this.enemies = this.enemies.filter((e) => !e.isDead);

    const cfg = getWaveConfig(waveIndex);

    let flankerCount = cfg.flankers;
    let suppressorCount = cfg.suppressorEnabled ? 1 : 0;
    let regularCount = Math.max(1, cfg.count - flankerCount - suppressorCount);

    const totalCount = regularCount + flankerCount + suppressorCount;
    const positions = this._spawnPositions(totalCount, waveIndex);

    const spawnOne = async (idx, opts = {}) => {
      const enemy = new Enemy(
        this.scene,
        this.world,
        positions[idx],
        cfg,
        waveIndex,
        this.hud,
      );
      if (opts.flanker) enemy.isFlanker = true;
      if (opts.suppressor) enemy.isSuppressor = true;
      await enemy.init();
      this.enemies.push(enemy);
    };

    // Spawn with slight stagger
    for (let i = 0; i < regularCount; i++) {
      await spawnOne(i);
    }
    for (let i = 0; i < flankerCount; i++) {
      await spawnOne(regularCount + i, { flanker: true });
    }
    if (suppressorCount > 0) {
      await spawnOne(regularCount + flankerCount, { suppressor: true });
    }

    return this.enemies;
  }

  _spawnPositions(count, waveIndex) {
    // Spread enemies in front of the player's starting area on the road
    const positions = [];
    const baseZ = -(3 + waveIndex) * 18; // further per wave

    for (let i = 0; i < count; i++) {
      const spread = (i - Math.floor(count / 2)) * 2.5;
      positions.push(
        new THREE.Vector3(
          spread + (this.rng.next() - 0.5) * 1.5,
          1.2, // capsule is 2.3m tall, center at 1.15m. Spawn at 1.2 to prevent ground clipping
          baseZ + (this.rng.next() - 0.5) * 4,
        ),
      );
    }
    return positions;
  }

  update(dt) {
    for (const e of this.enemies) e.update(dt);
  }

  getAliveEnemies() {
    return this.enemies.filter((e) => !e.isDead);
  }

  isWaveCleared() {
    return this.enemies.length > 0 && this.getAliveEnemies().length === 0;
  }

  clear() {
    for (const e of this.enemies) if (!e.isDead) e.kill();
    this.enemies = [];
  }
}
