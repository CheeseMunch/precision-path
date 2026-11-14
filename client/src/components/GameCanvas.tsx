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

      // 3. Draw Obstacles clipped cleanly to outer rectangular phone perimeter
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(-halfW - 18, -halfH - 18, arenaWidth + 36, arenaHeight + 36, 26);
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

      // 4. Draw Playable Phone-Screen Rectangular Boundary
      ctx.save();
      ctx.shadowColor = currentState.currentTier === 5 ? '#ff0055' : '#00f0ff';
      ctx.shadowBlur = 16 + Math.sin(pulse) * 5;
      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, arenaWidth, arenaHeight, 22);
      ctx.strokeStyle = currentState.currentTier === 5 ? 'rgba(255, 0, 85, 0.85)' : 'rgba(0, 240, 255, 0.8)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();

      // 5. Draw Active Side Warning Bars along the 4 edges of the Rectangle
      const activeDirs = new Set(
        currentState.activeDirections && currentState.activeDirections.length > 0
          ? currentState.activeDirections
          : currentState.obstacles.map((o) => o.direction)
      );
      const edgeOffset = 10;
      const hBarSpan = arenaWidth * 0.55;
      const vBarSpan = arenaHeight * 0.55;
      ctx.save();
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      if (activeDirs.has('north')) {
        ctx.strokeStyle = 'rgba(255, 42, 109, 0.85)';
        ctx.shadowColor = '#ff2a6d';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(-hBarSpan / 2, -halfH - edgeOffset);
        ctx.lineTo(hBarSpan / 2, -halfH - edgeOffset);
        ctx.stroke();
      }
      if (activeDirs.has('south')) {
        ctx.strokeStyle = 'rgba(255, 119, 0, 0.85)';
        ctx.shadowColor = '#ff7700';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(-hBarSpan / 2, halfH + edgeOffset);
        ctx.lineTo(hBarSpan / 2, halfH + edgeOffset);
        ctx.stroke();
      }
      if (activeDirs.has('east')) {
        ctx.strokeStyle = 'rgba(211, 0, 197, 0.85)';
        ctx.shadowColor = '#d300c5';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(halfW + edgeOffset, -vBarSpan / 2);
        ctx.lineTo(halfW + edgeOffset, vBarSpan / 2);
        ctx.stroke();
      }
      if (activeDirs.has('west')) {
        ctx.strokeStyle = 'rgba(5, 213, 250, 0.85)';
        ctx.shadowColor = '#05d5fa';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(-halfW - edgeOffset, -vBarSpan / 2);
        ctx.lineTo(-halfW - edgeOffset, vBarSpan / 2);
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
    <div className="relative flex items-center justify-center w-full h-full pt-12 pb-3 select-none cursor-crosshair">
      <canvas
        ref={canvasRef}
        width={500}
        height={850}
        onMouseMove={onMouseMove}
        onTouchMove={onTouchMove}
        onTouchStart={onTouchStart}
        className="max-w-[94vw] max-h-[85vh] w-auto h-auto aspect-[500/850] rounded-[28px] border border-cyber-border/60 shadow-2xl bg-[#090b12] touch-none"
      />
    </div>
  );
};
