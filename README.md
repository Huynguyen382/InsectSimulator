# 🪰 InsectSimulator 3v3

A fast-paced 3D multiplayer insect combat web game built with **Three.js**, **Node.js**, and **WebSockets**.

## ✨ Game Features
- **3v3 Team Battles**: Red vs Blue team deathmatch & base destruction mode.
- **Base Assault & Defense**: Each team defends their home base crystal with health indicators and defensive aura mechanics.
- **Combat & Aim Assist**:
  - Distance-based projectile shooting.
  - Smart aim-assist within 10 meters for responsive dogfighting.
  - 20 rounds of ammo capacity with quick bite reload mechanics.
- **Stealth & Resurrection**:
  - When defeated, players transform into food and must hide for 10 seconds.
  - If enemies approach to bite/reload from you 3 times, you are eliminated with a 5-second respawn.
- **Custom Room & Matchmaking**:
  - Public quick match queue with smart bot fill.
  - Custom room creation, invite codes, and team selection.
- **Leveling & Rogue-lite Upgrades**:
  - Collect food, gain XP, level up, and choose tactical upgrades (Speed, Damage, Health, Fire Rate, Ammo).
- **Controls & Input**:
  - Full Unikey / Vietnamese IME compatibility with dedicated anti-stuck key handlers.
  - Mouse look, W/A/S/D movement, Spacebar ascent, Shift descent, Left Click to shoot.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Modern web browser with WebGL support

### Installation & Run
```bash
# Clone the repository
git clone https://github.com/Huynguyen382/InsectSimulator.git
cd InsectSimulator

# Install dependencies
npm install

# Start the game server
npm start
```

Access the game at: `http://localhost:3000`

## 🛠️ Tech Stack
- **Client**: Vanilla JavaScript (ES Modules), Three.js, HTML5 Canvas, Modern CSS
- **Server**: Node.js, Express, WebSocket (`ws`)
- **Assets**: GLTF/GLB 3D models with LOD & geometry batching optimization

