import * as THREE from 'three';
import { CLIENT_CONFIG } from '../config.js';
import { FOREST_TREES } from '../forestData.js';

export class AimAssist {
  constructor(sceneManager, uiManager, inputController) {
    this.sceneManager = sceneManager;
    this.uiManager = uiManager;
    this.inputController = inputController;
    this.lockedTarget = null;
    this.trees = FOREST_TREES; // Fast 2D math, zero raycast overhead

    // Reusable math vectors to prevent garbage collection allocations in 60fps loop
    this._origin = new THREE.Vector3();
    this._toTarget = new THREE.Vector3();
    this._normTarget = new THREE.Vector3();
    this._bestTarget = new THREE.Vector3();
    this._finalDir = new THREE.Vector3();
  }

  setTrees(trees) {
    if (Array.isArray(trees) && trees.length > 0) {
      this.trees = trees;
    }
  }

  updateAimAssist(myPlayerId, playerVisuals, baseDir, enemyBaseVisual = null) {
    const myVisual = playerVisuals.get(myPlayerId);
    if (!myVisual) {
      this.lockedTarget = null;
      if (this.inputController) this.inputController.setAimFriction(1.0);
      this.uiManager.setCrosshairLocked(false);
      this._finalDir.copy(baseDir);
      return this._finalDir;
    }

    let foundTarget = false;
    let bestVisual = null;
    let minScore = Infinity;
    const maxAngle = (CLIENT_CONFIG.AIM_ASSIST_CONE_DEG * Math.PI) / 180;

    this._origin.copy(myVisual.position);
    this._origin.y += 0.3;

    for (const [id, visual] of playerVisuals.entries()) {
      if (id === myPlayerId || !visual.visible) continue;
      if (visual.userData.team === myVisual.userData.team) continue;

      this._toTarget.subVectors(visual.position, this._origin);
      const dist = this._toTarget.length();
      if (dist > CLIENT_CONFIG.AIM_ASSIST_MAX_DIST || dist < 0.5) continue;

      this._normTarget.copy(this._toTarget).divideScalar(dist);
      const angle = baseDir.angleTo(this._normTarget);

      if (angle < maxAngle) {
        // High-performance 2D Circle Line-of-Sight check (runs in 0.002ms, 0 GC!)
        if (this.hasLineOfSight2D(this._origin.x, this._origin.z, visual.position.x, visual.position.z)) {
          const score = (angle / maxAngle) * 0.7 + (dist / CLIENT_CONFIG.AIM_ASSIST_MAX_DIST) * 0.3;
          if (score < minScore) {
            minScore = score;
            this._bestTarget.copy(this._normTarget);
            bestVisual = visual;
            foundTarget = true;
          }
        }
      }
    }

    // Secondary target lock: Enemy Base Outpost
    if (!foundTarget && enemyBaseVisual && (enemyBaseVisual.userData?.hp || 0) > 0) {
      const basePos = enemyBaseVisual.position;
      const baseCenter = new THREE.Vector3(basePos.x, basePos.y + 1.8, basePos.z);
      this._toTarget.subVectors(baseCenter, this._origin);
      const dist = this._toTarget.length();
      if (dist <= CLIENT_CONFIG.AIM_ASSIST_MAX_DIST) {
        this._normTarget.copy(this._toTarget).divideScalar(dist);
        const angle = baseDir.angleTo(this._normTarget);
        if (angle < maxAngle) {
          foundTarget = true;
          bestVisual = enemyBaseVisual;
          this._bestTarget.copy(this._normTarget);
        }
      }
    }

    if (foundTarget && bestVisual) {
      this.lockedTarget = bestVisual;

      // 1. Camera Friction: Slow down mouse sensitivity by 35%
      if (this.inputController) {
        this.inputController.setAimFriction(CLIENT_CONFIG.AIM_ASSIST_FRICTION);

        // 2. Smooth Sticky Pull towards target
        const targetYaw = Math.atan2(this._bestTarget.x, this._bestTarget.z);
        const targetPitch = Math.asin(Math.max(-1, Math.min(1, this._bestTarget.y)));

        let yawDiff = targetYaw - this.inputController.mouse.yaw;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;

        this.inputController.mouse.yaw += yawDiff * CLIENT_CONFIG.AIM_ASSIST_STICKY_PULL;
        this.inputController.mouse.pitch += (targetPitch - this.inputController.mouse.pitch) * CLIENT_CONFIG.AIM_ASSIST_STICKY_PULL;
      }

      this.uiManager.setCrosshairLocked(true);

      // 3. Smart Bullet Homing (45% blend)
      this._finalDir.copy(baseDir).lerp(this._bestTarget, CLIENT_CONFIG.AIM_ASSIST_STRENGTH).normalize();
      return this._finalDir;
    } else {
      this.lockedTarget = null;
      if (this.inputController) {
        this.inputController.setAimFriction(1.0);
      }
      this.uiManager.setCrosshairLocked(false);
      this._finalDir.copy(baseDir);
      return this._finalDir;
    }
  }

  // Fast analytical Line-of-sight check against 85 tree trunks
  hasLineOfSight2D(x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const lenSq = dx * dx + dz * dz;
    if (lenSq === 0) return true;

    for (let i = 0; i < this.trees.length; i++) {
      const tree = this.trees[i];
      const t = Math.max(0, Math.min(1, ((tree.x - x1) * dx + (tree.z - z1) * dz) / lenSq));
      const closeX = x1 + t * dx;
      const closeZ = z1 + t * dz;
      const distSq = (tree.x - closeX) * (tree.x - closeX) + (tree.z - closeZ) * (tree.z - closeZ);
      if (distSq < tree.radius * tree.radius) {
        return false;
      }
    }
    return true;
  }
}
