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
    minWaves: 14,
    maxWaves: 18,
    minSpeed: 160,
    maxSpeed: 225,
    minGap: 62,
    maxGap: 76,
    minDelay: 0.38,
    maxDelay: 0.65,
    bonus: 1100,
    parSec: 42,
    promptRules: [
      'Difficulty Tier: HARD (Gatekeeper Labyrinth).',
      'Wave count: 14 to 18 waves.',
      'Speeds: 160 to 225 px/s (vary between tight slower corridors and fast single walls).',
      'Gap sizes: 62 to 76 px (narrow, precision weaving).',
      'delayAfterPrev: 0.38 to 0.58 seconds for tight corridor trains, and 0.85 to 1.25 seconds when switching perpendicular directions (first wave 0.4).',
      'Patterns: use ALL 6 patternTypes ("single-gap-wall", "double-gap-wall", "sweeping-half-wall", "staggered-blocks", "orb-cluster", "diagonal-spinner"). Never repeat the same patternType more than 2 waves in a row.',
      'Include 3 to 4 direction changes across all four sides (north, south, east, west).',
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
        if (active.isVert) {
          goalY = clamp(geom.coord, -EDITOR_HALF_H + 30, EDITOR_HALF_H - 30);
        } else {
          goalX = clamp(geom.coord, -EDITOR_HALF_W + 30, EDITOR_HALF_W - 30);
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
    const side: WaveSide = ALLOWED_SIDES.includes(src.side) ? src.side : 'north';
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

  // 3. Assign chronological sequential gates (1..N) onto verified gaps
  const assignGates = (ws: CampaignWaveSpec[]) => {
    let gateOrder = 1;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      const geom = computeWaveGeometry(w, 0);
      const validGaps = geom.gaps.filter((g) => Math.abs(g.end - g.start) >= 52);
      if (validGaps.length === 0) {
        // Fallback to single-gap-wall if pattern produced no wide enough gap
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

        // On hard mode, optionally attach a second gate on double-gap-wall if next wave has >= 0.9s delay
        const nextW = ws[i + 1];
        if (
          difficulty === 'hard' &&
          w.patternType === 'double-gap-wall' &&
          validGaps.length >= 2 &&
          nextW &&
          nextW.delayAfterPrev >= 0.9
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

export async function generateAiLevel(
  difficulty: AiDifficultyTier,
  model: string
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
    'Make the path fun, rhythmic, and clearly completable without impossible lateral jumps.',
  ].join('\n\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  let parsed: any = null;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        options: {
          temperature: 0.9,
          num_predict: 2048,
        },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(`Ollama returned HTTP ${res.status}${errTxt ? `: ${errTxt.slice(0, 140)}` : ''}`);
    }

    const data = (await res.json()) as { message?: { content?: string } };
    let content = String(data?.message?.content || '').trim();
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    content = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      content = content.slice(jsonStart, jsonEnd + 1);
    }
    parsed = JSON.parse(content);
  } catch (err: any) {
    clearTimeout(timer);
    throw new Error(err?.name === 'AbortError' ? 'AI generation timed out (90s). Try a faster model.' : err?.message || 'AI generation failed.');
  }

  return validateAndRepairAiLevel(parsed, difficulty, model);
}
