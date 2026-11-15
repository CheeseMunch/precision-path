import React, { useState } from 'react';
import { Play, Users, Trophy, Zap, Flag, Lock, CheckCircle2, X } from 'lucide-react';
import type { CampaignLevelConfig } from '../../../shared/types';
import { getCampaignProgress } from '../utils/campaignProgress';

interface LobbyProps {
  playerName: string;
  setPlayerName: (name: string) => void;
  onCreateRoom: (solo?: boolean) => void;
  onPlayCampaign: (levelNumber: number) => void;
  onJoinRoom: (roomCode: string) => void;
  onOpenLeaderboard: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  playerName,
  setPlayerName,
  onCreateRoom,
  onPlayCampaign,
  onJoinRoom,
  onOpenLeaderboard,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignLevels, setCampaignLevels] = useState<CampaignLevelConfig[]>([]);
  const [loadingCampaign, setLoadingCampaign] = useState(false);

  const openCampaignSelect = async () => {
    setShowCampaignModal(true);
    setLoadingCampaign(true);
    try {
      const res = await fetch('/api/campaign-config');
      const data = await res.json();
      if (Array.isArray(data.levels)) {
        setCampaignLevels(data.levels);
      }
    } catch {
      // ignore
    } finally {
      setLoadingCampaign(false);
    }
  };

  const progress = getCampaignProgress(playerName);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8 relative z-10">
      {/* Background radial atmosphere */}
      <div className="absolute w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Title */}
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white font-display mb-1 drop-shadow-md">
          PRECISION<span className="text-cyan-400">PATH</span>
        </h1>
        <div className="text-xs font-mono uppercase tracking-[0.25em] text-cyan-300/80 mb-3">
          CheeseMunch Studios
        </div>
        <p className="text-gray-400 text-sm md:text-base max-w-md mx-auto">
          Pass through the gates to rack up points and survive converging obstacle waves as long as you can.
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
            onClick={openCampaignSelect}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-black font-bold font-display rounded-lg flex items-center justify-center gap-2 text-sm tracking-wider uppercase transition shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
          >
            <Flag className="w-4 h-4 fill-black" /> Play Campaign
          </button>

          <button
            onClick={() => onCreateRoom(true)}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold font-display rounded-lg flex items-center justify-center gap-2 text-sm tracking-wider uppercase transition shadow-lg shadow-cyan-500/20 active:scale-[0.98]"
          >
            <Play className="w-4 h-4 fill-black" /> Play Solo Endless
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

        {/* Leaderboard Button */}
        <div>
          <button
            onClick={onOpenLeaderboard}
            className="w-full py-2.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 font-mono text-xs rounded-lg flex items-center justify-center gap-1.5 transition"
          >
            <Trophy className="w-3.5 h-3.5" /> Leaderboard
          </button>
        </div>
      </div>

      {/* Core Rules Chips */}
      <div className="mt-8 grid grid-cols-2 gap-3 max-w-md w-full text-center">
        <div className="p-3.5 bg-cyber-panel/50 border border-cyber-border/40 rounded-lg">
          <div className="text-xs font-bold text-cyan-400 font-mono">PASS THROUGH THE GATES.</div>
        </div>
        <div className="p-3.5 bg-cyber-panel/50 border border-pink-500/40 rounded-lg">
          <div className="text-xs font-bold text-pink-400 font-mono">SURVIVE.</div>
        </div>
      </div>

      {/* Precision Arcade Survival chip */}
      <div className="mt-5 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-xs font-mono text-cyan-400 tracking-widest uppercase">
          <Zap className="w-3.5 h-3.5 animate-pulse" /> Precision Arcade Survival
        </div>
      </div>

      {/* Campaign Level Select Modal */}
      {showCampaignModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0d121d] border border-emerald-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-black text-white tracking-wider uppercase flex items-center gap-2">
                  <Flag className="w-5 h-5 text-emerald-400" /> Campaign Sectors
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Clear each structured path without hitting obstacles to unlock the next level.
                </p>
              </div>
              <button
                onClick={() => setShowCampaignModal(false)}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingCampaign ? (
              <div className="py-10 text-center text-xs font-mono text-cyan-400 animate-pulse">
                LOADING CAMPAIGN SECTORS...
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {(() => {
                  const groups: Array<{ storyName: string; levels: CampaignLevelConfig[] }> = [];
                  for (const lvl of campaignLevels) {
                    const sName = (lvl.storyName || 'Story 1').trim();
                    const last = groups[groups.length - 1];
                    if (last && last.storyName === sName) {
                      last.levels.push(lvl);
                    } else {
                      groups.push({ storyName: sName, levels: [lvl] });
                    }
                  }
                  return groups.map((grp, gIdx) => (
                    <div key={`${grp.storyName}-${gIdx}`} className="space-y-2">
                      <div className="flex items-center justify-between px-1 pt-1">
                        <span className="text-xs font-display font-bold uppercase tracking-wider text-cyan-300">
                          {grp.storyName}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          {grp.levels.length} sector{grp.levels.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      {grp.levels.map((lvl) => {
                        const unlocked = lvl.levelNumber <= progress.highestUnlockedLevel;
                        const record = progress.completedLevels[lvl.levelNumber];
                        return (
                          <button
                            key={lvl.levelNumber}
                            disabled={!unlocked}
                            onClick={() => {
                              setShowCampaignModal(false);
                              onPlayCampaign(lvl.levelNumber);
                            }}
                            className={`w-full text-left p-4 rounded-xl border transition flex items-center justify-between gap-3 ${
                              unlocked
                                ? 'bg-slate-900/90 hover:bg-slate-800/90 border-emerald-500/30 hover:border-emerald-400 cursor-pointer'
                                : 'bg-slate-950/60 border-slate-800/70 opacity-60 cursor-not-allowed'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  LEVEL {lvl.levelNumber}
                                </span>
                                <span className="font-display font-bold text-white text-sm">{lvl.name}</span>
                              </div>
                              {lvl.description && (
                                <div className="text-xs text-slate-400">{lvl.description}</div>
                              )}
                              <div className="text-[11px] font-mono text-slate-500">
                                {lvl.checkpoints.length} Checkpoints &bull; Par {lvl.parTimeSeconds}s &bull; +{lvl.clearBonusPoints} Clear Bonus
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {!unlocked ? (
                                <div className="flex items-center gap-1 text-xs font-mono text-slate-500">
                                  <Lock className="w-4 h-4" /> Locked
                                </div>
                              ) : record ? (
                                <>
                                  <div className="flex items-center gap-1 text-xs font-mono text-emerald-400 font-bold">
                                    <CheckCircle2 className="w-4 h-4" /> Cleared
                                  </div>
                                  <div className="text-[11px] font-mono text-cyan-300">
                                    Best: {record.bestScore}
                                  </div>
                                </>
                              ) : (
                                <span className="text-xs font-mono font-bold text-cyan-400 uppercase">
                                  Play &rarr;
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
