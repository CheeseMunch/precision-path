import React, { useState } from 'react';
import { Play, Users, Trophy, Flag, Lock, CheckCircle2, X } from 'lucide-react';
import type { CampaignLevelConfig } from '../../../shared/types';
import { getCampaignProgress } from '../utils/campaignProgress';

import { Globe, Plus, Pencil, Trash2 } from 'lucide-react';
import type { CommunityLevelConfig } from '../../../shared/types';
import { CommunityLevelEditor } from './CommunityLevelEditor';

interface LobbyProps {
  playerName: string;
  setPlayerName: (name: string) => void;
  onCreateRoom: (solo?: boolean) => void;
  onPlayCampaign: (levelNumber: number) => void;
  onPlayCommunityLevel: (communityLevelId: string) => void;
  onJoinRoom: (roomCode: string) => void;
  onOpenLeaderboard: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  playerName,
  setPlayerName,
  onCreateRoom,
  onPlayCampaign,
  onPlayCommunityLevel,
  onJoinRoom,
  onOpenLeaderboard,
}) => {
  const [showCommunityModal, setShowCommunityModal] = React.useState(false);
  const [communityLevels, setCommunityLevels] = React.useState<CommunityLevelConfig[]>([]);
  const [communityLoading, setCommunityLoading] = React.useState(false);
  const [communityError, setCommunityError] = React.useState<string | null>(null);
  const [editingCommunityLevel, setEditingCommunityLevel] = React.useState<CommunityLevelConfig | null>(null);
  const [creatingCommunityLevel, setCreatingCommunityLevel] = React.useState(false);
  const [deletingCommunityId, setDeletingCommunityId] = React.useState<string | null>(null);

  const fetchCommunityLevels = async () => {
    setCommunityLoading(true);
    setCommunityError(null);
    try {
      const res = await fetch('/api/community-levels');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load community levels');
      setCommunityLevels(Array.isArray(data.levels) ? data.levels : []);
    } catch (err: any) {
      setCommunityError(err?.message || 'Failed to load community levels');
    } finally {
      setCommunityLoading(false);
    }
  };

  const openCommunityBrowser = () => {
    setShowCommunityModal(true);
    fetchCommunityLevels();
  };

  const handleDeleteCommunityLevel = async (lvl: CommunityLevelConfig) => {
    const cleanName = playerName.trim();
    if (!cleanName) return;
    if (!window.confirm(`Delete "${lvl.name}"? This cannot be undone.`)) return;
    setDeletingCommunityId(lvl.id);
    try {
      const res = await fetch(
        `/api/community-levels/${encodeURIComponent(lvl.id)}?creatorName=${encodeURIComponent(cleanName)}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creatorName: cleanName }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete level');
      setCommunityLevels((prev) => prev.filter((item) => item.id !== lvl.id));
    } catch (err: any) {
      setCommunityError(err?.message || 'Failed to delete level');
    } finally {
      setDeletingCommunityId(null);
    }
  };
  const [joinCode, setJoinCode] = useState('');
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignLevels, setCampaignLevels] = useState<CampaignLevelConfig[]>([]);
  const [loadingCampaign, setLoadingCampaign] = useState(false);
  const [selectedStoryIdx, setSelectedStoryIdx] = useState(0);

  const openCampaignSelect = async () => {
    setShowCampaignModal(true);
    setLoadingCampaign(true);
    try {
      const res = await fetch('/api/campaign-config');
      const data = await res.json();
      if (Array.isArray(data.levels)) {
        setCampaignLevels(data.levels);
        const curProgress = getCampaignProgress(playerName);
        const groups: Array<{ storyName: string; levels: CampaignLevelConfig[] }> = [];
        for (const lvl of data.levels) {
          const sName = (lvl.storyName || 'Story 1').trim();
          const last = groups[groups.length - 1];
          if (last && last.storyName === sName) {
            last.levels.push(lvl);
          } else {
            groups.push({ storyName: sName, levels: [lvl] });
          }
        }
        const frontierIdx = groups.findIndex((g) =>
          g.levels.some((l) => l.levelNumber === curProgress.highestUnlockedLevel)
        );
        if (frontierIdx >= 0) {
          setSelectedStoryIdx(frontierIdx);
        } else {
          let lastUnlocked = 0;
          groups.forEach((g, idx) => {
            if (g.levels[0] && g.levels[0].levelNumber <= curProgress.highestUnlockedLevel) {
              lastUnlocked = idx;
            }
          });
          setSelectedStoryIdx(lastUnlocked);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingCampaign(false);
    }
  };

  const progress = getCampaignProgress(playerName);
  const hasPilotName = playerName.trim().length > 0;

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
            Pilot Name
          </label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={14}
            placeholder="Create a pilot name..."
            className="w-full px-4 py-2.5 bg-[#0a0c13] border border-cyber-border rounded-lg text-white font-mono focus:outline-none focus:border-cyan-400 transition"
          />
          {!hasPilotName && (
            <p className="text-[11px] font-mono text-amber-400/90 mt-1.5">
              Create a pilot name to play or join a lobby.
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={openCampaignSelect}
            disabled={!hasPilotName}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 disabled:opacity-40 disabled:pointer-events-none text-black font-bold font-display rounded-lg flex items-center justify-center gap-2 text-sm tracking-wider uppercase transition shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
          >
            <Flag className="w-4 h-4 fill-black" /> Play Campaign
          </button>

          <button
            onClick={() => onCreateRoom(true)}
            disabled={!hasPilotName}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 disabled:pointer-events-none text-black font-bold font-display rounded-lg flex items-center justify-center gap-2 text-sm tracking-wider uppercase transition shadow-lg shadow-cyan-500/20 active:scale-[0.98]"
          >
            <Play className="w-4 h-4 fill-black" /> Play Solo Endless
          </button>

          <button
            onClick={openCommunityBrowser}
            disabled={!hasPilotName}
            className="w-full py-3 px-4 bg-cyber-panel hover:bg-[#1a1f30] disabled:opacity-40 disabled:pointer-events-none border border-emerald-500/40 text-emerald-300 font-display font-semibold rounded-lg flex items-center justify-center gap-2 text-sm tracking-wider uppercase transition active:scale-[0.98]"
          >
            <Globe className="w-4 h-4" /> Browse Community Levels
          </button>

          <button
            onClick={() => onCreateRoom(false)}
            disabled={!hasPilotName}
            className="w-full py-3 px-4 bg-cyber-panel hover:bg-[#1a1f30] disabled:opacity-40 disabled:pointer-events-none border border-cyan-500/40 text-cyan-300 font-display font-semibold rounded-lg flex items-center justify-center gap-2 text-sm tracking-wider uppercase transition active:scale-[0.98]"
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
            disabled={!hasPilotName || !joinCode.trim()}
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

      {/* Core Rule Chip */}
      <div className="mt-8 text-center">
        <div className="inline-block px-4 py-2 bg-cyber-panel/50 border border-pink-500/40 rounded-lg">
          <div className="text-xs font-bold text-pink-400 font-mono">Don&apos;t get hit.</div>
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
              (() => {
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
                if (groups.length === 0) {
                  return (
                    <div className="py-8 text-center text-xs font-mono text-slate-400">
                      No campaign levels available.
                    </div>
                  );
                }

                const safeStoryIdx = Math.max(0, Math.min(selectedStoryIdx, groups.length - 1));
                const activeGroup = groups[safeStoryIdx];
                const activeStoryUnlocked = Boolean(
                  activeGroup.levels[0] && activeGroup.levels[0].levelNumber <= progress.highestUnlockedLevel
                );
                const anyClearedInStory = activeGroup.levels.some((l) => Boolean(progress.completedLevels[l.levelNumber]));
                const nextPlayableLevel =
                  activeGroup.levels.find(
                    (l) => l.levelNumber <= progress.highestUnlockedLevel && !progress.completedLevels[l.levelNumber]
                  ) || activeGroup.levels[0];

                return (
                  <div className="space-y-4">
                    {/* Selectable Story Tabs across the top */}
                    <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
                      {groups.map((grp, gIdx) => {
                        const firstLvl = grp.levels[0];
                        const storyUnlocked = Boolean(
                          firstLvl && firstLvl.levelNumber <= progress.highestUnlockedLevel
                        );
                        const storyCleared =
                          grp.levels.length > 0 &&
                          grp.levels.every((l) => Boolean(progress.completedLevels[l.levelNumber]));
                        const isSelected = gIdx === safeStoryIdx;
                        return (
                          <button
                            key={`${grp.storyName}-${gIdx}`}
                            disabled={!storyUnlocked}
                            onClick={() => setSelectedStoryIdx(gIdx)}
                            className={`px-3 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-wider border transition flex items-center gap-1.5 ${
                              !storyUnlocked
                                ? 'bg-slate-950/60 border-slate-800/70 text-slate-500 opacity-60 cursor-not-allowed'
                                : isSelected
                                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-sm shadow-cyan-500/20 cursor-pointer'
                                  : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-cyan-500/50 hover:text-white cursor-pointer'
                            }`}
                          >
                            {!storyUnlocked ? (
                              <Lock className="w-3.5 h-3.5 text-slate-500" />
                            ) : storyCleared ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : null}
                            <span>{grp.storyName}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Play Story CTA */}
                    {activeStoryUnlocked && nextPlayableLevel && (
                      <button
                        onClick={() => {
                          setShowCampaignModal(false);
                          onPlayCampaign(nextPlayableLevel.levelNumber);
                        }}
                        className="w-full py-3 px-4 bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-black font-bold font-display rounded-xl flex items-center justify-center gap-2 text-sm tracking-wider uppercase transition shadow-lg shadow-emerald-500/20 active:scale-[0.98] cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-black" />
                        {anyClearedInStory && !activeGroup.levels.every((l) => Boolean(progress.completedLevels[l.levelNumber]))
                          ? `Continue ${activeGroup.storyName} (Level ${nextPlayableLevel.levelNumber})`
                          : `Play ${activeGroup.storyName}`}
                      </button>
                    )}

                    {/* Or Select Level */}
                    <div className="flex items-center gap-3">
                      <div className="h-[1px] bg-slate-800 flex-1" />
                      <span className="text-[11px] font-mono uppercase text-slate-500">
                        Or Select Level ({activeGroup.levels.length} sector{activeGroup.levels.length === 1 ? '' : 's'})
                      </span>
                      <div className="h-[1px] bg-slate-800 flex-1" />
                    </div>

                    <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
                      {activeGroup.levels.map((lvl) => {
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
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* Community Levels Browser Modal */}
      {showCommunityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-2xl max-h-[85vh] bg-cyber-panel border border-emerald-500/40 rounded-xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 border-b border-cyber-border pb-3">
              <div>
                <h2 className="text-xl font-black font-display tracking-wide text-emerald-300 uppercase flex items-center gap-2">
                  <Globe className="w-5 h-5" /> Community Levels
                </h2>
                <p className="text-xs text-slate-400">
                  Play custom 1-level challenges created by pilots, or build your own.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingCommunityLevel(null);
                    setCreatingCommunityLevel(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-display font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition"
                >
                  <Plus className="w-4 h-4" /> Create Level
                </button>
                <button
                  onClick={() => setShowCommunityModal(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-cyber-bg border border-cyber-border text-slate-300 hover:text-white text-xs font-mono"
                >
                  ✕
                </button>
              </div>
            </div>

            {communityError && (
              <div className="p-2.5 rounded-lg bg-red-950/50 border border-red-500/40 text-red-300 text-xs font-mono">
                {communityError}
              </div>
            )}

            <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1">
              {communityLoading ? (
                <div className="text-center py-10 text-slate-400 text-sm font-mono">
                  Loading community levels...
                </div>
              ) : communityLevels.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">
                  No community levels yet. Click <span className="text-emerald-300 font-semibold">+ Create Level</span> to publish the first one!
                </div>
              ) : (
                communityLevels.map((lvl) => {
                  const isOwner =
                    lvl.creatorName.trim().toLowerCase() === playerName.trim().toLowerCase();
                  return (
                    <div
                      key={lvl.id}
                      className="p-3.5 rounded-lg bg-cyber-bg/80 border border-cyber-border hover:border-emerald-500/40 flex items-center justify-between gap-3 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display font-bold text-white text-sm truncate">
                            {lvl.name}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono">
                            by {lvl.creatorName}
                          </span>
                        </div>
                        {lvl.description && (
                          <div className="text-xs text-slate-400 mt-1 line-clamp-2">
                            {lvl.description}
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] font-mono text-slate-500">
                          <span>Waves: {lvl.waves?.length ?? 0}</span>
                          <span>Par: {lvl.parTimeSeconds ?? 0}s</span>
                          <span>Bonus: {lvl.clearBonusPoints ?? 0}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isOwner && (
                          <>
                            <button
                              onClick={() => {
                                setCreatingCommunityLevel(false);
                                setEditingCommunityLevel(lvl);
                              }}
                              title="Edit Level"
                              className="p-2 rounded-lg bg-cyber-panel border border-cyber-border hover:border-cyan-400/50 text-cyan-300 transition"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteCommunityLevel(lvl)}
                              disabled={deletingCommunityId === lvl.id}
                              title="Delete Level"
                              className="p-2 rounded-lg bg-cyber-panel border border-cyber-border hover:border-red-400/50 text-red-400 disabled:opacity-40 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => {
                            setShowCommunityModal(false);
                            onPlayCommunityLevel(lvl.id);
                          }}
                          className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-display font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition"
                        >
                          <Play className="w-3.5 h-3.5 fill-black" /> Play
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {(creatingCommunityLevel || editingCommunityLevel) && (
        <CommunityLevelEditor
          creatorName={playerName.trim()}
          initialLevel={editingCommunityLevel}
          onSaved={(saved) => {
            setCommunityLevels((prev) => {
              const exists = prev.some((item) => item.id === saved.id);
              if (exists) {
                return prev.map((item) => (item.id === saved.id ? saved : item));
              }
              return [saved, ...prev];
            });
            setCreatingCommunityLevel(false);
            setEditingCommunityLevel(null);
          }}
          onCancel={() => {
            setCreatingCommunityLevel(false);
            setEditingCommunityLevel(null);
          }}
        />
      )}
    </div>
  );
};
