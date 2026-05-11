// street.js — Procedural Street, Cover Nodes, Fence Posts
// Environment GLBs not available → everything built procedurally.

import * as THREE from "three";
import { addBoxCollider } from "./physics.js";
import { SeededRNG } from "./utils.js";

const ROAD_WIDTH = 12;
const SLOT_SPACING = 18;
const NUM_SLOTS = 8;
const COVER_TYPES = ["car", "dumpster", "crates", "barrier"];

/* ── Material palette ────────────────────────────────────── */
function mkMat(color, roughness = 0.8, metalness = 0.0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/* ── Cover builder ───────────────────────────────────────── */
function buildCover(type, side) {
  const g = new THREE.Group();

  switch (type) {
    case "car": {
      // Body
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 1.4, 2.0),
        mkMat(0x2244aa, 0.5, 0.3),
      );
      body.position.y = 0.7;
      // Roof
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.7, 1.8),
        mkMat(0x1a3388, 0.5, 0.3),
      );
      roof.position.set(0, 1.75, 0);
      // Wheels
      const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.2, 12);
      const wheelMat = mkMat(0x111111, 0.9);
      [
        [-1.5, -1.1],
        [1.5, -1.1],
        [-1.5, 1.1],
        [1.5, 1.1],
      ].forEach(([x, z]) => {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.35, z);
        g.add(w);
      });
      g.add(body, roof);
      break;
    }
    case "dumpster": {
      const bin = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 1.4, 1.0),
        mkMat(0x115522, 0.85),
      );
      bin.position.y = 0.7;
      const lid = new THREE.Mesh(
        new THREE.BoxGeometry(2.05, 0.08, 1.05),
        mkMat(0x0d4419, 0.9),
      );
      lid.position.y = 1.44;
      g.add(bin, lid);
      break;
    }
    case "crates": {
      const cMat = mkMat(0x8b6914, 0.95);
      const lMat = mkMat(0x6b4f10, 0.9);
      [
        [0, 0.3, 0],
        [0.55, 0.3, 0.1],
        [0.25, 0.9, 0],
      ].forEach(([x, y, z]) => {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.5), cMat);
        c.position.set(x, y, z);
        // Planks
        [-0.24, 0.24].forEach((lx) => {
          const l = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.55, 0.5),
            lMat,
          );
          l.position.set(x + lx, y, z);
          g.add(l);
        });
        g.add(c);
      });
      break;
    }
    case "barrier": {
      // Jersey barrier
      const bot = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.55, 0.7),
        mkMat(0xcccccc, 0.95),
      );
      bot.position.y = 0.275;
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.55, 0.45),
        mkMat(0xdddddd, 0.9),
      );
      top.position.y = 0.825;
      g.add(bot, top);
      break;
    }
  }

  g.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return g;
}

/* ── Main builder ────────────────────────────────────────── */
export async function buildStreet(scene, world, rng = new SeededRNG(42)) {
  /* Road surface */
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.95,
  });
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_WIDTH, 260),
    roadMat,
  );
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  scene.add(road);

  /* Center line markings (instanced) */
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

  /* Sidewalks */
  const sidewalkMat = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.9,
  });
  [-1, 1].forEach((side) => {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(4, 260), sidewalkMat);
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(side * (ROAD_WIDTH / 2 + 2), 0.01, 0);
    sw.receiveShadow = true;
    scene.add(sw);
    // Curb
    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.12, 260),
      new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.8 }),
    );
    curb.position.set((side * ROAD_WIDTH) / 2, 0.06, 0);
    curb.receiveShadow = true;
    scene.add(curb);
  });

  /* Fence posts (InstancedMesh) */
  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.0, 8);
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x555555,
    roughness: 0.6,
    metalness: 0.4,
  });
  const postCount = 30;
  const fenceL = new THREE.InstancedMesh(postGeo, postMat, postCount);
  const fenceR = new THREE.InstancedMesh(postGeo, postMat, postCount);
  fenceL.castShadow = true;
  fenceR.castShadow = true;
  const pm = new THREE.Object3D();
  for (let i = 0; i < postCount; i++) {
    const z = -i * 8;
    pm.position.set(-(ROAD_WIDTH / 2 + 3.8), 1, z);
    pm.updateMatrix();
    fenceL.setMatrixAt(i, pm.matrix);
    pm.position.set(ROAD_WIDTH / 2 + 3.8, 1, z);
    pm.updateMatrix();
    fenceR.setMatrixAt(i, pm.matrix);
  }
  fenceL.instanceMatrix.needsUpdate = true;
  fenceR.instanceMatrix.needsUpdate = true;
  scene.add(fenceL, fenceR);

  /* Cover nodes
   * Slot 0  = player's starting cover  → z = -8   (right in front of spawn)
   * Slots 1+ = down the street every SLOT_SPACING
   */
  const slots = [];

  // Cover heights per type (top of the object)
  const COVER_HEIGHTS = { car: 1.4, dumpster: 1.44, crates: 1.2, barrier: 0.9 };

  for (let i = 0; i < NUM_SLOTS; i++) {
    const side = i % 2 === 0 ? "left" : "right";
    const xPos = side === "left" ? -ROAD_WIDTH / 2 + 1.8 : ROAD_WIDTH / 2 - 1.8;
    // i=0 → z=-8 (player's first cover), i=1 → z=-26, i=2 → z=-44 …
    const zPos = -(i === 0 ? 8 : (i + 1) * SLOT_SPACING + 8);
    const type = COVER_TYPES[Math.floor(rng.next() * COVER_TYPES.length)];
    const coverHeight = COVER_HEIGHTS[type] ?? 1.2;

    const mesh = buildCover(type, side);
    mesh.position.set(xPos, 0, zPos);
    scene.add(mesh);

    // Physics collider for cover
    const colliderBody = addBoxCollider(
      world,
      { x: xPos, y: coverHeight / 2, z: zPos },
      { x: 1.5, y: coverHeight / 2, z: 0.7 },
      false,
    );

    const slot = {
      side,
      xPos,
      zPos,
      type,
      coverHeight,
      cleared: false,
      hp: 100,
      mesh,
      collider: colliderBody,
      // Peek positions slightly behind cover
      peekLeft: new THREE.Vector3(xPos - 1.4, 1.7, zPos + 1.0),
      peekRight: new THREE.Vector3(xPos + 1.4, 1.7, zPos + 1.0),
      activePeek: side === "left" ? "right" : "left", // peek toward center
    };

    slots.push(slot);
  }

  return { slots, road, fenceL, fenceR };
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
  playerRig.body.position.y = 0; // body at ground, camera elevated
  playerRig.camera.position.set(0, pos.y, 0); // camera height on body
}
