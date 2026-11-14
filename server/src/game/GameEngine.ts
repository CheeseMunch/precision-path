import { GameState, GameTier, Player, Obstacle, ObstacleDirection, ClientInput } from '../../../shared/types.js';
import { GAME_CONFIG, getTierDuration, ObstaclePatternType } from '../../../shared/gameConfig.js';

export class GameEngine {
  public state: GameState;
  private intervalId: NodeJS.Timeout | null = null;
  private countdownIntervalId: NodeJS.Timeout | null = null;
  private scheduledSpawns: Array<{ triggerAtElapsed: number; execute: () => void }> = [];
  private tickRate = GAME_CONFIG.engine.serverTickRate;
  private obstacleSpawnTimer = 0;
  private nextWaveInterval = GAME_CONFIG.obstacles.waveIntervals[1];
  private rngState: number | null = null;
  private matchDirections: ObstacleDirection[] = ['north', 'east', 'south', 'west'];

  private onGameOverCallback?: (state: GameState) => void;
  private onTierUpCallback?: (tier: GameTier) => void;
  private onStateUpdateCallback?: (state: GameState) => void;

  // Arena configuration from central config
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
  }) {
    this.onGameOverCallback = callbacks.onGameOver;
    this.onTierUpCallback = callbacks.onTierUp;
    this.onStateUpdateCallback = callbacks.onStateUpdate;
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
      radius: this.PLAYER_RADIUS,
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

    const dist = Math.hypot(input.x, input.y);
    const maxDist = this.ARENA_RADIUS - player.radius;

    if (dist <= maxDist) {
      player.x = input.x;
      player.y = input.y;
    } else if (dist > 0) {
      player.x = (input.x / dist) * maxDist;
      player.y = (input.y / dist) * maxDist;
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
      if (this.onStateUpdateCallback) this.onStateUpdateCallback(this.state);
    }
  }

  public startCountdown() {
    this.stop();
    this.resetGame();
    this.state.status = 'countdown';
    this.state.countdownTimer = GAME_CONFIG.rounds.startCountdownDuration;

    for (const id in this.state.players) {
      const p = this.state.players[id];
      p.alive = true;
      p.x = 0;
      p.y = 0;
      p.score = 0;
      p.survivedTime = 0;
    }

    if (this.onStateUpdateCallback) {
      this.onStateUpdateCallback(this.state);
    }

    this.countdownIntervalId = setInterval(() => {
      this.state.countdownTimer--;
      if (this.onStateUpdateCallback) this.onStateUpdateCallback(this.state);

      if (this.state.countdownTimer <= 0) {
        if (this.countdownIntervalId) {
          clearInterval(this.countdownIntervalId);
          this.countdownIntervalId = null;
        }
        this.startGame();
      }
    }, 1000);
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
      p.survivedTime = 0;
    }

    if (this.intervalId) clearInterval(this.intervalId);
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
  }

  private tick() {
    if (this.state.status !== 'playing') return;

    const dt = 1 / this.tickRate;
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
      if (p.alive) {
        p.survivedTime += dt;
        p.score = Math.floor(p.survivedTime * 10 * this.state.currentTier);
      }
    }

    this.updateTiers(dt);
    this.spawnObstacles(dt);
    this.updateObstacles(dt);
    this.checkCollisions();

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
        // Trigger a new wave immediately so the new level's added side is felt right away
        this.obstacleSpawnTimer = this.nextWaveInterval;
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
   * Selects an obstacle pattern archetype using the configured weights and minimum tier rules.
   */
  private pickProceduralObstacleType(tier: GameTier): ObstaclePatternType {
    const entries = Object.entries(GAME_CONFIG.obstacleTypes) as [
      ObstaclePatternType,
      (typeof GAME_CONFIG.obstacleTypes)[ObstaclePatternType]
    ][];

    const eligible = entries.filter(
      ([, cfg]) => cfg.enabled && cfg.weight > 0 && tier >= cfg.minTier
    );

    if (eligible.length === 0) {
      return 'single-gap-wall';
    }

    const totalWeight = eligible.reduce((sum, [, cfg]) => sum + cfg.weight, 0);
    let roll = this.random() * totalWeight;

    for (const [type, cfg] of eligible) {
      roll -= cfg.weight;
      if (roll <= 0) {
        return type;
      }
    }

    return eligible[eligible.length - 1][0];
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

    // Pick a navigable focal zone inside the arena so multi-directional waves always leave a survivable corridor
    const maxSafeOffset =
      this.ARENA_RADIUS * Math.min(0.8, GAME_CONFIG.randomness.gapPositionVariance * 0.85);
    const safeX = this.randomRange(-maxSafeOffset, maxSafeOffset);
    const safeY = this.randomRange(-maxSafeOffset, maxSafeOffset);

    let accumulatedDelayMs = 0;
    directions.forEach((dir, idx) => {
      const speedVar = GAME_CONFIG.randomness.speedVariance;
      const dirSpeed = rawSpeed * (1 + this.randomRange(-speedVar, speedVar));
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
   * Spawns a specific procedural obstacle archetype from a cardinal direction.
   */
  private spawnPatternFromDirection(
    direction: ObstacleDirection,
    patternType: ObstaclePatternType,
    speed: number,
    tier: GameTier,
    safeX: number,
    safeY: number
  ) {
    const baseGap = Math.max(
      GAME_CONFIG.obstacles.gapMinWidth,
      GAME_CONFIG.obstacles.gapBaseWidth - tier * GAME_CONFIG.obstacles.gapTierDecrement
    );
    const gapVar = GAME_CONFIG.randomness.gapSizeVariance;
    const gapSize = Math.max(
      GAME_CONFIG.obstacles.gapMinWidth,
      baseGap * (1 + this.randomRange(-gapVar, gapVar))
    );

    const clampLimit = this.ARENA_RADIUS * GAME_CONFIG.randomness.gapPositionVariance;
    const targetSafeLateral =
      direction === 'north' || direction === 'south' ? safeX : safeY;
    const jitter = this.randomRange(-45, 45);
    const gapCenter = Math.max(-clampLimit, Math.min(clampLimit, targetSafeLateral + jitter));

    const barThickness = GAME_CONFIG.obstacles.barThickness;
    const barLength = this.ARENA_RADIUS * GAME_CONFIG.obstacles.barLengthMultiplier;

    const dirColors: Record<string, string> = {
      north: '#ff2a6d', // Neon Crimson
      south: '#ff7700', // Neon Amber
      east: '#d300c5',  // Neon Magenta
      west: '#05d5fa',  // Electric Blue
    };
    const color = dirColors[direction] || '#ff2a6d';

    switch (patternType) {
      case 'single-gap-wall': {
        const leftCenter = gapCenter - gapSize / 2 - barLength / 2;
        const rightCenter = gapCenter + gapSize / 2 + barLength / 2;
        this.addLocalRectObstacle(direction, leftCenter, 0, barLength, barThickness, speed, 0, color);
        this.addLocalRectObstacle(direction, rightCenter, 0, barLength, barThickness, speed, 0, color);
        break;
      }

      case 'double-gap-wall': {
        const islandWidth = GAME_CONFIG.obstacles.doubleGapIslandWidth;
        const sideGap = Math.max(GAME_CONFIG.obstacles.gapMinWidth, gapSize * 0.92);
        // Place one of the two gaps near gapCenter so the safe zone remains open
        const shiftDir = this.random() < 0.5 ? 1 : -1;
        const islandCenter = Math.max(
          -clampLimit * 0.6,
          Math.min(clampLimit * 0.6, gapCenter + shiftDir * (sideGap / 2 + islandWidth / 2))
        );

        const leftOuterCenter = islandCenter - islandWidth / 2 - sideGap - barLength / 2;
        const rightOuterCenter = islandCenter + islandWidth / 2 + sideGap + barLength / 2;

        this.addLocalRectObstacle(direction, leftOuterCenter, 0, barLength, barThickness, speed, 0, color);
        this.addLocalRectObstacle(direction, islandCenter, 0, islandWidth, barThickness, speed, 0, color);
        this.addLocalRectObstacle(direction, rightOuterCenter, 0, barLength, barThickness, speed, 0, color);
        break;
      }

      case 'sweeping-half-wall': {
        // Anchored to one side, leaving an open passage around gapCenter
        const anchorNegativeSide = gapCenter >= 0;
        const passageEdge = anchorNegativeSide
          ? gapCenter - gapSize * 0.35
          : gapCenter + gapSize * 0.35;
        const wallCenter = anchorNegativeSide
          ? passageEdge - barLength / 2
          : passageEdge + barLength / 2;

        this.addLocalRectObstacle(
          direction,
          wallCenter,
          0,
          barLength,
          barThickness + 4,
          speed,
          0,
          color
        );
        break;
      }

      case 'staggered-blocks': {
        // 3 staggered rectangular blocks that avoid the safe gapCenter corridor
        const candidateZones = [-this.ARENA_RADIUS * 0.65, 0, this.ARENA_RADIUS * 0.65];
        candidateZones.forEach((zoneCenter, i) => {
          const lateral = zoneCenter + this.randomRange(-28, 28);
          // Skip or shift any block that would block the safe gapCenter
          const distFromGap = Math.abs(lateral - gapCenter);
          const adjustedLateral =
            distFromGap < gapSize * 0.75
              ? lateral + (lateral >= gapCenter ? gapSize * 0.8 : -gapSize * 0.8)
              : lateral;

          const blockWidth = this.randomRange(68, 110);
          const depthOffset = i * 28;
          this.addLocalRectObstacle(
            direction,
            adjustedLateral,
            depthOffset,
            blockWidth,
            barThickness + 2,
            speed,
            0,
            color
          );
        });
        break;
      }

      case 'orb-cluster': {
        // 4 circular pulse orbs with staggered depth and slight lateral drift
        const orbCount = 4;
        const spread = this.ARENA_RADIUS * 0.78;
        for (let i = 0; i < orbCount; i++) {
          const baseLat = -spread + (i / (orbCount - 1)) * (spread * 2);
          let orbLat = baseLat + this.randomRange(-22, 22);
          if (Math.abs(orbLat - gapCenter) < gapSize * 0.55) {
            orbLat += orbLat >= gapCenter ? gapSize * 0.6 : -gapSize * 0.6;
          }
          const depthOffset = this.randomRange(0, 42);
          const lateralDrift = this.randomRange(-24, 24);
          this.addLocalCircleObstacle(
            direction,
            orbLat,
            depthOffset,
            12,
            speed,
            lateralDrift,
            '#ffea00'
          );
        }
        break;
      }
    }
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
    const spawnDist =
      this.ARENA_RADIUS + GAME_CONFIG.obstacles.spawnDistanceOffset + depthOffset;

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
    const spawnDist =
      this.ARENA_RADIUS + GAME_CONFIG.obstacles.spawnDistanceOffset + depthOffset;

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

  private updateObstacles(dt: number) {
    const despawnLimit = this.ARENA_RADIUS + 90;
    const remaining: Obstacle[] = [];

    for (const obs of this.state.obstacles) {
      obs.x += obs.vx * dt;
      obs.y += obs.vy * dt;

      if (obs.rotationSpeed) {
        obs.rotation += obs.rotationSpeed * dt;
      }

      let outOfBounds = false;
      if (obs.direction === 'north' && obs.y > despawnLimit) outOfBounds = true;
      else if (obs.direction === 'south' && obs.y < -despawnLimit) outOfBounds = true;
      else if (obs.direction === 'west' && obs.x > despawnLimit) outOfBounds = true;
      else if (obs.direction === 'east' && obs.x < -despawnLimit) outOfBounds = true;
      else if (obs.direction === 'radial' && Math.hypot(obs.x, obs.y) > despawnLimit + 40)
        outOfBounds = true;

      if (!outOfBounds) {
        remaining.push(obs);
      }
    }

    this.state.obstacles = remaining;
  }

  private checkCollisions() {
    for (const id in this.state.players) {
      const p = this.state.players[id];
      if (!p.alive) continue;

      for (const obs of this.state.obstacles) {
        if (this.isColliding(p, obs)) {
          p.alive = false;
          this.checkPlayerStatus();
          break;
        }
      }
    }
  }

  private isColliding(player: Player, obs: Obstacle): boolean {
    const forgiveness = GAME_CONFIG.arena.hitboxForgiveness;
    const effectiveRadius = Math.max(4, player.radius - forgiveness);

    if (obs.type === 'circle') {
      const dist = Math.hypot(player.x - obs.x, player.y - obs.y);
      return dist < effectiveRadius + (obs.radius || 12);
    }

    const halfW = obs.width / 2;
    const halfH = obs.height / 2;

    const closestX = Math.max(obs.x - halfW, Math.min(player.x, obs.x + halfW));
    const closestY = Math.max(obs.y - halfH, Math.min(player.y, obs.y + halfH));

    const distanceX = player.x - closestX;
    const distanceY = player.y - closestY;

    return distanceX * distanceX + distanceY * distanceY < effectiveRadius * effectiveRadius;
  }

  private checkPlayerStatus() {
    const playerList = Object.values(this.state.players);
    if (playerList.length === 0) return;

    const alivePlayers = playerList.filter((p) => p.alive);

    if (playerList.length > 1) {
      if (alivePlayers.length === 1) {
        this.endGame(alivePlayers[0]);
      } else if (alivePlayers.length === 0) {
        const longestSurvivor =
          [...playerList].sort((a, b) => b.survivedTime - a.survivedTime)[0] || null;
        this.endGame(longestSurvivor);
      }
    } else {
      if (alivePlayers.length === 0) {
        this.endGame(playerList[0]);
      }
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
