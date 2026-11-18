import React, { useState } from 'react';
import { Play, Users, Trophy, Flag, Lock, CheckCircle2, X } from 'lucide-react';
import type { CampaignLevelConfig } from '../../../shared/types';
import { getCampaignProgress } from '../utils/campaignProgress';

import { Globe, Plus, Pencil, Trash2, Sparkles, Loader2 } from 'lucide-react';
import type { AiDifficultyTier, CommunityLevelConfig } from '../../../shared/types';
import { CommunityLevelEditor } from './CommunityLevelEditor';

interface LobbyProps {
  playerName: string;
  setPlayerName: (name: string) => void;
  onCreateRoom: (solo?: boolean) => void;
  onPlayCampaign: (levelNumber: number) => void;
  onPlayCommunityLevel: (communityLevelId: string) => void;
  onPlayAiLevel: (level: CampaignLevelConfig) => void;
  onJoinRoom: (roomCode: string) => void;
  onOpenLeaderboard: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  playerName,
  setPlayerName,
  onCreateRoom,
  onPlayCampaign,
  onPlayCommunityLevel,
  onPlayAiLevel,
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

  const [showAiModal, setShowAiModal] = React.useState(false);
  const [aiDifficulty, setAiDifficulty] = React.useState<AiDifficultyTier>('medium');
  const [aiModels, setAiModels] = React.useState<Array<{ name: string; sizeGb: string; available: boolean }>>([]);
  const [aiModel, setAiModel] = React.useState<string>('qwen3.5:9b');
  const [aiLoadingModels, setAiLoadingModels] = React.useState(false);
  const [aiGenerating, setAiGenerating] = React.useState(false);
  const [aiElapsed, setAiElapsed] = React.useState(0);
  const [aiError, setAiError] = React.useState<string | null>(null);
  const aiAbortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!aiGenerating) {
      setAiElapsed(0);
      return;
    }
    const start = performance.now();
    const id = window.setInterval(() => {
      setAiElapsed((performance.now() - start) / 1000);
    }, 100);
    return () => window.clearInterval(id);
  }, [aiGenerating]);

  const openAiGenerator = async () => {
    setShowAiModal(true);
    setAiError(null);
    setAiLoadingModels(true);
    try {
      const res = await fetch('/api/ai-models');
      const data = await res.json();
      if (Array.isArray(data.models) && data.models.length > 0) {
        setAiModels(data.models);
        if (!data.models.some((m: any) => m.name === aiModel)) {
          setAiModel(data.models[0].name);
        }
      }
    } catch {
      // keep default fallback
    } finally {
      setAiLoadingModels(false);
    }
  };

  const handleCancelAiGeneration = () => {
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
      aiAbortRef.current = null;
    }
    setAiGenerating(false);
  };

  const handleGenerateAiLevel = async () => {
    if (!aiModel || aiGenerating) return;
    setAiError(null);
    setAiGenerating(true);
    const controller = new AbortController();
    aiAbortRef.current = controller;
    try {
      const res = await fetch('/api/generate-ai-level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ difficulty: aiDifficulty, model: aiModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate AI level');
      if (!data.level) throw new Error('Invalid AI level response');
      setShowAiModal(false);
      onPlayAiLevel(data.level);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return;
      }
      setAiError(err?.message || 'Failed to generate AI level');
    } finally {
      aiAbortRef.current = null;
      setAiGenerating(false);
    }
  };

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
            onClick={openAiGenerator}
            disabled={!hasPilotName}
            className="w-full py-3 px-4 bg-cyber-panel hover:bg-[#1a1f30] disabled:opacity-40 disabled:pointer-events-none border border-violet-500/45 text-violet-300 font-display font-semibold rounded-lg flex items-center justify-center gap-2 text-sm tracking-wider uppercase transition active:scale-[0.98]"
          >
            <Sparkles className="w-4 h-4" /> Generate AI Level
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
                            <span>{gIdx + 1}. {grp.storyName}</span>
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
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] font-mono text-emerald-400/80">
                          <span>Player Clears: {lvl.clearsCount ?? 0}</span>
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

      {/* Generate AI Level Modal & Loading Screen */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-lg bg-cyber-panel border border-violet-500/45 rounded-xl p-6 shadow-2xl flex flex-col gap-5">
            {aiGenerating ? (
              <div className="relative py-8 flex flex-col items-center text-center gap-4">
                <button
                  type="button"
                  onClick={handleCancelAiGeneration}
                  title="Cancel generation"
                  className="absolute top-0 right-0 px-2.5 py-1.5 rounded-lg bg-cyber-bg border border-cyber-border text-slate-300 hover:text-white hover:border-rose-400/60 text-xs font-mono transition"
                >
                  ✕
                </button>
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-2 border-violet-500/30 flex items-center justify-center bg-violet-500/10">
                    <Loader2 className="w-8 h-8 text-violet-300 animate-spin" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-black font-display tracking-wide text-white uppercase">
                    Generating AI Level
                  </h3>
                  <p className="text-xs font-mono text-violet-300 mt-1">
                    {aiModel} &bull; {aiDifficulty.toUpperCase()} TIER &bull; {aiElapsed.toFixed(1)}s
                  </p>
                </div>
                <div className="text-xs text-slate-300 max-w-sm">
                  {aiElapsed < 2.5
                    ? 'Sending level design prompt to local AI on Mac mini...'
                    : aiElapsed < 6
                    ? 'Choreographing obstacle waves and directional flow...'
                    : 'Validating gate order and verifying level completability...'}
                </div>
                <button
                  type="button"
                  onClick={handleCancelAiGeneration}
                  className="mt-1 px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/50 text-slate-300 hover:text-rose-200 text-xs font-mono uppercase tracking-wider transition"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-cyber-border pb-3">
                  <div>
                    <h2 className="text-xl font-black font-display tracking-wide text-violet-300 uppercase flex items-center gap-2">
                      <Sparkles className="w-5 h-5" /> Generate AI Level
                    </h2>
                    <p className="text-xs text-slate-400">
                      Choose a difficulty tier and local AI model to build a playable custom level.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAiModal(false)}
                    className="px-2.5 py-1.5 rounded-lg bg-cyber-bg border border-cyber-border text-slate-300 hover:text-white text-xs font-mono"
                  >
                    ✕
                  </button>
                </div>

                {aiError && (
                  <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/45 text-rose-200 text-xs font-mono">
                    {aiError}
                  </div>
                )}

                {/* Difficulty Tier */}
                <div className="space-y-2">
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-400">
                    Difficulty Tier
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'easy', label: 'Easy', desc: '7–9 waves • Steady' },
                        { id: 'medium', label: 'Medium', desc: '10–13 waves • Multi-axis' },
                        { id: 'hard', label: 'Hard', desc: '14–18 waves • Tight maze' },
                      ] as const
                    ).map((tier) => {
                      const active = aiDifficulty === tier.id;
                      return (
                        <button
                          key={tier.id}
                          type="button"
                          onClick={() => setAiDifficulty(tier.id)}
                          className={`p-3 rounded-lg border text-left transition ${
                            active
                              ? 'bg-violet-500/20 border-violet-400 text-white'
                              : 'bg-cyber-bg/70 border-cyber-border text-slate-300 hover:border-violet-500/40'
                          }`}
                        >
                          <div className="font-display font-bold text-sm uppercase">{tier.label}</div>
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">{tier.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* AI Model Selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-400">
                    AI Model (Mac mini Ollama)
                  </label>
                  {aiLoadingModels ? (
                    <div className="text-xs font-mono text-slate-400 py-2">Loading installed models...</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {aiModels.map((m) => {
                        const active = aiModel === m.name;
                        return (
                          <button
                            key={m.name}
                            type="button"
                            onClick={() => setAiModel(m.name)}
                            className={`px-3.5 py-2.5 rounded-lg border flex items-center justify-between text-left transition ${
                              active
                                ? 'bg-cyan-500/15 border-cyan-400 text-cyan-100'
                                : 'bg-cyber-bg/70 border-cyber-border text-slate-300 hover:border-cyan-500/40'
                            }`}
                          >
                            <span className="font-mono font-bold text-xs">{m.name}</span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {m.sizeGb || 'Local Model'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleGenerateAiLevel}
                  disabled={!aiModel || aiLoadingModels}
                  className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 hover:from-violet-400 hover:to-cyan-400 disabled:opacity-40 text-black font-display font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition"
                >
                  <Sparkles className="w-4 h-4 fill-black" /> Generate &amp; Play
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
