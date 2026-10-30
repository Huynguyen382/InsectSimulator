export class UIManager {
  constructor() {
    this.dom = {
      lobbyScreen: document.getElementById('lobby-screen'),
      playerNameInput: document.getElementById('player-name'),
      btnSoloPractice: document.getElementById('btn-solo-practice'),
      btnFindMatch: document.getElementById('btn-find-match'),
      queueStatus: document.getElementById('queue-status'),
      queuePos: document.getElementById('queue-pos'),
      preloadBox: document.getElementById('preload-box'),
      preloadStatus: document.getElementById('preload-status'),
      preloadPercent: document.getElementById('preload-percent'),
      preloadBarFill: document.getElementById('preload-bar-fill'),

      // Custom Room UI Elements
      btnCreateRoom: document.getElementById('btn-create-room'),
      inputRoomCode: document.getElementById('input-room-code'),
      btnJoinRoom: document.getElementById('btn-join-room'),
      roomErrorMsg: document.getElementById('room-error-msg'),
      customRoomModal: document.getElementById('custom-room-modal'),
      displayRoomCode: document.getElementById('display-room-code'),
      btnCopyCode: document.getElementById('btn-copy-code'),
      blueRoster: document.getElementById('blue-roster'),
      redRoster: document.getElementById('red-roster'),
      blueCount: document.getElementById('blue-count'),
      redCount: document.getElementById('red-count'),
      btnSwitchTeam: document.getElementById('btn-switch-team'),
      btnLeaveRoom: document.getElementById('btn-leave-room'),
      btnStartCustomMatch: document.getElementById('btn-start-custom-match'),
      openRoomsList: document.getElementById('open-rooms-list'),
      btnRefreshRooms: document.getElementById('btn-refresh-rooms'),

      // In-game HUD
      gameHud: document.getElementById('game-hud'),
      boundaryWarning: document.getElementById('boundary-warning'),
      scoreBlue: document.getElementById('score-blue'),
      scoreRed: document.getElementById('score-red'),
      myTeamBadge: document.getElementById('my-team-badge'),
      matchTimer: document.getElementById('match-timer'),
      pingCounter: document.getElementById('ping-counter'),
      crosshair: document.getElementById('crosshair'),
      noAmmoReticle: document.getElementById('no-ammo-reticle'),
      targetBracket: document.getElementById('target-bracket'),
      targetDistance: document.getElementById('target-distance'),
      hpText: document.getElementById('hp-text'),
      hpBarFill: document.getElementById('hp-bar-fill'),
      ammoText: document.getElementById('ammo-text'),
      ammoPills: document.getElementById('ammo-pills'),
      ammoWarning: document.getElementById('ammo-warning'),
      eatContainer: document.getElementById('eat-container'),
      eatBarFill: document.getElementById('eat-bar-fill'),
      levelText: document.getElementById('level-text'),
      xpText: document.getElementById('xp-text'),
      xpBarFill: document.getElementById('xp-bar-fill'),
      killFeed: document.getElementById('kill-feed'),
      levelupModal: document.getElementById('levelup-modal'),
      upgradeCards: document.getElementById('upgrade-cards'),
      respawnOverlay: document.getElementById('respawn-overlay'),
      respawnTimer: document.getElementById('respawn-timer'),
      deathCardTitle: document.getElementById('death-card-title'),
      deathCardDesc: document.getElementById('death-card-desc'),
      hudToast: document.getElementById('hud-toast'),

      // Food Form Survival HUD
      foodFormHud: document.getElementById('food-form-hud'),
      foodFormBarFill: document.getElementById('food-form-bar-fill'),
      foodFormTimerText: document.getElementById('food-form-timer-text'),
      foodFormHearts: document.getElementById('food-form-hearts'),
      foodFormEatenCounter: document.getElementById('food-form-eaten-counter'),
      heart1: document.getElementById('heart-1'),
      heart2: document.getElementById('heart-2'),
      heart3: document.getElementById('heart-3'),

      // Base Outposts HUD
      baseBlueBarFill: document.getElementById('base-blue-bar-fill'),
      baseBlueHpText: document.getElementById('base-blue-hp-text'),
      baseCardBlue: document.getElementById('base-card-blue'),
      baseRedBarFill: document.getElementById('base-red-bar-fill'),
      baseRedHpText: document.getElementById('base-red-hp-text'),
      baseCardRed: document.getElementById('base-card-red'),

      // Game Over / Match End Modal
      gameoverModal: document.getElementById('gameover-modal'),
      gameoverBanner: document.getElementById('gameover-banner'),
      goScoreBlue: document.getElementById('go-score-blue'),
      goScoreRed: document.getElementById('go-score-red'),
      goMvpName: document.getElementById('go-mvp-name'),
      goScoreboardBody: document.getElementById('go-scoreboard-body'),
      goReturnTimer: document.getElementById('go-return-timer'),
      btnReturnLobby: document.getElementById('btn-return-lobby'),

      // In-game Leave Match UI
      btnInGameLeave: document.getElementById('btn-in-game-leave'),
      confirmLeaveModal: document.getElementById('confirm-leave-modal'),
      btnCancelLeave: document.getElementById('btn-cancel-leave'),
      btnConfirmLeave: document.getElementById('btn-confirm-leave'),

      // Game Guide UI Elements
      btnOpenGuide: document.getElementById('btn-open-guide'),
      btnInGameGuide: document.getElementById('btn-in-game-guide'),
      guideModal: document.getElementById('guide-modal'),
      btnCloseGuide: document.getElementById('btn-close-guide'),
      btnCloseGuideX: document.getElementById('btn-close-guide-x')
    };

    this.initAmmoPills(20);
  }

  setPreloadProgress(percent, statusText) {
    if (this.dom.preloadPercent) this.dom.preloadPercent.innerText = `${percent}%`;
    if (this.dom.preloadBarFill) this.dom.preloadBarFill.style.width = `${percent}%`;
    if (this.dom.preloadStatus && statusText) this.dom.preloadStatus.innerText = statusText;

    if (percent >= 100) {
      setTimeout(() => {
        if (this.dom.btnSoloPractice) {
          this.dom.btnSoloPractice.disabled = false;
          this.dom.btnSoloPractice.classList.remove('disabled');
        }
        if (this.dom.btnFindMatch) {
          this.dom.btnFindMatch.disabled = false;
          this.dom.btnFindMatch.classList.remove('disabled');
        }
        if (this.dom.btnCreateRoom) {
          this.dom.btnCreateRoom.disabled = false;
          this.dom.btnCreateRoom.classList.remove('disabled');
        }
        if (this.dom.btnJoinRoom) {
          this.dom.btnJoinRoom.disabled = false;
          this.dom.btnJoinRoom.classList.remove('disabled');
        }
        if (this.dom.preloadStatus) {
          this.dom.preloadStatus.innerText = '✅ Cánh rừng đã sẵn sàng! Chúc bạn bay lượn vui vẻ.';
        }
      }, 300);
    }
  }

  showBoundaryWarning(visible) {
    if (!this.dom.boundaryWarning) return;
    if (visible) this.dom.boundaryWarning.classList.remove('hidden');
    else this.dom.boundaryWarning.classList.add('hidden');
  }

  updateTargetBracket(visible, x = 0, y = 0, dist = 0) {
    if (!this.dom.targetBracket) return;
    if (visible) {
      this.dom.targetBracket.classList.remove('hidden');
      this.dom.targetBracket.style.left = `${x}px`;
      this.dom.targetBracket.style.top = `${y}px`;
      if (this.dom.targetDistance) {
        this.dom.targetDistance.innerText = `${Math.round(dist)}m`;
      }
    } else {
      this.dom.targetBracket.classList.add('hidden');
    }
  }

  initAmmoPills(maxCount = 20) {
    this.dom.ammoPills.innerHTML = '';
    for (let i = 0; i < maxCount; i++) {
      const pill = document.createElement('div');
      pill.className = 'ammo-pill';
      pill.id = `ammo-pill-${i}`;
      this.dom.ammoPills.appendChild(pill);
    }
  }

  updateHUD(player) {
    // Health
    this.dom.hpText.innerText = `${Math.max(0, player.hp)} / ${player.maxHp}`;
    this.dom.hpBarFill.style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;

    // Ammo status: hiển thị chính xác đạn hiện tại / đạn tối đa
    const currentAmmo = typeof player.ammo === 'number' && !isNaN(player.ammo) ? Math.max(0, Math.round(player.ammo)) : 0;
    const maxAmmo = typeof player.maxAmmo === 'number' && !isNaN(player.maxAmmo) ? Math.max(1, Math.round(player.maxAmmo)) : 20;

    if (this.dom.ammoPills.children.length !== maxAmmo) {
      this.initAmmoPills(maxAmmo);
    }
    this.dom.ammoText.innerText = `${currentAmmo} / ${maxAmmo}`;
    for (let i = 0; i < maxAmmo; i++) {
      const pill = document.getElementById(`ammo-pill-${i}`);
      if (pill) {
        if (i < currentAmmo) pill.classList.remove('empty');
        else pill.classList.add('empty');
      }
    }

    if (currentAmmo <= 0) {
      this.dom.ammoWarning.classList.remove('hidden');
      if (this.dom.noAmmoReticle) this.dom.noAmmoReticle.classList.remove('hidden');
      if (this.dom.crosshair) this.dom.crosshair.classList.add('no-ammo');
    } else {
      this.dom.ammoWarning.classList.add('hidden');
      if (this.dom.noAmmoReticle) this.dom.noAmmoReticle.classList.add('hidden');
      if (this.dom.crosshair) this.dom.crosshair.classList.remove('no-ammo');
    }

    // Level & XP
    this.dom.levelText.innerText = player.level;
    this.dom.xpText.innerText = `${player.xp} / ${player.xpToNext} XP`;
    this.dom.xpBarFill.style.width = `${(player.xp / player.xpToNext) * 100}%`;

    // Eating
    if (player.isEating && !player.isFoodForm) {
      this.dom.eatContainer.classList.remove('hidden');
      this.dom.eatBarFill.style.width = `${(player.eatProgress / 2.0) * 100}%`;
    } else {
      this.dom.eatContainer.classList.add('hidden');
    }

    // Respawn Overlay
    if (player.isDead) {
      this.dom.respawnOverlay.classList.remove('hidden');
      this.dom.respawnTimer.innerText = player.respawnTimer;
      if (this.dom.foodFormHud) this.dom.foodFormHud.classList.add('hidden');
    } else {
      this.dom.respawnOverlay.classList.add('hidden');
    }
  }

  updateFoodFormHUD(player) {
    if (!this.dom.foodFormHud) return;

    if (player.isFoodForm && !player.isDead) {
      this.dom.foodFormHud.classList.remove('hidden');
      const remaining = Math.max(0, player.foodFormTimer || 0);
      const percent = Math.max(0, Math.min(100, (remaining / 10.0) * 100));
      if (this.dom.foodFormBarFill) this.dom.foodFormBarFill.style.width = `${percent}%`;
      if (this.dom.foodFormTimerText) this.dom.foodFormTimerText.innerText = `${remaining.toFixed(1)}s`;

      const eaten = player.timesEaten || 0;
      if (this.dom.foodFormEatenCounter) this.dom.foodFormEatenCounter.innerText = `${eaten} / 3`;

      // Cập nhật biểu tượng trái tim mạng sống (bị ăn >= 1 -> 💔, >= 2 -> 💔, >= 3 -> 💔)
      if (this.dom.heart1) this.dom.heart1.innerText = eaten >= 1 ? '💔' : '❤️';
      if (this.dom.heart2) this.dom.heart2.innerText = eaten >= 2 ? '💔' : '❤️';
      if (this.dom.heart3) this.dom.heart3.innerText = eaten >= 3 ? '💔' : '❤️';
    } else {
      this.dom.foodFormHud.classList.add('hidden');
    }
  }

  updateScores(scores) {
    this.dom.scoreBlue.innerText = scores.blue;
    this.dom.scoreRed.innerText = scores.red;
  }

  updateBases(bases) {
    if (!bases) return;

    if (bases.blue && this.dom.baseBlueBarFill && this.dom.baseBlueHpText) {
      const hp = Math.max(0, bases.blue.hp);
      const maxHp = bases.blue.maxHp || 1000;
      const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
      this.dom.baseBlueBarFill.style.width = `${pct}%`;
      this.dom.baseBlueHpText.innerText = `${hp} HP`;
      if (pct <= 25) {
        this.dom.baseBlueBarFill.classList.add('critical');
      } else {
        this.dom.baseBlueBarFill.classList.remove('critical');
      }
    }

    if (bases.red && this.dom.baseRedBarFill && this.dom.baseRedHpText) {
      const hp = Math.max(0, bases.red.hp);
      const maxHp = bases.red.maxHp || 1000;
      const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
      this.dom.baseRedBarFill.style.width = `${pct}%`;
      this.dom.baseRedHpText.innerText = `${hp} HP`;
      if (pct <= 25) {
        this.dom.baseRedBarFill.classList.add('critical');
      } else {
        this.dom.baseRedBarFill.classList.remove('critical');
      }
    }
  }

  flashBaseHit(baseKey) {
    const card = baseKey === 'blue' ? this.dom.baseCardBlue : this.dom.baseCardRed;
    if (card) {
      card.classList.remove('hit-flash');
      void card.offsetWidth; // Force CSS reflow to re-trigger animation
      card.classList.add('hit-flash');
    }
  }

  setTeamBadge(team, isPractice = false) {
    const teamName = team === 0 ? 'PHE XANH' : 'PHE ĐỎ';
    const modeName = isPractice ? ' (BOT)' : '';
    this.dom.myTeamBadge.innerText = `${teamName}${modeName}`;
    this.dom.myTeamBadge.style.color = team === 0 ? '#60a5fa' : '#f87171';
  }

  setCrosshairLocked(isLocked) {
    if (isLocked) this.dom.crosshair.classList.add('locked');
    else this.dom.crosshair.classList.remove('locked');
  }

  showLevelUpModal(choices, onSelect) {
    this.dom.upgradeCards.innerHTML = '';
    choices.forEach(c => {
      const card = document.createElement('div');
      card.className = 'card-item';
      card.innerHTML = `
        <div class="card-name">${c.name}</div>
        <div class="card-desc">${c.desc}</div>
        <button class="card-btn">CHỌN</button>
      `;
      card.onclick = () => {
        onSelect(c.id);
        this.dom.levelupModal.classList.add('hidden');
      };
      this.dom.upgradeCards.appendChild(card);
    });

    this.dom.levelupModal.classList.remove('hidden');
  }

  addKillFeedEntry(killerName, victimName, assisters = [], options = {}) {
    if (!this.dom.killFeed) return;

    // Strict throttle: max 3 floating items to prevent screen clutter
    while (this.dom.killFeed.children.length >= 3) {
      const oldest = this.dom.killFeed.children[0];
      oldest.remove();
    }

    const item = document.createElement('div');
    item.className = 'kill-item';
    if (options.border === 'red') item.classList.add('red-border');
    else if (options.border === 'gold') item.classList.add('gold-border');

    let assistText = '';
    if (assisters && assisters.length > 0) {
      assistText = ` <span style="color:#94a3b8; font-size:0.7rem;">(+${assisters.join(', ')})</span>`;
    }

    if (options.customHtml) {
      item.innerHTML = options.customHtml;
    } else {
      item.innerHTML = `<span class="feed-killer">${killerName}</span> <span class="feed-icon">⚔️</span> <span class="feed-victim">${victimName}</span>${assistText}`;
    }

    this.dom.killFeed.appendChild(item);

    setTimeout(() => {
      item.classList.add('fade-out');
      setTimeout(() => item.remove(), 250);
    }, 2800);
  }

  showToast(message, type = 'normal', durationMs = 2400) {
    if (!this.dom.hudToast) return;
    this.dom.hudToast.className = `hud-toast ${type}`;
    this.dom.hudToast.innerHTML = message;
    this.dom.hudToast.classList.remove('hidden');

    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      if (this.dom.hudToast) {
        this.dom.hudToast.classList.add('hidden');
      }
    }, durationMs);
  }

  setQueueStatus(visible, pos = 1) {
    if (visible) {
      this.dom.queueStatus.classList.remove('hidden');
      this.dom.queuePos.innerText = pos;
    } else {
      this.dom.queueStatus.classList.add('hidden');
    }
  }

  switchToGameView() {
    this.dom.lobbyScreen.classList.add('hidden');
    if (this.dom.customRoomModal) this.dom.customRoomModal.classList.add('hidden');
    if (this.dom.gameoverModal) this.dom.gameoverModal.classList.add('hidden');
    if (this.dom.confirmLeaveModal) this.dom.confirmLeaveModal.classList.add('hidden');
    if (this.dom.guideModal) this.dom.guideModal.classList.add('hidden');
    this.dom.gameHud.classList.remove('hidden');
  }

  switchToLobbyView() {
    this.dom.gameHud.classList.add('hidden');
    if (this.dom.foodFormHud) this.dom.foodFormHud.classList.add('hidden');
    if (this.dom.customRoomModal) this.dom.customRoomModal.classList.add('hidden');
    if (this.dom.gameoverModal) this.dom.gameoverModal.classList.add('hidden');
    if (this.dom.levelupModal) this.dom.levelupModal.classList.add('hidden');
    if (this.dom.respawnOverlay) this.dom.respawnOverlay.classList.add('hidden');
    if (this.dom.confirmLeaveModal) this.dom.confirmLeaveModal.classList.add('hidden');
    if (this.dom.guideModal) this.dom.guideModal.classList.add('hidden');
    this.dom.lobbyScreen.classList.remove('hidden');
  }

  showConfirmLeave() {
    if (this.dom.confirmLeaveModal) {
      this.dom.confirmLeaveModal.classList.remove('hidden');
    }
  }

  hideConfirmLeave() {
    if (this.dom.confirmLeaveModal) {
      this.dom.confirmLeaveModal.classList.add('hidden');
    }
  }

  isConfirmLeaveOpen() {
    return Boolean(this.dom.confirmLeaveModal && !this.dom.confirmLeaveModal.classList.contains('hidden'));
  }

  showGuideModal() {
    if (this.dom.guideModal) {
      this.dom.guideModal.classList.remove('hidden');
    }
  }

  hideGuideModal() {
    if (this.dom.guideModal) {
      this.dom.guideModal.classList.add('hidden');
    }
  }

  isGuideModalOpen() {
    return Boolean(this.dom.guideModal && !this.dom.guideModal.classList.contains('hidden'));
  }

  isLevelUpOpen() {
    return Boolean(this.dom.levelupModal && !this.dom.levelupModal.classList.contains('hidden'));
  }

  setPing(ms) {
    if (this.dom.pingCounter) {
      this.dom.pingCounter.innerText = Math.round(ms);
      if (ms < 50) this.dom.pingCounter.style.color = '#4ade80';
      else if (ms < 120) this.dom.pingCounter.style.color = '#fbbf24';
      else this.dom.pingCounter.style.color = '#f87171';
    }
  }

  updateMatchTimer(secondsRemaining) {
    if (!this.dom.matchTimer) return;
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;
    this.dom.matchTimer.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  renderOpenRooms(rooms, onJoin) {
    if (!this.dom.openRoomsList) return;
    this.dom.openRoomsList.innerHTML = '';

    if (!rooms || rooms.length === 0) {
      this.dom.openRoomsList.innerHTML = '<span class="no-rooms-hint">Chưa có phòng nào. Hãy tạo phòng mới hoặc rủ bạn bè!</span>';
      return;
    }

    rooms.forEach(r => {
      const item = document.createElement('div');
      item.className = 'open-room-item';
      item.innerHTML = `
        <div class="room-item-info">
          <span class="room-item-code">#${r.code}</span>
          <span class="room-item-host">👑 ${r.hostName}</span>
          <span class="room-item-count">(${r.playerCount}/${r.maxPlayers})</span>
        </div>
        <button class="btn-join-fast" ${r.playerCount >= r.maxPlayers ? 'disabled style="opacity:0.5"' : ''}>
          ${r.playerCount >= r.maxPlayers ? 'ĐẦY' : 'VÀO'}
        </button>
      `;

      if (r.playerCount < r.maxPlayers) {
        const btn = item.querySelector('.btn-join-fast');
        btn.onclick = () => onJoin(r.code);
      }

      this.dom.openRoomsList.appendChild(item);
    });
  }

  showGameOver(data, myTeam, onReturn) {
    if (!this.dom.gameoverModal) return;

    // Victory / Defeat Banner
    const isBaseDestroyed = data.reason === 'BASE_DESTROYED';
    if (data.winnerTeam === -1) {
      this.dom.gameoverBanner.className = 'gameover-banner draw';
      this.dom.gameoverBanner.innerText = '🤝 TRẬN ĐẤU BÒA!';
    } else if (data.winnerTeam === myTeam) {
      this.dom.gameoverBanner.className = 'gameover-banner victory';
      this.dom.gameoverBanner.innerText = isBaseDestroyed
        ? '🏆 CHIẾN THẮNG!\nĐÃ PHÁ HỦY HOÀN TOÀN CỨ ĐIỂM ĐỐI THỦ!'
        : '🏆 CHIẾN THẮNG!';
    } else {
      this.dom.gameoverBanner.className = 'gameover-banner defeat';
      this.dom.gameoverBanner.innerText = isBaseDestroyed
        ? '💀 THẤT BẠI!\nCỨ ĐIỂM CỦA PHE BẠN ĐÃ BỊ PHÁ HỦY!'
        : '💀 THẤT BẠI!';
    }

    // Final Scores
    if (this.dom.goScoreBlue) this.dom.goScoreBlue.innerText = data.scores.blue;
    if (this.dom.goScoreRed) this.dom.goScoreRed.innerText = data.scores.red;

    // MVP
    if (this.dom.goMvpName && data.mvp) {
      this.dom.goMvpName.innerText = `${data.mvp.name} (Hạ gục: ${data.mvp.kills} | Sát thương: ${data.mvp.damageDealt})`;
    }

    // Scoreboard Table
    if (this.dom.goScoreboardBody && data.scoreboard) {
      this.dom.goScoreboardBody.innerHTML = '';
      data.scoreboard.forEach((p, idx) => {
        const tr = document.createElement('tr');
        tr.className = p.team === 0 ? 'team-blue' : 'team-red';
        if (idx === 0) tr.classList.add('is-mvp');
        tr.innerHTML = `
          <td>${idx === 0 ? '👑 ' : ''}${p.name}</td>
          <td>${p.team === 0 ? 'Xanh' : 'Đỏ'}</td>
          <td>${p.kills}</td>
          <td>${p.assists}</td>
          <td>${p.damageDealt}</td>
          <td>${p.foodEaten}</td>
          <td><b>${p.score}</b></td>
        `;
        this.dom.goScoreboardBody.appendChild(tr);
      });
    }

    // Return Countdown
    if (this.dom.goReturnTimer) {
      this.dom.goReturnTimer.innerText = data.returnCountdown || 10;
    }

    if (this.dom.btnReturnLobby) {
      this.dom.btnReturnLobby.onclick = () => {
        if (onReturn) onReturn();
      };
    }

    this.dom.gameoverModal.classList.remove('hidden');
  }

  updateGameOverCountdown(seconds) {
    if (this.dom.goReturnTimer) {
      this.dom.goReturnTimer.innerText = seconds;
    }
  }

  hideGameOver() {
    if (this.dom.gameoverModal) {
      this.dom.gameoverModal.classList.add('hidden');
    }
  }

  addChatMessage(senderName, team, message, isTeamOnly) {
    if (!this.dom.killFeed) return;

    while (this.dom.killFeed.children.length >= 3) {
      const oldest = this.dom.killFeed.children[0];
      oldest.remove();
    }

    const item = document.createElement('div');
    item.className = 'kill-item';
    const teamColor = team === 0 ? '#60a5fa' : '#f87171';
    const tag = isTeamOnly ? '[ĐỘI] ' : '';
    item.innerHTML = `<span style="color:${teamColor}; font-weight:700;">${tag}${senderName}:</span> <span style="color:#f8fafc;">${message}</span>`;
    this.dom.killFeed.appendChild(item);

    setTimeout(() => {
      item.classList.add('fade-out');
      setTimeout(() => item.remove(), 250);
    }, 3200);
  }

  // --- CUSTOM ROOM MODAL RENDERING ---
  showCustomRoomModal(roomCode, players, myPlayerId, hostId) {
    this.dom.displayRoomCode.innerText = roomCode;
    this.dom.roomErrorMsg.classList.add('hidden');

    const bluePlayers = players.filter(p => p.team === 0);
    const redPlayers = players.filter(p => p.team === 1);

    this.dom.blueCount.innerText = bluePlayers.length;
    this.dom.redCount.innerText = redPlayers.length;

    // Render Blue Roster
    this.dom.blueRoster.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const p = bluePlayers[i];
      const slot = document.createElement('div');
      if (p) {
        slot.className = `player-slot ${p.id === myPlayerId ? 'is-me' : ''}`;
        slot.innerHTML = `
          <div class="player-name-wrapper">
            <span>🦟 ${p.name}</span>
            ${p.isHost ? '<span class="host-badge-tag">CHỦ PHÒNG</span>' : ''}
            ${p.id === myPlayerId ? '<span class="you-badge-tag">BẠN</span>' : ''}
          </div>
          <span style="color:#60a5fa; font-weight:700;">SẴN SÀNG</span>
        `;
      } else {
        slot.className = 'player-slot slot-empty';
        slot.innerHTML = '<span>➕ Trống (Sẽ tự thêm Bot nếu bắt đầu)</span>';
      }
      this.dom.blueRoster.appendChild(slot);
    }

    // Render Red Roster
    this.dom.redRoster.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const p = redPlayers[i];
      const slot = document.createElement('div');
      if (p) {
        slot.className = `player-slot ${p.id === myPlayerId ? 'is-me' : ''}`;
        slot.innerHTML = `
          <div class="player-name-wrapper">
            <span>🦟 ${p.name}</span>
            ${p.isHost ? '<span class="host-badge-tag">CHỦ PHÒNG</span>' : ''}
            ${p.id === myPlayerId ? '<span class="you-badge-tag">BẠN</span>' : ''}
          </div>
          <span style="color:#f87171; font-weight:700;">SẴN SÀNG</span>
        `;
      } else {
        slot.className = 'player-slot slot-empty';
        slot.innerHTML = '<span>➕ Trống (Sẽ tự thêm Bot nếu bắt đầu)</span>';
      }
      this.dom.redRoster.appendChild(slot);
    }

    // Host Start Button control
    const isHost = myPlayerId === hostId;
    if (isHost) {
      this.dom.btnStartCustomMatch.classList.remove('hidden');
    } else {
      this.dom.btnStartCustomMatch.classList.add('hidden');
    }

    this.dom.customRoomModal.classList.remove('hidden');
  }

  hideCustomRoomModal() {
    this.dom.customRoomModal.classList.add('hidden');
  }

  showRoomError(message) {
    this.dom.roomErrorMsg.innerText = `⚠️ ${message}`;
    this.dom.roomErrorMsg.classList.remove('hidden');
    setTimeout(() => {
      this.dom.roomErrorMsg.classList.add('hidden');
    }, 4500);
  }

  getPlayerName() {
    return this.dom.playerNameInput.value.trim() || 'FlyPilot';
  }
}
