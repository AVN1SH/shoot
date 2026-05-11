// scene.js — Three.js Renderer, Scene, Lights
// Does NOT create a camera — player.js owns the camera.

import * as THREE from 'three';

export function initScene() {
  /* ── Renderer ───────────────────────────────────────────── */
  const renderer = new THREE.WebGLRenderer({
    antialias: window.devicePixelRatio < 2,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);

  /* ── Scene ──────────────────────────────────────────────── */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8a9ba8);
  scene.fog = new THREE.FogExp2(0x8a9ba8, 0.018);

  /* ── Lighting ───────────────────────────────────────────── */
  // Key directional light (sun)
  const sun = new THREE.DirectionalLight(0xfff5e0, 1.4);
  sun.position.set(12, 22, -8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far  = 140;
  sun.shadow.camera.left   = -30;
  sun.shadow.camera.right  =  30;
  sun.shadow.camera.top    =  30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // Fill ambient
  scene.add(new THREE.AmbientLight(0x8899bb, 0.55));

  // Subtle hemisphere for sky / ground differentiation
  scene.add(new THREE.HemisphereLight(0xb0c8e8, 0x3a3228, 0.35));

  return { renderer, scene };
}

export function handleResize(renderer, camera) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

export function setShadowQuality(renderer, quality) {
  // quality: 'low' | 'medium' | 'high'
  const size = quality === 'low' ? 512 : quality === 'medium' ? 1024 : 2048;
  // Shadow map resize requires re-render — mark dirty
  renderer.shadowMap.autoUpdate = true;
  renderer.shadowMap.mapSize.set(size, size);
}
