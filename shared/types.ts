export type GameTier = number;

export interface Player {
  id: string;
  name: string;
  color: string;
  x: number; // Position relative to arena center
  y: number;
  radius: number;
  hitboxRadius?: number;
  alive: boolean;
  score: number;
  gatesCleared?: number;
  survivedTime: number; // in seconds
  isHost: boolean;
  rank?: number;
}

export type ObstacleDirection = 'north' | 'south' | 'east' | 'west' | 'radial' | 'diagonal';

export interface Obstacle {
  id: string;
  x: number; // relative to arena center
  y: number;
  spawnX?: number;
  spawnY?: number;
  spawnTime?: number;
  spawnRotation?: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  radius?: number;
  type: 'rectangle' | 'circle' | 'laser' | 'ring-slice';
  rotation: number;
  rotationSpeed?: number;
  color: string;
  direction: ObstacleDirection;
  speed: number;
}

export type GameMode = 'endless' | 'campaign';

export type CampaignPatternType =
  | 'single-gap-wall'
  | 'double-gap-wall'
  | 'sweeping-half-wall'
  | 'staggered-blocks'
  | 'orb-cluster'
  | 'diagonal-spinner';

export interface CampaignCheckpoint {
  id: string;
  order: number;
  axis: 'horizontal' | 'vertical';
  coord: number;
  start: number;
  end: number;
  points: number;
  label?: string;
  reached?: boolean;
  waveId?: string;
  speed?: number;
  travelSign?: number;
  spawnCoord?: number;
  spawnTime?: number;
}

export interface CampaignWaveGateSpec {
  id: string;
  order: number;
  start: number;
  end: number;
  points: number;
  label?: string;
}

export interface CampaignWaveSpec {
  id: string;
  order: number;
  delayAfterPrev: number;
  side: 'north' | 'south' | 'east' | 'west';
  patternType: CampaignPatternType;
  speed: number;
  gapCenter: number;
  gapSize: number;
  barThickness?: number;
  color?: string;
  attachedGates: CampaignWaveGateSpec[];
}

export interface CampaignObstacleSpec {
  id: string;
  type: 'rectangle' | 'circle';
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  rotation?: number;
  rotationSpeed?: number;
  patrolAxis?: 'none' | 'x' | 'y';
  patrolRange?: number;
  patrolSpeed?: number;
  color: string;
}

export interface CampaignPatternTemplate {
  id: string;
  name: string;
  description?: string;
  waves: CampaignWaveSpec[];
}

export interface CampaignLevelConfig {
  id: string;
  levelNumber: number;
  name: string;
  description: string;
  spawn: { x: number; y: number };
  clearBonusPoints: number;
  parTimeSeconds: number;
  waves: CampaignWaveSpec[];
  obstacles: CampaignObstacleSpec[];
  checkpoints: CampaignCheckpoint[];
}

export interface GameState {
  roomId: string;
  gameMode?: GameMode;
  campaignLevel?: number;
  campaignLevelName?: string;
  totalCampaignLevels?: number;
  campaignSpawn?: { x: number; y: number };
  checkpoints?: CampaignCheckpoint[];
  nextCheckpointIndex?: number;
  campaignResult?: 'cleared' | 'failed' | null;
  campaignClearBonus?: number;
  campaignTimeBonus?: number;
  status: 'lobby' | 'countdown' | 'playing' | 'paused' | 'gameover';
  pausedBy?: string | null;
  countdownTimer: number;
  currentTier: GameTier;
  totalRoundsBeforeEndless?: number;
  isEndless?: boolean;
  activeDirections?: ObstacleDirection[];
  tierTimeRemaining: number;
  elapsedTime: number;
  arenaRadius: number; // legacy fallback
  arenaWidth: number;  // playable phone rectangle width
  arenaHeight: number; // playable phone rectangle height
  players: Record<string, Player>;
  obstacles: Obstacle[];
  winner?: {
    id: string;
    name: string;
    color: string;
    survivalTime: number;
  } | null;
}

export interface ClientInput {
  x: number; // target position relative to arena center
  y: number;
  isTeleport?: boolean; // true when player clicks/taps a spot to teleport instead of dragging
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  bestScore?: number;
  bestSurvivalTime: number;
  highestTier: number;
  totalGames: number;
  totalScore?: number;
  createdAt: string;
}
