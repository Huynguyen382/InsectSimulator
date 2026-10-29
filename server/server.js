const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const CONFIG = require('./config/gameConfig');
const matchmaker = require('./managers/Matchmaker');

const app = express();
const server = http.createServer(app);
// High-capacity WebSocket Server: perMessageDeflate disabled to eliminate zlib compression buffers and CPU strain for 100+ clients
const wss = new WebSocketServer({
  server,
  perMessageDeflate: false,
  maxPayload: 8192
});

// Middleware
app.use(express.json());

// Serve static assets & Local Three.js modules (Zero CDN dependency, 100% offline reliable)
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/Model', express.static(path.join(__dirname, '..', 'Model')));
app.use('/three', express.static(path.join(__dirname, '..', 'node_modules', 'three')));

// --- REST API ENDPOINTS ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

app.get('/api/status', (req, res) => {
  const memory = process.memoryUsage();
  res.json({
    status: 'online',
    version: '1.2.0',
    uptimeSec: Math.round(process.uptime()),
    activeRooms: matchmaker.rooms.size,
    customRooms: matchmaker.customRooms.size,
    queuePlayers: matchmaker.queue.length,
    lobbyBrowsers: matchmaker.lobbySockets.size,
    memory: {
      rssMB: Math.round(memory.rss / 1024 / 1024),
      heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024)
    }
  });
});

app.get('/api/rooms', (req, res) => {
  res.json({
    rooms: matchmaker.getPublicRooms()
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    winScore: CONFIG.WIN_SCORE,
    matchDurationSec: CONFIG.MATCH_DURATION_SEC,
    bounds: CONFIG.BOUNDS,
    upgrades: CONFIG.UPGRADES_POOL
  });
});

// Helper: Sanitize player name
function sanitizeName(name) {
  if (typeof name !== 'string') return 'FlyPilot';
  const clean = name.trim().replace(/[<>]/g, '').substring(0, 15);
  return clean || 'FlyPilot';
}

// --- WEBSOCKET REAL-TIME SERVER ---
wss.on('connection', (ws) => {
  const playerId = 'p_' + Math.random().toString(36).substring(2, 9);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    // Basic anti-DoS: discard payloads larger than 8KB
    if (raw.length > 8192) return;

    try {
      const msg = JSON.parse(raw);

      switch (msg.type) {
        // --- HEARTBEAT & LATENCY (PING / PONG) ---
        case 'PING': {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'PONG',
              clientTimestamp: msg.timestamp || 0,
              serverTimestamp: Date.now()
            }));
          }
          break;
        }

        // --- LOBBY BROWSING (DISCOVER ACTIVE ROOMS) ---
        case 'REGISTER_LOBBY': {
          matchmaker.registerLobbySocket(ws);
          break;
        }

        case 'UNREGISTER_LOBBY': {
          matchmaker.unregisterLobbySocket(ws);
          break;
        }

        case 'GET_CUSTOM_ROOMS': {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'CUSTOM_ROOMS_LIST',
              rooms: matchmaker.getPublicRooms()
            }));
          }
          break;
        }

        // --- MODE 1: SOLO PRACTICE (1 Human + 5 Bots) ---
        case 'START_SOLO_PRACTICE': {
          const name = sanitizeName(msg.name);
          matchmaker.startSoloPractice({ id: playerId, name, ws });
          break;
        }

        // --- MODE 2: MATCHMAKING QUEUE (3v3 PvP with auto-fill) ---
        case 'JOIN_QUEUE': {
          const name = sanitizeName(msg.name);
          matchmaker.enqueue({ id: playerId, name, ws });
          break;
        }

        case 'LEAVE_QUEUE': {
          matchmaker.dequeue(playerId);
          break;
        }

        // --- MODE 3: CUSTOM ROOMS ---
        case 'CREATE_CUSTOM_ROOM': {
          const name = sanitizeName(msg.name);
          matchmaker.createCustomRoom({ id: playerId, name, ws });
          break;
        }

        case 'JOIN_CUSTOM_ROOM': {
          const name = sanitizeName(msg.name);
          matchmaker.joinCustomRoom(msg.roomCode, { id: playerId, name, ws });
          break;
        }

        case 'SWITCH_CUSTOM_ROOM_TEAM': {
          matchmaker.switchCustomRoomTeam(playerId);
          break;
        }

        case 'KICK_CUSTOM_ROOM_PLAYER': {
          matchmaker.kickCustomRoomPlayer(playerId, msg.targetPlayerId);
          break;
        }

        case 'CUSTOM_ROOM_CHAT': {
          matchmaker.customRoomChat(playerId, msg.message);
          break;
        }

        case 'LEAVE_CUSTOM_ROOM': {
          matchmaker.leaveCustomRoom(playerId);
          break;
        }

        case 'START_CUSTOM_ROOM_MATCH': {
          matchmaker.startCustomRoomMatch(playerId);
          break;
        }

        // --- IN-GAME INPUT (WITH STRICT VALIDATION) ---
        case 'PLAYER_INPUT': {
          const room = matchmaker.findRoomByPlayerId(playerId);
          if (room && room.state === 'playing') {
            const player = room.players.get(playerId);
            if (player && !player.isDead && msg.inputs) {
              const forward = typeof msg.inputs.forward === 'number' ? Math.max(-1, Math.min(1, msg.inputs.forward)) : 0;
              const right = typeof msg.inputs.right === 'number' ? Math.max(-1, Math.min(1, msg.inputs.right)) : 0;
              const up = typeof msg.inputs.up === 'number' ? Math.max(-1, Math.min(1, msg.inputs.up)) : 0;
              const yaw = typeof msg.inputs.yaw === 'number' && !isNaN(msg.inputs.yaw) ? msg.inputs.yaw : player.yaw;
              const pitch = typeof msg.inputs.pitch === 'number' && !isNaN(msg.inputs.pitch) ? msg.inputs.pitch : player.pitch;

              player.inputs = {
                forward,
                right,
                up,
                yaw,
                pitch,
                x: typeof msg.inputs.x === 'number' && !isNaN(msg.inputs.x) ? msg.inputs.x : undefined,
                y: typeof msg.inputs.y === 'number' && !isNaN(msg.inputs.y) ? msg.inputs.y : undefined,
                z: typeof msg.inputs.z === 'number' && !isNaN(msg.inputs.z) ? msg.inputs.z : undefined,
                vx: typeof msg.inputs.vx === 'number' && !isNaN(msg.inputs.vx) ? msg.inputs.vx : undefined,
                vy: typeof msg.inputs.vy === 'number' && !isNaN(msg.inputs.vy) ? msg.inputs.vy : undefined,
                vz: typeof msg.inputs.vz === 'number' && !isNaN(msg.inputs.vz) ? msg.inputs.vz : undefined
              };
            }
          }
          break;
        }

        // --- SHOOTING (WITH ANTI-SPAM COOLDOWN) ---
        case 'SHOOT': {
          const room = matchmaker.findRoomByPlayerId(playerId);
          if (room && msg.aimDir) {
            room.handleShoot(playerId, msg.aimDir);
          }
          break;
        }

        // --- UPGRADE SELECTION ---
        case 'CHOOSE_UPGRADE': {
          const room = matchmaker.findRoomByPlayerId(playerId);
          if (room) {
            room.applyUpgrade(playerId, msg.upgradeId);
          }
          break;
        }

        // --- IN-GAME CHAT & RADIO CALLOUTS ---
        case 'CHAT_MESSAGE': {
          const room = matchmaker.findRoomByPlayerId(playerId);
          if (room) {
            room.handleChat(playerId, msg.message, Boolean(msg.isTeamOnly));
          }
          break;
        }
      }
    } catch (err) {
      console.warn('[WebSocket] Malformed message received:', err.message);
    }
  });

  ws.on('error', (err) => {
    console.warn(`[WebSocket] Client ${playerId} notice:`, err.message);
  });

  ws.on('close', () => {
    matchmaker.unregisterLobbySocket(ws);
    matchmaker.removePlayer(playerId);
  });
});

// Periodic Heartbeat to terminate broken zombie connections
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, CONFIG.HEARTBEAT_INTERVAL_MS || 15000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

wss.on('error', (err) => {
  console.error('[WebSocketServer] Error:', err);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection:', reason);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Cổng ${CONFIG.PORT} đang bị chiếm dụng bởi một tiến trình khác.`);
    console.error(`👉 Khắc phục: Chạy 'npm run kill' để tắt tiến trình cũ, hoặc đổi cổng PORT trong server/config/gameConfig.js\n`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
  }
});

function gracefulShutdown() {
  console.log('\n🛑 Đang đóng Insect Simulator Server...');
  clearInterval(heartbeatInterval);
  wss.close(() => {
    server.close(() => {
      console.log('✅ Cổng đã được giải phóng an toàn.');
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(0), 1500);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

server.listen(CONFIG.PORT, () => {
  console.log(`===============================================`);
  console.log(` InsectSimulator 3v3 Server Started Successfully`);
  console.log(` Local URL: http://localhost:${CONFIG.PORT}`);
  console.log(` REST API: http://localhost:${CONFIG.PORT}/api/status`);
  console.log(`===============================================`);
});
