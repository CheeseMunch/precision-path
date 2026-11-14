import React from 'react';
import type { GameState } from '../../../shared/types';
import { Volume2, VolumeX, ShieldAlert, Users, Trophy, Pause, Play } from 'lucide-react';
import { sound } from '../utils/sound';

interface HUDProps {
  gameState: GameState;
  myPlayerId: string;
  onOpenLeaderboard: () => void;
  onLeaveRoom: () => void;
  onTogglePause: () => void;
}

const TIER_NAMES: Record<number, string> = {
  1: 'LEVEL 1 • 1 SIDE',
  2: 'LEVEL 2 • 2 SIDES',
  3: 'LEVEL 3 • 3 SIDES',
  4: 'LEVEL 4 • ALL 4 SIDES',
  5: 'ENDLESS MODE • ALL SIDES',
};

export const HUD: React.FC<HUDProps> = ({
  gameState,
  myPlayerId,
  onOpenLeaderboard,
  onLeaveRoom,
  onTogglePause,
}) => {
  const [muted, setMuted] = React.useState(!sound.enabled);
  const myPlayer = gameState.players[myPlayerId];
  const alivePlayers = Object.values(gameState.players).filter((p) => p.alive);
  const isPaused = gameState.status === 'paused';

  const toggleSound = () => {
    sound.enabled = !sound.enabled;
    setMuted(!sound.enabled);
  };

  return (
    <div className="absolute top-0 left-0 w-full p-4 pointer-events-none flex flex-col gap-3 z-20">
      <div className="flex items-center justify-between max-w-4xl mx-auto w-full">
        {/* Room & Controls */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={onLeaveRoom}
            className="px-3 py-1 bg-cyber-panel/80 hover:bg-cyber-panel border border-cyber-border rounded text-xs font-mono text-gray-300 transition"
          >
            Leave ({gameState.roomId})
          </button>
          {(gameState.status === 'playing' || gameState.status === 'paused') && (
            <button
              onClick={onTogglePause}
              className="px-2.5 py-1 bg-cyber-panel/80 hover:bg-cyber-panel border border-cyber-border rounded text-xs font-mono text-cyan-300 flex items-center gap-1 transition"
              title="Pause / Resume (ESC)"
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isPaused ? 'Resume' : 'Pause'} (ESC)</span>
            </button>
          )}
          <button
            onClick={onOpenLeaderboard}
            className="p-1.5 bg-cyber-panel/80 hover:bg-cyber-panel border border-cyber-border rounded text-yellow-400 transition"
            title="Leaderboard"
          >
            <Trophy className="w-4 h-4" />
          </button>
          <button
            onClick={toggleSound}
            className="p-1.5 bg-cyber-panel/80 hover:bg-cyber-panel border border-cyber-border rounded text-gray-300 transition"
            title="Toggle Audio"
          >
            {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
          </button>
        </div>

        {/* Tier Indicator */}
        <div className="flex flex-col items-center">
          <div className={`px-4 py-1 rounded-full border text-xs font-bold tracking-widest uppercase transition-all duration-300 ${
            gameState.currentTier === 5
              ? 'bg-red-500/20 border-red-500 text-red-400 neon-glow-pink animate-pulse'
              : 'bg-cyan-500/20 border-cyan-400 text-cyan-300 neon-glow-cyan'
          }`}>
            {TIER_NAMES[gameState.currentTier] || 'ROUND 1'}
          </div>
          {gameState.currentTier < 5 && (gameState.status === 'playing' || gameState.status === 'paused') && (
            <span className="text-[10px] text-gray-400 mt-0.5 font-mono">
              Next Round in: {Math.max(0, Math.ceil(gameState.tierTimeRemaining))}s
            </span>
          )}
        </div>

        {/* Alive Players, Gate Score & Timer */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-cyber-panel/80 px-2.5 py-1 rounded border border-cyber-border text-xs font-mono">
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span>{alivePlayers.length}/{Object.keys(gameState.players).length}</span>
          </div>
          <div className="bg-cyber-panel/80 px-3 py-1 rounded border border-yellow-500/40 text-xs font-mono text-yellow-400 font-bold">
            PTS: {myPlayer?.score || 0}
          </div>
          <div className="bg-cyber-panel/80 px-3 py-1 rounded border border-cyber-border text-xs font-mono text-cyan-300 font-bold">
            {gameState.elapsedTime.toFixed(1)}s
          </div>
        </div>
      </div>

      {/* Eliminated Spectator Banner */}
      {myPlayer && !myPlayer.alive && gameState.status === 'playing' && (
        <div className="mx-auto bg-red-950/80 border border-red-500/60 px-4 py-1.5 rounded-full flex items-center gap-2 text-xs text-red-300 font-mono animate-pulse">
          <ShieldAlert className="w-4 h-4 text-red-400" />
          <span>ELIMINATED — SPECTATING LIVE MATCH</span>
        </div>
      )}
    </div>
  );
};
