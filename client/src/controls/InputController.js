import { CLIENT_CONFIG } from '../config.js';

export class InputController {
  constructor(onShoot) {
    this.onShoot = onShoot;
    this.isPointerLocked = false;
    this.aimFriction = 1.0; // 1.0 = normal, 0.65 = slowed down when locking enemy

    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false
    };

    this.mouse = {
      yaw: 0,
      pitch: 0
    };

    this.setupUnikeyShield();
    this.initListeners();
  }

  /**
   * Hidden password input shield trick:
   * Windows Unikey / EVKey automatically suspends Telex/VNI tone transformation
   * when a password input field has focus. This eliminates stuck keys, synthetic
   * backspaces, and swallowed keyup events while playing.
   */
  setupUnikeyShield() {
    let shield = document.getElementById('unikey-shield');
    if (!shield) {
      shield = document.createElement('input');
      shield.type = 'password';
      shield.id = 'unikey-shield';
      shield.tabIndex = -1;
      shield.autocomplete = 'off';
      shield.spellcheck = false;
      shield.setAttribute('aria-hidden', 'true');
      shield.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;width:1px;height:1px;z-index:-1;border:none;padding:0;';
      document.body.appendChild(shield);
    }
    this.unikeyShield = shield;
  }

  focusShield() {
    if (this.unikeyShield && this.isPointerLocked) {
      // Don't steal focus if user is intentionally typing in an active text input/textarea
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active !== this.unikeyShield) {
        return;
      }
      try {
        this.unikeyShield.focus({ preventScroll: true });
        this.unikeyShield.value = '';
      } catch (err) {}
    }
  }

  blurShield() {
    if (this.unikeyShield && document.activeElement === this.unikeyShield) {
      try {
        this.unikeyShield.blur();
        this.unikeyShield.value = '';
      } catch (err) {}
    }
  }

  resetKeys() {
    this.keys.forward = false;
    this.keys.backward = false;
    this.keys.left = false;
    this.keys.right = false;
    this.keys.up = false;
    this.keys.down = false;
  }

  isForwardKey(e) {
    return e.code === 'KeyW' || e.code === 'ArrowUp' ||
           e.key === 'w' || e.key === 'W' ||
           e.key === 'ư' || e.key === 'Ư';
  }

  isBackwardKey(e) {
    return e.code === 'KeyS' || e.code === 'ArrowDown' ||
           e.key === 's' || e.key === 'S';
  }

  isLeftKey(e) {
    return e.code === 'KeyA' || e.code === 'ArrowLeft' ||
           e.key === 'a' || e.key === 'A' ||
           e.key === 'â' || e.key === 'Â' ||
           e.key === 'ă' || e.key === 'Ă';
  }

  isRightKey(e) {
    return e.code === 'KeyD' || e.code === 'ArrowRight' ||
           e.key === 'd' || e.key === 'D' ||
           e.key === 'đ' || e.key === 'Đ';
  }

  isUpKey(e) {
    return e.code === 'Space' || e.key === ' ';
  }

  isDownKey(e) {
    return e.code === 'ShiftLeft' || e.code === 'ShiftRight' ||
           e.code === 'KeyC' || e.key === 'c' || e.key === 'C' ||
           e.key === 'Shift';
  }

  initListeners() {
    // Keyboard Controls with Unikey / Vietnamese input immunity
    window.addEventListener('keydown', (e) => {
      // Do not handle WASD if user is typing in chat or modal input
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active !== this.unikeyShield) {
        return;
      }

      if (this.isForwardKey(e)) this.keys.forward = true;
      if (this.isBackwardKey(e)) this.keys.backward = true;
      if (this.isLeftKey(e)) this.keys.left = true;
      if (this.isRightKey(e)) this.keys.right = true;
      if (this.isUpKey(e)) this.keys.up = true;
      if (this.isDownKey(e)) this.keys.down = true;

      // Keep unikey shield clean
      if (this.unikeyShield && this.unikeyShield.value.length > 5) {
        this.unikeyShield.value = '';
      }
    });

    window.addEventListener('keyup', (e) => {
      if (this.isForwardKey(e)) this.keys.forward = false;
      if (this.isBackwardKey(e)) this.keys.backward = false;
      if (this.isLeftKey(e)) this.keys.left = false;
      if (this.isRightKey(e)) this.keys.right = false;
      if (this.isUpKey(e)) this.keys.up = false;
      if (this.isDownKey(e)) this.keys.down = false;
    });

    // Reset all keys on window blur or visibility change to prevent stuck keys
    window.addEventListener('blur', () => this.resetKeys());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.resetKeys();
    });

    // Clear composition buffers from IME (Telex/VNI)
    window.addEventListener('compositionstart', () => {
      if (this.unikeyShield) this.unikeyShield.value = '';
    });
    window.addEventListener('compositionend', () => {
      if (this.unikeyShield) this.unikeyShield.value = '';
    });

    // Pointer Lock change handling
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === document.body;
      if (this.isPointerLocked) {
        this.focusShield();
      } else {
        this.resetKeys();
        this.blurShield();
      }
    });

    // Natural 3D Mouse Look (Mouse Left -> Turn Left, Mouse Right -> Turn Right, Mouse Up -> Look Up, Mouse Down -> Look Down)
    window.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;

      const yawSens = CLIENT_CONFIG.MOUSE_SENSITIVITY * this.aimFriction;
      const pitchSens = (CLIENT_CONFIG.MOUSE_PITCH_SENSITIVITY || (yawSens * 0.5)) * this.aimFriction;
      const xMult = CLIENT_CONFIG.INVERT_MOUSE_X ? -1 : 1;
      const yMult = CLIENT_CONFIG.INVERT_MOUSE_Y ? 1 : -1;
      
      // Horizontal Yaw: Di chuột sang TRÁI (movementX < 0) -> rẽ PHẢI; di sang PHẢI (movementX > 0) -> rẽ TRÁI
      this.mouse.yaw += e.movementX * yawSens * xMult;

      // Vertical Pitch: Moving mouse UP (movementY < 0) looks UP; Mouse DOWN (movementY > 0) looks DOWN (Gentle & Stable)
      this.mouse.pitch -= e.movementY * pitchSens * yMult;
      this.mouse.pitch = Math.max(-Math.PI / 3.2, Math.min(Math.PI / 3.2, this.mouse.pitch));
    });

    // Left Click Shoot
    window.addEventListener('mousedown', (e) => {
      if (this.isPointerLocked && e.button === 0) {
        if (this.onShoot) this.onShoot();
      }
    });
  }

  setAimFriction(friction) {
    this.aimFriction = friction;
  }

  requestLock() {
    if (!this.isPointerLocked) {
      document.body.requestPointerLock();
      this.focusShield();
    }
  }

  exitLock() {
    if (this.isPointerLocked) {
      document.exitPointerLock();
      this.resetKeys();
      this.blurShield();
    }
  }

  getInputPacket() {
    return {
      forward: (this.keys.forward ? 1 : 0) - (this.keys.backward ? 1 : 0),
      // User mapping: A di chuyển phải (+), D di chuyển trái (-)
      right: (this.keys.left ? 1 : 0) - (this.keys.right ? 1 : 0),
      up: (this.keys.up ? 1 : 0) - (this.keys.down ? 1 : 0),
      yaw: this.mouse.yaw,
      pitch: this.mouse.pitch
    };
  }
}
