import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { MikroORM } from '@mikro-orm/core';
import mikroOrmConfig from './mikro-orm.config.js';
import { RoomManager } from './game/RoomManager.js';
import { ClientInput } from '../../shared/types.js';
import { GAME_CONFIG, ObstaclePatternType } from '../../shared/gameConfig.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

let orm: MikroORM | null = null;
const roomManager = new RoomManager(io, null);

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    game: 'Precision Path',
    postgres: orm ? 'connected' : 'offline/memory-mode',
  });
});

app.get('/api/leaderboard', async (req, res) => {
  const leaderboard = await roomManager.getLeaderboard();
  res.json(leaderboard);
});

app.get('/api/config', (req, res) => {
  res.json(GAME_CONFIG);
});

app.post('/api/config', (req, res) => {
  const body = req.body;
  if (body?.rounds) {
    if (typeof body.rounds.defaultRoundDurationSeconds === 'number') {
      GAME_CONFIG.rounds.defaultRoundDurationSeconds = Math.max(2, body.rounds.defaultRoundDurationSeconds);
    }
    if (body.rounds.tierDurations) {
      for (const t of [1, 2, 3, 4] as const) {
        if (typeof body.rounds.tierDurations[t] === 'number') {
          GAME_CONFIG.rounds.tierDurations[t] = Math.max(2, body.rounds.tierDurations[t]);
        }
      }
    }
  }
  if (body?.randomness) {
    const r = body.randomness;
    if (typeof r.gapPositionVariance === 'number') GAME_CONFIG.randomness.gapPositionVariance = Math.max(0, Math.min(0.9, r.gapPositionVariance));
    if (typeof r.gapSizeVariance === 'number') GAME_CONFIG.randomness.gapSizeVariance = Math.max(0, Math.min(0.5, r.gapSizeVariance));
    if (typeof r.speedVariance === 'number') GAME_CONFIG.randomness.speedVariance = Math.max(0, Math.min(0.5, r.speedVariance));
    if (typeof r.waveIntervalJitter === 'number') GAME_CONFIG.randomness.waveIntervalJitter = Math.max(0, Math.min(0.4, r.waveIntervalJitter));
    if (typeof r.staggerVariance === 'number') GAME_CONFIG.randomness.staggerVariance = Math.max(0, Math.min(0.5, r.staggerVariance));
    if (typeof r.randomizeRound1Direction === 'boolean') GAME_CONFIG.randomness.randomizeRound1Direction = r.randomizeRound1Direction;
  }
  if (body?.obstacleTypes) {
    for (const key of Object.keys(GAME_CONFIG.obstacleTypes) as ObstaclePatternType[]) {
      const incoming = body.obstacleTypes[key];
      if (incoming) {
        if (typeof incoming.enabled === 'boolean') GAME_CONFIG.obstacleTypes[key].enabled = incoming.enabled;
        if (typeof incoming.weight === 'number') GAME_CONFIG.obstacleTypes[key].weight = Math.max(0, incoming.weight);
      }
    }
  }
  res.json(GAME_CONFIG);
});

// Serve built React frontend in production / Docker / Coolify single-container mode
const clientDistPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(path.join(clientDistPath, 'index.html'))) {
  app.use(express.static(clientDistPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Socket.io Multiplayer Connection Handling
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Create Room
  socket.on('createRoom', ({ playerName, autoStart }: { playerName: string; autoStart?: boolean }) => {
    const prevRoom = roomManager.getRoomBySocketId(socket.id);
    if (prevRoom) {
      socket.leave(prevRoom.roomId);
      roomManager.leaveRoom(socket.id);
    }

    const { roomId, engine } = roomManager.createRoom(socket.id, playerName || 'Player');
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, playerId: socket.id, state: engine.state });
    console.log(`[Room] Created ${roomId} by ${playerName} (${socket.id})`);

    if (autoStart) {
      engine.startCountdown();
    }
  });

  // Join Room
  socket.on('joinRoom', ({ roomId, playerName }: { roomId: string; playerName: string }) => {
    const cleanRoomId = (roomId || '').trim().toUpperCase();
    if (!cleanRoomId) {
      socket.emit('error', 'Please enter a valid room code.');
      return;
    }

    const prevRoom = roomManager.getRoomBySocketId(socket.id);
    if (prevRoom) {
      socket.leave(prevRoom.roomId);
      roomManager.leaveRoom(socket.id);
    }

    const engine = roomManager.joinRoom(cleanRoomId, socket.id, playerName || 'Player');

    if (!engine) {
      socket.emit('error', 'Room not found or match has ended.');
      return;
    }

    socket.join(cleanRoomId);
    socket.emit('roomJoined', { roomId: cleanRoomId, playerId: socket.id, state: engine.state });
    io.to(cleanRoomId).emit('gameState', engine.state);
    console.log(`[Room] ${playerName} (${socket.id}) joined ${cleanRoomId}`);
  });

  // Leave Room cleanly
  socket.on('leaveRoom', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (room) {
      socket.leave(room.roomId);
      roomManager.leaveRoom(socket.id);
    }
    socket.emit('roomLeft');
  });

  // Start Game (Host only)
  socket.on('startGame', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;

    const player = room.engine.state.players[socket.id];
    if (player && player.isHost && room.engine.state.status !== 'playing' && room.engine.state.status !== 'countdown') {
      room.engine.startCountdown();
    }
  });

  // Toggle Pause (ESC key or HUD button)
  socket.on('togglePause', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    room.engine.togglePause(socket.id);
  });

  // Player Input (Mouse / Touch coordinates relative to arena center)
  socket.on('playerInput', (input: ClientInput) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;

    room.engine.handleInput(socket.id, input);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
    roomManager.leaveRoom(socket.id);
  });
});

// Initialize MikroORM PostgreSQL and start server
async function bootstrap() {
  try {
    console.log('[MikroORM] Attempting PostgreSQL connection...');
    orm = await MikroORM.init(mikroOrmConfig);
    // Auto-create/sync schema if necessary in development
    const generator = orm.getSchemaGenerator();
    await generator.updateSchema();
    roomManager.setORM(orm);
    console.log('[MikroORM] Connected to PostgreSQL successfully!');
  } catch (err: any) {
    console.warn(`[MikroORM] PostgreSQL connection skipped (${err.message}). Running with in-memory persistence.`);
  }

  server.listen(PORT, () => {
    console.log(`🎮 Precision Path dedicated game server running on port ${PORT}`);
  });
}

bootstrap();
