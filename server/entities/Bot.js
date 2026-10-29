const Player = require('./Player');
const CONFIG = require('../config/gameConfig');
const { getTerrainHeight } = require('../utils/terrain');

class Bot extends Player {
  constructor(id, name, team) {
    super(id, name, team, null, true);
    this.shootCooldown = 0.8 + Math.random() * 1.5;
    this.decisionTimer = 0;
    this.patrolAngle = Math.random() * Math.PI * 2;
    this.evasiveTimer = 0;
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
  }

  updateAI(dt, room) {
    if (this.isDead) return;

    const nowSec = Date.now() / 1000;

    // 1. Auto-select upgrades when leveling up
    if (this.pendingUpgradeChoices && this.pendingUpgradeChoices.length > 0) {
      const pick = this.pendingUpgradeChoices[Math.floor(Math.random() * this.pendingUpgradeChoices.length)];
      this.applyUpgrade(pick.id);
    }

    this.decisionTimer -= dt;
    this.shootCooldown -= dt;
    this.evasiveTimer -= dt;

    // Nếu Bot đang ở dạng Thức Ăn (isFoodForm): Chạy trốn khỏi kẻ địch!
    if (this.isFoodForm) {
      this.evadeAsFood(room);
      this.avoidObstacles(room);
      return;
    }

    // 2. State selection:
    // Ưu tiên cao: Săn lùng kẻ địch đang ở dạng thức ăn để ngoạm ăn!
    let foodEnemy = null;
    let minFoodDist = Infinity;
    for (const other of room.players.values()) {
      if (other.isDead || !other.isFoodForm || other.team === this.team) continue;
      const d = Math.hypot(other.x - this.x, other.y - this.y, other.z - this.z);
      if (d < minFoodDist && d < 45.0) {
        minFoodDist = d;
        foodEnemy = other;
      }
    }

    // Need recovery if out of ammo OR critically low HP (< 40%)
    const needsFood = this.ammo <= 0 || (this.hp < this.maxHp * 0.45 && this.ammo < (this.maxAmmo * 0.4));

    // Evasive state if taking recent damage
    const recentlyDamaged = (nowSec - this.lastDamageTime) < 2.2;

    // Base Outposts information
    const friendlyBase = room.bases ? (this.team === 0 ? room.bases.blue : room.bases.red) : null;
    const enemyBase = room.bases ? (this.team === 0 ? room.bases.red : room.bases.blue) : null;

    // Check if friendly base is threatened by enemies within 18m
    let baseThreatEnemy = null;
    let minBaseThreatDist = Infinity;
    if (friendlyBase && friendlyBase.hp > 0) {
      for (const other of room.players.values()) {
        if (other.isDead || other.team === this.team) continue;
        const dToBase = Math.hypot(other.x - friendlyBase.x, other.z - friendlyBase.z);
        if (dToBase < 18.0 && dToBase < minBaseThreatDist) {
          minBaseThreatDist = dToBase;
          baseThreatEnemy = other;
        }
      }
    }

    const distToEnemyBase = enemyBase ? Math.hypot(this.x - enemyBase.x, this.z - enemyBase.z) : Infinity;

    if (foodEnemy) {
      this.huntFoodEnemy(foodEnemy, room, nowSec);
    } else if (needsFood) {
      this.seekFood(room);
    } else if (recentlyDamaged && this.evasiveTimer <= 0) {
      this.performEvasiveManeuver(room);
    } else if (baseThreatEnemy && this.ammo > 0) {
      // Defend friendly base against intruders!
      this.engageSpecificTarget(baseThreatEnemy, room, nowSec);
    } else if (enemyBase && enemyBase.hp > 0 && this.ammo > 0 && (distToEnemyBase < 25.0 || Math.random() < 0.35)) {
      // Assault & bombard enemy outpost!
      this.assaultEnemyBase(enemyBase, room, nowSec);
    } else {
      this.engageEnemy(room, nowSec);
    }

    // 3. Tree proximity obstacle avoidance
    this.avoidObstacles(room);
  }

  assaultEnemyBase(enemyBase, room, nowSec) {
    const targetY = enemyBase.y + 2.2;
    const dist = Math.hypot(this.x - enemyBase.x, this.z - enemyBase.z);

    const targetPos = {
      x: enemyBase.x,
      y: targetY,
      z: enemyBase.z
    };

    this.steerTowards(targetPos, 0.85);

    // Maintain optimal bombing distance (9m to 16m)
    if (dist < 9.0) {
      this.inputs.forward = -0.4;
      this.inputs.right = this.strafeDir * 0.5;
    } else if (dist > 18.0) {
      this.inputs.forward = 0.95;
    } else {
      this.inputs.forward = 0.3;
      this.inputs.right = this.strafeDir * 0.4;
    }

    // Fire at enemy base core
    if (dist <= 22.0 && this.shootCooldown <= 0 && this.ammo > 0 && this.canShoot(nowSec)) {
      this.shootCooldown = 0.5 + Math.random() * 0.5;
      const targetBaseCenter = { x: enemyBase.x, y: enemyBase.y + 1.8, z: enemyBase.z };
      const aimMag = Math.hypot(targetBaseCenter.x - this.x, targetBaseCenter.y - this.y, targetBaseCenter.z - this.z) || 1;
      const aimDir = {
        x: (targetBaseCenter.x - this.x) / aimMag + (Math.random() - 0.5) * 0.04,
        y: (targetBaseCenter.y - this.y) / aimMag + (Math.random() - 0.5) * 0.04,
        z: (targetBaseCenter.z - this.z) / aimMag + (Math.random() - 0.5) * 0.04
      };
      room.handleShoot(this.id, aimDir);
    }
  }

  engageSpecificTarget(target, room, nowSec) {
    const d = Math.hypot(target.x - this.x, target.y - this.y, target.z - this.z);
    const bulletSpeed = CONFIG.PROJECTILE_SPEED || 52.0;
    const flightTime = Math.min(1.0, d / bulletSpeed);
    const predictedX = target.x + (target.vx || 0) * flightTime * 0.75;
    const predictedY = target.y + (target.vy || 0) * flightTime * 0.75;
    const predictedZ = target.z + (target.vz || 0) * flightTime * 0.75;

    const targetPos = { x: predictedX, y: Math.max(1.8, predictedY), z: predictedZ };
    this.steerTowards(targetPos, 0.85);

    if (d < 10.0) {
      this.inputs.forward = -0.4;
      this.inputs.right = this.strafeDir * 0.5;
    } else if (d > 26.0) {
      this.inputs.forward = 1.0;
    } else {
      this.inputs.forward = 0.5;
      this.inputs.right = this.strafeDir * 0.3;
    }

    if (d <= (CONFIG.BOT_ENGAGEMENT_RANGE || 32.0) && room.hasLineOfSight(this, target)) {
      if (this.shootCooldown <= 0 && this.ammo > 0 && this.canShoot(nowSec)) {
        this.shootCooldown = 0.55 + Math.random() * 0.65;
        const spread = 0.035;
        const aimMag = Math.hypot(predictedX - this.x, predictedY - this.y, predictedZ - this.z) || 1;
        const aimDir = {
          x: (predictedX - this.x) / aimMag + (Math.random() - 0.5) * spread,
          y: (predictedY - this.y) / aimMag + (Math.random() - 0.5) * spread,
          z: (predictedZ - this.z) / aimMag + (Math.random() - 0.5) * spread
        };
        room.handleShoot(this.id, aimDir);
      }
    }
  }

  evadeAsFood(room) {
    let nearestThreat = null;
    let minThreatDist = Infinity;

    for (const other of room.players.values()) {
      if (other.isDead || other.isFoodForm || other.team === this.team) continue;
      const d = Math.hypot(other.x - this.x, other.y - this.y, other.z - this.z);
      if (d < minThreatDist) {
        minThreatDist = d;
        nearestThreat = other;
      }
    }

    if (nearestThreat && minThreatDist < 35.0) {
      // Bay ngược hướng với kẻ địch nguy hiểm nhất
      const awayX = this.x - nearestThreat.x;
      const awayZ = this.z - nearestThreat.z;
      const len = Math.hypot(awayX, awayZ) || 1;
      const escapeX = Math.max(CONFIG.BOUNDS.minX + 3, Math.min(CONFIG.BOUNDS.maxX - 3, this.x + (awayX / len) * 20.0));
      const escapeZ = Math.max(CONFIG.BOUNDS.minZ + 3, Math.min(CONFIG.BOUNDS.maxZ - 3, this.z + (awayZ / len) * 20.0));
      const groundY = getTerrainHeight(escapeX, escapeZ);
      const targetPos = { x: escapeX, y: groundY + 2.5, z: escapeZ };
      this.steerTowards(targetPos, 1.0);
    } else {
      // Lượn trốn trong cánh rừng
      this.patrolForestRoad();
    }
  }

  huntFoodEnemy(foodEnemy, room, nowSec) {
    const targetPos = { x: foodEnemy.x, y: foodEnemy.y, z: foodEnemy.z };
    // Bay thẳng áp sát kẻ địch dạng thức ăn để nạp đạn (cự ly cận chiến <= 2.4m)
    this.steerTowards(targetPos, 1.0);
    this.inputs.forward = 1.0;
    // Tuyệt đối không bắn súng vào thức ăn: đối thủ bắt buộc phải lại gần để nạp đạn!
  }

  seekFood(room) {
    let closestFood = null;
    let minDist = Infinity;

    for (const food of room.foodSpots) {
      if (!food.active) continue;
      const d = Math.hypot(food.x - this.x, food.z - this.z);
      if (d < minDist) {
        minDist = d;
        closestFood = food;
      }
    }

    if (closestFood) {
      const targetPos = {
        x: closestFood.x,
        y: closestFood.y + 0.6,
        z: closestFood.z
      };
      this.steerTowards(targetPos, 0.95);

      const d = Math.hypot(closestFood.x - this.x, closestFood.y - this.y, closestFood.z - this.z);
      if (d <= 3.2) {
        this.inputs.forward = 0;
        this.inputs.right = 0;
        this.inputs.up = -0.3;
      }
    } else {
      this.patrolForestRoad();
    }
  }

  performEvasiveManeuver(room) {
    this.evasiveTimer = 1.2 + Math.random() * 0.8;
    this.strafeDir = -this.strafeDir;
    this.inputs.right = this.strafeDir * 0.9;
    this.inputs.up = (Math.random() - 0.5) * 1.5;
  }

  engageEnemy(room, nowSec) {
    let bestTarget = null;
    let bestScore = -Infinity;

    for (const other of room.players.values()) {
      if (other.isDead || other.team === this.team) continue;
      const d = Math.hypot(other.x - this.x, other.y - this.y, other.z - this.z);

      // Prioritize low-HP enemies and closer targets
      const hpFactor = (other.maxHp - other.hp) / other.maxHp;
      const distFactor = Math.max(0, 1 - d / 50);
      const score = distFactor * 2.0 + hpFactor * 1.5;

      if (score > bestScore) {
        bestScore = score;
        bestTarget = other;
      }
    }

    if (bestTarget) {
      const d = Math.hypot(bestTarget.x - this.x, bestTarget.y - this.y, bestTarget.z - this.z);

      // Lead aiming calculation: predict where target will be
      const bulletSpeed = CONFIG.PROJECTILE_SPEED || 52.0;
      const flightTime = Math.min(1.0, d / bulletSpeed);
      const predictedX = bestTarget.x + (bestTarget.vx || 0) * flightTime * 0.75;
      const predictedY = bestTarget.y + (bestTarget.vy || 0) * flightTime * 0.75;
      const predictedZ = bestTarget.z + (bestTarget.vz || 0) * flightTime * 0.75;

      const targetPos = { x: predictedX, y: Math.max(1.8, predictedY), z: predictedZ };
      this.steerTowards(targetPos, 0.85);

      // Distance control in dogfights
      if (d < 10.0) {
        this.inputs.forward = -0.4; // Back off slightly
        this.inputs.right = this.strafeDir * 0.5; // Circle strafe
      } else if (d > 26.0) {
        this.inputs.forward = 1.0;  // Close distance
      } else {
        this.inputs.forward = 0.5;
        this.inputs.right = this.strafeDir * 0.3;
      }

      // Check combat range and line of sight before pulling trigger
      if (d <= (CONFIG.BOT_ENGAGEMENT_RANGE || 32.0) && room.hasLineOfSight(this, bestTarget)) {
        if (this.shootCooldown <= 0 && this.ammo > 0 && this.canShoot(nowSec)) {
          this.shootCooldown = 0.55 + Math.random() * 0.65;

          // Controlled human-like spread
          const spread = 0.035;
          const aimMag = Math.hypot(predictedX - this.x, predictedY - this.y, predictedZ - this.z) || 1;
          const aimDir = {
            x: (predictedX - this.x) / aimMag + (Math.random() - 0.5) * spread,
            y: (predictedY - this.y) / aimMag + (Math.random() - 0.5) * spread,
            z: (predictedZ - this.z) / aimMag + (Math.random() - 0.5) * spread
          };

          room.handleShoot(this.id, aimDir);
        }
      }
    } else {
      this.patrolForestRoad();
    }
  }

  avoidObstacles(room) {
    if (!room.treeObstacles) return;

    for (const tree of room.treeObstacles) {
      const dist = Math.hypot(this.x - tree.x, this.z - tree.z);
      if (dist < tree.radius + 3.0 && this.y < tree.height) {
        // Push steering direction perpendicular or away from tree
        const pushX = this.x - tree.x;
        const pushZ = this.z - tree.z;
        const angle = Math.atan2(pushX, pushZ);
        this.inputs.yaw = angle;
        this.inputs.up = 0.5; // Gain altitude to clear tree trunk
        break;
      }
    }
  }

  steerTowards(targetPos, desiredForward = 1.0) {
    const dx = targetPos.x - this.x;
    const dy = targetPos.y - this.y;
    const dz = targetPos.z - this.z;

    this.yaw = Math.atan2(dx, dz);
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));

    this.inputs.forward = desiredForward;
    this.inputs.yaw = this.yaw;
    this.inputs.pitch = this.pitch;

    if (dy > 0.8) this.inputs.up = 0.75;
    else if (dy < -0.8) this.inputs.up = -0.75;
    else this.inputs.up = 0;
  }

  patrolForestRoad() {
    this.patrolAngle += 0.025;
    // Weave gently along the forest road (Z: -22 to +22, X: -8 to +8)
    const targetX = Math.sin(this.patrolAngle) * 8.0;
    const targetZ = Math.cos(this.patrolAngle * 0.5) * 22.0;
    const groundY = getTerrainHeight(targetX, targetZ);
    this.steerTowards({ x: targetX, y: groundY + 3.0, z: targetZ }, 0.7);
  }
}

module.exports = Bot;
