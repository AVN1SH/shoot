// pool.js — Object Pool System for muzzle flashes, decals, particles

import * as THREE from 'three';

class ObjectPool {
  constructor(factory, initialSize = 10) {
    this.factory   = factory;
    this.available = [];
    this.inUse     = new Set();
    for (let i = 0; i < initialSize; i++) this.available.push(factory());
  }

  get() {
    const obj = this.available.length ? this.available.pop() : this.factory();
    this.inUse.add(obj);
    return obj;
  }

  release(obj) {
    if (this.inUse.has(obj)) {
      this.inUse.delete(obj);
      this.available.push(obj);
    }
  }

  get stats() {
    return { available: this.available.length, inUse: this.inUse.size };
  }
}

const pools = new Map();

export function createPool(name, factory, size = 10) {
  if (!pools.has(name)) pools.set(name, new ObjectPool(factory, size));
  return pools.get(name);
}

export function getFromPool(name) {
  const pool = pools.get(name);
  if (!pool) { console.warn(`[Pool] "${name}" does not exist`); return null; }
  return pool.get();
}

export function releaseToPool(name, obj) {
  pools.get(name)?.release(obj);
}

/* ── Initialize all pools ────────────────────────────────── */
export function initPoolSystem(scene) {
  // Muzzle flash: bright sphere + point light
  createPool('muzzleFlash', () => {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffcc44 })
    );
    const light = new THREE.PointLight(0xffaa22, 3, 4);
    g.add(mesh, light);
    g.visible = false;
    scene.add(g);
    return g;
  }, 24);

  // Bullet decal: flat square on surfaces
  createPool('bulletDecal', () => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x111111, depthWrite: false })
    );
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  }, 60);

  // Blood/impact particle
  createPool('particle', () => {
    const g = new THREE.Group();
    const count = 6;
    const positions = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xff3300, size: 0.04 }));
    g.add(pts);
    g.visible = false;
    scene.add(g);
    return g;
  }, 20);
}
