import * as THREE from 'three';
import { CLIENT_CONFIG } from './config.js';
import { network } from './network/Network.js';
import { SceneManager } from './scene/SceneManager.js';
import { AssetLoader, FOREST_QUALITY_PRESETS } from './entities/AssetLoader.js';
import { ParticleSystem } from './scene/ParticleSystem.js';
import { InputController } from './controls/InputController.js';
import { AimAssist } from './systems/AimAssist.js';
import { UIManager } from './ui/UIManager.js';
import { getTerrainHeight, FOREST_TREES } from './forestData.js';

class ProjectilePool {
  constructor(scene, initialSize = 50) {
    this.scene = scene;
    // Aerodynamic elongated tracer dart geometry (Sleek venom dart with flight trail)
    this.geometry = new THREE.CylinderGeometry(0.08, 0.04, 0.95, 8, 1);
    this.geometry.rotateX(Math.PI / 2); // Lengthwise along flight direction

    this.blueMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 }); // Intense cyan neon
    this.redMat = new THREE.MeshBasicMaterial({ color: 0xf87171 });  // Vibrant crimson flare
    this.pool = [];

    for (let i = 0; i < initialSize; i++) {
      const mesh = new THREE.Mesh(this.geometry, this.blueMat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.pool.push(mesh);
    }
  }

  sync(projectiles) {
    const list = projectiles || [];
    const count = list.length;
    while (this.pool.length < count) {
      const mesh = new THREE.Mesh(this.geometry, this.blueMat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.pool.push(mesh);
    }

    for (let i = 0; i < count; i++) {
      const pr = list[i];
      const mesh = this.pool[i];
      const mat = pr.team === 0 ? this.blueMat : this.redMat;
      if (mesh.material !== mat) {
        mesh.material = mat;
      }
      mesh.position.set(pr.x, pr.y, pr.z);

      // Align sleek tracer dart directly with velocity vector
      if (pr.vx || pr.vy || pr.vz) {
        mesh.lookAt(pr.x + pr.vx, pr.y + pr.vy, pr.z + pr.vz);
      }

      if (!mesh.visible) {
        mesh.visible = true;
      }
    }

    for (let i = count; i < this.pool.length; i++) {
      if (this.pool[i].visible) {
        this.pool[i].visible = false;
      }
    }
  }

  clear() {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].visible = false;
    }
  }
}

class Game {
  constructor() {
    this.sceneManager = new SceneManager();
    this.uiManager = new UIManager();
    this.assetLoader = new AssetLoader(this.sceneManager.scene);
    this.inputController = new InputController(() => this.handleShoot());
    this.aimAssist = new AimAssist(this.sceneManager, this.uiManager, this.inputController);

    this.myPlayerId = null;
    this.myTeam = null;
    this.currentRoomId = null;
    this.isDead = false;

    // Local Fly State for Client-Side Prediction (Starts with 0 ammo - MUST EAT TO GET AMMO!)
    this.localPlayer = {
      x: 0,
      y: 5.0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      speed: 14.5,
      scale: 1.0,
      ammo: 20,       // Khởi đầu với đầy đủ 20 viên đạn
      maxAmmo: 20,
      hp: 100,
      maxHp: 100,
      level: 1,
      xp: 0,
      isFoodForm: false,
      foodFormTimer: 0,
      timesEaten: 0,
      initialized: false
    };

    this.lastShotTime = 0;

    // Visual Entities Maps & Pools
    this.playerVisuals = new Map();
    this.foodVisuals = new Map();
    this.baseVisuals = { blue: null, red: null };
    this.projectilePool = new ProjectilePool(this.sceneManager.scene, 50);
    this.particleSystem = new ParticleSystem(this.sceneManager.scene, 180);

    // Pre-allocated math vectors (Zero Garbage Collection in 60fps loop)
    this.currentLookAt = new THREE.Vector3(0, 5, 10);
    this.targetLookAt = new THREE.Vector3(0, 5, 10);
    this._camTargetPos = new THREE.Vector3();
    this._camLookTarget = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._screenVector = new THREE.Vector3();
    this._targetPos = new THREE.Vector3();

    this.lastFrameTime = performance.now();

    // FPS Target Limit (60, 120, 144, 0 = MAX Unlocked)
    const savedFps = localStorage.getItem('insect_fps_target');
    this.targetFps = savedFps !== null ? parseInt(savedFps, 10) : 144;
    this.initFpsTargetController();

    // Forest Quality Manager (performance / balanced / high)
    const savedQuality = localStorage.getItem('insect_forest_quality') || 'performance';
    this.currentQuality = FOREST_QUALITY_PRESETS[savedQuality] ? savedQuality : 'performance';
    this.assetLoader.currentQualityKey = this.currentQuality;
    this.initForestQualityController();

    // Platform Selector (PC vs Mobile Matchmaking Separation)
    this.platform = this.detectPlatform();
    this.initPlatformController();

    this.initPreload();
    this.initNetwork();
    this.initLobbyEvents();
    this.startLoop();
  }

  detectPlatform() {
    try {
      localStorage.removeItem('insect_platform');
    } catch (e) {}

    const ua = navigator.userAgent || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const isFinePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;

    // Thiết bị có chuột thật (pointer: fine) và không phải hệ điều hành di động -> 100% là PC
    if (isFinePointer && !isMobileUA) {
      return 'pc';
    }

    // Chỉ coi là Mobile khi chạy hệ điều hành di động (Android / iOS) hoặc thiết bị thuần cảm ứng
    return (isMobileUA || (hasTouch && isCoarse && window.innerWidth <= 900)) ? 'mobile' : 'pc';
  }

  applyPlatform(platform) {
    this.platform = (platform === 'mobile') ? 'mobile' : 'pc';
    this.inputController.setPlatform(this.platform);

    const badge = document.getElementById('auto-platform-badge');
    const icon = document.getElementById('auto-platform-icon');
    const name = document.getElementById('auto-platform-name');
    const desc = document.getElementById('platform-desc-text');

    if (badge && icon && name) {
      if (this.platform === 'mobile') {
        badge.className = 'platform-badge-pill mobile';
        icon.innerText = '📱';
        name.innerText = 'THIẾT BỊ DI ĐỘNG (MOBILE)';
        if (desc) desc.innerText = '🔒 Hệ thống tự động ghép với người chơi Mobile (Cần gạt ảo & Cảm ứng)';
      } else {
        badge.className = 'platform-badge-pill pc';
        icon.innerText = '💻';
        name.innerText = 'MÁY TÍNH (PC)';
        if (desc) desc.innerText = '🔒 Hệ thống tự động ghép với người chơi PC (Chuột & Bàn phím)';
      }
    }

    const mobileLayer = document.getElementById('mobile-controls');
    if (mobileLayer) {
      if (this.currentRoomId && this.platform === 'mobile') {
        mobileLayer.classList.remove('hidden');
      } else {
        mobileLayer.classList.add('hidden');
      }
    }
  }

  initPlatformController() {
    this.applyPlatform(this.platform);
  }

  initFpsTargetController() {
    const fpsBtn = document.getElementById('fps-target-btn');
    if (!fpsBtn) return;

    const updateBtnLabel = () => {
      if (this.targetFps === 0) {
        fpsBtn.innerText = '⚡ MAX';
        fpsBtn.title = 'Giới hạn FPS: Tối đa không giới hạn (Nhấp để đổi)';
      } else {
        fpsBtn.innerText = `⚡ ${this.targetFps} FPS`;
        fpsBtn.title = `Giới hạn FPS: ${this.targetFps} (Nhấp để đổi)`;
      }
    };

    updateBtnLabel();

    fpsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.targetFps === 60) this.targetFps = 120;
      else if (this.targetFps === 120) this.targetFps = 144;
      else if (this.targetFps === 144) this.targetFps = 0; // MAX
      else this.targetFps = 60;

      localStorage.setItem('insect_fps_target', this.targetFps);
      updateBtnLabel();
    });
  }

  applyForestQuality(qualityKey) {
    if (!FOREST_QUALITY_PRESETS[qualityKey]) qualityKey = 'performance';
    this.currentQuality = qualityKey;
    localStorage.setItem('insect_forest_quality', qualityKey);

    const preset = FOREST_QUALITY_PRESETS[qualityKey];

    // 1. Rebuild / update forest models in AssetLoader
    this.assetLoader.setQuality(qualityKey);

    // 2. Adjust Camera Far, Fog distances, and Max DPR in SceneManager
    this.sceneManager.setQuality(preset);
    this.sceneManager.compileScene();

    // 3. Update HUD Pill
    const qualityBtn = document.getElementById('graphic-mode-btn');
    if (qualityBtn) {
      qualityBtn.innerText = `🌿 ${preset.name}`;
      qualityBtn.title = `Chế độ rừng: ${preset.name} (Nhấp hoặc nhấn F8 để đổi)\n${preset.desc}`;
    }

    // 4. Update Lobby Quality Buttons & Description
    const lobbyBtns = document.querySelectorAll('.btn-quality');
    lobbyBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.quality === qualityKey);
    });
    const descEl = document.getElementById('quality-desc-text');
    if (descEl) {
      descEl.innerText = preset.desc;
    }
  }

  initForestQualityController() {
    this.applyForestQuality(this.currentQuality);

    // HUD Pill Click -> Cycle: performance -> balanced -> high -> performance
    const qualityBtn = document.getElementById('graphic-mode-btn');
    if (qualityBtn) {
      qualityBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cycle = ['performance', 'balanced', 'high'];
        const nextIdx = (cycle.indexOf(this.currentQuality) + 1) % cycle.length;
        this.applyForestQuality(cycle[nextIdx]);
      });
    }

    // Shortcut: F8 to cycle quality
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F8') {
        e.preventDefault();
        const cycle = ['performance', 'balanced', 'high'];
        const nextIdx = (cycle.indexOf(this.currentQuality) + 1) % cycle.length;
        this.applyForestQuality(cycle[nextIdx]);
      }
    });

    // Lobby buttons click
    const lobbyBtns = document.querySelectorAll('.btn-quality');
    lobbyBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const q = btn.dataset.quality;
        if (q && FOREST_QUALITY_PRESETS[q]) {
          this.applyForestQuality(q);
        }
      });
    });
  }

  async initPreload() {
    await this.assetLoader.preloadAll((percent, status) => {
      this.uiManager.setPreloadProgress(percent, status);
    });

    // Upgrade any already-spawned flies to 3D model
    this.playerVisuals.forEach((visual, id) => {
      if (!visual.userData.flyMesh && this.assetLoader.baseFlyModel) {
        const shadow = visual.userData.shadow;
        this.sceneManager.scene.remove(visual);
        const newVisual = this.assetLoader.createFlyInstance(visual.userData.team);
        newVisual.userData.team = visual.userData.team;
        newVisual.userData.shadow = shadow || this.sceneManager.createBlobShadowMesh();
        newVisual.position.copy(visual.position);
        newVisual.rotation.y = visual.rotation.y;
        this.playerVisuals.set(id, newVisual);
      }
    });

    // Pre-warm WebGL shader compilations so the first frame in-game is 100% stutter-free
    this.sceneManager.compileScene();
  }

  initNetwork() {
    network.on('QUEUE_STATUS', (msg) => {
      this.uiManager.setQueueStatus(true, msg.position);
    });

    // Latency Ping / Pong
    network.on('PONG', (msg) => {
      if (msg.clientTimestamp) {
        const ping = Date.now() - msg.clientTimestamp;
        this.uiManager.setPing(ping);
      }
    });

    // Custom Room Network Handlers
    network.on('CUSTOM_ROOM_UPDATE', (msg) => {
      this.uiManager.showCustomRoomModal(msg.roomCode, msg.players, this.myPlayerId, msg.hostId, msg.platform);
    });

    network.on('CUSTOM_ROOMS_LIST', (msg) => {
      this.uiManager.renderOpenRooms(msg.rooms, (code) => {
        const name = this.uiManager.getPlayerName();
        network.send({ type: 'JOIN_CUSTOM_ROOM', roomCode: code, name, platform: this.platform });
      });
    });

    network.on('CUSTOM_ROOM_ERROR', (msg) => {
      this.uiManager.showRoomError(msg.message);
    });

    network.on('CUSTOM_ROOM_LEFT', () => {
      this.uiManager.hideCustomRoomModal();
    });

    // In-game Chat & Radio Callouts
    network.on('CHAT_MESSAGE', (msg) => {
      this.uiManager.addChatMessage(msg.senderName, msg.team, msg.message, msg.isTeamOnly);
    });

    network.on('MATCH_FOUND', (msg) => {
      this.myPlayerId = msg.playerId;
      this.myTeam = msg.team;
      this.currentRoomId = msg.roomId;

      this.uiManager.setQueueStatus(false);
      this.uiManager.hideGameOver();
      this.uiManager.switchToGameView();
      this.uiManager.setTeamBadge(this.myTeam, msg.isPractice);

      if (msg.trees) {
        this.aimAssist.setTrees(msg.trees);
        this.sceneManager.setupTreeObstacles(msg.trees);
      }

      this.localPlayer.initialized = false;
      this.localPlayer.ammo = 20; // Starts match with full 20 ammo
      this.localPlayer.maxAmmo = 20;
      this.lastShotTime = 0;
      this.uiManager.updateHUD({
        hp: 100,
        maxHp: 100,
        ammo: 20,
        maxAmmo: 20,
        level: 1,
        xp: 0,
        xpToNext: 100,
        isDead: false,
        isEating: false,
        eatProgress: 0,
        respawnTimer: 0
      });
      this.inputController.mouse.yaw = this.myTeam === 0 ? 0 : Math.PI;
      this.inputController.mouse.pitch = 0;

      // Mobile Touch vs Desktop PointerLock
      if (this.platform === 'mobile') {
        const ml = document.getElementById('mobile-controls');
        if (ml) ml.classList.remove('hidden');
      } else {
        this.inputController.requestLock();
      }
    });

    // Match End & Game Over Screen
    network.on('MATCH_END', (msg) => {
      this.inputController.exitLock();
      this.uiManager.showGameOver(msg, this.myTeam, () => {
        this.returnToLobby();
      });
    });

    network.on('RETURN_TO_LOBBY', () => {
      this.returnToLobby();
    });

    network.on('MATCH_LEFT', () => {
      this.returnToLobby();
    });

    network.on('WORLD_STATE', (state) => {
      this.handleWorldState(state);
    });

    network.on('LEVEL_UP', (msg) => {
      this.inputController.exitLock();
      this.uiManager.showLevelUpModal(msg.choices, (upgradeId) => {
        network.send({ type: 'CHOOSE_UPGRADE', upgradeId });
        this.inputController.requestLock();
      });
    });

    network.on('BASE_HIT', (msg) => {
      const isBlue = msg.baseKey === 'blue';
      const baseVisual = this.baseVisuals[msg.baseKey];
      if (baseVisual) {
        this.assetLoader.updateBaseHealthSprite(baseVisual, msg.hp, msg.maxHp);
        this.particleSystem.spawnHitSparks(
          baseVisual.position.x,
          baseVisual.position.y + 1.8,
          baseVisual.position.z,
          isBlue ? 0x38bdf8 : 0xf87171,
          10
        );
      }
      this.uiManager.flashBaseHit(msg.baseKey);

      // Only notify if own team base is attacked (throttled to once every 7s)
      const isMyBase = (msg.team === this.myTeam);
      const now = Date.now();
      if (isMyBase && (!this._lastBaseWarnTime || now - this._lastBaseWarnTime > 7000)) {
        this._lastBaseWarnTime = now;
        this.uiManager.showToast('⚠️ Cứ điểm phe ta đang bị tấn công!', 'warning', 2500);
      }
    });

    network.on('BASE_DESTROYED', (msg) => {
      const isBlue = msg.destroyedTeam === 0;
      const destroyedKey = isBlue ? 'blue' : 'red';
      const baseVisual = this.baseVisuals[destroyedKey];
      if (baseVisual) {
        this.particleSystem.spawnFoodBurst(
          baseVisual.position.x,
          baseVisual.position.y + 2.0,
          baseVisual.position.z,
          35
        );
      }
      const isMyBase = (msg.destroyedTeam === this.myTeam);
      const teamName = isBlue ? 'CỨ ĐIỂM XANH' : 'CỨ ĐIỂM ĐỎ';
      this.uiManager.addKillFeedEntry(msg.attackerName, teamName, [], {
        customHtml: `💥 <span class="feed-killer">${msg.attackerName}</span> đã phá hủy <b>${teamName}</b>!`,
        border: isMyBase ? 'red' : 'gold'
      });
      this.uiManager.showToast(isMyBase ? '💀 Cứ điểm của phe bạn đã bị phá hủy!' : `🏆 Đã phá hủy thành công ${teamName}!`, isMyBase ? 'warning' : 'success', 3500);
    });

    network.on('PLAYER_HIT', (msg) => {
      const targetVisual = this.playerVisuals.get(msg.targetId);
      if (targetVisual) {
        const sparkColor = targetVisual.userData.team === 0 ? 0x38bdf8 : 0xf87171;
        this.particleSystem.spawnHitSparks(
          targetVisual.position.x,
          targetVisual.position.y + 0.3,
          targetVisual.position.z,
          sparkColor,
          6
        );
      }
    });

    network.on('PLAYER_KILLED', (msg) => {
      const isEaten3Times = msg.reason === 'EATEN_3_TIMES';
      if (isEaten3Times) {
        this.uiManager.addKillFeedEntry(msg.killerName, msg.victimName, [], {
          customHtml: `💀 <span class="feed-killer">${msg.killerName}</span> <span class="feed-icon">➔</span> <span class="feed-victim">${msg.victimName}</span> (Bị nạp 3 lần)`
        });
      } else {
        this.uiManager.addKillFeedEntry(msg.killerName, msg.victimName, msg.assisters);
      }

      const victimVisual = this.playerVisuals.get(msg.victimId);
      if (victimVisual) {
        this.particleSystem.spawnFoodBurst(
          victimVisual.position.x,
          victimVisual.position.y + 0.5,
          victimVisual.position.z,
          18
        );
      }
    });

    network.on('PLAYER_TRANSFORMED_FOOD', (msg) => {
      const victimVisual = this.playerVisuals.get(msg.victimId);
      if (victimVisual) {
        this.particleSystem.spawnFoodBurst(
          victimVisual.position.x,
          victimVisual.position.y + 0.4,
          victimVisual.position.z,
          14
        );
      }
      if (msg.victimId === this.myPlayerId) {
        this.uiManager.showToast('💩 Bạn đã hóa thành thức ăn! Hãy trốn trong 10 giây!', 'warning', 3000);
      } else if (msg.killerId === this.myPlayerId) {
        this.uiManager.showToast(`🎯 Đã bắn hạ ${msg.victimName}! Hãy lại gần nạp đạn!`, 'success', 2500);
      }
    });

    network.on('FOOD_BITTEN', (msg) => {
      const victimVisual = this.playerVisuals.get(msg.victimId);
      if (victimVisual) {
        this.particleSystem.spawnFoodBurst(
          victimVisual.position.x,
          victimVisual.position.y + 0.4,
          victimVisual.position.z,
          14
        );
      }
      if (msg.victimId === this.myPlayerId) {
        this.localPlayer.timesEaten = msg.timesEaten;
        this.uiManager.showToast(`⚠️ Đối thủ vừa lại gần nạp đạn (${msg.timesEaten}/3)! Hãy chạy xa ra!`, 'warning', 2500);
      }
      if (msg.eaterId === this.myPlayerId) {
        this.localPlayer.ammo = this.localPlayer.maxAmmo;
        this.uiManager.showToast(`⚡ Đã nạp đầy ${this.localPlayer.maxAmmo} viên đạn từ đối thủ!`, 'success', 2000);
      }
    });

    network.on('PLAYER_REVIVED', (msg) => {
      const revivedVisual = this.playerVisuals.get(msg.id);
      if (revivedVisual) {
        this.particleSystem.spawnHitSparks(
          revivedVisual.position.x,
          revivedVisual.position.y + 0.3,
          revivedVisual.position.z,
          0x4ade80,
          16
        );
      }
      if (msg.id === this.myPlayerId) {
        this.localPlayer.isFoodForm = false;
        this.localPlayer.foodFormTimer = 0;
        this.localPlayer.timesEaten = 0;
        if (msg.hp) this.localPlayer.hp = msg.hp;
        if (msg.ammo) this.localPlayer.ammo = msg.ammo;
        this.uiManager.showToast('🎉 Trốn thoát 10s thành công! Đã hồi sinh làm ruồi!', 'success', 2800);
      } else {
        this.uiManager.addKillFeedEntry(msg.name, '', [], {
          customHtml: `✨ <span class="feed-killer">${msg.name}</span> đã trốn thoát 10s thành công!`,
          border: 'gold'
        });
      }
    });

    network.on('PLAYER_SUBSTITUTED', (msg) => {
      const oldVisual = this.playerVisuals.get(msg.oldPlayerId);
      if (oldVisual) {
        if (oldVisual.userData.shadow) {
          this.sceneManager.scene.remove(oldVisual.userData.shadow);
        }
        this.sceneManager.scene.remove(oldVisual);
        this.playerVisuals.delete(msg.oldPlayerId);
      }
    });

    network.on('PLAYER_DISCONNECTED', (msg) => {
      const v = this.playerVisuals.get(msg.playerId);
      if (v) {
        if (v.userData.shadow) {
          this.sceneManager.scene.remove(v.userData.shadow);
        }
        this.sceneManager.scene.remove(v);
        this.playerVisuals.delete(msg.playerId);
      }
    });
  }

  initLobbyEvents() {
    // Mode 1: Solo Practice (1 Human + 5 Bots)
    this.uiManager.dom.btnSoloPractice.addEventListener('click', () => {
      if (this.uiManager.dom.btnSoloPractice.disabled) return;
      const name = this.uiManager.getPlayerName();
      network.connect(() => {
        network.send({ type: 'START_SOLO_PRACTICE', name, platform: this.platform });
      });
    });

    // Mode 2: Auto Matchmaking Queue 3v3 (Separated by platform)
    this.uiManager.dom.btnFindMatch.addEventListener('click', () => {
      if (this.uiManager.dom.btnFindMatch.disabled) return;
      const name = this.uiManager.getPlayerName();
      this.uiManager.setQueueStatus(true, 1);
      network.connect(() => {
        network.send({ type: 'JOIN_QUEUE', name, platform: this.platform });
      });
    });

    // Mode 3: Custom Room Creation & Join
    this.uiManager.dom.btnCreateRoom.addEventListener('click', () => {
      if (this.uiManager.dom.btnCreateRoom.disabled) return;
      const name = this.uiManager.getPlayerName();
      network.connect(() => {
        network.send({ type: 'CREATE_CUSTOM_ROOM', name, platform: this.platform });
      });
    });

    this.uiManager.dom.btnJoinRoom.addEventListener('click', () => {
      if (this.uiManager.dom.btnJoinRoom.disabled) return;
      const name = this.uiManager.getPlayerName();
      const roomCode = this.uiManager.dom.inputRoomCode.value.trim();
      if (!roomCode) {
        this.uiManager.showRoomError('Vui lòng nhập mã phòng!');
        return;
      }
      network.connect(() => {
        network.send({ type: 'JOIN_CUSTOM_ROOM', roomCode, name, platform: this.platform });
      });
    });

    this.uiManager.dom.btnCopyCode.addEventListener('click', () => {
      const code = this.uiManager.dom.displayRoomCode.innerText;
      if (code && code !== '----') {
        navigator.clipboard.writeText(code).then(() => {
          this.uiManager.dom.btnCopyCode.innerText = '✅ ĐÃ CHÉP';
          setTimeout(() => {
            this.uiManager.dom.btnCopyCode.innerText = '📋 SAO CHÉP';
          }, 2000);
        }).catch(() => {});
      }
    });

    this.uiManager.dom.btnSwitchTeam.addEventListener('click', () => {
      network.send({ type: 'SWITCH_CUSTOM_ROOM_TEAM' });
    });

    this.uiManager.dom.btnLeaveRoom.addEventListener('click', () => {
      network.send({ type: 'LEAVE_CUSTOM_ROOM' });
      this.uiManager.hideCustomRoomModal();
    });

    this.uiManager.dom.btnStartCustomMatch.addEventListener('click', () => {
      network.send({ type: 'START_CUSTOM_ROOM_MATCH' });
    });

    window.addEventListener('click', () => {
      if (this.platform === 'mobile') return; // Mobile touch interaction bypasses pointer lock
      if (this.uiManager.isConfirmLeaveOpen()) return;
      if (this.uiManager.isGuideModalOpen()) return;
      if (this.uiManager.dom.gameoverModal && !this.uiManager.dom.gameoverModal.classList.contains('hidden')) return;
      if (this.currentRoomId && !this.inputController.isPointerLocked && this.uiManager.dom.levelupModal.classList.contains('hidden')) {
        this.inputController.requestLock();
      }
    });

    // Toggle Guide Modal Helper
    const toggleGuide = () => {
      if (this.uiManager.isGuideModalOpen()) {
        this.uiManager.hideGuideModal();
        if (this.currentRoomId && !this.uiManager.isConfirmLeaveOpen() && this.uiManager.dom.levelupModal.classList.contains('hidden')) {
          if (this.platform !== 'mobile') this.inputController.requestLock();
        }
      } else {
        if (this.currentRoomId) {
          this.inputController.exitLock();
        }
        this.uiManager.showGuideModal();
      }
    };

    if (this.uiManager.dom.btnOpenGuide) {
      this.uiManager.dom.btnOpenGuide.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleGuide();
      });
    }

    if (this.uiManager.dom.btnInGameGuide) {
      this.uiManager.dom.btnInGameGuide.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleGuide();
      });
    }

    if (this.uiManager.dom.btnCloseGuide) {
      this.uiManager.dom.btnCloseGuide.addEventListener('click', (e) => {
        e.stopPropagation();
        this.uiManager.hideGuideModal();
        if (this.currentRoomId && !this.uiManager.isConfirmLeaveOpen() && this.uiManager.dom.levelupModal.classList.contains('hidden')) {
          if (this.platform !== 'mobile') this.inputController.requestLock();
        }
      });
    }

    if (this.uiManager.dom.btnCloseGuideX) {
      this.uiManager.dom.btnCloseGuideX.addEventListener('click', (e) => {
        e.stopPropagation();
        this.uiManager.hideGuideModal();
        if (this.currentRoomId && !this.uiManager.isConfirmLeaveOpen() && this.uiManager.dom.levelupModal.classList.contains('hidden')) {
          if (this.platform !== 'mobile') this.inputController.requestLock();
        }
      });
    }

    // In-Game Leave Match & Confirm Modal Listeners
    if (this.uiManager.dom.btnInGameLeave) {
      this.uiManager.dom.btnInGameLeave.addEventListener('click', (e) => {
        e.stopPropagation();
        this.inputController.exitLock();
        this.uiManager.showConfirmLeave();
      });
    }

    if (this.uiManager.dom.btnCancelLeave) {
      this.uiManager.dom.btnCancelLeave.addEventListener('click', (e) => {
        e.stopPropagation();
        this.uiManager.hideConfirmLeave();
        if (this.platform !== 'mobile') this.inputController.requestLock();
      });
    }

    if (this.uiManager.dom.btnConfirmLeave) {
      this.uiManager.dom.btnConfirmLeave.addEventListener('click', (e) => {
        e.stopPropagation();
        this.leaveMatch();
      });
    }

    // Keydown handlers: ESC (Cancel / Leave) & H / F1 (Help Guide)
    window.addEventListener('keydown', (e) => {
      // Bấm H hoặc F1 để bật/tắt nhanh hướng dẫn
      if (e.key === 'h' || e.key === 'H' || e.code === 'KeyH' || e.key === 'F1') {
        const active = document.activeElement;
        const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.id !== 'unikey-shield';
        if (!isTyping) {
          e.preventDefault();
          toggleGuide();
          return;
        }
      }

      // Bấm Escape: Đóng hướng dẫn trước, hoặc mở bảng xác nhận thoát trận
      if (e.key === 'Escape' || e.code === 'Escape') {
        if (this.uiManager.isGuideModalOpen()) {
          e.preventDefault();
          this.uiManager.hideGuideModal();
          if (this.currentRoomId && !this.uiManager.isConfirmLeaveOpen() && this.uiManager.dom.levelupModal.classList.contains('hidden')) {
            if (this.platform !== 'mobile') this.inputController.requestLock();
          }
          return;
        }

        if (this.currentRoomId) {
          if (this.uiManager.isConfirmLeaveOpen()) {
            this.uiManager.hideConfirmLeave();
            if (this.platform !== 'mobile') this.inputController.requestLock();
          } else if (this.uiManager.dom.levelupModal.classList.contains('hidden')) {
            this.inputController.exitLock();
            this.uiManager.showConfirmLeave();
          }
        }
      }
    });

    // Send Input packet at 30Hz with authoritative local prediction
    setInterval(() => {
      if (!network.isConnected || !this.currentRoomId || this.isDead || !this.localPlayer.initialized) return;
      const input = this.inputController.getInputPacket();
      network.send({
        type: 'PLAYER_INPUT',
        inputs: {
          ...input,
          x: Math.round(this.localPlayer.x * 100) / 100,
          y: Math.round(this.localPlayer.y * 100) / 100,
          z: Math.round(this.localPlayer.z * 100) / 100,
          vx: Math.round(this.localPlayer.vx * 100) / 100,
          vy: Math.round(this.localPlayer.vy * 100) / 100,
          vz: Math.round(this.localPlayer.vz * 100) / 100
        }
      });
    }, 1000 / 30);

    // Latency Ping-Pong Heartbeat at 2.5s
    setInterval(() => {
      if (network.isConnected) {
        network.send({ type: 'PING', timestamp: Date.now() });
      }
    }, 2500);

    // Refresh Open Custom Rooms
    if (this.uiManager.dom.btnRefreshRooms) {
      this.uiManager.dom.btnRefreshRooms.addEventListener('click', () => {
        network.send({ type: 'GET_CUSTOM_ROOMS' });
      });
    }

    // Quick Tactical Radio Callout Buttons
    document.querySelectorAll('.radio-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.currentRoomId) {
          network.send({
            type: 'CHAT_MESSAGE',
            message: btn.dataset.msg,
            isTeamOnly: true
          });
        }
      });
    });

    // Auto-connect and register for lobby updates
    network.connect(() => {
      network.send({ type: 'REGISTER_LOBBY' });
      network.send({ type: 'GET_CUSTOM_ROOMS' });
    });
  }

  leaveMatch() {
    this.uiManager.hideConfirmLeave();
    if (this.currentRoomId) {
      network.send({ type: 'LEAVE_MATCH' });
    }
    this.returnToLobby();
  }

  returnToLobby() {
    this.currentRoomId = null;
    this.isDead = false;
    this.localPlayer.initialized = false;
    this.localPlayer.ammo = 20;
    this.lastShotTime = 0;

    // Reset camera to cinematic lobby angle
    this.sceneManager.camera.position.set(0, 15, 30);
    this.sceneManager.camera.lookAt(0, 0, 0);

    // Remove all entity visuals from 3D scene
    this.playerVisuals.forEach(v => {
      if (v.userData.shadow) {
        this.sceneManager.scene.remove(v.userData.shadow);
      }
      this.sceneManager.scene.remove(v);
    });
    this.playerVisuals.clear();
    this.foodVisuals.forEach(v => this.sceneManager.scene.remove(v));
    this.foodVisuals.clear();

    if (this.baseVisuals.blue) {
      this.sceneManager.scene.remove(this.baseVisuals.blue);
      this.baseVisuals.blue = null;
    }
    if (this.baseVisuals.red) {
      this.sceneManager.scene.remove(this.baseVisuals.red);
      this.baseVisuals.red = null;
    }

    this.projectilePool.clear();
    this.particleSystem.clear();

    const mobileLayer = document.getElementById('mobile-controls');
    if (mobileLayer) mobileLayer.classList.add('hidden');

    this.inputController.exitLock();
    this.uiManager.switchToLobbyView();
    network.send({ type: 'REGISTER_LOBBY' });
    network.send({ type: 'GET_CUSTOM_ROOMS' });
  }

  // --- SHOOTING LOGIC: ACCURATE AMMO SYNCHRONIZATION ---
  handleShoot() {
    if (this.isDead || !this.currentRoomId || this.localPlayer.isFoodForm) return;

    // Cooldown bắn kiểm tra đồng bộ chính xác với FIRE_RATE_COOLDOWN (0.18s) trên server
    const nowSec = performance.now() / 1000;
    const cooldown = 0.18;
    if (nowSec - this.lastShotTime < cooldown) {
      return; // Chưa hết hồi chiêu bắn -> không trừ đạn và không gửi spam gói tin
    }

    // Strict validation: Ruồi không có đạn thì tuyệt đối không thể bắn!
    if (this.localPlayer.ammo <= 0) {
      return;
    }

    this.lastShotTime = nowSec;

    // Deduct predicted local ammo
    this.localPlayer.ammo = Math.max(0, this.localPlayer.ammo - 1);
    this.uiManager.updateHUD({
      hp: this.localPlayer.hp,
      maxHp: this.localPlayer.maxHp,
      ammo: this.localPlayer.ammo,
      maxAmmo: this.localPlayer.maxAmmo,
      level: this.localPlayer.level,
      xp: this.localPlayer.xp,
      xpToNext: 100,
      isDead: this.isDead,
      isEating: false,
      eatProgress: 0,
      respawnTimer: 0
    });

    this.sceneManager.camera.getWorldDirection(this._camDir);

    const enemyBaseKey = this.myTeam === 0 ? 'red' : 'blue';
    const enemyBaseVisual = this.baseVisuals ? this.baseVisuals[enemyBaseKey] : null;

    const finalDir = this.aimAssist.updateAimAssist(
      this.myPlayerId,
      this.playerVisuals,
      this._camDir,
      enemyBaseVisual
    );

    network.send({
      type: 'SHOOT',
      aimDir: { x: finalDir.x, y: finalDir.y, z: finalDir.z }
    });
  }

  handleWorldState(state) {
    this.uiManager.updateScores(state.scores);

    if (state.matchTimeRemaining !== undefined) {
      this.uiManager.updateMatchTimer(state.matchTimeRemaining);
    }

    // Sync Base Outposts (Cứ Điểm 2 Phe)
    if (state.bases) {
      this.uiManager.updateBases(state.bases);

      if (state.bases.blue) {
        if (!this.baseVisuals.blue) {
          this.baseVisuals.blue = this.assetLoader.createBaseInstance(0, state.bases.blue);
        }
        this.assetLoader.updateBaseHealthSprite(this.baseVisuals.blue, state.bases.blue.hp, state.bases.blue.maxHp);
      }

      if (state.bases.red) {
        if (!this.baseVisuals.red) {
          this.baseVisuals.red = this.assetLoader.createBaseInstance(1, state.bases.red);
        }
        this.assetLoader.updateBaseHealthSprite(this.baseVisuals.red, state.bases.red.hp, state.bases.red.maxHp);
      }
    }

    // 1. Sync Food Spots (With Lifespan Expiration / Despawn Alert)
    state.foodSpots.forEach(f => {
      let foodMesh = this.foodVisuals.get(f.id);
      if (!foodMesh) {
        foodMesh = this.assetLoader.createFoodInstance();
        this.foodVisuals.set(f.id, foodMesh);
      }
      foodMesh.position.set(f.x, f.y, f.z);
      foodMesh.visible = f.active;

      // High-performance scale pulsing when food is about to expire (< 5s)
      if (f.active && f.lifetime !== undefined && f.lifetime <= 5.0) {
        const pulse = 1.0 + Math.sin(performance.now() * 0.015) * 0.2;
        foodMesh.scale.set(pulse, pulse, pulse);
      } else if (foodMesh.scale.x !== 1.0) {
        foodMesh.scale.set(1.0, 1.0, 1.0);
      }
    });

    // 2. Sync Players & Reconciliation
    state.players.forEach(p => {
      let visual = this.playerVisuals.get(p.id);
      if (!visual) {
        visual = this.assetLoader.createFlyInstance(p.team);
        visual.userData.team = p.team;
        visual.userData.shadow = this.sceneManager.createBlobShadowMesh();
        this.playerVisuals.set(p.id, visual);
      }

      if (p.id === this.myPlayerId) {
        const wasDead = this.isDead;
        this.isDead = p.isDead;
        this.localPlayer.isFoodForm = p.isFoodForm;
        this.localPlayer.foodFormTimer = p.foodFormTimer;
        this.localPlayer.timesEaten = p.timesEaten;
        this.localPlayer.speed = p.speed || 14.5;
        this.localPlayer.scale = p.scale || 1.0;
        this.localPlayer.maxAmmo = p.maxAmmo || 20;

        // Reconcile ammo: ngăn chặn hiện tượng nhảy lùi số đạn khi độ trễ ping
        const timeSinceLocalShot = (performance.now() / 1000) - this.lastShotTime;
        if (p.ammo >= this.localPlayer.maxAmmo || p.ammo <= this.localPlayer.ammo || timeSinceLocalShot > 0.25) {
          this.localPlayer.ammo = p.ammo;
        }

        this.localPlayer.hp = p.hp;
        this.localPlayer.maxHp = p.maxHp;
        this.localPlayer.level = p.level;
        this.localPlayer.xp = p.xp;

        this.uiManager.updateHUD({
          ...p,
          ammo: this.localPlayer.ammo,
          maxAmmo: this.localPlayer.maxAmmo
        });
        this.uiManager.updateFoodFormHUD(p);

        // Client-side prediction initialization & respawn reset
        if (!this.localPlayer.initialized || (!wasDead && p.isDead) || (wasDead && !p.isDead)) {
          this.localPlayer.x = p.x;
          this.localPlayer.y = p.y;
          this.localPlayer.z = p.z;
          this.localPlayer.vx = p.vx || 0;
          this.localPlayer.vy = p.vy || 0;
          this.localPlayer.vz = p.vz || 0;
          this.localPlayer.initialized = true;
        }
      } else {
        // Remote Player / Bot: Store targets for smooth frame-by-frame interpolation
        if (!visual.userData.targetPos) {
          visual.userData.targetPos = new THREE.Vector3(p.x, p.y, p.z);
          visual.position.set(p.x, p.y, p.z);
        } else {
          visual.userData.targetPos.set(p.x, p.y, p.z);
        }
        visual.userData.targetYaw = p.yaw;
        visual.userData.targetPitch = p.pitch || 0;
        visual.userData.targetRoll = p.roll || 0;
        visual.userData.targetScale = p.scale || 1.0;
        visual.userData.isDead = p.isDead;
        visual.userData.isFoodForm = p.isFoodForm;
        visual.userData.foodFormTimer = p.foodFormTimer;
        visual.userData.timesEaten = p.timesEaten;
      }

      // Toggle Fly vs Food visual model
      if (visual.userData.flyMesh) {
        visual.userData.flyMesh.visible = !p.isDead && !p.isFoodForm;
      }
      if (visual.userData.foodMesh) {
        visual.userData.foodMesh.visible = !p.isDead && p.isFoodForm;
        if (p.isFoodForm) {
          visual.userData.foodMesh.rotation.y += 0.04;
        }
      }
    });

    // 3. Sync Projectiles (Zero GC Pooling)
    this.projectilePool.sync(state.projectiles);
  }

  // --- INSTANT CLIENT-SIDE PREDICTION PHYSICS ---
  updateLocalPlayerPrediction(dt) {
    if (!this.myPlayerId || this.isDead || !this.localPlayer.initialized) return;

    const input = this.inputController.getInputPacket();
    const forward = input.forward;
    const strafe = input.right;
    const vertical = input.up;

    const yaw = this.inputController.mouse.yaw;
    const pitch = this.inputController.mouse.pitch;

    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);

    // 3D forward direction (Looking along +Z at yaw=0, facing downfield)
    const fwdX = sinYaw * cosPitch;
    const fwdY = sinPitch * 0.9;
    const fwdZ = cosYaw * cosPitch;

    // Strafe direction (Right is +X at yaw=0, D moves right, A moves left)
    const strX = cosYaw;
    const strZ = -sinYaw;

    // Desired velocities
    const speed = this.localPlayer.speed;
    const targetVx = (fwdX * forward + strX * strafe) * speed;
    const targetVy = (fwdY * forward + vertical) * (speed * 0.85);
    const targetVz = (fwdZ * forward + strZ * strafe) * speed;

    // Smooth inertia damping (Ultra-snappy, agile insect flight - zero input sponginess)
    const smooth = 1 - Math.exp(-22.0 * dt);
    this.localPlayer.vx += (targetVx - this.localPlayer.vx) * smooth;
    this.localPlayer.vy += (targetVy - this.localPlayer.vy) * smooth;
    this.localPlayer.vz += (targetVz - this.localPlayer.vz) * smooth;

    // Aerodynamic banking roll (D banks right, A banks left - cách di chuyển cũ)
    const targetRoll = -strafe * 0.35;
    this.localPlayer.roll += (targetRoll - this.localPlayer.roll) * (1 - Math.exp(-16.0 * dt));

    // Integrate position
    let newX = this.localPlayer.x + this.localPlayer.vx * dt;
    let newY = this.localPlayer.y + this.localPlayer.vy * dt;
    let newZ = this.localPlayer.z + this.localPlayer.vz * dt;

    // Tree cylinder collision check with smooth tangential surface sliding
    for (let i = 0; i < FOREST_TREES.length; i++) {
      const tree = FOREST_TREES[i];
      const dist = Math.hypot(newX - tree.x, newZ - tree.z);
      const minDist = tree.radius + 0.5 * this.localPlayer.scale;
      if (dist < minDist && newY < tree.height) {
        const pushAngle = Math.atan2(newZ - tree.z, newX - tree.x);
        newX = tree.x + Math.cos(pushAngle) * minDist;
        newZ = tree.z + Math.sin(pushAngle) * minDist;

        // Tangential sliding instead of sudden stop
        const normX = Math.cos(pushAngle);
        const normZ = Math.sin(pushAngle);
        const dot = this.localPlayer.vx * normX + this.localPlayer.vz * normZ;
        if (dot < 0) {
          this.localPlayer.vx -= dot * normX;
          this.localPlayer.vz -= dot * normZ;
        }
      }
    }

    // Dynamic ground height clamp (Never clips through undulating forest terrain)
    const groundH = getTerrainHeight(newX, newZ);
    const minHoverY = groundH + 0.6 * this.localPlayer.scale;
    const maxCanopyY = groundH + 16.0;

    if (newY < minHoverY) {
      newY = minHoverY;
      this.localPlayer.vy = Math.max(0, this.localPlayer.vy);
    } else if (newY > maxCanopyY) {
      newY = maxCanopyY;
      this.localPlayer.vy = Math.min(0, this.localPlayer.vy);
    }

    // Strict boundary limits inside the forest (Symmetrical 72m x 72m arena inside 76m ground)
    if (newX >= 36.0) {
      newX = 36.0;
      this.localPlayer.vx = Math.min(0, this.localPlayer.vx);
    } else if (newX <= -36.0) {
      newX = -36.0;
      this.localPlayer.vx = Math.max(0, this.localPlayer.vx);
    }

    if (newZ >= 36.0) {
      newZ = 36.0;
      this.localPlayer.vz = Math.min(0, this.localPlayer.vz);
    } else if (newZ <= -36.0) {
      newZ = -36.0;
      this.localPlayer.vz = Math.max(0, this.localPlayer.vz);
    }

    this.localPlayer.x = newX;
    this.localPlayer.y = newY;
    this.localPlayer.z = newZ;
    this.localPlayer.yaw = yaw;
    this.localPlayer.pitch = pitch;

    // Apply predicted state directly to 3D visual
    const myVisual = this.playerVisuals.get(this.myPlayerId);
    if (myVisual) {
      myVisual.position.set(newX, newY, newZ);
      myVisual.rotation.y = yaw;
      myVisual.rotation.x = pitch * 0.7;
      myVisual.rotation.z = this.localPlayer.roll;
      myVisual.scale.setScalar(this.localPlayer.scale);
      myVisual.visible = !this.isDead;
    }
  }

  updateCamera(dt) {
    const myVisual = this.playerVisuals.get(this.myPlayerId);
    if (!myVisual) return;

    const { yaw, pitch } = this.inputController.mouse;
    const dist = CLIENT_CONFIG.CAMERA_DISTANCE;
    const height = CLIENT_CONFIG.CAMERA_HEIGHT;

    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);

    const fwdX = sinYaw * cosPitch;
    const fwdY = sinPitch;
    const fwdZ = cosYaw * cosPitch;

    // Camera Anti-Motion-Sickness: Soft spring damping hấp thụ rung giật khi va chạm & đổi góc nhìn
    const targetCamX = this.localPlayer.x - fwdX * dist;
    const targetCamY = this.localPlayer.y + height - fwdY * (dist * 0.45);
    const targetCamZ = this.localPlayer.z - fwdZ * dist;

    const camLerp = 1 - Math.exp(-22.0 * dt);
    this.sceneManager.camera.position.x += (targetCamX - this.sceneManager.camera.position.x) * camLerp;
    this.sceneManager.camera.position.y += (targetCamY - this.sceneManager.camera.position.y) * camLerp;
    this.sceneManager.camera.position.z += (targetCamZ - this.sceneManager.camera.position.z) * camLerp;

    // Reticle aimed downfield into the distance (unobstructed rock-solid sightlines)
    const lookDist = CLIENT_CONFIG.CAMERA_LOOK_AHEAD_DIST;
    const targetLookX = this.localPlayer.x + fwdX * lookDist;
    const targetLookY = this.localPlayer.y + 0.5 + fwdY * lookDist;
    const targetLookZ = this.localPlayer.z + fwdZ * lookDist;

    const lookLerp = 1 - Math.exp(-24.0 * dt);
    this.currentLookAt.x += (targetLookX - this.currentLookAt.x) * lookLerp;
    this.currentLookAt.y += (targetLookY - this.currentLookAt.y) * lookLerp;
    this.currentLookAt.z += (targetLookZ - this.currentLookAt.z) * lookLerp;
    this.sceneManager.camera.lookAt(this.currentLookAt);

    // Arena boundary warning check (Within 2m of forest perimeter)
    const isNearBoundary = Math.abs(this.localPlayer.x) > 34.0 || Math.abs(this.localPlayer.z) > 34.0;
    this.uiManager.showBoundaryWarning(isNearBoundary);

    // Aim Assist & Holographic Target Lock Bracket
    if (this.inputController.isPointerLocked && !this.isDead && !this.localPlayer.isFoodForm) {
      this.sceneManager.camera.getWorldDirection(this._camDir);
      this.aimAssist.updateAimAssist(this.myPlayerId, this.playerVisuals, this._camDir);

      if (this.aimAssist.lockedTarget) {
        this._targetPos.copy(this.aimAssist.lockedTarget.position);
        this._targetPos.y += 0.2;
        const distToEnemy = myVisual.position.distanceTo(this._targetPos);

        this._screenVector.copy(this._targetPos).project(this.sceneManager.camera);
        if (this._screenVector.z < 1) {
          const screenX = (this._screenVector.x * 0.5 + 0.5) * window.innerWidth;
          const screenY = (-(this._screenVector.y * 0.5) + 0.5) * window.innerHeight;
          this.uiManager.updateTargetBracket(true, screenX, screenY, distToEnemy);
        } else {
          this.uiManager.updateTargetBracket(false);
        }
      } else {
        this.uiManager.updateTargetBracket(false);
      }
    } else {
      this.uiManager.updateTargetBracket(false);
    }
  }

  startLoop() {
    let lastTime = performance.now();

    const loop = (currentTime) => {
      requestAnimationFrame(loop);

      const now = currentTime || performance.now();
      const deltaMs = now - lastTime;
      if (deltaMs <= 0) return;

      // Only throttle if user explicitly selected 60 FPS on high-refresh monitor
      if (this.targetFps === 60 && deltaMs < 14.5) {
        return;
      } else if (this.targetFps === 120 && deltaMs < 7.0) {
        return;
      }

      const dt = Math.min(deltaMs / 1000, 0.05);
      lastTime = now;

      // 1. High-frequency natural wing flutter (~35Hz)
      const wingAngle = Math.sin(now * 0.045) * 0.65;

      // 2. Rotate food beacon aura
      this.foodVisuals.forEach(group => {
        if (group.visible) {
          group.rotation.y += 1.2 * dt;
        }
      });

      // 2b. Animate Base Outpost Core Crystals & Orbiting Rings
      if (this.baseVisuals) {
        for (const bKey of ['blue', 'red']) {
          const b = this.baseVisuals[bKey];
          if (b && b.userData) {
            if (b.userData.crystal) {
              b.userData.crystal.rotation.y += 1.5 * dt;
              b.userData.crystal.rotation.x = Math.sin(now * 0.002) * 0.12;
            }
            if (b.userData.ring1) {
              b.userData.ring1.rotation.z += 1.8 * dt;
            }
            if (b.userData.ring2) {
              b.userData.ring2.rotation.x += 1.4 * dt;
            }
            if (b.userData.dome) {
              b.userData.dome.rotation.y -= 0.4 * dt;
            }
          }
        }
      }

      // 3. Client-Side Prediction for Local Fly (Frame-rate invariant physics)
      this.updateLocalPlayerPrediction(dt);

      // 4. Smooth Entity Interpolation & Distance LOD for 100+ entities
      const remotePosLerp = 1 - Math.exp(-22.0 * dt);
      const remoteRotLerp = 1 - Math.exp(-18.0 * dt);
      const camPos = this.sceneManager.camera.position;

      for (const [id, visual] of this.playerVisuals.entries()) {
        const isLocal = id === this.myPlayerId;
        const distSq = isLocal ? 0 : camPos.distanceToSquared(visual.position);

        // Distance Culling: flies beyond 75m (in deep fog) are culled completely to save draw calls
        if (!isLocal && distSq > 5625) {
          visual.visible = false;
          if (visual.userData.shadow) visual.userData.shadow.visible = false;
          continue;
        }

        // Wing Animation LOD: Only update wing bone oscillations if fly is within 36m (1296m^2)
        if (isLocal || distSq < 1296) {
          if (visual.userData.wingNodes && visual.userData.wingNodes.length > 0) {
            for (let i = 0; i < visual.userData.wingNodes.length; i++) {
              visual.userData.wingNodes[i].rotation.z = wingAngle;
            }
          } else if (visual.userData.wingL && visual.userData.wingR) {
            visual.userData.wingL.rotation.z = wingAngle;
            visual.userData.wingR.rotation.z = -wingAngle;
          }
        }

        if (isLocal) continue;

        // Smoothly interpolate remote entities towards network targets
        if (visual.userData.targetPos) {
          visual.position.lerp(visual.userData.targetPos, remotePosLerp);
          visual.rotation.y += (visual.userData.targetYaw - visual.rotation.y) * remoteRotLerp;
          visual.rotation.x += ((visual.userData.targetPitch * 0.7) - visual.rotation.x) * remoteRotLerp;
          visual.rotation.z += (visual.userData.targetRoll - visual.rotation.z) * remoteRotLerp;
          const s = visual.userData.targetScale || 1.0;
          visual.scale.set(s, s, s);
          visual.visible = !visual.userData.isDead;
        }
      }

      // 4b. Dynamic Soft Ground Contact Shadows (Culled for entities > 35m from camera)
      for (const visual of this.playerVisuals.values()) {
        if (visual.userData.shadow) {
          if (!visual.visible || visual.userData.isDead) {
            visual.userData.shadow.visible = false;
            continue;
          }

          // Culling shadows for entities farther than 35m (saves 100+ matrix & terrain updates per frame)
          const distSq = camPos.distanceToSquared(visual.position);
          if (distSq > 1225) {
            visual.userData.shadow.visible = false;
            continue;
          }

          visual.userData.shadow.visible = true;
          const groundY = getTerrainHeight(visual.position.x, visual.position.z);
          visual.userData.shadow.position.set(visual.position.x, groundY + 0.04, visual.position.z);

          const altitude = Math.max(0.1, visual.position.y - groundY);
          const shadowScale = Math.min(2.2, 0.85 + altitude * 0.12);
          visual.userData.shadow.scale.set(shadowScale, 1, shadowScale);
          visual.userData.shadow.material.opacity = Math.max(0.08, 0.52 - altitude * 0.045);
          visual.userData.shadow.updateMatrix();
        }
      }

      // 4c. Zero-GC Particle System update (Hit Sparks, Food Bursts)
      this.particleSystem.update(dt);

      // 5. Cinematic Frame-Rate Independent 3rd-Person Camera
      this.updateCamera(dt);

      // 6. High-Fidelity WebGL Render (with animated pollen dust motes)
      this.sceneManager.render(dt);
    };

    requestAnimationFrame(loop);
  }
}

new Game();
