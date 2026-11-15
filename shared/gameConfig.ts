import type { GameTier, ObstacleDirection } from './types.js';

export type ObstaclePatternType =
  | 'single-gap-wall'
  | 'double-gap-wall'
  | 'sweeping-half-wall'
  | 'staggered-blocks'
  | 'orb-cluster'
  | 'diagonal-spinner';

export type RoundDirectionMode =
  | 'custom'
  | 'random-axis-round'
  | 'random-axis-wave'
  | 'random-vertical'
  | 'random-horizontal'
  | 'random-single'
  | 'all';

export interface RoundDirectionConfig {
  mode: RoundDirectionMode;
  directions: ObstacleDirection[];
}

export interface ObstacleTypeConfig {
  /** Whether this obstacle archetype is active in procedural generation */
  enabled: boolean;
  /** Default relative probability weight */
  weight: number;
  /** Optional per-round weight overrides (1: Round 1, 2: Round 2, ... N: Round N, 'endless': Endless) */
  tierWeights?: Record<string | number, number>;
  /** Minimum round/tier before this obstacle type can be generated (99 = Endless only) */
  minTier: number;
  /** Display label for UI/debug */
  label: string;
}

/**
 * Returns the effective spawn weight for an obstacle pattern in a specific round.
 */
export function getObstacleWeight(config: ObstacleTypeConfig, tier: number, isEndless?: boolean): number {
  if (config.tierWeights) {
    if (isEndless) {
      if (typeof config.tierWeights['endless'] === 'number') {
        return Math.max(0, config.tierWeights['endless']);
      }
      if (typeof config.tierWeights[5] === 'number') {
        return Math.max(0, config.tierWeights[5]);
      }
      return Math.max(0, config.weight);
    }
    if (typeof config.tierWeights[tier] === 'number') {
      return Math.max(0, config.tierWeights[tier]);
    }
  }
  return Math.max(0, config.weight);
}

/**
 * Precision Path - Master Gameplay & Procedural Randomness Configuration
 * Edit this file to tune round durations, obstacle speeds, randomness variance,
 * and allowed procedural obstacle types.
 */
export const GAME_CONFIG = {
  // ==========================================
  // 1. ROUND & TIMING SETTINGS (in seconds)
  // ==========================================
  rounds: {
    /** Total number of timed rounds before entering Endless mode (default: 4, min: 1, max: 10) */
    totalRoundsBeforeEndless: 4,

    /** Default time (seconds) to survive each round before the next round starts */
    defaultRoundDurationSeconds: 7,

    /** Per-round duration overrides (in seconds) */
    tierDurations: {
      1: 7, // Round 1 (1 direction)
      2: 7, // Round 2 (2 directions)
      3: 7, // Round 3 (3 directions)
      4: 7, // Round 4 (4 directions)
    } as Record<number, number>,

    /** Per-round direction configuration overrides */
    tierDirections: {
      1: { mode: 'custom', directions: ['north'] },
      2: { mode: 'custom', directions: ['north', 'south'] },
      3: { mode: 'custom', directions: ['north', 'south', 'east'] },
      4: { mode: 'all', directions: ['north', 'south', 'east', 'west'] },
    } as Record<number, RoundDirectionConfig>,

    /** Direction configuration for Endless Mode */
    endlessDirections: {
      mode: 'all',
      directions: ['north', 'south', 'east', 'west'],
    } as RoundDirectionConfig,

    /** Pre-match countdown timer in seconds (1s READY.. -> GO!) */
    startCountdownDuration: 1,
  },

  // ==========================================
  // 2. PROCEDURAL RANDOMNESS TUNING
  // ==========================================
  randomness: {
    /**
     * Optional PRNG seed.
     * Leave `null` so every match is 100% uniquely random.
     * Set to any integer (e.g. 1337) for deterministic repeatable patterns.
     */
    seed: null as number | null,

    /**
     * How far from the center gaps/openings can randomly spawn (0.0 to 1.0).
     * 0.0 = always dead center, 0.7 = up to 70% of arena radius.
     */
    gapPositionVariance: 0.68,

    /**
     * Random variation applied to gap width on each wave (0.0 to 0.5).
     * e.g. 0.2 means gap width varies randomly by ±20%.
     */
    gapSizeVariance: 0.22,

    /**
     * Random variation applied to obstacle speed per wave (0.0 to 0.5).
     * e.g. 0.15 means obstacle speed varies randomly by ±15%.
     */
    speedVariance: 0.15,

    /**
     * Random jitter applied to the time between waves (0.0 to 0.4).
     * e.g. 0.18 means wave spawn interval varies by ±18%.
     */
    waveIntervalJitter: 0.18,

    /**
     * Random variation applied to stagger delay between multi-directional spawns (0.0 to 0.5).
     */
    staggerVariance: 0.25,

    /**
     * If true, Round 1 (single-direction) randomly selects which cardinal side
     * each wave comes from; if false, Round 1 always comes from North.
     */
    randomizeRound1Direction: true,
  },

  // ==========================================
  // 3. ALLOWED PROCEDURAL OBSTACLE TYPES
  // ==========================================
  obstacleTypes: {
    'single-gap-wall': {
      enabled: true,
      weight: 40,
      tierWeights: { 1: 40, 2: 35, 3: 30, 4: 25, 5: 20 },
      minTier: 1,
      label: 'Single-Gap Gate',
    },
    'double-gap-wall': {
      enabled: true,
      weight: 25,
      tierWeights: { 1: 30, 2: 25, 3: 25, 4: 25, 5: 25 },
      minTier: 1,
      label: 'Twin-Split Gate',
    },
    'sweeping-half-wall': {
      enabled: true,
      weight: 20,
      tierWeights: { 1: 15, 2: 20, 3: 20, 4: 20, 5: 20 },
      minTier: 1,
      label: 'Flank Sweeper Bar',
    },
    'staggered-blocks': {
      enabled: true,
      weight: 20,
      tierWeights: { 1: 15, 2: 20, 3: 25, 4: 25, 5: 25 },
      minTier: 2,
      label: 'Staggered Chicane Blocks',
    },
    'orb-cluster': {
      enabled: true,
      weight: 15,
      tierWeights: { 1: 0, 2: 10, 3: 15, 4: 20, 5: 25 },
      minTier: 3,
      label: 'Pulse Orb Barrage',
    },
    'diagonal-spinner': {
      enabled: true,
      weight: 20,
      tierWeights: { 1: 0, 2: 15, 3: 20, 4: 25, 5: 25 },
      minTier: 2,
      label: 'Diagonal Spinning Blade',
    },
  } as Record<ObstaclePatternType, ObstacleTypeConfig>,

  // ==========================================
  // 4. OBSTACLE PHYSICS & WAVE PACING
  // ==========================================
  obstacles: {
    /** Base obstacle travel speed in pixels/sec (takes ~3.5s to cross the 520px arena) */
    baseSpeed: 145,

    /** Speed multiplier for vertical lines (East/West walls moving across the 450px width) */
    verticalLineSpeedMultiplier: 0.75,

    /** Speed multiplier for horizontal lines (North/South walls moving across the 800px height) */
    horizontalLineSpeedMultiplier: 1.0,

    /** Speed added per round/tier (pixels/sec) */
    speedPerTier: 14,

    /** Maximum extra speed in Endless Mode (Tier 5) */
    endlessMaxBonusSpeed: 120,

    /** Endless mode speed acceleration per second survived in Endless */
    endlessSpeedScaleRate: 2.5,

    /** Base navigable gap width in pixels */
    gapBaseWidth: 96,

    /** Gap width reduction per tier in pixels */
    gapTierDecrement: 4,

    /** Minimum allowable gap width in pixels */
    gapMinWidth: 64,

    /** Center pillar width for 'double-gap-wall' obstacles */
    doubleGapIslandWidth: 56,

    /** Barrier wall thickness in pixels */
    barThickness: 14,

    /** Length multiplier of wall bars relative to arena radius */
    barLengthMultiplier: 2.5,

    /** Distance outside arena radius where obstacles spawn */
    spawnDistanceOffset: 35,

    /** Base stagger delay (ms) between directions in multi-directional rounds */
    staggerMs: 260,

    /** Base wave spawn intervals (seconds) per round/tier */
    waveIntervals: {
      1: 1.6,
      2: 1.9,
      3: 2.2,
      4: 2.5,
      5: 1.8,
    } as Record<GameTier, number>,
  },

  // ==========================================
  // 5. ARENA & PLAYER GEOMETRY
  // ==========================================
  arena: {
    /** Playable phone-screen rectangular width in pixels (9:16 portrait aspect ratio) */
    width: 450,

    /** Playable phone-screen rectangular height in pixels (9:16 portrait aspect ratio) */
    height: 800,

    /** Legacy fallback radius */
    radius: 325,

    /** Player circle radius in pixels */
    playerRadius: 13,

    /** Hitbox forgiveness buffer (pixels) — 6.5px makes the hitbox half the size of the 13px visual sprite */
    hitboxForgiveness: 6.5,
  },

  // ==========================================
  // 6. ENGINE & NETWORK RATES
  // ==========================================
  engine: {
    /** Authoritative server simulation ticks per second (60Hz high-frequency tick) */
    serverTickRate: 60,

    /** Client pointer input throttle in milliseconds (~120Hz) */
    clientInputThrottleMs: 8,
  },
};

/**
 * Returns the configured duration (in seconds) for a given round/tier.
 */
export function getTierDuration(tier: number): number {
  const maxTimed = GAME_CONFIG.rounds.totalRoundsBeforeEndless ?? 4;
  if (tier <= maxTimed) {
    return GAME_CONFIG.rounds.tierDurations[tier] ?? GAME_CONFIG.rounds.defaultRoundDurationSeconds ?? 7;
  }
  return 0; // Endless Mode has no time limit
}

/**
 * Returns the sum of durations of all timed rounds before Endless mode starts.
 */
export function getPreEndlessDuration(): number {
  const count = GAME_CONFIG.rounds.totalRoundsBeforeEndless ?? 4;
  let total = 0;
  for (let r = 1; r <= count; r++) {
    total += getTierDuration(r);
  }
  return total;
}

/**
 * Returns the configured directional wave settings for a given round/tier.
 */
export function getRoundDirectionConfig(tier: number, isEndless?: boolean): RoundDirectionConfig {
  if (isEndless) {
    return GAME_CONFIG.rounds.endlessDirections ?? { mode: 'all', directions: ['north', 'south', 'east', 'west'] };
  }
  if (GAME_CONFIG.rounds.tierDirections && GAME_CONFIG.rounds.tierDirections[tier]) {
    return GAME_CONFIG.rounds.tierDirections[tier];
  }
  if (tier === 1) return { mode: 'custom', directions: ['north'] };
  if (tier === 2) return { mode: 'custom', directions: ['north', 'south'] };
  if (tier === 3) return { mode: 'custom', directions: ['north', 'south', 'east'] };
  return { mode: 'all', directions: ['north', 'south', 'east', 'west'] };
}
