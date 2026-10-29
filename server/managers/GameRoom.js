const { WebSocket } = require('ws');
const CONFIG = require('../config/gameConfig');
const Bot = require('../entities/Bot');
const { getTerrainHeight } = require('../utils/terrain');
const TreeSpatialGrid = require('../utils/TreeSpatialGrid');

// Shared static tree spatial grid across all 100 players / all rooms (Zero memory duplication)
const sharedTreeGrid = new TreeSpatialGrid(CONFIG.TREE_OBSTACLES, 12.0);

class GameRoom {
  constructor(id, playersList, isPractice = false, onDestroy = null) {
    this.id = id;
    this.isPractice = isPractice;
    this.onDestroy = onDestroy;
    this.players = new Map();
    this.projectiles = [];
    this.foodSpots = JSON.parse(JSON.stringify(CONFIG.FOOD_SPOTS));
    this.treeObstacles = CONFIG.TREE_OBSTACLES;
    this.treeGrid = sharedTreeGrid;
    this.teamScores = { blue: 0, red: 0 };
    this.state = 'playing'; // 'playing' | 'ended'
    this.dt = 1 / CONFIG.TICK_RATE;
    this.nextProjectileId = 1;

    // Cứ Điểm (Outposts / Bases)
    this.bases = {
      blue: {
        id: 'base_blue',
        name: CONFIG.BASES.blue.name,
        team: 0,
        x: CONFIG.BASES.blue.x,
        y: CONFIG.BASES.blue.y,
        z: CONFIG.BASES.blue.z,
        hp: CONFIG.BASE_MAX_HP,
        maxHp: CONFIG.BASE_MAX_HP,
        radius: CONFIG.BASE_HITBOX_RADIUS
      },
      red: {
        id: 'base_red',
        name: CONFIG.BASES.red.name,
        team: 1,
        x: CONFIG.BASES.red.x,
        y: CONFIG.BASES.red.y,
        z: CONFIG.BASES.red.z,
        hp: CONFIG.BASE_MAX_HP,
        maxHp: CONFIG.BASE_MAX_HP,
        radius: CONFIG.BASE_HITBOX_RADIUS
      }
    };

    // Match Timing & Win Conditions
    this.matchDuration = CONFIG.MATCH_DURATION_SEC || 300;
    this.matchTimeRemaining = this.matchDuration;
    this.targetScore = CONFIG.WIN_SCORE || 15;
    this.matchEndTimer = 0;
    this.returnCountdown = CONFIG.MATCH_END_DELAY_SEC || 10;
    this.winnerTeam = null;

    // In-game Chat History
    this.chatLog = [];

    playersList.forEach(p => {
      this.players.set(p.id, p);
    });

    this.interval = setInterval(() => this.tick(), 1000 / CONFIG.TICK_RATE);
  }

  tick() {
    const nowSec = Date.now() / 1000;

    // --- STATE 1: MATCH ENDED (COUNTDOWN TO LOBBY) ---
    if (this.state === 'ended') {
      this.matchEndTimer += this.dt;
      this.returnCountdown = Math.max(0, Math.ceil((CONFIG.MATCH_END_DELAY_SEC || 10) - this.matchEndTimer));

      // Broadcast final snapshot with countdown
      this.broadcastSnapshot();

      if (this.returnCountdown <= 0) {
        this.broadcast({ type: 'RETURN_TO_LOBBY' });
        this.destroy();
        if (this.onDestroy) this.onDestroy(this.id);
      }
      return;
    }

    // --- STATE 2: ACTIVE PLAYING ---

    // 1. Update Match Timer & Check Win Conditions (Destroy Enemy Base / Win Score / Time Up)
    this.matchTimeRemaining = Math.max(0, this.matchTimeRemaining - this.dt);

    if (
      this.bases.blue.hp <= 0 ||
      this.bases.red.hp <= 0 ||
      this.teamScores.blue >= this.targetScore ||
      this.teamScores.red >= this.targetScore ||
      this.matchTimeRemaining <= 0
    ) {
      if (this.bases.blue.hp <= 0) {
        this.endMatch('BASE_DESTROYED', 1);
      } else if (this.bases.red.hp <= 0) {
        this.endMatch('BASE_DESTROYED', 0);
      } else {
        this.endMatch(this.matchTimeRemaining <= 0 ? 'TIME_UP' : 'SCORE_REACHED');
      }
      return;
    }

    // 2. Update AI Bots
    for (const player of this.players.values()) {
      if (player instanceof Bot) {
        player.updateAI(this.dt, this);
      }
    }

    // 3. Update Food spots: Despawn expired food & Respawn new food inside forest
    for (const food of this.foodSpots) {
      if (food.active) {
        food.lifetime -= this.dt;
        if (food.lifetime <= 0) {
          food.active = false;
          food.lifetime = 0;
          food.respawnTimer = CONFIG.FOOD_RESPAWN_TIME;
        }
      } else {
        food.respawnTimer -= this.dt;
        if (food.respawnTimer <= 0) {
          food.active = true;
          food.lifetime = CONFIG.FOOD_LIFESPAN;
          food.respawnTimer = 0;
          // Strictly keep food within forest borders & ground surface
          food.x = Math.max(CONFIG.BOUNDS.minX + 2.0, Math.min(CONFIG.BOUNDS.maxX - 2.0, food.x));
          food.z = Math.max(CONFIG.BOUNDS.minZ + 2.0, Math.min(CONFIG.BOUNDS.maxZ - 2.0, food.z));
          food.y = parseFloat((getTerrainHeight(food.x, food.z) + 0.1).toFixed(2));
        }
      }
    }

    // 4. Update Players (Kinematics, Collisions, Eating, Out-of-combat Regen)
    for (const player of this.players.values()) {
      if (player.isDead) {
        player.respawnTimer -= this.dt;
        if (player.respawnTimer <= 0) {
          player.respawn();
          this.broadcast({
            type: 'PLAYER_RESPAWNED',
            id: player.id,
            name: player.name,
            team: player.team
          });
        }
        continue;
      }

      // 10-Second Food Form Survival countdown (Trốn thoát sau 10s sẽ trở lại làm ruồi)
      if (player.isFoodForm && !player.isDead) {
        player.foodFormTimer -= this.dt;
        if (player.foodEatImmunityTimer > 0) {
          player.foodEatImmunityTimer -= this.dt;
        }

        if (player.foodFormTimer <= 0) {
          player.revertToFly();
          this.broadcast({
            type: 'PLAYER_REVIVED',
            id: player.id,
            name: player.name,
            team: player.team,
            hp: player.hp,
            ammo: player.ammo,
            message: `${player.name} đã trốn thoát thành công 10s và hóa lại thành ruồi!`
          });
        }
      }

      // Out-of-combat health regeneration
      player.updateRegen(this.dt, nowSec);

      // Input directions
      player.yaw = player.inputs.yaw || 0;
      player.pitch = player.inputs.pitch || 0;

      const cosYaw = Math.cos(player.yaw);
      const sinYaw = Math.sin(player.yaw);
      const cosPitch = Math.cos(player.pitch);
      const sinPitch = Math.sin(player.pitch);

      const forward = Math.max(-1, Math.min(1, player.inputs.forward || 0));
      const strafe = Math.max(-1, Math.min(1, player.inputs.right || 0));
      const vertical = Math.max(-1, Math.min(1, player.inputs.up || 0));

      // 3D forward vector
      const fwdX = sinYaw * cosPitch;
      const fwdY = sinPitch * 0.9;
      const fwdZ = cosYaw * cosPitch;

      // Strafe vector
      const strX = cosYaw;
      const strZ = -sinYaw;

      // Desired velocity
      const targetVx = (fwdX * forward + strX * strafe) * player.speed;
      const targetVy = (fwdY * forward + vertical) * (player.speed * 0.85);
      const targetVz = (fwdZ * forward + strZ * strafe) * player.speed;

      // Smooth inertia
      const smoothFactor = 0.22;
      player.vx += (targetVx - player.vx) * smoothFactor;
      player.vy += (targetVy - player.vy) * smoothFactor;
      player.vz += (targetVz - player.vz) * smoothFactor;

      // Banking roll into turns
      const targetRoll = -strafe * 0.35;
      player.roll += (targetRoll - player.roll) * 0.15;

      // Integrate position
      let newX = player.x + player.vx * this.dt;
      let newY = player.y + player.vy * this.dt;
      let newZ = player.z + player.vz * this.dt;

      // Authoritative human prediction validation (eliminates ping rubberbanding)
      if (!player.isBot && player.inputs && typeof player.inputs.x === 'number') {
        newX = Math.max(CONFIG.BOUNDS.minX, Math.min(CONFIG.BOUNDS.maxX, player.inputs.x));
        newZ = Math.max(CONFIG.BOUNDS.minZ, Math.min(CONFIG.BOUNDS.maxZ, player.inputs.z));
        const gh = getTerrainHeight(newX, newZ);
        newY = Math.max(gh + CONFIG.BOUNDS.hoverAboveGround * player.scale, Math.min(gh + CONFIG.BOUNDS.maxHeightAboveGround, player.inputs.y));

        if (typeof player.inputs.vx === 'number') player.vx = player.inputs.vx;
        if (typeof player.inputs.vy === 'number') player.vy = player.inputs.vy;
        if (typeof player.inputs.vz === 'number') player.vz = player.inputs.vz;
      }

      // Real Tree trunk cylinder collisions via spatial grid (1-3 trees instead of 83!)
      const nearbyTrees = this.treeGrid.getNearbyTrees(newX, newZ, 2.5 * player.scale);
      for (let t = 0; t < nearbyTrees.length; t++) {
        const tree = nearbyTrees[t];
        const dist = Math.hypot(newX - tree.x, newZ - tree.z);
        const minDist = tree.radius + (0.5 * player.scale);
        if (dist < minDist && newY < tree.height) {
          const pushAngle = Math.atan2(newZ - tree.z, newX - tree.x);
          newX = tree.x + Math.cos(pushAngle) * minDist;
          newZ = tree.z + Math.sin(pushAngle) * minDist;

          // Tangential sliding instead of sudden stop
          const normX = Math.cos(pushAngle);
          const normZ = Math.sin(pushAngle);
          const dot = player.vx * normX + player.vz * normZ;
          if (dot < 0) {
            player.vx -= dot * normX;
            player.vz -= dot * normZ;
          }
        }
      }

      // Arena boundaries (Strictly inside 72m x 72m forest perimeter)
      if (newX >= CONFIG.BOUNDS.maxX) {
        newX = CONFIG.BOUNDS.maxX;
        player.vx = Math.min(0, player.vx);
      } else if (newX <= CONFIG.BOUNDS.minX) {
        newX = CONFIG.BOUNDS.minX;
        player.vx = Math.max(0, player.vx);
      }

      if (newZ >= CONFIG.BOUNDS.maxZ) {
        newZ = CONFIG.BOUNDS.maxZ;
        player.vz = Math.min(0, player.vz);
      } else if (newZ <= CONFIG.BOUNDS.minZ) {
        newZ = CONFIG.BOUNDS.minZ;
        player.vz = Math.max(0, player.vz);
      }

      // Dynamic terrain height clamping (Never clips through forest floor or over canopy)
      const groundHeight = getTerrainHeight(newX, newZ);
      const minHoverY = groundHeight + CONFIG.BOUNDS.hoverAboveGround * player.scale;
      const maxCanopyY = groundHeight + CONFIG.BOUNDS.maxHeightAboveGround;

      if (newY < minHoverY) {
        newY = minHoverY;
        player.vy = Math.max(0, player.vy);
      } else if (newY > maxCanopyY) {
        newY = maxCanopyY;
        player.vy = Math.min(0, player.vy);
      }

      player.x = newX;
      player.y = newY;
      player.z = newZ;

      // Eating logic at active food spots (chỉ ruồi còn sống bình thường mới ăn được thức ăn bãi)
      let nearActiveFood = false;
      if (!player.isFoodForm) {
        for (const food of this.foodSpots) {
          if (!food.active) continue;
          const d = Math.hypot(player.x - food.x, player.y - food.y, player.z - food.z);
          const eatRadius = 3.8 * player.scale;

          if (d <= eatRadius) {
            nearActiveFood = true;
            player.isEating = true;
            player.eatProgress += this.dt;

            const requiredTime = player.eatTimeRequired || CONFIG.EAT_TIME_REQUIRED;
            if (player.eatProgress >= requiredTime) {
              // Eating complete: Restores ammo, heals HP, increments food stat!
              player.onEatCompleted();

              food.active = false;
              food.lifetime = 0;
              food.respawnTimer = CONFIG.FOOD_RESPAWN_TIME;

              const leveledUp = player.addXP(CONFIG.EAT_XP);
              if (leveledUp && !player.isBot) {
                this.sendToPlayer(player.id, {
                  type: 'LEVEL_UP',
                  level: player.level,
                  choices: player.pendingUpgradeChoices
                });
              }
            }
            break;
          }
        }
      }

      if (!nearActiveFood) {
        player.isEating = false;
        player.eatProgress = Math.max(0, player.eatProgress - this.dt * 1.5);
      }
    }

    // 4b. Kiểm tra đối thủ lại gần để nạp đạn từ người chơi dạng thức ăn (trong bán kính 2.4m)
    for (const eater of this.players.values()) {
      if (eater.isDead || eater.isFoodForm) continue;

      for (const foodPlayer of this.players.values()) {
        if (foodPlayer.isDead || !foodPlayer.isFoodForm || foodPlayer.team === eater.team) continue;

        // Nếu người chơi dạng thức ăn đang có khiên miễn nhiễm tẩu thoát -> không thể nạp tiếp
        if ((foodPlayer.foodEatImmunityTimer || 0) > 0) continue;

        const dist = Math.hypot(eater.x - foodPlayer.x, eater.y - foodPlayer.y, eater.z - foodPlayer.z);
        if (dist <= 2.4) {
          this.handleFoodPlayerReloaded(foodPlayer, eater, nowSec);
        }
      }
    }

    // 5. Update Projectiles with Terrain & Player Collision
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.life -= this.dt;
      if (proj.life <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      proj.x += proj.vx * this.dt;
      proj.y += proj.vy * this.dt;
      proj.z += proj.vz * this.dt;

      // Bound check for projectiles
      if (
        proj.x < CONFIG.BOUNDS.minX - 4.0 || proj.x > CONFIG.BOUNDS.maxX + 4.0 ||
        proj.z < CONFIG.BOUNDS.minZ - 4.0 || proj.z > CONFIG.BOUNDS.maxZ + 4.0
      ) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Terrain surface collision check
      const terrainY = getTerrainHeight(proj.x, proj.z);
      if (proj.y <= terrainY + 0.1 || proj.y > terrainY + 22.0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Tree trunk collision check via spatial grid
      let hitTree = false;
      const nearbyTrees = this.treeGrid.getNearbyTrees(proj.x, proj.z, 1.2);
      for (let t = 0; t < nearbyTrees.length; t++) {
        const tree = nearbyTrees[t];
        const d = Math.hypot(proj.x - tree.x, proj.z - tree.z);
        if (d <= tree.radius && proj.y < tree.height) {
          hitTree = true;
          break;
        }
      }
      if (hitTree) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Base collision check (Friendly Fire OFF, Bullets pass friendly base and damage enemy base)
      let hitBase = false;
      for (const baseKey of ['blue', 'red']) {
        const base = this.bases[baseKey];
        if (base.hp <= 0 || base.team === proj.team) continue;

        // Base center target is elevated by 1.8m from ground
        const dist = Math.hypot(proj.x - base.x, proj.y - (base.y + 1.8), proj.z - base.z);
        if (dist <= base.radius) {
          hitBase = true;
          base.hp = Math.max(0, base.hp - proj.damage);
          const shooter = this.players.get(proj.ownerId);
          if (shooter) {
            shooter.recordDamageDealt(proj.damage);
            const leveledUp = shooter.addXP(Math.round(proj.damage * 0.8));
            if (leveledUp && !shooter.isBot) {
              this.sendToPlayer(shooter.id, {
                type: 'LEVEL_UP',
                level: shooter.level,
                choices: shooter.pendingUpgradeChoices
              });
            }
          }

          this.broadcast({
            type: 'BASE_HIT',
            baseKey: baseKey,
            team: base.team,
            damage: proj.damage,
            hp: Math.round(base.hp),
            maxHp: base.maxHp,
            attackerId: proj.ownerId,
            attackerName: shooter ? shooter.name : 'Unknown'
          });

          if (base.hp <= 0) {
            const winningTeam = base.team === 0 ? 1 : 0;
            this.broadcast({
              type: 'BASE_DESTROYED',
              destroyedTeam: base.team,
              winnerTeam: winningTeam,
              attackerId: proj.ownerId,
              attackerName: shooter ? shooter.name : 'Unknown'
            });
            this.endMatch('BASE_DESTROYED', winningTeam);
            return;
          }
          break;
        }
      }

      if (hitBase) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Player collision check (Friendly Fire OFF, Bullets pass through food-form players!)
      let hitPlayer = false;
      for (const target of this.players.values()) {
        if (target.isDead || target.isFoodForm || target.team === proj.team) continue;

        const dist = Math.hypot(proj.x - target.x, proj.y - target.y, proj.z - target.z);
        const targetHitbox = CONFIG.HITBOX_RADIUS * target.scale;

        if (dist <= targetHitbox) {
          hitPlayer = true;
          const shooter = this.players.get(proj.ownerId);

          const hitResult = target.takeDamage(proj.damage, proj.ownerId, nowSec);
          if (shooter) {
            shooter.recordDamageDealt(proj.damage);
          }

          this.broadcast({
            type: 'PLAYER_HIT',
            targetId: target.id,
            shooterId: proj.ownerId,
            damage: proj.damage,
            currentHp: Math.round(target.hp)
          });

          if (hitResult === 'FOOD_FORM') {
            if (shooter) {
              shooter.addXP(40);
            }
            this.broadcast({
              type: 'PLAYER_TRANSFORMED_FOOD',
              victimId: target.id,
              victimName: target.name,
              killerId: proj.ownerId,
              killerName: shooter ? shooter.name : 'Unknown',
              duration: 10.0,
              timesEaten: 0,
              maxTimes: 3
            });
          }
          break;
        }
      }

      if (hitPlayer) {
        this.projectiles.splice(i, 1);
      }
    }

    // 6. Broadcast Snapshot to Clients
    this.broadcastSnapshot();
  }

  endMatch(reason = 'NORMAL', forcedWinner = null) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.projectiles = []; // Clear projectiles on match end

    if (forcedWinner !== null && forcedWinner !== undefined) {
      this.winnerTeam = forcedWinner;
    } else {
      // Primary Objective: Check Base HP!
      if (this.bases.blue.hp > this.bases.red.hp) {
        this.winnerTeam = 0; // Blue has higher remaining base HP
      } else if (this.bases.red.hp > this.bases.blue.hp) {
        this.winnerTeam = 1; // Red has higher remaining base HP
      } else {
        // Tie-breaker: Kills
        if (this.teamScores.blue > this.teamScores.red) {
          this.winnerTeam = 0;
        } else if (this.teamScores.red > this.teamScores.blue) {
          this.winnerTeam = 1;
        } else {
          this.winnerTeam = -1; // Draw
        }
      }
    }

    // Compute detailed match stats & MVP
    const allPlayers = Array.from(this.players.values());
    const scoreboard = allPlayers.map(p => {
      const combatScore = (p.kills * 100) + (p.assists * 50) + p.damageDealt + (p.foodEaten * 20);
      return {
        id: p.id,
        name: p.name,
        team: p.team,
        isBot: p.isBot,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        damageDealt: p.damageDealt,
        foodEaten: p.foodEaten,
        level: p.level,
        score: combatScore
      };
    });

    scoreboard.sort((a, b) => b.score - a.score);
    const mvp = scoreboard[0] || null;

    this.broadcast({
      type: 'MATCH_END',
      winnerTeam: this.winnerTeam,
      reason,
      scores: this.teamScores,
      bases: {
        blue: { hp: Math.round(this.bases.blue.hp), maxHp: this.bases.blue.maxHp },
        red: { hp: Math.round(this.bases.red.hp), maxHp: this.bases.red.maxHp }
      },
      scoreboard,
      mvp,
      returnCountdown: CONFIG.MATCH_END_DELAY_SEC || 10
    });
  }

  handleFoodPlayerReloaded(target, eater, nowSec) {
    if (!target || !target.isFoodForm || target.isDead) return;

    const result = target.onEaten(eater, nowSec);
    if (!result) return;

    // Đẩy văng thức ăn (Knockback mạnh) tạo cơ hội tẩu thoát và ẩn nấp
    if (eater) {
      const pushDirX = target.x - eater.x || (Math.random() - 0.5);
      const pushDirZ = target.z - eater.z || (Math.random() - 0.5);
      const pushLen = Math.hypot(pushDirX, pushDirZ) || 1;
      target.x = Math.max(CONFIG.BOUNDS.minX + 2, Math.min(CONFIG.BOUNDS.maxX - 2, target.x + (pushDirX / pushLen) * 4.0));
      target.z = Math.max(CONFIG.BOUNDS.minZ + 2, Math.min(CONFIG.BOUNDS.maxZ - 2, target.z + (pushDirZ / pushLen) * 4.0));
      target.vx = (pushDirX / pushLen) * 16.0;
      target.vz = (pushDirZ / pushLen) * 16.0;
    }

    if (result === 'ELIMINATED') {
      // Bị đối thủ lại gần nạp đạn quá 3 lần: Bị tiêu diệt hoàn toàn, chờ đúng 5 giây hồi sinh
      if (eater) {
        eater.kills++;
        if (eater.team === 0) this.teamScores.blue++;
        else this.teamScores.red++;

        const leveledUp = eater.addXP(CONFIG.KILL_XP);
        if (leveledUp && !eater.isBot) {
          this.sendToPlayer(eater.id, {
            type: 'LEVEL_UP',
            level: eater.level,
            choices: eater.pendingUpgradeChoices
          });
        }
      }

      this.dropFoodInForest(target.x, target.z);

      this.broadcast({
        type: 'PLAYER_KILLED',
        victimId: target.id,
        victimName: target.name,
        killerId: eater ? eater.id : null,
        killerName: eater ? eater.name : 'Đối thủ',
        assisters: [],
        scores: this.teamScores,
        reason: 'EATEN_3_TIMES',
        respawnTimer: 5.0
      });
    } else if (result === 'BITTEN') {
      // Đối thủ vừa lại gần nạp đạn thành công: Nạn nhân bị nạp đạn (${target.timesEaten}/3)
      this.broadcast({
        type: 'FOOD_BITTEN',
        victimId: target.id,
        victimName: target.name,
        eaterId: eater ? eater.id : null,
        eaterName: eater ? eater.name : 'Đối thủ',
        timesEaten: target.timesEaten,
        maxTimes: 3,
        remainingTime: parseFloat(target.foodFormTimer.toFixed(1)),
        immunitySec: 1.8
      });
    }
  }

  handleFoodPlayerBitten(target, eater, nowSec) {
    return this.handleFoodPlayerReloaded(target, eater, nowSec);
  }

  dropFoodInForest(x, z) {
    const clampedX = Math.max(CONFIG.BOUNDS.minX + 2.0, Math.min(CONFIG.BOUNDS.maxX - 2.0, x));
    const clampedZ = Math.max(CONFIG.BOUNDS.minZ + 2.0, Math.min(CONFIG.BOUNDS.maxZ - 2.0, z));
    const groundY = parseFloat((getTerrainHeight(clampedX, clampedZ) + 0.1).toFixed(2));

    const inactiveSpot = this.foodSpots.find(f => !f.active);
    if (inactiveSpot) {
      inactiveSpot.x = clampedX;
      inactiveSpot.y = groundY;
      inactiveSpot.z = clampedZ;
      inactiveSpot.active = true;
      inactiveSpot.lifetime = CONFIG.FOOD_LIFESPAN;
      inactiveSpot.respawnTimer = 0;
    } else if (this.foodSpots.length < 15) {
      this.foodSpots.push({
        id: this.foodSpots.length + 1,
        x: clampedX,
        y: groundY,
        z: clampedZ,
        active: true,
        lifetime: CONFIG.FOOD_LIFESPAN,
        maxLifetime: CONFIG.FOOD_LIFESPAN,
        respawnTimer: 0
      });
    }
  }

  handleShoot(playerId, aimDir) {
    if (this.state !== 'playing') return;

    const player = this.players.get(playerId);
    if (!player || player.isDead) return;

    const nowSec = Date.now() / 1000;
    if (!player.canShoot(nowSec)) return;

    player.recordShot(nowSec);

    const shootDir = this.validateOrAssistAim(player, aimDir);
    const speed = CONFIG.PROJECTILE_SPEED;

    this.projectiles.push({
      id: this.nextProjectileId++,
      ownerId: player.id,
      team: player.team,
      x: player.x,
      y: player.y + 0.25,
      z: player.z,
      vx: shootDir.x * speed,
      vy: shootDir.y * speed,
      vz: shootDir.z * speed,
      damage: player.damage,
      life: CONFIG.PROJECTILE_LIFE
    });
  }

  validateOrAssistAim(player, aimDir) {
    let mag = Math.hypot(aimDir.x || 0, aimDir.y || 0, aimDir.z || 0) || 1;
    let dir = { x: (aimDir.x || 0) / mag, y: (aimDir.y || 0) / mag, z: (aimDir.z || 0) / mag };

    let bestTarget = null;
    let minAngle = (CONFIG.AIM_ASSIST_CONE_DEG * Math.PI) / 180;

    for (const enemy of this.players.values()) {
      if (enemy.isDead || enemy.team === player.team) continue;

      const toEnemy = {
        x: enemy.x - player.x,
        y: enemy.y - player.y,
        z: enemy.z - player.z
      };
      const dist = Math.hypot(toEnemy.x, toEnemy.y, toEnemy.z);
      if (dist > CONFIG.AIM_ASSIST_RANGE || dist < 0.5) continue;

      const norm = { x: toEnemy.x / dist, y: toEnemy.y / dist, z: toEnemy.z / dist };
      const dot = dir.x * norm.x + dir.y * norm.y + dir.z * norm.z;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

      if (angle < minAngle) {
        if (this.hasLineOfSight(player, enemy)) {
          minAngle = angle;
          bestTarget = norm;
        }
      }
    }

    if (bestTarget) {
      dir.x = dir.x * 0.55 + bestTarget.x * 0.45;
      dir.y = dir.y * 0.55 + bestTarget.y * 0.45;
      dir.z = dir.z * 0.55 + bestTarget.z * 0.45;
      const newMag = Math.hypot(dir.x, dir.y, dir.z);
      dir.x /= newMag;
      dir.y /= newMag;
      dir.z /= newMag;
    }

    return dir;
  }

  hasLineOfSight(p1, p2) {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const lenSq = dx * dx + dz * dz;
    if (lenSq === 0) return true;

    const midX = (p1.x + p2.x) * 0.5;
    const midZ = (p1.z + p2.z) * 0.5;
    const halfDiag = Math.hypot(dx, dz) * 0.5 + 1.5;
    const candidateTrees = this.treeGrid.getNearbyTrees(midX, midZ, halfDiag);

    for (let i = 0; i < candidateTrees.length; i++) {
      const tree = candidateTrees[i];
      const t = Math.max(0, Math.min(1, ((tree.x - p1.x) * dx + (tree.z - p1.z) * dz) / lenSq));
      const closeX = p1.x + t * dx;
      const closeZ = p1.z + t * dz;
      const d = Math.hypot(tree.x - closeX, tree.z - closeZ);
      if (d < tree.radius) {
        return false;
      }
    }
    return true;
  }

  applyUpgrade(playerId, upgradeId) {
    const player = this.players.get(playerId);
    if (!player) return;

    player.applyUpgrade(upgradeId);

    this.sendToPlayer(playerId, {
      type: 'UPGRADE_APPLIED',
      stats: {
        damage: player.damage,
        speed: player.speed,
        hp: player.hp,
        maxHp: player.maxHp,
        scale: player.scale,
        maxAmmo: player.maxAmmo
      }
    });
  }

  handleChat(playerId, message, isTeamOnly = false) {
    const player = this.players.get(playerId);
    if (!player) return;

    const sanitizedText = (message || '').toString().trim().substring(0, 100);
    if (!sanitizedText) return;

    const chatPacket = {
      type: 'CHAT_MESSAGE',
      senderId: player.id,
      senderName: player.name,
      team: player.team,
      isTeamOnly: Boolean(isTeamOnly),
      message: sanitizedText,
      timestamp: Date.now()
    };

    this.chatLog.push(chatPacket);
    if (this.chatLog.length > 50) this.chatLog.shift();

    for (const target of this.players.values()) {
      if (isTeamOnly && target.team !== player.team) continue;
      if (target.ws && target.ws.readyState === WebSocket.OPEN) {
        target.ws.send(JSON.stringify(chatPacket));
      }
    }
  }

  replaceWithBot(humanPlayer) {
    // Smoothly substitute disconnected human with Bot so 3v3 team balance is preserved
    const botId = `bot_sub_${Math.random().toString(36).substring(2, 7)}`;
    const botName = `[BOT] ${humanPlayer.name}`;
    const substituteBot = new Bot(botId, botName, humanPlayer.team);

    substituteBot.x = humanPlayer.x;
    substituteBot.y = humanPlayer.y;
    substituteBot.z = humanPlayer.z;
    substituteBot.hp = humanPlayer.hp;
    substituteBot.maxHp = humanPlayer.maxHp;
    substituteBot.ammo = humanPlayer.ammo;
    substituteBot.level = humanPlayer.level;
    substituteBot.kills = humanPlayer.kills;
    substituteBot.deaths = humanPlayer.deaths;

    this.players.delete(humanPlayer.id);
    this.players.set(botId, substituteBot);

    this.broadcast({
      type: 'PLAYER_SUBSTITUTED',
      oldPlayerId: humanPlayer.id,
      newPlayer: substituteBot.toSnapshot()
    });
  }

  broadcast(msg) {
    const str = JSON.stringify(msg);
    for (const player of this.players.values()) {
      if (player.ws && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(str);
      }
    }
  }

  sendToPlayer(playerId, msg) {
    const player = this.players.get(playerId);
    if (player && player.ws && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(msg));
    }
  }

  broadcastSnapshot() {
    const playersSnap = Array.from(this.players.values()).map(p => p.toSnapshot());
    const projSnap = this.projectiles.map(pr => ({
      id: pr.id,
      team: pr.team,
      x: Math.round(pr.x * 100) / 100,
      y: Math.round(pr.y * 100) / 100,
      z: Math.round(pr.z * 100) / 100
    }));
    const foodSnap = this.foodSpots.map(f => ({
      id: f.id,
      x: f.x,
      y: f.y,
      z: f.z,
      active: f.active,
      lifetime: Math.round((f.lifetime || 0) * 10) / 10
    }));

    const basesSnap = {
      blue: {
        hp: Math.round(this.bases.blue.hp),
        maxHp: this.bases.blue.maxHp,
        x: this.bases.blue.x,
        y: this.bases.blue.y,
        z: this.bases.blue.z
      },
      red: {
        hp: Math.round(this.bases.red.hp),
        maxHp: this.bases.red.maxHp,
        x: this.bases.red.x,
        y: this.bases.red.y,
        z: this.bases.red.z
      }
    };

    this.broadcast({
      type: 'WORLD_STATE',
      state: this.state,
      matchTimeRemaining: Math.ceil(this.matchTimeRemaining),
      targetScore: this.targetScore,
      scores: this.teamScores,
      bases: basesSnap,
      players: playersSnap,
      projectiles: projSnap,
      foodSpots: foodSnap
    });
  }

  getHumanCount() {
    let count = 0;
    for (const p of this.players.values()) {
      if (!p.isBot) count++;
    }
    return count;
  }

  destroy() {
    clearInterval(this.interval);
  }
}

module.exports = GameRoom;
