// street.js — Procedural Street + GLB Environment Assembly
// Uses assets from assets/architectures/ to build buildings, garages, cover,
// and street decorations (subway-surfers-style side scenery).

import * as THREE from "three";
import { addBoxCollider } from "./physics.js";
import { SeededRNG } from "./utils.js";
import { cloneGLB } from "./loader.js";

const ROAD_WIDTH = 12;
const ROAD_LENGTH = 260;
const SLOT_SPACING = 18;
const NUM_SLOTS = 8;

// Cover "recipes" — each is a mixture of props forming a barricade.
// `car` is intentionally alone (per spec).
const COVER_RECIPES = [
  "car",
  "pallet_tire_mix",
  "barrier_wheel_mix",
  "spike_pallet_mix",
  "tire_stack",
  "barrier_pair",
  "pallet_cluster",
  "spike_barricade_mix",
];

/* ── Utilities ───────────────────────────────────────────── */
function mkMat(color, roughness = 0.8, metalness = 0.0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/**
 * Compute a fitted scale so a GLB's bounding box matches a target size
 * along its largest horizontal axis. Also returns the bounding box so
 * callers can ground the model (so y=0 sits on the road).
 */
function fitToSize(obj, targetWidth) {
  const bbox = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const maxXZ = Math.max(size.x, size.z) || 1;
  const s = targetWidth / maxXZ;
  obj.scale.multiplyScalar(s);
  // Recompute after scale
  const bbox2 = new THREE.Box3().setFromObject(obj);
  return { bbox: bbox2, size: bbox2.getSize(new THREE.Vector3()) };
}

/** Place a GLB at (x, z), auto-grounded and scaled to `targetWidth`. */
function placeGLB(scene, logicalPath, x, z, targetWidth, opts = {}) {
  const obj = cloneGLB(logicalPath);
  if (!obj) return null;
  obj.position.set(x, 0, z);
  if (opts.rotY !== undefined) obj.rotation.y = opts.rotY;

  if (targetWidth) fitToSize(obj, targetWidth);

  // Ground the model (min-y → 0 + opts.yOffset)
  const bbox = new THREE.Box3().setFromObject(obj);
  obj.position.y = -bbox.min.y + (opts.yOffset ?? 0);
  scene.add(obj);
  return obj;
}

/* ── Shared front-wall variation pool (hoisted) ────────────── */
const BUILDING_FRONT_POOL = [
  "env/wall_brick",
  "env/wall_window_1",
  "env/wall",
  "env/wall_window_2",
  "env/wall_door",
  "env/wall_hole",
  "env/wall_brick",
  "env/wall_metal_1",
  "env/wall_concrete_metal",
];
const BUILDING_BACK_POOL = [
  "env/wall_brick",
  "env/wall",
  "env/wall_metal_2",
  "env/wall_concrete_metal",
];
const BUILDING_SIDE_POOL = [
  "env/wall_brick",
  "env/wall_metal_1",
  "env/wooden_wall",
  "env/wall_concrete_metal",
];

/* ── Cover builder (mixtures of GLB props) ───────────────── */
/**
 * Builds a cover group at origin (0,0,0); caller positions it.
 * Returns { group, approxHeight, halfExtents } used for collider sizing.
 */
function buildCover(recipe, rng) {
  const group = new THREE.Group();
  let height = 1.2;
  let halfX = 1.5;
  let halfZ = 0.7;

  const add = (logicalPath, { x = 0, z = 0, targetWidth = null, rotY = 0, yOffset = 0 } = {}) => {
    const obj = cloneGLB(logicalPath);
    if (!obj) return null;
    obj.rotation.y = rotY;
    if (targetWidth) fitToSize(obj, targetWidth);
    // Ground on its own bbox
    const bb = new THREE.Box3().setFromObject(obj);
    obj.position.set(x, -bb.min.y + yOffset, z);
    group.add(obj);
    return obj;
  };

  switch (recipe) {
    case "car": {
      // Car is alone — no mix
      const c = add("env/car", { targetWidth: 4.2, rotY: Math.PI / 2 });
      if (c) {
        const bb = new THREE.Box3().setFromObject(c);
        height = bb.max.y - bb.min.y;
      } else height = 1.5;
      halfX = 2.2;
      halfZ = 1.0;
      break;
    }

    case "pallet_tire_mix": {
      add("env/pallet_cluster", { x: -0.7, z: 0, targetWidth: 1.6 });
      add("env/tire", { x: 0.9, z: 0.1, targetWidth: 0.9 });
      add("env/tire", { x: 1.2, z: -0.3, targetWidth: 0.9, yOffset: 0.55 });
      height = 1.2;
      halfX = 1.6;
      halfZ = 0.7;
      break;
    }

    case "barrier_wheel_mix": {
      add("env/road_barrier", { x: -0.2, z: 0, targetWidth: 2.4 });
      add("env/wheel", { x: 1.3, z: 0.2, targetWidth: 0.9 });
      add("env/wheel", { x: -1.4, z: -0.1, targetWidth: 0.9 });
      height = 1.1;
      halfX = 1.7;
      halfZ = 0.7;
      break;
    }

    case "spike_pallet_mix": {
      add("env/wooden_spike_barricade", { x: 0, z: 0, targetWidth: 2.2 });
      add("env/pallet_cluster", { x: 1.4, z: -0.1, targetWidth: 1.3 });
      height = 1.3;
      halfX = 1.8;
      halfZ = 0.75;
      break;
    }

    case "tire_stack": {
      add("env/tire", { x: -0.6, z: 0, targetWidth: 0.9 });
      add("env/tire", { x: -0.6, z: 0, targetWidth: 0.9, yOffset: 0.55 });
      add("env/tire", { x: 0.3, z: 0.2, targetWidth: 0.9 });
      add("env/wheel", { x: 1.1, z: -0.2, targetWidth: 0.9 });
      add("env/barrel", { x: -1.5, z: 0.2, targetWidth: 0.9 });
      height = 1.2;
      halfX = 1.6;
      halfZ = 0.7;
      break;
    }

    case "barrier_pair": {
      add("env/road_barrier", { x: -1.1, z: 0, targetWidth: 2.2 });
      add("env/road_barrier", { x: 1.1, z: 0.05, targetWidth: 2.2 });
      add("env/tire", { x: 0, z: -0.4, targetWidth: 0.9 });
      height = 1.1;
      halfX = 2.2;
      halfZ = 0.7;
      break;
    }

    case "pallet_cluster": {
      add("env/pallet_cluster", { x: 0, z: 0, targetWidth: 2.2 });
      add("env/box", { x: -1.3, z: 0.1, targetWidth: 0.8 });
      add("env/wheel", { x: 1.3, z: -0.2, targetWidth: 0.9 });
      height = 1.25;
      halfX = 1.7;
      halfZ = 0.75;
      break;
    }

    case "spike_barricade_mix": {
      add("env/wooden_spike_barricade", { x: -0.7, z: 0, targetWidth: 1.8 });
      add("env/wooden_spike_barricade", { x: 1.0, z: 0.1, targetWidth: 1.6, rotY: 0.15 });
      add("env/barrel", { x: -1.6, z: -0.2, targetWidth: 0.9 });
      height = 1.3;
      halfX = 1.8;
      halfZ = 0.75;
      break;
    }
  }

  group.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  return { group, height, halfX, halfZ };
}

/* ── Building / Garage construction from wall GLBs ────────── */
/**
 * Given an assembled wall group with a list of unit cells in a row, attach
 * them side-by-side along +x starting from origin. Each wall unit is scaled
 * to unit width `unitW` and unit height `unitH`.
 * `walls`: array of logical wall paths, in order.
 */
function buildWallRow(group, walls, unitW, unitH, opts = {}) {
  const rotY = opts.rotY ?? 0;
  const startX = opts.startX ?? 0;
  const z = opts.z ?? 0;

  walls.forEach((path, i) => {
    const w = cloneGLB(path);
    if (!w) return;
    // Fit so width along X matches unitW AND height matches unitH
    const bb0 = new THREE.Box3().setFromObject(w);
    const sz0 = bb0.getSize(new THREE.Vector3());
    const sx = unitW / (sz0.x || 1);
    const sy = unitH / (sz0.y || 1);
    // Use uniform XZ scale from width and separate Y scale
    w.scale.set(sx, sy, sx);
    const bb1 = new THREE.Box3().setFromObject(w);
    w.position.set(startX + i * unitW, -bb1.min.y, z);
    w.rotation.y = rotY;
    group.add(w);
  });
}

/**
 * Build a simple building with a front wall (mix of windows/doors) facing
 * the street (facing -z toward the road). Position is the building's
 * front-left corner on the ground; side is 'left' or 'right'.
 */
function buildBuilding(scene, { x, z, width, depth = 6, height = 4, rng, side = "left" }) {
  const group = new THREE.Group();
  const unitW = 2.0;
  const cols = Math.max(2, Math.round(width / unitW));

  // Front wall (facing road)
  const frontWalls = [];
  for (let i = 0; i < cols; i++) {
    frontWalls.push(BUILDING_FRONT_POOL[Math.floor(rng.next() * BUILDING_FRONT_POOL.length)]);
  }
  buildWallRow(group, frontWalls, unitW, height, { startX: 0, z: 0, rotY: 0 });

  // Back wall (solid mix)
  const backWalls = [];
  for (let i = 0; i < cols; i++) {
    backWalls.push(BUILDING_BACK_POOL[Math.floor(rng.next() * BUILDING_BACK_POOL.length)]);
  }
  buildWallRow(group, backWalls, unitW, height, { startX: 0, z: depth, rotY: 0 });

  // Side walls (we rotate wall pieces 90°)
  const sideCols = Math.max(1, Math.round(depth / unitW));

  // Left side at x=0
  const leftPieces = [];
  for (let i = 0; i < sideCols; i++) leftPieces.push(BUILDING_SIDE_POOL[Math.floor(rng.next() * BUILDING_SIDE_POOL.length)]);
  leftPieces.forEach((path, i) => {
    const w = cloneGLB(path);
    if (!w) return;
    const bb0 = new THREE.Box3().setFromObject(w);
    const sz0 = bb0.getSize(new THREE.Vector3());
    const sx = unitW / (sz0.x || 1);
    const sy = height / (sz0.y || 1);
    w.scale.set(sx, sy, sx);
    w.rotation.y = Math.PI / 2;
    const bb1 = new THREE.Box3().setFromObject(w);
    w.position.set(0, -bb1.min.y, i * unitW);
    group.add(w);
  });

  // Right side at x=cols*unitW
  const rightPieces = [];
  for (let i = 0; i < sideCols; i++) rightPieces.push(BUILDING_SIDE_POOL[Math.floor(rng.next() * BUILDING_SIDE_POOL.length)]);
  rightPieces.forEach((path, i) => {
    const w = cloneGLB(path);
    if (!w) return;
    const bb0 = new THREE.Box3().setFromObject(w);
    const sz0 = bb0.getSize(new THREE.Vector3());
    const sx = unitW / (sz0.x || 1);
    const sy = height / (sz0.y || 1);
    w.scale.set(sx, sy, sx);
    w.rotation.y = Math.PI / 2;
    const bb1 = new THREE.Box3().setFromObject(w);
    w.position.set(cols * unitW, -bb1.min.y, i * unitW);
    group.add(w);
  });

  // Simple roof slab
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(cols * unitW + 0.2, 0.2, depth + 0.2),
    mkMat(0x2a2a2a, 0.9)
  );
  roof.position.set((cols * unitW) / 2, height + 0.1, depth / 2);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  // Wall column decorations at front corners
  [0, cols * unitW].forEach((cx) => {
    const c = cloneGLB("env/wall_column");
    if (!c) return;
    const bb0 = new THREE.Box3().setFromObject(c);
    const sz0 = bb0.getSize(new THREE.Vector3());
    const sy = height / (sz0.y || 1);
    c.scale.multiplyScalar(sy);
    const bb1 = new THREE.Box3().setFromObject(c);
    c.position.set(cx, -bb1.min.y, 0);
    group.add(c);
  });

  // Position the whole building.
  // Local layout: front wall along local +x at z=0; depth extends to local +z.
  // Three.js Y-rotation: (1,0,0)→(cosθ,0,-sinθ), (0,0,1)→(sinθ,0,cosθ).
  // Goal: front wall faces the road; depth extends AWAY from road.
  //   Left  (group.x = -xOffset, road at +x): need local +z → world -x ⇒ θ = -π/2.
  //   Right (group.x = +xOffset, road at -x): need local +z → world +x ⇒ θ = +π/2.
  group.position.set(x, 0, z);
  group.rotation.y = side === "left" ? -Math.PI / 2 : Math.PI / 2;

  group.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  scene.add(group);
  return { group, width: cols * unitW, depth, height };
}

/**
 * Build a garage — same as a building but front wall is all metal/boarded with no windows,
 * giving the feeling of a garage shutter facade.
 */
function buildGarage(scene, { x, z, width, depth = 5, height = 3.2, rng, side = "left" }) {
  const group = new THREE.Group();
  const unitW = 2.0;
  const cols = Math.max(2, Math.round(width / unitW));

  // Garage front: metal walls + maybe 1 hole as "entry"
  const frontPool = ["env/wall_metal_1", "env/wall_metal_2", "env/wall_concrete_metal", "env/wall_door"];
  const frontWalls = [];
  for (let i = 0; i < cols; i++) {
    frontWalls.push(frontPool[Math.floor(rng.next() * frontPool.length)]);
  }
  // Force one "hole" / door near the middle
  frontWalls[Math.floor(cols / 2)] = "env/wall_hole";
  buildWallRow(group, frontWalls, unitW, height, { startX: 0, z: 0 });

  // Back
  const backWalls = new Array(cols).fill("env/wall_brick");
  buildWallRow(group, backWalls, unitW, height, { startX: 0, z: depth });

  // Sides
  const sideCols = Math.max(1, Math.round(depth / unitW));
  [0, cols * unitW].forEach((sx) => {
    for (let i = 0; i < sideCols; i++) {
      const w = cloneGLB("env/wall_metal_2");
      if (!w) continue;
      const bb0 = new THREE.Box3().setFromObject(w);
      const sz0 = bb0.getSize(new THREE.Vector3());
      const sxScale = unitW / (sz0.x || 1);
      const syScale = height / (sz0.y || 1);
      w.scale.set(sxScale, syScale, sxScale);
      w.rotation.y = Math.PI / 2;
      const bb1 = new THREE.Box3().setFromObject(w);
      w.position.set(sx, -bb1.min.y, i * unitW);
      group.add(w);
    }
  });

  // Slanted metal roof slab
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(cols * unitW + 0.2, 0.15, depth + 0.2),
    mkMat(0x4a3628, 0.9, 0.3)
  );
  roof.position.set((cols * unitW) / 2, height + 0.08, depth / 2);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  // Same rotation strategy as buildings — see comment in buildBuilding.
  group.position.set(x, 0, z);
  group.rotation.y = side === "left" ? -Math.PI / 2 : Math.PI / 2;

  group.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  scene.add(group);
  return { group, width: cols * unitW, depth, height };
}

/* ── Decorations scattered along street ───────────────────── */
function scatterDecorations(scene, world, rng) {
  const decorChoices = [
    { path: "env/bush", width: 1.2, weight: 3 },
    { path: "env/barrel", width: 0.9, weight: 2, collide: true },
    { path: "env/small_bottle", width: 0.25, weight: 1 },
    { path: "env/sharpened_stick", width: 0.6, weight: 1 },
    { path: "env/metal_board_1", width: 1.5, weight: 1 },
    { path: "env/metal_board_2", width: 1.5, weight: 1 },
    { path: "env/metal_board_3", width: 1.5, weight: 1 },
    { path: "env/box", width: 0.9, weight: 2, collide: true },
    { path: "env/tire", width: 0.9, weight: 2 },
  ];

  // Build weighted pool
  const pool = [];
  decorChoices.forEach((c) => {
    for (let i = 0; i < c.weight; i++) pool.push(c);
  });

  // Place decor on both sides of the road (outside sidewalks)
  for (let z = -ROAD_LENGTH / 2 + 6; z < ROAD_LENGTH / 2 - 6; z += 5) {
    for (const side of [-1, 1]) {
      if (rng.next() < 0.45) {
        const choice = pool[Math.floor(rng.next() * pool.length)];
        const jitterZ = (rng.next() - 0.5) * 3.5;
        const jitterX = (rng.next() - 0.5) * 1.2;
        const xBase = side * (ROAD_WIDTH / 2 + 3 + rng.next() * 1.0);
        const rotY = rng.next() * Math.PI * 2;
        const obj = placeGLB(scene, choice.path, xBase + jitterX, z + jitterZ, choice.width, { rotY });
        if (obj && choice.collide) {
          const bb = new THREE.Box3().setFromObject(obj);
          const sz = bb.getSize(new THREE.Vector3());
          addBoxCollider(
            world,
            { x: obj.position.x, y: sz.y / 2, z: obj.position.z },
            { x: sz.x / 2, y: sz.y / 2, z: sz.z / 2 },
            false
          );
        }
      }
    }
  }

  // Electric poles every ~18m on both sides
  for (let z = -ROAD_LENGTH / 2 + 10; z < ROAD_LENGTH / 2 - 10; z += 18) {
    for (const side of [-1, 1]) {
      const x = side * (ROAD_WIDTH / 2 + 2.6);
      placeGLB(scene, "env/electric_pole", x, z, 0.5);
    }
  }

  // Occasional medpack on the sidewalk — visual only (pickup wiring deferred)
  for (let z = -ROAD_LENGTH / 2 + 20; z < ROAD_LENGTH / 2 - 20; z += 26) {
    if (rng.next() < 0.5) {
      const side = rng.next() < 0.5 ? -1 : 1;
      const x = side * (ROAD_WIDTH / 2 + 1.5);
      placeGLB(scene, "env/medpack", x, z + (rng.next() - 0.5) * 4, 0.6, {
        rotY: rng.next() * Math.PI * 2,
      });
    }
  }
}

/* ── Buildings + garages placement ─────────────────────────── */
function buildSideStructures(scene, rng) {
  // Place alternating buildings & garages on both sides, behind sidewalk.
  // Wider gap + larger structures keeps draw-call count reasonable.
  const entries = [];
  let zCursor = -ROAD_LENGTH / 2 + 8;
  const gap = 4.0;

  while (zCursor < ROAD_LENGTH / 2 - 8) {
    for (const side of [-1, 1]) {
      const isGarage = rng.next() < 0.4;
      const width = 8 + Math.floor(rng.next() * 3) * 2; // 8,10,12
      const depth = 5 + Math.floor(rng.next() * 2) * 1.5;
      const height = isGarage ? 3.2 : 3.6 + rng.next() * 2.2;

      // x position: just behind sidewalk (sidewalk ends at ROAD_WIDTH/2 + 4)
      // After rotation, building's front wall sits at this x and depth grows away.
      const xOffset = ROAD_WIDTH / 2 + 4 + 0.2;
      const x = side < 0 ? -xOffset : xOffset;

      if (isGarage) {
        const g = buildGarage(scene, {
          x,
          z: zCursor,
          width,
          depth,
          height,
          rng,
          side: side < 0 ? "left" : "right",
        });
        entries.push({ kind: "garage", ...g, zStart: zCursor, side });
      } else {
        const b = buildBuilding(scene, {
          x,
          z: zCursor,
          width,
          depth,
          height,
          rng,
          side: side < 0 ? "left" : "right",
        });
        entries.push({ kind: "building", ...b, zStart: zCursor, side });
      }
    }
    zCursor += 12 + gap + rng.next() * 4;
  }

  return entries;
}

/* ── Main builder ────────────────────────────────────────── */
export async function buildStreet(scene, world, rng = new SeededRNG(42)) {
  /* Road surface */
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.95,
  });
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH),
    roadMat,
  );
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  scene.add(road);

  /* Center-line markings */
  const markGeo = new THREE.PlaneGeometry(0.12, 2.0);
  const markMat = new THREE.MeshBasicMaterial({ color: 0xeeee00 });
  const markCount = 18;
  const markMesh = new THREE.InstancedMesh(markGeo, markMat, markCount);
  markMesh.rotation.x = -Math.PI / 2;
  markMesh.position.y = 0.002;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < markCount; i++) {
    dummy.position.set(0, 0, -i * 12 + 6);
    dummy.updateMatrix();
    markMesh.setMatrixAt(i, dummy.matrix);
  }
  markMesh.instanceMatrix.needsUpdate = true;
  scene.add(markMesh);

  /* Sidewalks + curbs */
  const sidewalkMat = new THREE.MeshStandardMaterial({
    color: 0x8a8a88,
    roughness: 0.9,
  });
  [-1, 1].forEach((side) => {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(4, ROAD_LENGTH), sidewalkMat);
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(side * (ROAD_WIDTH / 2 + 2), 0.01, 0);
    sw.receiveShadow = true;
    scene.add(sw);
    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.12, ROAD_LENGTH),
      new THREE.MeshStandardMaterial({ color: 0xa0a0a0, roughness: 0.8 }),
    );
    curb.position.set((side * ROAD_WIDTH) / 2, 0.06, 0);
    curb.receiveShadow = true;
    scene.add(curb);
  });

  /* Ground skirts on either side outside sidewalks — gives "outside street" feel */
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x5a5046, roughness: 1.0 });
  [-1, 1].forEach((side) => {
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(30, ROAD_LENGTH), skirtMat);
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.set(side * (ROAD_WIDTH / 2 + 4 + 15), -0.01, 0);
    skirt.receiveShadow = true;
    scene.add(skirt);
  });

  /* Buildings + garages on both sides (subway-surfers style) */
  buildSideStructures(scene, rng);

  /* Scattered street decorations */
  scatterDecorations(scene, world, rng);

  /* Cover nodes — uses mixed recipes ('car' is alone) */
  const slots = [];

  for (let i = 0; i < NUM_SLOTS; i++) {
    const side = i % 2 === 0 ? "left" : "right";
    const xPos = side === "left" ? -ROAD_WIDTH / 2 + 1.8 : ROAD_WIDTH / 2 - 1.8;
    const zPos = -(i === 0 ? 8 : (i + 1) * SLOT_SPACING + 8);

    const recipe = COVER_RECIPES[Math.floor(rng.next() * COVER_RECIPES.length)];
    const { group: mesh, height, halfX, halfZ } = buildCover(recipe, rng);

    mesh.position.set(xPos, 0, zPos);
    // Face center of street
    mesh.rotation.y = side === "left" ? 0.1 : -0.1;
    scene.add(mesh);

    // Physics collider — sized to approximate cover bounds
    const colliderBody = addBoxCollider(
      world,
      { x: xPos, y: Math.max(0.4, height / 2), z: zPos },
      { x: halfX, y: Math.max(0.4, height / 2), z: halfZ },
      false,
    );

    const slot = {
      side,
      xPos,
      zPos,
      type: recipe,
      coverHeight: height,
      cleared: false,
      hp: 100,
      mesh,
      collider: colliderBody,
      peekLeft: new THREE.Vector3(xPos - 1.4, 1.7, zPos + 1.0),
      peekRight: new THREE.Vector3(xPos + 1.4, 1.7, zPos + 1.0),
      activePeek: side === "left" ? "right" : "left",
    };

    slots.push(slot);
  }

  return { slots, road };
}

/* ── Cover helpers ───────────────────────────────────────── */
export function getPeekPosition(node) {
  return node.activePeek === "right" ? node.peekRight : node.peekLeft;
}

export function switchPeek(node) {
  node.activePeek = node.activePeek === "right" ? "left" : "right";
}

export function snapPlayerToCover(playerRig, node) {
  const pos = getPeekPosition(node);
  playerRig.body.position.copy(pos);
  playerRig.body.position.y = 0;
  playerRig.camera.position.set(0, pos.y, 0);
}
