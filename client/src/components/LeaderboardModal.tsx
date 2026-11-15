import React, { useEffect, useState } from 'react';
import type { LeaderboardEntry } from '../../../shared/types';
import { Trophy, X, Shield, Clock } from 'lucide-react';
import { SERVER_URL } from '../utils/api';

interface LeaderboardModalProps {
  onClose: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ onClose }) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/leaderboard`)
      .then((res) => res.json())
      .then((data) => {
        setEntries(data);
        setLoading(false);
      })
      .catch((err) => {
        console.warn('Leaderboard fetch failed:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-lg bg-cyber-panel border border-cyber-border rounded-xl p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-cyber-border">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <h3 className="font-display font-bold text-lg text-white">Global Pilot Leaderboard</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="min-h-48 max-h-80 overflow-y-auto pr-1">
          {loading ? (
            <div className="py-12 text-center text-xs font-mono text-gray-500 animate-pulse">
              Syncing with PostgreSQL database...
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-xs font-mono text-gray-500">
              No flight logs recorded yet. Be the first to survive!
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((entry, idx) => (
                <div
                  key={entry.id || idx}
                  className="flex items-center justify-between px-3.5 py-2.5 bg-[#090b12] border border-cyber-border/60 rounded-lg text-xs font-mono"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-5 font-bold text-center ${
                      idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-amber-600' : 'text-gray-500'
                    }`}>
                      #{idx + 1}
                    </span>
                    <span className="font-semibold text-gray-200">{entry.username}</span>
                  </div>

                  <div className="flex items-center gap-3 text-gray-400">
                    <span className="flex items-center gap-1 text-pink-400">
                      <Shield className="w-3 h-3" /> Lv.{entry.highestTier}
                    </span>
                    <span className="flex items-center gap-1 text-gray-300">
                      <Clock className="w-3 h-3 text-gray-400" /> {entry.bestSurvivalTime}s
                    </span>
                    <span className="text-cyan-300 font-bold">
                      {entry.bestScore ?? 0} PTS
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 bg-cyber-dark hover:bg-cyber-panel border border-cyber-border rounded-lg text-xs font-mono text-gray-300 transition"
        >
          Close
        </button>
      </div>
    </div>
  );
};
