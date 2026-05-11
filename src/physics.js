// physics.js — Rapier3D World + Collider Factories
// Uses the local rapier.es.js (downloaded to assets/) via importmap.

import RAPIER from '@dimforge/rapier3d-compat';

let _world = null;

export async function initPhysics() {
  console.log('[Physics] Initializing Rapier...');
  await RAPIER.init();
  console.log('[Physics] Rapier ready.');

  _world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  return _world;
}

export function getRapier() {
  return RAPIER;
}

/* ── Collider factory helpers ─────────────────────────────── */

/** Fixed or dynamic box rigid body with cuboid collider. */
export function addBoxCollider(world, pos, halfExtents, isDynamic = false) {
  const desc = isDynamic
    ? RAPIER.RigidBodyDesc.dynamic()
    : RAPIER.RigidBodyDesc.fixed();
  desc.setTranslation(pos.x, pos.y, pos.z);
  const body = world.createRigidBody(desc);
  const col  = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
  col.setRestitution(0.2);
  world.createCollider(col, body);
  return body;
}

/** Kinematic position-based capsule for enemy bodies. */
export function addCapsuleCollider(world, pos, halfHeight, radius) {
  const desc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(pos.x, pos.y, pos.z);
  const body = world.createRigidBody(desc);
  world.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, radius), body);
  return body;
}

/** Fixed small box for head hitbox. */
export function addHeadCollider(world, pos) {
  const desc = RAPIER.RigidBodyDesc.fixed()
    .setTranslation(pos.x, pos.y, pos.z);
  const body = world.createRigidBody(desc);
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.15, 0.15, 0.15), body);
  return body;
}

/** Dynamic sphere (grenade). */
export function addBallCollider(world, pos, radius = 0.1, restitution = 0.4) {
  const desc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(pos.x, pos.y, pos.z);
  const body = world.createRigidBody(desc);
  world.createCollider(RAPIER.ColliderDesc.ball(radius).setRestitution(restitution), body);
  return body;
}

/** Cast a ray; returns raw Rapier hit or null. */
export function castRay(world, origin, direction, maxDist = 150) {
  const ray = new RAPIER.Ray(origin, direction);
  return world.castRay(ray, maxDist, true) ?? null;
}
