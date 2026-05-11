// loader.js — GLB Asset Cache + Preloader
// Uses Three.js ES module addons (GLTFLoader, DRACOLoader)

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const cache = new Map();
let gltfLoader = null;

function getLoader() {
  if (gltfLoader) return gltfLoader;

  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');

  gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(draco);
  return gltfLoader;
}

export async function loadGLB(path) {
  if (cache.has(path)) return cache.get(path);

  try {
    const gltf = await getLoader().loadAsync(path);
    cache.set(path, gltf);
    return gltf;
  } catch (err) {
    console.warn(`[Loader] Failed to load "${path}":`, err.message || err);
    return null;
  }
}

// ── Actual assets on disk ──────────────────────────────────
//
//  assets/sprites/
//    person1.glb          ← enemy character (with skeleton + animations)
//
//  assets/meterials/      (note: typo in folder name is intentional — that's the real folder)
//    ak47.glb             ← player rifle viewmodel
//    ak47variant.glb      ← enemy rifle
//    nade_low.glb         ← grenade
//    nadevariant_low.glb  ← alternate grenade
//    ammobox_low.glb      ← ammo pickup
//    awm.glb              ← sniper (future use)
//    mac10.glb            ← SMG (future use)
//    pew.glb              ← pistol (future use)
//    shotgun.glb          ← shotgun (future use)
//    flashbang_low.glb    ← flashbang
//    smoke_low.glb        ← smoke grenade
//    rocketlaucher.glb    ← rocket launcher
//    board.glb            ← board prop
//
//  No environment GLBs exist → street/cover built procedurally.
//
const ASSET_MAP = {
  // ── Characters ──────────────────────────────────────────
  'assets/enemies/enemy_character.glb':  'assets/sprites/person1.glb',

  // ── Player guns ─────────────────────────────────────────
  'assets/guns/player_rifle.glb':        'assets/meterials/ak47.glb',
  'assets/guns/player_sniper.glb':       'assets/meterials/awm.glb',
  'assets/guns/player_smg.glb':          'assets/meterials/mac10.glb',
  'assets/guns/player_shotgun.glb':      'assets/meterials/shotgun.glb',
  'assets/guns/player_pistol.glb':       'assets/meterials/pew.glb',
  'assets/guns/player_rocket.glb':       'assets/meterials/rocketlaucher.glb',

  // ── Enemy guns ──────────────────────────────────────────
  'assets/guns/enemy_rifle.glb':         'assets/meterials/ak47variant.glb',
  'assets/guns/enemy_rocket.glb':        'assets/meterials/rocketlaunchervariant.glb',

  // ── Throwables ──────────────────────────────────────────
  'assets/guns/grenade.glb':             'assets/meterials/nade_low.glb',
  'assets/guns/grenade_variant.glb':     'assets/meterials/nadevariant_low.glb',
  'assets/guns/flashbang.glb':           'assets/meterials/flashbang_low.glb',
  'assets/guns/smoke.glb':              'assets/meterials/smoke_low.glb',
  'assets/guns/incendiary.glb':          'assets/meterials/incendiary_low.glb',

  // ── Pickups / Props ─────────────────────────────────────
  'assets/guns/ammo_pickup.glb':         'assets/meterials/ammobox_low.glb',
  'assets/props/board.glb':              'assets/meterials/board.glb',

  // ── Bullets ─────────────────────────────────────────────
  'assets/fx/bullet.glb':               'assets/meterials/bullet1.glb',
  'assets/fx/bullet_pew.glb':           'assets/meterials/bulletPEW.glb',
  'assets/fx/bullet_shotgun.glb':       'assets/meterials/bulletshotgun.glb',
  'assets/fx/bullet_sniper.glb':        'assets/meterials/bulletsniper.glb',

  // ── No environment GLBs — street/cover built procedurally ──
};

// Resolve a logical path to its physical path
export function resolvePath(logicalPath) {
  return ASSET_MAP[logicalPath] ?? logicalPath;
}

// Cached load via logical path
export async function loadAsset(logicalPath) {
  const physical = resolvePath(logicalPath);
  return loadGLB(physical);
}

// Preload the core assets needed before the game starts
export async function preloadAll(onProgress) {
  // Only preload assets we KNOW exist on disk
  const toLoad = [
    'assets/enemies/enemy_character.glb',  // → assets/sprites/person1.glb
    'assets/guns/player_rifle.glb',        // → assets/meterials/ak47.glb
    'assets/guns/enemy_rifle.glb',         // → assets/meterials/ak47variant.glb
    'assets/guns/grenade.glb',             // → assets/meterials/nade_low.glb
    'assets/guns/ammo_pickup.glb',         // → assets/meterials/ammobox_low.glb
  ];

  for (let i = 0; i < toLoad.length; i++) {
    const result = await loadAsset(toLoad[i]);
    if (!result) console.warn(`[Loader] Asset not found: ${toLoad[i]} → ${resolvePath(toLoad[i])}`);
    onProgress((i + 1) / toLoad.length);
  }
}

export function getFromCache(logicalPath) {
  const physical = resolvePath(logicalPath);
  return cache.get(physical) ?? null;
}
