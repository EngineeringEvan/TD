# 🎈 Bloons Co-Op TD Ultimate Edition

A real-time co-op Tower Defense game playable in your browser, featuring authentic 3D procedural monkey figures, predictive aiming assistance, 10 towers with 3-path upgrades, 40 strategic rounds, and real-time LAN & WebRTC co-op multiplayer.

---

## 🚀 How to Play

### Option 1: Play Directly in the Browser (P2P Co-Op)
1. Open `index.html` in any web browser (Chrome, Edge, Firefox, Safari).
2. Click **"🌐 LAN / Co-Op Lobby"** in the top bar.
3. **Host Game:** Click **"Host Co-Op Session"** and share the 6-character room code with your friend.
4. **Join Game:** Your friend opens the game, clicks **"LAN / Co-Op Lobby"**, enters the room code, and clicks **"Connect & Join"**.

---

### Option 2: Run Dedicated LAN WebSocket Server
To play across different computers, laptops, or mobile devices connected to the same Wi-Fi / home network:

```bash
# Start server (default port 3000)
node server.js
```

Then on any device on your Wi-Fi network, navigate to:
```
http://<YOUR-LAN-IP>:3000/
```

---

## 🐒 Features
- **Authentic 3D Monkey Silhouettes:** Custom-rendered character anatomy with layered limbs, ears, muzzles, red athletic headbands, and action-throw poses.
- **Predictive Target Leading:** Advanced lead calculation algorithm that tracks bloon speed and trajectory, eliminating missed shots.
- **10 Strategic Towers:** Dart Monkey, Boomerang, Tack Shooter, Bomb Cannon, Ice Monkey, Sniper, Ninja, Buccaneer (Water-only!), Wizard, and Super Monkey.
- **3-Path Upgrade Trees:** Branching upgrades across three distinct progression paths for every tower.
- **Bloon Ecosystem:** Red, Blue, Green, Yellow, Pink, Black, White, Purple, Lead, Zebra, Rainbow, Ceramic, MOAB, BFB, and the colossal Round 40 ZOMG Boss.
- **Synchronized Multiplayer:** Real-time partner cursor tracking, ghost placement preview, live tower synchronization, shared upgrades, and co-op wave control.
