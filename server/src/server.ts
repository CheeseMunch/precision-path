import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { MikroORM } from '@mikro-orm/core';
import { execFileSync, spawn } from 'child_process';
import mikroOrmConfig from './mikro-orm.config.js';
import { RoomManager } from './game/RoomManager.js';
import { User } from './entities/User.js';
import { MatchHistory } from './entities/MatchHistory.js';
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

app.get('/api/db', async (req, res) => {
  if (!orm) {
    return res.status(503).json({ status: 'offline', message: 'PostgreSQL is not connected' });
  }
  const em = orm.em.fork();
  const users = await em.find(User, {}, { orderBy: { bestSurvivalTime: 'DESC' }, limit: 50 });
  const matches = await em.find(MatchHistory, {}, { orderBy: { playedAt: 'DESC' }, limit: 50 });
  res.json({
    database: 'precision_path (PostgreSQL)',
    status: 'connected',
    tables: {
      users,
      match_history: matches,
    },
  });
});

// Localhost-only interactive SQL execution endpoint for the DB Admin GUI
app.post('/api/sql', async (req, res) => {
  const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  if (!isLocal) {
    return res.status(403).json({ error: 'SQL Studio is only accessible from localhost on the host PC.' });
  }
  if (!orm) {
    return res.status(503).json({ error: 'PostgreSQL is not connected.' });
  }
  const query = String(req.body?.query || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'Please enter a SQL query.' });
  }
  try {
    const start = performance.now();
    const rows = await orm.em.getConnection().execute(query);
    const durationMs = (performance.now() - start).toFixed(2);
    res.json({ rows: Array.isArray(rows) ? rows : [rows], durationMs });
  } catch (err: any) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

// Localhost-only PostgreSQL Web Studio GUI (http://localhost:4000/db-admin)
app.get('/db-admin', (req, res) => {
  const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  if (!isLocal) {
    return res.status(403).send('DB Admin Studio is restricted to localhost on the host PC.');
  }
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Precision Path • PostgreSQL Studio</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#090b12] text-gray-100 min-h-screen p-6 font-mono">
  <div class="max-w-6xl mx-auto flex flex-col gap-6">
    <div class="flex items-center justify-between border-b border-gray-800 pb-4">
      <div>
        <h1 class="text-2xl font-bold text-cyan-400">PostgreSQL Database Studio</h1>
        <p class="text-xs text-gray-400 mt-1">Connected to <span class="text-green-400 font-semibold">postgresql://postgres@localhost:5432/precision_path</span></p>
      </div>
      <div class="flex gap-2">
        <button onclick="setQuery('SELECT * FROM users ORDER BY best_survival_time DESC;')" class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-cyan-300">Table: users</button>
        <button onclick="setQuery('SELECT * FROM match_history ORDER BY played_at DESC;')" class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-pink-300">Table: match_history</button>
        <button onclick="setQuery(&quot;SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;&quot;)" class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-yellow-300">Schema Columns</button>
      </div>
    </div>

    <div class="bg-[#121520] border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between text-xs text-gray-400">
        <span>SQL Query Editor (Ctrl+Enter to execute)</span>
        <span id="meta" class="text-cyan-400"></span>
      </div>
      <textarea id="sql" rows="4" class="w-full bg-[#07080d] border border-gray-700 rounded-lg p-3 text-sm text-cyan-200 focus:outline-none focus:border-cyan-400">SELECT * FROM users ORDER BY best_survival_time DESC;</textarea>
      <div class="flex justify-end">
        <button onclick="runQuery()" class="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg text-xs uppercase tracking-wider">Run SQL Query</button>
      </div>
    </div>

    <div id="error" class="hidden bg-red-950/60 border border-red-500/50 text-red-300 p-4 rounded-xl text-xs"></div>

    <div class="bg-[#121520] border border-gray-800 rounded-xl overflow-x-auto">
      <table class="w-full text-left border-collapse text-xs">
        <thead id="thead" class="bg-[#0d1018] text-gray-400 border-b border-gray-800"></thead>
        <tbody id="tbody" class="divide-y divide-gray-800/60"></tbody>
      </table>
    </div>
  </div>

  <script>
    function setQuery(q) {
      document.getElementById('sql').value = q;
      runQuery();
    }
    document.getElementById('sql').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runQuery();
    });
    async function runQuery() {
      const query = document.getElementById('sql').value;
      const errEl = document.getElementById('error');
      const thead = document.getElementById('thead');
      const tbody = document.getElementById('tbody');
      const meta = document.getElementById('meta');
      errEl.classList.add('hidden');
      try {
        const res = await fetch('/api/sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Query failed');
        const rows = data.rows || [];
        meta.textContent = rows.length + ' row(s) • ' + data.durationMs + ' ms';
        if (rows.length === 0) {
          thead.innerHTML = '';
          tbody.innerHTML = '<tr><td class="p-6 text-center text-gray-500">Query returned 0 rows.</td></tr>';
          return;
        }
        const cols = Object.keys(rows[0]);
        thead.innerHTML = '<tr>' + cols.map(c => '<th class="p-3 font-semibold">' + c + '</th>').join('') + '</tr>';
        tbody.innerHTML = rows.map(r => '<tr class="hover:bg-white/5">' + cols.map(c => '<td class="p-3 text-gray-200">' + (r[c] === null ? '<span class="text-gray-600">NULL</span>' : String(r[c])) + '</td>').join('') + '</tr>').join('');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    }
    runQuery();
  </script>
</body>
</html>`);
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

  // Start Game / Play Again in persistent lobby
  socket.on('startGame', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;

    const player = room.engine.state.players[socket.id];
    if (player && room.engine.state.status !== 'playing' && room.engine.state.status !== 'countdown') {
      room.engine.startCountdown();
    }
  });

  // Return persistent room to Waiting Room lobby without remaking the room
  socket.on('returnToWaitingRoom', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;

    room.engine.returnToWaitingRoom();
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

// Initialize Local PostgreSQL + MikroORM and start server
async function bootstrap() {
  try {
    const pgDataDir = path.resolve(__dirname, '../../.pgdata');
    const pgBinDir = path.resolve(__dirname, '../../node_modules/@embedded-postgres/windows-x64/native/bin');
    const pgCtl = path.join(pgBinDir, 'pg_ctl.exe');
    const postgresExe = path.join(pgBinDir, 'postgres.exe');
    const initDb = path.join(pgBinDir, 'initdb.exe');

    if (fs.existsSync(pgCtl)) {
      try {
        if (!fs.existsSync(path.join(pgDataDir, 'PG_VERSION'))) {
          console.log('[PostgreSQL] Initializing local PostgreSQL cluster...');
          execFileSync(initDb, ['-D', pgDataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8'], { stdio: 'ignore' });
        }
        execFileSync(pgCtl, ['-D', pgDataDir, 'status'], { stdio: 'ignore' });
        console.log('[PostgreSQL] Local PostgreSQL cluster is running on port 5432');
      } catch {
        console.log('[PostgreSQL] Starting local PostgreSQL cluster on port 5432...');
        const child = spawn(postgresExe, ['-D', pgDataDir, '-p', '5432'], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    console.log('[MikroORM] Connecting to PostgreSQL...');
    orm = await MikroORM.init(mikroOrmConfig);
    const generator = orm.getSchemaGenerator();
    await generator.ensureDatabase();
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
