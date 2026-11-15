import React, { useState } from 'react';
import { Play, Users, Trophy, Zap, Sliders } from 'lucide-react';

interface LobbyProps {
  playerName: string;
  setPlayerName: (name: string) => void;
  onCreateRoom: (solo?: boolean) => void;
  onJoinRoom: (roomCode: string) => void;
  onOpenLeaderboard: () => void;
  onOpenConfig: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  playerName,
  setPlayerName,
  onCreateRoom,
  onJoinRoom,
  onOpenLeaderboard,
  onOpenConfig,
}) => {
  const [joinCode, setJoinCode] = useState('');

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8 relative z-10">
      {/* Background radial atmosphere */}
      <div className="absolute w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Title */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-xs font-mono text-cyan-400 mb-3 tracking-widest uppercase">
          <Zap className="w-3.5 h-3.5 animate-pulse" /> Precision Radial Survival
        </div>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white font-display mb-2 drop-shadow-md">
          PRECISION<span className="text-cyan-400">PATH</span>
        </h1>
        <p className="text-gray-400 text-sm md:text-base max-w-md mx-auto">
          Keep your circle inside the ring. Slip through procedurally generated obstacles across 4 converging rounds into Endless mode.
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-md bg-cyber-panel/90 border border-cyber-border rounded-xl p-6 shadow-2xl backdrop-blur-md flex flex-col gap-5">
        {/* Name Input */}
        <div>
          <label className="block text-xs uppercase tracking-wider font-mono text-gray-400 mb-2">
            Callsign / Pilot Name
          </label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={14}
            placeholder="Enter username..."
            className="w-full px-4 py-2.5 bg-[#0a0c13] border border-cyber-border rounded-lg text-white font-mono focus:outline-none focus:border-cyan-400 transition"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => onCreateRoom(true)}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold font-display rounded-lg flex items-center justify-center gap-2 text-sm tracking-wider uppercase transition shadow-lg shadow-cyan-500/20 active:scale-[0.98]"
          >
            <Play className="w-4 h-4 fill-black" /> Play Solo
          </button>

          <button
            onClick={() => onCreateRoom(false)}
            className="w-full py-3 px-4 bg-cyber-panel hover:bg-[#1a1f30] border border-cyan-500/40 text-cyan-300 font-display font-semibold rounded-lg flex items-center justify-center gap-2 text-sm tracking-wider uppercase transition active:scale-[0.98]"
          >
            <Users className="w-4 h-4" /> Create Multiplayer Lobby
          </button>
        </div>

        {/* Join by Code Divider */}
        <div className="flex items-center gap-3">
          <div className="h-[1px] bg-cyber-border flex-1" />
          <span className="text-[11px] font-mono uppercase text-gray-500">OR JOIN WITH CODE</span>
          <div className="h-[1px] bg-cyber-border flex-1" />
        </div>

        {/* Join Code Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="ROOM CODE"
            className="w-full px-4 py-2 bg-[#0a0c13] border border-cyber-border rounded-lg text-white font-mono uppercase tracking-widest text-center focus:outline-none focus:border-cyan-400 transition"
          />
          <button
            onClick={() => onJoinRoom(joinCode)}
            disabled={!joinCode.trim()}
            className="px-5 py-2 bg-cyber-panel hover:bg-cyan-500 hover:text-black border border-cyber-border hover:border-cyan-400 disabled:opacity-40 disabled:hover:bg-cyber-panel disabled:hover:text-white rounded-lg text-xs font-mono font-bold uppercase transition"
          >
            Join
          </button>
        </div>

        {/* Leaderboard & Config Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onOpenLeaderboard}
            className="w-full py-2.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 font-mono text-xs rounded-lg flex items-center justify-center gap-1.5 transition"
          >
            <Trophy className="w-3.5 h-3.5" /> Leaderboard
          </button>
          <button
            onClick={onOpenConfig}
            className="w-full py-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-mono text-xs rounded-lg flex items-center justify-center gap-1.5 transition"
          >
            <Sliders className="w-3.5 h-3.5" /> Tune Config
          </button>
        </div>
      </div>

      {/* Core Rules Chips */}
      <div className="mt-8 grid grid-cols-2 gap-3 max-w-md w-full text-center">
        <div className="p-3.5 bg-cyber-panel/50 border border-cyber-border/40 rounded-lg">
          <div className="text-xs font-bold text-cyan-400 font-mono">1. PASS THROUGH THE GATES.</div>
        </div>
        <div className="p-3.5 bg-cyber-panel/50 border border-pink-500/40 rounded-lg">
          <div className="text-xs font-bold text-pink-400 font-mono">2. SURVIVE.</div>
        </div>
      </div>
    </div>
  );
};
