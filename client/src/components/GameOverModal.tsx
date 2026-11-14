import React from 'react';
import type { GameState } from '../../../shared/types';
import { Trophy, RotateCcw, Home, Award } from 'lucide-react';

interface GameOverModalProps {
  gameState: GameState;
  myPlayerId: string;
  onPlayAgain: () => void;
  onReturnToLobby: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  gameState,
  myPlayerId,
  onPlayAgain,
  onReturnToLobby,
}) => {
  const myPlayer = gameState.players[myPlayerId];
  const isWinner = gameState.winner?.id === myPlayerId;
  const isHost = myPlayer?.isHost;
  const isSolo = Object.keys(gameState.players).length === 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md bg-cyber-panel border border-cyber-border rounded-xl p-6 shadow-2xl flex flex-col gap-5 text-center animate-in fade-in zoom-in-95 duration-200">
        {/* Banner */}
        <div>
          <div className="w-12 h-12 mx-auto rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-3">
            {isWinner || isSolo ? <Trophy className="w-6 h-6 text-yellow-400" /> : <Award className="w-6 h-6 text-red-400" />}
          </div>
          <h2 className="text-2xl md:text-3xl font-black font-display tracking-tight text-white uppercase">
            {isSolo ? 'MISSION OVER' : isWinner ? 'VICTORY!' : 'ELIMINATED'}
          </h2>
          <p className="text-xs font-mono text-gray-400 mt-1">
            {gameState.winner ? `Winner: ${gameState.winner.name}` : 'No survivors'}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 bg-[#090b12] border border-cyber-border/60 p-3 rounded-lg text-left font-mono">
          <div>
            <div className="text-[10px] text-gray-500 uppercase">SURVIVED</div>
            <div className="text-sm font-bold text-cyan-400">
              {myPlayer ? `${myPlayer.survivedTime.toFixed(1)}s` : '0s'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase">MAX TIER</div>
            <div className="text-sm font-bold text-pink-400">
              Tier {gameState.currentTier}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase">SCORE</div>
            <div className="text-sm font-bold text-yellow-400">
              {myPlayer?.score || 0}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          {isHost || isSolo ? (
            <button
              onClick={onPlayAgain}
              className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold font-display rounded-lg flex items-center justify-center gap-2 text-sm tracking-wider uppercase transition active:scale-[0.98]"
            >
              <RotateCcw className="w-4 h-4" /> Rematch / Play Again
            </button>
          ) : (
            <div className="py-2.5 px-4 bg-[#090b12] border border-cyber-border rounded-lg text-xs font-mono text-gray-400 animate-pulse">
              Waiting for host to rematch...
            </div>
          )}

          <button
            onClick={onReturnToLobby}
            className="w-full py-2.5 px-4 bg-cyber-dark hover:bg-cyber-panel border border-cyber-border text-gray-300 font-mono text-xs rounded-lg flex items-center justify-center gap-2 transition"
          >
            <Home className="w-4 h-4" /> Return to Lobby
          </button>
        </div>
      </div>
    </div>
  );
};
