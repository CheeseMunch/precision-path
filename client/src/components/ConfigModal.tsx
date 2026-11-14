import React, { useEffect, useState } from 'react';
import { Sliders, X, Check } from 'lucide-react';
import type { ObstaclePatternType } from '../../../shared/gameConfig';
import { SERVER_URL } from '../utils/api';

interface ConfigModalProps {
  onClose: () => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({ onClose }) => {
  const [config, setConfig] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/config`)
      .then((res) => res.json())
      .then((data) => setConfig(data))
      .catch((err) => console.warn('Failed to fetch config:', err));
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const updated = await res.json();
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setSaving(false);
    }
  };

  const setAllRoundDurations = (seconds: number) => {
    setConfig((prev: any) => ({
      ...prev,
      rounds: {
        ...prev.rounds,
        defaultRoundDurationSeconds: seconds,
        tierDurations: {
          1: seconds,
          2: seconds,
          3: seconds,
          4: seconds,
        },
      },
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-xl bg-cyber-panel border border-cyber-border rounded-xl p-6 shadow-2xl flex flex-col gap-4 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-cyber-border">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h3 className="font-display font-bold text-lg text-white">
              Game Config & Procedural Randomness
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!config ? (
          <div className="py-12 text-center text-xs font-mono text-gray-500 animate-pulse">
            Loading configuration from server...
          </div>
        ) : (
          <div className="flex flex-col gap-5 text-xs font-mono">
            {/* 1. Round Durations */}
            <div className="bg-[#090b12] border border-cyber-border/60 rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-cyan-400 font-bold uppercase">
                  Round Duration (Time Between Rounds)
                </span>
                <span className="text-white font-bold">
                  {config.rounds.tierDurations[1]}s per round
                </span>
              </div>
              <input
                type="range"
                min={3}
                max={30}
                step={1}
                value={config.rounds.tierDurations[1]}
                onChange={(e) => setAllRoundDurations(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
              <p className="text-[11px] text-gray-400">
                Time to navigate through each round's obstacles before advancing to the next directional round (default: 7s).
              </p>
            </div>

            {/* 2. Procedural Randomness Sliders */}
            <div className="bg-[#090b12] border border-cyber-border/60 rounded-lg p-4 flex flex-col gap-3">
              <div className="text-cyan-400 font-bold uppercase">Procedural Randomness Tuning</div>

              <div>
                <div className="flex justify-between text-gray-300 mb-1">
                  <span>Gap Position Spread</span>
                  <span>{Math.round(config.randomness.gapPositionVariance * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.85}
                  step={0.02}
                  value={config.randomness.gapPositionVariance}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      randomness: {
                        ...config.randomness,
                        gapPositionVariance: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-gray-300 mb-1">
                  <span>Gap Width Variance</span>
                  <span>±{Math.round(config.randomness.gapSizeVariance * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.45}
                  step={0.02}
                  value={config.randomness.gapSizeVariance}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      randomness: {
                        ...config.randomness,
                        gapSizeVariance: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-gray-300 mb-1">
                  <span>Wave Speed Variance</span>
                  <span>±{Math.round(config.randomness.speedVariance * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.4}
                  step={0.02}
                  value={config.randomness.speedVariance}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      randomness: {
                        ...config.randomness,
                        speedVariance: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-gray-300 mb-1">
                  <span>Wave Timing Jitter</span>
                  <span>±{Math.round(config.randomness.waveIntervalJitter * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.35}
                  step={0.02}
                  value={config.randomness.waveIntervalJitter}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      randomness: {
                        ...config.randomness,
                        waveIntervalJitter: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>

            {/* 3. Procedural Obstacle Archetypes */}
            <div className="bg-[#090b12] border border-cyber-border/60 rounded-lg p-4 flex flex-col gap-2.5">
              <div className="text-cyan-400 font-bold uppercase mb-1">
                Allowed Procedural Obstacle Types & Weights
              </div>
              {(Object.keys(config.obstacleTypes) as ObstaclePatternType[]).map((key) => {
                const item = config.obstacleTypes[key];
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 py-1.5 border-b border-cyber-border/30 last:border-0"
                  >
                    <label className="flex items-center gap-2 cursor-pointer text-gray-200">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            obstacleTypes: {
                              ...config.obstacleTypes,
                              [key]: { ...item, enabled: e.target.checked },
                            },
                          })
                        }
                        className="accent-cyan-400"
                      />
                      <span>{item.label}</span>
                      <span className="text-[10px] text-gray-500">(Round {item.minTier}+)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400">Weight: {item.weight}</span>
                      <input
                        type="range"
                        min={5}
                        max={80}
                        step={5}
                        disabled={!item.enabled}
                        value={item.weight}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            obstacleTypes: {
                              ...config.obstacleTypes,
                              [key]: { ...item, weight: Number(e.target.value) },
                            },
                          })
                        }
                        className="w-20 accent-cyan-400"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold font-display rounded-lg flex items-center justify-center gap-2 uppercase transition"
              >
                {saved ? (
                  <>
                    <Check className="w-4 h-4" /> Applied!
                  </>
                ) : (
                  'Apply Live Settings'
                )}
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-cyber-dark hover:bg-cyber-panel border border-cyber-border rounded-lg text-gray-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
