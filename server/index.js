import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GameRoom } from './GameRoom.js';
import { MAX_PLAYERS } from '../shared/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
const httpServer = createServer(app);
const isProd = process.env.NODE_ENV === 'production';
const io = new Server(httpServer, {
  pingTimeout:  5000,
  pingInterval: 5000,
  cors: isProd
    ? { origin: process.env.CLIENT_ORIGIN || false }
    : { origin: '*', methods: ['GET', 'POST'] },
});

// Serve built client in production
app.use(express.static(join(__dirname, '../dist')));

// Room list API
app.get('/api/rooms', (_req, res) => {
  const list = [];
  for (const [id, room] of rooms) {
    if (room.size > 0)
      list.push({ id, playerCount: room.size, gameStarted: room.gameStarted, wave: room.wave });
  }
  res.json(list);
});

app.delete('/api/rooms/:id', (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  room.destroy();
  rooms.delete(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/rooms', (_req, res) => {
  for (const [id, room] of rooms) {
    room.destroy();
    rooms.delete(id);
  }
  res.json({ ok: true });
});

app.get('*', (_req, res) =>
  res.sendFile(join(__dirname, '../dist/index.html'))
);

// ── Room registry ──────────────────────────────────────────────────────────
const rooms = new Map(); // roomId → GameRoom

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new GameRoom(roomId, io));
  }
  return rooms.get(roomId);
}

function getRoomOf(socketId) {
  for (const room of rooms.values()) {
    if (room.players.has(socketId)) return room;
  }
  return null;
}

// ── Socket handlers ────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id.slice(0, 8)} connected`);

  socket.on('joinRoom', ({ roomId, name, appearance }) => {
    const id   = (roomId || 'default').trim().toLowerCase() || 'default';
    const room = getOrCreateRoom(id);

    if (room.size >= MAX_PLAYERS) {
      socket.emit('roomFull', { roomId: id });
      return;
    }

    const slotIndex = _nextSlot(room);
    const resolvedAppearance = _resolveAppearance(room, appearance);
    room.addPlayer(socket, name || `Player_${slotIndex + 1}`, slotIndex, resolvedAppearance);
    io.to(id).emit('roomInfo', { roomId: id, playerCount: room.size });
  });

  socket.on('setAppearance', (appearance) => {
    const room = getRoomOf(socket.id);
    if (room) room.setAppearance(socket.id, appearance);
  });

  socket.on('input', (packet) => {
    const room = getRoomOf(socket.id);
    if (room) room.handleInput(socket.id, packet);
  });

  socket.on('playerReady', (isReady) => {
    const room = getRoomOf(socket.id);
    if (room) room.setReady(socket.id, !!isReady);
  });

  socket.on('forceStart', () => {
    const room = getRoomOf(socket.id);
    if (room) room.forceStart(socket.id);
  });

  socket.on('mapVote', (mapId) => {
    const room = getRoomOf(socket.id);
    if (room) room.setMapVote(socket.id, mapId);
  });

  socket.on('fogVote', (choice) => {
    const room = getRoomOf(socket.id);
    if (room) room.setFogVote(socket.id, choice);
  });

  socket.on('difficultyVote', (choice) => {
    const room = getRoomOf(socket.id);
    if (room) room.setDifficultyVote(socket.id, choice);
  });

  socket.on('useHealthpack', () => {
    const room = getRoomOf(socket.id);
    if (room) room.useHealthpack(socket.id);
  });

  socket.on('perkChoice', (perkId) => {
    const room = getRoomOf(socket.id);
    if (room) room.setPerkChoice(socket.id, perkId);
  });

  socket.on('tryReconnect', ({ token, roomId }) => {
    const id   = (roomId || 'default').trim().toLowerCase() || 'default';
    const room = rooms.get(id);
    if (!room || !room.tryReconnect(socket, token)) {
      // Reconnect failed — treat as fresh join
      socket.emit('reconnectFailed');
    }
  });

  socket.on('leaveRoom', () => {
    const room = getRoomOf(socket.id);
    if (room) {
      room.permanentLeave(socket.id);
      if (room.size === 0) rooms.delete(room.id);
      else io.to(room.id).emit('roomInfo', { roomId: room.id, playerCount: room.size });
    }
  });

  socket.on('playerPing', ({ type, x, z }) => {
    const room = getRoomOf(socket.id);
    if (!room || !room.gameStarted) return;
    const p = room.players.get(socket.id);
    if (!p || !p.alive || p.downed) return;
    if (!['point', 'danger', 'help'].includes(type)) return;
    room.io.to(room.id).emit('playerPing', { name: p.name, slot: p.slot, type, x: +x || 0, z: +z || 0 });
  });

  socket.on('ping', ({ ts }) => {
    socket.emit('pong', { ts });
  });

  socket.on('disconnect', () => {
    const room = getRoomOf(socket.id);
    if (room) {
      room.removePlayer(socket.id);
      if (room.size === 0) {
        rooms.delete(room.id);
        console.log(`[Room ${room.id}] removed`);
      } else {
        io.to(room.id).emit('roomInfo', { roomId: room.id, playerCount: room.size });
      }
    }
    console.log(`[-] ${socket.id.slice(0, 8)} disconnected`);
  });
});

function _nextSlot(room) {
  const used = new Set([...room.players.values()].map(p => p.slot));
  for (let i = 0; i < MAX_PLAYERS; i++) {
    if (!used.has(i)) return i;
  }
  return 0;
}

function _resolveAppearance(room, appearance) {
  const base = appearance ? { ...appearance } : { skin: 0, outfit: 0, hat: 'cap' };
  const usedOutfits = new Set([...room.players.values()].map(p => p.appearance?.outfit ?? 0));
  if (usedOutfits.has(base.outfit)) {
    for (let i = 0; i < 8; i++) {
      if (!usedOutfits.has(i)) { base.outfit = i; break; }
    }
  }
  return base;
}

httpServer.listen(PORT, () => {
  console.log(`\n🎮 Four Survivors server — port ${PORT}`);
  console.log(`   Tick rate: 20 Hz | Max players per room: ${MAX_PLAYERS}\n`);
});
