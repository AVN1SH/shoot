// scene.js — Three.js Renderer, Scene, Lights
// Does NOT create a camera — player.js owns the camera.

import * as THREE from "three";

const ROAD_END = -130;

export function initScene() {
  /* ── Renderer ───────────────────────────────────────────── */
  const renderer = new THREE.WebGLRenderer({
    antialias: window.devicePixelRatio < 2,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);

  /* ── Scene ──────────────────────────────────────────────── */
  const scene = new THREE.Scene();
  // Warm late-afternoon sky tone for a more colorful feel
  const skyColor = new THREE.Color(0xc4d8ee);
  scene.background = skyColor;
  // Softer fog so distant buildings remain readable
  scene.fog = new THREE.FogExp2(0xc8d4e0, 0.012);

  /* ── Lighting ───────────────────────────────────────────── */
  // Key directional light (warm sun, lower in sky → long shadows)
  const sun = new THREE.DirectionalLight(0xffd9a8, 2.55);
  sun.position.set(18, 26, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 180;
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // Cool fill from opposite side (gives shadows a blue tint instead of black)
  const fill = new THREE.DirectionalLight(0x88aacc, 2.45);
  fill.position.set(-15, 12, 8);
  scene.add(fill);

  // Ambient — gentle warm
  scene.add(new THREE.AmbientLight(0xfff0d6, 0.32));

  // Hemisphere — strong sky/ground separation for natural feel
  scene.add(new THREE.HemisphereLight(0x9bc1ee, 0x4a3a2a, 0.55));

  // Atmospheric accent point lights down the street (warm sodium-lamp glow)
  const lampPositions = [
    [-9, 4, -30],
    [9, 4, -55],
    [-9, 4, -85],
    [9, 4, -115],
    [-9, 4, -145],
  ];
  lampPositions.forEach(([x, y, z]) => {
    const lamp = new THREE.PointLight(0xffaa55, 0.7, 22, 1.6);
    lamp.position.set(x, y, z);
    scene.add(lamp);
  });

  // Soft cool rim from far end of street
  const rim = new THREE.PointLight(0x6699ff, 0.5, 80, 1.4);
  rim.position.set(0, 8, ROAD_END);
  scene.add(rim);

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
  const size = quality === "low" ? 512 : quality === "medium" ? 1024 : 2048;
  renderer.shadowMap.autoUpdate = true;
  renderer.shadowMap.mapSize.set(size, size);
}
