import React, { useEffect, useRef, useCallback } from 'react';
import type { GameState, ClientInput } from '../../../shared/types';

interface GameCanvasProps {
  gameState: GameState;
  myPlayerId: string;
  onSendInput: (input: ClientInput) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, myPlayerId, onSendInput }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const inputThrottleRef = useRef<number>(0);
  const gameStateRef = useRef<GameState>(gameState);
  const myPlayerIdRef = useRef<string>(myPlayerId);
  const localPointerRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const lastScoreRef = useRef<number>(0);
  const popupsRef = useRef<
    Array<{ x: number; y: number; text: string; color: string; alpha: number }>
  >([]);
  const ripplesRef = useRef<
    Array<{ x: number; y: number; radius: number; maxRadius: number; alpha: number }>
  >([]);

  // Keep refs updated without restarting the 60FPS animation loop
  gameStateRef.current = gameState;
  myPlayerIdRef.current = myPlayerId;

  // Detect gate score increases and spawn floating "+100 GATE!" popups
  useEffect(() => {
    const me = gameState.players[myPlayerId];
    if (!me) return;
    if (gameState.status === 'countdown' || gameState.elapsedTime < 0.2) {
      lastScoreRef.current = me.score;
      return;
    }
    if (me.score > lastScoreRef.current) {
      const gained = me.score - lastScoreRef.current;
      const isStageUp = gained >= 400;
      popupsRef.current.push({
        x: me.x,
        y: me.y - 26,
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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - centerX) * scaleX,
      y: (clientY - centerY) * scaleY,
    };
  }, []);

  // Send immediate click/tap (teleport if distant) or throttled drag movement
  const sendMoveOrTeleport = useCallback(
    (clientX: number, clientY: number, isInitialTapOrClick: boolean) => {
      const coords = toArenaCoords(clientX, clientY);
      if (!coords) return;

      localPointerRef.current = coords;
      const me = gameStateRef.current.players[myPlayerIdRef.current];
      const distFromPlayer = me ? Math.hypot(coords.x - me.x, coords.y - me.y) : 999;

      if (isInitialTapOrClick) {
        const isTeleport = distFromPlayer > 38;
        inputThrottleRef.current = performance.now();
        onSendInput({ x: coords.x, y: coords.y, isTeleport });

        if (isTeleport && me?.alive) {
          ripplesRef.current.push({
            x: coords.x,
            y: coords.y,
            radius: 8,
            maxRadius: 34,
            alpha: 0.9,
          });
          popupsRef.current.push({
            x: coords.x,
            y: coords.y - 22,
            text: 'TELEPORT',
            color: '#00f0ff',
            alpha: 0.9,
          });
        }
        return;
      }

      const now = performance.now();
      if (now - inputThrottleRef.current > 18) {
        inputThrottleRef.current = now;
        onSendInput({ x: coords.x, y: coords.y, isTeleport: false });
      }
    },
    [onSendInput, toArenaCoords]
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

  // Persistent 60FPS+ Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let pulse = 0;

    const render = () => {
      pulse += 0.04;
      const currentState = gameStateRef.current;
      const currentMyId = myPlayerIdRef.current;

      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const arenaWidth = currentState.arenaWidth || 450;
      const arenaHeight = currentState.arenaHeight || 800;
      const halfW = arenaWidth / 2;
      const halfH = arenaHeight / 2;

      ctx.clearRect(0, 0, width, height);

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

      // 3. Draw Obstacles across full playable rectangle
      ctx.save();
      ctx.beginPath();
      ctx.rect(-halfW, -halfH, arenaWidth, arenaHeight);
      ctx.clip();

      for (const obs of currentState.obstacles) {
        ctx.save();
        ctx.translate(obs.x, obs.y);
        if (obs.rotation) {
          ctx.rotate(obs.rotation);
        }

        ctx.fillStyle = obs.color || '#ff2a6d';
        ctx.shadowColor = obs.color || '#ff2a6d';
        ctx.shadowBlur = 12;

        if (obs.type === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius || 11, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const w = obs.width;
          const h = obs.height;
          ctx.beginPath();
          ctx.roundRect(-w / 2, -h / 2, w, h, 5);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore(); // Remove clip

      // 4. Draw Playable Full-Screen Rectangular Boundary
      ctx.save();
      ctx.shadowColor = currentState.currentTier === 5 ? '#ff0055' : '#00f0ff';
      ctx.shadowBlur = 14 + Math.sin(pulse) * 4;
      ctx.beginPath();
      ctx.rect(-halfW + 1.5, -halfH + 1.5, arenaWidth - 3, arenaHeight - 3);
      ctx.strokeStyle = currentState.currentTier === 5 ? 'rgba(255, 0, 85, 0.85)' : 'rgba(0, 240, 255, 0.75)';
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
        ctx.shadowColor = '#ff2a6d';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(-hBarSpan / 2, -halfH + 3);
        ctx.lineTo(hBarSpan / 2, -halfH + 3);
        ctx.stroke();
      }
      if (activeDirs.has('south')) {
        ctx.strokeStyle = 'rgba(255, 119, 0, 0.9)';
        ctx.shadowColor = '#ff7700';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(-hBarSpan / 2, halfH - 3);
        ctx.lineTo(hBarSpan / 2, halfH - 3);
        ctx.stroke();
      }
      if (activeDirs.has('east')) {
        ctx.strokeStyle = 'rgba(211, 0, 197, 0.9)';
        ctx.shadowColor = '#d300c5';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(halfW - 3, -vBarSpan / 2);
        ctx.lineTo(halfW - 3, vBarSpan / 2);
        ctx.stroke();
      }
      if (activeDirs.has('west')) {
        ctx.strokeStyle = 'rgba(5, 213, 250, 0.9)';
        ctx.shadowColor = '#05d5fa';
        ctx.shadowBlur = 12;
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

      // 7. Draw Players
      for (const id in currentState.players) {
        const player = currentState.players[id];
        const isMe = id === currentMyId;

        ctx.save();
        ctx.translate(player.x, player.y);

        if (!player.alive) {
          // Ghost mode (Eliminated)
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
          ctx.fillStyle = '#666';
          ctx.fill();
          ctx.strokeStyle = '#999';
          ctx.setLineDash([4, 4]);
          ctx.stroke();
        } else {
          // Alive Player
          ctx.shadowColor = player.color;
          ctx.shadowBlur = isMe ? 20 : 12;

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
        }

        // Player Name Label ("YOU" for local player, name for others)
        ctx.shadowBlur = 0;
        ctx.fillStyle = isMe ? '#00f0ff' : '#ffffff';
        ctx.font = 'bold 11px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(isMe ? 'YOU' : player.name, 0, -player.radius - 9);

        ctx.restore();
      }

      // 8. Draw Teleport Ripples & Floating Gate Score Popups
      const remainingRipples: typeof ripplesRef.current = [];
      for (const r of ripplesRef.current) {
        r.radius += (r.maxRadius - r.radius) * 0.22;
        r.alpha -= 0.045;
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
        p.y -= 0.9;
        p.alpha -= 0.022;
        if (p.alpha > 0.02) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
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
  }, []);

  return (
    <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden select-none cursor-crosshair">
      <canvas
        ref={canvasRef}
        width={450}
        height={800}
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
