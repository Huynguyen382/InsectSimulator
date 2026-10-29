const CONFIG = require('../config/gameConfig');
const { getTerrainHeight } = require('../utils/terrain');

class Player {
  constructor(id, name, team, ws = null, isBot = false) {
    this.id = id;
    this.name = name;
    this.team = team; // 0 = Blue, 1 = Red
    this.ws = ws;
    this.isBot = isBot;

    // Spatial State
    const spawn = CONFIG.SPAWN_POINTS[team];
    this.x = spawn.x + (Math.random() - 0.5) * 2.5;
    this.z = spawn.z + (Math.random() - 0.5) * 2.5;
    this.y = getTerrainHeight(this.x, this.z) + 2.0; // Safely elevated inside the forest road
    this.yaw = team === 0 ? 0 : Math.PI; // Blue faces +Z downfield, Red faces -Z downfield
    this.pitch = 0;
    this.roll = 0;

    // Smooth Velocity Kinematics
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;

    // Combat & Vitals
    this.hp = CONFIG.BASE_HP;
    this.maxHp = CONFIG.BASE_HP;
    this.speed = CONFIG.BASE_SPEED;
    this.damage = CONFIG.BASE_DAMAGE;
    this.scale = CONFIG.BASE_SCALE;
    this.ammo = CONFIG.INITIAL_AMMO !== undefined ? CONFIG.INITIAL_AMMO : 20;
    this.maxAmmo = CONFIG.MAX_AMMO;
    this.eatTimeRequired = CONFIG.EAT_TIME_REQUIRED;
    this.eatBonusHeal = 0;
    this.regenMultiplier = 1.0;

    // Combat timers
    this.lastDamageTime = 0;
    this.lastShotTime = 0;
    this.recentDamageDealers = new Map(); // attackerId -> { timestamp, damage }

    // Progression
    this.xp = 0;
    this.level = 1;
    this.xpToNext = 100;

    // Statuses
    this.isDead = false;
    this.respawnTimer = 0;
    this.isEating = false;
    this.eatProgress = 0;
    this.upgradesChosen = [];
    this.pendingUpgradeChoices = null;

    // Food Form Survival Mechanic (Hóa thành thức ăn khi bị tiêu diệt)
    this.isFoodForm = false;
    this.foodFormTimer = 0;
    this.timesEaten = 0;
    this.foodEatImmunityTimer = 0;
    this.lastAttackerId = null;
    this.eatingTargetTimer = 0;

    // Stats for Match Summary / Leaderboard
    this.kills = 0;
    this.deaths = 0;
    this.assists = 0;
    this.damageDealt = 0;
    this.foodEaten = 0;
    this.ping = 0;

    // Inputs (from network or AI)
    this.inputs = { forward: 0, right: 0, up: 0, yaw: this.yaw, pitch: 0 };
  }

  canShoot(nowSec) {
    if (this.isDead || this.isFoodForm || this.ammo <= 0) return false;
    return (nowSec - this.lastShotTime) >= (CONFIG.FIRE_RATE_COOLDOWN || 0.18);
  }

  recordShot(nowSec) {
    this.ammo = Math.max(0, this.ammo - 1);
    this.lastShotTime = nowSec;
  }

  recordDamageDealt(amount) {
    this.damageDealt += amount;
  }

  takeDamage(amount, attackerId = null, nowSec = 0) {
    if (this.isDead || this.isFoodForm) return false;

    this.hp = Math.max(0, this.hp - amount);
    this.lastDamageTime = nowSec;

    if (attackerId && attackerId !== this.id) {
      this.lastAttackerId = attackerId;
      const prev = this.recentDamageDealers.get(attackerId) || { damage: 0 };
      this.recentDamageDealers.set(attackerId, {
        timestamp: nowSec,
        damage: prev.damage + amount
      });
    }

    if (this.hp <= 0) {
      // Khi người chơi bị tiêu diệt: Hóa thành thức ăn, trốn trong 10 giây!
      this.turnIntoFoodForm(nowSec);
      return 'FOOD_FORM';
    }
    return false;
  }

  turnIntoFoodForm(nowSec = 0) {
    this.isFoodForm = true;
    this.foodFormTimer = 10.0; // Đúng chuẩn 10 giây trốn thoát!
    this.timesEaten = 0;
    this.foodEatImmunityTimer = 0;
    this.hp = 1;
    this.ammo = 0;
    this.isEating = false;
    this.eatProgress = 0;
  }

  onEaten(eater, nowSec = 0) {
    if (!this.isFoodForm || this.isDead) return null;

    this.timesEaten++;
    this.foodEatImmunityTimer = 1.8; // Cấp 1.8 giây khiên miễn nhiễm để trốn chạy sau mỗi lần bị đối thủ nạp đạn

    // Thưởng cho đối thủ lại gần nạp đạn: Đầy băng đạn, hồi 35 HP, cộng XP
    if (eater) {
      eater.ammo = eater.maxAmmo;
      eater.hp = Math.min(eater.maxHp, eater.hp + 35);
      eater.foodEaten++;
      eater.addXP(CONFIG.EAT_XP * 2);
    }

    // Nếu bị đối thủ lại gần để nạp đạn quá 3 lần (đạt lần thứ 3 bị nạp đạn): Tính là bị tiêu diệt hoàn toàn, chờ 5s hồi sinh
    if (this.timesEaten >= 3) {
      this.isFoodForm = false;
      this.isDead = true;
      this.respawnTimer = 5.0; // Đúng chuẩn 5 giây chờ hồi sinh
      this.deaths++;
      this.timesEaten = 0;
      this.foodEatImmunityTimer = 0;
      this.hp = 0;
      this.vx = 0;
      this.vy = 0;
      this.vz = 0;
      return 'ELIMINATED';
    } else {
      // Tiếp tục trốn trong thời gian còn lại của 10 giây (không reset đồng hồ!)
      return 'BITTEN';
    }
  }

  revertToFly() {
    this.isFoodForm = false;
    this.foodFormTimer = 0;
    this.timesEaten = 0;
    this.foodEatImmunityTimer = 0;
    this.hp = Math.round(this.maxHp * 0.7); // Hồi phục 70% máu
    this.ammo = this.maxAmmo; // Nạp đầy đạn khi biến lại thành ruồi
    this.recentDamageDealers.clear();
  }

  updateRegen(dt, nowSec) {
    if (this.isDead || this.isFoodForm || this.hp >= this.maxHp) return;

    // Out of combat regeneration
    const timeSinceDamage = nowSec - this.lastDamageTime;
    if (timeSinceDamage >= (CONFIG.OUT_OF_COMBAT_REGEN_DELAY || 5.0)) {
      const heal = (CONFIG.OUT_OF_COMBAT_REGEN_RATE || 4.0) * this.regenMultiplier * dt;
      this.hp = Math.min(this.maxHp, this.hp + heal);
    }
  }

  onEatCompleted() {
    this.ammo = this.maxAmmo;
    const heal = (CONFIG.EAT_HEAL_HP || 35) + this.eatBonusHeal;
    this.hp = Math.min(this.maxHp, this.hp + heal);
    this.foodEaten++;
    this.eatProgress = 0;
    this.isEating = false;
  }

  respawn() {
    const spawn = CONFIG.SPAWN_POINTS[this.team];
    this.x = spawn.x + (Math.random() - 0.5) * 2.5;
    this.z = spawn.z + (Math.random() - 0.5) * 2.5;
    this.y = getTerrainHeight(this.x, this.z) + 2.0;
    this.yaw = this.team === 0 ? 0 : Math.PI;
    this.pitch = 0;
    this.roll = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.hp = this.maxHp;
    this.ammo = CONFIG.INITIAL_AMMO !== undefined ? CONFIG.INITIAL_AMMO : 20;
    this.isDead = false;
    this.respawnTimer = 0;
    this.isFoodForm = false;
    this.foodFormTimer = 0;
    this.timesEaten = 0;
    this.isEating = false;
    this.eatProgress = 0;
    this.recentDamageDealers.clear();
  }

  addXP(amount) {
    this.xp += amount;
    if (this.xp >= this.xpToNext) {
      this.level++;
      this.xp -= this.xpToNext;
      this.xpToNext = Math.floor(this.xpToNext * 1.5);

      const shuffled = [...CONFIG.UPGRADES_POOL].sort(() => 0.5 - Math.random());
      this.pendingUpgradeChoices = shuffled.slice(0, 3);
      return true;
    }
    return false;
  }

  applyUpgrade(upgradeId) {
    if (!this.pendingUpgradeChoices) return;
    const chosen = this.pendingUpgradeChoices.find(u => u.id === upgradeId);
    if (!chosen) return;

    if (chosen.id === 'dmg_up') {
      this.damage = Math.round(this.damage * chosen.mult);
    } else if (chosen.id === 'spd_up') {
      this.speed = parseFloat((this.speed * chosen.mult).toFixed(1));
    } else if (chosen.id === 'hp_up') {
      this.maxHp += chosen.add;
      this.hp = Math.min(this.maxHp, this.hp + chosen.add);
    } else if (chosen.id === 'size_up') {
      this.scale = parseFloat((this.scale * chosen.mult).toFixed(2));
      this.maxHp += chosen.bonusHp;
      this.hp = Math.min(this.maxHp, this.hp + chosen.bonusHp);
    } else if (chosen.id === 'rapid_eat') {
      this.eatTimeRequired = parseFloat((this.eatTimeRequired * chosen.mult).toFixed(2));
      this.eatBonusHeal += chosen.bonusHeal || 20;
    } else if (chosen.id === 'ammo_boost') {
      this.maxAmmo += chosen.add;
    } else if (chosen.id === 'regen_up') {
      this.regenMultiplier *= chosen.mult;
    }

    this.upgradesChosen.push(chosen.id);
    this.pendingUpgradeChoices = null;
  }

  toSnapshot() {
    return {
      id: this.id,
      name: this.name,
      team: this.team,
      isBot: this.isBot,
      x: Math.round(this.x * 100) / 100,
      y: Math.round(this.y * 100) / 100,
      z: Math.round(this.z * 100) / 100,
      vx: Math.round(this.vx * 100) / 100,
      vy: Math.round(this.vy * 100) / 100,
      vz: Math.round(this.vz * 100) / 100,
      yaw: Math.round(this.yaw * 100) / 100,
      pitch: Math.round(this.pitch * 100) / 100,
      roll: Math.round(this.roll * 100) / 100,
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      ammo: this.ammo,
      maxAmmo: this.maxAmmo,
      xp: this.xp,
      xpToNext: this.xpToNext,
      level: this.level,
      isDead: this.isDead,
      respawnTimer: Math.ceil(this.respawnTimer),
      isFoodForm: this.isFoodForm,
      foodFormTimer: Math.round(this.foodFormTimer * 10) / 10,
      timesEaten: this.timesEaten,
      foodEatImmunityTimer: Math.round((this.foodEatImmunityTimer || 0) * 10) / 10,
      isEating: this.isEating,
      eatProgress: Math.round(this.eatProgress * 10) / 10,
      scale: this.scale,
      kills: this.kills,
      deaths: this.deaths,
      assists: this.assists,
      damageDealt: this.damageDealt,
      foodEaten: this.foodEaten,
      ping: this.ping
    };
  }
}

module.exports = Player;
