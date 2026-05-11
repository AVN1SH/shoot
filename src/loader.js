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
//    ak47.glb, ak47variant.glb, nade_low.glb, nadevariant_low.glb,
//    ammobox_low.glb, awm.glb, mac10.glb, pew.glb, shotgun.glb,
//    flashbang_low.glb, smoke_low.glb, rocketlaucher.glb, board.glb
//
//  assets/architectures/  ← Environment props (walls, cover, decorations)
//    barrel, box_1, bush_1, car, electric_pole_1,
//    ground_*, medpack_1, metal_board_*,
//    pallet_cluster_1, road_barrier, sharpened_stick, small_bottle_1,
//    tire, wall_*, wheel, wooden_spike_barricade, wooden_wall
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
  'assets/guns/smoke.glb':               'assets/meterials/smoke_low.glb',
  'assets/guns/incendiary.glb':          'assets/meterials/incendiary_low.glb',

  // ── Pickups / Props ─────────────────────────────────────
  'assets/guns/ammo_pickup.glb':         'assets/meterials/ammobox_low.glb',
  'assets/props/board.glb':              'assets/meterials/board.glb',

  // ── Bullets ─────────────────────────────────────────────
  'assets/fx/bullet.glb':               'assets/meterials/bullet1.glb',
  'assets/fx/bullet_pew.glb':           'assets/meterials/bulletPEW.glb',
  'assets/fx/bullet_shotgun.glb':       'assets/meterials/bulletshotgun.glb',
  'assets/fx/bullet_sniper.glb':        'assets/meterials/bulletsniper.glb',

  // ── Environment: Cover props ────────────────────────────
  'env/car':                    'assets/architectures/car.glb',
  'env/pallet_cluster':         'assets/architectures/pallet_cluster_1.glb',
  'env/road_barrier':           'assets/architectures/road_barrier.glb',
  'env/tire':                   'assets/architectures/tire.glb',
  'env/wheel':                  'assets/architectures/wheel.glb',
  'env/wooden_spike_barricade': 'assets/architectures/wooden_spike_barricade.glb',
  'env/barrel':                 'assets/architectures/barrel.glb',
  'env/box':                    'assets/architectures/box_1.glb',

  // ── Environment: Walls & buildings ──────────────────────
  'env/wall':                   'assets/architectures/wall_1.glb',
  'env/wall_brick':             'assets/architectures/wall_1_brick.glb',
  'env/wall_door':              'assets/architectures/wall_1_door_boarded.glb',
  'env/wall_hole':              'assets/architectures/wall_1_hole.glb',
  'env/wall_window_1':          'assets/architectures/wall_1_window_1.glb',
  'env/wall_window_2':          'assets/architectures/wall_1_window_2.glb',
  'env/wall_column':            'assets/architectures/wall_column.glb',
  'env/wall_concrete_metal':    'assets/architectures/wall_concrete_metal.glb',
  'env/wall_metal_1':           'assets/architectures/wall_metal_1.glb',
  'env/wall_metal_2':           'assets/architectures/wall_metal_2.glb',
  'env/wall_spiked':            'assets/architectures/wall_spiked.glb',
  'env/wooden_wall':            'assets/architectures/wooden_wall.glb',

  // ── Environment: Ground tiles ───────────────────────────
  'env/ground_1':               'assets/architectures/ground_1.glb',
  'env/ground_2':               'assets/architectures/ground_2.glb',
  'env/ground_planks':          'assets/architectures/ground_planks.glb',
  'env/ground_road_1_L':        'assets/architectures/ground_road_1_L.glb',
  'env/ground_road_1_R':        'assets/architectures/ground_road_1_R.glb',
  'env/ground_road_2_L':        'assets/architectures/ground_road_2_L.glb',
  'env/ground_road_2_R':        'assets/architectures/ground_road_2_R.glb',

  // ── Environment: Metal boards ───────────────────────────
  'env/metal_board_1':          'assets/architectures/metal_board_1.glb',
  'env/metal_board_2':          'assets/architectures/metal_board_2.glb',
  'env/metal_board_3':          'assets/architectures/metal_board_3.glb',

  // ── Environment: Decorations ────────────────────────────
  'env/bush':                   'assets/architectures/bush_1.glb',
  'env/electric_pole':          'assets/architectures/electric_pole_1.glb',
  'env/small_bottle':           'assets/architectures/small_bottle_1.glb',
  'env/sharpened_stick':        'assets/architectures/sharpened_stick.glb',
  'env/medpack':                'assets/architectures/medpack_1.glb',
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
  const toLoad = [
    // Characters & guns
    'assets/enemies/enemy_character.glb',
    'assets/guns/player_rifle.glb',
    'assets/guns/enemy_rifle.glb',
    'assets/guns/grenade.glb',
    'assets/guns/ammo_pickup.glb',

    // Environment cover
    'env/car',
    'env/pallet_cluster',
    'env/road_barrier',
    'env/tire',
    'env/wheel',
    'env/wooden_spike_barricade',
    'env/barrel',
    'env/box',

    // Walls (buildings / garages)
    'env/wall',
    'env/wall_brick',
    'env/wall_door',
    'env/wall_hole',
    'env/wall_window_1',
    'env/wall_window_2',
    'env/wall_column',
    'env/wall_concrete_metal',
    'env/wall_metal_1',
    'env/wall_metal_2',
    'env/wooden_wall',

    // Decorations
    'env/bush',
    'env/electric_pole',
    'env/small_bottle',
    'env/sharpened_stick',
    'env/metal_board_1',
    'env/metal_board_2',
    'env/metal_board_3',
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

/* ── Helpers for cloned GLB instances ─────────────────────── */
// Clone a cached GLB scene so we can place many instances in the world.
// Returns null if not in cache. Ensures shadows are enabled on meshes.
export function cloneGLB(logicalPath) {
  const gltf = getFromCache(logicalPath);
  if (!gltf || !gltf.scene) return null;
  const obj = gltf.scene.clone(true);
  obj.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return obj;
}
