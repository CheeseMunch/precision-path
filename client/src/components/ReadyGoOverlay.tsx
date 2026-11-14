import React, { useEffect, useRef } from 'react';
import { sound } from '../utils/sound';

interface ReadyGoOverlayProps {
  playTrigger: number;
  onFinished: () => void;
}

/**
 * Plays the Smash Bros "Ready... Go!" green-screen video (/sounds/ready_go.mp4)
 * and strips the #00ff00 green background in real time onto a transparent canvas overlay.
 */
export const ReadyGoOverlay: React.FC<ReadyGoOverlayProps> = ({ playTrigger, onFinished }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let animId: number | null = null;
    let active = true;

    video.currentTime = 0;
    video.muted = !sound.enabled || sound.volume <= 0;
    video.volume = Math.min(1, 0.76 * sound.volume);
    video.play().catch(() => {
      // Fallback if browser blocks unmuted autoplay: play muted
      video.muted = true;
      video.play().catch(() => {});
    });

    const renderFrame = () => {
      if (!active) return;

      if (!video.paused && !video.ended && video.readyState >= 2) {
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(video, 0, 0, w, h);

        const frame = ctx.getImageData(0, 0, w, h);
        const data = frame.data;

        // Chroma-key out the bright green background (#00ff00) with smooth edge despill
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          const maxRB = r > b ? r : b;
          const greenExcess = g - maxRB;

          if (g > 110 && greenExcess > 65) {
            // Pure green background -> fully transparent
            data[i + 3] = 0;
          } else if (g > 80 && greenExcess > 28) {
            // Anti-aliased edge pixel -> feather alpha and remove green spill
            const alphaFactor = 1 - (greenExcess - 28) / (65 - 28);
            data[i + 1] = maxRB; // clamp green channel to eliminate green halo
            data[i + 3] = Math.max(0, Math.min(255, Math.round(data[i + 3] * alphaFactor)));
          }
        }

        ctx.putImageData(frame, 0, 0);
      }

      if (!video.ended) {
        animId = requestAnimationFrame(renderFrame);
      }
    };

    animId = requestAnimationFrame(renderFrame);

    const handleEnded = () => {
      if (active) {
        onFinishedRef.current();
      }
    };

    video.addEventListener('ended', handleEnded);

    return () => {
      active = false;
      if (animId) cancelAnimationFrame(animId);
      video.removeEventListener('ended', handleEnded);
      video.pause();
    };
  }, [playTrigger]);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <video
        ref={videoRef}
        src="/sounds/ready_go.mp4"
        playsInline
        className="hidden"
      />
      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        className="w-[460px] max-w-[92vw] h-auto drop-shadow-[0_6px_24px_rgba(0,0,0,0.85)]"
      />
    </div>
  );
};
