// street.js — Procedural Street + GLB Environment Assembly
// Uses assets from assets/architectures/ to build buildings, garages, cover,
// trees, and street decorations (subway-surfers-style side scenery).
//
// Optimization techniques:
//  • THREE.LOD wrapping: far objects swap to a simple bounding-box proxy,
//    very-far objects hide entirely. Greatly reduces draw calls + shading cost.
//  • Static objects have matrixAutoUpdate disabled after positioning.
//  • Distant decor has shadow casting disabled; only close props cast shadows.
//  • Cover/block heights are capped so ADS peek (1.65m) can shoot over them.

import * as THREE from "three";
import { addBoxCollider } from "./physics.js";
import { SeededRNG } from "./utils.js";
import { cloneGLB } from "./loader.js";

export const envState = {
  roads: [],
  markMesh: null,
  buildings: [],
  trees: [],
  decors: [],
  slots: [],
  frontZCursorBuilding: -130,
  frontZCursorTree: -130,
  frontZCursorDecor: -130,
  frontZCursorSlot: -134,
};

const ROAD_WIDTH = 12;
const ROAD_LENGTH = 260;
const SLOT_SPACING = 18;
const NUM_SLOTS = 8;

// Max cover block height — keeps cover below player's ADS peek camera (1.65m)
// so the player can shoot OVER the cover while ADS. Hiding camera is at 1.25m
// (crouch), so cover must be > 1.25m to hide the player but < 1.60m to shoot over.
const COVER_MAX_HEIGHT = 1.42;
const CAR_MAX_HEIGHT = 1.55; // cars are slightly taller but still shootable over

// LOD distances (meters)
const LOD_MID = 45; // switch to proxy box
const LOD_HIDE = 160; // buildings
const DECOR_LOD_MID = 25;
const DECOR_LOD_HIDE = 70; // decor hides early
const TREE_LOD_MID = 40;
const TREE_LOD_HIDE = 130;

// Cover "recipes" — each is a mixture of props forming a barricade.
// `car` is intentionally alone (per spec). All other recipes mix at least
// two of: pallet_cluster, road_barrier, tire, wheel, wooden_spike_barricade,
// barrel, and box_1.
const COVER_RECIPES = [
  "car",
  "pallet_tire_mix",
  "barrier_wheel_mix",
  "spike_pallet_mix",
  "tire_stack",
  "barrier_pair",
  "pallet_cluster",
  "spike_barricade_mix",
  "box_barrier_mix",
  "box_tire_mix",
  "box_pallet_mix",
];

/* ── Utilities ──────────────────────────────────── */
function mkMat(color, roughness = 0.8, metalness = 0.0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/**
 * Compute a fitted scale so a GLB's bounding box matches a target size
 * along its largest horizontal axis.
 */
function fitToSize(obj, targetWidth) {
  const bbox = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const maxXZ = Math.max(size.x, size.z) || 1;
  const s = targetWidth / maxXZ;
  obj.scale.multiplyScalar(s);
}

/** Scale so object's bounding box height matches target (proportional). */
function fitToHeight(obj, targetHeight) {
  const bbox = new THREE.Box3().setFromObject(obj);
  const size = bbox.getSize(new THREE.Vector3());
  const s = targetHeight / (size.y || 1);
  obj.scale.multiplyScalar(s);
}

/** If object's height exceeds maxHeight, scale it down proportionally. */
function capHeight(obj, maxHeight) {
  const bbox = new THREE.Box3().setFromObject(obj);
  const h = bbox.max.y - bbox.min.y;
  if (h > maxHeight && h > 0.001) {
    obj.scale.multiplyScalar(maxHeight / h);
  }
}

/**
 * Freeze transforms on static objects — Three.js skips recomputing their
 * world matrix each frame.
 */
function freezeStatic(obj) {
  obj.updateMatrix();
  obj.updateMatrixWorld(true);
  obj.traverse((n) => {
    n.matrixAutoUpdate = false;
    n.updateMatrix();
  });
}

/**
 * Wrap an object in a THREE.LOD with a proxy box at mid distance and
 * nothing at far distance (culled). Transfers the object's transform to
 * the LOD so it displays at the same world location.
 */
function wrapWithLOD(
  obj,
  { midDist = LOD_MID, hideDist = LOD_HIDE, proxyColor = 0x6a6668 } = {},
) {
  const lod = new THREE.LOD();
  // Transfer world transform to LOD
  lod.position.copy(obj.position);
  lod.quaternion.copy(obj.quaternion);
  lod.scale.copy(obj.scale);
  // Reset obj to identity so its bbox is in local/LOD space
  obj.position.set(0, 0, 0);
  obj.quaternion.identity();
  obj.scale.set(1, 1, 1);

  // Compute local bbox for proxy sizing
  const bbox = new THREE.Box3().setFromObject(obj);
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());

  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(
      Math.max(size.x, 0.1),
      Math.max(size.y, 0.1),
      Math.max(size.z, 0.1),
    ),
    new THREE.MeshStandardMaterial({
      color: proxyColor,
      roughness: 0.95,
      flatShading: true,
    }),
  );
  proxy.position.copy(center);
  proxy.castShadow = false;
  proxy.receiveShadow = true;

  lod.addLevel(obj, 0);
  lod.addLevel(proxy, midDist);
  lod.addLevel(new THREE.Group(), hideDist);

  return lod;
}

/**
 * Place a GLB at (x, z), auto-grounded and scaled to `targetWidth`.
 * If `lod` option is provided, wraps the result in an LOD.
 */
function placeGLB(scene, logicalPath, x, z, targetWidth, opts = {}) {
  const obj = cloneGLB(logicalPath);
  if (!obj) return null;
  obj.position.set(x, 0, z);
  if (opts.rotY !== undefined) obj.rotation.y = opts.rotY;

  if (targetWidth) fitToSize(obj, targetWidth);
  if (opts.targetHeight) fitToHeight(obj, opts.targetHeight);
  if (opts.maxHeight) capHeight(obj, opts.maxHeight);

  // Ground the model (min-y → 0 + opts.yOffset)
  const bbox = new THREE.Box3().setFromObject(obj);
  obj.position.y = -bbox.min.y + (opts.yOffset ?? 0);

  // Optionally disable shadow casting on small/distant decor
  if (opts.noCastShadow) {
    obj.traverse((m) => {
      if (m.isMesh) m.castShadow = false;
    });
  }

  let finalNode = obj;
  if (opts.lod) {
    finalNode = wrapWithLOD(obj, opts.lod);
  }

  if (opts.freezeStatic !== false) freezeStatic(finalNode);

  scene.add(finalNode);
  return finalNode;
}

/* ── Shared wall pools (hoisted) ───────────────────── */
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

/* ── Cover builder (mixtures of GLB props) ───────────── */
/**
 * Builds a cover group at origin (0,0,0); caller positions it.
 * Each prop is height-capped to COVER_MAX_HEIGHT (or CAR_MAX_HEIGHT for cars)
 * so the player's ADS peek (1.65m) can shoot over the top.
 */
function buildCover(recipe, rng) {
  const group = new THREE.Group();
  let height = 1.2;
  let halfX = 1.5;
  let halfZ = 0.7;

  const add = (
    logicalPath,
    {
      x = 0,
      z = 0,
      targetWidth = null,
      rotY = 0,
      yOffset = 0,
      maxH = COVER_MAX_HEIGHT,
    } = {},
  ) => {
    const obj = cloneGLB(logicalPath);
    if (!obj) return null;
    obj.rotation.y = rotY;
    if (targetWidth) fitToSize(obj, targetWidth);
    capHeight(obj, maxH);
    // Ground on its own bbox
    const bb = new THREE.Box3().setFromObject(obj);
    obj.position.set(x, -bb.min.y + yOffset, z);
    group.add(obj);
    return obj;
  };

  switch (recipe) {
    case "car": {
      // Car is alone — no mix
      const c = add("env/car", {
        targetWidth: 4.2,
        rotY: Math.PI / 2,
        maxH: CAR_MAX_HEIGHT,
      });
      height = c ? CAR_MAX_HEIGHT : 1.5;
      halfX = 2.2;
      halfZ = 1.0;
      break;
    }

    case "pallet_tire_mix": {
      add("env/pallet_cluster", { x: -0.7, z: 0, targetWidth: 1.6 });
      add("env/tire", { x: 0.9, z: 0.1, targetWidth: 0.9 });
      add("env/tire", { x: 1.2, z: -0.3, targetWidth: 0.9, yOffset: 0.55 });
      add("env/box", { x: -1.5, z: -0.1, targetWidth: 0.7 });
      height = 1.25;
      halfX = 1.7;
      halfZ = 0.7;
      break;
    }

    case "barrier_wheel_mix": {
      add("env/road_barrier", { x: -0.2, z: 0, targetWidth: 2.4 });
      add("env/wheel", { x: 1.3, z: 0.2, targetWidth: 0.9 });
      add("env/wheel", { x: -1.4, z: -0.1, targetWidth: 0.9 });
      add("env/box", { x: 0.6, z: -0.35, targetWidth: 0.7 });
      height = 1.2;
      halfX = 1.7;
      halfZ = 0.75;
      break;
    }

    case "spike_pallet_mix": {
      add("env/wooden_spike_barricade", { x: 0, z: 0, targetWidth: 2.0 });
      add("env/pallet_cluster", { x: 1.4, z: -0.1, targetWidth: 1.3 });
      add("env/box", { x: -1.3, z: 0.1, targetWidth: 0.75 });
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
      add("env/box", { x: -1.5, z: 0.15, targetWidth: 0.8 });
      height = 1.2;
      halfX = 1.7;
      halfZ = 0.7;
      break;
    }

    case "barrier_pair": {
      add("env/road_barrier", { x: -1.1, z: 0, targetWidth: 2.2 });
      add("env/road_barrier", { x: 1.1, z: 0.05, targetWidth: 2.2 });
      add("env/tire", { x: 0, z: -0.4, targetWidth: 0.9 });
      add("env/box", { x: 0, z: 0.3, targetWidth: 0.75 });
      height = 1.15;
      halfX = 2.2;
      halfZ = 0.75;
      break;
    }

    case "pallet_cluster": {
      add("env/pallet_cluster", { x: 0, z: 0, targetWidth: 2.2 });
      add("env/box", { x: -1.3, z: 0.1, targetWidth: 0.8 });
      add("env/box", { x: -1.3, z: 0.1, targetWidth: 0.8, yOffset: 0.75 });
      add("env/wheel", { x: 1.3, z: -0.2, targetWidth: 0.9 });
      height = 1.3;
      halfX = 1.7;
      halfZ = 0.75;
      break;
    }

    case "spike_barricade_mix": {
      add("env/wooden_spike_barricade", { x: -0.7, z: 0, targetWidth: 1.8 });
      add("env/wooden_spike_barricade", {
        x: 1.0,
        z: 0.1,
        targetWidth: 1.6,
        rotY: 0.15,
      });
      add("env/barrel", { x: -1.6, z: -0.2, targetWidth: 0.9 });
      add("env/box", { x: 0.2, z: 0.35, targetWidth: 0.75 });
      height = 1.3;
      halfX = 1.85;
      halfZ = 0.8;
      break;
    }

    case "box_barrier_mix": {
      // Box-forward recipe: stacked boxes + a barrier for variety
      add("env/box", { x: -0.8, z: 0, targetWidth: 0.9 });
      add("env/box", { x: -0.8, z: 0, targetWidth: 0.9, yOffset: 0.85 });
      add("env/box", { x: 0.2, z: 0.05, targetWidth: 0.9 });
      add("env/road_barrier", { x: 1.3, z: 0, targetWidth: 1.8 });
      height = 1.3;
      halfX = 1.8;
      halfZ = 0.7;
      break;
    }

    case "box_tire_mix": {
      add("env/box", { x: -0.7, z: 0, targetWidth: 0.85 });
      add("env/box", { x: -0.7, z: 0, targetWidth: 0.85, yOffset: 0.8 });
      add("env/tire", { x: 0.5, z: -0.15, targetWidth: 0.9 });
      add("env/tire", { x: 0.5, z: -0.15, targetWidth: 0.9, yOffset: 0.55 });
      add("env/wheel", { x: 1.4, z: 0.1, targetWidth: 0.9 });
      height = 1.3;
      halfX = 1.7;
      halfZ = 0.7;
      break;
    }

    case "box_pallet_mix": {
      add("env/box", { x: -1.0, z: 0, targetWidth: 0.9 });
      add("env/box", { x: -1.0, z: 0, targetWidth: 0.9, yOffset: 0.85 });
      add("env/pallet_cluster", { x: 0.5, z: 0, targetWidth: 1.6 });
      add("env/wheel", { x: 1.7, z: 0.1, targetWidth: 0.85 });
      height = 1.3;
      halfX = 1.85;
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

  // ── Enforce TOTAL stacked height ≤ cover max ─────────────
  // capHeight() alone caps individual props, but stacked props (yOffset > 0)
  // can exceed the peek height. Cap the whole group's max.y so the player's
  // ADS peek camera (1.65m) can always shoot over the top.
  const finalMax = recipe === "car" ? CAR_MAX_HEIGHT : COVER_MAX_HEIGHT;
  const groupBbox = new THREE.Box3().setFromObject(group);
  const groupH = groupBbox.max.y - groupBbox.min.y;
  if (groupH > finalMax && groupH > 0.001) {
    group.scale.multiplyScalar(finalMax / groupH);
  }

  // Recompute accurate height + horizontal half-extents from actual geometry
  const finalBbox = new THREE.Box3().setFromObject(group);
  const finalSize = finalBbox.getSize(new THREE.Vector3());
  height = finalSize.y;
  halfX = Math.max(0.5, finalSize.x / 2);
  halfZ = Math.max(0.5, finalSize.z / 2);

  return { group, height, halfX, halfZ };
}

/* ── Building / Garage construction from wall GLBs ────────── */
function buildWallRow(group, walls, unitW, unitH, opts = {}) {
  const rotY = opts.rotY ?? 0;
  const startX = opts.startX ?? 0;
  const z = opts.z ?? 0;

  walls.forEach((path, i) => {
    const w = cloneGLB(path);
    if (!w) return;
    const bb0 = new THREE.Box3().setFromObject(w);
    const sz0 = bb0.getSize(new THREE.Vector3());
    const sx = unitW / (sz0.x || 1);
    const sy = unitH / (sz0.y || 1);
    w.scale.set(sx, sy, sx);
    const bb1 = new THREE.Box3().setFromObject(w);
    w.position.set(startX + i * unitW, -bb1.min.y, z);
    w.rotation.y = rotY;
    group.add(w);
  });
}

function buildBuilding(
  scene,
  { x, z, width, depth = 6, height = 4, rng, side = "left" },
) {
  const group = new THREE.Group();
  const unitW = 2.0;
  const cols = Math.max(2, Math.round(width / unitW));

  const frontWalls = [];
  for (let i = 0; i < cols; i++) {
    frontWalls.push(
      BUILDING_FRONT_POOL[Math.floor(rng.next() * BUILDING_FRONT_POOL.length)],
    );
  }
  buildWallRow(group, frontWalls, unitW, height, { startX: 0, z: 0, rotY: 0 });

  const backWalls = [];
  for (let i = 0; i < cols; i++) {
    backWalls.push(
      BUILDING_BACK_POOL[Math.floor(rng.next() * BUILDING_BACK_POOL.length)],
    );
  }
  buildWallRow(group, backWalls, unitW, height, {
    startX: 0,
    z: depth,
    rotY: 0,
  });

  const sideCols = Math.max(1, Math.round(depth / unitW));
  const sidePlacer = (xPos) => (path, i) => {
    const w = cloneGLB(path);
    if (!w) return;
    const bb0 = new THREE.Box3().setFromObject(w);
    const sz0 = bb0.getSize(new THREE.Vector3());
    const sx = unitW / (sz0.x || 1);
    const sy = height / (sz0.y || 1);
    w.scale.set(sx, sy, sx);
    w.rotation.y = Math.PI / 2;
    const bb1 = new THREE.Box3().setFromObject(w);
    w.position.set(xPos, -bb1.min.y, i * unitW);
    group.add(w);
  };

  const leftPieces = [];
  for (let i = 0; i < sideCols; i++)
    leftPieces.push(
      BUILDING_SIDE_POOL[Math.floor(rng.next() * BUILDING_SIDE_POOL.length)],
    );
  leftPieces.forEach(sidePlacer(0));

  const rightPieces = [];
  for (let i = 0; i < sideCols; i++)
    rightPieces.push(
      BUILDING_SIDE_POOL[Math.floor(rng.next() * BUILDING_SIDE_POOL.length)],
    );
  rightPieces.forEach(sidePlacer(cols * unitW));

  // Simple roof slab
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(cols * unitW + 0.2, 0.2, depth + 0.2),
    mkMat(0x2a2a2a, 0.9),
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

  group.position.set(x, 0, z);
  group.rotation.y = side === "left" ? -Math.PI / 2 : Math.PI / 2;

  group.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  // Wrap with LOD — far buildings swap to a simple box; very far get culled
  const proxyColor = 0x5d564f;
  const lod = wrapWithLOD(group, {
    midDist: LOD_MID,
    hideDist: LOD_HIDE,
    proxyColor,
  });
  freezeStatic(lod);
  scene.add(lod);

  return { group: lod, width: cols * unitW, depth, height };
}

function buildGarage(
  scene,
  { x, z, width, depth = 5, height = 3.2, rng, side = "left" },
) {
  const group = new THREE.Group();
  const unitW = 2.0;
  const cols = Math.max(2, Math.round(width / unitW));

  const frontPool = [
    "env/wall_metal_1",
    "env/wall_metal_2",
    "env/wall_concrete_metal",
    "env/wall_door",
  ];
  const frontWalls = [];
  for (let i = 0; i < cols; i++) {
    frontWalls.push(frontPool[Math.floor(rng.next() * frontPool.length)]);
  }
  frontWalls[Math.floor(cols / 2)] = "env/wall_hole";
  buildWallRow(group, frontWalls, unitW, height, { startX: 0, z: 0 });

  const backWalls = new Array(cols).fill("env/wall_brick");
  buildWallRow(group, backWalls, unitW, height, { startX: 0, z: depth });

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

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(cols * unitW + 0.2, 0.15, depth + 0.2),
    mkMat(0x4a3628, 0.9, 0.3),
  );
  roof.position.set((cols * unitW) / 2, height + 0.08, depth / 2);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  group.position.set(x, 0, z);
  group.rotation.y = side === "left" ? -Math.PI / 2 : Math.PI / 2;

  group.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  const lod = wrapWithLOD(group, {
    midDist: LOD_MID,
    hideDist: LOD_HIDE,
    proxyColor: 0x4a3e33,
  });
  freezeStatic(lod);
  scene.add(lod);

  return { group: lod, width: cols * unitW, depth, height };
}

/* ── Trees (bush_1 scaled up as trees) ──────────────── */
/**
 * Scatter bush_1 scaled up (~2.8–3.6m tall) as trees along the sidewalks,
 * favoring spots between/next to buildings.
 */
function scatterTrees(scene, rng, buildingEntries) {
  // Candidate z positions — one near each building's front edge + between buildings
  const zCandidates = new Set();
  buildingEntries.forEach((b) => {
    zCandidates.add(Math.round(b.zStart));
    zCandidates.add(Math.round(b.zStart + 6));
    zCandidates.add(Math.round(b.zStart - 3));
  });
  // Also fill with steady spacing along road
  for (let z = -ROAD_LENGTH / 2 + 6; z < ROAD_LENGTH / 2 - 6; z += 15) {
    if (rng.next() < 0.2) zCandidates.add(Math.round(z));
  }

  zCandidates.forEach((z) => {
    for (const side of [-1, 1]) {
      if (rng.next() < 0.3) {
        const jitterX = (rng.next() - 0.5) * 1.5;
        const jitterZ = (rng.next() - 0.5) * 2.0;
        const x = side * (ROAD_WIDTH / 2 + 3.2 + rng.next() * 0.8) + jitterX;
        const targetHeight = 2.6 + rng.next() * 1.2; // 2.6 – 3.8m tall
        const rotY = rng.next() * Math.PI * 2;
        const obj = placeGLB(scene, "env/bush", x, z + jitterZ, null, {
          targetHeight,
          rotY,
          lod: {
            midDist: TREE_LOD_MID,
            hideDist: TREE_LOD_HIDE,
            proxyColor: 0x2f4a24,
          },
        });
        if (obj) envState.trees.push(obj);
      }
    }
  });
}

/* ── Decorations scattered along street ───────────────── */
function scatterDecorations(scene, world, rng) {
  const decorChoices = [
    { path: "env/barrel", width: 0.9, weight: 2, collide: true },
    { path: "env/small_bottle", width: 0.25, weight: 1 },
    { path: "env/sharpened_stick", width: 0.6, weight: 1 },
    { path: "env/metal_board_1", width: 1.5, weight: 1 },
    { path: "env/metal_board_2", width: 1.5, weight: 1 },
    { path: "env/metal_board_3", width: 1.5, weight: 1 },
    { path: "env/box", width: 0.9, weight: 2, collide: true },
    { path: "env/tire", width: 0.9, weight: 2 },
  ];

  const pool = [];
  decorChoices.forEach((c) => {
    for (let i = 0; i < c.weight; i++) pool.push(c);
  });

  // Scatter decor on both sides of the road (outside sidewalks)
  for (let z = -ROAD_LENGTH / 2 + 6; z < ROAD_LENGTH / 2 - 6; z += 5) {
    for (const side of [-1, 1]) {
      if (rng.next() < 0.45) {
        const choice = pool[Math.floor(rng.next() * pool.length)];
        const jitterZ = (rng.next() - 0.5) * 3.5;
        const jitterX = (rng.next() - 0.5) * 1.2;
        const xBase = side * (ROAD_WIDTH / 2 + 3 + rng.next() * 1.0);
        const rotY = rng.next() * Math.PI * 2;
        const obj = placeGLB(
          scene,
          choice.path,
          xBase + jitterX,
          z + jitterZ,
          choice.width,
          {
            rotY,
            noCastShadow: choice.width < 0.7, // small props skip shadow
            lod: {
              midDist: DECOR_LOD_MID,
              hideDist: DECOR_LOD_HIDE,
              proxyColor: 0x6a6358,
            },
          },
        );
        if (obj && choice.collide) {
          const bb = new THREE.Box3().setFromObject(obj);
          const sz = bb.getSize(new THREE.Vector3());
          const collider = addBoxCollider(
            world,
            { x: obj.position.x, y: sz.y / 2, z: obj.position.z },
            { x: sz.x / 2, y: sz.y / 2, z: sz.z / 2 },
            false,
          );
          envState.decors.push({ group: obj, collider });
        } else if (obj) {
          envState.decors.push({ group: obj, collider: null });
        }
      }
    }
  }

  // Electric poles / street lamps every ~12m on both sides.
  // Sized as tall street lights (~4.5–5m) via fitToHeight.
  for (let z = -ROAD_LENGTH / 2 + 8; z < ROAD_LENGTH / 2 - 8; z += 12) {
    for (const side of [-1, 1]) {
      const x = side * (ROAD_WIDTH / 2 + 2.4);
      const targetHeight = 4.6 + (rng.next() - 0.5) * 0.4;
      const obj = placeGLB(scene, "env/electric_pole", x, z, null, {
        targetHeight,
        lod: { midDist: 60, hideDist: 150, proxyColor: 0x3c3a36 },
      });
      if (obj) envState.decors.push({ group: obj, collider: null });
    }
  }

  // Occasional medpack on the sidewalk — visual only (pickup wiring deferred)
  for (let z = -ROAD_LENGTH / 2 + 20; z < ROAD_LENGTH / 2 - 20; z += 26) {
    if (rng.next() < 0.5) {
      const side = rng.next() < 0.5 ? -1 : 1;
      const x = side * (ROAD_WIDTH / 2 + 1.5);
      const obj = placeGLB(
        scene,
        "env/medpack",
        x,
        z + (rng.next() - 0.5) * 4,
        0.6,
        {
          rotY: rng.next() * Math.PI * 2,
          lod: {
            midDist: DECOR_LOD_MID,
            hideDist: DECOR_LOD_HIDE,
            proxyColor: 0x884a3a,
          },
        },
      );
      if (obj) envState.decors.push({ group: obj, collider: null });
    }
  }
}

/* ── Buildings + garages placement ──────────────────── */
function buildSideStructures(scene, rng) {
  const entries = [];
  let zCursor = -ROAD_LENGTH / 2 + 8;
  envState.frontZCursorBuilding = zCursor - 12;

  const gap = 4.0;

  while (zCursor < ROAD_LENGTH / 2 - 8) {
    for (const side of [-1, 1]) {
      const isGarage = rng.next() < 0.4;
      const width = 8 + Math.floor(rng.next() * 3) * 2;
      const depth = 5 + Math.floor(rng.next() * 2) * 1.5;
      const height = isGarage ? 3.2 : 3.6 + rng.next() * 2.2;

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

/* ── Main builder ──────────────────────────────── */
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
  envState.roads.push(road);

  /* Center-line markings (InstancedMesh — single draw call) */
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
  envState.markMesh = markMesh;

  /* Sidewalks + curbs */
  const sidewalkMat = new THREE.MeshStandardMaterial({
    color: 0x8a8a88,
    roughness: 0.9,
  });
  [-1, 1].forEach((side) => {
    const sw = new THREE.Mesh(
      new THREE.PlaneGeometry(4, ROAD_LENGTH),
      sidewalkMat,
    );
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
    envState.roads.push(sw, curb);
  });

  /* Ground skirts on either side outside sidewalks */
  const skirtMat = new THREE.MeshStandardMaterial({
    color: 0x5a5046,
    roughness: 1.0,
  });
  [-1, 1].forEach((side) => {
    const skirt = new THREE.Mesh(
      new THREE.PlaneGeometry(30, ROAD_LENGTH),
      skirtMat,
    );
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.set(side * (ROAD_WIDTH / 2 + 4 + 15), -0.01, 0);
    skirt.receiveShadow = true;
    scene.add(skirt);
    envState.roads.push(skirt);
  });

  /* Buildings + garages on both sides */
  const buildingEntries = buildSideStructures(scene, rng);
  envState.buildings = buildingEntries;

  /* Trees between/next to buildings (bush_1 scaled up) */
  scatterTrees(scene, rng, buildingEntries);

  /* Scattered street decorations + electric poles */
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

  envState.slots = slots;

  return { slots, road };
}

/* ── Infinite Update ───────────────────────────────── */
export function updateStreet(playerZ, scene, world, rng) {
  // Update road planes continuously to prevent horizon gaps
  const roadCenterZ = playerZ - 100;
  envState.roads.forEach((r) => {
    r.position.z = roadCenterZ;
  });

  // Update markings (InstancedMesh)
  if (envState.markMesh) {
    const dummy = new THREE.Object3D();
    const markCount = 18;
    const markStart = Math.floor(playerZ / 12) * 12 + 108;
    for (let i = 0; i < markCount; i++) {
      dummy.position.set(0, 0, markStart - i * 12);
      dummy.updateMatrix();
      envState.markMesh.setMatrixAt(i, dummy.matrix);
    }
    envState.markMesh.instanceMatrix.needsUpdate = true;
  }

  // Recycle Buildings
  const BEHIND_THRESHOLD = 40;
  for (let b of envState.buildings) {
    if (b.group.position.z > playerZ + BEHIND_THRESHOLD) {
      // Only advance the cursor once per pair (e.g., when processing the left side)
      if (b.side < 0) {
        envState.frontZCursorBuilding -= 12 + 4 + rng.next() * 4;
      }
      const newZ = envState.frontZCursorBuilding;
      scene.remove(b.group);

      const isGarage = rng.next() < 0.4;
      const width = 8 + Math.floor(rng.next() * 3) * 2;
      const depth = 5 + Math.floor(rng.next() * 2) * 1.5;
      const height = isGarage ? 3.2 : 3.6 + rng.next() * 2.2;
      const xOffset = ROAD_WIDTH / 2 + 4 + 0.2;
      const x = b.side < 0 ? -xOffset : xOffset;

      let newB;
      if (isGarage) {
        newB = buildGarage(scene, {
          x,
          z: newZ,
          width,
          depth,
          height,
          rng,
          side: b.side < 0 ? "left" : "right",
        });
      } else {
        newB = buildBuilding(scene, {
          x,
          z: newZ,
          width,
          depth,
          height,
          rng,
          side: b.side < 0 ? "left" : "right",
        });
      }
      b.group = newB.group;
      b.group.position.z = newZ;
      b.group.updateMatrix();
      b.group.updateMatrixWorld(true);
    }
  }

  // Recycle Trees
  for (let t of envState.trees) {
    if (t.position.z > playerZ + BEHIND_THRESHOLD) {
      envState.frontZCursorTree -= 15;
      t.position.z = envState.frontZCursorTree + (rng.next() - 0.5) * 2.0;
      t.position.x =
        (rng.next() < 0.5 ? -1 : 1) *
          (ROAD_WIDTH / 2 + 3.2 + rng.next() * 0.8) +
        (rng.next() - 0.5) * 1.5;
      t.updateMatrix();
      t.updateMatrixWorld(true);
    }
  }

  // Recycle Decors
  for (let d of envState.decors) {
    if (d.group.position.z > playerZ + BEHIND_THRESHOLD) {
      envState.frontZCursorDecor -= 5;
      const newZ = envState.frontZCursorDecor + (rng.next() - 0.5) * 3.5;
      d.group.position.z = newZ;
      d.group.updateMatrix();
      d.group.updateMatrixWorld(true);
      if (d.collider) {
        d.collider.setTranslation(
          { x: d.group.position.x, y: d.collider.translation().y, z: newZ },
          true,
        );
      }
    }
  }

  // Recycle Cover Slots (Blocks)
  if (envState.slots.length > 0) {
    const lastSlot = envState.slots[envState.slots.length - 1];
    if (lastSlot.zPos > playerZ - 100) {
      // Generate new slot
      const i = envState.slots.length;
      const side = i % 2 === 0 ? "left" : "right";
      const xPos =
        side === "left" ? -ROAD_WIDTH / 2 + 1.8 : ROAD_WIDTH / 2 - 1.8;
      const zPos = envState.frontZCursorSlot - SLOT_SPACING;
      envState.frontZCursorSlot = zPos;

      const recipe =
        COVER_RECIPES[Math.floor(rng.next() * COVER_RECIPES.length)];
      const { group: mesh, height, halfX, halfZ } = buildCover(recipe, rng);
      mesh.position.set(xPos, 0, zPos);
      mesh.rotation.y = side === "left" ? 0.1 : -0.1;
      scene.add(mesh);

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
      envState.slots.push(slot);
    }
  }
}

/* ── Cover helpers ────────────────────────────── */
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
