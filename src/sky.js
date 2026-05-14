// sky.js — Static Sky Dome, Low-Poly Clouds, Sun Disc
// All objects placed once at init — zero per-frame cost.

import * as THREE from "three";
import { SeededRNG } from "./utils.js";

/* ── Constants ───────────────────────────────────────────── */
const SKY_RADIUS = 400;
const CLOUD_COUNT = 12; // fewer, but larger and better quality
const CLOUD_SPREAD = 320;
const CLOUD_MIN_Y = 65;
const CLOUD_MAX_Y = 140;

/* ── Create sky dome (inside-facing gradient sphere) ──────── */
function _buildSkyDome(scene) {
  const geo = new THREE.SphereGeometry(SKY_RADIUS, 28, 16);

  // Vertex-colour gradient: horizon = light blue → zenith = deep blue
  const colors = [];
  const posArr = geo.attributes.position;
  const horizonC = new THREE.Color(0x8ec5e6);
  const midC = new THREE.Color(0x5daadd);
  const zenithC = new THREE.Color(0x1e6fb5);

  for (let i = 0; i < posArr.count; i++) {
    const t = Math.max(0, posArr.getY(i) / SKY_RADIUS); // 0 = horizon, 1 = top
    const col = new THREE.Color();
    if (t < 0.25) col.lerpColors(horizonC, midC, t / 0.25);
    else col.lerpColors(midC, zenithC, (t - 0.25) / 0.75);
    colors.push(col.r, col.g, col.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const dome = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  dome.renderOrder = -100;
  dome.frustumCulled = false;
  dome.matrixAutoUpdate = false;
  dome.updateMatrix();
  scene.add(dome);
}

/* ── Build one cloud cluster (static, low-poly, solid) ────── */
function _buildCloudMesh(rng) {
  const group = new THREE.Group();

  // Solid, flat-shaded material for crisp low-poly lighting
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.8,
    metalness: 0.0,
    flatShading: true,
    fog: true, // Fade into the distance with scene fog
  });

  // Base structure of a cloud: center puff + surrounding puffs
  const puffs = [
    { x: 0, y: 0, z: 0, r: 14 }, // center main
    { x: -12, y: -2, z: 3, r: 10 }, // left
    { x: 14, y: -1, z: -4, r: 11 }, // right
    { x: -6, y: 4, z: -8, r: 9 }, // back left
    { x: 8, y: 5, z: 6, r: 8 }, // front right
    { x: 0, y: 6, z: -2, r: 10 }, // top
  ];

  const cloudScale = 1.2 + rng.next() * 1.8;

  for (let i = 0; i < puffs.length; i++) {
    // 20% chance to skip a peripheral puff for variety
    if (i !== 0 && rng.next() > 0.8) continue;

    const p = puffs[i];
    // Icosahedron detail 1 = nice chunky polygons
    const geo = new THREE.IcosahedronGeometry(p.r * cloudScale, 1);

    // Add some noise to vertices for organic irregularity
    const pos = geo.attributes.position;
    for (let j = 0; j < pos.count; j++) {
      pos.setX(j, pos.getX(j) + (rng.next() - 0.5) * 3 * cloudScale);
      pos.setY(j, pos.getY(j) + (rng.next() - 0.5) * 3 * cloudScale);
      pos.setZ(j, pos.getZ(j) + (rng.next() - 0.5) * 3 * cloudScale);
    }
    geo.computeVertexNormals();

    const puff = new THREE.Mesh(geo, mat);

    puff.position.set(
      p.x * cloudScale + (rng.next() - 0.5) * 4,
      p.y * cloudScale + (rng.next() - 0.5) * 2,
      p.z * cloudScale + (rng.next() - 0.5) * 4,
    );

    puff.rotation.set(
      rng.next() * Math.PI,
      rng.next() * Math.PI,
      rng.next() * Math.PI,
    );

    // Let clouds catch and cast shadows (looks great with the sun)
    puff.castShadow = true;
    puff.receiveShadow = true;

    // Freeze inner meshes
    puff.matrixAutoUpdate = false;
    puff.updateMatrix();

    group.add(puff);
  }

  // Flatten the bottom of the cloud slightly
  group.scale.y = 0.65;

  return group;
}

/* ── Sun disc + halo ─────────────────────────────────────── */
function _buildSun(scene) {
  const sunDir = new THREE.Vector3(0.55, 0.72, -1).normalize();

  // Sun disc
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(9, 24),
    new THREE.MeshBasicMaterial({
      color: 0xfffbe0,
      fog: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.92,
    }),
  );
  sun.position.copy(sunDir.clone().multiplyScalar(SKY_RADIUS * 0.88));
  sun.lookAt(0, 0, 0);
  sun.renderOrder = -80;
  sun.frustumCulled = false;
  sun.matrixAutoUpdate = false;
  sun.updateMatrix();
  scene.add(sun);

  // Halo
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(22, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffeeaa,
      fog: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.17,
    }),
  );
  halo.position.copy(sun.position);
  halo.rotation.copy(sun.rotation);
  halo.renderOrder = -81;
  halo.frustumCulled = false;
  halo.matrixAutoUpdate = false;
  halo.updateMatrix();
  scene.add(halo);
}

/* ── Warm horizon glow band ──────────────────────────────── */
function _buildHorizonGlow(scene) {
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(
      SKY_RADIUS - 1,
      SKY_RADIUS + 20,
      28,
      48,
      1,
      true,
    ),
    new THREE.MeshBasicMaterial({
      color: 0xf5dfa8,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      fog: false,
    }),
  );
  glow.position.y = -8;
  glow.renderOrder = -90;
  glow.frustumCulled = false;
  glow.matrixAutoUpdate = false;
  glow.updateMatrix();
  scene.add(glow);
}

/* ── Public: init ────────────────────────────────────────── */
export function initSky(scene) {
  const rng = new SeededRNG(44); // fresh seed for nicer layout

  _buildSkyDome(scene);
  _buildSun(scene);
  _buildHorizonGlow(scene);

  // Place all clouds once — frozen in world space, never touched again
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const mesh = _buildCloudMesh(rng);

    // Position them around the sky, slightly biased forward (-Z is forward)
    const x = (rng.next() - 0.5) * CLOUD_SPREAD * 2;
    const z = (rng.next() - 0.5) * CLOUD_SPREAD * 2 - 40;
    const y = CLOUD_MIN_Y + rng.next() * (CLOUD_MAX_Y - CLOUD_MIN_Y);

    mesh.position.set(x, y, z);
    mesh.rotation.y = rng.next() * Math.PI * 2;

    // Freeze — matrixAutoUpdate off means Three.js won't recompute
    // the matrix every frame → zero transform cost
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    scene.add(mesh);
  }

  console.log("[Sky] Initialized (static) — dome + sun + clouds:", CLOUD_COUNT);
}

/* ── Public: updateSky — intentional no-op ───────────────────
   Clouds are static. This export exists only so main.js import
   doesn't break. The game loop pays zero cost calling it.
─────────────────────────────────────────────────────────────── */
export function updateSky() {
  /* static sky — nothing to update */
}
