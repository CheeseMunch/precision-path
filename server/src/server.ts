import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
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
import { ClientInput, GameMode, CampaignLevelConfig, CampaignWaveSpec, CampaignPatternTemplate } from '../../shared/types.js';
import { GAME_CONFIG, ObstaclePatternType } from '../../shared/gameConfig.js';
import { CAMPAIGN_CONFIG, DEFAULT_CAMPAIGN_LEVELS } from '../../shared/campaignConfig.js';
import { renderCampaignAdminPage } from './campaignAdminHtml.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 4000);
const BIND_HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

// Persistent secret CSRF token for the localhost-only /db-admin console (stable across restarts)
const ADMIN_TOKEN_FILE = path.resolve(__dirname, '../.admin-token');
let ADMIN_SESSION_TOKEN = '';
try {
  if (fs.existsSync(ADMIN_TOKEN_FILE)) {
    ADMIN_SESSION_TOKEN = fs.readFileSync(ADMIN_TOKEN_FILE, 'utf8').trim();
  }
} catch {}
if (!ADMIN_SESSION_TOKEN || ADMIN_SESSION_TOKEN.length < 32) {
  ADMIN_SESSION_TOKEN = crypto.randomBytes(24).toString('hex');
  try {
    fs.writeFileSync(ADMIN_TOKEN_FILE, ADMIN_SESSION_TOKEN, 'utf8');
  } catch {}
}

/**
 * Verifies a request originates directly from a local browser on the host machine
 * (never forwarded through Cloudflare Tunnel or a remote proxy).
 */
function isDirectLocalhost(req: express.Request): boolean {
  const host = (req.hostname || '').toLowerCase();
  const rawHostHeader = (String(req.headers.host || '')).toLowerCase();
  const isLocalHostHeader =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    rawHostHeader.startsWith('localhost') ||
    rawHostHeader.startsWith('127.0.0.1') ||
    rawHostHeader.startsWith('[::1]');

  const hasProxyHeaders = Boolean(
    req.headers['cf-ray'] ||
      req.headers['cf-connecting-ip'] ||
      req.headers['x-forwarded-for'] ||
      req.headers['x-forwarded-host'] ||
      req.headers['cf-visitor']
  );

  const remoteAddr = String(req.socket.remoteAddress || '');
  const isLoopbackSocket =
    !remoteAddr ||
    remoteAddr === '127.0.0.1' ||
    remoteAddr === '::1' ||
    remoteAddr === '::ffff:127.0.0.1';

  return isLocalHostHeader && !hasProxyHeaders && isLoopbackSocket;
}

function hasValidAdminToken(req: express.Request): boolean {
  const headerToken = req.headers['x-admin-token'];
  const cookieHeader = String(req.headers.cookie || '');
  const cookieMatch = cookieHeader.match(/precision_admin_token=([a-f0-9]+)/);
  const cookieToken = cookieMatch ? cookieMatch[1] : null;
  const token = (typeof headerToken === 'string' && headerToken) || cookieToken;
  return Boolean(token && token === ADMIN_SESSION_TOKEN);
}

app.use(cors());
app.use(express.json({ limit: '32kb' }));

const io = new Server(server, {
  maxHttpBufferSize: 16384, // 16KB max packet size against DoS
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
  if (!isDirectLocalhost(req)) {
    return res.status(403).json({ error: 'Database dump is restricted to direct localhost access.' });
  }
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
    if (typeof body.rounds.totalRoundsBeforeEndless === 'number') {
      GAME_CONFIG.rounds.totalRoundsBeforeEndless = Math.max(1, Math.min(10, Math.round(body.rounds.totalRoundsBeforeEndless)));
    }
    if (typeof body.rounds.defaultRoundDurationSeconds === 'number') {
      GAME_CONFIG.rounds.defaultRoundDurationSeconds = Math.max(2, body.rounds.defaultRoundDurationSeconds);
    }
    if (body.rounds.tierDurations && typeof body.rounds.tierDurations === 'object') {
      for (const t of Object.keys(body.rounds.tierDurations)) {
        const numT = Number(t);
        const val = body.rounds.tierDurations[t];
        if (typeof val === 'number') {
          GAME_CONFIG.rounds.tierDurations[numT] = Math.max(2, val);
        }
      }
    }
    if (body.rounds.tierDirections && typeof body.rounds.tierDirections === 'object') {
      if (!GAME_CONFIG.rounds.tierDirections) {
        GAME_CONFIG.rounds.tierDirections = {};
      }
      for (const t of Object.keys(body.rounds.tierDirections)) {
        const numT = Number(t);
        const item = body.rounds.tierDirections[t];
        if (item && typeof item === 'object') {
          GAME_CONFIG.rounds.tierDirections[numT] = {
            mode: item.mode || 'custom',
            directions: Array.isArray(item.directions) ? item.directions : ['north'],
          };
        }
      }
    }
    if (body.rounds.endlessDirections && typeof body.rounds.endlessDirections === 'object') {
      GAME_CONFIG.rounds.endlessDirections = {
        mode: body.rounds.endlessDirections.mode || 'all',
        directions: Array.isArray(body.rounds.endlessDirections.directions)
          ? body.rounds.endlessDirections.directions
          : ['north', 'south', 'east', 'west'],
      };
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
          GAME_CONFIG.obstacleTypes[key].minTier = Math.max(1, Math.min(99, Math.round(incoming.minTier)));
        }
        if (incoming.tierWeights && typeof incoming.tierWeights === 'object') {
          if (!GAME_CONFIG.obstacleTypes[key].tierWeights) {
            GAME_CONFIG.obstacleTypes[key].tierWeights = {};
          }
          for (const t of Object.keys(incoming.tierWeights)) {
            const val = incoming.tierWeights[t];
            if (typeof val === 'number') {
              GAME_CONFIG.obstacleTypes[key].tierWeights![t] = Math.max(0, val);
            }
          }
        }
      }
    }
  }

  if (body.obstacles) {
    const o = body.obstacles;
    if (typeof o.baseSpeed === 'number') GAME_CONFIG.obstacles.baseSpeed = Math.max(40, Math.min(500, o.baseSpeed));
    if (typeof o.verticalLineSpeedMultiplier === 'number') GAME_CONFIG.obstacles.verticalLineSpeedMultiplier = Math.max(0.2, Math.min(2.5, o.verticalLineSpeedMultiplier));
    if (typeof o.horizontalLineSpeedMultiplier === 'number') GAME_CONFIG.obstacles.horizontalLineSpeedMultiplier = Math.max(0.2, Math.min(2.5, o.horizontalLineSpeedMultiplier));
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
    if (typeof a.hitboxForgiveness === 'number') GAME_CONFIG.arena.hitboxForgiveness = Math.max(0, Math.min(12, a.hitboxForgiveness));
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

const CAMPAIGN_CONFIG_PATH = path.resolve(__dirname, '../campaign-config.json');

function sanitizeCampaignWaves(rawWaves: any[], idPrefix: string): CampaignWaveSpec[] {
  const validPatterns = [
    'single-gap-wall',
    'double-gap-wall',
    'sweeping-half-wall',
    'staggered-blocks',
    'orb-cluster',
    'diagonal-spinner',
  ];
  return Array.isArray(rawWaves)
    ? rawWaves.map((w: any, wIdx: number) => {
        const side = ['north', 'south', 'east', 'west'].includes(w.side) ? w.side : 'north';
        const isVert = side === 'north' || side === 'south';
        const latLimit = isVert ? 225 : 400;
        const patternType = validPatterns.includes(w.patternType) ? w.patternType : 'single-gap-wall';
        return {
          id: String(w.id || `${idPrefix}-w-${wIdx + 1}`),
          order: Math.max(1, Math.round(Number(w.order ?? wIdx + 1))),
          delayAfterPrev: Math.max(0, Math.min(30, Number(w.delayAfterPrev ?? 1.5))),
          side,
          patternType,
          speed: Math.max(40, Math.min(600, Number(w.speed ?? 175))),
          gapCenter: Math.max(-latLimit, Math.min(latLimit, Number(w.gapCenter ?? 0))),
          gapSize: Math.max(60, Math.min(400, Number(w.gapSize ?? 120))),
          barThickness: Math.max(8, Math.min(48, Number(w.barThickness ?? 18))),
          color: w.color ? String(w.color).slice(0, 24) : undefined,
          patternGroupId: w.patternGroupId ? String(w.patternGroupId).slice(0, 64) : undefined,
          patternGroupName: w.patternGroupName ? String(w.patternGroupName).slice(0, 48) : undefined,
          attachedGates: Array.isArray(w.attachedGates)
            ? w.attachedGates.map((g: any, gIdx: number) => {
                const s = Number(g.start ?? -60);
                const e = Number(g.end ?? 60);
                return {
                  id: String(g.id || `${idPrefix}-g-${wIdx + 1}-${gIdx + 1}`),
                  order: Math.max(1, Math.round(Number(g.order ?? wIdx + 1))),
                  start: Math.max(-latLimit, Math.min(latLimit, Math.min(s, e))),
                  end: Math.max(-latLimit, Math.min(latLimit, Math.max(s, e))),
                  points: Math.max(0, Math.round(Number(g.points ?? 200))),
                  label: g.label ? String(g.label).slice(0, 24) : undefined,
                };
              })
            : [],
        };
      })
    : [];
}

function applyCampaignConfig(body: any) {
  if (!body) return;
  if (Array.isArray(body.levels) && body.levels.length > 0) {
    const sanitized: CampaignLevelConfig[] = body.levels.map((lvl: any, idx: number) => ({
      id: String(lvl.id || `level-${idx + 1}`),
      levelNumber: idx + 1,
      name: String(lvl.name || `Level ${idx + 1}`).slice(0, 60),
      description: String(lvl.description || '').slice(0, 160),
      spawn: {
        x: Math.max(-210, Math.min(210, Number(lvl.spawn?.x ?? 0))),
        y: Math.max(-385, Math.min(385, Number(lvl.spawn?.y ?? 340))),
      },
      clearBonusPoints: Math.max(0, Math.round(Number(lvl.clearBonusPoints ?? 500))),
      parTimeSeconds: Math.max(5, Math.round(Number(lvl.parTimeSeconds ?? 25))),
      waves: sanitizeCampaignWaves(lvl.waves, `lvl-${idx + 1}`),
      checkpoints: Array.isArray(lvl.checkpoints)
        ? lvl.checkpoints.map((cp: any, cpIdx: number) => {
            const axis = cp.axis === 'vertical' ? 'vertical' : 'horizontal';
            const coordLimit = axis === 'horizontal' ? 400 : 225;
            const spanLimit = axis === 'horizontal' ? 225 : 400;
            const rawStart = Number(cp.start ?? -80);
            const rawEnd = Number(cp.end ?? 80);
            return {
              id: String(cp.id || `cp-${idx + 1}-${cpIdx + 1}`),
              order: Math.max(1, Math.round(Number(cp.order ?? cpIdx + 1))),
              axis,
              coord: Math.max(-coordLimit, Math.min(coordLimit, Number(cp.coord ?? 0))),
              start: Math.max(-spanLimit, Math.min(spanLimit, Math.min(rawStart, rawEnd))),
              end: Math.max(-spanLimit, Math.min(spanLimit, Math.max(rawStart, rawEnd))),
              points: Math.max(0, Math.round(Number(cp.points ?? 100))),
              label: cp.label ? String(cp.label).slice(0, 24) : undefined,
            };
          })
        : [],
      obstacles: Array.isArray(lvl.obstacles)
        ? lvl.obstacles.map((obs: any, oIdx: number) => ({
            id: String(obs.id || `obs-${idx + 1}-${oIdx + 1}`),
            type: obs.type === 'circle' ? 'circle' : 'rectangle',
            x: Math.max(-225, Math.min(225, Number(obs.x ?? 0))),
            y: Math.max(-400, Math.min(400, Number(obs.y ?? 0))),
            width: obs.width !== undefined ? Math.max(8, Math.min(450, Number(obs.width))) : undefined,
            height: obs.height !== undefined ? Math.max(8, Math.min(450, Number(obs.height))) : undefined,
            radius: obs.radius !== undefined ? Math.max(6, Math.min(120, Number(obs.radius))) : undefined,
            rotation: Number(obs.rotation ?? 0),
            rotationSpeed: Number(obs.rotationSpeed ?? 0),
            patrolAxis: obs.patrolAxis === 'x' || obs.patrolAxis === 'y' ? obs.patrolAxis : 'none',
            patrolRange: Math.max(0, Math.min(350, Number(obs.patrolRange ?? 0))),
            patrolSpeed: Number(obs.patrolSpeed ?? 0),
            color: obs.color ? String(obs.color).slice(0, 24) : '#ff2a6d',
          }))
        : [],
    }));
    CAMPAIGN_CONFIG.levels = sanitized;
  }

  if (Array.isArray(body.patterns)) {
    const sanitizedPatterns: CampaignPatternTemplate[] = body.patterns.map((pat: any, pIdx: number) => ({
      id: String(pat.id || `pat-${pIdx + 1}`),
      name: String(pat.name || `Pattern ${pIdx + 1}`).slice(0, 60),
      description: pat.description ? String(pat.description).slice(0, 160) : '',
      waves: sanitizeCampaignWaves(pat.waves, `pat-${pIdx + 1}`),
    }));
    CAMPAIGN_CONFIG.patterns = sanitizedPatterns;
  }
}

function saveCampaignConfigToDisk() {
  try {
    fs.writeFileSync(CAMPAIGN_CONFIG_PATH, JSON.stringify(CAMPAIGN_CONFIG, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Config] Failed to save campaign-config.json:', err);
  }
}

if (fs.existsSync(CAMPAIGN_CONFIG_PATH)) {
  try {
    const savedCampaign = JSON.parse(fs.readFileSync(CAMPAIGN_CONFIG_PATH, 'utf8'));
    applyCampaignConfig(savedCampaign);
    console.log(`[Config] Loaded persisted campaign configuration from ${CAMPAIGN_CONFIG_PATH}`);
  } catch (err) {
    console.warn('[Config] Failed to parse saved campaign-config.json, using defaults:', err);
  }
} else {
  saveCampaignConfigToDisk();
}

// Localhost-only interactive SQL execution endpoint for the DB Admin GUI
app.post('/api/sql', async (req, res) => {
  if (!isDirectLocalhost(req) || !hasValidAdminToken(req)) {
    return res.status(403).json({ error: 'SQL Studio is restricted to authenticated direct localhost access.' });
  }
  if (!orm) {
    return res.status(503).json({ error: 'PostgreSQL is not connected.' });
  }
  const query = String(req.body?.query || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'Please enter a SQL query.' });
  }
  // Block dangerous OS/filesystem-level PostgreSQL superuser commands
  if (
    /\b(program|pg_read_server_files|pg_write_server_files|pg_execute_server_program|lo_import|lo_export|alter\s+system|copy\s+.*\s+to|copy\s+.*\s+from)\b/i.test(
      query
    )
  ) {
    return res.status(403).json({ error: 'Filesystem and OS-level SQL commands are disabled for security.' });
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
  if (!isDirectLocalhost(req)) {
    return res.status(403).send('Admin Studio is restricted to direct localhost access on the host PC.');
  }
  res.setHeader('Set-Cookie', `precision_admin_token=${ADMIN_SESSION_TOKEN}; Path=/; SameSite=Lax; HttpOnly`);
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
        <a href="/campaign-admin" class="px-4 py-2 bg-emerald-900/60 hover:bg-emerald-800/80 text-emerald-200 font-bold rounded-lg text-xs uppercase tracking-wider border border-emerald-500/40 transition flex items-center">
          🎯 Campaign Levels
        </a>
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
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- 1. Round Durations, Intervals & Direction Waves -->
        <div class="bg-[#121520] border border-gray-800 rounded-xl p-5 flex flex-col gap-4 lg:col-span-2">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-2 gap-2">
            <div>
              <span class="text-cyan-400 font-bold uppercase text-sm">1. Round Timing, Wave Intervals & Custom Direction Waves</span>
              <span class="text-[11px] text-gray-400 block sm:inline sm:ml-2">Select cardinal wave directions (North, South, East, West) or random axis modes per round</span>
            </div>
            <button onclick="syncAllRounds()" class="text-[11px] text-cyan-300 hover:underline text-left sm:text-right">Sync All Durations to Round 1</button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Total Rounds Before Endless Selector -->
            <div class="bg-[#090b12] border border-gray-800 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div class="font-bold text-gray-200 text-xs">Total Rounds Before Endless</div>
                <div class="text-[11px] text-gray-400">Number of timed rounds to clear before entering Endless Mode (1–10)</div>
              </div>
              <div class="flex items-center gap-2">
                <span id="val_totalRounds" class="text-cyan-400 font-bold text-xs font-mono">4 Rounds</span>
                <input
                  id="inp_totalRounds"
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  oninput="onTotalRoundsChange()"
                  class="w-16 bg-[#121520] border border-cyan-500/50 rounded p-1 text-center font-bold text-cyan-300 text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <!-- Wave Spawn Intervals -->
            <div class="bg-[#090b12] border border-gray-800 rounded-lg p-3">
              <div class="text-cyan-400 font-bold uppercase text-[10px] tracking-wider mb-2">Wave Spawn Intervals (Seconds Between Waves)</div>
              <div class="grid grid-cols-5 gap-2 text-xs">
                <div>
                  <label class="block text-[10px] text-gray-400 mb-0.5">R1</label>
                  <input id="inp_wi1" type="number" step="0.1" min="0.5" max="8" class="w-full bg-[#07080d] border border-gray-700 rounded p-1 text-center text-white text-xs" />
                </div>
                <div>
                  <label class="block text-[10px] text-gray-400 mb-0.5">R2</label>
                  <input id="inp_wi2" type="number" step="0.1" min="0.5" max="8" class="w-full bg-[#07080d] border border-gray-700 rounded p-1 text-center text-white text-xs" />
                </div>
                <div>
                  <label class="block text-[10px] text-gray-400 mb-0.5">R3</label>
                  <input id="inp_wi3" type="number" step="0.1" min="0.5" max="8" class="w-full bg-[#07080d] border border-gray-700 rounded p-1 text-center text-white text-xs" />
                </div>
                <div>
                  <label class="block text-[10px] text-gray-400 mb-0.5">R4</label>
                  <input id="inp_wi4" type="number" step="0.1" min="0.5" max="8" class="w-full bg-[#07080d] border border-gray-700 rounded p-1 text-center text-white text-xs" />
                </div>
                <div>
                  <label class="block text-[10px] text-pink-400 mb-0.5">Endless</label>
                  <input id="inp_wi5" type="number" step="0.1" min="0.5" max="8" class="w-full bg-[#07080d] border border-gray-700 rounded p-1 text-center text-white text-xs" />
                </div>
              </div>
            </div>
          </div>

          <!-- Dynamic Round Configuration List -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <div class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                Round Configurations (<span id="lbl_totalRoundsInSec1">4</span> Rounds + Endless)
              </div>
              <div class="hidden sm:flex items-center gap-3 text-[11px] text-gray-400">
                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-[#ff2a6d]"></span> North (Top)</span>
                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-[#ff7700]"></span> South (Btm)</span>
                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-[#05d5fa]"></span> West (Left)</span>
                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-[#d300c5]"></span> East (Right)</span>
              </div>
            </div>
            <div id="roundDurationsList" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 text-xs"></div>
          </div>
        </div>

        <!-- 2. Procedural Randomness -->
        <div class="bg-[#121520] border border-gray-800 rounded-xl p-5 flex flex-col gap-4 text-xs">
          <div class="border-b border-gray-800 pb-2 text-cyan-400 font-bold uppercase text-sm">
            2. Procedural Randomness Tuning
          </div>

          <div>
            <div class="flex justify-between mb-1">
              <span class="font-semibold text-gray-200">Gap Position Spread</span>
              <span id="val_gapPos" class="text-cyan-300 font-bold">68%</span>
            </div>
            <input id="inp_gapPos" type="range" min="0.1" max="0.9" step="0.02" oninput="updateLabels()" class="w-full accent-cyan-400" />
            <p class="text-[11px] text-gray-400 mt-1 leading-normal">
              Controls how far gate openings can spawn away from the arena center. Higher values push gates closer to the perimeter edges; lower values keep openings centered.
            </p>
          </div>

          <div>
            <div class="flex justify-between mb-1">
              <span class="font-semibold text-gray-200">Gap Width Variance</span>
              <span id="val_gapSize" class="text-cyan-300 font-bold">±22%</span>
            </div>
            <input id="inp_gapSize" type="range" min="0" max="0.45" step="0.02" oninput="updateLabels()" class="w-full accent-cyan-400" />
            <p class="text-[11px] text-gray-400 mt-1 leading-normal">
              Random variation applied to gate opening widths on each wave line. Creates a dynamic mix of tight narrow gates and wider passages.
            </p>
          </div>

          <div>
            <div class="flex justify-between mb-1">
              <span class="font-semibold text-gray-200">Wave Speed Variance</span>
              <span id="val_speedVar" class="text-cyan-300 font-bold">±15%</span>
            </div>
            <input id="inp_speedVar" type="range" min="0" max="0.45" step="0.02" oninput="updateLabels()" class="w-full accent-cyan-400" />
            <p class="text-[11px] text-gray-400 mt-1 leading-normal">
              Random speed fluctuation applied to each obstacle wave, ensuring lines don't all travel at identical robotic velocities.
            </p>
          </div>

          <div>
            <div class="flex justify-between mb-1">
              <span class="font-semibold text-gray-200">Wave Timing Jitter</span>
              <span id="val_jitter" class="text-cyan-300 font-bold">±18%</span>
            </div>
            <input id="inp_jitter" type="range" min="0" max="0.4" step="0.02" oninput="updateLabels()" class="w-full accent-cyan-400" />
            <p class="text-[11px] text-gray-400 mt-1 leading-normal">
              Random time jitter between successive wave spawns to prevent players from relying on a predictable rhythmic spawn metronome.
            </p>
          </div>

          <div>
            <div class="flex justify-between mb-1">
              <span class="font-semibold text-gray-200">Multi-Side Stagger Variance</span>
              <span id="val_stagVar" class="text-cyan-300 font-bold">±25%</span>
            </div>
            <input id="inp_stagVar" type="range" min="0" max="0.45" step="0.02" oninput="updateLabels()" class="w-full accent-cyan-400" />
            <p class="text-[11px] text-gray-400 mt-1 leading-normal">
              Randomizes the stagger delay between directional walls in multi-way rounds (Rounds 2–4 & Endless), preventing walls from converging at exact uniform offsets.
            </p>
          </div>

          <div class="pt-2 border-t border-gray-800">
            <label class="flex items-center gap-2 cursor-pointer text-gray-200 font-semibold">
              <input id="inp_randR1" type="checkbox" class="accent-cyan-400 w-4 h-4" />
              <span>Randomize Starting Cardinal Side Each Match</span>
            </label>
            <p class="text-[11px] text-gray-400 mt-1 leading-normal">
              When checked, Round 1 randomly selects which cardinal direction (North, South, East, or West) waves come from each match instead of always starting from the top.
            </p>
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
              <input id="inp_baseSpeed" type="number" min="50" max="450" step="5" oninput="updateLabels()" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label class="block text-gray-400 mb-1">Speed Added Per Round (px/s)</label>
              <input id="inp_speedPerTier" type="number" min="0" max="80" step="1" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label class="block text-gray-400 mb-1">
                Vertical Lines | Speed Multiplier • <span id="val_vertSpeed" class="text-cyan-300 font-bold">75% (109 px/s)</span>
              </label>
              <input id="inp_vertMult" type="number" min="0.2" max="2.5" step="0.05" oninput="updateLabels()" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label class="block text-gray-400 mb-1">
                Horizontal Lines — Speed Multiplier • <span id="val_horizSpeed" class="text-cyan-300 font-bold">100% (145 px/s)</span>
              </label>
              <input id="inp_horizMult" type="number" min="0.2" max="2.5" step="0.05" oninput="updateLabels()" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
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
              <label class="block text-gray-400 mb-1">Player Visual Radius (px)</label>
              <input id="inp_playerRadius" type="number" min="6" max="28" step="0.5" oninput="updateLabels()" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label class="block text-gray-400 mb-1">
                Hitbox Shrink / Forgiveness (px) • <span id="val_hitbox" class="text-cyan-300 font-bold">Hitbox: 6.5px (50%)</span>
              </label>
              <input id="inp_forgiveness" type="number" min="0" max="12" step="0.5" oninput="updateLabels()" class="w-full bg-[#07080d] border border-gray-700 rounded p-2 text-white" />
            </div>
          </div>
        </div>

        <!-- 4. Allowed Procedural Obstacle Types & Weights by Round -->
        <div class="lg:col-span-2 bg-[#121520] border border-gray-800 rounded-xl p-5 flex flex-col gap-4 text-xs">
          <div class="flex flex-wrap items-center justify-between border-b border-gray-800 pb-2.5 gap-2">
            <div>
              <span class="text-cyan-400 font-bold uppercase text-sm">4. Procedural Obstacle Archetypes & Spawn Weights by Round</span>
              <p class="text-[11px] text-gray-400 mt-0.5">Adjust relative spawn probabilities per round (Rounds 1–<span id="lbl_totalRoundsInSec4" class="text-cyan-300 font-bold">4</span> + Endless). 0 = disabled in that round.</p>
            </div>
            <div class="flex items-center gap-2">
              <span id="badge_activeObstacles" class="px-2.5 py-1 bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 font-bold rounded text-xs font-mono">6 Archetypes</span>
            </div>
          </div>
          <div id="obstacleTypesList" class="flex flex-col gap-3.5"></div>
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
    const ADMIN_TOKEN = "${ADMIN_SESSION_TOKEN}";
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
      const totalRounds = cfg.rounds.totalRoundsBeforeEndless ?? 4;
      document.getElementById('inp_totalRounds').value = totalRounds;
      const sec1TotalLbl = document.getElementById('lbl_totalRoundsInSec1');
      if (sec1TotalLbl) sec1TotalLbl.textContent = totalRounds;
      renderRoundDurationInputs(totalRounds, cfg.rounds.tierDurations, cfg.rounds.defaultRoundDurationSeconds, cfg.rounds.tierDirections, cfg.rounds.endlessDirections);

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
      document.getElementById('inp_vertMult').value = cfg.obstacles.verticalLineSpeedMultiplier ?? 0.75;
      document.getElementById('inp_horizMult').value = cfg.obstacles.horizontalLineSpeedMultiplier ?? 1.0;
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
      if (!container) return;
      const totalRounds = Number(document.getElementById('inp_totalRounds')?.value) || (currentConfig?.rounds?.totalRoundsBeforeEndless ?? 4);

      // Archetype color accents for visual distinction
      const accentColors = {
        'single-gap-wall': '#ff2a6d',
        'double-gap-wall': '#05d5fa',
        'sweeping-half-wall': '#ff7700',
        'staggered-blocks': '#00ffcc',
        'orb-cluster': '#ffea00',
        'diagonal-spinner': '#b800ff',
      };

      container.innerHTML = Object.keys(typesObj).map((key) => {
        const item = typesObj[key];
        const tw = item.tierWeights || {};
        const accent = accentColors[key] || '#05d5fa';

        const tierOptions = [];
        for (let r = 1; r <= totalRounds; r++) {
          tierOptions.push({ val: r, label: 'Round ' + r + '+' });
        }
        tierOptions.push({ val: 99, label: 'Endless Only' });

        const roundCells = [];
        for (let r = 1; r <= totalRounds; r++) {
          const val = tw[r] !== undefined ? tw[r] : item.weight;
          roundCells.push(\`
            <div id="cell_\${key}_\${r}" class="bg-[#121520] border border-gray-800 rounded-lg p-2 flex flex-col items-center transition hover:border-gray-700">
              <span class="text-[10px] font-bold text-gray-300 mb-1">Round \${r}</span>
              <input
                type="number"
                id="ot_tw_\${key}_\${r}"
                min="0"
                max="200"
                step="5"
                value="\${val}"
                oninput="updateWeightBadges()"
                class="w-full bg-[#07080d] border border-gray-700 rounded p-1 text-center font-bold text-cyan-300 text-xs focus:outline-none focus:border-cyan-400"
              />
              <span id="badge_\${key}_\${r}" class="text-[9px] text-gray-500 mt-1 font-mono font-bold">--%</span>
            </div>
          \`);
        }

        const endlessVal = tw.endless !== undefined ? tw.endless : (tw[5] !== undefined ? tw[5] : item.weight);
        roundCells.push(\`
          <div id="cell_\${key}_endless" class="bg-[#170e1e] border border-pink-900/60 rounded-lg p-2 flex flex-col items-center transition hover:border-pink-500/50">
            <span class="text-[10px] font-bold text-pink-400 mb-1">Endless</span>
            <input
              type="number"
              id="ot_tw_\${key}_endless"
              min="0"
              max="200"
              step="5"
              value="\${endlessVal}"
              oninput="updateWeightBadges()"
              class="w-full bg-[#07080d] border border-pink-700/60 rounded p-1 text-center font-bold text-pink-300 text-xs focus:outline-none focus:border-pink-400"
            />
            <span id="badge_\${key}_endless" class="text-[9px] text-pink-400 mt-1 font-mono font-bold">--%</span>
          </div>
        \`);

        return \`
          <div class="p-3.5 bg-[#090b12] border border-gray-800 rounded-xl flex flex-col gap-3 shadow-md hover:border-gray-700 transition">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800/80 pb-2.5">
              <div class="flex items-center gap-2.5">
                <input type="checkbox" id="ot_en_\${key}" \${item.enabled ? 'checked' : ''} onchange="updateWeightBadges()" class="accent-cyan-400 w-4 h-4 cursor-pointer" />
                <span class="w-2.5 h-2.5 rounded-full inline-block" style="background-color: \${accent}"></span>
                <span class="text-gray-100 font-bold text-sm tracking-wide">\${item.label}</span>
                <span class="text-[11px] text-gray-500 font-mono">(\${key})</span>
              </div>
              <div class="flex items-center gap-2 bg-[#121520] border border-gray-800 rounded-lg px-2.5 py-1">
                <span class="text-[11px] text-gray-400">Unlock:</span>
                <select id="ot_tier_\${key}" onchange="updateWeightBadges()" class="bg-[#090b12] border border-gray-700 rounded px-2 py-0.5 text-xs text-cyan-300 font-bold focus:outline-none focus:border-cyan-400">
                  \${tierOptions.map(opt => \`<option value="\${opt.val}" \${(item.minTier >= 99 && opt.val === 99) || item.minTier === opt.val ? 'selected' : ''}>\${opt.label}</option>\`).join('')}
                </select>
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1.5 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                <span>Spawn Weights by Round</span>
                <span class="text-gray-500 font-normal lowercase">(0 = disabled in that round)</span>
              </div>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
                \${roundCells.join('')}
              </div>
            </div>
          </div>
        \`;
      }).join('');

      updateWeightBadges();
    }

    function updateWeightBadges() {
      if (!currentConfig || !currentConfig.obstacleTypes) return;
      const keys = Object.keys(currentConfig.obstacleTypes);
      const totalRounds = Number(document.getElementById('inp_totalRounds')?.value) || (currentConfig.rounds?.totalRoundsBeforeEndless ?? 4);

      // Compute total eligible weight per active round across all enabled obstacles
      const roundTotals = {};
      for (let r = 1; r <= totalRounds; r++) {
        roundTotals[r] = 0;
      }
      roundTotals['endless'] = 0;

      for (const key of keys) {
        const enEl = document.getElementById('ot_en_' + key);
        const tierEl = document.getElementById('ot_tier_' + key);
        if (!enEl || !enEl.checked || !tierEl) continue;
        const unlock = Number(tierEl.value);

        for (let r = 1; r <= totalRounds; r++) {
          const wEl = document.getElementById('ot_tw_' + key + '_' + r);
          if (wEl && (unlock <= r || isNaN(unlock))) {
            roundTotals[r] += Math.max(0, Number(wEl.value) || 0);
          }
        }

        const endlessEl = document.getElementById('ot_tw_' + key + '_endless');
        if (endlessEl) {
          roundTotals['endless'] += Math.max(0, Number(endlessEl.value) || 0);
        }
      }

      // Update percentage badges and locked visual state for each obstacle
      for (const key of keys) {
        const enEl = document.getElementById('ot_en_' + key);
        const tierEl = document.getElementById('ot_tier_' + key);
        const isEnabled = enEl && enEl.checked;
        const unlock = tierEl ? Number(tierEl.value) : 1;

        for (let r = 1; r <= totalRounds; r++) {
          const badgeEl = document.getElementById('badge_' + key + '_' + r);
          const cellEl = document.getElementById('cell_' + key + '_' + r);
          const wEl = document.getElementById('ot_tw_' + key + '_' + r);
          if (!badgeEl || !cellEl) continue;

          const isLocked = unlock > r;
          const w = wEl ? Math.max(0, Number(wEl.value) || 0) : 0;
          const total = roundTotals[r] || 0;

          if (!isEnabled || isLocked || w === 0 || total === 0) {
            badgeEl.textContent = isLocked ? 'Locked' : '0%';
            badgeEl.className = isLocked ? 'text-[9px] text-amber-500/80 mt-1 font-mono' : 'text-[9px] text-gray-600 mt-1 font-mono';
            cellEl.style.opacity = (!isEnabled || isLocked) ? '0.45' : '1';
          } else {
            const pct = Math.round((w / total) * 100);
            badgeEl.textContent = pct + '%';
            badgeEl.className = 'text-[9px] text-cyan-400 font-bold mt-1 font-mono';
            cellEl.style.opacity = '1';
          }
        }

        // Endless column
        const badgeEndless = document.getElementById('badge_' + key + '_endless');
        const cellEndless = document.getElementById('cell_' + key + '_endless');
        const wEndless = document.getElementById('ot_tw_' + key + '_endless');
        if (badgeEndless && cellEndless) {
          const w = wEndless ? Math.max(0, Number(wEndless.value) || 0) : 0;
          const total = roundTotals['endless'] || 0;
          if (!isEnabled || w === 0 || total === 0) {
            badgeEndless.textContent = '0%';
            badgeEndless.className = 'text-[9px] text-gray-600 mt-1 font-mono';
            cellEndless.style.opacity = !isEnabled ? '0.45' : '1';
          } else {
            const pct = Math.round((w / total) * 100);
            badgeEndless.textContent = pct + '%';
            badgeEndless.className = 'text-[9px] text-pink-400 font-bold mt-1 font-mono';
            cellEndless.style.opacity = '1';
          }
        }
      }

      const sec4TotalLbl = document.getElementById('lbl_totalRoundsInSec4');
      if (sec4TotalLbl) sec4TotalLbl.textContent = totalRounds;
    }

    function getDirectionModeBadge(mode, count) {
      switch (mode) {
        case 'random-axis-round':
          return '<span class="text-amber-400 font-bold">🎲 50% V/H (Round)</span>';
        case 'random-axis-wave':
          return '<span class="text-purple-300 font-bold">🌊 Alt V/H (Wave)</span>';
        case 'random-vertical':
          return '<span class="text-rose-400 font-bold">↕ Vertical (N+S)</span>';
        case 'random-horizontal':
          return '<span class="text-cyan-300 font-bold">↔ Horizontal (W+E)</span>';
        case 'random-single':
          return '<span class="text-violet-400 font-bold">🎯 1 of 4 Random</span>';
        case 'all':
          return '<span class="text-emerald-400 font-bold">❖ All 4 Sides</span>';
        case 'custom':
        default:
          return '<span class="text-cyan-400 font-bold">' + count + ' Active</span>';
      }
    }

    function updateRoundDirUI(key) {
      const modeEl = document.getElementById('sel_dir_mode_' + key);
      if (!modeEl) return;
      const mode = modeEl.value;

      const chkN = document.getElementById('chk_dir_' + key + '_north');
      const chkS = document.getElementById('chk_dir_' + key + '_south');
      const chkW = document.getElementById('chk_dir_' + key + '_west');
      const chkE = document.getElementById('chk_dir_' + key + '_east');

      const btnN = document.getElementById('btn_dir_' + key + '_north');
      const btnS = document.getElementById('btn_dir_' + key + '_south');
      const btnW = document.getElementById('btn_dir_' + key + '_west');
      const btnE = document.getElementById('btn_dir_' + key + '_east');

      const badgeEl = document.getElementById('badge_dir_' + key);

      let activeCount = 0;
      if (chkN && chkN.checked) activeCount++;
      if (chkS && chkS.checked) activeCount++;
      if (chkW && chkW.checked) activeCount++;
      if (chkE && chkE.checked) activeCount++;

      if (badgeEl) {
        badgeEl.innerHTML = getDirectionModeBadge(mode, activeCount);
      }

      // North button (#ff2a6d)
      if (btnN && chkN) {
        if (chkN.checked) {
          btnN.className = 'py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center bg-[#ff2a6d]/20 text-[#ff2a6d] border-[#ff2a6d] shadow-[0_0_8px_rgba(255,42,109,0.35)]';
        } else {
          btnN.className = 'py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center bg-[#07080d] text-gray-500 border-gray-800 hover:border-gray-700';
        }
      }

      // South button (#ff7700)
      if (btnS && chkS) {
        if (chkS.checked) {
          btnS.className = 'py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center bg-[#ff7700]/20 text-[#ff7700] border-[#ff7700] shadow-[0_0_8px_rgba(255,119,0,0.35)]';
        } else {
          btnS.className = 'py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center bg-[#07080d] text-gray-500 border-gray-800 hover:border-gray-700';
        }
      }

      // West button (#05d5fa)
      if (btnW && chkW) {
        if (chkW.checked) {
          btnW.className = 'py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center bg-[#05d5fa]/20 text-[#05d5fa] border-[#05d5fa] shadow-[0_0_8px_rgba(5,213,250,0.35)]';
        } else {
          btnW.className = 'py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center bg-[#07080d] text-gray-500 border-gray-800 hover:border-gray-700';
        }
      }

      // East button (#d300c5)
      if (btnE && chkE) {
        if (chkE.checked) {
          btnE.className = 'py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center bg-[#d300c5]/20 text-[#d300c5] border-[#d300c5] shadow-[0_0_8px_rgba(211,0,197,0.35)]';
        } else {
          btnE.className = 'py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center bg-[#07080d] text-gray-500 border-gray-800 hover:border-gray-700';
        }
      }
    }

    function onRoundDirModeChange(key) {
      const modeEl = document.getElementById('sel_dir_mode_' + key);
      if (!modeEl) return;
      const mode = modeEl.value;

      const chkN = document.getElementById('chk_dir_' + key + '_north');
      const chkS = document.getElementById('chk_dir_' + key + '_south');
      const chkW = document.getElementById('chk_dir_' + key + '_west');
      const chkE = document.getElementById('chk_dir_' + key + '_east');

      if (mode === 'random-vertical') {
        if (chkN) chkN.checked = true;
        if (chkS) chkS.checked = true;
        if (chkW) chkW.checked = false;
        if (chkE) chkE.checked = false;
      } else if (mode === 'random-horizontal') {
        if (chkN) chkN.checked = false;
        if (chkS) chkS.checked = false;
        if (chkW) chkW.checked = true;
        if (chkE) chkE.checked = true;
      } else if (mode === 'all' || mode === 'random-axis-round' || mode === 'random-axis-wave' || mode === 'random-single') {
        if (chkN) chkN.checked = true;
        if (chkS) chkS.checked = true;
        if (chkW) chkW.checked = true;
        if (chkE) chkE.checked = true;
      }

      updateRoundDirUI(key);
    }

    function toggleRoundDir(key, dir) {
      const chk = document.getElementById('chk_dir_' + key + '_' + dir);
      if (!chk) return;
      chk.checked = !chk.checked;

      // Automatically switch to 'custom' mode when directly toggling individual direction buttons
      const modeEl = document.getElementById('sel_dir_mode_' + key);
      if (modeEl) {
        modeEl.value = 'custom';
      }

      // Safety check: ensure at least one direction is active
      const chkN = document.getElementById('chk_dir_' + key + '_north');
      const chkS = document.getElementById('chk_dir_' + key + '_south');
      const chkW = document.getElementById('chk_dir_' + key + '_west');
      const chkE = document.getElementById('chk_dir_' + key + '_east');
      if (!chkN?.checked && !chkS?.checked && !chkW?.checked && !chkE?.checked) {
        chk.checked = true; // prevent 0 active directions
      }

      updateRoundDirUI(key);
    }

    function renderRoundDurationInputs(count, durations, defaultSec, tierDirections, endlessDirections) {
      durations = durations || (currentConfig && currentConfig.rounds && currentConfig.rounds.tierDurations) || {};
      defaultSec = defaultSec || (currentConfig && currentConfig.rounds && currentConfig.rounds.defaultRoundDurationSeconds) || 7;
      tierDirections = tierDirections || (currentConfig && currentConfig.rounds && currentConfig.rounds.tierDirections) || {};
      endlessDirections = endlessDirections || (currentConfig && currentConfig.rounds && currentConfig.rounds.endlessDirections) || { mode: 'all', directions: ['north', 'south', 'east', 'west'] };

      const container = document.getElementById('roundDurationsList');
      if (!container) return;

      const roundCards = Array.from({ length: count }, (_, i) => {
        const r = i + 1;
        const val = durations[r] !== undefined ? durations[r] : defaultSec;
        const dirCfg = tierDirections[r] || (
          r === 1 ? { mode: 'custom', directions: ['north'] } :
          r === 2 ? { mode: 'custom', directions: ['north', 'south'] } :
          r === 3 ? { mode: 'custom', directions: ['north', 'south', 'east'] } :
          { mode: 'all', directions: ['north', 'south', 'east', 'west'] }
        );
        const mode = dirCfg.mode || 'custom';
        const dirs = dirCfg.directions || [];
        const hasN = dirs.includes('north') || mode === 'all' || mode === 'random-vertical' || mode === 'random-axis-round' || mode === 'random-axis-wave' || mode === 'random-single';
        const hasS = dirs.includes('south') || mode === 'all' || mode === 'random-vertical' || mode === 'random-axis-round' || mode === 'random-axis-wave' || mode === 'random-single';
        const hasW = dirs.includes('west') || mode === 'all' || mode === 'random-horizontal' || mode === 'random-axis-round' || mode === 'random-axis-wave' || mode === 'random-single';
        const hasE = dirs.includes('east') || mode === 'all' || mode === 'random-horizontal' || mode === 'random-axis-round' || mode === 'random-axis-wave' || mode === 'random-single';

        return \`
          <div class="bg-[#090b12] border border-gray-800 rounded-lg p-2.5 flex flex-col justify-between gap-2">
            <div>
              <div class="flex justify-between items-center mb-1">
                <span class="text-gray-200 font-bold flex items-center gap-1.5">
                  <span class="w-5 h-5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono text-[10px] flex items-center justify-center font-bold">R\${r}</span>
                  <span>Round \${r}</span>
                </span>
                <span id="val_r\${r}" class="text-cyan-300 font-bold font-mono text-xs">\${val}s</span>
              </div>
              <input id="inp_r\${r}" type="range" min="2" max="45" step="1" value="\${val}" oninput="updateLabels()" class="w-full accent-cyan-400 mb-2" />
            </div>

            <div class="pt-2 border-t border-gray-800/80">
              <div class="flex items-center justify-between mb-1">
                <span class="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Wave Direction</span>
                <span id="badge_dir_\${r}" class="text-[9px] font-mono">\${getDirectionModeBadge(mode, dirs.length)}</span>
              </div>
              <select id="sel_dir_mode_\${r}" onchange="onRoundDirModeChange(\${r})" class="w-full bg-[#121520] border border-gray-700/80 rounded px-1.5 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-cyan-400 mb-1.5">
                <option value="custom" \${mode === 'custom' ? 'selected' : ''}>Custom Sides (Pick Below)</option>
                <option value="random-axis-round" \${mode === 'random-axis-round' ? 'selected' : ''}>🎲 Random Vert or Horiz (Round)</option>
                <option value="random-axis-wave" \${mode === 'random-axis-wave' ? 'selected' : ''}>🌊 Random Vert or Horiz (Wave)</option>
                <option value="random-vertical" \${mode === 'random-vertical' ? 'selected' : ''}>↕ Vertical Only (N + S)</option>
                <option value="random-horizontal" \${mode === 'random-horizontal' ? 'selected' : ''}>↔ Horizontal Only (W + E)</option>
                <option value="random-single" \${mode === 'random-single' ? 'selected' : ''}>🎯 Random Single Side (1 of 4)</option>
                <option value="all" \${mode === 'all' ? 'selected' : ''}>❖ All 4 Sides (N, S, W, E)</option>
              </select>

              <!-- Hidden Checkboxes for direction state -->
              <input type="checkbox" id="chk_dir_\${r}_north" \${hasN ? 'checked' : ''} class="hidden" />
              <input type="checkbox" id="chk_dir_\${r}_south" \${hasS ? 'checked' : ''} class="hidden" />
              <input type="checkbox" id="chk_dir_\${r}_west" \${hasW ? 'checked' : ''} class="hidden" />
              <input type="checkbox" id="chk_dir_\${r}_east" \${hasE ? 'checked' : ''} class="hidden" />

              <!-- 4 Direction Buttons -->
              <div class="grid grid-cols-4 gap-1 text-center">
                <button type="button" id="btn_dir_\${r}_north" onclick="toggleRoundDir(\${r}, 'north')" class="py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center">
                  <span>N</span>
                  <span class="text-[7px] opacity-75">Top</span>
                </button>
                <button type="button" id="btn_dir_\${r}_south" onclick="toggleRoundDir(\${r}, 'south')" class="py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center">
                  <span>S</span>
                  <span class="text-[7px] opacity-75">Btm</span>
                </button>
                <button type="button" id="btn_dir_\${r}_west" onclick="toggleRoundDir(\${r}, 'west')" class="py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center">
                  <span>W</span>
                  <span class="text-[7px] opacity-75">Left</span>
                </button>
                <button type="button" id="btn_dir_\${r}_east" onclick="toggleRoundDir(\${r}, 'east')" class="py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center">
                  <span>E</span>
                  <span class="text-[7px] opacity-75">Right</span>
                </button>
              </div>
            </div>
          </div>
        \`;
      }).join('');

      // Endless card
      const endlessMode = endlessDirections.mode || 'all';
      const endlessDirs = endlessDirections.directions || ['north', 'south', 'east', 'west'];
      const eHasN = endlessDirs.includes('north') || endlessMode === 'all';
      const eHasS = endlessDirs.includes('south') || endlessMode === 'all';
      const eHasW = endlessDirs.includes('west') || endlessMode === 'all';
      const eHasE = endlessDirs.includes('east') || endlessMode === 'all';

      const endlessCard = \`
        <div class="bg-[#120a1a] border border-pink-900/50 rounded-lg p-2.5 flex flex-col justify-between gap-2">
          <div>
            <div class="flex justify-between items-center mb-1">
              <span class="text-pink-300 font-bold flex items-center gap-1.5">
                <span class="w-5 h-5 rounded-full bg-pink-950/80 border border-pink-500/40 text-pink-300 font-mono text-[11px] flex items-center justify-center font-bold">∞</span>
                <span>Endless Mode</span>
              </span>
              <span class="text-pink-400 font-bold font-mono text-[11px]">Survive</span>
            </div>
            <div class="text-[10px] text-pink-300/60 leading-tight mb-2">Runs after clearing all \${count} rounds until elimination</div>
          </div>

          <div class="pt-2 border-t border-pink-900/40">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[9px] uppercase font-bold text-pink-400/80 tracking-wider">Wave Direction</span>
              <span id="badge_dir_endless" class="text-[9px] font-mono">\${getDirectionModeBadge(endlessMode, endlessDirs.length)}</span>
            </div>
            <select id="sel_dir_mode_endless" onchange="onRoundDirModeChange('endless')" class="w-full bg-[#1b1026] border border-pink-700/50 rounded px-1.5 py-1 text-[11px] text-pink-200 focus:outline-none focus:border-pink-400 mb-1.5">
              <option value="all" \${endlessMode === 'all' ? 'selected' : ''}>❖ All 4 Sides (N, S, W, E)</option>
              <option value="custom" \${endlessMode === 'custom' ? 'selected' : ''}>Custom Sides (Pick Below)</option>
              <option value="random-axis-round" \${endlessMode === 'random-axis-round' ? 'selected' : ''}>🎲 Random Vert or Horiz (Round)</option>
              <option value="random-axis-wave" \${endlessMode === 'random-axis-wave' ? 'selected' : ''}>🌊 Random Vert or Horiz (Wave)</option>
              <option value="random-vertical" \${endlessMode === 'random-vertical' ? 'selected' : ''}>↕ Vertical Only (N + S)</option>
              <option value="random-horizontal" \${endlessMode === 'random-horizontal' ? 'selected' : ''}>↔ Horizontal Only (W + E)</option>
              <option value="random-single" \${endlessMode === 'random-single' ? 'selected' : ''}>🎯 Random Single Side (1 of 4)</option>
            </select>

            <input type="checkbox" id="chk_dir_endless_north" \${eHasN ? 'checked' : ''} class="hidden" />
            <input type="checkbox" id="chk_dir_endless_south" \${eHasS ? 'checked' : ''} class="hidden" />
            <input type="checkbox" id="chk_dir_endless_west" \${eHasW ? 'checked' : ''} class="hidden" />
            <input type="checkbox" id="chk_dir_endless_east" \${eHasE ? 'checked' : ''} class="hidden" />

            <div class="grid grid-cols-4 gap-1 text-center">
              <button type="button" id="btn_dir_endless_north" onclick="toggleRoundDir('endless', 'north')" class="py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center">
                <span>N</span>
                <span class="text-[7px] opacity-75">Top</span>
              </button>
              <button type="button" id="btn_dir_endless_south" onclick="toggleRoundDir('endless', 'south')" class="py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center">
                <span>S</span>
                <span class="text-[7px] opacity-75">Btm</span>
              </button>
              <button type="button" id="btn_dir_endless_west" onclick="toggleRoundDir('endless', 'west')" class="py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center">
                <span>W</span>
                <span class="text-[7px] opacity-75">Left</span>
              </button>
              <button type="button" id="btn_dir_endless_east" onclick="toggleRoundDir('endless', 'east')" class="py-1 px-1 rounded text-[10px] font-bold border transition flex flex-col items-center justify-center">
                <span>E</span>
                <span class="text-[7px] opacity-75">Right</span>
              </button>
            </div>
          </div>
        </div>
      \`;

      container.innerHTML = roundCards + endlessCard;

      // Update button styles for all rendered rounds + endless
      for (let r = 1; r <= count; r++) {
        updateRoundDirUI(r);
      }
      updateRoundDirUI('endless');
    }

    function onTotalRoundsChange() {
      const inp = document.getElementById('inp_totalRounds');
      const val = Math.max(1, Math.min(10, Math.round(Number(inp.value) || 4)));
      inp.value = val;

      const sec1TotalLbl = document.getElementById('lbl_totalRoundsInSec1');
      if (sec1TotalLbl) sec1TotalLbl.textContent = val;

      const currentDurations = {};
      const currentDirections = {};
      for (let r = 1; r <= 10; r++) {
        const el = document.getElementById('inp_r' + r);
        if (el) currentDurations[r] = Number(el.value);

        const modeEl = document.getElementById('sel_dir_mode_' + r);
        if (modeEl) {
          const dirs = [];
          if (document.getElementById('chk_dir_r' + r + '_north')?.checked) dirs.push('north');
          if (document.getElementById('chk_dir_r' + r + '_south')?.checked) dirs.push('south');
          if (document.getElementById('chk_dir_r' + r + '_west')?.checked) dirs.push('west');
          if (document.getElementById('chk_dir_r' + r + '_east')?.checked) dirs.push('east');
          currentDirections[r] = { mode: modeEl.value, directions: dirs };
        }
      }

      let curEndless = undefined;
      const endlessModeEl = document.getElementById('sel_dir_mode_endless');
      if (endlessModeEl) {
        const dirs = [];
        if (document.getElementById('chk_dir_endless_north')?.checked) dirs.push('north');
        if (document.getElementById('chk_dir_endless_south')?.checked) dirs.push('south');
        if (document.getElementById('chk_dir_endless_west')?.checked) dirs.push('west');
        if (document.getElementById('chk_dir_endless_east')?.checked) dirs.push('east');
        curEndless = { mode: endlessModeEl.value, directions: dirs };
      }

      renderRoundDurationInputs(val, currentDurations, undefined, currentDirections, curEndless);

      // Preserve existing weights before re-rendering Section 4
      if (currentConfig && currentConfig.obstacleTypes) {
        for (const key of Object.keys(currentConfig.obstacleTypes)) {
          const item = currentConfig.obstacleTypes[key];
          if (!item.tierWeights) item.tierWeights = {};
          for (let r = 1; r <= 10; r++) {
            const el = document.getElementById('ot_tw_' + key + '_' + r);
            if (el) item.tierWeights[r] = Number(el.value);
          }
          const endlessEl = document.getElementById('ot_tw_' + key + '_endless');
          if (endlessEl) item.tierWeights.endless = Number(endlessEl.value);
        }
        renderObstacleTypes(currentConfig.obstacleTypes);
      }

      updateLabels();
      updateWeightBadges();
    }

    function updateLabels() {
      const totInp = document.getElementById('inp_totalRounds');
      const totVal = document.getElementById('val_totalRounds');
      if (totInp && totVal) {
        totVal.textContent = totInp.value + (Number(totInp.value) === 1 ? ' Round' : ' Rounds');
      }

      for (let r = 1; r <= 10; r++) {
        const rInp = document.getElementById('inp_r' + r);
        const rVal = document.getElementById('val_r' + r);
        if (rInp && rVal) {
          rVal.textContent = rInp.value + 's';
        }
      }

      document.getElementById('val_gapPos').textContent = Math.round(Number(document.getElementById('inp_gapPos').value) * 100) + '%';
      document.getElementById('val_gapSize').textContent = '±' + Math.round(Number(document.getElementById('inp_gapSize').value) * 100) + '%';
      document.getElementById('val_speedVar').textContent = '±' + Math.round(Number(document.getElementById('inp_speedVar').value) * 100) + '%';
      document.getElementById('val_jitter').textContent = '±' + Math.round(Number(document.getElementById('inp_jitter').value) * 100) + '%';
      document.getElementById('val_stagVar').textContent = '±' + Math.round(Number(document.getElementById('inp_stagVar').value) * 100) + '%';

      const pRad = Number(document.getElementById('inp_playerRadius').value) || 13;
      const forg = Number(document.getElementById('inp_forgiveness').value) || 0;
      const eff = Math.max(2, pRad - forg);
      const pct = Math.round((eff / pRad) * 100);
      const hbEl = document.getElementById('val_hitbox');
      if (hbEl) hbEl.textContent = 'Hitbox: ' + eff.toFixed(1) + 'px (' + pct + '%)';

      const bSpeed = Number(document.getElementById('inp_baseSpeed').value) || 145;
      const vMult = Number(document.getElementById('inp_vertMult').value) || 0.75;
      const hMult = Number(document.getElementById('inp_horizMult').value) || 1.0;
      const vEff = Math.round(bSpeed * vMult);
      const hEff = Math.round(bSpeed * hMult);
      const vEl = document.getElementById('val_vertSpeed');
      if (vEl) vEl.textContent = Math.round(vMult * 100) + '% (' + vEff + ' px/s)';
      const hEl = document.getElementById('val_horizSpeed');
      if (hEl) hEl.textContent = Math.round(hMult * 100) + '% (' + hEff + ' px/s)';
    }

    function syncAllRounds() {
      const v = document.getElementById('inp_r1')?.value || 7;
      const totalRounds = Number(document.getElementById('inp_totalRounds')?.value) || 4;
      for (let r = 1; r <= totalRounds; r++) {
        const el = document.getElementById('inp_r' + r);
        if (el) el.value = v;
      }
      updateLabels();
    }

    function buildPayloadFromForm() {
      const totalRounds = Math.max(1, Math.min(10, Number(document.getElementById('inp_totalRounds')?.value) || 4));
      const obstacleTypes = {};
      if (currentConfig && currentConfig.obstacleTypes) {
        for (const key of Object.keys(currentConfig.obstacleTypes)) {
          const item = currentConfig.obstacleTypes[key];
          const tierWeights = {};
          for (let r = 1; r <= totalRounds; r++) {
            const el = document.getElementById('ot_tw_' + key + '_' + r);
            tierWeights[r] = el ? Math.max(0, Number(el.value) || 0) : (item.tierWeights?.[r] ?? item.weight);
          }
          const endlessEl = document.getElementById('ot_tw_' + key + '_endless');
          const endlessVal = endlessEl ? Math.max(0, Number(endlessEl.value) || 0) : (item.tierWeights?.endless ?? item.tierWeights?.[5] ?? item.weight);
          tierWeights['endless'] = endlessVal;
          tierWeights[5] = tierWeights[5] ?? endlessVal;
          tierWeights[totalRounds + 1] = endlessVal;

          obstacleTypes[key] = {
            ...item,
            enabled: document.getElementById('ot_en_' + key).checked,
            minTier: Number(document.getElementById('ot_tier_' + key).value),
            weight: tierWeights[1] || item.weight,
            tierWeights,
          };
        }
      }

      const tierDurations = {};
      const r1Val = Number(document.getElementById('inp_r1')?.value) || 7;
      for (let r = 1; r <= totalRounds; r++) {
        const el = document.getElementById('inp_r' + r);
        tierDurations[r] = el ? Number(el.value) : r1Val;
      }

      const tierDirections = {};
      for (let r = 1; r <= totalRounds; r++) {
        const modeEl = document.getElementById('sel_dir_mode_' + r);
        const mode = modeEl ? modeEl.value : 'custom';
        const dirs = [];
        if (document.getElementById('chk_dir_' + r + '_north')?.checked) dirs.push('north');
        if (document.getElementById('chk_dir_' + r + '_south')?.checked) dirs.push('south');
        if (document.getElementById('chk_dir_' + r + '_west')?.checked) dirs.push('west');
        if (document.getElementById('chk_dir_' + r + '_east')?.checked) dirs.push('east');
        if (dirs.length === 0) dirs.push('north');
        tierDirections[r] = { mode, directions: dirs };
      }

      const endlessModeEl = document.getElementById('sel_dir_mode_endless');
      const endlessMode = endlessModeEl ? endlessModeEl.value : 'all';
      const endlessDirs = [];
      if (document.getElementById('chk_dir_endless_north')?.checked) endlessDirs.push('north');
      if (document.getElementById('chk_dir_endless_south')?.checked) endlessDirs.push('south');
      if (document.getElementById('chk_dir_endless_west')?.checked) endlessDirs.push('west');
      if (document.getElementById('chk_dir_endless_east')?.checked) endlessDirs.push('east');
      if (endlessDirs.length === 0) endlessDirs.push('north', 'south', 'east', 'west');
      const endlessDirections = { mode: endlessMode, directions: endlessDirs };

      return {
        rounds: {
          totalRoundsBeforeEndless: totalRounds,
          defaultRoundDurationSeconds: r1Val,
          tierDurations,
          tierDirections,
          endlessDirections,
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
          verticalLineSpeedMultiplier: Number(document.getElementById('inp_vertMult').value),
          horizontalLineSpeedMultiplier: Number(document.getElementById('inp_horizMult').value),
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
          headers: { 'Content-Type': 'application/json', 'X-Admin-Token': ADMIN_TOKEN },
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
      const res = await fetch('/api/config/reset', {
        method: 'POST',
        headers: { 'X-Admin-Token': ADMIN_TOKEN },
      });
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
            headers: { 'Content-Type': 'application/json', 'X-Admin-Token': ADMIN_TOKEN },
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
          headers: { 'Content-Type': 'application/json', 'X-Admin-Token': ADMIN_TOKEN },
          body: JSON.stringify({ query })
        });
        const data = await res.json();
        if (res.status === 403 && data.error && data.error.includes('authenticated')) {
          errEl.textContent = 'Session token was refreshed. Reloading page...';
          errEl.classList.remove('hidden');
          setTimeout(() => window.location.reload(), 1200);
          return;
        }
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
  if (!isDirectLocalhost(req) || !hasValidAdminToken(req)) {
    return res.status(403).json({ error: 'Tuning configuration is restricted to authenticated localhost admin access.' });
  }
  applyTuningConfig(req.body);
  saveTuningConfigToDisk();
  res.json(GAME_CONFIG);
});

app.post('/api/config/reset', (req, res) => {
  if (!isDirectLocalhost(req) || !hasValidAdminToken(req)) {
    return res.status(403).json({ error: 'Tuning configuration is restricted to authenticated localhost admin access.' });
  }
  applyTuningConfig(DEFAULT_GAME_CONFIG);
  saveTuningConfigToDisk();
  res.json(GAME_CONFIG);
});

app.get('/campaign-admin', (req, res) => {
  if (!isDirectLocalhost(req)) {
    return res.status(403).send('<h2>403 Forbidden</h2><p>Campaign Admin is only accessible directly from localhost.</p>');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderCampaignAdminPage(ADMIN_SESSION_TOKEN));
});

app.get('/api/campaign-config', (req, res) => {
  res.json(CAMPAIGN_CONFIG);
});

app.post('/api/campaign-config', (req, res) => {
  if (!isDirectLocalhost(req) || !hasValidAdminToken(req)) {
    return res.status(403).json({ error: 'Campaign configuration is restricted to authenticated localhost admin access.' });
  }
  applyCampaignConfig(req.body);
  saveCampaignConfigToDisk();
  res.json(CAMPAIGN_CONFIG);
});

app.post('/api/campaign-config/reset', (req, res) => {
  if (!isDirectLocalhost(req) || !hasValidAdminToken(req)) {
    return res.status(403).json({ error: 'Campaign configuration is restricted to authenticated localhost admin access.' });
  }
  applyCampaignConfig({ levels: JSON.parse(JSON.stringify(DEFAULT_CAMPAIGN_LEVELS)) });
  saveCampaignConfigToDisk();
  res.json(CAMPAIGN_CONFIG);
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
  socket.on('createRoom', ({ playerName, autoStart, gameMode, campaignLevel }: { playerName: string; autoStart?: boolean; gameMode?: GameMode; campaignLevel?: number }) => {
    const prevRoom = roomManager.getRoomBySocketId(socket.id);
    if (prevRoom) {
      socket.leave(prevRoom.roomId);
      roomManager.leaveRoom(socket.id);
    }

    const { roomId, engine } = roomManager.createRoom(socket.id, playerName || 'Player', {
      gameMode: gameMode === 'campaign' ? 'campaign' : 'endless',
      campaignLevel: typeof campaignLevel === 'number' ? campaignLevel : 1,
    });
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, playerId: socket.id, state: engine.state });
    console.log(`[Room] Created ${roomId} (${engine.state.gameMode}${engine.state.gameMode === 'campaign' ? ` L${engine.state.campaignLevel}` : ''}) by ${playerName} (${socket.id})`);

    if (autoStart) {
      engine.startCountdown();
    }
  });

  // Switch & Start specific Campaign Level inside existing room
  socket.on('startCampaignLevel', ({ levelNumber }: { levelNumber: number }) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    if (room.engine.state.gameMode !== 'campaign') return;
    room.engine.setCampaignLevel(Number(levelNumber) || 1);
    room.engine.startCountdown();
  });

  // Advance to next Campaign Level inside existing room
  socket.on('nextCampaignLevel', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    if (room.engine.state.gameMode !== 'campaign') return;
    const nextLvl = (room.engine.state.campaignLevel || 1) + 1;
    if (nextLvl <= (room.engine.state.totalCampaignLevels || CAMPAIGN_CONFIG.levels.length)) {
      room.engine.setCampaignLevel(nextLvl);
      room.engine.startCountdown();
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

  // Frame-exact client-side collision notification (zero visual desync)
  socket.on('playerHit', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;

    room.engine.eliminatePlayer(socket.id);
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
    const initDb = path.join(pgBinDir, 'initdb.exe');
    const pgLogFile = path.resolve(__dirname, '../../postgres.log');

    if (fs.existsSync(pgCtl)) {
      try {
        if (!fs.existsSync(path.join(pgDataDir, 'PG_VERSION'))) {
          console.log('[PostgreSQL] Initializing local PostgreSQL cluster...');
          execFileSync(initDb, ['-D', pgDataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8'], {
            stdio: 'ignore',
            windowsHide: true,
          });
        }
        execFileSync(pgCtl, ['-D', pgDataDir, 'status'], { stdio: 'ignore', windowsHide: true });
        console.log('[PostgreSQL] Local PostgreSQL cluster is running on port 5432');
      } catch {
        console.log('[PostgreSQL] Starting local PostgreSQL cluster on 127.0.0.1:5432...');
        execFileSync(
          pgCtl,
          ['-D', pgDataDir, '-l', pgLogFile, '-o', '-p 5432 -h 127.0.0.1', 'start', '-w'],
          { stdio: 'ignore', windowsHide: true }
        );
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

  server.listen(PORT, BIND_HOST, () => {
    console.log(`🎮 Precision Path dedicated game server running on http://${BIND_HOST}:${PORT}`);
  });
}

bootstrap();
