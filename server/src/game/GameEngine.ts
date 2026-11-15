import { GameState, GameTier, Player, Obstacle, ObstacleDirection, ClientInput } from '../../../shared/types.js';
import {
  GAME_CONFIG,
  getTierDuration,
  getObstacleWeight,
  ObstaclePatternType,
} from '../../../shared/gameConfig.js';

export class GameEngine {
  public state: GameState;
  private intervalId: NodeJS.Timeout | null = null;
  private countdownIntervalId: NodeJS.Timeout | null = null;
  private scheduledSpawns: Array<{ triggerAtElapsed: number; execute: () => void }> = [];
  private gateWaves: Array<{
    id: string;
    direction: ObstacleDirection;
    isVertical: boolean;
    travelSign: number; // +1 for north/west, -1 for south/east
    coord: number;
    speed: number;
    tier: GameTier;
    gates: Array<{
      start: number;
      end: number;
      scoredPlayers: Set<string>;
    }>;
    lastPlayerRel: Map<string, number>;
  }> = [];
  private tickRate = GAME_CONFIG.engine.serverTickRate;
  private lastTickTime = 0;
  private obstacleSpawnTimer = 0;
  private nextWaveInterval = GAME_CONFIG.obstacles.waveIntervals[1];
  private rngState: number | null = null;
  private matchDirections: ObstacleDirection[] = ['north', 'east', 'south', 'west'];

  private onGameOverCallback?: (state: GameState) => void;
  private onTierUpCallback?: (tier: GameTier) => void;
  private onStateUpdateCallback?: (state: GameState) => void;
  private onPlayerEliminatedCallback?: (player: Player, tier: GameTier) => void;

  // Arena configuration from central config (phone-screen 9:16 portrait rectangle)
  public readonly ARENA_WIDTH = GAME_CONFIG.arena.width;
  public readonly ARENA_HEIGHT = GAME_CONFIG.arena.height;
  public readonly ARENA_RADIUS = GAME_CONFIG.arena.radius;
  public readonly PLAYER_RADIUS = GAME_CONFIG.arena.playerRadius;

  constructor(roomId: string) {
    this.initRng();
    this.state = {
      roomId,
      status: 'lobby',
      countdownTimer: GAME_CONFIG.rounds.startCountdownDuration,
      currentTier: 1,
      activeDirections: ['north'],
      tierTimeRemaining: getTierDuration(1),
      elapsedTime: 0,
      arenaRadius: this.ARENA_RADIUS,
      arenaWidth: this.ARENA_WIDTH,
      arenaHeight: this.ARENA_HEIGHT,
      players: {},
      obstacles: [],
      winner: null,
    };
  }

  /**
   * Returns the exact active sides for the current level:
   * - Level 1: 1 side
   * - Level 2: 2 sides
   * - Level 3: 3 sides
   * - Level 4 & Endless (5): all 4 sides
   */
  private getActiveSidesForTier(tier: GameTier): ObstacleDirection[] {
    const count = tier >= 4 ? 4 : tier;
    return this.matchDirections.slice(0, count);
  }

  /**
   * Initializes the procedural random number generator (seeded or true random).
   */
  private initRng() {
    if (GAME_CONFIG.randomness.seed !== null) {
      this.rngState = GAME_CONFIG.randomness.seed;
    } else {
      this.rngState = null;
    }
  }

  /**
   * Returns a uniform random float in [0, 1), using Mulberry32 if a seed is configured in GAME_CONFIG.
   */
  private random(): number {
    if (this.rngState !== null) {
      let t = (this.rngState += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return Math.random();
  }

  /**
   * Returns a random float in [min, max).
   */
  private randomRange(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  /**
   * Shuffles an array in place using Fisher-Yates and the procedural RNG.
   */
  private shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  public setCallbacks(callbacks: {
    onGameOver?: (state: GameState) => void;
    onTierUp?: (tier: GameTier) => void;
    onStateUpdate?: (state: GameState) => void;
    onPlayerEliminated?: (player: Player, tier: GameTier) => void;
  }) {
    this.onGameOverCallback = callbacks.onGameOver;
    this.onTierUpCallback = callbacks.onTierUp;
    this.onStateUpdateCallback = callbacks.onStateUpdate;
    this.onPlayerEliminatedCallback = callbacks.onPlayerEliminated;
  }

  public addPlayer(id: string, name: string, isHost = false): Player {
    const playerColors = [
      '#00f0ff', // Neon Cyan
      '#ff0055', // Neon Pink
      '#00ff66', // Neon Green
      '#ffaa00', // Neon Orange
      '#bd00ff', // Neon Purple
      '#ffff00', // Neon Yellow
    ];
    const existingPlayers = Object.values(this.state.players);
    const colorIndex = existingPlayers.length % playerColors.length;
    const shouldBeHost = isHost || existingPlayers.length === 0;
    const isMatchActive = this.state.status === 'playing' || this.state.status === 'countdown';

    const player: Player = {
      id,
      name: name.trim().slice(0, 14) || 'Pilot',
      color: playerColors[colorIndex],
      x: 0,
      y: 0,
      radius: GAME_CONFIG.arena.playerRadius,
      hitboxRadius: Math.max(2, GAME_CONFIG.arena.playerRadius - GAME_CONFIG.arena.hitboxForgiveness),
      alive: !isMatchActive,
      score: 0,
      survivedTime: 0,
      isHost: shouldBeHost,
    };

    this.state.players[id] = player;
    return player;
  }

  public removePlayer(id: string) {
    const removed = this.state.players[id];
    if (removed && (this.state.status === 'playing' || this.state.status === 'paused') && removed.survivedTime > 0) {
      if (this.onPlayerEliminatedCallback) {
        this.onPlayerEliminatedCallback(removed, this.state.currentTier);
      }
    }
    delete this.state.players[id];

    const remaining = Object.values(this.state.players);
    if (removed?.isHost && remaining.length > 0 && !remaining.some((p) => p.isHost)) {
      remaining[0].isHost = true;
    }

    if (this.state.status === 'playing') {
      this.checkPlayerStatus();
    }
  }

  public handleInput(playerId: string, input: ClientInput) {
    if (this.state.status !== 'playing' && this.state.status !== 'countdown') return;
    const player = this.state.players[playerId];
    if (!player || !player.alive) return;
    if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) return;

    const maxX = this.ARENA_WIDTH / 2 - player.radius;
    const maxY = this.ARENA_HEIGHT / 2 - player.radius;

    const oldX = player.x;
    const oldY = player.y;
    const newX = Math.max(-maxX, Math.min(maxX, input.x));
    const newY = Math.max(-maxY, Math.min(maxY, input.y));

    const jumpDist = Math.hypot(newX - oldX, newY - oldY);
    const didTeleport = Boolean(input.isTeleport) || jumpDist > 52;

    player.x = newX;
    player.y = newY;

    if (this.state.status === 'playing') {
      // Check immediate collision at new position before evaluating gate crossings
      for (const obs of this.state.obstacles) {
        if (this.isColliding(player, obs)) {
          player.alive = false;
          if (this.onPlayerEliminatedCallback) {
            this.onPlayerEliminatedCallback(player, this.state.currentTier);
          }
          this.checkPlayerStatus();
          return;
        }
      }

      for (const wave of this.gateWaves) {
        const oldCoord = wave.isVertical ? oldY : oldX;
        const newCoord = wave.isVertical ? newY : newX;
        const prevRel =
          wave.lastPlayerRel.get(playerId) ?? (oldCoord - wave.coord) * wave.travelSign;
        const currRel = (newCoord - wave.coord) * wave.travelSign;

        if (didTeleport) {
          // Teleporting across or right onto a wave plane awards 0 points; sync relative side
          if (Math.abs(currRel) < 28) {
            wave.lastPlayerRel.set(playerId, prevRel > 0 ? -1 : 1);
          } else {
            wave.lastPlayerRel.set(playerId, currRel);
          }
        } else {
          const crossedForward = prevRel > 0 && currRel <= 0;
          const crossedBackward = prevRel < 0 && currRel >= 0;

          if (crossedForward || crossedBackward) {
            const denom = Math.abs(prevRel - currRel);
            const t = denom > 0.0001 ? Math.abs(prevRel) / denom : 0.5;
            const oldLat = wave.isVertical ? oldX : oldY;
            const newLat = wave.isVertical ? newX : newY;
            const crossLat = oldLat + (newLat - oldLat) * t;

            this.scoreGateOpeningAt(wave, player, crossLat);
            wave.lastPlayerRel.set(playerId, currRel === 0 ? (prevRel > 0 ? -0.01 : 0.01) : currRel);
          } else {
            wave.lastPlayerRel.set(playerId, currRel);
          }
        }
      }
    }
  }

  public togglePause(playerId: string) {
    const player = this.state.players[playerId];
    if (!player) return;

    if (this.state.status === 'playing') {
      this.state.status = 'paused';
      this.state.pausedBy = player.name;
      if (this.onStateUpdateCallback) this.onStateUpdateCallback(this.state);
    } else if (this.state.status === 'paused') {
      this.state.status = 'playing';
      this.state.pausedBy = null;
      this.lastTickTime = performance.now();
      if (this.onStateUpdateCallback) this.onStateUpdateCallback(this.state);
    }
  }

  public eliminatePlayer(playerId: string) {
    if (this.state.status !== 'playing') return;
    const player = this.state.players[playerId];
    if (!player || !player.alive) return;
    player.alive = false;
    if (this.onPlayerEliminatedCallback) {
      this.onPlayerEliminatedCallback(player, this.state.currentTier);
    }
    this.checkPlayerStatus();
    if (this.onStateUpdateCallback) {
      this.onStateUpdateCallback(this.state);
    }
  }

  public returnToWaitingRoom() {
    this.stop();
    this.resetGame();
    this.state.status = 'lobby';
    for (const id in this.state.players) {
      const p = this.state.players[id];
      p.alive = true;
      p.x = 0;
      p.y = 0;
    }
    if (this.onStateUpdateCallback) {
      this.onStateUpdateCallback(this.state);
    }
  }

  public startCountdown() {
    this.stop();
    this.resetGame();
    this.state.status = 'countdown';
    this.state.countdownTimer = 1;

    for (const id in this.state.players) {
      const p = this.state.players[id];
      p.alive = true;
      p.x = 0;
      p.y = 0;
      p.radius = GAME_CONFIG.arena.playerRadius;
      p.hitboxRadius = Math.max(2, GAME_CONFIG.arena.playerRadius - GAME_CONFIG.arena.hitboxForgiveness);
      p.score = 0;
      p.gatesCleared = 0;
      p.survivedTime = 0;
    }

    if (this.onStateUpdateCallback) {
      this.onStateUpdateCallback(this.state);
    }

    // Hold countdown for the full 2.05s duration of the trimmed "Ready... Go!" video so walls only start after it ends
    this.countdownIntervalId = setTimeout(() => {
      this.countdownIntervalId = null;
      this.state.countdownTimer = 0;
      this.startGame();
      if (this.onStateUpdateCallback) {
        this.onStateUpdateCallback(this.state);
      }
    }, 2050);
  }

  public startGame() {
    this.initRng();
    const allDirs: ObstacleDirection[] = ['north', 'east', 'south', 'west'];
    this.matchDirections = GAME_CONFIG.randomness.randomizeRound1Direction
      ? this.shuffle(allDirs)
      : allDirs;

    this.state.status = 'playing';
    this.state.elapsedTime = 0;
    this.state.currentTier = 1;
    this.state.activeDirections = this.getActiveSidesForTier(1);
    this.state.tierTimeRemaining = getTierDuration(1);
    this.nextWaveInterval = this.computeNextWaveInterval(1);
    // Spawn the very first wave promptly when the round begins
    this.obstacleSpawnTimer = this.nextWaveInterval * 0.85;

    for (const id in this.state.players) {
      const p = this.state.players[id];
      p.alive = true;
      p.score = 0;
      p.gatesCleared = 0;
      p.survivedTime = 0;
    }

    if (this.intervalId) clearInterval(this.intervalId);
    this.lastTickTime = performance.now();
    this.intervalId = setInterval(() => this.tick(), 1000 / this.tickRate);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.countdownIntervalId) {
      clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }
    this.scheduledSpawns = [];
  }

  private resetGame() {
    this.state.obstacles = [];
    this.state.winner = null;
    this.state.pausedBy = null;
    this.state.currentTier = 1;
    this.state.activeDirections = this.getActiveSidesForTier(1);
    this.state.tierTimeRemaining = getTierDuration(1);
    this.state.elapsedTime = 0;
    this.scheduledSpawns = [];
    this.gateWaves = [];
  }

  private tick() {
    if (this.state.status !== 'playing') return;

    const now = performance.now();
    const dt =
      this.lastTickTime > 0
        ? Math.min(0.05, Math.max(0.001, (now - this.lastTickTime) / 1000))
        : 1 / this.tickRate;
    this.lastTickTime = now;
    this.state.elapsedTime += dt;

    // Process any staggered directional spawns scheduled on the game clock
    if (this.scheduledSpawns.length > 0) {
      const due = this.scheduledSpawns.filter((s) => this.state.elapsedTime >= s.triggerAtElapsed);
      this.scheduledSpawns = this.scheduledSpawns.filter((s) => this.state.elapsedTime < s.triggerAtElapsed);
      for (const item of due) {
        item.execute();
      }
    }

    for (const id in this.state.players) {
      const p = this.state.players[id];
      p.radius = GAME_CONFIG.arena.playerRadius;
      p.hitboxRadius = Math.max(2, GAME_CONFIG.arena.playerRadius - GAME_CONFIG.arena.hitboxForgiveness);
      if (p.alive) {
        p.survivedTime += dt;
      }
    }

    this.updateTiers(dt);
    this.spawnObstacles(dt);
    this.updateObstacles(dt);
    this.checkCollisions();
    this.updateGateWaves(dt);

    if (this.onStateUpdateCallback) {
      this.onStateUpdateCallback(this.state);
    }
  }

  private updateTiers(dt: number) {
    if (this.state.currentTier < 5) {
      this.state.tierTimeRemaining -= dt;
      if (this.state.tierTimeRemaining <= 0) {
        this.state.currentTier = (this.state.currentTier + 1) as GameTier;
        this.state.activeDirections = this.getActiveSidesForTier(this.state.currentTier);
        this.state.tierTimeRemaining = getTierDuration(this.state.currentTier);

        // Award +500 points to every alive player for reaching the next stage
        for (const id in this.state.players) {
          const p = this.state.players[id];
          if (p.alive) {
            p.score += 500;
          }
        }

        if (this.onTierUpCallback) {
          this.onTierUpCallback(this.state.currentTier);
        }
      }
    } else {
      this.state.tierTimeRemaining = 0;
    }
  }

  private computeNextWaveInterval(tier: GameTier): number {
    const base = GAME_CONFIG.obstacles.waveIntervals[tier] ?? 2.0;
    const preEndlessDuration =
      getTierDuration(1) + getTierDuration(2) + getTierDuration(3) + getTierDuration(4);
    const endlessReduction =
      tier === 5
        ? Math.min(0.6, Math.max(0, this.state.elapsedTime - preEndlessDuration) * 0.012)
        : 0;
    const jitter = GAME_CONFIG.randomness.waveIntervalJitter;
    const randomFactor = 1 + this.randomRange(-jitter, jitter);
    return Math.max(0.95, (base - endlessReduction) * randomFactor);
  }

  private spawnObstacles(dt: number) {
    this.obstacleSpawnTimer += dt;

    if (this.obstacleSpawnTimer >= this.nextWaveInterval) {
      this.obstacleSpawnTimer = 0;
      this.nextWaveInterval = this.computeNextWaveInterval(this.state.currentTier);
      this.generateProceduralWave(this.state.currentTier);
    }
  }

  /**
   * Selects an obstacle pattern archetype using per-round configured weights and minimum tier rules.
   */
  private pickProceduralObstacleType(tier: GameTier): ObstaclePatternType {
    const entries = Object.entries(GAME_CONFIG.obstacleTypes) as [
      ObstaclePatternType,
      (typeof GAME_CONFIG.obstacleTypes)[ObstaclePatternType]
    ][];

    const eligible = entries
      .map(([type, cfg]) => ({
        type,
        cfg,
        weight: getObstacleWeight(cfg, tier),
      }))
      .filter(({ cfg, weight }) => cfg.enabled && weight > 0 && tier >= cfg.minTier);

    if (eligible.length === 0) {
      return 'single-gap-wall';
    }

    const totalWeight = eligible.reduce((sum, item) => sum + item.weight, 0);
    let roll = this.random() * totalWeight;

    for (const item of eligible) {
      roll -= item.weight;
      if (roll <= 0) {
        return item.type;
      }
    }

    return eligible[eligible.length - 1].type;
  }

  /**
   * Uses the active sides for the current level:
   * - Level 1: 1 side
   * - Level 2: 2 sides
   * - Level 3: 3 sides
   * - Level 4 & Endless (Tier 5): all 4 sides
   * and spawns randomized procedural obstacle patterns from those sides.
   */
  private generateProceduralWave(tier: GameTier) {
    const activeSides = this.getActiveSidesForTier(tier);
    const directions: ObstacleDirection[] = this.shuffle(activeSides);

    const preEndlessDuration =
      getTierDuration(1) + getTierDuration(2) + getTierDuration(3) + getTierDuration(4);
    const endlessBonus =
      tier === 5
        ? Math.min(
            GAME_CONFIG.obstacles.endlessMaxBonusSpeed,
            Math.max(0, this.state.elapsedTime - preEndlessDuration) *
              GAME_CONFIG.obstacles.endlessSpeedScaleRate
          )
        : 0;

    const rawSpeed =
      GAME_CONFIG.obstacles.baseSpeed +
      tier * GAME_CONFIG.obstacles.speedPerTier +
      endlessBonus;

    // Pick a navigable focal zone inside the rectangular arena so multi-directional waves always leave a survivable corridor
    const safeFactor = Math.min(0.8, GAME_CONFIG.randomness.gapPositionVariance * 0.85);
    const maxSafeOffsetX = (this.ARENA_WIDTH / 2) * safeFactor;
    const maxSafeOffsetY = (this.ARENA_HEIGHT / 2) * safeFactor;
    const safeX = this.randomRange(-maxSafeOffsetX, maxSafeOffsetX);
    const safeY = this.randomRange(-maxSafeOffsetY, maxSafeOffsetY);

    let accumulatedDelayMs = 0;
    directions.forEach((dir, idx) => {
      const speedVar = GAME_CONFIG.randomness.speedVariance;
      // Vertical lines spawn from East/West and cross the 450px width; horizontal lines spawn from North/South and cross the 800px height
      const isVerticalLine = dir === 'west' || dir === 'east';
      const lineMultiplier = isVerticalLine
        ? GAME_CONFIG.obstacles.verticalLineSpeedMultiplier ?? 0.75
        : GAME_CONFIG.obstacles.horizontalLineSpeedMultiplier ?? 1.0;
      const dirSpeed = rawSpeed * lineMultiplier * (1 + this.randomRange(-speedVar, speedVar));
      const patternType = this.pickProceduralObstacleType(tier);

      if (idx === 0) {
        this.spawnPatternFromDirection(dir, patternType, dirSpeed, tier, safeX, safeY);
      } else {
        const staggerVar = GAME_CONFIG.randomness.staggerVariance;
        const stepDelay =
          GAME_CONFIG.obstacles.staggerMs * (1 + this.randomRange(-staggerVar, staggerVar));
        accumulatedDelayMs += Math.max(90, stepDelay);

        const triggerAtElapsed = this.state.elapsedTime + accumulatedDelayMs / 1000;
        this.scheduledSpawns.push({
          triggerAtElapsed,
          execute: () => this.spawnPatternFromDirection(dir, patternType, dirSpeed, tier, safeX, safeY),
        });
      }
    });
  }

  /**
   * Checks if there is sufficient clearance near the spawn edge for a given direction,
   * and returns a safe speed that will never overtake any existing obstacle ahead of it
   * moving in the same direction.
   */
  private getSafeSameSideSpeed(direction: ObstacleDirection, desiredSpeed: number): number | null {
    const isVerticalTravel = direction === 'north' || direction === 'south';
    const halfBound = isVerticalTravel ? this.ARENA_HEIGHT / 2 : this.ARENA_WIDTH / 2;
    const spawnCoord = halfBound + GAME_CONFIG.obstacles.spawnDistanceOffset;
    const minSameSideSeparation = 180; // Minimum pixel distance between waves from the same side

    let maxAllowedSpeed = desiredSpeed;

    for (const obs of this.state.obstacles) {
      if (obs.direction !== direction) continue;

      let distFromSpawn = Infinity;
      if (direction === 'north') {
        distFromSpawn = obs.y - (-spawnCoord);
      } else if (direction === 'south') {
        distFromSpawn = spawnCoord - obs.y;
      } else if (direction === 'west') {
        distFromSpawn = obs.x - (-spawnCoord);
      } else if (direction === 'east') {
        distFromSpawn = spawnCoord - obs.x;
      }

      // Do not spawn if a previous wave from this same side is still too close to the spawn line
      if (distFromSpawn < minSameSideSeparation) {
        return null;
      }

      // Never allow a trailing wave from the same side to travel faster than a wave ahead of it
      if (obs.speed < maxAllowedSpeed) {
        maxAllowedSpeed = obs.speed;
      }
    }

    return maxAllowedSpeed;
  }

  /**
   * Spawns a specific procedural obstacle archetype from a cardinal direction.
   * Guarantees at least one wide navigable opening and zero overlapping segments.
   */
  private spawnPatternFromDirection(
    direction: ObstacleDirection,
    patternType: ObstaclePatternType,
    speed: number,
    tier: GameTier,
    safeX: number,
    safeY: number
  ) {
    const safeSpeed = this.getSafeSameSideSpeed(direction, speed);
    if (safeSpeed === null) {
      return; // Skip if previous wave from the same side hasn't cleared the spawn zone
    }

    const baseGap = Math.max(
      GAME_CONFIG.obstacles.gapMinWidth,
      GAME_CONFIG.obstacles.gapBaseWidth - tier * GAME_CONFIG.obstacles.gapTierDecrement
    );
    const gapVar = GAME_CONFIG.randomness.gapSizeVariance;
    const gapSize = Math.max(
      88, // Always at least 88px wide (>3.3x player diameter) so there is an unmistakable opening
      baseGap * (1 + this.randomRange(-gapVar, gapVar))
    );

    const isVerticalTravel = direction === 'north' || direction === 'south';
    const lateralHalfSpan = isVerticalTravel ? this.ARENA_WIDTH / 2 : this.ARENA_HEIGHT / 2;
    const edgeMargin = 32; // Keep gaps strictly inside the arena walls
    const maxGapCenter = Math.max(
      20,
      Math.min(
        lateralHalfSpan * GAME_CONFIG.randomness.gapPositionVariance,
        lateralHalfSpan - gapSize / 2 - edgeMargin
      )
    );

    const targetSafeLateral = isVerticalTravel ? safeX : safeY;
    const jitter = this.randomRange(-30, 30);
    const gapCenter = Math.max(-maxGapCenter, Math.min(maxGapCenter, targetSafeLateral + jitter));

    const barThickness = GAME_CONFIG.obstacles.barThickness;

    const dirColors: Record<string, string> = {
      north: '#ff2a6d', // Neon Crimson
      south: '#ff7700', // Neon Amber
      east: '#d300c5',  // Neon Magenta
      west: '#05d5fa',  // Electric Blue
    };
    const color = dirColors[direction] || '#ff2a6d';

    switch (patternType) {
      case 'single-gap-wall': {
        this.addSegmentedWallWithGaps(
          direction,
          lateralHalfSpan,
          [{ start: gapCenter - gapSize / 2, end: gapCenter + gapSize / 2 }],
          barThickness,
          safeSpeed,
          tier,
          color
        );
        break;
      }

      case 'double-gap-wall': {
        const islandWidth = Math.max(48, GAME_CONFIG.obstacles.doubleGapIslandWidth);
        const sideGap = Math.max(84, gapSize * 0.95);
        // Place one gap at gapCenter, and the second gap on the side with more room
        const placeSecondOnRight = gapCenter <= 0;
        const secondGapCenter = placeSecondOnRight
          ? gapCenter + sideGap + islandWidth
          : gapCenter - (sideGap + islandWidth);

        const gaps = [
          { start: gapCenter - sideGap / 2, end: gapCenter + sideGap / 2 },
          { start: secondGapCenter - sideGap / 2, end: secondGapCenter + sideGap / 2 },
        ];
        this.addSegmentedWallWithGaps(
          direction,
          lateralHalfSpan,
          gaps,
          barThickness,
          safeSpeed,
          tier,
          color
        );
        break;
      }

      case 'sweeping-half-wall': {
        // Leaves one entire side from gapCenter outward completely open (never a solid line)
        const openPositiveSide = gapCenter >= 0;
        const openStart = openPositiveSide ? gapCenter - gapSize / 2 : -lateralHalfSpan;
        const openEnd = openPositiveSide ? lateralHalfSpan : gapCenter + gapSize / 2;
        this.addSegmentedWallWithGaps(
          direction,
          lateralHalfSpan,
          [{ start: openStart, end: openEnd }],
          barThickness + 2,
          safeSpeed,
          tier,
          color
        );
        break;
      }

      case 'staggered-blocks': {
        // Three wide openings (left, safe center, right) with 2 non-overlapping solid blocks between them
        const centerGap = Math.max(92, gapSize);
        const outerMarginGap = 54;
        this.addSegmentedWallWithGaps(
          direction,
          lateralHalfSpan,
          [
            { start: -lateralHalfSpan, end: -lateralHalfSpan + outerMarginGap },
            { start: gapCenter - centerGap / 2, end: gapCenter + centerGap / 2 },
            { start: lateralHalfSpan - outerMarginGap, end: lateralHalfSpan },
          ],
          barThickness + 2,
          safeSpeed,
          tier,
          color
        );
        break;
      }

      case 'orb-cluster': {
        // Non-overlapping pulse orbs on a single wave plane with a guaranteed clear gap around gapCenter
        const orbRadius = 12;
        const orbCount = isVerticalTravel ? 4 : 5;
        const usableHalf = lateralHalfSpan - 28;
        const spawnedOrbs: number[] = [];
        for (let i = 0; i < orbCount; i++) {
          const orbLat = -usableHalf + (i / (orbCount - 1)) * (usableHalf * 2);
          // Skip any orb that falls inside the guaranteed safe opening
          if (Math.abs(orbLat - gapCenter) < gapSize * 0.6 + orbRadius) {
            continue;
          }
          spawnedOrbs.push(orbLat);
          this.addLocalCircleObstacle(
            direction,
            orbLat,
            0,
            orbRadius,
            safeSpeed,
            0,
            '#ffea00'
          );
        }

        // Compute the open intervals between orbs so each opening can be scored independently
        const orbGaps: Array<{ start: number; end: number }> = [];
        let cursor = -lateralHalfSpan;
        for (const lat of spawnedOrbs.sort((a, b) => a - b)) {
          const gapEnd = lat - orbRadius;
          if (gapEnd - cursor >= 24) {
            orbGaps.push({ start: cursor, end: gapEnd });
          }
          cursor = lat + orbRadius;
        }
        if (lateralHalfSpan - cursor >= 24) {
          orbGaps.push({ start: cursor, end: lateralHalfSpan });
        }
        this.registerGateWave(direction, safeSpeed, tier, orbGaps);
        break;
      }

      case 'diagonal-spinner': {
        const spinnerLength = 152;
        const spinnerThickness = 16;
        const rotSpeed = this.randomRange(1.8, 2.5) * (this.random() > 0.5 ? 1 : -1);
        const initialRotation = this.randomRange(0, Math.PI * 2);
        // Vibrant Neon Purple/Violet color for diagonal spinning blades
        const spinnerColor = '#b800ff';

        // Diagonal drift across the lateral axis giving the obstacle its diagonal trajectory
        const driftSign = this.random() > 0.5 ? 1 : -1;
        const lateralDrift = safeSpeed * this.randomRange(0.45, 0.7) * driftSign;

        this.addLocalSpinningObstacle(
          direction,
          gapCenter,
          0,
          spinnerLength,
          spinnerThickness,
          safeSpeed,
          lateralDrift,
          initialRotation,
          rotSpeed,
          spinnerColor
        );

        // Score gate openings on both sides of the spinning blade
        const bladeRadius = spinnerLength / 2 + 12;
        const gaps = [
          { start: -lateralHalfSpan, end: gapCenter - bladeRadius },
          { start: gapCenter + bladeRadius, end: lateralHalfSpan },
        ].filter((g) => g.end - g.start >= 24);

        if (gaps.length > 0) {
          this.registerGateWave(direction, safeSpeed, tier, gaps);
        }
        break;
      }
    }
  }

  /**
   * Registers a gate wave with all of its individual navigable openings so passing through
   * multiple openings on the same line (e.g. going through Gate 1 and back through Gate 2)
   * awards +100 points for each opening.
   */
  private registerGateWave(
    direction: ObstacleDirection,
    speed: number,
    tier: GameTier,
    gaps: Array<{ start: number; end: number }>
  ) {
    const isVerticalTravel = direction === 'north' || direction === 'south';
    const halfBound = isVerticalTravel ? this.ARENA_HEIGHT / 2 : this.ARENA_WIDTH / 2;
    const spawnDist = halfBound + GAME_CONFIG.obstacles.spawnDistanceOffset;
    const travelSign = direction === 'north' || direction === 'west' ? 1 : -1;
    const startCoord = -travelSign * spawnDist;

    const lastPlayerRel = new Map<string, number>();
    for (const id in this.state.players) {
      const p = this.state.players[id];
      const pCoord = isVerticalTravel ? p.y : p.x;
      lastPlayerRel.set(id, (pCoord - startCoord) * travelSign);
    }

    this.gateWaves.push({
      id: crypto.randomUUID(),
      direction,
      isVertical: isVerticalTravel,
      travelSign,
      coord: startCoord,
      speed,
      tier,
      gates: gaps.map((g) => ({
        start: g.start,
        end: g.end,
        scoredPlayers: new Set<string>(),
      })),
      lastPlayerRel,
    });
  }

  /**
   * Slices the playable span [-lateralHalfSpan, +lateralHalfSpan] by removing all gap intervals,
   * and spawns non-overlapping rectangular segments for the remaining solid parts.
   * Guarantees there is NEVER a solid wall across the arena and NEVER any overlapping segments.
   */
  private addSegmentedWallWithGaps(
    direction: ObstacleDirection,
    lateralHalfSpan: number,
    rawGaps: Array<{ start: number; end: number }>,
    thickness: number,
    speed: number,
    tier: GameTier,
    color: string
  ) {
    // Normalize and clamp gaps to [-lateralHalfSpan, +lateralHalfSpan]
    const clampedGaps = rawGaps
      .map((g) => ({
        start: Math.max(-lateralHalfSpan, Math.min(lateralHalfSpan, Math.min(g.start, g.end))),
        end: Math.max(-lateralHalfSpan, Math.min(lateralHalfSpan, Math.max(g.start, g.end))),
      }))
      .filter((g) => g.end - g.start >= 20)
      .sort((a, b) => a.start - b.start);

    // Fallback safety: if no valid gap was provided, carve a 100px center opening
    if (clampedGaps.length === 0) {
      clampedGaps.push({ start: -50, end: 50 });
    }

    // Merge overlapping gaps so solid segments never overlap
    const mergedGaps: Array<{ start: number; end: number }> = [];
    for (const g of clampedGaps) {
      if (mergedGaps.length === 0 || g.start > mergedGaps[mergedGaps.length - 1].end) {
        mergedGaps.push({ ...g });
      } else {
        mergedGaps[mergedGaps.length - 1].end = Math.max(
          mergedGaps[mergedGaps.length - 1].end,
          g.end
        );
      }
    }

    // Build complement solid segments in [-lateralHalfSpan, +lateralHalfSpan]
    let cursor = -lateralHalfSpan;
    const minSolidWidth = 18;

    for (const gap of mergedGaps) {
      const segLength = gap.start - cursor;
      if (segLength >= minSolidWidth) {
        const segCenter = cursor + segLength / 2;
        this.addLocalRectObstacle(direction, segCenter, 0, segLength, thickness, speed, 0, color);
      }
      cursor = Math.max(cursor, gap.end);
    }

    const tailLength = lateralHalfSpan - cursor;
    if (tailLength >= minSolidWidth) {
      const segCenter = cursor + tailLength / 2;
      this.addLocalRectObstacle(direction, segCenter, 0, tailLength, thickness, speed, 0, color);
    }

    // Register all merged gap openings for independent per-gate scoring
    this.registerGateWave(direction, speed, tier, mergedGaps);
  }

  /**
   * Maps a rectangle defined in the wave's local (lateral, depthOffset) coordinate space
   * into arena (x, y, vx, vy, width, height) coordinates for any cardinal direction.
   */
  private addLocalRectObstacle(
    direction: ObstacleDirection,
    lateral: number,
    depthOffset: number,
    span: number,
    thickness: number,
    speed: number,
    lateralDrift: number,
    color: string
  ) {
    const isVerticalTravel = direction === 'north' || direction === 'south';
    const halfBound = isVerticalTravel ? this.ARENA_HEIGHT / 2 : this.ARENA_WIDTH / 2;
    const spawnDist =
      halfBound + GAME_CONFIG.obstacles.spawnDistanceOffset + depthOffset;

    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;
    let width = span;
    let height = thickness;

    switch (direction) {
      case 'north':
        x = lateral;
        y = -spawnDist;
        vx = lateralDrift;
        vy = speed;
        width = span;
        height = thickness;
        break;
      case 'south':
        x = lateral;
        y = spawnDist;
        vx = lateralDrift;
        vy = -speed;
        width = span;
        height = thickness;
        break;
      case 'west':
        x = -spawnDist;
        y = lateral;
        vx = speed;
        vy = lateralDrift;
        width = thickness;
        height = span;
        break;
      case 'east':
        x = spawnDist;
        y = lateral;
        vx = -speed;
        vy = lateralDrift;
        width = thickness;
        height = span;
        break;
    }

    this.state.obstacles.push({
      id: crypto.randomUUID(),
      type: 'rectangle',
      x,
      y,
      spawnX: x,
      spawnY: y,
      spawnTime: this.state.elapsedTime,
      vx,
      vy,
      width,
      height,
      rotation: 0,
      color,
      direction,
      speed,
    });
  }

  /**
   * Maps a circular orb defined in the wave's local (lateral, depthOffset) coordinate space
   * into arena (x, y, vx, vy) coordinates for any cardinal direction.
   */
  private addLocalCircleObstacle(
    direction: ObstacleDirection,
    lateral: number,
    depthOffset: number,
    radius: number,
    speed: number,
    lateralDrift: number,
    color: string
  ) {
    const isVerticalTravel = direction === 'north' || direction === 'south';
    const halfBound = isVerticalTravel ? this.ARENA_HEIGHT / 2 : this.ARENA_WIDTH / 2;
    const spawnDist =
      halfBound + GAME_CONFIG.obstacles.spawnDistanceOffset + depthOffset;

    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;

    switch (direction) {
      case 'north':
        x = lateral;
        y = -spawnDist;
        vx = lateralDrift;
        vy = speed;
        break;
      case 'south':
        x = lateral;
        y = spawnDist;
        vx = lateralDrift;
        vy = -speed;
        break;
      case 'west':
        x = -spawnDist;
        y = lateral;
        vx = speed;
        vy = lateralDrift;
        break;
      case 'east':
        x = spawnDist;
        y = lateral;
        vx = -speed;
        vy = lateralDrift;
        break;
    }

    this.state.obstacles.push({
      id: crypto.randomUUID(),
      type: 'circle',
      x,
      y,
      spawnX: x,
      spawnY: y,
      spawnTime: this.state.elapsedTime,
      vx,
      vy,
      width: radius * 2,
      height: radius * 2,
      radius,
      rotation: 0,
      color,
      direction,
      speed,
    });
  }

  /**
   * Maps a spinning bar defined in the wave's local coordinate space with lateral drift
   * and rotational velocity into arena coordinates.
   */
  private addLocalSpinningObstacle(
    direction: ObstacleDirection,
    lateral: number,
    depthOffset: number,
    length: number,
    thickness: number,
    speed: number,
    lateralDrift: number,
    initialRotation: number,
    rotationSpeed: number,
    color: string
  ) {
    const isVerticalTravel = direction === 'north' || direction === 'south';
    const halfBound = isVerticalTravel ? this.ARENA_HEIGHT / 2 : this.ARENA_WIDTH / 2;
    const spawnDist = halfBound + GAME_CONFIG.obstacles.spawnDistanceOffset + depthOffset;

    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;

    switch (direction) {
      case 'north':
        x = lateral;
        y = -spawnDist;
        vx = lateralDrift;
        vy = speed;
        break;
      case 'south':
        x = lateral;
        y = spawnDist;
        vx = lateralDrift;
        vy = -speed;
        break;
      case 'west':
        x = -spawnDist;
        y = lateral;
        vx = speed;
        vy = lateralDrift;
        break;
      case 'east':
        x = spawnDist;
        y = lateral;
        vx = -speed;
        vy = lateralDrift;
        break;
    }

    this.state.obstacles.push({
      id: crypto.randomUUID(),
      type: 'rectangle',
      x,
      y,
      spawnX: x,
      spawnY: y,
      spawnTime: this.state.elapsedTime,
      spawnRotation: initialRotation,
      vx,
      vy,
      width: length,
      height: thickness,
      rotation: initialRotation,
      rotationSpeed,
      color,
      direction,
      speed: Math.hypot(vx, vy),
    });
  }

  private updateObstacles(dt: number) {
    const despawnLimitX = this.ARENA_WIDTH / 2 + 90;
    const despawnLimitY = this.ARENA_HEIGHT / 2 + 90;
    const remaining: Obstacle[] = [];

    for (const obs of this.state.obstacles) {
      if (obs.spawnX !== undefined && obs.spawnY !== undefined && obs.spawnTime !== undefined) {
        const age = Math.max(0, this.state.elapsedTime - obs.spawnTime);
        obs.x = obs.spawnX + obs.vx * age;
        obs.y = obs.spawnY + obs.vy * age;
        if (obs.rotationSpeed) {
          const spawnRot = obs.spawnRotation !== undefined ? obs.spawnRotation : 0;
          obs.rotation = spawnRot + obs.rotationSpeed * age;
        }
      } else {
        obs.x += obs.vx * dt;
        obs.y += obs.vy * dt;
        if (obs.rotationSpeed) {
          obs.rotation += obs.rotationSpeed * dt;
        }
      }

      let outOfBounds = false;
      if (obs.direction === 'north' && (obs.y > despawnLimitY || Math.abs(obs.x) > despawnLimitX + 80)) outOfBounds = true;
      else if (obs.direction === 'south' && (obs.y < -despawnLimitY || Math.abs(obs.x) > despawnLimitX + 80)) outOfBounds = true;
      else if (obs.direction === 'west' && (obs.x > despawnLimitX || Math.abs(obs.y) > despawnLimitY + 80)) outOfBounds = true;
      else if (obs.direction === 'east' && (obs.x < -despawnLimitX || Math.abs(obs.y) > despawnLimitY + 80)) outOfBounds = true;
      else if (obs.direction === 'diagonal' && (Math.abs(obs.x) > despawnLimitX + 80 || Math.abs(obs.y) > despawnLimitY + 80)) outOfBounds = true;
      else if (obs.direction === 'radial' && Math.hypot(obs.x, obs.y) > despawnLimitY + 40) outOfBounds = true;

      if (!outOfBounds) {
        remaining.push(obs);
      }
    }

    this.state.obstacles = remaining;
  }

  /**
   * Credits +100 points for the specific gate opening at `lateralCoord` if the player
   * has not already scored that specific gate opening on this wave line.
   */
  private scoreGateOpeningAt(
    wave: (typeof this.gateWaves)[number],
    player: Player,
    lateralCoord: number
  ) {
    let matchedGate: (typeof wave.gates)[number] | null = null;
    let bestDist = Infinity;

    for (const gate of wave.gates) {
      if (lateralCoord >= gate.start - 16 && lateralCoord <= gate.end + 16) {
        matchedGate = gate;
        break;
      }
      const dist = Math.min(Math.abs(lateralCoord - gate.start), Math.abs(lateralCoord - gate.end));
      if (dist < bestDist && dist <= 40) {
        bestDist = dist;
        matchedGate = gate;
      }
    }

    if (matchedGate && !matchedGate.scoredPlayers.has(player.id)) {
      matchedGate.scoredPlayers.add(player.id);
      player.score += 100;
      player.gatesCleared = (player.gatesCleared || 0) + 1;
    }
  }

  /**
   * Advances gate wave planes and awards +100 points per individual gate opening crossed
   * (supporting going through Gate 1 and looping back through Gate 2 on the same wave line).
   */
  private updateGateWaves(dt: number) {
    const despawnLimitX = this.ARENA_WIDTH / 2 + 90;
    const despawnLimitY = this.ARENA_HEIGHT / 2 + 90;
    const remainingWaves: typeof this.gateWaves = [];

    for (const wave of this.gateWaves) {
      wave.coord += wave.travelSign * wave.speed * dt;

      for (const id in this.state.players) {
        const p = this.state.players[id];
        if (!p.alive) continue;

        const playerCoord = wave.isVertical ? p.y : p.x;
        const currRel = (playerCoord - wave.coord) * wave.travelSign;
        const prevRel = wave.lastPlayerRel.get(id) ?? currRel;

        const crossedForward = prevRel > 0 && currRel <= 0;
        const crossedBackward = prevRel < 0 && currRel >= 0;

        if (crossedForward || crossedBackward) {
          const lateralCoord = wave.isVertical ? p.x : p.y;
          this.scoreGateOpeningAt(wave, p, lateralCoord);
          wave.lastPlayerRel.set(id, currRel === 0 ? (prevRel > 0 ? -0.01 : 0.01) : currRel);
        } else {
          wave.lastPlayerRel.set(id, currRel);
        }
      }

      const limit = wave.isVertical ? despawnLimitY : despawnLimitX;
      if (Math.abs(wave.coord) <= limit) {
        remainingWaves.push(wave);
      }
    }

    this.gateWaves = remainingWaves;
  }

  private checkCollisions() {
    for (const id in this.state.players) {
      const p = this.state.players[id];
      if (!p.alive) continue;

      for (const obs of this.state.obstacles) {
        if (this.isColliding(p, obs)) {
          p.alive = false;
          if (this.onPlayerEliminatedCallback) {
            this.onPlayerEliminatedCallback(p, this.state.currentTier);
          }
          this.checkPlayerStatus();
          break;
        }
      }
    }
  }

  private isColliding(player: Player, obs: Obstacle): boolean {
    const forgiveness = GAME_CONFIG.arena.hitboxForgiveness;
    // Server fallback includes a small 2.0px network-latency tolerance so in-flight client inputs never cause phantom hits
    const effectiveRadius = Math.max(3.5, player.radius - forgiveness - 2.0);

    if (obs.type === 'circle') {
      const dist = Math.hypot(player.x - obs.x, player.y - obs.y);
      return dist < effectiveRadius + (obs.radius || 12);
    }

    const halfW = obs.width / 2;
    const halfH = obs.height / 2;

    let pX = player.x - obs.x;
    let pY = player.y - obs.y;

    if (obs.rotation) {
      const cos = Math.cos(-obs.rotation);
      const sin = Math.sin(-obs.rotation);
      const rx = pX * cos - pY * sin;
      const ry = pX * sin + pY * cos;
      pX = rx;
      pY = ry;
    }

    const closestX = Math.max(-halfW, Math.min(pX, halfW));
    const closestY = Math.max(-halfH, Math.min(pY, halfH));

    const distanceX = pX - closestX;
    const distanceY = pY - closestY;

    return distanceX * distanceX + distanceY * distanceY < effectiveRadius * effectiveRadius;
  }

  private checkPlayerStatus() {
    const playerList = Object.values(this.state.players);
    if (playerList.length === 0) return;

    const alivePlayers = playerList.filter((p) => p.alive);

    // Let the last remaining player in multiplayer keep playing until all players are eliminated
    if (alivePlayers.length === 0) {
      // Win condition: highest points first, then survival time as tiebreaker
      const topWinner =
        [...playerList].sort((a, b) => b.score - a.score || b.survivedTime - a.survivedTime)[0] ||
        null;
      this.endGame(topWinner);
    }
  }

  private endGame(winnerPlayer: Player | null) {
    this.state.status = 'gameover';
    this.stop();

    if (winnerPlayer) {
      this.state.winner = {
        id: winnerPlayer.id,
        name: winnerPlayer.name,
        color: winnerPlayer.color,
        survivalTime: parseFloat(winnerPlayer.survivedTime.toFixed(2)),
      };
    } else {
      this.state.winner = null;
    }

    if (this.onGameOverCallback) {
      this.onGameOverCallback(this.state);
    }
  }
}
