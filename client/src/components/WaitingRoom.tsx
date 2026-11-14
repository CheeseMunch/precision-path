import React from 'react';
import type { GameState } from '../../../shared/types';
import { Copy, Check, Play, Users, Crown } from 'lucide-react';

interface WaitingRoomProps {
  gameState: GameState;
  myPlayerId: string;
  onStartGame: () => void;
  onLeaveRoom: () => void;
}

export const WaitingRoom: React.FC<WaitingRoomProps> = ({
  gameState,
  myPlayerId,
  onStartGame,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = React.useState(false);
  const myPlayer = gameState.players[myPlayerId];
  const isHost = myPlayer?.isHost;
  const players = Object.values(gameState.players);

  const copyCode = () => {
    navigator.clipboard.writeText(gameState.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8 relative z-10">
      <div className="w-full max-w-md bg-cyber-panel border border-cyber-border rounded-xl p-6 shadow-2xl backdrop-blur-md flex flex-col gap-6">
        {/* Header */}
        <div className="text-center">
          <div className="text-xs uppercase font-mono text-gray-400 mb-1">Multiplayer Lobby</div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl font-black font-mono tracking-widest text-cyan-400">
              {gameState.roomId}
            </span>
            <button
              onClick={copyCode}
              className="p-1.5 bg-cyber-dark hover:bg-cyber-panel border border-cyber-border rounded text-gray-300 transition"
              title="Copy Room Code"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Share this code with other players to invite them!</p>
        </div>

        {/* Players List */}
        <div>
          <div className="flex items-center justify-between text-xs font-mono uppercase text-gray-400 mb-3">
            <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Pilots Connected</span>
            <span>{players.length} / 8</span>
          </div>
          <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
            {players.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-3.5 py-2.5 bg-[#0a0c13] border border-cyber-border/60 rounded-lg text-sm font-mono"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: p.color, boxShadow: `0 0 8px ${p.color}` }}
                  />
                  <span className={p.id === myPlayerId ? 'text-cyan-300 font-bold' : 'text-gray-200'}>
                    {p.name} {p.id === myPlayerId && '(You)'}
                  </span>
                </div>
                {p.isHost && (
                  <span className="flex items-center gap-1 text-[11px] text-yellow-400 font-bold bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-400/20">
                    <Crown className="w-3 h-3" /> HOST
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {isHost ? (
            <button
              onClick={onStartGame}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold font-display rounded-lg flex items-center justify-center gap-2 text-sm tracking-wider uppercase transition shadow-lg shadow-cyan-500/20 active:scale-[0.98]"
            >
              <Play className="w-4 h-4 fill-black" /> Launch Match
            </button>
          ) : (
            <div className="py-3 px-4 bg-[#0a0c13] border border-cyber-border rounded-lg text-center text-xs font-mono text-gray-400 animate-pulse">
              Waiting for Host to launch match...
            </div>
          )}

          <button
            onClick={onLeaveRoom}
            className="w-full py-2.5 bg-transparent hover:bg-cyber-dark border border-cyber-border/60 text-gray-400 hover:text-white font-mono text-xs rounded-lg transition"
          >
            Leave Lobby
          </button>
        </div>
      </div>
    </div>
  );
};
