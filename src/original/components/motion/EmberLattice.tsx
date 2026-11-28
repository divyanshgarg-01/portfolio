'use client';

import { useEffect, useRef } from 'react';
import { useMotion } from './MotionProvider';

export function EmberLattice({ density = 'medium' }: { density?: 'low' | 'medium' | 'high' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { reduced } = useMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const gap = window.innerWidth < 700 ? 20 : density === 'low' ? 30 : density === 'high' ? 20 : 24;
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = true;
    let visible = true;
    const pointer = { x: -1000, y: -1000 };
    const dpr = Math.min(window.devicePixelRatio || 1, reduced ? 1 : 1.75);

    const resize = () => {
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();

    const draw = (time: number) => {
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const progress = reduced ? 0.3 : (time % 15000) / 15000;
      const centreX = progress * (width + 300) - 150;
      const cols = Math.ceil(width / gap) + 1;
      const rows = Math.ceil(height / gap) + 1;

      for (let col = 0; col < cols; col += 1) {
        for (let row = 0; row < rows; row += 1) {
          const x = col * gap;
          const y = row * gap + 12;
          const distance = Math.abs(x - centreX);
          const envelope = Math.exp(-(distance * distance) / 26000);
          const wave = Math.sin(distance / 46 - time / 720) * envelope * 13;
          let px = x;
          let py = y + wave;

          if (!reduced) {
            const dx = px - pointer.x;
            const dy = py - pointer.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 160 && dist > 0) {
              const force = (1 - dist / 160) * 22;
              px += (dx / dist) * force;
              py += (dy / dist) * force;
            }
          }

          const heat = Math.min(1, envelope * 1.5 + (reduced ? 0.15 : 0));
          const alpha = 0.08 + heat * 0.5;
          const radius = 0.7 + heat * 1.4;
          context.fillStyle = heat > 0.45
            ? `rgba(216,168,118,${alpha.toFixed(3)})`
            : `rgba(184,137,91,${alpha.toFixed(3)})`;
          context.beginPath();
          context.arc(px, py, radius, 0, Math.PI * 2);
          context.fill();
        }
      }
      if (!reduced && running && visible) frame = requestAnimationFrame(draw);
    };

    const onPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
    };
    const onVisibility = () => {
      visible = !document.hidden;
      if (visible && !reduced && running) frame = requestAnimationFrame(draw);
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      if (visible && !reduced && running) frame = requestAnimationFrame(draw);
      else cancelAnimationFrame(frame);
    });

    observer.observe(canvas);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    frame = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduced, density]);

  return <canvas ref={canvasRef} aria-hidden="true" />;
}
