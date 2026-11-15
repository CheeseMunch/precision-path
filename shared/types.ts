export type GameTier = 1 | 2 | 3 | 4 | 5;

export interface Player {
  id: string;
  name: string;
  color: string;
  x: number; // Position relative to arena center
  y: number;
  radius: number;
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

export interface GameState {
  roomId: string;
  status: 'lobby' | 'countdown' | 'playing' | 'paused' | 'gameover';
  pausedBy?: string | null;
  countdownTimer: number;
  currentTier: GameTier;
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
