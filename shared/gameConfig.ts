import type { GameTier } from './types.js';

export type ObstaclePatternType =
  | 'single-gap-wall'
  | 'double-gap-wall'
  | 'sweeping-half-wall'
  | 'staggered-blocks'
  | 'orb-cluster';

export interface ObstacleTypeConfig {
  /** Whether this obstacle archetype is active in procedural generation */
  enabled: boolean;
  /** Relative probability weight (higher = spawns more frequently) */
  weight: number;
  /** Minimum round/tier (1-5) before this obstacle type can be generated */
  minTier: GameTier;
  /** Display label for UI/debug */
  label: string;
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
    /** Default time (seconds) to survive each round before the next round starts */
    defaultRoundDurationSeconds: 7,

    /** Per-round duration overrides (in seconds): Round 1 -> Round 2 -> Round 3 -> Round 4 -> Endless */
    tierDurations: {
      1: 7, // Round 1 (1 direction) -> Round 2 starts after 7s
      2: 7, // Round 2 (2 directions) -> Round 3 starts after 7s
      3: 7, // Round 3 (3 directions) -> Round 4 starts after 7s
      4: 7, // Round 4 (4 directions) -> Endless Mode starts after 7s
    } as Record<1 | 2 | 3 | 4, number>,

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
      minTier: 1,
      label: 'Single-Gap Gate',
    },
    'double-gap-wall': {
      enabled: true,
      weight: 25,
      minTier: 1,
      label: 'Twin-Split Gate',
    },
    'sweeping-half-wall': {
      enabled: true,
      weight: 20,
      minTier: 1,
      label: 'Flank Sweeper Bar',
    },
    'staggered-blocks': {
      enabled: true,
      weight: 20,
      minTier: 2,
      label: 'Staggered Chicane Blocks',
    },
    'orb-cluster': {
      enabled: true,
      weight: 15,
      minTier: 3,
      label: 'Pulse Orb Barrage',
    },
  } as Record<ObstaclePatternType, ObstacleTypeConfig>,

  // ==========================================
  // 4. OBSTACLE PHYSICS & WAVE PACING
  // ==========================================
  obstacles: {
    /** Base obstacle travel speed in pixels/sec (takes ~3.5s to cross the 520px arena) */
    baseSpeed: 145,

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

    /** Hitbox forgiveness buffer (pixels) */
    hitboxForgiveness: 1.5,
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
export function getTierDuration(tier: GameTier): number {
  if (tier === 1 || tier === 2 || tier === 3 || tier === 4) {
    return GAME_CONFIG.rounds.tierDurations[tier] ?? GAME_CONFIG.rounds.defaultRoundDurationSeconds;
  }
  return 0; // Tier 5 (Endless Mode) has no time limit
}
