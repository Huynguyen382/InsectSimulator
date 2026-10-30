const CONFIG = require('../config/gameConfig');
const Player = require('../entities/Player');
const Bot = require('../entities/Bot');
const GameRoom = require('./GameRoom');

class Matchmaker {
  constructor() {
    // Separate matchmaking queues per platform (PC vs Mobile never mix)
    this.queues = {
      pc: [],
      mobile: []
    };
    this.queueTimers = {
      pc: null,
      mobile: null
    };

    this.rooms = new Map();
    this.customRooms = new Map();
    this.playerToRoom = new Map(); // O(1) instantaneous lookup map for 100+ players
    this.nextRoomId = 1;
    this.lobbySockets = new Set(); // Sockets currently browsing lobby
  }

  normalizePlatform(platform) {
    return platform === 'mobile' ? 'mobile' : 'pc';
  }

  registerLobbySocket(ws) {
    this.lobbySockets.add(ws);
    // Send initial list of rooms
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'CUSTOM_ROOMS_LIST',
        rooms: this.getPublicRooms()
      }));
    }
  }

  unregisterLobbySocket(ws) {
    this.lobbySockets.delete(ws);
  }

  broadcastLobbyRooms() {
    const data = JSON.stringify({
      type: 'CUSTOM_ROOMS_LIST',
      rooms: this.getPublicRooms()
    });

    for (const ws of this.lobbySockets) {
      if (ws.readyState === 1) {
        ws.send(data);
      } else {
        this.lobbySockets.delete(ws);
      }
    }
  }

  getPublicRooms() {
    const list = [];
    for (const room of this.customRooms.values()) {
      const host = room.players.find(p => p.id === room.hostId);
      const blueCount = room.players.filter(p => p.team === 0).length;
      const redCount = room.players.filter(p => p.team === 1).length;
      list.push({
        code: room.code,
        hostName: host ? host.name : 'Unknown',
        platform: room.platform || 'pc',
        playerCount: room.players.length,
        maxPlayers: CONFIG.MATCH_SIZE,
        blueCount,
        redCount
      });
    }
    return list;
  }

  // --- SOLO PRACTICE (1 Human + 5 Bots) ---
  startSoloPractice(playerInfo) {
    this.removePlayerFromAllLobbies(playerInfo.id);

    const platform = this.normalizePlatform(playerInfo.platform);
    const roomId = this.nextRoomId++;
    const humanPlayer = new Player(playerInfo.id, playerInfo.name, 0, playerInfo.ws, false);
    humanPlayer.platform = platform;

    // Create 5 Bots to form a full 3v3 simulation (2 blue allies, 3 red enemies)
    const bots = [
      new Bot('bot_b1', 'Ruồi Tiêm Kích A', 0),
      new Bot('bot_b2', 'Ruồi Hộ Vệ B', 0),
      new Bot('bot_r1', 'Ruồi Sát Thủ 1', 1),
      new Bot('bot_r2', 'Ruồi Bắn Tỉa 2', 1),
      new Bot('bot_r3', 'Ruồi Đột Kích 3', 1)
    ];

    const allParticipants = [humanPlayer, ...bots];
    const room = new GameRoom(roomId, allParticipants, true, (id) => this.removeRoom(id));
    room.platform = platform;
    this.rooms.set(roomId, room);
    allParticipants.forEach(p => this.playerToRoom.set(p.id, room));

    // Notify human player
    if (playerInfo.ws && playerInfo.ws.readyState === 1) {
      playerInfo.ws.send(JSON.stringify({
        type: 'MATCH_FOUND',
        roomId,
        playerId: humanPlayer.id,
        team: humanPlayer.team,
        platform,
        isPractice: true,
        trees: room.treeObstacles,
        foodSpots: room.foodSpots,
        targetScore: room.targetScore,
        matchDuration: room.matchDuration
      }));
    }

    return room;
  }

  // --- AUTOMATIC 3V3 QUEUE MATCHMAKING (SEPARATE PC & MOBILE QUEUES) ---
  enqueue(playerInfo) {
    this.removePlayerFromAllLobbies(playerInfo.id);

    const platform = this.normalizePlatform(playerInfo.platform);
    playerInfo.platform = platform;

    this.queues[platform].push(playerInfo);
    this.notifyQueueStatus(platform);

    // If queue is full (6 players on this platform), start match immediately
    if (this.queues[platform].length >= CONFIG.MATCH_SIZE) {
      this.launchMatchFromQueue(platform);
      return;
    }

    // Auto-fill bots countdown if waiting
    if (!this.queueTimers[platform]) {
      this.queueTimers[platform] = setTimeout(() => {
        this.queueTimers[platform] = null;
        if (this.queues[platform].length > 0) {
          this.launchMatchWithBots(platform);
        }
      }, CONFIG.QUEUE_AUTOSTART_TIMEOUT_MS);
    }
  }

  launchMatchWithBots(platform) {
    if (!platform || !this.queues[platform]) platform = 'pc';
    const queue = this.queues[platform];
    if (queue.length === 0) return;

    const roomId = this.nextRoomId++;
    const humans = queue.splice(0, CONFIG.MATCH_SIZE);

    const playersList = [];
    // Assign humans to teams alternately
    humans.forEach((h, idx) => {
      const team = idx % 2 === 0 ? 0 : 1;
      const player = new Player(h.id, h.name, team, h.ws, false);
      player.platform = platform;
      playersList.push(player);
    });

    // Fill remaining slots with Bots to reach 6 players (3v3)
    let botCounter = 1;
    const botTitles = ['Sát Thủ', 'Tiêm Kích', 'Đột Kích', 'Cơ Động', 'Hộ Vệ'];
    while (playersList.length < CONFIG.MATCH_SIZE) {
      const blueCount = playersList.filter(p => p.team === 0).length;
      const redCount = playersList.filter(p => p.team === 1).length;
      const team = blueCount <= redCount ? 0 : 1;
      const teamName = team === 0 ? 'Xanh' : 'Đỏ';
      const title = botTitles[(botCounter - 1) % botTitles.length];

      playersList.push(new Bot(`bot_${botCounter}`, `Ruồi ${teamName} ${title}`, team));
      botCounter++;
    }

    const room = new GameRoom(roomId, playersList, false, (id) => this.removeRoom(id));
    room.platform = platform;
    this.rooms.set(roomId, room);
    playersList.forEach(p => this.playerToRoom.set(p.id, room));

    // Notify all human players
    playersList.forEach(p => {
      if (!p.isBot && p.ws && p.ws.readyState === 1) {
        p.ws.send(JSON.stringify({
          type: 'MATCH_FOUND',
          roomId,
          playerId: p.id,
          team: p.team,
          platform,
          isPractice: false,
          trees: room.treeObstacles,
          foodSpots: room.foodSpots,
          targetScore: room.targetScore,
          matchDuration: room.matchDuration
        }));
      }
    });
  }

  launchMatchFromQueue(platform) {
    if (this.queueTimers[platform]) {
      clearTimeout(this.queueTimers[platform]);
      this.queueTimers[platform] = null;
    }
    this.launchMatchWithBots(platform);
  }

  dequeue(playerId) {
    ['pc', 'mobile'].forEach(platform => {
      const prevLen = this.queues[platform].length;
      this.queues[platform] = this.queues[platform].filter(p => p.id !== playerId);
      if (this.queues[platform].length !== prevLen) {
        this.notifyQueueStatus(platform);
        if (this.queues[platform].length === 0 && this.queueTimers[platform]) {
          clearTimeout(this.queueTimers[platform]);
          this.queueTimers[platform] = null;
        }
      }
    });
  }

  notifyQueueStatus(platform) {
    if (!platform || !this.queues[platform]) return;
    const queue = this.queues[platform];
    queue.forEach((p, idx) => {
      if (p.ws && p.ws.readyState === 1) {
        p.ws.send(JSON.stringify({
          type: 'QUEUE_STATUS',
          platform,
          position: idx + 1,
          total: queue.length
        }));
      }
    });
  }

  // --- CUSTOM ROOM SYSTEM (TẠO PHÒNG & GHÉP ĐỘI CHỦ ĐỘNG) ---
  generateRoomCode() {
    let code;
    do {
      code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (this.customRooms.has(code));
    return code;
  }

  createCustomRoom(playerInfo) {
    this.removePlayerFromAllLobbies(playerInfo.id);

    const platform = this.normalizePlatform(playerInfo.platform);
    const code = this.generateRoomCode();
    const room = {
      code,
      hostId: playerInfo.id,
      platform,
      players: [
        { id: playerInfo.id, name: playerInfo.name || 'FlyPilot', ws: playerInfo.ws, team: 0, isHost: true }
      ]
    };

    this.customRooms.set(code, room);
    this.broadcastCustomRoomState(room);
    this.broadcastLobbyRooms();
    return room;
  }

  joinCustomRoom(roomCode, playerInfo) {
    this.removePlayerFromAllLobbies(playerInfo.id);

    const platform = this.normalizePlatform(playerInfo.platform);
    const code = (roomCode || '').toString().trim();
    const room = this.customRooms.get(code);

    if (!room) {
      if (playerInfo.ws && playerInfo.ws.readyState === 1) {
        playerInfo.ws.send(JSON.stringify({
          type: 'CUSTOM_ROOM_ERROR',
          message: `Không tìm thấy phòng với mã "${code}"!`
        }));
      }
      return null;
    }

    // Platform validation: Mobile can only join Mobile rooms, PC can only join PC rooms
    if (room.platform && room.platform !== platform) {
      if (playerInfo.ws && playerInfo.ws.readyState === 1) {
        const roomPlatName = room.platform === 'mobile' ? 'Mobile' : 'PC';
        const userPlatName = platform === 'mobile' ? 'Mobile' : 'PC';
        playerInfo.ws.send(JSON.stringify({
          type: 'CUSTOM_ROOM_ERROR',
          message: `Phòng này chỉ dành cho người chơi [${roomPlatName}]! Bạn đang dùng [${userPlatName}].`
        }));
      }
      return null;
    }

    if (room.players.length >= CONFIG.MATCH_SIZE) {
      if (playerInfo.ws && playerInfo.ws.readyState === 1) {
        playerInfo.ws.send(JSON.stringify({
          type: 'CUSTOM_ROOM_ERROR',
          message: 'Phòng đã đủ 6 người chơi!'
        }));
      }
      return null;
    }

    // Assign to team with fewer players
    const blueCount = room.players.filter(p => p.team === 0).length;
    const redCount = room.players.filter(p => p.team === 1).length;
    const team = blueCount <= redCount ? 0 : 1;

    room.players.push({
      id: playerInfo.id,
      name: playerInfo.name || 'FlyPilot',
      ws: playerInfo.ws,
      team,
      isHost: false
    });

    this.broadcastCustomRoomState(room);
    this.broadcastLobbyRooms();
    return room;
  }

  switchCustomRoomTeam(playerId) {
    const room = this.findCustomRoomByPlayerId(playerId);
    if (!room) return;

    const p = room.players.find(x => x.id === playerId);
    if (!p) return;

    const targetTeam = p.team === 0 ? 1 : 0;
    const countInTargetTeam = room.players.filter(x => x.team === targetTeam).length;

    if (countInTargetTeam >= CONFIG.TEAM_SIZE) {
      if (p.ws && p.ws.readyState === 1) {
        p.ws.send(JSON.stringify({
          type: 'CUSTOM_ROOM_ERROR',
          message: `Đội ${targetTeam === 0 ? 'Xanh' : 'Đỏ'} đã đủ 3 người!`
        }));
      }
      return;
    }

    p.team = targetTeam;
    this.broadcastCustomRoomState(room);
    this.broadcastLobbyRooms();
  }

  kickCustomRoomPlayer(hostId, targetPlayerId) {
    const room = this.findCustomRoomByPlayerId(hostId);
    if (!room || room.hostId !== hostId || hostId === targetPlayerId) return;

    const idx = room.players.findIndex(p => p.id === targetPlayerId);
    if (idx !== -1) {
      const kicked = room.players.splice(idx, 1)[0];
      if (kicked.ws && kicked.ws.readyState === 1) {
        kicked.ws.send(JSON.stringify({
          type: 'CUSTOM_ROOM_ERROR',
          message: 'Bạn đã bị chủ phòng mời ra khỏi phòng!'
        }));
        kicked.ws.send(JSON.stringify({ type: 'CUSTOM_ROOM_LEFT' }));
      }
      this.broadcastCustomRoomState(room);
      this.broadcastLobbyRooms();
    }
  }

  leaveCustomRoom(playerId) {
    const room = this.findCustomRoomByPlayerId(playerId);
    if (!room) return;

    const idx = room.players.findIndex(p => p.id === playerId);
    if (idx !== -1) {
      const leaving = room.players.splice(idx, 1)[0];
      if (leaving.ws && leaving.ws.readyState === 1) {
        leaving.ws.send(JSON.stringify({ type: 'CUSTOM_ROOM_LEFT' }));
      }
    }

    if (room.players.length === 0) {
      this.customRooms.delete(room.code);
    } else {
      if (room.hostId === playerId) {
        room.hostId = room.players[0].id;
        room.players[0].isHost = true;
      }
      this.broadcastCustomRoomState(room);
    }
    this.broadcastLobbyRooms();
  }

  customRoomChat(playerId, message) {
    const room = this.findCustomRoomByPlayerId(playerId);
    if (!room) return;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return;

    const sanitized = (message || '').toString().trim().substring(0, 100);
    if (!sanitized) return;

    const packet = {
      type: 'CUSTOM_ROOM_CHAT',
      senderId: player.id,
      senderName: player.name,
      team: player.team,
      message: sanitized,
      timestamp: Date.now()
    };

    room.players.forEach(p => {
      if (p.ws && p.ws.readyState === 1) {
        p.ws.send(JSON.stringify(packet));
      }
    });
  }

  startCustomRoomMatch(playerId) {
    const room = this.findCustomRoomByPlayerId(playerId);
    if (!room) return;

    if (room.hostId !== playerId) {
      return; // Only host can start match
    }

    const roomId = this.nextRoomId++;
    const playersList = [];

    // Add humans with their chosen teams
    room.players.forEach(p => {
      playersList.push(new Player(p.id, p.name, p.team, p.ws, false));
    });

    // Auto-fill bots to complete a balanced 3 vs 3 arena
    let botCounter = 1;
    const botTitles = ['Sát Thủ', 'Tiêm Kích', 'Đột Kích', 'Cơ Động', 'Hộ Vệ'];
    while (playersList.length < CONFIG.MATCH_SIZE) {
      const blueCount = playersList.filter(p => p.team === 0).length;
      const redCount = playersList.filter(p => p.team === 1).length;
      const team = blueCount <= redCount ? 0 : 1;
      const teamName = team === 0 ? 'Xanh' : 'Đỏ';
      const title = botTitles[(botCounter - 1) % botTitles.length];

      playersList.push(new Bot(`bot_${botCounter}`, `Ruồi ${teamName} ${title}`, team));
      botCounter++;
    }

    const platform = room.platform || 'pc';
    const gameRoom = new GameRoom(roomId, playersList, false, (id) => this.removeRoom(id));
    gameRoom.platform = platform;
    this.rooms.set(roomId, gameRoom);
    playersList.forEach(p => {
      p.platform = platform;
      this.playerToRoom.set(p.id, gameRoom);
    });

    // Notify all human players
    playersList.forEach(p => {
      if (!p.isBot && p.ws && p.ws.readyState === 1) {
        p.ws.send(JSON.stringify({
          type: 'MATCH_FOUND',
          roomId,
          playerId: p.id,
          team: p.team,
          platform,
          isPractice: false,
          trees: gameRoom.treeObstacles,
          foodSpots: gameRoom.foodSpots,
          targetScore: gameRoom.targetScore,
          matchDuration: gameRoom.matchDuration
        }));
      }
    });

    this.customRooms.delete(room.code);
    this.broadcastLobbyRooms();
  }

  broadcastCustomRoomState(room) {
    const data = {
      type: 'CUSTOM_ROOM_UPDATE',
      roomCode: room.code,
      hostId: room.hostId,
      platform: room.platform || 'pc',
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        team: p.team,
        isHost: p.id === room.hostId
      }))
    };

    room.players.forEach(p => {
      if (p.ws && p.ws.readyState === 1) {
        p.ws.send(JSON.stringify(data));
      }
    });
  }

  findCustomRoomByPlayerId(playerId) {
    for (const room of this.customRooms.values()) {
      if (room.players.some(p => p.id === playerId)) {
        return room;
      }
    }
    return null;
  }

  removePlayerFromAllLobbies(playerId) {
    this.dequeue(playerId);
    this.leaveCustomRoom(playerId);
  }

  // O(1) Instantaneous room lookup for 100+ concurrent players (Zero linear scans!)
  findRoomByPlayerId(playerId) {
    return this.playerToRoom.get(playerId) || null;
  }

  removeRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      for (const pId of room.players.keys()) {
        if (this.playerToRoom.get(pId) === room) {
          this.playerToRoom.delete(pId);
        }
      }
      room.destroy();
      this.rooms.delete(roomId);
    }
  }

  removePlayer(playerId) {
    this.removePlayerFromAllLobbies(playerId);
    const room = this.findRoomByPlayerId(playerId);
    this.playerToRoom.delete(playerId);
    if (room) {
      const humanPlayer = room.players.get(playerId);
      if (humanPlayer && !humanPlayer.isBot) {
        // If there are other human players in a live match, replace leaving human with a Bot
        if (room.getHumanCount() > 1 && room.state === 'playing') {
          room.replaceWithBot(humanPlayer);
        } else {
          room.players.delete(playerId);
          room.broadcast({ type: 'PLAYER_DISCONNECTED', playerId });

          if (room.getHumanCount() === 0) {
            this.removeRoom(room.id);
          }
        }
      }
    }
  }
}

module.exports = new Matchmaker();
