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

const DEFAULT_GAME_CONFIG = JSON.parse(JSON.stringify(GAME_CONFIG));
const TUNING_CONFIG_PATH = path.resolve(__dirname, '../tuning-config.json');

function applyTuningConfig(body: any) {
  if (!body || typeof body !== 'object') return;

  if (body.rounds) {
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

  if (body.randomness) {
    const r = body.randomness;
    if (typeof r.gapPositionVariance === 'number') GAME_CONFIG.randomness.gapPositionVariance = Math.max(0, Math.min(0.95, r.gapPositionVariance));
    if (typeof r.gapSizeVariance === 'number') GAME_CONFIG.randomness.gapSizeVariance = Math.max(0, Math.min(0.5, r.gapSizeVariance));
    if (typeof r.speedVariance === 'number') GAME_CONFIG.randomness.speedVariance = Math.max(0, Math.min(0.5, r.speedVariance));
    if (typeof r.waveIntervalJitter === 'number') GAME_CONFIG.randomness.waveIntervalJitter = Math.max(0, Math.min(0.45, r.waveIntervalJitter));
    if (typeof r.staggerVariance === 'number') GAME_CONFIG.randomness.staggerVariance = Math.max(0, Math.min(0.5, r.staggerVariance));
    if (typeof r.randomizeRound1Direction === 'boolean') GAME_CONFIG.randomness.randomizeRound1Direction = r.randomizeRound1Direction;
    if (r.seed === null || typeof r.seed === 'number') GAME_CONFIG.randomness.seed = r.seed;
  }

  if (body.obstacleTypes) {
    for (const key of Object.keys(GAME_CONFIG.obstacleTypes) as ObstaclePatternType[]) {
      const incoming = body.obstacleTypes[key];
      if (incoming) {
        if (typeof incoming.enabled === 'boolean') GAME_CONFIG.obstacleTypes[key].enabled = incoming.enabled;
        if (typeof incoming.weight === 'number') GAME_CONFIG.obstacleTypes[key].weight = Math.max(0, incoming.weight);
        if (typeof incoming.minTier === 'number') {
          GAME_CONFIG.obstacleTypes[key].minTier = Math.max(1, Math.min(5, Math.round(incoming.minTier))) as any;
        }
      }
    }
  }

  if (body.obstacles) {
    const o = body.obstacles;
    if (typeof o.baseSpeed === 'number') GAME_CONFIG.obstacles.baseSpeed = Math.max(40, Math.min(500, o.baseSpeed));
    if (typeof o.speedPerTier === 'number') GAME_CONFIG.obstacles.speedPerTier = Math.max(0, Math.min(100, o.speedPerTier));
    if (typeof o.endlessMaxBonusSpeed === 'number') GAME_CONFIG.obstacles.endlessMaxBonusSpeed = Math.max(0, Math.min(400, o.endlessMaxBonusSpeed));
    if (typeof o.endlessSpeedScaleRate === 'number') GAME_CONFIG.obstacles.endlessSpeedScaleRate = Math.max(0, Math.min(25, o.endlessSpeedScaleRate));
    if (typeof o.gapBaseWidth === 'number') GAME_CONFIG.obstacles.gapBaseWidth = Math.max(40, Math.min(220, o.gapBaseWidth));
    if (typeof o.gapTierDecrement === 'number') GAME_CONFIG.obstacles.gapTierDecrement = Math.max(0, Math.min(30, o.gapTierDecrement));
    if (typeof o.gapMinWidth === 'number') GAME_CONFIG.obstacles.gapMinWidth = Math.max(36, Math.min(180, o.gapMinWidth));
    if (typeof o.barThickness === 'number') GAME_CONFIG.obstacles.barThickness = Math.max(6, Math.min(40, o.barThickness));
    if (typeof o.staggerMs === 'number') GAME_CONFIG.obstacles.staggerMs = Math.max(60, Math.min(1200, o.staggerMs));
    if (o.waveIntervals) {
      for (const t of [1, 2, 3, 4, 5] as const) {
        if (typeof o.waveIntervals[t] === 'number') {
          GAME_CONFIG.obstacles.waveIntervals[t] = Math.max(0.5, Math.min(8, o.waveIntervals[t]));
        }
      }
    }
  }

  if (body.arena) {
    const a = body.arena;
    if (typeof a.playerRadius === 'number') GAME_CONFIG.arena.playerRadius = Math.max(6, Math.min(30, a.playerRadius));
    if (typeof a.hitboxForgiveness === 'number') GAME_CONFIG.arena.hitboxForgiveness = Math.max(0, Math.min(8, a.hitboxForgiveness));
  }
}

function saveTuningConfigToDisk() {
  try {
    fs.writeFileSync(TUNING_CONFIG_PATH, JSON.stringify(GAME_CONFIG, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Config] Failed to save tuning-config.json:', err);
  }
}

// Load saved tuning config from disk on startup if present
if (fs.existsSync(TUNING_CONFIG_PATH)) {
  try {
    const saved = JSON.parse(fs.readFileSync(TUNING_CONFIG_PATH, 'utf8'));
    applyTuningConfig(saved);
    console.log(`[Config] Loaded persisted tuning configuration from ${TUNING_CONFIG_PATH}`);
  } catch (err) {
    console.warn('[Config] Failed to parse saved tuning-config.json, using defaults:', err);
  }
} else {
  saveTuningConfigToDisk();
}

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

// Localhost-only Admin Studio GUI: Game Tuning & PostgreSQL Studio (http://localhost:4000/db-admin)
app.get('/db-admin', (req, res) => {
  const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  if (!isLocal) {
    return res.status(403).send('Admin Studio is restricted to localhost on the host PC.');
  }
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Precision Path • Admin Control & DB Studio</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#090b12] text-gray-100 min-h-screen p-6 font-mono">
  <div class="max-w-6xl mx-auto flex flex-col gap-6">
    <!-- Top Header & Navigation Tabs -->
    <div class="flex flex-wrap items-center justify-between gap-4 border-b border-gray-800 pb-4">
      <div>
        <h1 class="text-2xl font-bold text-cyan-400">Precision Path • Admin Control Studio</h1>
        <p class="text-xs text-gray-400 mt-1">
          Localhost-Only Admin Console • Config File: <span class="text-cyan-300 font-semibold">server/tuning-config.json</span> • DB: <span class="text-green-400 font-semibold">postgresql://postgres@localhost:5432/precision_path</span>
        </p>
      </div>
      <div class="flex gap-2">
        <button id="tabBtnTuning" onclick="switchTab('tuning')" class="px-4 py-2 bg-cyan-500 text-black font-bold rounded-lg text-xs uppercase tracking-wider transition">
          ⚙ Game Tuning & Config
        </button>
        <button id="tabBtnSql" onclick="switchTab('sql')" class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold rounded-lg text-xs uppercase tracking-wider border border-gray-700 transition">
          🗄 PostgreSQL Studio
        </button>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- TAB 1: GAME TUNING & CONFIG STUDIO         -->
    <!-- ========================================== -->
    <div id="tabTuning" class="flex flex-col gap-6">
      <!-- Action Bar -->
      <div class="bg-[#121520] border border-cyan-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-sm font-bold text-white">Live Gameplay & Procedural Randomness Tuning</div>
          <div id="saveStatus" class="text-xs text-gray-400 mt-0.5">Changes apply immediately to the server and save to <span class="text-cyan-300">server/tuning-config.json</span>.</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button onclick="saveConfig()" class="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/20 transition">
            💾 Save & Apply Config
          </button>
          <button onclick="exportConfigJson()" class="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-cyan-300 font-bold rounded-lg text-xs uppercase tracking-wider transition">
            ⬇ Export JSON
          </button>
          <label class="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-purple-300 font-bold rounded-lg text-xs uppercase tracking-wider cursor-pointer transition">
            ⬆ Import JSON
            <input type="file" accept=".json" onchange="importConfigJson(event)" class="hidden" />
          </label>
          <button onclick="resetConfig()" class="px-4 py-2.5 bg-red-950/60 hover:bg-red-900/60 border border-red-500/40 text-red-300 font-bold rounded-lg text-xs uppercase tracking-wider transition">
            ↺ Reset Defaults
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- 1. Round Durations -->
        <div class="bg-[#121520] border border-gray-800 rounded-xl p-5 flex flex-col gap-4">
          <div class="flex items-center justify-between border-b border-gray-800 pb-2">
            <span class="text-cyan-400 font-bold uppercase text-sm">1. Round Durations (Seconds)</span>
            <button onclick="syncAllRounds()" class="text-[11px] text-cyan-300 hover:underline">Sync All to Round 1</button>
          </div>
          <div class="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div class="flex justify-between mb-1"><span>Round 1 (1 Side)</span><span id="val_r1" class="text-cyan-300 font-bold">7s</span></div>
              <input id="inp_r1" type="range" min="2" max="45" step="1" oninput="updateLabels()" class="w-full accent-cyan-400" />
            </div>
            <div>
              <div class="flex justify-between mb-1"><span>Round 2 (2 Sides)</span><span id="val_r2" class="text-cyan-300 font-bold">7s</span></div>
              <input id="inp_r2" type="range" min="2" max="45" step="1" oninput="updateLabels()" class="w-full accent-cyan-400" />
            </div>
            <div>
              <div class="flex justify-between mb-1"><span>Round 3 (3 Sides)</span><span id="val_r3" class="text-cyan-300 font-bold">7s</span></div>
              <input id="inp_r3" type="range" min="2" max="45" step="1" oninput="updateLabels()" class="w-full accent-cyan-400" />
            </div>
            <div>
              <div class="flex justify-between mb-1"><span>Round 4 (4 Sides)</span><span id="val_r4" class="text-cyan-300 font-bold">7s</span></div>
              <input id="inp_r4" type="range" min="2" max="45" step="1" oninput="updateLabels()" class="w-full accent-cyan-400" />
            </div>
          </div>

          <div class="border-t border-gray-800 pt-3 mt-1">
            <div class="text-cyan-400 font-bold uppercase text-xs mb-3">Wave Spawn Intervals (Seconds Between Waves)</div>
            <div class="grid grid-cols-5 gap-2 text-xs">
              <div>
                <label class="block text-[10px] text-gray-400 mb-1">R1 Interval</label>
                <input id="inp_wi1" type="number" step="0.1" min="0.5" max="8" class="w-full bg-[#07080d] border border-gray-700 rounded p-1.5 text-center text-white" />
              </div>
              <div>
                <label class="block text-[10px] text-gray-400 mb-1">R2 Interval</label>
                <input id="inp_wi2" type="number" step="0.1" min="0.5" max="8" class="w-full bg-[#07080d] border border-gray-700 rounded p-1.5 text-center text-white" />
              </div>
              <div>
                <label class="block text-[10px] text-gray-400 mb-1">R3 Interval</label>
                <input id="inp_wi3" type="number" step="0.1" min="0.5" max="8" class="w-full bg-[#07080d] border border-gray-700 rounded p-1.5 text-center text-white" />
              </div>
              <div>
                <label class="block text-[10px] text-gray-400 mb-1">R4 Interval</label>
                <input id="inp_wi4" type="number" step="0.1" min="0.5" max="8" class="w-full bg-[#07080d] border border-gray-700 rounded p-1.5 text-center text-white" />
              </div>
              <div>
                <label class="block text-[10px] text-pink-400 mb-1">Endless</label>
                <input id="inp_wi5" type="number" step="0.1" min="0.5" max="8" class="w-full bg-[#07080d] border border-gray-700 rounded p-1.5 text-center text-white" />
              </div>
            </div>
          </div>
        </div>

        <!-- 2. Procedural Randomness -->
        <div class="bg-[#121520] border border-gray-800 rounded-xl p-5 flex flex-col gap-3.5 text-xs">
          <div class="border-b border-gray-800 pb-2 text-cyan-400 font-bold uppercase text-sm">
            2. Procedural Randomness Tuning
          </div>

          <div>
            <div class="flex justify-between mb-1"><span>Gap Position Spread</span><span id="val_gapPos" class="text-cyan-300 font-bold">68%</span></div>
            <input id="inp_gapPos" type="range" min="0.1" max="0.9" step="0.02" oninput="updateLabels()" class="w-full accent-cyan-400" />
          </div>

          <div>
            <div class="flex justify-between mb-1"><span>Gap Width Variance</span><span id="val_gapSize" class="text-cyan-300 font-bold">±22%</span></div>
            <input id="inp_gapSize" type="range" min="0" max="0.45" step="0.02" oninput="updateLabels()" class="w-full accent-cyan-400" />
          </div>

          <div>
            <div class="flex justify-between mb-1"><span>Wave Speed Variance</span><span id="val_speedVar" class="text-cyan-300 font-bold">±15%</span></div>
            <input id="inp_speedVar" type="range" min="0" max="0.45" step="0.02" oninput="updateLabels()" class="w-full accent-cyan-400" />
          </div>

          <div>
            <div class="flex justify-between mb-1"><span>Wave Timing Jitter</span><span id="val_jitter" class="text-cyan-300 font-bold">±18%</span></div>
            <input id="inp_jitter" type="range" min="0" max="0.4" step="0.02" oninput="updateLabels()" class="w-full accent-cyan-400" />
          </div>

          <div>
            <div class="flex justify-between mb-1"><span>Multi-Side Stagger Variance</span><span id="val_stagVar" class="text-cyan-300 font-bold">±25%</span></div>
            <input id="inp_stagVar" type="range" min="0" max="0.45" step="0.02" oninput="updateLabels()" class="w-full accent-cyan-400" />
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-gray-800">
            <label class="flex items-center gap-2 cursor-pointer text-gray-200">
              <input id="inp_randR1" type="checkbox" class="accent-cyan-400 w-4 h-4" />
              <span>Randomize Starting Cardinal Side Each Match</span>
            </label>
          </div>
        </div>

        <!-- 3. Obstacle Speeds, Gap Widths & Player Geometry -->
        <div class="bg-[#121520] border border-gray-800 rounded-xl p-5 flex flex-col gap-3.5 text-xs">
          <div class="border-b border-gray-800 pb-2 text-cyan-400 font-bold uppercase text-sm">
            3. Obstacle Physics, Gaps & Player Hitbox
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-gray-400 mb-1">Base Obstacle Speed (px/s)</label>
              <input id="inp_baseSpeed" type="number" min="50" max="450" step="5" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label class="block text-gray-400 mb-1">Speed Added Per Round (px/s)</label>
              <input id="inp_speedPerTier" type="number" min="0" max="80" step="1" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label class="block text-gray-400 mb-1">Endless Max Bonus Speed</label>
              <input id="inp_endlessMax" type="number" min="0" max="350" step="5" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label class="block text-gray-400 mb-1">Endless Accel (px/s²)</label>
              <input id="inp_endlessRate" type="number" min="0" max="20" step="0.5" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label class="block text-gray-400 mb-1">Base Gate Width (px)</label>
              <input id="inp_gapBase" type="number" min="45" max="200" step="2" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label class="block text-gray-400 mb-1">Min Gate Width (px)</label>
              <input id="inp_gapMin" type="number" min="40" max="160" step="2" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label class="block text-gray-400 mb-1">Gate Narrowing / Round (px)</label>
              <input id="inp_gapDec" type="number" min="0" max="25" step="1" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label class="block text-gray-400 mb-1">Multi-Side Stagger Delay (ms)</label>
              <input id="inp_staggerMs" type="number" min="80" max="1000" step="10" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label class="block text-gray-400 mb-1">Player Ball Radius (px)</label>
              <input id="inp_playerRadius" type="number" min="6" max="28" step="1" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label class="block text-gray-400 mb-1">Hitbox Forgiveness (px)</label>
              <input id="inp_forgiveness" type="number" min="0" max="6" step="0.5" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
            </div>
          </div>
        </div>

        <!-- 4. Allowed Procedural Obstacle Types & Weights -->
        <div class="bg-[#121520] border border-gray-800 rounded-xl p-5 flex flex-col gap-3 text-xs">
          <div class="border-b border-gray-800 pb-2 text-cyan-400 font-bold uppercase text-sm">
            4. Procedural Obstacle Types & Spawn Weights
          </div>
          <div id="obstacleTypesList" class="flex flex-col gap-3"></div>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- TAB 2: POSTGRESQL DATABASE STUDIO          -->
    <!-- ========================================== -->
    <div id="tabSql" class="hidden flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-sm font-bold text-cyan-400">Interactive SQL Query Runner</div>
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
  </div>

  <script>
    let currentConfig = null;

    function switchTab(tab) {
      const tuningEl = document.getElementById('tabTuning');
      const sqlEl = document.getElementById('tabSql');
      const btnTuning = document.getElementById('tabBtnTuning');
      const btnSql = document.getElementById('tabBtnSql');
      if (tab === 'tuning') {
        tuningEl.classList.remove('hidden');
        sqlEl.classList.add('hidden');
        btnTuning.className = 'px-4 py-2 bg-cyan-500 text-black font-bold rounded-lg text-xs uppercase tracking-wider transition';
        btnSql.className = 'px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold rounded-lg text-xs uppercase tracking-wider border border-gray-700 transition';
      } else {
        tuningEl.classList.add('hidden');
        sqlEl.classList.remove('hidden');
        sqlEl.classList.add('flex');
        btnSql.className = 'px-4 py-2 bg-cyan-500 text-black font-bold rounded-lg text-xs uppercase tracking-wider transition';
        btnTuning.className = 'px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold rounded-lg text-xs uppercase tracking-wider border border-gray-700 transition';
        runQuery();
      }
    }

    function populateForm(cfg) {
      currentConfig = cfg;
      document.getElementById('inp_r1').value = cfg.rounds.tierDurations[1];
      document.getElementById('inp_r2').value = cfg.rounds.tierDurations[2];
      document.getElementById('inp_r3').value = cfg.rounds.tierDurations[3];
      document.getElementById('inp_r4').value = cfg.rounds.tierDurations[4];

      document.getElementById('inp_wi1').value = cfg.obstacles.waveIntervals[1];
      document.getElementById('inp_wi2').value = cfg.obstacles.waveIntervals[2];
      document.getElementById('inp_wi3').value = cfg.obstacles.waveIntervals[3];
      document.getElementById('inp_wi4').value = cfg.obstacles.waveIntervals[4];
      document.getElementById('inp_wi5').value = cfg.obstacles.waveIntervals[5];

      document.getElementById('inp_gapPos').value = cfg.randomness.gapPositionVariance;
      document.getElementById('inp_gapSize').value = cfg.randomness.gapSizeVariance;
      document.getElementById('inp_speedVar').value = cfg.randomness.speedVariance;
      document.getElementById('inp_jitter').value = cfg.randomness.waveIntervalJitter;
      document.getElementById('inp_stagVar').value = cfg.randomness.staggerVariance;
      document.getElementById('inp_randR1').checked = Boolean(cfg.randomness.randomizeRound1Direction);

      document.getElementById('inp_baseSpeed').value = cfg.obstacles.baseSpeed;
      document.getElementById('inp_speedPerTier').value = cfg.obstacles.speedPerTier;
      document.getElementById('inp_endlessMax').value = cfg.obstacles.endlessMaxBonusSpeed;
      document.getElementById('inp_endlessRate').value = cfg.obstacles.endlessSpeedScaleRate;
      document.getElementById('inp_gapBase').value = cfg.obstacles.gapBaseWidth;
      document.getElementById('inp_gapMin').value = cfg.obstacles.gapMinWidth;
      document.getElementById('inp_gapDec').value = cfg.obstacles.gapTierDecrement;
      document.getElementById('inp_staggerMs').value = cfg.obstacles.staggerMs;

      document.getElementById('inp_playerRadius').value = cfg.arena.playerRadius;
      document.getElementById('inp_forgiveness').value = cfg.arena.hitboxForgiveness;

      renderObstacleTypes(cfg.obstacleTypes);
      updateLabels();
    }

    function renderObstacleTypes(typesObj) {
      const container = document.getElementById('obstacleTypesList');
      container.innerHTML = Object.keys(typesObj).map((key) => {
        const item = typesObj[key];
        return \`
          <div class="p-3 bg-[#090b12] border border-gray-800 rounded-lg flex flex-wrap items-center justify-between gap-3">
            <label class="flex items-center gap-2 cursor-pointer text-gray-200 font-semibold">
              <input type="checkbox" id="ot_en_\${key}" \${item.enabled ? 'checked' : ''} class="accent-cyan-400 w-4 h-4" />
              <span>\${item.label}</span>
              <span class="text-[10px] text-gray-500">(\${key})</span>
            </label>
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-1.5">
                <span class="text-[11px] text-gray-400">Min Round:</span>
                <select id="ot_tier_\${key}" class="bg-[#121520] border border-gray-700 rounded px-2 py-1 text-xs text-cyan-300">
                  \${[1,2,3,4,5].map(t => \`<option value="\${t}" \${item.minTier === t ? 'selected' : ''}>\${t === 5 ? 'Endless' : 'Round ' + t}</option>\`).join('')}
                </select>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[11px] text-gray-400 w-20">Weight: <b id="ot_wval_\${key}" class="text-cyan-300">\${item.weight}</b></span>
                <input type="range" id="ot_w_\${key}" min="0" max="100" step="5" value="\${item.weight}"
                  oninput="document.getElementById('ot_wval_\${key}').textContent = this.value"
                  class="w-24 accent-cyan-400" />
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    function updateLabels() {
      document.getElementById('val_r1').textContent = document.getElementById('inp_r1').value + 's';
      document.getElementById('val_r2').textContent = document.getElementById('inp_r2').value + 's';
      document.getElementById('val_r3').textContent = document.getElementById('inp_r3').value + 's';
      document.getElementById('val_r4').textContent = document.getElementById('inp_r4').value + 's';

      document.getElementById('val_gapPos').textContent = Math.round(Number(document.getElementById('inp_gapPos').value) * 100) + '%';
      document.getElementById('val_gapSize').textContent = '±' + Math.round(Number(document.getElementById('inp_gapSize').value) * 100) + '%';
      document.getElementById('val_speedVar').textContent = '±' + Math.round(Number(document.getElementById('inp_speedVar').value) * 100) + '%';
      document.getElementById('val_jitter').textContent = '±' + Math.round(Number(document.getElementById('inp_jitter').value) * 100) + '%';
      document.getElementById('val_stagVar').textContent = '±' + Math.round(Number(document.getElementById('inp_stagVar').value) * 100) + '%';
    }

    function syncAllRounds() {
      const v = document.getElementById('inp_r1').value;
      document.getElementById('inp_r2').value = v;
      document.getElementById('inp_r3').value = v;
      document.getElementById('inp_r4').value = v;
      updateLabels();
    }

    function buildPayloadFromForm() {
      const obstacleTypes = {};
      if (currentConfig && currentConfig.obstacleTypes) {
        for (const key of Object.keys(currentConfig.obstacleTypes)) {
          obstacleTypes[key] = {
            ...currentConfig.obstacleTypes[key],
            enabled: document.getElementById('ot_en_' + key).checked,
            minTier: Number(document.getElementById('ot_tier_' + key).value),
            weight: Number(document.getElementById('ot_w_' + key).value),
          };
        }
      }
      return {
        rounds: {
          defaultRoundDurationSeconds: Number(document.getElementById('inp_r1').value),
          tierDurations: {
            1: Number(document.getElementById('inp_r1').value),
            2: Number(document.getElementById('inp_r2').value),
            3: Number(document.getElementById('inp_r3').value),
            4: Number(document.getElementById('inp_r4').value),
          },
        },
        randomness: {
          gapPositionVariance: Number(document.getElementById('inp_gapPos').value),
          gapSizeVariance: Number(document.getElementById('inp_gapSize').value),
          speedVariance: Number(document.getElementById('inp_speedVar').value),
          waveIntervalJitter: Number(document.getElementById('inp_jitter').value),
          staggerVariance: Number(document.getElementById('inp_stagVar').value),
          randomizeRound1Direction: document.getElementById('inp_randR1').checked,
        },
        obstacles: {
          baseSpeed: Number(document.getElementById('inp_baseSpeed').value),
          speedPerTier: Number(document.getElementById('inp_speedPerTier').value),
          endlessMaxBonusSpeed: Number(document.getElementById('inp_endlessMax').value),
          endlessSpeedScaleRate: Number(document.getElementById('inp_endlessRate').value),
          gapBaseWidth: Number(document.getElementById('inp_gapBase').value),
          gapMinWidth: Number(document.getElementById('inp_gapMin').value),
          gapTierDecrement: Number(document.getElementById('inp_gapDec').value),
          staggerMs: Number(document.getElementById('inp_staggerMs').value),
          waveIntervals: {
            1: Number(document.getElementById('inp_wi1').value),
            2: Number(document.getElementById('inp_wi2').value),
            3: Number(document.getElementById('inp_wi3').value),
            4: Number(document.getElementById('inp_wi4').value),
            5: Number(document.getElementById('inp_wi5').value),
          },
        },
        arena: {
          playerRadius: Number(document.getElementById('inp_playerRadius').value),
          hitboxForgiveness: Number(document.getElementById('inp_forgiveness').value),
        },
        obstacleTypes,
      };
    }

    async function loadConfig() {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      populateForm(cfg);
    }

    async function saveConfig() {
      const statusEl = document.getElementById('saveStatus');
      statusEl.innerHTML = '<span class="text-yellow-400">Saving configuration...</span>';
      try {
        const payload = buildPayloadFromForm();
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const updated = await res.json();
        if (!res.ok) throw new Error(updated.error || 'Failed to save config');
        populateForm(updated);
        statusEl.innerHTML = '<span class="text-green-400 font-bold">✓ Saved live & persisted to server/tuning-config.json at ' + new Date().toLocaleTimeString() + '</span>';
      } catch (err) {
        statusEl.innerHTML = '<span class="text-red-400 font-bold">Error: ' + err.message + '</span>';
      }
    }

    async function resetConfig() {
      if (!confirm('Reset all tuning settings back to factory defaults?')) return;
      const statusEl = document.getElementById('saveStatus');
      const res = await fetch('/api/config/reset', { method: 'POST' });
      const updated = await res.json();
      populateForm(updated);
      statusEl.innerHTML = '<span class="text-cyan-400 font-bold">↺ Reset to default settings & saved to server/tuning-config.json</span>';
    }

    function exportConfigJson() {
      const payload = buildPayloadFromForm();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'precision-path-tuning.json';
      a.click();
      URL.revokeObjectURL(url);
    }

    function importConfigJson(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed),
          });
          const updated = await res.json();
          populateForm(updated);
          document.getElementById('saveStatus').innerHTML = '<span class="text-green-400 font-bold">✓ Imported & saved ' + file.name + ' to server/tuning-config.json</span>';
        } catch (err) {
          alert('Invalid JSON config file: ' + err.message);
        }
      };
      reader.readAsText(file);
    }

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

    loadConfig();
  </script>
</body>
</html>`);
});

app.get('/api/config', (req, res) => {
  res.json(GAME_CONFIG);
});

app.post('/api/config', (req, res) => {
  const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  if (!isLocal) {
    return res.status(403).json({ error: 'Tuning configuration is restricted to localhost admin access.' });
  }
  applyTuningConfig(req.body);
  saveTuningConfigToDisk();
  res.json(GAME_CONFIG);
});

app.post('/api/config/reset', (req, res) => {
  const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  if (!isLocal) {
    return res.status(403).json({ error: 'Tuning configuration is restricted to localhost admin access.' });
  }
  applyTuningConfig(DEFAULT_GAME_CONFIG);
  saveTuningConfigToDisk();
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
    try {
      await orm.em.getConnection().execute(
        'UPDATE users SET best_score = total_score WHERE best_score = 0 AND total_score > 0;'
      );
    } catch {
      // ignore if table is brand new
    }
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
