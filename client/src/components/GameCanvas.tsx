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

  // Keep refs updated without restarting the 60FPS animation loop
  gameStateRef.current = gameState;
  myPlayerIdRef.current = myPlayerId;

  // Send scaled input to server throttled to ~50Hz
  const handlePointerCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Scale DOM pixels to internal 680x680 canvas coordinate space
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (clientX - centerX) * scaleX;
    const y = (clientY - centerY) * scaleY;

    localPointerRef.current = { x, y };

    const now = performance.now();
    if (now - inputThrottleRef.current > 18) {
      inputThrottleRef.current = now;
      onSendInput({ x, y });
    }
  }, [onSendInput]);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    handlePointerCoords(e.clientX, e.clientY);
  };

  const onTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      handlePointerCoords(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const onTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      handlePointerCoords(e.touches[0].clientX, e.touches[0].clientY);
    }
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
      const arenaRadius = currentState.arenaRadius || 325;

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

      // 2. Inner Concentric Guide Rings & Crosshair
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.06)';
      ctx.lineWidth = 1;
      for (let r = 65; r < arenaRadius; r += 65) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.14)';
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(16, 0);
      ctx.moveTo(0, -16);
      ctx.lineTo(0, 16);
      ctx.stroke();

      // 3. Draw Obstacles clipped cleanly to outer perimeter
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, arenaRadius + 28, 0, Math.PI * 2);
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

      // 4. Draw Arena Boundary Ring
      ctx.save();
      ctx.shadowColor = currentState.currentTier === 5 ? '#ff0055' : '#00f0ff';
      ctx.shadowBlur = 16 + Math.sin(pulse) * 5;
      ctx.beginPath();
      ctx.arc(0, 0, arenaRadius, 0, Math.PI * 2);
      ctx.strokeStyle = currentState.currentTier === 5 ? 'rgba(255, 0, 85, 0.8)' : 'rgba(0, 240, 255, 0.75)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();

      // 5. Draw Active Side Warning Arcs on Outer Rim (1 side in L1, 2 in L2, 3 in L3, 4 in L4+)
      const activeDirs = new Set(
        currentState.activeDirections && currentState.activeDirections.length > 0
          ? currentState.activeDirections
          : currentState.obstacles.map((o) => o.direction)
      );
      const arcRadius = arenaRadius + 14;
      ctx.save();
      ctx.lineWidth = 4;
      if (activeDirs.has('north')) {
        ctx.strokeStyle = 'rgba(255, 42, 109, 0.75)';
        ctx.beginPath();
        ctx.arc(0, 0, arcRadius, -Math.PI * 0.7, -Math.PI * 0.3);
        ctx.stroke();
      }
      if (activeDirs.has('south')) {
        ctx.strokeStyle = 'rgba(255, 119, 0, 0.75)';
        ctx.beginPath();
        ctx.arc(0, 0, arcRadius, Math.PI * 0.3, Math.PI * 0.7);
        ctx.stroke();
      }
      if (activeDirs.has('east')) {
        ctx.strokeStyle = 'rgba(211, 0, 197, 0.75)';
        ctx.beginPath();
        ctx.arc(0, 0, arcRadius, -Math.PI * 0.2, Math.PI * 0.2);
        ctx.stroke();
      }
      if (activeDirs.has('west')) {
        ctx.strokeStyle = 'rgba(5, 213, 250, 0.75)';
        ctx.beginPath();
        ctx.arc(0, 0, arcRadius, Math.PI * 0.8, Math.PI * 1.2);
        ctx.stroke();
      }
      ctx.restore();

      // 6. Draw Subtle Target Reticle for Local Pointer
      if (localPointerRef.current && currentState.players[currentMyId]?.alive) {
        const ptr = localPointerRef.current;
        const dist = Math.hypot(ptr.x, ptr.y);
        const maxDist = arenaRadius - 13;
        const clampedX = dist <= maxDist ? ptr.x : (ptr.x / dist) * maxDist;
        const clampedY = dist <= maxDist ? ptr.y : (ptr.y / dist) * maxDist;

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

        // Player Name Label
        ctx.shadowBlur = 0;
        ctx.fillStyle = isMe ? '#00f0ff' : '#ffffff';
        ctx.font = 'bold 11px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(isMe ? `YOU (${player.name})` : player.name, 0, -player.radius - 9);

        ctx.restore();
      }

      ctx.restore(); // Restore center translate
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return (
    <div className="relative flex items-center justify-center w-full h-full select-none cursor-crosshair">
      <canvas
        ref={canvasRef}
        width={850}
        height={850}
        onMouseMove={onMouseMove}
        onTouchMove={onTouchMove}
        onTouchStart={onTouchStart}
        className="max-w-[94vw] max-h-[82vh] aspect-square rounded-full border border-cyber-border/50 shadow-2xl bg-[#090b12] touch-none"
      />
    </div>
  );
};
