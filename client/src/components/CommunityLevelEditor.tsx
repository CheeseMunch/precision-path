import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Plus, Trash2, ArrowUp, ArrowDown, Copy, Save, X } from 'lucide-react';
import type {
  CampaignLevelConfig,
  CampaignPatternType,
  CampaignWaveSpec,
  CommunityLevelConfig,
} from '../../../shared/types';

interface CommunityLevelEditorProps {
  creatorName: string;
  initialLevel?: CommunityLevelConfig | null;
  onSaved: (level: CommunityLevelConfig) => void;
  onCancel: () => void;
}

const ARENA_W = 450;
const ARENA_H = 800;
const HALF_W = ARENA_W / 2;
const HALF_H = ARENA_H / 2;
const SPAWN_OFFSET = 18;
const PLAYER_RADIUS = 13;
const HITBOX_RADIUS = 6.5;

const DIR_COLORS: Record<'north' | 'south' | 'east' | 'west', string> = {
  north: '#ff2a6d',
  south: '#ff7700',
  east: '#d300c5',
  west: '#05d5fa',
};

const PATTERN_OPTIONS: Array<{ value: CampaignPatternType; label: string }> = [
  { value: 'single-gap-wall', label: 'Single-Gap Wall' },
  { value: 'double-gap-wall', label: 'Double-Gap Wall' },
  { value: 'sweeping-half-wall', label: 'Sweeping Half Wall' },
  { value: 'staggered-blocks', label: 'Staggered Blocks' },
  { value: 'orb-cluster', label: 'Orb Cluster' },
  { value: 'diagonal-spinner', label: 'Diagonal Spinner' },
];

function getOrderedWaves(lvl: CampaignLevelConfig) {
  return [...(lvl.waves || [])].sort((a, b) => a.order - b.order);
}

function computeWaveSchedule(lvl: CampaignLevelConfig) {
  const waves = getOrderedWaves(lvl);
  let acc = 0;
  let maxEnd = 2;
  const items = waves.map((w) => {
    acc += Math.max(0, Number(w.delayAfterPrev || 0));
    const isVert = w.side === 'north' || w.side === 'south';
    const halfBound = isVert ? HALF_H : HALF_W;
    const travelDist = (halfBound + SPAWN_OFFSET) * 2 + 40;
    const dur = travelDist / Math.max(40, Number(w.speed || 175));
    maxEnd = Math.max(maxEnd, acc + dur);
    return { wave: w, spawnAt: acc, duration: dur };
  });
  return { items, totalDuration: Math.ceil(maxEnd * 10) / 10 };
}

function computeWaveGeometry(w: CampaignWaveSpec, tSinceSpawn: number) {
  const isVert = w.side === 'north' || w.side === 'south';
  const latHalf = isVert ? HALF_W : HALF_H;
  const halfBound = isVert ? HALF_H : HALF_W;
  const spawnDist = halfBound + SPAWN_OFFSET;
  const travelSign = w.side === 'north' || w.side === 'west' ? 1 : -1;
  const startCoord = -travelSign * spawnDist;
  const speed = Math.max(40, Number(w.speed || 175));
  const coord = startCoord + travelSign * speed * tSinceSpawn;

  const gapSize = Math.max(60, Number(w.gapSize || 120));
  const gapCenter = Number(w.gapCenter || 0);
  const thickness = Number(w.barThickness || 18);
  const color = w.color || DIR_COLORS[w.side] || '#ff2a6d';

  const gaps: Array<{ start: number; end: number }> = [];
  const rects: Array<{ x: number; y: number; w: number; h: number; rot: number; isOrb?: boolean; isSpinner?: boolean }> = [];

  if (w.patternType === 'single-gap-wall') {
    gaps.push({ start: Math.max(-latHalf, gapCenter - gapSize / 2), end: Math.min(latHalf, gapCenter + gapSize / 2) });
  } else if (w.patternType === 'double-gap-wall') {
    const islandW = 56;
    const sideGap = Math.max(76, gapSize * 0.95);
    const secondCenter = gapCenter <= 0 ? gapCenter + sideGap + islandW : gapCenter - (sideGap + islandW);
    gaps.push(
      { start: Math.max(-latHalf, gapCenter - sideGap / 2), end: Math.min(latHalf, gapCenter + sideGap / 2) },
      { start: Math.max(-latHalf, secondCenter - sideGap / 2), end: Math.min(latHalf, secondCenter + sideGap / 2) }
    );
  } else if (w.patternType === 'sweeping-half-wall') {
    const openPos = gapCenter >= 0;
    gaps.push({
      start: openPos ? Math.max(-latHalf, gapCenter - gapSize / 2) : -latHalf,
      end: openPos ? latHalf : Math.min(latHalf, gapCenter + gapSize / 2),
    });
  } else if (w.patternType === 'staggered-blocks') {
    const cGap = Math.max(84, gapSize);
    const outer = 54;
    gaps.push(
      { start: -latHalf, end: -latHalf + outer },
      { start: Math.max(-latHalf, gapCenter - cGap / 2), end: Math.min(latHalf, gapCenter + cGap / 2) },
      { start: latHalf - outer, end: latHalf }
    );
  } else if (w.patternType === 'orb-cluster') {
    const orbR = 12;
    const orbCount = isVert ? 4 : 5;
    const usableHalf = latHalf - 28;
    const orbs: number[] = [];
    for (let i = 0; i < orbCount; i++) {
      const orbLat = -usableHalf + (i / (orbCount - 1)) * (usableHalf * 2);
      if (Math.abs(orbLat - gapCenter) < gapSize * 0.6 + orbR) continue;
      orbs.push(orbLat);
      rects.push({
        x: isVert ? orbLat : coord,
        y: isVert ? coord : orbLat,
        w: orbR * 2,
        h: orbR * 2,
        rot: 0,
        isOrb: true,
      });
    }
    if (orbs.length > 0) {
      for (let i = 0; i < orbs.length - 1; i++) {
        const s = orbs[i] + orbR;
        const e = orbs[i + 1] - orbR;
        if (e - s >= 44) gaps.push({ start: s, end: e });
      }
    }
  } else if (w.patternType === 'diagonal-spinner') {
    const drift = speed * 0.45 * (gapCenter >= 0 ? -1 : 1);
    const lat = gapCenter + drift * tSinceSpawn;
    const cx = isVert ? lat : coord;
    const cy = isVert ? coord : lat;
    rects.push({ x: cx, y: cy, w: 152, h: 16, rot: 0.4 + 2.0 * tSinceSpawn, isSpinner: true });
    const s1 = Math.max(-latHalf, lat - 150);
    const e1 = Math.max(-latHalf, lat - 45);
    const s2 = Math.min(latHalf, lat + 45);
    const e2 = Math.min(latHalf, lat + 150);
    if (e1 - s1 >= 40) gaps.push({ start: s1, end: e1 });
    if (e2 - s2 >= 40) gaps.push({ start: s2, end: e2 });
  }

  const sortedGaps = [...gaps].sort((a, b) => a.start - b.start);
  if (w.patternType !== 'orb-cluster' && w.patternType !== 'diagonal-spinner') {
    let cursor = -latHalf;
    for (const g of sortedGaps) {
      if (g.start > cursor + 1) {
        const segLen = g.start - cursor;
        const mid = (cursor + g.start) / 2;
        rects.push({
          x: isVert ? mid : coord,
          y: isVert ? coord : mid,
          w: isVert ? segLen : thickness,
          h: isVert ? thickness : segLen,
          rot: 0,
        });
      }
      cursor = Math.max(cursor, g.end);
    }
    if (cursor < latHalf - 1) {
      const segLen = latHalf - cursor;
      const mid = (cursor + latHalf) / 2;
      rects.push({
        x: isVert ? mid : coord,
        y: isVert ? coord : mid,
        w: isVert ? segLen : thickness,
        h: isVert ? thickness : segLen,
        rot: 0,
      });
    }
  }

  return { isVert, coord, travelSign, gaps: sortedGaps, rects, color };
}

function makeDefaultLevel(creatorName: string, initial?: CommunityLevelConfig | null): CampaignLevelConfig {
  if (initial) {
    return JSON.parse(JSON.stringify(initial));
  }
  return {
    id: `comm-${Date.now()}`,
    levelNumber: 1,
    name: `${creatorName}'s Sector`,
    storyName: 'Community',
    description: '',
    spawn: { x: 0, y: 120 },
    clearBonusPoints: 500,
    parTimeSeconds: 20,
    waves: [
      {
        id: `cw-${Date.now()}`,
        order: 1,
        delayAfterPrev: 0.5,
        side: 'north',
        patternType: 'single-gap-wall',
        speed: 175,
        gapCenter: 0,
        gapSize: 125,
        barThickness: 18,
        color: '#ff2a6d',
        attachedGates: [
          {
            id: `cg-${Date.now()}`,
            order: 1,
            start: -62,
            end: 62,
            points: 100,
            label: 'GATE 1',
          },
        ],
      },
    ],
    obstacles: [],
    checkpoints: [],
  };
}

export const CommunityLevelEditor: React.FC<CommunityLevelEditorProps> = ({
  creatorName,
  initialLevel,
  onSaved,
  onCancel,
}) => {
  const [level, setLevel] = useState<CampaignLevelConfig>(() => makeDefaultLevel(creatorName, initialLevel));
  const [selectedWaveIdx, setSelectedWaveIdx] = useState(0);
  const [builderSide, setBuilderSide] = useState<'north' | 'south' | 'east' | 'west'>('north');
  const [builderPattern, setBuilderPattern] = useState<CampaignPatternType>('single-gap-wall');
  const [builderSpeed, setBuilderSpeed] = useState(175);
  const [builderDelay, setBuilderDelay] = useState(1.2);
  const [builderGapCenter, setBuilderGapCenter] = useState(0);
  const [builderGapSize, setBuilderGapSize] = useState(125);
  const [builderThickness, setBuilderThickness] = useState(18);

  const [simTime, setSimTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelRef = useRef(level);
  levelRef.current = level;
  const simTimeRef = useRef(simTime);
  simTimeRef.current = simTime;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const selectedWaveIdxRef = useRef(selectedWaveIdx);
  selectedWaveIdxRef.current = selectedWaveIdx;

  const dummyPosRef = useRef({ x: 0, y: 120 });
  const dragSpawnRef = useRef(false);
  const dragDummyRef = useRef(false);
  const hoverOpeningRef = useRef<{ waveIdx: number; start: number; end: number } | null>(null);

  const schedule = computeWaveSchedule(level);
  const orderedWaves = getOrderedWaves(level);
  const selectedWave = level.waves[selectedWaveIdx] || null;

  const nextGateOrder = () => {
    let maxOrd = 0;
    for (const w of levelRef.current.waves) {
      for (const g of w.attachedGates || []) {
        if (g.order > maxOrd) maxOrd = g.order;
      }
    }
    return maxOrd + 1;
  };

  useEffect(() => {
    let rafId = 0;
    let lastMs = performance.now();

    const draw = (nowMs: number) => {
      const dt = Math.min(0.05, Math.max(0, (nowMs - lastMs) / 1000));
      lastMs = nowMs;

      const cur = levelRef.current;
      const sched = computeWaveSchedule(cur);
      if (isPlayingRef.current) {
        let nextT = simTimeRef.current + dt;
        if (nextT > sched.totalDuration) nextT = 0;
        simTimeRef.current = nextT;
        setSimTime(nextT);
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const t = simTimeRef.current;
          ctx.clearRect(0, 0, ARENA_W, ARENA_H);
          ctx.fillStyle = '#060913';
          ctx.fillRect(0, 0, ARENA_W, ARENA_H);

          ctx.save();
          ctx.translate(HALF_W, HALF_H);

          // Grid
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.08)';
          ctx.lineWidth = 1;
          for (let x = -HALF_W; x <= HALF_W; x += 45) {
            ctx.beginPath();
            ctx.moveTo(x, -HALF_H);
            ctx.lineTo(x, HALF_H);
            ctx.stroke();
          }
          for (let y = -HALF_H; y <= HALF_H; y += 50) {
            ctx.beginPath();
            ctx.moveTo(-HALF_W, y);
            ctx.lineTo(HALF_W, y);
            ctx.stroke();
          }

          // Active waves
          let dummyHit = false;
          const dPos = dummyPosRef.current;
          const selWave = cur.waves && cur.waves[selectedWaveIdxRef.current];
          for (const item of sched.items) {
            if (t < item.spawnAt || t > item.spawnAt + item.duration) continue;
            const w = item.wave;
            const isSelWave = Boolean(selWave && w.id === selWave.id);
            const geom = computeWaveGeometry(w, t - item.spawnAt);

            ctx.save();
            ctx.globalAlpha = selWave ? (isSelWave ? 1.0 : 0.42) : 1.0;
            ctx.fillStyle = geom.color;
            ctx.shadowColor = isSelWave ? '#ffffff' : geom.color;
            ctx.shadowBlur = isSelWave ? 18 : 8;

            for (const r of geom.rects) {
              ctx.save();
              ctx.translate(r.x, r.y);
              if (r.rot) ctx.rotate(r.rot);
              if (r.isOrb) {
                ctx.beginPath();
                ctx.arc(0, 0, r.w / 2, 0, Math.PI * 2);
                ctx.fill();
                if (isSelWave) {
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth = 3;
                  ctx.stroke();
                } else {
                  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                  ctx.lineWidth = 1;
                  ctx.stroke();
                }
                if (Math.hypot(dPos.x - r.x, dPos.y - r.y) < HITBOX_RADIUS + r.w / 2) dummyHit = true;
              } else {
                ctx.beginPath();
                ctx.roundRect(-r.w / 2, -r.h / 2, r.w, r.h, 3);
                ctx.fill();
                if (isSelWave) {
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth = 3;
                  ctx.strokeRect(-r.w / 2 - 1, -r.h / 2 - 1, r.w + 2, r.h + 2);
                } else {
                  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                  ctx.lineWidth = 1;
                  ctx.stroke();
                }
                let px = dPos.x - r.x;
                let py = dPos.y - r.y;
                if (r.rot) {
                  const c = Math.cos(-r.rot);
                  const s = Math.sin(-r.rot);
                  const rx = px * c - py * s;
                  const ry = px * s + py * c;
                  px = rx;
                  py = ry;
                }
                const cx = Math.max(-r.w / 2, Math.min(px, r.w / 2));
                const cy = Math.max(-r.h / 2, Math.min(py, r.h));
                if (Math.hypot(px - cx, py - cy) < HITBOX_RADIUS) dummyHit = true;
              }
              ctx.restore();
            }

            if (isSelWave) {
              const anchor = geom.rects[0];
              if (anchor) {
                ctx.shadowBlur = 0;
                const lx = Math.max(-HALF_W + 42, Math.min(HALF_W - 42, anchor.x));
                const ly = anchor.y - 22;
                ctx.fillStyle = '#0f172a';
                ctx.strokeStyle = '#22d3ee';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.roundRect(lx - 34, ly - 10, 68, 18, 4);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`WAVE #${w.order}`, lx, ly - 1);
              }
            }
            ctx.restore();

            // Hover highlight on opening
            const hov = hoverOpeningRef.current;
            const origIdx = cur.waves.indexOf(item.wave);
            if (hov && hov.waveIdx === origIdx) {
              ctx.save();
              ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
              ctx.lineWidth = 5;
              ctx.setLineDash([6, 4]);
              ctx.beginPath();
              if (geom.isVert) {
                ctx.moveTo(hov.start, geom.coord);
                ctx.lineTo(hov.end, geom.coord);
              } else {
                ctx.moveTo(geom.coord, hov.start);
                ctx.lineTo(geom.coord, hov.end);
              }
              ctx.stroke();
              ctx.restore();
            }

            // Attached gates
            for (const g of item.wave.attachedGates || []) {
              const mid = (g.start + g.end) / 2;
              const x1 = geom.isVert ? g.start : geom.coord;
              const y1 = geom.isVert ? geom.coord : g.start;
              const x2 = geom.isVert ? g.end : geom.coord;
              const y2 = geom.isVert ? geom.coord : g.end;
              const mx = geom.isVert ? mid : geom.coord;
              const my = geom.isVert ? geom.coord : mid;

              ctx.save();
              ctx.strokeStyle = '#34d399';
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();

              ctx.fillStyle = '#065f46';
              ctx.strokeStyle = '#34d399';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(mx, my, 12, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();

              ctx.fillStyle = '#ffe600';
              ctx.font = 'bold 11px monospace';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(String(g.order), mx, my);
              ctx.restore();
            }
          }

          // Spawn marker
          ctx.save();
          ctx.fillStyle = 'rgba(34, 211, 238, 0.2)';
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cur.spawn.x, cur.spawn.y, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#22d3ee';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('SPAWN', cur.spawn.x, cur.spawn.y - 18);
          ctx.restore();

          // Dummy ball
          ctx.save();
          ctx.fillStyle = dummyHit ? '#ef4444' : '#00f0ff';
          ctx.beginPath();
          ctx.arc(dPos.x, dPos.y, PLAYER_RADIUS, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(dPos.x, dPos.y, HITBOX_RADIUS, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const getCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * ARENA_W - HALF_W,
      y: ((e.clientY - rect.top) / rect.height) * ARENA_H - HALF_H,
    };
  };

  const findHoveredOpening = (x: number, y: number) => {
    const sched = computeWaveSchedule(levelRef.current);
    const t = simTimeRef.current;
    for (const item of sched.items) {
      if (t < item.spawnAt || t > item.spawnAt + item.duration) continue;
      const geom = computeWaveGeometry(item.wave, t - item.spawnAt);
      const axisPos = geom.isVert ? y : x;
      const latPos = geom.isVert ? x : y;
      if (Math.abs(axisPos - geom.coord) <= 26) {
        for (const g of geom.gaps) {
          if (latPos >= g.start - 10 && latPos <= g.end + 10) {
            return {
              waveIdx: levelRef.current.waves.indexOf(item.wave),
              start: Math.round(g.start),
              end: Math.round(g.end),
            };
          }
        }
      }
    }
    return null;
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getCoords(e);
    if (Math.hypot(x - level.spawn.x, y - level.spawn.y) <= 18) {
      dragSpawnRef.current = true;
      return;
    }
    if (Math.hypot(x - dummyPosRef.current.x, y - dummyPosRef.current.y) <= 20) {
      dragDummyRef.current = true;
      return;
    }
    const hit = findHoveredOpening(x, y);
    if (hit && hit.waveIdx >= 0) {
      setLevel((prev) => {
        const next = { ...prev, waves: prev.waves.map((w) => ({ ...w, attachedGates: [...(w.attachedGates || [])] })) };
        const wave = next.waves[hit.waveIdx];
        if (!wave) return prev;
        const existIdx = wave.attachedGates.findIndex(
          (g) => Math.abs(g.start - hit.start) < 25 && Math.abs(g.end - hit.end) < 25
        );
        if (existIdx >= 0) {
          wave.attachedGates.splice(existIdx, 1);
        } else {
          const ord = nextGateOrder();
          wave.attachedGates.push({
            id: `cg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            order: ord,
            start: hit.start,
            end: hit.end,
            points: 100,
            label: `GATE ${ord}`,
          });
        }
        return next;
      });
      setSelectedWaveIdx(hit.waveIdx);
      return;
    }
    dummyPosRef.current = {
      x: Math.max(-HALF_W + PLAYER_RADIUS, Math.min(HALF_W - PLAYER_RADIUS, x)),
      y: Math.max(-HALF_H + PLAYER_RADIUS, Math.min(HALF_H - PLAYER_RADIUS, y)),
    };
    dragDummyRef.current = true;
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getCoords(e);
    if (dragDummyRef.current) {
      dummyPosRef.current = {
        x: Math.max(-HALF_W + PLAYER_RADIUS, Math.min(HALF_W - PLAYER_RADIUS, x)),
        y: Math.max(-HALF_H + PLAYER_RADIUS, Math.min(HALF_H - PLAYER_RADIUS, y)),
      };
      return;
    }
    if (dragSpawnRef.current) {
      setLevel((prev) => ({
        ...prev,
        spawn: {
          x: Math.max(-HALF_W + 15, Math.min(HALF_W - 15, Math.round(x / 10) * 10)),
          y: Math.max(-HALF_H + 15, Math.min(HALF_H - 15, Math.round(y / 10) * 10)),
        },
      }));
      return;
    }
    hoverOpeningRef.current = findHoveredOpening(x, y);
  };

  const handleCanvasPointerUp = () => {
    dragDummyRef.current = false;
    dragSpawnRef.current = false;
  };

  const jumpToWave = (waveId: string) => {
    const item = schedule.items.find((it) => it.wave.id === waveId);
    if (!item) return;
    const w = item.wave;
    const isVert = w.side === 'north' || w.side === 'south';
    const halfBound = isVert ? HALF_H : HALF_W;
    const centerOffset = (halfBound + SPAWN_OFFSET) / Math.max(40, Number(w.speed || 175));
    setIsPlaying(false);
    isPlayingRef.current = false;
    const jumpT = item.spawnAt + centerOffset;
    setSimTime(jumpT);
    simTimeRef.current = jumpT;
  };

  const addWave = () => {
    const nextOrder = level.waves.reduce((m, w) => Math.max(m, w.order), 0) + 1;
    const newWave: CampaignWaveSpec = {
      id: `cw-${Date.now()}`,
      order: nextOrder,
      delayAfterPrev: Math.max(0, builderDelay),
      side: builderSide,
      patternType: builderPattern,
      speed: Math.max(40, Math.min(600, builderSpeed)),
      gapCenter: builderGapCenter,
      gapSize: Math.max(60, builderGapSize),
      barThickness: Math.max(8, Math.min(48, builderThickness)),
      color: DIR_COLORS[builderSide],
      attachedGates: [],
    };
    setLevel((prev) => ({ ...prev, waves: [...prev.waves, newWave] }));
    setSelectedWaveIdx(level.waves.length);
  };

  const updateSelectedWave = (patch: Partial<CampaignWaveSpec>) => {
    if (!selectedWave) return;
    setLevel((prev) => ({
      ...prev,
      waves: prev.waves.map((w, idx) => (idx === selectedWaveIdx ? { ...w, ...patch } : w)),
    }));
  };

  const moveWave = (waveId: string, delta: number) => {
    const ordered = getOrderedWaves(level);
    const idx = ordered.findIndex((w) => w.id === waveId);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= ordered.length) return;
    const [moved] = ordered.splice(idx, 1);
    ordered.splice(target, 0, moved);
    const reordered = ordered.map((w, i) => ({ ...w, order: i + 1 }));
    setLevel((prev) => ({ ...prev, waves: reordered }));
    setSelectedWaveIdx(reordered.findIndex((w) => w.id === waveId));
  };

  const deleteWave = (waveId: string) => {
    const remaining = getOrderedWaves(level)
      .filter((w) => w.id !== waveId)
      .map((w, i) => ({ ...w, order: i + 1 }));
    setLevel((prev) => ({ ...prev, waves: remaining }));
    setSelectedWaveIdx(Math.max(0, Math.min(selectedWaveIdx, remaining.length - 1)));
  };

  const duplicateWave = (wave: CampaignWaveSpec) => {
    const clone: CampaignWaveSpec = {
      ...JSON.parse(JSON.stringify(wave)),
      id: `cw-${Date.now()}`,
      order: level.waves.length + 1,
      attachedGates: [],
    };
    setLevel((prev) => ({ ...prev, waves: [...prev.waves, clone] }));
    setSelectedWaveIdx(level.waves.length);
  };

  const handleSave = async () => {
    setErrorMsg(null);
    if (!level.name.trim()) {
      setErrorMsg('Please enter a level name.');
      return;
    }
    setSaving(true);
    try {
      const isEditing = Boolean(initialLevel?.id);
      const url = isEditing
        ? `/api/community-levels/${encodeURIComponent(initialLevel!.id)}`
        : '/api/community-levels';
      const res = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorName, level }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save level');
      onSaved(data.level);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save level');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md overflow-y-auto p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-[#0d1322] border border-cyan-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Community Creator
              </span>
              <h2 className="text-lg font-display font-black text-white">
                {initialLevel ? `Edit "${initialLevel.name}"` : 'Create Community Level'}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Creator: <span className="text-cyan-300 font-mono font-bold">{creatorName}</span> &bull; Click wave openings on the map to attach numbered gates.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 disabled:opacity-50 text-black font-black rounded-lg text-xs uppercase tracking-wider flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : initialLevel ? 'Save Changes' : 'Publish Level'}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-rose-950/80 border border-rose-500/50 text-rose-200 rounded-lg px-4 py-2 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left: Live Map Canvas */}
          <div className="lg:col-span-6 bg-[#0d1322] border border-cyan-500/25 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                Live Map Preview (450 &times; 800)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsPlaying((p) => !p)}
                  className="px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase flex items-center gap-1"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setSimTime(0);
                    simTimeRef.current = 0;
                  }}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-600 flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> 0.0s
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-[#060913] px-3 py-2 rounded-lg border border-slate-800">
              <input
                type="range"
                min={0}
                max={schedule.totalDuration}
                step={0.05}
                value={simTime}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setIsPlaying(false);
                  setSimTime(val);
                  simTimeRef.current = val;
                }}
                className="flex-1 accent-cyan-400 cursor-pointer"
              />
              <span className="text-xs font-mono text-cyan-300 w-24 text-right">
                {simTime.toFixed(2)}s / {schedule.totalDuration.toFixed(1)}s
              </span>
            </div>

            <div className="flex justify-center bg-[#04060c] rounded-xl p-3 border border-slate-800">
              <canvas
                ref={canvasRef}
                width={ARENA_W}
                height={ARENA_H}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                className="rounded-lg border border-cyan-500/30 shadow-2xl cursor-crosshair max-w-full h-auto touch-none"
              />
            </div>
          </div>

          {/* Right: Metadata, Wave Builder, Schedule, Inspector */}
          <div className="lg:col-span-6 space-y-4">
            {/* Level Metadata */}
            <div className="bg-[#0d1322] border border-cyan-500/25 rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">Level Settings</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Level Name</label>
                  <input
                    type="text"
                    value={level.name}
                    maxLength={60}
                    onChange={(e) => setLevel((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-2.5 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Creator Pilot</label>
                  <input
                    type="text"
                    value={creatorName}
                    disabled
                    className="w-full px-2.5 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-cyan-300 opacity-75"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">Description</label>
                  <input
                    type="text"
                    value={level.description}
                    maxLength={160}
                    placeholder="Optional description..."
                    onChange={(e) => setLevel((p) => ({ ...p, description: e.target.value }))}
                    className="w-full px-2.5 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>
            </div>

            {/* Add Wave */}
            <div className="bg-[#0d1322] border border-cyan-500/25 rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-300">Send Obstacle Wave From Side</div>
              <div className="grid grid-cols-4 gap-1.5">
                {(['north', 'south', 'west', 'east'] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setBuilderSide(side)}
                    className={`py-1.5 rounded-lg text-xs font-bold uppercase border transition ${
                      builderSide === side
                        ? 'bg-cyan-500 border-cyan-400 text-black'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-500/50'
                    }`}
                  >
                    {side}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Pattern</label>
                  <select
                    value={builderPattern}
                    onChange={(e) => setBuilderPattern(e.target.value as CampaignPatternType)}
                    className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                  >
                    {PATTERN_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Speed</label>
                  <input
                    type="number"
                    value={builderSpeed}
                    onChange={(e) => setBuilderSpeed(Number(e.target.value))}
                    className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Delay After Prev (s)</label>
                  <input
                    type="number"
                    step={0.1}
                    value={builderDelay}
                    onChange={(e) => setBuilderDelay(Number(e.target.value))}
                    className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Gap Center</label>
                  <input
                    type="number"
                    value={builderGapCenter}
                    onChange={(e) => setBuilderGapCenter(Number(e.target.value))}
                    className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Gap Size</label>
                  <input
                    type="number"
                    value={builderGapSize}
                    onChange={(e) => setBuilderGapSize(Number(e.target.value))}
                    className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Thickness</label>
                  <input
                    type="number"
                    value={builderThickness}
                    onChange={(e) => setBuilderThickness(Number(e.target.value))}
                    className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={addWave}
                className="w-full py-2 bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-500/40 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add Wave To Schedule
              </button>
            </div>

            {/* Wave Schedule */}
            <div className="bg-[#0d1322] border border-cyan-500/25 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">Wave Schedule</span>
                <span className="text-[11px] font-mono text-slate-400">{orderedWaves.length} wave(s)</span>
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {(() => {
                  let acc = 0;
                  return orderedWaves.map((w, ordIdx) => {
                    acc += Number(w.delayAfterPrev || 0);
                    const origIdx = level.waves.indexOf(w);
                    const isSel = origIdx === selectedWaveIdx;
                    const gateCount = (w.attachedGates || []).length;
                    return (
                      <div
                        key={w.id}
                        onClick={() => {
                          setSelectedWaveIdx(origIdx);
                          jumpToWave(w.id);
                        }}
                        className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer border ${
                          isSel
                            ? 'bg-cyan-950/60 border-cyan-400 text-cyan-100'
                            : 'bg-slate-900/80 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-cyan-300 font-bold">#{w.order}</span>
                          <span className="uppercase font-bold text-rose-300">{w.side}</span>
                          <span className="text-slate-300 truncate">{w.patternType}</span>
                        </div>
                        <div className="flex items-center gap-1 font-mono text-[11px]">
                          <span className="text-slate-400">@{acc.toFixed(1)}s</span>
                          <span className={`px-1.5 py-0.5 rounded ${gateCount ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>
                            {gateCount}g
                          </span>
                          <button
                            type="button"
                            disabled={ordIdx === 0}
                            onClick={(e) => { e.stopPropagation(); moveWave(w.id, -1); }}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={ordIdx === orderedWaves.length - 1}
                            onClick={(e) => { e.stopPropagation(); moveWave(w.id, 1); }}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); duplicateWave(w); }}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700"
                            title="Duplicate"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deleteWave(w.id); }}
                            className="p-1 rounded bg-rose-900/40 hover:bg-rose-800/60 text-rose-300"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Selected Wave Inspector */}
            {selectedWave && (
              <div className="bg-[#0d1322] border border-cyan-500/25 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Wave #{selectedWave.order} Inspector
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Side</label>
                    <select
                      value={selectedWave.side}
                      onChange={(e) => updateSelectedWave({ side: e.target.value as 'north' | 'south' | 'east' | 'west' })}
                      className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                    >
                      <option value="north">North</option>
                      <option value="south">South</option>
                      <option value="west">West</option>
                      <option value="east">East</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Pattern</label>
                    <select
                      value={selectedWave.patternType}
                      onChange={(e) => updateSelectedWave({ patternType: e.target.value as CampaignPatternType })}
                      className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                    >
                      {PATTERN_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Delay (s)</label>
                    <input
                      type="number"
                      step={0.1}
                      value={selectedWave.delayAfterPrev}
                      onChange={(e) => updateSelectedWave({ delayAfterPrev: Math.max(0, Number(e.target.value)) })}
                      className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Speed</label>
                    <input
                      type="number"
                      value={selectedWave.speed}
                      onChange={(e) => updateSelectedWave({ speed: Math.max(40, Math.min(600, Number(e.target.value))) })}
                      className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Gap Center</label>
                    <input
                      type="number"
                      value={selectedWave.gapCenter}
                      onChange={(e) => updateSelectedWave({ gapCenter: Number(e.target.value) })}
                      className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Gap Size</label>
                    <input
                      type="number"
                      value={selectedWave.gapSize}
                      onChange={(e) => updateSelectedWave({ gapSize: Math.max(60, Number(e.target.value)) })}
                      className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
