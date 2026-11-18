import {
  EDITOR_DIR_COLORS,
  EDITOR_HALF_H,
  EDITOR_HALF_W,
  EDITOR_PLAYER_RADIUS,
  EDITOR_SPAWN_OFFSET,
  checkDummyHit,
  computeWaveGeometry,
  computeWaveSchedule,
} from '../../shared/levelEditorUtils.js';
import type {
  AiDifficultyTier,
  CampaignLevelConfig,
  CampaignPatternType,
  CampaignWaveGateSpec,
  CampaignWaveSpec,
} from '../../shared/types.js';

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');

const FALLBACK_MODELS = [
  { name: 'qwen3.5:9b', sizeGb: '7.6 GB', available: false },
  { name: 'gemma4:12b', sizeGb: '7.7 GB', available: false },
  { name: 'gpt-oss:20b', sizeGb: '13.0 GB', available: false },
];

const ALLOWED_PATTERNS: CampaignPatternType[] = [
  'single-gap-wall',
  'double-gap-wall',
  'sweeping-half-wall',
  'staggered-blocks',
  'orb-cluster',
  'diagonal-spinner',
];

const ALLOWED_SIDES = ['north', 'south', 'east', 'west'] as const;
type WaveSide = (typeof ALLOWED_SIDES)[number];

interface TierSpec {
  label: string;
  minWaves: number;
  maxWaves: number;
  minSpeed: number;
  maxSpeed: number;
  minGap: number;
  maxGap: number;
  minDelay: number;
  maxDelay: number;
  bonus: number;
  parSec: number;
  promptRules: string;
}

const TIER_SPECS: Record<AiDifficultyTier, TierSpec> = {
  easy: {
    label: 'Easy',
    minWaves: 7,
    maxWaves: 9,
    minSpeed: 145,
    maxSpeed: 175,
    minGap: 84,
    maxGap: 108,
    minDelay: 0.75,
    maxDelay: 1.15,
    bonus: 450,
    parSec: 26,
    promptRules: [
      'Difficulty Tier: EASY (Steady Challenge).',
      'Wave count: 7 to 9 waves.',
      'Speeds: 145 to 175 px/s (vary speeds wave-to-wave).',
      'Gap sizes: 84 to 108 px.',
      'delayAfterPrev: 0.75 to 1.15 seconds (first wave 0.45).',
      'Patterns: use at least 3 to 4 DIFFERENT patternTypes across the level ("single-gap-wall", "double-gap-wall", "orb-cluster", "sweeping-half-wall", "staggered-blocks"). Never use the same patternType more than 2 waves in a row.',
      'Include 1 to 2 clean direction switches (e.g., north -> west -> south).',
    ].join('\n'),
  },
  medium: {
    label: 'Medium',
    minWaves: 10,
    maxWaves: 13,
    minSpeed: 165,
    maxSpeed: 210,
    minGap: 70,
    maxGap: 88,
    minDelay: 0.45,
    maxDelay: 0.85,
    bonus: 700,
    parSec: 34,
    promptRules: [
      'Difficulty Tier: MEDIUM (Tactical Gauntlet).',
      'Wave count: 10 to 13 waves.',
      'Speeds: 165 to 210 px/s (vary speeds dynamically).',
      'Gap sizes: 70 to 88 px.',
      'delayAfterPrev: 0.45 to 0.85 seconds (first wave 0.4).',
      'Patterns: use at least 4 to 5 DIFFERENT patternTypes ("single-gap-wall", "double-gap-wall", "sweeping-half-wall", "staggered-blocks", "orb-cluster", "diagonal-spinner"). Never repeat the same patternType more than 2 waves in a row.',
      'Include 2 to 3 direction changes across north, south, east, west.',
    ].join('\n'),
  },
  hard: {
    label: 'Hard',
    minWaves: 18,
    maxWaves: 24,
    minSpeed: 175,
    maxSpeed: 245,
    minGap: 60,
    maxGap: 72,
    minDelay: 0.34,
    maxDelay: 0.55,
    bonus: 1500,
    parSec: 48,
    promptRules: [
      'Difficulty Tier: HARD (Extreme 4-Axis Labyrinth).',
      'Wave count: 18 to 24 waves.',
      'Speeds: 175 to 245 px/s (fast, relentless obstacle volume).',
      'Gap sizes: 60 to 72 px (tight precision weaving).',
      'delayAfterPrev: 0.34 to 0.52 seconds for intense wave trains, and 0.75 to 1.05 seconds when switching perpendicular directions (first wave 0.35).',
      'Patterns: use ALL 6 patternTypes heavily ("single-gap-wall", "double-gap-wall", "sweeping-half-wall", "staggered-blocks", "orb-cluster", "diagonal-spinner").',
      'Cardinal variation: switch directions frequently (every 2 to 4 waves) across ALL FOUR sides: north, south, east, west!',
    ].join('\n'),
  },
};

export interface AiModelInfo {
  name: string;
  sizeGb: string;
  available: boolean;
}

export async function listAiModels(): Promise<{ models: AiModelInfo[]; ollamaOnline: boolean }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { models?: Array<{ name: string; size?: number }> };
    const list = Array.isArray(data.models) ? data.models : [];
    if (list.length === 0) {
      return { models: FALLBACK_MODELS, ollamaOnline: true };
    }
    return {
      ollamaOnline: true,
      models: list.map((m) => ({
        name: m.name,
        sizeGb: m.size ? `${(m.size / 1e9).toFixed(1)} GB` : '',
        available: true,
      })),
    };
  } catch {
    return { models: FALLBACK_MODELS, ollamaOnline: false };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function getWaveCenterCrossingTime(w: CampaignWaveSpec, spawnAt: number): number {
  const isVert = w.side === 'north' || w.side === 'south';
  const halfBound = isVert ? EDITOR_HALF_H : EDITOR_HALF_W;
  return spawnAt + (halfBound + EDITOR_SPAWN_OFFSET) / Math.max(40, w.speed);
}

/**
 * Simulates a player navigating from spawn through gates 1..N in order.
 * Returns the index of the first wave that failed (or -1 if all gates were cleared cleanly).
 */
function simulatePlayability(
  spawn: { x: number; y: number },
  waves: CampaignWaveSpec[]
): { completable: boolean; failedWaveIdx: number } {
  const sched = computeWaveSchedule(waves);
  const gates: Array<{
    waveIdx: number;
    order: number;
    isVert: boolean;
    targetX: number;
    targetY: number;
    start: number;
    end: number;
    waveId: string;
    spawnAt: number;
    duration: number;
  }> = [];

  sched.items.forEach((it, idx) => {
    const isVert = it.wave.side === 'north' || it.wave.side === 'south';
    for (const g of it.wave.attachedGates || []) {
      const mid = (g.start + g.end) / 2;
      gates.push({
        waveIdx: idx,
        order: g.order,
        isVert,
        targetX: isVert ? mid : 0,
        targetY: isVert ? 0 : mid,
        start: Math.min(g.start, g.end),
        end: Math.max(g.start, g.end),
        waveId: it.wave.id,
        spawnAt: it.spawnAt,
        duration: it.duration,
      });
    }
  });

  gates.sort((a, b) => a.order - b.order);
  if (gates.length === 0) return { completable: false, failedWaveIdx: 0 };

  let px = spawn.x;
  let py = spawn.y;
  let nextGatePtr = 0;
  const dt = 0.02;
  const maxMoveSpeed = 280; // conservative reachable speed (pointer/dash is faster)

  for (let t = 0; t <= sched.totalDuration + 0.2; t += dt) {
    if (nextGatePtr >= gates.length) break;
    const active = gates[nextGatePtr];

    // Find current wave coord for the active gate
    const activeItem = sched.items.find((it) => it.wave.id === active.waveId);
    if (activeItem) {
      const tSince = t - activeItem.spawnAt;
      let goalX = active.targetX;
      let goalY = active.targetY;
      if (tSince >= 0 && tSince <= activeItem.duration) {
        const geom = computeWaveGeometry(activeItem.wave, tSince);
        const travelSign =
          activeItem.wave.side === 'north' || activeItem.wave.side === 'west' ? 1 : -1;
        const nextGate = gates[nextGatePtr + 1];
        const sameWaveNext = nextGate && nextGate.waveId === active.waveId;
        const leadOffset = sameWaveNext ? travelSign * 16 : 0;
        if (active.isVert) {
          goalY = clamp(geom.coord + leadOffset, -EDITOR_HALF_H + 24, EDITOR_HALF_H - 24);
        } else {
          goalX = clamp(geom.coord + leadOffset, -EDITOR_HALF_W + 24, EDITOR_HALF_W - 24);
        }

        // Check gate clear
        const coordVal = active.isVert ? py : px;
        const perpVal = active.isVert ? px : py;
        if (
          Math.abs(coordVal - geom.coord) <= EDITOR_PLAYER_RADIUS + 4 &&
          perpVal >= active.start &&
          perpVal <= active.end
        ) {
          nextGatePtr++;
          continue;
        }
      }

      // Move player toward goal
      const dx = goalX - px;
      const dy = goalY - py;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const step = Math.min(dist, maxMoveSpeed * dt);
        px += (dx / dist) * step;
        py += (dy / dist) * step;
      }

      // If active gate's wave already exited without clearing, fail
      if (t > active.spawnAt + active.duration) {
        return { completable: false, failedWaveIdx: active.waveIdx };
      }
    }

    // Check collision only while active waves are near player
    if (checkDummyHit(waves, t, { x: px, y: py })) {
      return { completable: false, failedWaveIdx: active.waveIdx };
    }
  }

  if (nextGatePtr < gates.length) {
    return { completable: false, failedWaveIdx: gates[nextGatePtr].waveIdx };
  }
  return { completable: true, failedWaveIdx: -1 };
}

/**
 * Validates and repairs an AI-generated level so every wave, gap, and gate is
 * inside the 450x800 arena, ordered chronologically, and physically completable.
 */
export function validateAndRepairAiLevel(
  raw: any,
  difficulty: AiDifficultyTier,
  modelName: string
): CampaignLevelConfig {
  const spec = TIER_SPECS[difficulty];
  const stamp = Date.now();

  const spawnX = clamp(Math.round(Number(raw?.spawn?.x ?? 0)), -150, 150);
  const spawnY = clamp(Math.round(Number(raw?.spawn?.y ?? 180)), -220, 240);
  const rawWaves: any[] = Array.isArray(raw?.waves) ? raw.waves : [];

  // 1. Clamp wave count and individual wave parameters
  const targetCount = clamp(rawWaves.length || spec.minWaves, spec.minWaves, spec.maxWaves);
  const waves: CampaignWaveSpec[] = [];

  for (let i = 0; i < targetCount; i++) {
    const src = rawWaves[i] || {};
    let side: WaveSide = ALLOWED_SIDES.includes(src.side) ? src.side : 'north';
    // On hard tier, enforce frequent cardinal variation (max 3 consecutive same-side waves, rotating all 4 sides)
    if (difficulty === 'hard' && i >= 3) {
      const recentSame =
        waves[i - 1].side === side &&
        waves[i - 2].side === side &&
        waves[i - 3].side === side;
      if (recentSame) {
        const idxInSides = ALLOWED_SIDES.indexOf(side);
        side = ALLOWED_SIDES[(idxInSides + 1 + (i % 3)) % ALLOWED_SIDES.length];
      }
    }
    const isVert = side === 'north' || side === 'south';
    const latHalf = isVert ? EDITOR_HALF_W : EDITOR_HALF_H;

    let patternType: CampaignPatternType = ALLOWED_PATTERNS.includes(src.patternType)
      ? src.patternType
      : ALLOWED_PATTERNS[i % ALLOWED_PATTERNS.length];

    // Enforce obstacle variability: prevent 3+ identical patternTypes in a row
    if (
      i >= 2 &&
      waves[i - 1].patternType === patternType &&
      waves[i - 2].patternType === patternType
    ) {
      const pool = ALLOWED_PATTERNS.filter((p) => p !== patternType);
      patternType = pool[(i + Math.floor(Math.random() * pool.length)) % pool.length];
    }

    const barThickness = clamp(Math.round(Number(src.barThickness ?? 18)), 14, 24);

    const speed = clamp(Math.round(Number(src.speed ?? (spec.minSpeed + spec.maxSpeed) / 2)), spec.minSpeed, spec.maxSpeed);
    const gapSize = clamp(Math.round(Number(src.gapSize ?? (spec.minGap + spec.maxGap) / 2)), Math.max(60, spec.minGap), spec.maxGap);
    const maxLatCenter = Math.max(20, latHalf - gapSize / 2 - 18);
    let gapCenter = clamp(Math.round(Number(src.gapCenter ?? 0)), -maxLatCenter, maxLatCenter);
    // Avoid clustering near center (0): push near-zero or repeated centers outward to force movement
    const prevLat = i > 0 ? waves[i - 1].gapCenter : 0;
    if (Math.abs(gapCenter) < 35 || (i > 0 && Math.abs(gapCenter - prevLat) < 30)) {
      const sign = i % 2 === 0 ? 1 : -1;
      const offsetBand = isVert ? 85 + ((i * 37) % 75) : 130 + ((i * 53) % 140);
      gapCenter = clamp(sign * offsetBand, -maxLatCenter, maxLatCenter);
    }
    let delayAfterPrev =
      i === 0
        ? 0.45
        : clamp(Number(Number(src.delayAfterPrev ?? spec.minDelay).toFixed(2)), spec.minDelay, spec.maxDelay + 0.6);

    // 2. Enforce direction-change overlap & lateral reachability relative to previous wave
    if (i > 0) {
      const prev = waves[i - 1];
      const prevIsVert = prev.side === 'north' || prev.side === 'south';

      // Compute cumulative spawnAt up to prev
      let prevSpawnAt = 0;
      for (let k = 0; k < i; k++) prevSpawnAt += waves[k].delayAfterPrev;
      const prevCross = getWaveCenterCrossingTime(prev, prevSpawnAt);

      const candidate: CampaignWaveSpec = {
        id: `ai-w-${stamp}-${i + 1}`,
        order: i + 1,
        delayAfterPrev,
        side,
        patternType,
        speed,
        gapCenter,
        gapSize,
        barThickness,
        color: EDITOR_DIR_COLORS[side],
        attachedGates: [],
      };

      // If direction changes, enforce >= 0.70s between center crossings
      if (prev.side !== side) {
        const minDeltaCross = 0.72;
        const currCross = getWaveCenterCrossingTime(candidate, prevSpawnAt + delayAfterPrev);
        if (currCross - prevCross < minDeltaCross) {
          delayAfterPrev = Number((delayAfterPrev + (minDeltaCross - (currCross - prevCross))).toFixed(2));
          candidate.delayAfterPrev = delayAfterPrev;
        }
      }

      // If same axis, clamp lateral jump so player can physically weave between consecutive gates
      if (isVert === prevIsVert) {
        const currCross = getWaveCenterCrossingTime(candidate, prevSpawnAt + delayAfterPrev);
        const dtCross = Math.max(0.35, currCross - prevCross);
        const maxJump = Math.round(dtCross * 210);
        if (Math.abs(gapCenter - prev.gapCenter) > maxJump) {
          const sign = gapCenter >= prev.gapCenter ? 1 : -1;
          gapCenter = clamp(prev.gapCenter + sign * maxJump, -maxLatCenter, maxLatCenter);
          candidate.gapCenter = gapCenter;
        }
      }

      waves.push(candidate);
    } else {
      waves.push({
        id: `ai-w-${stamp}-1`,
        order: 1,
        delayAfterPrev,
        side,
        patternType,
        speed,
        gapCenter,
        gapSize,
        barThickness,
        color: EDITOR_DIR_COLORS[side],
        attachedGates: [],
      });
    }
  }

  // Ensure every level uses at least 3 distinct obstacle patternTypes
  const distinctPatterns = new Set(waves.map((w) => w.patternType));
  if (distinctPatterns.size < 3 && waves.length >= 4) {
    const missing = ALLOWED_PATTERNS.filter((p) => !distinctPatterns.has(p));
    let mIdx = 0;
    for (let i = 1; i < waves.length && distinctPatterns.size < 3 && mIdx < missing.length; i += 2) {
      waves[i].patternType = missing[mIdx++];
      distinctPatterns.add(waves[i].patternType);
    }
  }

  // On hard tier, guarantee all 4 cardinal directions appear
  if (difficulty === 'hard' && waves.length >= 12) {
    const usedSides = new Set(waves.map((w) => w.side));
    const missingSides = ALLOWED_SIDES.filter((s) => !usedSides.has(s));
    let msIdx = 0;
    for (let i = 3; i < waves.length && msIdx < missingSides.length; i += 3) {
      const newSide = missingSides[msIdx++];
      waves[i].side = newSide;
      waves[i].color = EDITOR_DIR_COLORS[newSide];
      const isVert = newSide === 'north' || newSide === 'south';
      const latHalf = isVert ? EDITOR_HALF_W : EDITOR_HALF_H;
      const maxLat = Math.max(20, latHalf - waves[i].gapSize / 2 - 18);
      waves[i].gapCenter = clamp(waves[i].gapCenter, -maxLat, maxLat);
      if (waves[i - 1].side !== newSide && waves[i].delayAfterPrev < 0.72) {
        waves[i].delayAfterPrev = 0.75;
      }
    }
  }

  // Ensure multi-gate obstacles (double-gap-wall / staggered-blocks) appear in medium and hard tiers
  const minMultiGateWaves = difficulty === 'hard' ? 5 : difficulty === 'medium' ? 2 : 0;
  if (minMultiGateWaves > 0) {
    let multiCount = waves.filter(
      (w) => w.patternType === 'double-gap-wall' || w.patternType === 'staggered-blocks'
    ).length;
    for (let i = 2; i < waves.length && multiCount < minMultiGateWaves; i += 3) {
      if (waves[i].patternType !== 'double-gap-wall' && waves[i].patternType !== 'staggered-blocks') {
        waves[i].patternType = multiCount % 2 === 0 ? 'double-gap-wall' : 'staggered-blocks';
        if (waves[i + 1] && waves[i + 1].delayAfterPrev < 0.9) {
          waves[i + 1].delayAfterPrev = 0.9;
        }
        multiCount++;
      }
    }
  }

  // 3. Assign chronological sequential gates (1..N) onto verified gaps framed by wave obstacles
  const assignGates = (ws: CampaignWaveSpec[]) => {
    let gateOrder = 1;
    // Never leave the final wave as a gate-less diagonal-spinner
    if (ws.length > 0 && ws[ws.length - 1].patternType === 'diagonal-spinner') {
      ws[ws.length - 1].patternType = 'single-gap-wall';
    }
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      // diagonal-spinner drifts laterally and has no wall framing a gate; keep it as a pure dodge hazard
      if (w.patternType === 'diagonal-spinner') {
        w.attachedGates = [];
        continue;
      }
      const geom = computeWaveGeometry(w, 0);
      const validGaps = geom.gaps.filter((g) => Math.abs(g.end - g.start) >= 52);
      const hasObstacles = geom.rects.length >= 1 || geom.circles.length >= 2;
      if (validGaps.length === 0 || !hasObstacles) {
        // Fallback to single-gap-wall if pattern produced no framed gap
        w.patternType = 'single-gap-wall';
        const fallbackGeom = computeWaveGeometry(w, 0);
        const g = fallbackGeom.gaps[0] || { start: -40, end: 40 };
        w.attachedGates = [
          {
            id: `ai-g-${stamp}-${gateOrder}`,
            order: gateOrder,
            start: g.start,
            end: g.end,
            points: 100,
            label: `GATE ${gateOrder}`,
          },
        ];
        gateOrder++;
      } else {
        // Pick the gap closest to gapCenter
        const best = validGaps.reduce((a, b) => {
          const midA = (a.start + a.end) / 2;
          const midB = (b.start + b.end) / 2;
          return Math.abs(midA - w.gapCenter) <= Math.abs(midB - w.gapCenter) ? a : b;
        });
        w.attachedGates = [
          {
            id: `ai-g-${stamp}-${gateOrder}`,
            order: gateOrder,
            start: best.start,
            end: best.end,
            points: 100,
            label: `GATE ${gateOrder}`,
          },
        ];
        gateOrder++;

        // On medium/hard tiers, attach multiple gates on double-gap-wall / staggered-blocks waves
        const nextW = ws[i + 1];
        const hasRoomAfter = !nextW || nextW.delayAfterPrev >= 0.85;
        if (
          (difficulty === 'medium' || difficulty === 'hard') &&
          (w.patternType === 'double-gap-wall' || w.patternType === 'staggered-blocks') &&
          validGaps.length >= 2 &&
          hasRoomAfter
        ) {
          const second = validGaps.find((g) => g !== best);
          if (second) {
            w.attachedGates.push({
              id: `ai-g-${stamp}-${gateOrder}`,
              order: gateOrder,
              start: second.start,
              end: second.end,
              points: 100,
              label: `GATE ${gateOrder}`,
            });
            gateOrder++;
          }
          if (
            difficulty === 'hard' &&
            w.patternType === 'staggered-blocks' &&
            validGaps.length >= 3 &&
            (!nextW || nextW.delayAfterPrev >= 1.15)
          ) {
            const third = validGaps.find((g) => g !== best && g !== second);
            if (third) {
              w.attachedGates.push({
                id: `ai-g-${stamp}-${gateOrder}`,
                order: gateOrder,
                start: third.start,
                end: third.end,
                points: 100,
                label: `GATE ${gateOrder}`,
              });
              gateOrder++;
            }
          }
        }
      }
    }
    // Label final gate FINISH
    const lastWaveWithGate = [...ws].reverse().find((w) => w.attachedGates.length > 0);
    if (lastWaveWithGate) {
      const lastGate = lastWaveWithGate.attachedGates[lastWaveWithGate.attachedGates.length - 1];
      lastGate.label = 'FINISH';
    }
  };

  assignGates(waves);

  // 4. Automated Playability Simulation & Auto-Repair (up to 4 passes)
  for (let pass = 0; pass < 4; pass++) {
    const sim = simulatePlayability({ x: spawnX, y: spawnY }, waves);
    if (sim.completable) break;
    const idx = clamp(sim.failedWaveIdx, 0, waves.length - 1);
    waves[idx].delayAfterPrev = Number((waves[idx].delayAfterPrev + 0.35).toFixed(2));
    waves[idx].gapSize = Math.min(130, waves[idx].gapSize + 10);
    const isVert = waves[idx].side === 'north' || waves[idx].side === 'south';
    const latHalf = isVert ? EDITOR_HALF_W : EDITOR_HALF_H;
    const maxLat = Math.max(20, latHalf - waves[idx].gapSize / 2 - 18);
    waves[idx].gapCenter = clamp(waves[idx].gapCenter, -maxLat, maxLat);
    if (waves[idx].patternType === 'diagonal-spinner') {
      waves[idx].patternType = 'single-gap-wall';
    }
    assignGates(waves);
  }

  const rawName = String(raw?.name || '').trim().slice(0, 40);
  const levelName = rawName || `AI ${spec.label} Trial`;

  return {
    id: `ai-${stamp}-${Math.floor(Math.random() * 10000)}`,
    levelNumber: 1,
    name: levelName,
    storyName: `AI • ${spec.label} (${modelName})`,
    description: '',
    spawn: { x: spawnX, y: spawnY },
    clearBonusPoints: spec.bonus,
    parTimeSeconds: spec.parSec,
    waves,
    obstacles: [],
    checkpoints: [],
  };
}

interface QueuedAiJob {
  id: string;
  start: () => void;
  cancel: () => void;
}

const aiJobQueue: QueuedAiJob[] = [];
let activeAiJobId: string | null = null;

export function getAiQueueStatus(requestId?: string): {
  status: 'running' | 'queued' | 'idle';
  position: number;
  queueLength: number;
} {
  const queueLength = aiJobQueue.length + (activeAiJobId ? 1 : 0);
  if (requestId && activeAiJobId === requestId) {
    return { status: 'running', position: 0, queueLength };
  }
  if (requestId) {
    const idx = aiJobQueue.findIndex((j) => j.id === requestId);
    if (idx >= 0) {
      return { status: 'queued', position: idx + 1, queueLength };
    }
  }
  return { status: activeAiJobId ? 'running' : 'idle', position: 0, queueLength };
}

function pumpAiQueue() {
  if (activeAiJobId !== null || aiJobQueue.length === 0) return;
  const next = aiJobQueue.shift()!;
  activeAiJobId = next.id;
  next.start();
}

export function generateAiLevelQueued(
  requestId: string,
  difficulty: AiDifficultyTier,
  model: string,
  externalSignal?: AbortSignal
): Promise<CampaignLevelConfig> {
  if (externalSignal?.aborted) {
    return Promise.reject(new Error('Generation cancelled.'));
  }

  return new Promise((resolve, reject) => {
    let finished = false;
    let started = false;

    const cleanupSignal = () => {
      if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      if (finished) return;
      if (!started) {
        const idx = aiJobQueue.findIndex((j) => j.id === requestId);
        if (idx >= 0) aiJobQueue.splice(idx, 1);
        finished = true;
        cleanupSignal();
        reject(new Error('Generation cancelled.'));
      }
    };

    if (externalSignal) {
      externalSignal.addEventListener('abort', onAbort, { once: true });
    }

    aiJobQueue.push({
      id: requestId,
      cancel: onAbort,
      start: () => {
        if (finished) return;
        started = true;
        generateAiLevel(difficulty, model, externalSignal)
          .then((lvl) => {
            if (!finished) {
              finished = true;
              cleanupSignal();
              resolve(lvl);
            }
          })
          .catch((err) => {
            if (!finished) {
              finished = true;
              cleanupSignal();
              reject(err);
            }
          })
          .finally(() => {
            if (activeAiJobId === requestId) {
              activeAiJobId = null;
            }
            pumpAiQueue();
          });
      },
    });

    pumpAiQueue();
  });
}

export async function generateAiLevel(
  difficulty: AiDifficultyTier,
  model: string,
  externalSignal?: AbortSignal
): Promise<CampaignLevelConfig> {
  const spec = TIER_SPECS[difficulty];
  const creativeSeed = Math.floor(Math.random() * 100000);
  const themes = ['Corridor', 'Labyrinth', 'Crossfire', 'Pulse', 'Thread', 'Vortex', 'Relay', 'Vault'];
  const themeHint = themes[creativeSeed % themes.length];

  const systemPrompt = [
    'You are a level designer for Precision Path, a 2D top-down dodging & gate-clearing arcade game.',
    `Arena dimensions: width 450 (x from -225 to +225), height 800 (y from -400 to +400). Center is (0, 0).`,
    'Waves spawn just outside one of the 4 sides: "north" (moves +y), "south" (moves -y), "west" (moves +x), "east" (moves -x).',
    'Allowed patternType values: "single-gap-wall", "double-gap-wall", "sweeping-half-wall", "staggered-blocks", "orb-cluster", "diagonal-spinner".',
    'Return ONLY a single valid JSON object with this exact structure:',
    '{"name":"Short Creative Title","spawn":{"x":0,"y":180},"waves":[{"delayAfterPrev":0.5,"side":"north","patternType":"single-gap-wall","speed":150,"gapCenter":0,"gapSize":80}]}',
    'Do not include markdown fences or any explanation outside the JSON.',
  ].join('\n');

  const userPrompt = [
    `Create a brand-new, creative Precision Path level (seed #${creativeSeed}, theme inspiration: ${themeHint}).`,
    spec.promptRules,
    'Spread gapCenter widely across the full arena (-155 to +155 for north/south, -280 to +280 for east/west) so gates are NOT all in the center — force the player to move around!',
    'Make the path fun, rhythmic, and clearly completable without impossible lateral jumps.',
  ].join('\n\n');

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), 120000);
  let parsed: any = null;
  const isGptOss = model.toLowerCase().startsWith('gpt-oss');

  try {
    const payload: Record<string, any> = {
      model,
      stream: false,
      think: isGptOss ? 'low' : false,
      options: {
        temperature: 0.9,
        num_predict: isGptOss ? 4096 : 2048,
      },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };
    if (isGptOss) {
      payload.format = 'json';
    }

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(`Ollama returned HTTP ${res.status}${errTxt ? `: ${errTxt.slice(0, 140)}` : ''}`);
    }

    const data = (await res.json()) as { message?: { content?: string; thinking?: string } };
    let content = String(data?.message?.content || '').trim();
    if (!content && data?.message?.thinking) {
      content = String(data.message.thinking).trim();
    }
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    content = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      content = content.slice(jsonStart, jsonEnd + 1);
    }
    content = content.replace(/,\s*([}\]])/g, '$1');
    parsed = JSON.parse(content);
  } catch (err: any) {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    if (externalSignal?.aborted) {
      throw new Error('Generation cancelled.');
    }
    throw new Error(err?.name === 'AbortError' ? 'AI generation timed out (120s). Try a faster model.' : err?.message || 'AI generation failed.');
  }

  return validateAndRepairAiLevel(parsed, difficulty, model);
}
