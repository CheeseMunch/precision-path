import type {
  CampaignPatternType,
  CampaignWaveGateSpec,
  CampaignWaveSpec,
} from './types';

export const EDITOR_ARENA_W = 450;
export const EDITOR_ARENA_H = 800;
export const EDITOR_HALF_W = EDITOR_ARENA_W / 2;
export const EDITOR_HALF_H = EDITOR_ARENA_H / 2;
export const EDITOR_SPAWN_OFFSET = 18;
export const EDITOR_PLAYER_RADIUS = 13;
export const EDITOR_HITBOX_RADIUS = 6.5;

export const EDITOR_DIR_COLORS: Record<'north' | 'south' | 'east' | 'west', string> = {
  north: '#ff2a6d',
  south: '#ff7700',
  east: '#d300c5',
  west: '#05d5fa',
};

export const EDITOR_PATTERN_OPTIONS: Array<{ value: CampaignPatternType; label: string }> = [
  { value: 'single-gap-wall', label: 'Single-Gap Wall' },
  { value: 'double-gap-wall', label: 'Double-Gap Wall' },
  { value: 'sweeping-half-wall', label: 'Sweeping Half Wall' },
  { value: 'staggered-blocks', label: 'Staggered Blocks' },
  { value: 'orb-cluster', label: 'Orb Cluster' },
  { value: 'diagonal-spinner', label: 'Diagonal Spinner' },
];

export interface WaveScheduleItem {
  wave: CampaignWaveSpec;
  spawnAt: number;
  duration: number;
}

export interface WaveRectGeom {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}

export interface WaveCircleGeom {
  x: number;
  y: number;
  r: number;
}

export interface WaveGapGeom {
  start: number;
  end: number;
}

export interface WaveGeometry {
  isVert: boolean;
  coord: number;
  gaps: WaveGapGeom[];
  rects: WaveRectGeom[];
  circles: WaveCircleGeom[];
  color: string;
}

export function getOrderedWaves(waves: CampaignWaveSpec[] | undefined): CampaignWaveSpec[] {
  return (waves || []).slice().sort((a, b) => a.order - b.order);
}

export function computeWaveSchedule(waves: CampaignWaveSpec[] | undefined): {
  items: WaveScheduleItem[];
  totalDuration: number;
} {
  const ordered = getOrderedWaves(waves);
  let acc = 0;
  let maxEnd = 2;
  const items: WaveScheduleItem[] = ordered.map((w) => {
    acc += Math.max(0, Number(w.delayAfterPrev || 0));
    const isVert = w.side === 'north' || w.side === 'south';
    const halfBound = isVert ? EDITOR_HALF_H : EDITOR_HALF_W;
    const travelDist = (halfBound + EDITOR_SPAWN_OFFSET) * 2 + 40;
    const dur = travelDist / Math.max(40, Number(w.speed || 175));
    maxEnd = Math.max(maxEnd, acc + dur);
    return { wave: w, spawnAt: acc, duration: dur };
  });
  return { items, totalDuration: Math.ceil(maxEnd * 10) / 10 };
}

export function computeWaveGeometry(w: CampaignWaveSpec, tSinceSpawn: number): WaveGeometry {
  const isVert = w.side === 'north' || w.side === 'south';
  const latHalf = isVert ? EDITOR_HALF_W : EDITOR_HALF_H;
  const halfBound = isVert ? EDITOR_HALF_H : EDITOR_HALF_W;
  const spawnDist = halfBound + EDITOR_SPAWN_OFFSET;
  const travelSign = w.side === 'north' || w.side === 'west' ? 1 : -1;
  const startCoord = -travelSign * spawnDist;
  const speed = Math.max(40, Number(w.speed || 175));
  const coord = startCoord + travelSign * speed * tSinceSpawn;

  const gapSize = Math.max(60, Number(w.gapSize || 120));
  const gapCenter = Number(w.gapCenter || 0);
  const thickness = Number(w.barThickness || 18);
  const color = w.color || EDITOR_DIR_COLORS[w.side] || '#ff2a6d';

  let gaps: WaveGapGeom[] = [];
  const rects: WaveRectGeom[] = [];
  const circles: WaveCircleGeom[] = [];

  if (w.patternType === 'single-gap-wall') {
    gaps = [
      {
        start: Math.max(-latHalf, gapCenter - gapSize / 2),
        end: Math.min(latHalf, gapCenter + gapSize / 2),
      },
    ];
  } else if (w.patternType === 'double-gap-wall') {
    const island = 56;
    const sideGap = Math.max(76, gapSize * 0.95);
    const secondCenter =
      gapCenter <= 0 ? gapCenter + sideGap + island : gapCenter - (sideGap + island);
    gaps = [
      { start: gapCenter - sideGap / 2, end: gapCenter + sideGap / 2 },
      { start: secondCenter - sideGap / 2, end: secondCenter + sideGap / 2 },
    ];
  } else if (w.patternType === 'sweeping-half-wall') {
    const openPos = gapCenter >= 0;
    gaps = [
      {
        start: openPos ? gapCenter - gapSize / 2 : -latHalf,
        end: openPos ? latHalf : gapCenter + gapSize / 2,
      },
    ];
  } else if (w.patternType === 'staggered-blocks') {
    const cg = Math.max(84, gapSize);
    const outer = 54;
    gaps = [
      { start: -latHalf, end: -latHalf + outer },
      { start: gapCenter - cg / 2, end: gapCenter + cg / 2 },
      { start: latHalf - outer, end: latHalf },
    ];
  } else if (w.patternType === 'orb-cluster') {
    const orbR = 12;
    const count = isVert ? 4 : 5;
    const usable = latHalf - 28;
    const orbs: number[] = [];
    for (let i = 0; i < count; i++) {
      const lat = -usable + (i / (count - 1)) * (usable * 2);
      if (Math.abs(lat - gapCenter) < gapSize * 0.6 + orbR) continue;
      orbs.push(lat);
      circles.push({ x: isVert ? lat : coord, y: isVert ? coord : lat, r: orbR });
    }
    let cur = -latHalf;
    for (const lat of orbs.sort((a, b) => a - b)) {
      if (lat - orbR - cur >= 24) gaps.push({ start: Math.round(cur), end: Math.round(lat - orbR) });
      cur = lat + orbR;
    }
    if (latHalf - cur >= 24) gaps.push({ start: Math.round(cur), end: latHalf });
  } else if (w.patternType === 'diagonal-spinner') {
    const len = 152;
    const driftSign = gapCenter >= 0 ? -1 : 1;
    const drift = speed * 0.45 * driftSign;
    const latPos = gapCenter + drift * tSinceSpawn;
    rects.push({
      x: isVert ? latPos : coord,
      y: isVert ? coord : latPos,
      w: isVert ? len : 16,
      h: isVert ? 16 : len,
      rot: 0.4 + 2.0 * tSinceSpawn,
    });
    const br = len / 2 + 12;
    if (latPos - br > -latHalf + 24) gaps.push({ start: -latHalf, end: Math.round(latPos - br) });
    if (latPos + br < latHalf - 24) gaps.push({ start: Math.round(latPos + br), end: latHalf });
  }

  if (w.patternType !== 'orb-cluster' && w.patternType !== 'diagonal-spinner') {
    const sortedGaps = gaps
      .map((g) => [Math.max(-latHalf, g.start), Math.min(latHalf, g.end)])
      .sort((a, b) => a[0] - b[0]);
    let cursor = -latHalf;
    const cleanGaps: WaveGapGeom[] = [];
    for (const [gs, ge] of sortedGaps) {
      if (gs > cursor + 2) {
        const segLen = gs - cursor;
        const segMid = (cursor + gs) / 2;
        rects.push({
          x: isVert ? segMid : coord,
          y: isVert ? coord : segMid,
          w: isVert ? segLen : thickness,
          h: isVert ? thickness : segLen,
          rot: 0,
        });
      }
      if (ge - gs >= 16) cleanGaps.push({ start: Math.round(gs), end: Math.round(ge) });
      cursor = Math.max(cursor, ge);
    }
    if (latHalf > cursor + 2) {
      const segLen = latHalf - cursor;
      const segMid = (cursor + latHalf) / 2;
      rects.push({
        x: isVert ? segMid : coord,
        y: isVert ? coord : segMid,
        w: isVert ? segLen : thickness,
        h: isVert ? thickness : segLen,
        rot: 0,
      });
    }
    gaps = cleanGaps;
  }

  return { isVert, coord, gaps, rects, circles, color };
}

export function nextGateOrder(waves: CampaignWaveSpec[] | undefined): number {
  let maxOrd = 0;
  for (const w of waves || []) {
    for (const g of w.attachedGates || []) {
      if (Number(g.order) > maxOrd) maxOrd = Number(g.order);
    }
  }
  return maxOrd + 1;
}

export function computeJumpToWaveTime(item: WaveScheduleItem): number {
  const w = item.wave;
  const isVert = w.side === 'north' || w.side === 'south';
  const halfBound = isVert ? EDITOR_HALF_H : EDITOR_HALF_W;
  const centerOffset = (halfBound + EDITOR_SPAWN_OFFSET) / Math.max(40, Number(w.speed || 175));
  return item.spawnAt + centerOffset;
}

export function cloneWavesForInsert(
  sourceWaves: CampaignWaveSpec[],
  startOrder: number,
  nextGateOrdStart: number
): CampaignWaveSpec[] {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  let gOrd = nextGateOrdStart;
  return (sourceWaves || [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((w, idx) => {
      const cloned: CampaignWaveSpec = JSON.parse(JSON.stringify(w));
      cloned.id = `wave-${stamp}-${idx}`;
      cloned.order = startOrder + idx;
      delete cloned.patternGroupId;
      delete cloned.patternGroupName;
      cloned.attachedGates = (cloned.attachedGates || []).map((g: CampaignWaveGateSpec, gIdx: number) => ({
        ...g,
        id: `gate-${stamp}-${idx}-${gIdx}`,
        order: gOrd,
        label: `GATE ${gOrd++}`,
      }));
      return cloned;
    });
}

export function findHoveredWaveOpening(
  waves: CampaignWaveSpec[] | undefined,
  simTime: number,
  x: number,
  y: number
): { waveId: string; start: number; end: number } | null {
  const { items } = computeWaveSchedule(waves);
  for (const item of items) {
    const tSince = simTime - item.spawnAt;
    if (tSince < 0 || tSince > item.duration) continue;
    const w = item.wave;
    const geom = computeWaveGeometry(w, tSince);
    const coordDiff = Math.abs((geom.isVert ? y : x) - geom.coord);
    if (coordDiff <= 18) {
      const perp = geom.isVert ? x : y;
      const op = geom.gaps.find((g) => perp >= g.start && perp <= g.end);
      if (op) {
        return { waveId: w.id, start: op.start, end: op.end };
      }
    }
  }
  return null;
}

export function checkDummyHit(
  waves: CampaignWaveSpec[] | undefined,
  simTime: number,
  dummyPos: { x: number; y: number }
): boolean {
  const { items } = computeWaveSchedule(waves);
  for (const item of items) {
    const tSince = simTime - item.spawnAt;
    if (tSince < 0 || tSince > item.duration) continue;
    const geom = computeWaveGeometry(item.wave, tSince);
    for (const r of geom.rects) {
      const hw = r.w / 2;
      const hh = r.h / 2;
      let px = dummyPos.x - r.x;
      let py = dummyPos.y - r.y;
      if (r.rot) {
        const cos = Math.cos(-r.rot);
        const sin = Math.sin(-r.rot);
        const rx = px * cos - py * sin;
        const ry = px * sin + py * cos;
        px = rx;
        py = ry;
      }
      const cx = Math.max(-hw, Math.min(px, hw));
      const cy = Math.max(-hh, Math.min(py, hh));
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy < EDITOR_HITBOX_RADIUS * EDITOR_HITBOX_RADIUS) {
        return true;
      }
    }
    for (const c of geom.circles) {
      if (Math.hypot(dummyPos.x - c.x, dummyPos.y - c.y) < EDITOR_HITBOX_RADIUS + c.r) {
        return true;
      }
    }
  }
  return false;
}
