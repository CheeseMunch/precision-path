import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Plus, Trash2, ArrowUp, ArrowDown, Copy, Save, X } from 'lucide-react';
import type {
  CampaignLevelConfig,
  CampaignPatternType,
  CampaignWaveGateSpec,
  CampaignWaveSpec,
  CommunityLevelConfig,
} from '../../../shared/types';
import {
  EDITOR_ARENA_H,
  EDITOR_ARENA_W,
  EDITOR_DIR_COLORS,
  EDITOR_HALF_H,
  EDITOR_HALF_W,
  EDITOR_PATTERN_OPTIONS,
  EDITOR_PLAYER_RADIUS,
  checkDummyHit,
  cloneWavesForInsert,
  computeJumpToWaveTime,
  computeWaveGeometry,
  computeWaveSchedule,
  findHoveredWaveOpening,
  getOrderedWaves,
  nextGateOrder,
} from '../../../shared/levelEditorUtils';

interface CommunityLevelEditorProps {
  creatorName: string;
  initialLevel?: CommunityLevelConfig | null;
  onSaved: (level: CommunityLevelConfig) => void;
  onCancel: () => void;
}

const createBlankLevel = (): CampaignLevelConfig => ({
  id: `community-${Date.now()}`,
  levelNumber: 1,
  name: 'My Custom Level',
  storyName: 'Community',
  description: '',
  spawn: { x: 0, y: 200 },
  clearBonusPoints: 300,
  parTimeSeconds: 30,
  waves: [
    {
      id: `wave-${Date.now()}`,
      order: 1,
      delayAfterPrev: 0.5,
      side: 'north',
      patternType: 'single-gap-wall',
      speed: 175,
      gapCenter: 0,
      gapSize: 125,
      barThickness: 18,
      color: '#ff2a6d',
      attachedGates: [],
    },
  ],
  obstacles: [],
  checkpoints: [],
});

export const CommunityLevelEditor: React.FC<CommunityLevelEditorProps> = ({
  creatorName,
  initialLevel,
  onSaved,
  onCancel,
}) => {
  const [level, setLevel] = useState<CampaignLevelConfig>(() =>
    initialLevel ? JSON.parse(JSON.stringify(initialLevel)) : createBlankLevel()
  );
  const [selectedWaveIdx, setSelectedWaveIdx] = useState(0);
  const [selectedWaveIds, setSelectedWaveIds] = useState<Set<string>>(() => new Set());
  const [draggedWaveId, setDraggedWaveId] = useState<string | null>(null);
  const [builderSide, setBuilderSide] = useState<'north' | 'south' | 'east' | 'west'>('north');
  const [builderPattern, setBuilderPattern] = useState<CampaignPatternType>('single-gap-wall');

  const [simTime, setSimTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorCoords, setCursorCoords] = useState({ x: 0, y: 0 });
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
  const hoverOpeningRef = useRef<{ waveId: string; start: number; end: number } | null>(null);
  const clearedPreviewGateIdsRef = useRef<Set<string>>(new Set());
  const ripplesRef = useRef<Array<{ x: number; y: number; radius: number; maxRadius: number; alpha: number }>>([]);
  const popupsRef = useRef<Array<{ x: number; y: number; text: string; color: string; alpha: number }>>([]);

  const schedule = computeWaveSchedule(level.waves);
  const orderedWaves = getOrderedWaves(level.waves);
  const selectedWave = level.waves[selectedWaveIdx] || null;

  const resetPlayback = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setSimTime(0);
    simTimeRef.current = 0;
    clearedPreviewGateIdsRef.current.clear();
    ripplesRef.current = [];
    popupsRef.current = [];
    dummyPosRef.current = { x: 0, y: 120 };
  };

  // Canvas animation & rendering loop (matches campaignAdminHtml.ts)
  useEffect(() => {
    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      const cur = levelRef.current;
      const sched = computeWaveSchedule(cur.waves);

      if (isPlayingRef.current) {
        let nextT = simTimeRef.current + dt;
        if (nextT > sched.totalDuration) {
          nextT = 0;
          clearedPreviewGateIdsRef.current.clear();
        }
        simTimeRef.current = nextT;
        setSimTime(nextT);
      }

      // Update teleport ripples & popups
      ripplesRef.current = ripplesRef.current
        .map((r) => ({ ...r, radius: r.radius + dt * 95, alpha: r.alpha - dt * 2.2 }))
        .filter((r) => r.alpha > 0);
      popupsRef.current = popupsRef.current
        .map((p) => ({ ...p, y: p.y - dt * 28, alpha: p.alpha - dt * 1.4 }))
        .filter((p) => p.alpha > 0);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const t = simTimeRef.current;
          ctx.clearRect(0, 0, EDITOR_ARENA_W, EDITOR_ARENA_H);
          ctx.fillStyle = '#050814';
          ctx.fillRect(0, 0, EDITOR_ARENA_W, EDITOR_ARENA_H);

          ctx.save();
          ctx.translate(EDITOR_HALF_W, EDITOR_HALF_H);

          // Border & grid
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
          ctx.lineWidth = 2;
          ctx.strokeRect(-EDITOR_HALF_W + 1, -EDITOR_HALF_H + 1, EDITOR_ARENA_W - 2, EDITOR_ARENA_H - 2);

          ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
          ctx.lineWidth = 1;
          for (let x = -200; x <= 200; x += 50) {
            ctx.beginPath();
            ctx.moveTo(x, -EDITOR_HALF_H);
            ctx.lineTo(x, EDITOR_HALF_H);
            ctx.stroke();
          }
          for (let y = -350; y <= 350; y += 50) {
            ctx.beginPath();
            ctx.moveTo(-EDITOR_HALF_W, y);
            ctx.lineTo(EDITOR_HALF_W, y);
            ctx.stroke();
          }

          const dPos = dummyPosRef.current;
          const selWave = cur.waves && cur.waves[selectedWaveIdxRef.current];

          const getActivePreviewGateId = (): string | null => {
            const upcomingGates: CampaignWaveGateSpec[] = [];
            for (const it of sched.items) {
              if (t > it.spawnAt + it.duration) continue;
              for (const g of it.wave.attachedGates || []) {
                if (!clearedPreviewGateIdsRef.current.has(g.id)) upcomingGates.push(g);
              }
            }
            upcomingGates.sort((a, b) => Number(a.order) - Number(b.order));
            return upcomingGates.length ? upcomingGates[0].id : null;
          };

          // Sequential dummy-ball gate clearing
          let activeGateId = getActivePreviewGateId();
          if (activeGateId) {
            for (const item of sched.items) {
              const tSince = t - item.spawnAt;
              if (tSince < 0 || tSince > item.duration) continue;
              const w = item.wave;
              const activeGate = (w.attachedGates || []).find((g) => g.id === activeGateId);
              if (!activeGate) continue;
              const geom = computeWaveGeometry(w, tSince);
              const coordVal = geom.isVert ? dPos.y : dPos.x;
              const perpVal = geom.isVert ? dPos.x : dPos.y;
              const minSpan = Math.min(activeGate.start, activeGate.end);
              const maxSpan = Math.max(activeGate.start, activeGate.end);
              if (
                Math.abs(coordVal - geom.coord) <= EDITOR_PLAYER_RADIUS + 4 &&
                perpVal >= minSpan &&
                perpVal <= maxSpan
              ) {
                clearedPreviewGateIdsRef.current.add(activeGate.id);
                popupsRef.current.push({
                  x: dPos.x,
                  y: dPos.y - 24,
                  text: `+${activeGate.points || 200}`,
                  color: '#34d399',
                  alpha: 1,
                });
                activeGateId = getActivePreviewGateId();
              }
            }
          }

          const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);

          for (const item of sched.items) {
            const tSince = t - item.spawnAt;
            if (tSince < 0 || tSince > item.duration) continue;
            const w = item.wave;
            const isSelWave = Boolean(selWave && w.id === selWave.id);
            const geom = computeWaveGeometry(w, tSince);

            // Draw wave obstacles (rects & circles)
            ctx.save();
            ctx.globalAlpha = selWave ? (isSelWave ? 1.0 : 0.42) : 1.0;
            ctx.fillStyle = geom.color;
            ctx.shadowColor = isSelWave ? '#ffffff' : geom.color;
            ctx.shadowBlur = isSelWave ? 18 : 8;

            for (const r of geom.rects) {
              ctx.save();
              ctx.translate(r.x, r.y);
              if (r.rot) ctx.rotate(r.rot);
              ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
              if (isSelWave) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3;
                ctx.strokeRect(-r.w / 2 - 1, -r.h / 2 - 1, r.w + 2, r.h + 2);
              }
              ctx.restore();
            }

            for (const c of geom.circles) {
              ctx.beginPath();
              ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
              ctx.fill();
              if (isSelWave) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3;
                ctx.stroke();
              }
            }

            if (isSelWave) {
              const anchor = geom.rects[0] || geom.circles[0];
              if (anchor) {
                ctx.shadowBlur = 0;
                const lx = Math.max(-EDITOR_HALF_W + 42, Math.min(EDITOR_HALF_W - 42, anchor.x));
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

            // Draw attached gates on this wave
            for (const g of w.attachedGates || []) {
              const isCleared = clearedPreviewGateIdsRef.current.has(g.id);
              const isCurrent = g.id === activeGateId;
              const hov = hoverOpeningRef.current;
              const isHov =
                hov &&
                hov.waveId === w.id &&
                Math.abs(hov.start - g.start) <= 14 &&
                Math.abs(hov.end - g.end) <= 14;

              ctx.save();
              if (isCleared) {
                ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
                ctx.strokeStyle = isHov ? '#ffffff' : 'rgba(16, 185, 129, 0.35)';
                ctx.lineWidth = isHov ? 2 : 1;
              } else if (isCurrent) {
                ctx.fillStyle = `rgba(52, 211, 153, ${0.22 + pulse * 0.14})`;
                ctx.strokeStyle = isHov ? '#ffffff' : `rgba(52, 211, 153, ${0.75 + pulse * 0.25})`;
                ctx.lineWidth = isHov ? 3 : 2.5;
              } else {
                ctx.fillStyle = 'rgba(148, 163, 184, 0.08)';
                ctx.strokeStyle = isHov ? '#ffffff' : 'rgba(148, 163, 184, 0.4)';
                ctx.lineWidth = isHov ? 2 : 1.5;
                ctx.setLineDash([5, 4]);
              }

              const span = Math.abs(g.end - g.start);
              const mid = (g.start + g.end) / 2;
              if (geom.isVert) {
                ctx.fillRect(Math.min(g.start, g.end), geom.coord - 13, span, 26);
                ctx.strokeRect(Math.min(g.start, g.end), geom.coord - 13, span, 26);
              } else {
                ctx.fillRect(geom.coord - 13, Math.min(g.start, g.end), 26, span);
                ctx.strokeRect(geom.coord - 13, Math.min(g.start, g.end), 26, span);
              }
              ctx.setLineDash([]);
              ctx.fillStyle = isCleared ? 'rgba(16, 185, 129, 0.55)' : isCurrent ? '#6ee7b7' : '#cbd5e1';
              ctx.font = 'bold 11px monospace';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(`G${g.order}`, geom.isVert ? mid : geom.coord, geom.isVert ? geom.coord : mid);
              ctx.restore();
            }

            // Draw un-gated openings as subtle dashed targets
            for (const op of geom.gaps) {
              const hasGate = (w.attachedGates || []).some(
                (g) => Math.abs(g.start - op.start) <= 14 && Math.abs(g.end - op.end) <= 14
              );
              if (hasGate) continue;
              const hov = hoverOpeningRef.current;
              const isHov = hov && hov.waveId === w.id && hov.start === op.start && hov.end === op.end;
              ctx.save();
              ctx.setLineDash([4, 4]);
              ctx.strokeStyle = isHov ? '#6ee7b7' : 'rgba(52, 211, 153, 0.32)';
              ctx.lineWidth = isHov ? 2.5 : 1;
              if (geom.isVert) {
                ctx.strokeRect(op.start, geom.coord - 10, op.end - op.start, 20);
              } else {
                ctx.strokeRect(geom.coord - 10, op.start, 20, op.end - op.start);
              }
              ctx.restore();
            }
          }

          // Spawn marker
          const sx = cur.spawn?.x ?? 0;
          const sy = cur.spawn?.y ?? 200;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(0, 0, EDITOR_PLAYER_RADIUS + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(34, 211, 238, 0.9)';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('SPAWN', 0, EDITOR_PLAYER_RADIUS + 14);
          ctx.restore();

          // Dummy hit test & draw
          const dummyHit = checkDummyHit(cur.waves, t, dPos);
          ctx.save();
          ctx.translate(dPos.x, dPos.y);
          ctx.shadowColor = dummyHit ? '#ef4444' : '#22d3ee';
          ctx.shadowBlur = dummyHit ? 20 : 12;
          ctx.beginPath();
          ctx.arc(0, 0, EDITOR_PLAYER_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = dummyHit ? '#ef4444' : '#22d3ee';
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.arc(0, 0, EDITOR_PLAYER_RADIUS * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = dummyHit ? '#fee2e2' : '#ffffff';
          ctx.fill();
          ctx.fillStyle = dummyHit ? '#fca5a5' : '#cffafe';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(dummyHit ? 'HIT!' : 'DUMMY', 0, -EDITOR_PLAYER_RADIUS - 8);
          ctx.restore();

          // Teleport ripples & popups
          for (const r of ripplesRef.current) {
            ctx.save();
            ctx.strokeStyle = `rgba(0, 240, 255, ${r.alpha})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          for (const p of popupsRef.current) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.fillStyle = p.color;
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(p.text, p.x, p.y);
            ctx.restore();
          }

          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const getCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (EDITOR_ARENA_W / rect.width) - EDITOR_HALF_W,
      y: (e.clientY - rect.top) * (EDITOR_ARENA_H / rect.height) - EDITOR_HALF_H,
    };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getCoords(e);
    if (Math.hypot(x - dummyPosRef.current.x, y - dummyPosRef.current.y) <= 18) {
      dragDummyRef.current = true;
      return;
    }
    if (level.spawn && Math.hypot(x - level.spawn.x, y - level.spawn.y) <= 18) {
      dragSpawnRef.current = true;
      return;
    }
    const hit = findHoveredWaveOpening(levelRef.current.waves, simTimeRef.current, x, y);
    if (hit) {
      const wIdx = levelRef.current.waves.findIndex((w) => w.id === hit.waveId);
      if (wIdx >= 0) {
        setLevel((prev) => {
          const nextWaves = prev.waves.map((w) => ({
            ...w,
            attachedGates: [...(w.attachedGates || [])],
          }));
          const wave = nextWaves[wIdx];
          if (!wave) return prev;
          const existIdx = wave.attachedGates.findIndex(
            (g) => Math.abs(g.start - hit.start) <= 14 && Math.abs(g.end - hit.end) <= 14
          );
          if (existIdx >= 0) {
            wave.attachedGates.splice(existIdx, 1);
          } else {
            const ord = nextGateOrder(nextWaves);
            wave.attachedGates.push({
              id: `gate-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              order: ord,
              start: hit.start,
              end: hit.end,
              points: 200,
              label: `GATE ${ord}`,
            });
          }
          return { ...prev, waves: nextWaves };
        });
        setSelectedWaveIdx(wIdx);
      }
      return;
    }
    // Click anywhere else on map to teleport dummy ball
    const cx = Math.max(-EDITOR_HALF_W + EDITOR_PLAYER_RADIUS, Math.min(EDITOR_HALF_W - EDITOR_PLAYER_RADIUS, x));
    const cy = Math.max(-EDITOR_HALF_H + EDITOR_PLAYER_RADIUS, Math.min(EDITOR_HALF_H - EDITOR_PLAYER_RADIUS, y));
    const dist = Math.hypot(cx - dummyPosRef.current.x, cy - dummyPosRef.current.y);
    dummyPosRef.current = { x: cx, y: cy };
    dragDummyRef.current = true;
    if (dist > 38) {
      ripplesRef.current.push({ x: cx, y: cy, radius: 8, maxRadius: 34, alpha: 0.9 });
      popupsRef.current.push({ x: cx, y: cy - 22, text: 'TELEPORT', color: '#00f0ff', alpha: 0.9 });
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getCoords(e);
    setCursorCoords({ x: Math.round(x), y: Math.round(y) });
    if (dragDummyRef.current) {
      dummyPosRef.current = {
        x: Math.max(-EDITOR_HALF_W + EDITOR_PLAYER_RADIUS, Math.min(EDITOR_HALF_W - EDITOR_PLAYER_RADIUS, x)),
        y: Math.max(-EDITOR_HALF_H + EDITOR_PLAYER_RADIUS, Math.min(EDITOR_HALF_H - EDITOR_PLAYER_RADIUS, y)),
      };
      return;
    }
    if (dragSpawnRef.current) {
      setLevel((prev) => ({
        ...prev,
        spawn: {
          x: Math.max(-EDITOR_HALF_W + 15, Math.min(EDITOR_HALF_W - 15, Math.round(x / 10) * 10)),
          y: Math.max(-EDITOR_HALF_H + 15, Math.min(EDITOR_HALF_H - 15, Math.round(y / 10) * 10)),
        },
      }));
      return;
    }
    hoverOpeningRef.current = findHoveredWaveOpening(levelRef.current.waves, simTimeRef.current, x, y);
  };

  const handleCanvasPointerUp = () => {
    dragDummyRef.current = false;
    dragSpawnRef.current = false;
  };

  const jumpToWave = (waveId: string, wavesOverride?: CampaignWaveSpec[]) => {
    const sched = computeWaveSchedule(wavesOverride ?? levelRef.current.waves);
    const item = sched.items.find((it) => it.wave.id === waveId);
    if (!item) return;
    setIsPlaying(false);
    isPlayingRef.current = false;
    const jumpT = computeJumpToWaveTime(item);
    setSimTime(jumpT);
    simTimeRef.current = jumpT;
  };

  const addWave = () => {
    const maxOrd = level.waves.length ? Math.max(...level.waves.map((w) => Number(w.order || 1))) : 0;
    const newWave: CampaignWaveSpec = {
      id: `wave-${Date.now()}`,
      order: maxOrd + 1,
      delayAfterPrev: level.waves.length === 0 ? 0.5 : 1.8,
      side: builderSide,
      patternType: builderPattern,
      speed: 175,
      gapCenter: 0,
      gapSize: 125,
      barThickness: 18,
      color: EDITOR_DIR_COLORS[builderSide],
      attachedGates: [],
    };
    const nextWaves = [...level.waves, newWave];
    setLevel((prev) => ({ ...prev, waves: nextWaves }));
    setSelectedWaveIdx(nextWaves.length - 1);
    jumpToWave(newWave.id, nextWaves);
  };

  const updateSelectedWave = (patch: Partial<CampaignWaveSpec>) => {
    if (!selectedWave) return;
    setLevel((prev) => ({
      ...prev,
      waves: prev.waves.map((w, idx) => (idx === selectedWaveIdx ? { ...w, ...patch } : w)),
    }));
  };

  const applyOrderedWaves = (newOrdered: CampaignWaveSpec[], focusWaveId?: string) => {
    const reordered = newOrdered.map((w, i) => ({ ...w, order: i + 1 }));
    setLevel((prev) => ({ ...prev, waves: reordered }));
    if (focusWaveId) {
      const idx = reordered.findIndex((w) => w.id === focusWaveId);
      if (idx >= 0) setSelectedWaveIdx(idx);
    }
  };

  const moveWaveInSchedule = (waveId: string, delta: number) => {
    const ordered = getOrderedWaves(level.waves);
    const idx = ordered.findIndex((w) => w.id === waveId);
    const nextIdx = idx + delta;
    if (idx < 0 || nextIdx < 0 || nextIdx >= ordered.length) return;
    const [moved] = ordered.splice(idx, 1);
    ordered.splice(nextIdx, 0, moved);
    applyOrderedWaves(ordered, moved.id);
  };

  const reorderWaveByDrop = (fromId: string | null, toId: string) => {
    if (!fromId || !toId || fromId === toId) return;
    const ordered = getOrderedWaves(level.waves);
    const fromIdx = ordered.findIndex((w) => w.id === fromId);
    const toIdx = ordered.findIndex((w) => w.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, moved);
    applyOrderedWaves(ordered, moved.id);
  };

  const toggleSelectAllWaves = () => {
    if (level.waves.length === 0) return;
    const allSelected = level.waves.every((w) => selectedWaveIds.has(w.id));
    if (allSelected) {
      setSelectedWaveIds(new Set());
    } else {
      setSelectedWaveIds(new Set(level.waves.map((w) => w.id)));
    }
  };

  const duplicateSelectedWaves = () => {
    const ordered = getOrderedWaves(level.waves);
    const chosen = ordered.filter((w) => selectedWaveIds.has(w.id));
    if (chosen.length === 0) return;
    const maxOrd = level.waves.length ? Math.max(...level.waves.map((w) => Number(w.order || 1))) : 0;
    const dupes = cloneWavesForInsert(chosen, maxOrd + 1, nextGateOrder(level.waves));
    const nextWaves = [...level.waves, ...dupes];
    setLevel((prev) => ({ ...prev, waves: nextWaves }));
    setSelectedWaveIds(new Set(dupes.map((w) => w.id)));
    setSelectedWaveIdx(nextWaves.length - dupes.length);
    if (dupes[0]) jumpToWave(dupes[0].id, nextWaves);
  };

  const deleteSelectedWaves = () => {
    if (selectedWaveIds.size === 0) return;
    const count = level.waves.filter((w) => selectedWaveIds.has(w.id)).length;
    if (count === 0) return;
    if (!window.confirm(`Delete ${count} selected wave(s)?`)) return;
    const remaining = level.waves.filter((w) => !selectedWaveIds.has(w.id));
    setLevel((prev) => ({ ...prev, waves: remaining }));
    setSelectedWaveIds(new Set());
    setSelectedWaveIdx(Math.max(0, Math.min(selectedWaveIdx, remaining.length - 1)));
  };

  const duplicateCurrentWave = () => {
    if (!selectedWave) return;
    const maxOrd = level.waves.length ? Math.max(...level.waves.map((w) => Number(w.order || 1))) : 0;
    const clone: CampaignWaveSpec = {
      ...JSON.parse(JSON.stringify(selectedWave)),
      id: `wave-${Date.now()}`,
      order: maxOrd + 1,
      attachedGates: [],
    };
    const nextWaves = [...level.waves, clone];
    setLevel((prev) => ({ ...prev, waves: nextWaves }));
    setSelectedWaveIdx(nextWaves.length - 1);
    jumpToWave(clone.id, nextWaves);
  };

  const deleteCurrentWave = () => {
    if (!selectedWave) return;
    const remaining = level.waves.filter((_, idx) => idx !== selectedWaveIdx);
    setLevel((prev) => ({ ...prev, waves: remaining }));
    setSelectedWaveIdx(Math.max(0, selectedWaveIdx - 1));
  };

  const updateAttachedGate = (gateIdx: number, patch: Partial<CampaignWaveGateSpec>) => {
    if (!selectedWave) return;
    const nextGates = (selectedWave.attachedGates || []).map((g, gi) =>
      gi === gateIdx ? { ...g, ...patch } : g
    );
    updateSelectedWave({ attachedGates: nextGates });
  };

  const deleteAttachedGate = (gateIdx: number) => {
    if (!selectedWave) return;
    const nextGates = (selectedWave.attachedGates || []).filter((_, gi) => gi !== gateIdx);
    updateSelectedWave({ attachedGates: nextGates });
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

  const selectedCount = orderedWaves.filter((w) => selectedWaveIds.has(w.id)).length;
  const allSelected = orderedWaves.length > 0 && selectedCount === orderedWaves.length;

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
                  onClick={resetPlayback}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-600 flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
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
                {simTime.toFixed(1)}s / {schedule.totalDuration.toFixed(1)}s
              </span>
            </div>

            <canvas
              ref={canvasRef}
              width={EDITOR_ARENA_W}
              height={EDITOR_ARENA_H}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerUp}
              className="w-full max-w-[380px] mx-auto block rounded-lg border border-cyan-500/30 bg-[#050814] cursor-crosshair touch-none"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>X: {cursorCoords.x}, Y: {cursorCoords.y}</span>
              <span>Drag DUMMY / SPAWN &bull; Click openings to toggle gates</span>
            </div>
          </div>

          {/* Right: Metadata, Wave Builder, Schedule, Wave Inspector */}
          <div className="lg:col-span-6 space-y-4">
            {/* Level Metadata */}
            <div className="bg-[#0d1322] border border-cyan-500/25 rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">Level Metadata</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Level Name</label>
                  <input
                    type="text"
                    value={level.name}
                    onChange={(e) => setLevel((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-2.5 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Par Time (s)</label>
                    <input
                      type="number"
                      value={level.parTimeSeconds}
                      onChange={(e) => setLevel((p) => ({ ...p, parTimeSeconds: Math.max(5, Number(e.target.value)) }))}
                      className="w-full px-2.5 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Clear Bonus</label>
                    <input
                      type="number"
                      value={level.clearBonusPoints}
                      onChange={(e) => setLevel((p) => ({ ...p, clearBonusPoints: Math.max(0, Number(e.target.value)) }))}
                      className="w-full px-2.5 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Description</label>
                <input
                  type="text"
                  value={level.description}
                  onChange={(e) => setLevel((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Describe the challenge..."
                  className="w-full px-2.5 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                />
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={builderPattern}
                  onChange={(e) => setBuilderPattern(e.target.value as CampaignPatternType)}
                  className="sm:col-span-2 px-2.5 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                >
                  {EDITOR_PATTERN_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addWave}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Wave
                </button>
              </div>
            </div>

            {/* Wave Schedule */}
            <div className="bg-[#0d1322] border border-cyan-500/25 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">Wave Schedule</span>
                <span className="text-[11px] font-mono text-slate-400">{orderedWaves.length} wave(s)</span>
              </div>

              {/* Bulk Actions Bar (exact match to Admin Panel) */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#060913] border border-slate-800 rounded-lg px-2.5 py-1.5">
                <span className="text-[11px] font-mono text-slate-400">{selectedCount} selected</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={toggleSelectAllWaves}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-semibold transition"
                  >
                    {allSelected ? 'Clear' : 'Select All'}
                  </button>
                  <button
                    type="button"
                    onClick={duplicateSelectedWaves}
                    disabled={selectedCount === 0}
                    className="px-2 py-0.5 bg-cyan-600/20 hover:bg-cyan-600/35 disabled:opacity-40 disabled:pointer-events-none text-cyan-200 border border-cyan-500/40 rounded text-[11px] font-bold transition"
                  >
                    {selectedCount > 0 ? `Duplicate (${selectedCount})` : 'Duplicate'}
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelectedWaves}
                    disabled={selectedCount === 0}
                    className="px-2 py-0.5 bg-rose-600/20 hover:bg-rose-600/35 disabled:opacity-40 disabled:pointer-events-none text-rose-200 border border-rose-500/40 rounded text-[11px] font-bold transition"
                  >
                    {selectedCount > 0 ? `Delete (${selectedCount})` : 'Delete'}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {(() => {
                  let acc = 0;
                  return orderedWaves.map((w, ordIdx) => {
                    acc += Number(w.delayAfterPrev || 0);
                    const origIdx = level.waves.indexOf(w);
                    const isSel = origIdx === selectedWaveIdx;
                    const isChecked = selectedWaveIds.has(w.id);
                    const gateCount = (w.attachedGates || []).length;
                    return (
                      <div
                        key={w.id}
                        draggable
                        onDragStart={(ev) => {
                          setDraggedWaveId(w.id);
                          ev.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(ev) => {
                          ev.preventDefault();
                        }}
                        onDrop={(ev) => {
                          ev.preventDefault();
                          reorderWaveByDrop(draggedWaveId, w.id);
                          setDraggedWaveId(null);
                        }}
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
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-slate-500 cursor-grab select-none px-0.5" title="Drag to reorder">
                            &#8942;&#8942;
                          </span>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onClick={(ev) => ev.stopPropagation()}
                            onChange={(ev) => {
                              setSelectedWaveIds((prev) => {
                                const next = new Set(prev);
                                if (ev.target.checked) next.add(w.id);
                                else next.delete(w.id);
                                return next;
                              });
                            }}
                            className="accent-violet-400 cursor-pointer shrink-0"
                            title="Select wave for duplicate / delete"
                          />
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-cyan-300 font-bold shrink-0">
                            #{w.order}
                          </span>
                          <span className="uppercase font-bold text-rose-300 shrink-0">{w.side}</span>
                          <span className="text-slate-300 truncate">{w.patternType}</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono text-[11px] shrink-0">
                          <span className="text-slate-400">@{acc.toFixed(1)}s</span>
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              gateCount ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {gateCount}g
                          </span>
                          <button
                            type="button"
                            disabled={ordIdx === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveWaveInSchedule(w.id, -1);
                            }}
                            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200"
                            title="Move up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={ordIdx === orderedWaves.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveWaveInSchedule(w.id, 1);
                            }}
                            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200"
                            title="Move down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Selected Wave Inspector (exact match to Admin Panel) */}
            {selectedWave && (
              <div className="bg-[#0d1322] border border-cyan-500/25 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Wave #{selectedWave.order} ({selectedWave.side.toUpperCase()})
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={duplicateCurrentWave}
                      className="text-[11px] px-2 py-0.5 rounded font-bold border bg-slate-800 border-slate-600 text-slate-200 hover:border-cyan-400 flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={deleteCurrentWave}
                      className="text-[11px] px-2 py-0.5 rounded font-bold border bg-rose-900/50 border-rose-500/40 text-rose-200 hover:bg-rose-800/60 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Wave Order (#)</label>
                    <input
                      type="number"
                      value={selectedWave.order}
                      onChange={(e) => updateSelectedWave({ order: Math.max(1, Math.round(Number(e.target.value))) })}
                      className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Delay After Prev (s)</label>
                    <input
                      type="number"
                      step={0.1}
                      value={selectedWave.delayAfterPrev}
                      onChange={(e) => updateSelectedWave({ delayAfterPrev: Math.max(0, Number(e.target.value)) })}
                      className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Side</label>
                    <select
                      value={selectedWave.side}
                      onChange={(e) =>
                        updateSelectedWave({ side: e.target.value as 'north' | 'south' | 'east' | 'west' })
                      }
                      className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                    >
                      <option value="north">north</option>
                      <option value="south">south</option>
                      <option value="west">west</option>
                      <option value="east">east</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Obstacle Pattern</label>
                    <select
                      value={selectedWave.patternType}
                      onChange={(e) =>
                        updateSelectedWave({ patternType: e.target.value as CampaignPatternType })
                      }
                      className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                    >
                      {EDITOR_PATTERN_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Speed (px/s)</label>
                    <input
                      type="number"
                      value={selectedWave.speed}
                      onChange={(e) => updateSelectedWave({ speed: Math.max(40, Number(e.target.value)) })}
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
                    <label className="block text-[11px] text-slate-400 mb-1">Gap Size (px)</label>
                    <input
                      type="number"
                      value={selectedWave.gapSize}
                      onChange={(e) => updateSelectedWave({ gapSize: Math.max(60, Number(e.target.value)) })}
                      className="w-full px-2 py-1.5 bg-[#060913] border border-slate-800 rounded text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Color</label>
                    <input
                      type="color"
                      value={selectedWave.color || EDITOR_DIR_COLORS[selectedWave.side] || '#ff2a6d'}
                      onChange={(e) => updateSelectedWave({ color: e.target.value })}
                      className="w-full h-8 px-1 py-0.5 bg-[#060913] border border-slate-800 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Attached Checkpoint Gates (exact match to Admin Panel) */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                      Attached Checkpoint Gates
                    </span>
                    <span className="text-[10px] text-slate-400">Click wave openings on the map to toggle</span>
                  </div>

                  {!selectedWave.attachedGates || selectedWave.attachedGates.length === 0 ? (
                    <div className="text-[11px] text-slate-500 italic">
                      No gates attached to this wave yet. Scrub/Play and click an opening on the map!
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedWave.attachedGates.map((g, gi) => (
                        <div
                          key={g.id}
                          className="grid grid-cols-12 gap-1.5 items-center bg-[#060913] p-1.5 rounded border border-emerald-500/30"
                        >
                          <input
                            type="number"
                            value={g.order}
                            title="Gate Number"
                            onChange={(e) =>
                              updateAttachedGate(gi, { order: Math.max(1, Math.round(Number(e.target.value))) })
                            }
                            className="col-span-2 px-1.5 py-1 bg-[#0d1322] border border-slate-800 rounded text-xs text-white text-center"
                          />
                          <input
                            type="text"
                            value={g.label || ''}
                            placeholder="Label"
                            onChange={(e) => updateAttachedGate(gi, { label: e.target.value })}
                            className="col-span-4 px-1.5 py-1 bg-[#0d1322] border border-slate-800 rounded text-xs text-white"
                          />
                          <input
                            type="number"
                            value={g.points}
                            title="Points"
                            onChange={(e) => updateAttachedGate(gi, { points: Number(e.target.value) })}
                            className="col-span-3 px-1.5 py-1 bg-[#0d1322] border border-slate-800 rounded text-xs text-white"
                          />
                          <span className="col-span-2 text-[10px] font-mono text-slate-400 text-center">
                            {g.start}..{g.end}
                          </span>
                          <button
                            type="button"
                            onClick={() => deleteAttachedGate(gi)}
                            title="Remove gate"
                            className="col-span-1 text-rose-400 hover:text-rose-200 font-bold text-xs text-center"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
