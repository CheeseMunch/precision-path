import React, { useEffect, useRef, useCallback } from 'react';
import type { GameState, ClientInput } from '../../../shared/types';

interface GameCanvasProps {
  gameState: GameState;
  liveGameStateRef?: React.MutableRefObject<GameState | null>;
  myPlayerId: string;
  onSendInput: (input: ClientInput) => void;
  onPlayerHit?: () => void;
}

const LOGICAL_WIDTH = 450;
const LOGICAL_HEIGHT = 800;

export const GameCanvas: React.FC<GameCanvasProps> = ({
  gameState,
  liveGameStateRef,
  myPlayerId,
  onSendInput,
  onPlayerHit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const inputThrottleRef = useRef<number>(0);
  const gameStateRef = useRef<GameState>(gameState);
  const myPlayerIdRef = useRef<string>(myPlayerId);
  const onPlayerHitRef = useRef(onPlayerHit);
  onPlayerHitRef.current = onPlayerHit;
  const hasTriggeredHitRef = useRef<boolean>(false);
  const localPointerRef = useRef<{ x: number; y: number } | null>(null);
  // Zero-latency client-predicted position for the local player ball
  const localPlayerPosRef = useRef<{ x: number; y: number } | null>(null);
  // Smoothed display positions for remote multiplayer players
  const remotePlayerPosRef = useRef<Record<string, { x: number; y: number }>>({});
  // VSync-locked birth timestamp (performance.now() ms) per obstacle ID — immune to network jitter
  const obstacleSpawnPerfRef = useRef<Map<string, number>>(new Map());
  const isDraggingRef = useRef<boolean>(false);
  const lastScoreRef = useRef<number>(0);
  const popupsRef = useRef<
    Array<{ x: number; y: number; text: string; color: string; alpha: number }>
  >([]);
  const ripplesRef = useRef<
    Array<{ x: number; y: number; radius: number; maxRadius: number; alpha: number }>
  >([]);

  useEffect(() => {
    gameStateRef.current = gameState;
    myPlayerIdRef.current = myPlayerId;

    const me = gameState.players[myPlayerId];
    if (!me) return;

    if (gameState.status === 'countdown' || gameState.elapsedTime < 0.15) {
      localPlayerPosRef.current = { x: me.x, y: me.y };
      obstacleSpawnPerfRef.current.clear();
      hasTriggeredHitRef.current = false;
      lastScoreRef.current = me.score;
      return;
    }

    if (!localPlayerPosRef.current) {
      localPlayerPosRef.current = { x: me.x, y: me.y };
    }

    if (me.score > lastScoreRef.current) {
      const gained = me.score - lastScoreRef.current;
      const isStageUp = gained >= 400;
      const pos = localPlayerPosRef.current || { x: me.x, y: me.y };
      popupsRef.current.push({
        x: pos.x,
        y: pos.y - 26,
        text: isStageUp ? `+${gained} NEXT STAGE!` : `+${gained} GATE!`,
        color: isStageUp ? '#facc15' : '#00ff66',
        alpha: 1.0,
      });
    }
    lastScoreRef.current = me.score;
  }, [gameState, myPlayerId]);

  const toArenaCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const scaleX = LOGICAL_WIDTH / rect.width;
    const scaleY = LOGICAL_HEIGHT / rect.height;

    return {
      x: (clientX - centerX) * scaleX,
      y: (clientY - centerY) * scaleY,
    };
  }, []);

  // Send immediate click/tap (teleport if distant) or high-frequency (120Hz) drag movement
  const sendMoveOrTeleport = useCallback(
    (clientX: number, clientY: number, isInitialTapOrClick: boolean) => {
      const coords = toArenaCoords(clientX, clientY);
      if (!coords) return;

      localPointerRef.current = coords;
      const currentState = liveGameStateRef?.current || gameStateRef.current;
      const me = currentState.players[myPlayerIdRef.current];
      const radius = me?.radius || 13;
      const maxX = (currentState.arenaWidth || LOGICAL_WIDTH) / 2 - radius;
      const maxY = (currentState.arenaHeight || LOGICAL_HEIGHT) / 2 - radius;
      const clampedX = Math.max(-maxX, Math.min(maxX, coords.x));
      const clampedY = Math.max(-maxY, Math.min(maxY, coords.y));

      const currentPos = localPlayerPosRef.current || (me ? { x: me.x, y: me.y } : { x: 0, y: 0 });
      const distFromPlayer = Math.hypot(clampedX - currentPos.x, clampedY - currentPos.y);

      // Update local player position immediately for 0ms input latency at native display Hz
      if (
        (currentState.status === 'playing' || currentState.status === 'countdown') &&
        (!me || me.alive)
      ) {
        localPlayerPosRef.current = { x: clampedX, y: clampedY };
      }

      if (isInitialTapOrClick) {
        const isTeleport = currentState.gameMode !== 'campaign' && distFromPlayer > 38;
        inputThrottleRef.current = performance.now();
        onSendInput({ x: clampedX, y: clampedY, isTeleport });

        if (isTeleport && me?.alive && currentState.status === 'playing') {
          ripplesRef.current.push({
            x: clampedX,
            y: clampedY,
            radius: 8,
            maxRadius: 34,
            alpha: 0.9,
          });
          popupsRef.current.push({
            x: clampedX,
            y: clampedY - 22,
            text: 'TELEPORT',
            color: '#00f0ff',
            alpha: 0.9,
          });
        }
        return;
      }

      const now = performance.now();
      if (now - inputThrottleRef.current >= 8) {
        inputThrottleRef.current = now;
        onSendInput({ x: clampedX, y: clampedY, isTeleport: false });
      }
    },
    [liveGameStateRef, onSendInput, toArenaCoords]
  );

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    sendMoveOrTeleport(e.clientX, e.clientY, true);
  };

  const onMouseUp = () => {
    isDraggingRef.current = false;
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = toArenaCoords(e.clientX, e.clientY);
    if (coords) {
      localPointerRef.current = coords;
    }
    if (isDraggingRef.current && (e.buttons & 1) === 1) {
      sendMoveOrTeleport(e.clientX, e.clientY, false);
    } else {
      isDraggingRef.current = false;
    }
  };

  const onTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      isDraggingRef.current = true;
      sendMoveOrTeleport(e.touches[0].clientX, e.touches[0].clientY, true);
    }
  };

  const onTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      sendMoveOrTeleport(e.touches[0].clientX, e.touches[0].clientY, false);
    }
  };

  const onTouchEnd = () => {
    isDraggingRef.current = false;
  };

  // Native Refresh Rate (60Hz / 120Hz / 144Hz / 240Hz) Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = LOGICAL_WIDTH * dpr;
    canvas.height = LOGICAL_HEIGHT * dpr;

    let lastFrameTime = performance.now();

    const render = (now: number) => {
      const frameDt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
      lastFrameTime = now;

      const currentState = liveGameStateRef?.current || gameStateRef.current;
      const currentMyId = myPlayerIdRef.current;
      const isPlaying = currentState.status === 'playing';

      const width = LOGICAL_WIDTH;
      const height = LOGICAL_HEIGHT;
      const centerX = width / 2;
      const centerY = height / 2;
      const arenaWidth = currentState.arenaWidth || LOGICAL_WIDTH;
      const arenaHeight = currentState.arenaHeight || LOGICAL_HEIGHT;
      const halfW = arenaWidth / 2;
      const halfH = arenaHeight / 2;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#090b12';
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(centerX, centerY);

      // 1. Draw Symmetrical Center-Aligned Background Grid
      ctx.save();
      ctx.beginPath();
      ctx.rect(-halfW, -halfH, arenaWidth, arenaHeight);
      ctx.clip();

      ctx.strokeStyle = '#111728';
      ctx.lineWidth = 1;
      const gridStepX = halfW / 5; // 10 equal columns across 450px (5 on each side of center)
      const gridStepY = halfH / 8; // 16 equal rows across 800px (8 on each side of center)

      // Center vertical line + symmetrical left/right pairs
      ctx.beginPath();
      ctx.moveTo(0, -halfH);
      ctx.lineTo(0, halfH);
      for (let i = 1; i < 5; i++) {
        const x = i * gridStepX;
        ctx.moveTo(x, -halfH);
        ctx.lineTo(x, halfH);
        ctx.moveTo(-x, -halfH);
        ctx.lineTo(-x, halfH);
      }

      // Center horizontal line + symmetrical top/bottom pairs
      ctx.moveTo(-halfW, 0);
      ctx.lineTo(halfW, 0);
      for (let j = 1; j < 8; j++) {
        const y = j * gridStepY;
        ctx.moveTo(-halfW, y);
        ctx.lineTo(halfW, y);
        ctx.moveTo(-halfW, -y);
        ctx.lineTo(halfW, -y);
      }
      ctx.stroke();
      ctx.restore();

      // 2. Center Crosshair (aligned directly on the (0,0) center grid intersection)
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(16, 0);
      ctx.moveTo(0, -16);
      ctx.lineTo(0, 16);
      ctx.stroke();

      // 2b. Campaign Mode: Draw structured or wave-attached glowing numbered checkpoint gates
      if (currentState.gameMode === 'campaign' && currentState.checkpoints && currentState.checkpoints.length > 0) {
        const cps = currentState.checkpoints;
        const spawnPerfMapGates = obstacleSpawnPerfRef.current;
        const unreachedOrders = cps.filter((c) => !c.reached).map((c) => c.order);
        const activeOrder = unreachedOrders.length > 0 ? Math.min(...unreachedOrders) : Infinity;

        const ordered = [...cps].sort((a, b) => a.order - b.order);
        const getGateCoord = (cp: (typeof cps)[number]) => {
          if (cp.waveId && cp.spawnTime !== undefined && cp.spawnCoord !== undefined && cp.travelSign && cp.speed) {
            const key = 'gate:' + cp.id;
            let spMs = spawnPerfMapGates.get(key);
            if (spMs === undefined) {
              spMs = now - Math.max(0, currentState.elapsedTime - cp.spawnTime) * 1000;
              spawnPerfMapGates.set(key, spMs);
            } else if (currentState.status === 'paused') {
              spMs += frameDt * 1000;
              spawnPerfMapGates.set(key, spMs);
            }
            const ageSec = Math.max(0, (now - spMs) / 1000);
            return cp.spawnCoord + cp.travelSign * cp.speed * ageSec;
          }
          return cp.coord;
        };

        const hasStaticGates = ordered.some((c) => !c.waveId);
        const gateMid = (cp: (typeof cps)[number], coordVal: number) => {
          const mid = (cp.start + cp.end) / 2;
          return cp.axis === 'vertical' ? { x: coordVal, y: mid } : { x: mid, y: coordVal };
        };

        ctx.save();
        ctx.beginPath();
        ctx.rect(-halfW, -halfH, arenaWidth, arenaHeight);
        ctx.clip();

        if (hasStaticGates) {
          ctx.save();
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.22)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          if (currentState.campaignSpawn) {
            ctx.moveTo(currentState.campaignSpawn.x, currentState.campaignSpawn.y);
          } else {
            const firstMid = gateMid(ordered[0], ordered[0].coord);
            ctx.moveTo(firstMid.x, firstMid.y);
          }
          for (const cp of ordered) {
            const m = gateMid(cp, cp.coord);
            ctx.lineTo(m.x, m.y);
          }
          ctx.stroke();
          ctx.restore();
        }

        const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
        const firstActiveGate = ordered.find((c) => !c.reached && c.order === activeOrder);
        const activeGateId = firstActiveGate ? firstActiveGate.id : null;
        ordered.forEach((cp) => {
          if (cp.waveId && cp.spawnTime === undefined) return; // Wave not spawned yet
          const coordVal = getGateCoord(cp);
          const isCleared = Boolean(cp.reached);
          const isCurrent = !isCleared && cp.id === activeGateId;
          const x1 = cp.axis === 'horizontal' ? cp.start : coordVal;
          const y1 = cp.axis === 'horizontal' ? coordVal : cp.start;
          const x2 = cp.axis === 'horizontal' ? cp.end : coordVal;
          const y2 = cp.axis === 'horizontal' ? coordVal : cp.end;
          const mid = gateMid(cp, coordVal);

          ctx.save();
          if (isCleared) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
            ctx.lineWidth = 2;
          } else if (isCurrent) {
            ctx.shadowColor = '#10b981';
            ctx.shadowBlur = 16 + pulse * 10;
            ctx.strokeStyle = `rgba(52, 211, 153, ${0.75 + pulse * 0.25})`;
            ctx.lineWidth = 4.5;
          } else {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 5]);
          }

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Gate end-posts
          ctx.fillStyle = isCleared ? 'rgba(16, 185, 129, 0.45)' : isCurrent ? '#6ee7b7' : 'rgba(148, 163, 184, 0.5)';
          ctx.beginPath();
          ctx.arc(x1, y1, isCurrent ? 4.5 : 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x2, y2, isCurrent ? 4.5 : 3, 0, Math.PI * 2);
          ctx.fill();

          // Gate Number badge
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.arc(mid.x, mid.y, isCurrent ? 13 : 11, 0, Math.PI * 2);
          ctx.fillStyle = isCleared ? 'rgba(6, 78, 59, 0.7)' : isCurrent ? '#065f46' : 'rgba(15, 23, 42, 0.85)';
          ctx.fill();
          ctx.lineWidth = isCurrent ? 2.5 : 1.5;
          ctx.strokeStyle = isCleared ? 'rgba(16, 185, 129, 0.5)' : isCurrent ? '#34d399' : 'rgba(148, 163, 184, 0.45)';
          ctx.stroke();

          ctx.fillStyle = isCleared ? 'rgba(110, 231, 183, 0.85)' : '#ffe600';
          ctx.shadowColor = isCleared ? 'transparent' : '#ffe600';
          ctx.shadowBlur = isCleared ? 0 : isCurrent ? 10 : 5;
          ctx.font = 'bold 12px Orbitron, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(isCleared ? '✓' : String(cp.order), mid.x, mid.y);
          ctx.restore();
        });
        ctx.restore();
      }

      // 3. Draw Obstacles using Hardware VSync Linear Equation (Endless) or Server Patrol State (Campaign)
      ctx.save();
      ctx.beginPath();
      ctx.rect(-halfW, -halfH, arenaWidth, arenaHeight);
      ctx.clip();

      const spawnPerfMap = obstacleSpawnPerfRef.current;
      const activeIds = new Set<string>();
      const frameDeltaMs = frameDt * 1000;

      // If game is paused, shift birth timestamps forward by frameDeltaMs so walls freeze in place cleanly
      if (currentState.status === 'paused') {
        for (const [id, t0] of spawnPerfMap.entries()) {
          spawnPerfMap.set(id, t0 + frameDeltaMs);
        }
      }

      const mePlayer = currentState.players[currentMyId];
      const mePos = localPlayerPosRef.current || (mePlayer ? { x: mePlayer.x, y: mePlayer.y } : null);
      // Uses live admin-configured hitboxRadius (default 6.5px = half of the 13px visual ball sprite)
      const meHitboxRadius = mePlayer
        ? mePlayer.hitboxRadius ?? mePlayer.radius * 0.5
        : 6.5;

      for (const obs of currentState.obstacles) {
        activeIds.add(obs.id);
        let spawnPerfMs = spawnPerfMap.get(obs.id);

        if (spawnPerfMs === undefined) {
          const initialAgeSec =
            obs.spawnTime !== undefined
              ? Math.max(0, currentState.elapsedTime - obs.spawnTime)
              : 0;
          spawnPerfMs = now - initialAgeSec * 1000;
          spawnPerfMap.set(obs.id, spawnPerfMs);
        }

        const ageSec = Math.max(0, (now - spawnPerfMs) / 1000);
        const baseX = obs.spawnX !== undefined ? obs.spawnX : obs.x;
        const baseY = obs.spawnY !== undefined ? obs.spawnY : obs.y;
        const drawX = baseX + obs.vx * ageSec;
        const drawY = baseY + obs.vy * ageSec;

        const baseRot = obs.spawnRotation !== undefined ? obs.spawnRotation : (obs.rotation || 0);
        const currentRot = baseRot + (obs.rotationSpeed || 0) * ageSec;

        // Frame-exact local collision check against the exact drawn wall coordinates (zero desync)
        if (
          isPlaying &&
          mePlayer &&
          mePlayer.alive &&
          !hasTriggeredHitRef.current &&
          mePos
        ) {
          let hit = false;
          if (obs.type === 'circle') {
            const r = obs.radius || 12;
            const dist = Math.hypot(mePos.x - drawX, mePos.y - drawY);
            hit = dist < meHitboxRadius + r;
          } else {
            const hw = obs.width / 2;
            const hh = obs.height / 2;
            let pX = mePos.x - drawX;
            let pY = mePos.y - drawY;

            if (currentRot !== 0) {
              const cos = Math.cos(-currentRot);
              const sin = Math.sin(-currentRot);
              const rx = pX * cos - pY * sin;
              const ry = pX * sin + pY * cos;
              pX = rx;
              pY = ry;
            }

            const closestX = Math.max(-hw, Math.min(pX, hw));
            const closestY = Math.max(-hh, Math.min(pY, hh));
            const dx = pX - closestX;
            const dy = pY - closestY;
            hit = dx * dx + dy * dy < meHitboxRadius * meHitboxRadius;
          }

          if (hit) {
            hasTriggeredHitRef.current = true;
            mePlayer.alive = false;
            if (onPlayerHitRef.current) {
              onPlayerHitRef.current();
            }
          }
        }

        const color = obs.color || '#ff2a6d';
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;

        if (obs.type === 'circle') {
          const r = obs.radius || 11;
          ctx.beginPath();
          ctx.arc(drawX, drawY, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          const w = obs.width;
          const h = obs.height;
          if (currentRot !== 0) {
            ctx.save();
            ctx.translate(drawX, drawY);
            ctx.rotate(currentRot);
            ctx.beginPath();
            ctx.roundRect(-w / 2, -h / 2, w, h, 4);
            ctx.fill();
            ctx.stroke();

            // Glowing center pivot dot for spinning obstacles
            if (obs.rotationSpeed) {
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          } else {
            ctx.beginPath();
            ctx.roundRect(drawX - w / 2, drawY - h / 2, w, h, 4);
            ctx.fill();
            ctx.stroke();
          }
        }
      }

      // Prune despawned obstacle IDs
      if (spawnPerfMap.size > activeIds.size + 10) {
        for (const id of spawnPerfMap.keys()) {
          if (!activeIds.has(id) && !id.startsWith('gate:')) {
            spawnPerfMap.delete(id);
          }
        }
      }

      ctx.restore(); // Remove clip

      // 4. Draw Playable Full-Screen Rectangular Boundary
      ctx.save();
      ctx.beginPath();
      ctx.rect(-halfW + 1.5, -halfH + 1.5, arenaWidth - 3, arenaHeight - 3);
      const isEndlessState = Boolean(
        currentState.isEndless ||
        (currentState.totalRoundsBeforeEndless ? currentState.currentTier > currentState.totalRoundsBeforeEndless : currentState.currentTier === 5)
      );
      ctx.strokeStyle =
        isEndlessState ? 'rgba(255, 0, 85, 0.85)' : 'rgba(0, 240, 255, 0.75)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      // 5. Draw Active Side Warning Bars flush along the 4 edges of the Rectangle
      const activeDirs = new Set(
        currentState.activeDirections && currentState.activeDirections.length > 0
          ? currentState.activeDirections
          : currentState.obstacles.map((o) => o.direction)
      );
      const hBarSpan = arenaWidth * 0.65;
      const vBarSpan = arenaHeight * 0.65;
      ctx.save();
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      if (activeDirs.has('north')) {
        ctx.strokeStyle = 'rgba(255, 42, 109, 0.9)';
        ctx.beginPath();
        ctx.moveTo(-hBarSpan / 2, -halfH + 3);
        ctx.lineTo(hBarSpan / 2, -halfH + 3);
        ctx.stroke();
      }
      if (activeDirs.has('south')) {
        ctx.strokeStyle = 'rgba(255, 119, 0, 0.9)';
        ctx.beginPath();
        ctx.moveTo(-hBarSpan / 2, halfH - 3);
        ctx.lineTo(hBarSpan / 2, halfH - 3);
        ctx.stroke();
      }
      if (activeDirs.has('east')) {
        ctx.strokeStyle = 'rgba(211, 0, 197, 0.9)';
        ctx.beginPath();
        ctx.moveTo(halfW - 3, -vBarSpan / 2);
        ctx.lineTo(halfW - 3, vBarSpan / 2);
        ctx.stroke();
      }
      if (activeDirs.has('west')) {
        ctx.strokeStyle = 'rgba(5, 213, 250, 0.9)';
        ctx.beginPath();
        ctx.moveTo(-halfW + 3, -vBarSpan / 2);
        ctx.lineTo(-halfW + 3, vBarSpan / 2);
        ctx.stroke();
      }
      ctx.restore();

      // 6. Draw Subtle Target Reticle for Local Pointer (clamped to rectangle)
      if (localPointerRef.current && currentState.players[currentMyId]?.alive) {
        const ptr = localPointerRef.current;
        const maxX = halfW - 13;
        const maxY = halfH - 13;
        const clampedX = Math.max(-maxX, Math.min(maxX, ptr.x));
        const clampedY = Math.max(-maxY, Math.min(maxY, ptr.y));

        ctx.save();
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(clampedX, clampedY, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 7. Draw Players (Eliminated players disappear completely)
      const lerpAlpha = Math.min(1, frameDt * 28);
      for (const id in currentState.players) {
        const player = currentState.players[id];
        if (!player.alive) {
          delete remotePlayerPosRef.current[id];
          continue;
        }
        const isMe = id === currentMyId;

        let drawX = player.x;
        let drawY = player.y;

        if (isMe && localPlayerPosRef.current) {
          drawX = localPlayerPosRef.current.x;
          drawY = localPlayerPosRef.current.y;
        } else {
          const prev = remotePlayerPosRef.current[id];
          if (!prev || Math.hypot(player.x - prev.x, player.y - prev.y) > 60) {
            remotePlayerPosRef.current[id] = { x: player.x, y: player.y };
          } else {
            prev.x += (player.x - prev.x) * lerpAlpha;
            prev.y += (player.y - prev.y) * lerpAlpha;
            drawX = prev.x;
            drawY = prev.y;
          }
        }

        ctx.save();
        ctx.translate(drawX, drawY);

        // Outer circle
        ctx.beginPath();
        ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
        ctx.fillStyle = player.color;
        ctx.fill();

        // Inner white core for sharp focus
        ctx.beginPath();
        ctx.arc(0, 0, player.radius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Player Name Label ("YOU" for local player, name for others)
        ctx.fillStyle = isMe ? '#00f0ff' : '#ffffff';
        ctx.font = 'bold 11px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(isMe ? 'YOU' : player.name, 0, -player.radius - 9);

        ctx.restore();
      }

      // 8. Draw Teleport Ripples & Floating Gate Score Popups (delta-time scaled)
      const remainingRipples: typeof ripplesRef.current = [];
      for (const r of ripplesRef.current) {
        r.radius += (r.maxRadius - r.radius) * Math.min(1, frameDt * 14);
        r.alpha -= frameDt * 2.7;
        if (r.alpha > 0.02) {
          ctx.save();
          ctx.strokeStyle = `rgba(0, 240, 255, ${r.alpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          remainingRipples.push(r);
        }
      }
      ripplesRef.current = remainingRipples;

      const remainingPopups: typeof popupsRef.current = [];
      for (const p of popupsRef.current) {
        p.y -= frameDt * 54;
        p.alpha -= frameDt * 1.35;
        if (p.alpha > 0.02) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.font = 'bold 12px Orbitron, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(p.text, p.x, p.y);
          ctx.restore();
          remainingPopups.push(p);
        }
      }
      popupsRef.current = remainingPopups;

      // 9. Non-blocking Campaign Level-Cleared Seamless Transition Banner
      const trans = currentState.campaignTransitionBanner;
      if (trans) {
        ctx.save();
        const boxW = Math.min(340, arenaWidth - 36);
        const boxH = 62;
        const boxY = -halfH + 22;
        ctx.fillStyle = 'rgba(6, 15, 28, 0.86)';
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.85)';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.roundRect(-boxW / 2, boxY, boxW, boxH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 13px Orbitron, sans-serif';
        ctx.fillText(`LEVEL ${trans.clearedLevel} CLEARED!  +${trans.bonusPoints}`, 0, boxY + 21);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 11px Orbitron, monospace';
        ctx.fillText(`NEXT: LEVEL ${trans.nextLevel} — ${trans.nextName.toUpperCase()}`, 0, boxY + 43);
        ctx.restore();
      }

      ctx.restore(); // Restore center translate
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [liveGameStateRef]);

  return (
    <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden select-none cursor-crosshair">
      <canvas
        ref={canvasRef}
        width={LOGICAL_WIDTH}
        height={LOGICAL_HEIGHT}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onMouseMove={onMouseMove}
        onTouchMove={onTouchMove}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="w-full h-full sm:w-auto sm:h-full sm:aspect-[9/16] block bg-[#090b12] touch-none"
      />
    </div>
  );
};
