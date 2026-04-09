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
  cors: isProd
    ? { origin: process.env.CLIENT_ORIGIN || false }
    : { origin: '*', methods: ['GET', 'POST'] },
});

// Serve built client in production
app.use(express.static(join(__dirname, '../dist')));
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

  socket.on('joinRoom', ({ roomId, name }) => {
    const id   = (roomId || 'default').trim().toLowerCase() || 'default';
    const room = getOrCreateRoom(id);

    if (room.size >= MAX_PLAYERS) {
      socket.emit('roomFull', { roomId: id });
      return;
    }

    const slotIndex = _nextSlot(room);
    room.addPlayer(socket, name || 'Survivor', slotIndex);
    io.to(id).emit('roomInfo', { roomId: id, playerCount: room.size });
  });

  socket.on('input', (packet) => {
    const room = getRoomOf(socket.id);
    if (room) room.handleInput(socket.id, packet);
  });

  socket.on('playerReady', (isReady) => {
    const room = getRoomOf(socket.id);
    if (room) room.setReady(socket.id, !!isReady);
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

httpServer.listen(PORT, () => {
  console.log(`\n🎮 Four Survivors server — port ${PORT}`);
  console.log(`   Tick rate: 20 Hz | Max players per room: ${MAX_PLAYERS}\n`);
});
