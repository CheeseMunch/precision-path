import React, { useEffect, useRef, useCallback } from 'react';
import type { GameState, ClientInput } from '../../../shared/types';

interface GameCanvasProps {
  gameState: GameState;
  liveGameStateRef?: React.MutableRefObject<GameState | null>;
  myPlayerId: string;
  onSendInput: (input: ClientInput) => void;
}

const LOGICAL_WIDTH = 450;
const LOGICAL_HEIGHT = 800;

export const GameCanvas: React.FC<GameCanvasProps> = ({
  gameState,
  liveGameStateRef,
  myPlayerId,
  onSendInput,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const inputThrottleRef = useRef<number>(0);
  const gameStateRef = useRef<GameState>(gameState);
  const myPlayerIdRef = useRef<string>(myPlayerId);
  const localPointerRef = useRef<{ x: number; y: number } | null>(null);
  // Zero-latency client-predicted position for the local player ball
  const localPlayerPosRef = useRef<{ x: number; y: number } | null>(null);
  // Smoothed display positions for remote multiplayer players
  const remotePlayerPosRef = useRef<Record<string, { x: number; y: number }>>({});
  // Monotonic per-obstacle display coordinates driven by the native display frame clock
  const obstacleDisplayRef = useRef<Map<string, { x: number; y: number }>>(new Map());
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
      obstacleDisplayRef.current.clear();
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
        const isTeleport = distFromPlayer > 38;
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

    let pulse = 0;
    let lastFrameTime = performance.now();

    const render = (now: number) => {
      const frameDt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
      lastFrameTime = now;
      pulse += frameDt * 2.4;

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

      // 1. Draw Subtle Background Grid
      ctx.save();
      ctx.strokeStyle = '#101524';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(centerX, centerY);

      // 2. Inner Rectangular Guide Frames & Center Crosshair
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.06)';
      ctx.lineWidth = 1;
      for (const scale of [0.33, 0.66]) {
        const gw = arenaWidth * scale;
        const gh = arenaHeight * scale;
        ctx.beginPath();
        ctx.roundRect(-gw / 2, -gh / 2, gw, gh, 14);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.14)';
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(16, 0);
      ctx.moveTo(0, -16);
      ctx.lineTo(0, 16);
      ctx.stroke();

      // 3. Draw Obstacles using Monotonic Frame-Clock Integration (Zero End-of-Screen Stutter)
      ctx.save();
      ctx.beginPath();
      ctx.rect(-halfW, -halfH, arenaWidth, arenaHeight);
      ctx.clip();

      const dispMap = obstacleDisplayRef.current;
      const activeIds = new Set<string>();

      for (const obs of currentState.obstacles) {
        activeIds.add(obs.id);
        let disp = dispMap.get(obs.id);

        if (!disp) {
          disp = { x: obs.x, y: obs.y };
          dispMap.set(obs.id, disp);
        } else if (isPlaying) {
          // Advance smoothly by constant velocity on the local display refresh clock
          disp.x += obs.vx * frameDt;
          disp.y += obs.vy * frameDt;

          // Gentle forward-only drift convergence so network jitter never pulls a wall backward
          const errX = obs.x - disp.x;
          const errY = obs.y - disp.y;
          if (obs.vx !== 0 && Math.sign(errX) === Math.sign(obs.vx)) {
            disp.x += errX * 0.08;
          } else if (Math.abs(errX) > 18) {
            disp.x += errX * 0.15;
          }
          if (obs.vy !== 0 && Math.sign(errY) === Math.sign(obs.vy)) {
            disp.y += errY * 0.08;
          } else if (Math.abs(errY) > 18) {
            disp.y += errY * 0.15;
          }
        }

        const color = obs.color || '#ff2a6d';
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;

        if (obs.type === 'circle') {
          const r = obs.radius || 11;
          ctx.beginPath();
          ctx.arc(disp.x, disp.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          const w = obs.width;
          const h = obs.height;
          ctx.beginPath();
          ctx.roundRect(disp.x - w / 2, disp.y - h / 2, w, h, 4);
          ctx.fill();
          ctx.stroke();
        }
      }

      // Prune despawned obstacle IDs
      if (dispMap.size > activeIds.size + 10) {
        for (const id of dispMap.keys()) {
          if (!activeIds.has(id)) {
            dispMap.delete(id);
          }
        }
      }

      ctx.restore(); // Remove clip

      // 4. Draw Playable Full-Screen Rectangular Boundary
      ctx.save();
      ctx.beginPath();
      ctx.rect(-halfW + 1.5, -halfH + 1.5, arenaWidth - 3, arenaHeight - 3);
      ctx.strokeStyle =
        currentState.currentTier === 5 ? 'rgba(255, 0, 85, 0.85)' : 'rgba(0, 240, 255, 0.75)';
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

        // Pulsing halo on local player
        if (isMe) {
          ctx.beginPath();
          ctx.arc(0, 0, player.radius + 5 + Math.sin(pulse * 1.8) * 2, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

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
