export interface CampaignLevelRecord {
  bestScore: number;
  bestTimeSeconds: number | null;
  clearedAt: number;
}

export interface CampaignProgress {
  highestUnlockedLevel: number;
  completedLevels: Record<number, CampaignLevelRecord>;
}

const STORAGE_PREFIX = 'precision_path_campaign_v1_';

function storageKey(playerName: string): string {
  const normalized = (playerName || 'guest').trim().toLowerCase() || 'guest';
  return `${STORAGE_PREFIX}${normalized}`;
}

export function getCampaignProgress(playerName: string): CampaignProgress {
  try {
    const raw = localStorage.getItem(storageKey(playerName));
    if (!raw) {
      return { highestUnlockedLevel: 1, completedLevels: {} };
    }
    const parsed = JSON.parse(raw);
    return {
      highestUnlockedLevel: Math.max(1, Number(parsed.highestUnlockedLevel || 1)),
      completedLevels: parsed.completedLevels && typeof parsed.completedLevels === 'object' ? parsed.completedLevels : {},
    };
  } catch {
    return { highestUnlockedLevel: 1, completedLevels: {} };
  }
}

export function markCampaignLevelCleared(
  playerName: string,
  levelNumber: number,
  score: number,
  timeSeconds?: number | null
): CampaignProgress {
  const current = getCampaignProgress(playerName);
  const prev = current.completedLevels[levelNumber];
  const nextBestScore = prev ? Math.max(prev.bestScore, score) : score;
  const nextBestTime =
    typeof timeSeconds === 'number'
      ? prev && typeof prev.bestTimeSeconds === 'number'
        ? Math.min(prev.bestTimeSeconds, timeSeconds)
        : timeSeconds
      : prev?.bestTimeSeconds ?? null;

  const updated: CampaignProgress = {
    highestUnlockedLevel: Math.max(current.highestUnlockedLevel, levelNumber + 1),
    completedLevels: {
      ...current.completedLevels,
      [levelNumber]: {
        bestScore: nextBestScore,
        bestTimeSeconds: nextBestTime,
        clearedAt: Date.now(),
      },
    },
  };

  try {
    localStorage.setItem(storageKey(playerName), JSON.stringify(updated));
  } catch {
    // ignore storage quota errors
  }

  return updated;
}
