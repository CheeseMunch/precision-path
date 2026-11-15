import React from 'react';
import type { GameState } from '../../../shared/types';
import { Users, Pause, Play } from 'lucide-react';

interface HUDProps {
  gameState: GameState;
  myPlayerId: string;
  onTogglePause: () => void;
}

const TIER_LABELS: Record<number, string> = {
  1: 'ROUND 1',
  2: 'ROUND 2',
  3: 'ROUND 3',
  4: 'ROUND 4',
  5: 'ROUND 5',
  6: 'ROUND 6',
  7: 'ROUND 7',
  8: 'ROUND 8',
};

export const HUD: React.FC<HUDProps> = ({
  gameState,
  myPlayerId,
  onTogglePause,
}) => {
  const myPlayer = gameState.players[myPlayerId];
  const alivePlayers = Object.values(gameState.players).filter((p) => p.alive);
  const totalPlayers = Object.keys(gameState.players).length;
  const isPaused = gameState.status === 'paused';
  const isCampaign = gameState.gameMode === 'campaign';
  const isEndless = !isCampaign && Boolean(gameState.isEndless || (gameState.totalRoundsBeforeEndless ? gameState.currentTier > gameState.totalRoundsBeforeEndless : gameState.currentTier === 5));
  const totalCheckpoints = gameState.checkpoints?.length || 0;
  const nextCheckpoint = Math.min(gameState.nextCheckpointIndex || 0, totalCheckpoints);

  return (
    <header className="w-full h-11 px-3 bg-[#090b12] border-b border-cyber-border/70 flex items-center justify-between shrink-0 z-20 select-none">
      {/* 1. Level */}
      <div
        className={`px-2.5 py-1 rounded border text-xs font-bold font-display tracking-wider uppercase ${
          isCampaign
            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
            : isEndless
            ? 'bg-red-500/20 border-red-500 text-red-400'
            : 'bg-cyan-500/15 border-cyan-400/60 text-cyan-300'
        }`}
      >
        {isCampaign
          ? `LEVEL ${gameState.campaignLevel || 1}`
          : isEndless
          ? 'ENDLESS'
          : (TIER_LABELS[gameState.currentTier] || `ROUND ${gameState.currentTier}`)}
      </div>

      {/* 2. Score */}
      <div className="px-3 py-1 rounded bg-cyber-panel/90 border border-yellow-500/40 text-xs font-mono text-yellow-400 font-bold">
        SCORE: {myPlayer?.score || 0}
      </div>

      {/* 3. Checkpoints (Campaign) or Players (Endless) */}
      {isCampaign ? (
        <div className="px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-500/40 text-xs font-mono text-emerald-300 font-bold">
          CP: {nextCheckpoint}/{totalCheckpoints}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyber-panel/90 border border-cyber-border text-xs font-mono text-gray-200">
          <Users className="w-3.5 h-3.5 text-cyan-400" />
          <span>
            {alivePlayers.length}/{totalPlayers}
          </span>
        </div>
      )}

      {/* 4. Pause Button */}
      <button
        onClick={onTogglePause}
        className="px-3 py-1 bg-cyber-panel hover:bg-[#1a2035] border border-cyan-500/40 rounded text-xs font-mono text-cyan-300 flex items-center gap-1.5 active:scale-95 transition"
        title="Pause / Resume (ESC)"
      >
        {isPaused ? <Play className="w-3.5 h-3.5 fill-cyan-300" /> : <Pause className="w-3.5 h-3.5" />}
        <span>{isPaused ? 'RESUME' : 'PAUSE'}</span>
      </button>
    </header>
  );
};
