// input.js — Unified Mouse / Touch / Gamepad Manager
// Controls:
//   Desktop: Right-click HOLD = ADS (peek), Left-click = Fire, Mouse = aim
//   Mobile:  ADS button = peek, right-half tap = fire, drag right = aim

import { enterADS, exitADS, playerState } from './player.js';

let _playerRig    = null;
let _hud          = null;
let _onFire       = null;
let _adsActive    = false;
let _pointerLocked = false;

/* ── Init ─────────────────────────────────────────────────── */
export function initInput(playerRig, hud, onFire) {
  _playerRig = playerRig;
  _hud       = hud;
  _onFire    = onFire;

  // ── Desktop: request pointer lock on canvas click ──
  const canvas = document.querySelector('canvas');
  if (canvas) {
    canvas.addEventListener('click', () => {
      if (!_pointerLocked && !isTouchDevice()) {
        canvas.requestPointerLock?.();
      }
    });
  }

  document.addEventListener('pointerlockchange', () => {
    _pointerLocked = document.pointerLockElement != null;
  });

  // ── Mouse move: rotate body (Y) and camera (X) ──
  document.addEventListener('mousemove', (e) => {
    if (!_pointerLocked) return;
    _rotateRig(e.movementX, e.movementY);
  });

  // ── Mouse buttons ──
  document.addEventListener('mousedown', (e) => {
    if (!_pointerLocked) return;

    if (e.button === 2) {
      // Right mouse = ADS (hold to peek over cover)
      e.preventDefault();
      _activateADS();
    }

    if (e.button === 0) {
      // Left mouse = Fire
      _onFire?.();
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
      // Release right mouse = exit ADS (duck back behind cover)
      _deactivateADS();
    }
  });

  // Prevent right-click context menu
  document.addEventListener('contextmenu', e => e.preventDefault());

  // ── Touch: left-half = look/fire, right-half = ADS ──
  document.addEventListener('touchstart', _onTouchStart, { passive: false });
  document.addEventListener('touchmove',  _onTouchMove,  { passive: false });
  document.addEventListener('touchend',   _onTouchEnd,   { passive: false });

  // ── ADS button (mobile overlay) ──
  const adsBtn = document.getElementById('ads-btn');
  if (adsBtn) {
    adsBtn.addEventListener('pointerdown', e => {
      e.stopPropagation();
      _activateADS();
    });
    adsBtn.addEventListener('pointerup', e => {
      e.stopPropagation();
      _deactivateADS();
    });
    adsBtn.addEventListener('pointerleave', e => {
      if (_adsActive) _deactivateADS();
    });
  }

  // ── Keyboard fallback ──
  window.addEventListener('keydown', (e) => {
    if (e.code === 'MouseRight' || e.code === 'KeyQ') _activateADS();
    if (e.code === 'Space' || e.code === 'KeyF')      _onFire?.();
    if (e.code === 'KeyR')                            _triggerReload();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'MouseRight' || e.code === 'KeyQ') _deactivateADS();
  });
}

/* ── Touch tracking ──────────────────────────────────────── */
const _touches  = {};
let   _fireTouchId = null;

function _onTouchStart(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    _touches[t.identifier] = { x: t.clientX, y: t.clientY, startX: t.clientX };
    const isRightHalf = t.clientX > window.innerWidth * 0.55;

    if (isRightHalf) {
      // Right half: hold = ADS, tap = fire
      _fireTouchId = t.identifier;
      _activateADS();
    }
  }
}

function _onTouchMove(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const prev = _touches[t.identifier];
    if (!prev) continue;
    const dx = t.clientX - prev.x;
    const dy = t.clientY - prev.y;
    // Drag anywhere to look
    _rotateRig(dx * 4, dy * 4);
    prev.x = t.clientX;
    prev.y = t.clientY;
  }
}

function _onTouchEnd(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const prev    = _touches[t.identifier];
    const travelX = prev ? Math.abs(t.clientX - prev.startX) : 99;

    if (t.identifier === _fireTouchId) {
      // Short tap on right = fire
      if (travelX < 15) _onFire?.();
      _fireTouchId = null;
      _deactivateADS();
    }
    delete _touches[t.identifier];
  }
}

/* ── ADS helpers ─────────────────────────────────────────── */
function _activateADS() {
  if (_adsActive) return;
  _adsActive = true;
  enterADS(_playerRig, _hud);
  document.getElementById('ads-btn')?.classList.add('active');
}

function _deactivateADS() {
  if (!_adsActive) return;
  _adsActive = false;
  exitADS(_playerRig, _hud);
  document.getElementById('ads-btn')?.classList.remove('active');
}

/* ── Camera / body rotation ──────────────────────────────── */
function _rotateRig(dx, dy) {
  if (!_playerRig) return;
  const sens = 0.0018;

  // Horizontal: rotate the body so gun/arms follow
  _playerRig.body.rotation.y -= dx * sens;

  // Vertical: only rotate camera (clamped)
  const cam = _playerRig.camera;
  cam.rotation.order = 'YXZ';
  cam.rotation.x = Math.max(-0.45, Math.min(0.45, cam.rotation.x - dy * sens));
}

/* ── Reload ──────────────────────────────────────────────── */
function _triggerReload() {
  if (playerState.isReloading) return;
  playerState.isReloading = true;
  // Handled by main.js checkAutoReload, just flag it
  setTimeout(() => {
    playerState.ammo        = playerState.maxAmmo;
    playerState.isReloading = false;
  }, 1800);
}

/* ── Utilities ───────────────────────────────────────────── */
function isTouchDevice() { return navigator.maxTouchPoints > 0; }

export function isADSActive() { return _adsActive; }
