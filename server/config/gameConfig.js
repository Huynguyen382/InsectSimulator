const realTrees = require('./forestTrees.json');
const { getTerrainHeight } = require('../utils/terrain');

const blueSpawnZ = -22;
const redSpawnZ = 22;

module.exports = {
  // Server & Match
  PORT: process.env.PORT || 3000,
  TICK_RATE: 30,
  MATCH_SIZE: 6,
  TEAM_SIZE: 3,
  QUEUE_AUTOSTART_TIMEOUT_MS: 3000,

  // Base Player Stats
  BASE_HP: 100,
  BASE_SPEED: 14.5, // m/s
  BASE_DAMAGE: 25,
  BASE_SCALE: 1.0,
  MAX_AMMO: 20,
  HITBOX_RADIUS: 0.9,

  // Mechanics
  EAT_TIME_REQUIRED: 2.0,
  FOOD_LIFESPAN: 22.0,       // Food despawns if not eaten within 22 seconds!
  FOOD_RESPAWN_TIME: 12.0,   // Respawns after 12 seconds
  EAT_HEAL_HP: 35,           // Eating restores ammo AND heals 35 HP!
  KILL_XP: 100,
  ASSIST_XP: 45,             // XP awarded to teammates who assisted in the kill
  EAT_XP: 20,
  RESPAWN_TIME: 5.0,
  INITIAL_AMMO: 20,          // Khởi đầu và hồi sinh có đầy đủ 20 viên đạn sẵn sàng chiến đấu
  FIRE_RATE_COOLDOWN: 0.18,  // Minimum seconds between shots (Server-side anti-spam)
  ASSIST_TIMEOUT_SEC: 8.0,   // Damage within last 8s qualifies for an assist
  OUT_OF_COMBAT_REGEN_DELAY: 5.0, // Seconds without taking damage to start healing
  OUT_OF_COMBAT_REGEN_RATE: 4.0,  // HP regenerated per second out of combat

  // Match Win Conditions & Timing
  WIN_SCORE: 15,             // First team to 15 kills wins the match!
  MATCH_DURATION_SEC: 300,   // 5 minutes match timer
  MATCH_END_DELAY_SEC: 10,   // Seconds showing victory/defeat screen before returning to lobby
  HEARTBEAT_INTERVAL_MS: 15000,

  // Cứ Điểm (Outposts / Bases)
  BASE_MAX_HP: 1000,
  BASE_HITBOX_RADIUS: 2.8,
  BASES: {
    blue: {
      id: 'base_blue',
      name: 'Cứ Điểm Xanh (Phe Ruồi Lam)',
      team: 0,
      x: 0,
      y: parseFloat((getTerrainHeight(0, -26) + 0.1).toFixed(2)),
      z: -26,
      hp: 1000,
      maxHp: 1000,
      radius: 2.8
    },
    red: {
      id: 'base_red',
      name: 'Cứ Điểm Đỏ (Phe Ruồi Đỏ)',
      team: 1,
      x: 0,
      y: parseFloat((getTerrainHeight(0, 26) + 0.1).toFixed(2)),
      z: 26,
      hp: 1000,
      maxHp: 1000,
      radius: 2.8
    }
  },

  // Combat & Projectiles
  PROJECTILE_SPEED: 52.0,
  PROJECTILE_LIFE: 2.8,
  AIM_ASSIST_CONE_DEG: 18.0,
  AIM_ASSIST_RANGE: 10.0,    // Hỗ trợ ngắm chuẩn xác trong phạm vi 10m, ngoài 10m không hỗ trợ
  BOT_ENGAGEMENT_RANGE: 32.0,

  // Forest Arena Flight Boundaries (Accurately cropped to forest ground 76m x 76m)
  BOUNDS: {
    minX: -36.0,
    maxX: 36.0,
    minZ: -36.0,
    maxZ: 36.0,
    hoverAboveGround: 0.45,    // Minimum altitude above terrain
    maxHeightAboveGround: 14.0  // Maximum altitude under canopy
  },

  // 83 Real Forest Tree Colliders
  TREE_OBSTACLES: realTrees,

  // Food Spots resting visibly on top of the forest road & clearings (All strictly inside forest)
  FOOD_SPOTS: [
    { id: 1, x: 0, y: parseFloat((getTerrainHeight(0, 0) + 0.1).toFixed(2)), z: 0, active: true, lifetime: 22.0, maxLifetime: 22.0, respawnTimer: 0 },
    { id: 2, x: 0, y: parseFloat((getTerrainHeight(0, -12) + 0.1).toFixed(2)), z: -12, active: true, lifetime: 22.0, maxLifetime: 22.0, respawnTimer: 0 },
    { id: 3, x: 0, y: parseFloat((getTerrainHeight(0, 12) + 0.1).toFixed(2)), z: 12, active: true, lifetime: 22.0, maxLifetime: 22.0, respawnTimer: 0 },
    { id: 4, x: 10, y: parseFloat((getTerrainHeight(10, -6) + 0.1).toFixed(2)), z: -6, active: true, lifetime: 22.0, maxLifetime: 22.0, respawnTimer: 0 },
    { id: 5, x: -12, y: parseFloat((getTerrainHeight(-12, 8) + 0.1).toFixed(2)), z: 8, active: true, lifetime: 22.0, maxLifetime: 22.0, respawnTimer: 0 },
    { id: 6, x: 12, y: parseFloat((getTerrainHeight(12, 20) + 0.1).toFixed(2)), z: 20, active: true, lifetime: 22.0, maxLifetime: 22.0, respawnTimer: 0 },
    { id: 7, x: -14, y: parseFloat((getTerrainHeight(-14, -15) + 0.1).toFixed(2)), z: -15, active: true, lifetime: 22.0, maxLifetime: 22.0, respawnTimer: 0 },
    { id: 8, x: -22, y: parseFloat((getTerrainHeight(-22, 12) + 0.1).toFixed(2)), z: 12, active: true, lifetime: 22.0, maxLifetime: 22.0, respawnTimer: 0 },
    { id: 9, x: 22, y: parseFloat((getTerrainHeight(22, -14) + 0.1).toFixed(2)), z: -14, active: true, lifetime: 22.0, maxLifetime: 22.0, respawnTimer: 0 }
  ],

  // Spawns safely elevated on the forest road
  SPAWN_POINTS: [
    { x: 0, y: parseFloat((getTerrainHeight(0, blueSpawnZ) + 2.0).toFixed(2)), z: blueSpawnZ },
    { x: 0, y: parseFloat((getTerrainHeight(0, redSpawnZ) + 2.0).toFixed(2)), z: redSpawnZ }
  ],

  // Upgrades Pool
  UPGRADES_POOL: [
    { id: 'dmg_up', name: 'Nọc Độc Đậm Đặc', desc: '+20% Sát thương đạn', stat: 'damage', mult: 1.2 },
    { id: 'spd_up', name: 'Đôi Cánh Cơ Động', desc: '+15% Tốc độ bay', stat: 'speed', mult: 1.15 },
    { id: 'hp_up', name: 'Giáp Côn Trùng', desc: '+25 Máu tối đa, hồi ngay 25 HP', stat: 'maxHp', add: 25 },
    { id: 'size_up', name: 'Thể Trạng Khổng Lồ', desc: '+25% Kích thước, +35 HP (Trade-off: Hitbox to hơn)', stat: 'scale', mult: 1.25, bonusHp: 35 },
    { id: 'rapid_eat', name: 'Hấp Thu Thần Tốc', desc: 'Giảm 50% thời gian ăn bãi thức ăn, hồi thêm +20 HP khi ăn', stat: 'eatSpeed', mult: 0.5, bonusHeal: 20 },
    { id: 'ammo_boost', name: 'Túi Đạn Mở Rộng', desc: '+5 Băng đạn tối đa (Lên 25 viên đạn)', stat: 'maxAmmo', add: 5 },
    { id: 'regen_up', name: 'Tế Bào Tái Tạo', desc: '+75% Tốc độ hồi phục máu tự nhiên ngoài giao tranh', stat: 'regen', mult: 1.75 }
  ]
};
