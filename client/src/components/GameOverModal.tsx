import React from 'react';
import type { GameState } from '../../../shared/types';
import { Trophy, RotateCcw, Home, Award, Users, ArrowRight } from 'lucide-react';

interface GameOverModalProps {
  gameState: GameState;
  myPlayerId: string;
  onPlayAgain: () => void;
  onNextCampaignLevel?: () => void;
  onReturnToWaitingRoom: () => void;
  onReturnToLobby: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  gameState,
  myPlayerId,
  onPlayAgain,
  onNextCampaignLevel,
  onReturnToWaitingRoom,
  onReturnToLobby,
}) => {
  const myPlayer = gameState.players[myPlayerId];
  const isWinner = gameState.winner?.id === myPlayerId;
  // Win condition & standings order: highest points first, then survival time if tied
  const playersList = Object.values(gameState.players).sort(
    (a, b) => b.score - a.score || b.survivedTime - a.survivedTime
  );
  const isSolo = playersList.length === 1;
  const isCampaign = gameState.gameMode === 'campaign';
  const isCampaignCleared = isCampaign && gameState.campaignResult === 'cleared';
  const hasNextCampaignLevel =
    isCampaignCleared &&
    (gameState.campaignLevel || 1) < (gameState.totalCampaignLevels || 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md bg-cyber-panel border border-cyber-border rounded-xl p-6 shadow-2xl flex flex-col gap-4 text-center animate-in fade-in zoom-in-95 duration-200">
        {/* Banner */}
        <div>
          <div className="w-12 h-12 mx-auto rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-2">
            {isCampaignCleared || (!isCampaign && (isWinner || isSolo)) ? (
              <Trophy className="w-6 h-6 text-yellow-400" />
            ) : (
              <Award className="w-6 h-6 text-red-400" />
            )}
          </div>
          <h2 className="text-2xl md:text-3xl font-black font-display tracking-tight text-white uppercase">
            {isCampaign
              ? isCampaignCleared
                ? 'LEVEL CLEARED!'
                : 'MISSION FAILED'
              : isSolo
              ? 'MISSION OVER'
              : isWinner
              ? 'VICTORY!'
              : 'DEFEAT'}
          </h2>
          {isCampaign && (
            <p className="text-xs font-mono text-emerald-300 mt-1">
              Level {gameState.campaignLevel}: {gameState.campaignLevelName}
            </p>
          )}
          {!isSolo && !isCampaign && (
            <p className="text-xs font-mono text-gray-400 mt-1">
              {gameState.winner ? `Winner: ${gameState.winner.name}` : 'Room Match Complete'} • Room{' '}
              <span className="text-cyan-400 font-bold">{gameState.roomId}</span>
            </p>
          )}
        </div>

        {/* Personal Stats Grid */}
        <div className="grid grid-cols-3 gap-2 bg-[#090b12] border border-cyber-border/60 p-3 rounded-lg text-left font-mono">
          <div>
            <div className="text-[10px] text-gray-500 uppercase">SURVIVED</div>
            <div className="text-sm font-bold text-cyan-400">
              {myPlayer ? `${myPlayer.survivedTime.toFixed(1)}s` : '0s'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase">{isCampaign ? 'CHECKPOINTS' : 'MAX ROUND'}</div>
            <div className="text-sm font-bold text-pink-400">
              {isCampaign
                ? `${gameState.nextCheckpointIndex || 0}/${gameState.checkpoints?.length || 0}`
                : gameState.isEndless
                ? 'Endless'
                : `Round ${gameState.currentTier}`}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase">SCORE</div>
            <div className="text-sm font-bold text-yellow-400">{myPlayer?.score || 0}</div>
          </div>
        </div>

        {isCampaignCleared && (
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-2.5 text-xs font-mono flex items-center justify-around text-emerald-300">
            <span>Clear Bonus: +{gameState.campaignClearBonus || 0}</span>
            <span>Time Bonus: +{gameState.campaignTimeBonus || 0}</span>
          </div>
        )}

        {/* Multiplayer Room Standings */}
        {!isSolo && (
          <div className="bg-[#090b12] border border-cyber-border/60 rounded-lg p-3 flex flex-col gap-1.5 text-xs font-mono max-h-40 overflow-y-auto">
            <div className="text-[10px] text-gray-500 uppercase text-left mb-0.5">
              Room {gameState.roomId} Standings
            </div>
            {playersList.map((p, idx) => (
              <div
                key={p.id}
                className="flex items-center justify-between py-1 border-b border-cyber-border/30 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className={idx === 0 ? 'text-yellow-400 font-bold' : 'text-gray-500'}>
                    #{idx + 1}
                  </span>
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="text-gray-200 font-semibold">
                    {p.id === myPlayerId ? `${p.name} (YOU)` : p.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-yellow-400 font-bold">{p.score} pts</span>
                  <span className="text-cyan-300">{p.survivedTime.toFixed(1)}s</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions (Persistent Lobby) */}
        <div className="flex flex-col gap-2.5">
          {hasNextCampaignLevel && onNextCampaignLevel && (
            <button
              onClick={onNextCampaignLevel}
              className="w-full py-3 px-4 bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-black font-bold font-display rounded-lg flex items-center justify-center gap-2 text-sm tracking-wider uppercase transition active:scale-[0.98]"
            >
              Next Level <ArrowRight className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onPlayAgain}
            className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold font-display rounded-lg flex items-center justify-center gap-2 text-sm tracking-wider uppercase transition active:scale-[0.98]"
          >
            <RotateCcw className="w-4 h-4" /> {isCampaign ? 'Replay Level' : `Play Again ${!isSolo ? '(Same Lobby)' : ''}`}
          </button>

          {!isSolo && (
            <button
              onClick={onReturnToWaitingRoom}
              className="w-full py-2.5 px-4 bg-cyber-dark hover:bg-[#1a2035] border border-cyan-500/40 text-cyan-300 font-mono text-xs rounded-lg flex items-center justify-center gap-2 transition"
            >
              <Users className="w-4 h-4" /> Room Waiting Lobby ({gameState.roomId})
            </button>
          )}

          <button
            onClick={onReturnToLobby}
            className="w-full py-2.5 px-4 bg-cyber-dark hover:bg-cyber-panel border border-cyber-border text-gray-400 hover:text-white font-mono text-xs rounded-lg flex items-center justify-center gap-2 transition"
          >
            <Home className="w-4 h-4" /> {isSolo ? 'Return to Lobby' : 'Leave Room'}
          </button>
        </div>
      </div>
    </div>
  );
};
