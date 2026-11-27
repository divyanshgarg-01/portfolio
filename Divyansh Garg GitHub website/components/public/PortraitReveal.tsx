'use client';

import { useEffect, useRef } from 'react';

type PortraitRevealProps = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
};

type Candidate = {
  x: number;
  y: number;
  color: string;
  alpha: number;
};

type Particle = Candidate & {
  sx: number;
  sy: number;
  size: number;
  delay: number;
  duration: number;
  wobble: number;
  phase: number;
};

type EdgeParticle = {
  x: number;
  y: number;
  size: number;
  alpha: number;
  phase: number;
  radius: number;
  depth: number;
  polarity: number;
  dispX: number;
  dispY: number;
  velX: number;
  velY: number;
  color: string;
};

const REVEAL_MS = 2300;
const IMAGE_FADE_START = 880;
const IMAGE_FADE_DURATION = 860;
const DUST_FADE_START = 1420;
const DUST_FADE_DURATION = 820;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

export function PortraitReveal({ src, alt, width, height }: PortraitRevealProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!root || !canvas || !image || !src) return;

    let observer: IntersectionObserver | null = null;
    let frame = 0;
    let started = false;
    let disposed = false;
    let startedAt = 0;
    let viewWidth = 0;
    let viewHeight = 0;
    let particles: Particle[] = [];
    let edgeParticles: EdgeParticle[] = [];
    const shimmer = root.querySelector<HTMLSpanElement>('.portrait-reveal__shimmer');
    const fineQuery = window.matchMedia('(pointer: fine)');
    let fine = fineQuery.matches;
    const pointer = {
      x: 0,
      y: 0,
      smoothX: 0,
      smoothY: 0,
      vx: 0,
      vy: 0,
      focus: 0,
      active: false,
      near: false,
    };

    const resetTransforms = () => {
      image.style.removeProperty('transform');
      canvas.style.removeProperty('transform');
      if (shimmer) shimmer.style.removeProperty('transform');
    };

    const showStatic = () => {
      if (disposed) return;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      root.dataset.state = 'static';
      delete root.dataset.revealing;
      image.style.removeProperty('opacity');
      resetTransforms();
    };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      showStatic();
      return () => {
        disposed = true;
      };
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      showStatic();
      return () => {
        disposed = true;
      };
    }

    root.dataset.state = 'armed';

    const resize = () => {
      const rect = root.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      viewWidth = Math.max(1, rect.width);
      viewHeight = Math.max(1, rect.height);
      canvas.width = Math.round(viewWidth * dpr);
      canvas.height = Math.round(viewHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return rect;
    };

    const buildParticles = (rect: DOMRect) => {
      const sampleWidth = Math.max(72, Math.min(180, Math.round(rect.width / 2.8)));
      const sampleHeight = Math.max(96, Math.round(sampleWidth * (image.naturalHeight / image.naturalWidth)));
      const sample = document.createElement('canvas');
      sample.width = sampleWidth;
      sample.height = sampleHeight;
      const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
      if (!sampleCtx) throw new Error('Portrait sampling unavailable');
      sampleCtx.drawImage(image, 0, 0, sampleWidth, sampleHeight);
      const pixels = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;

      const candidates: Candidate[] = [];
      for (let y = 1; y < sampleHeight; y += 2) {
        for (let x = 1; x < sampleWidth; x += 2) {
          const index = (y * sampleWidth + x) * 4;
          if (pixels[index + 3] < 40) continue;
          const luminance = 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
          if (luminance < 18 && Math.random() > 0.28) continue;
          const warmth = luminance > 145 ? 0.38 : 0.24;
          const r = Math.round(pixels[index] * (1 - warmth) + 244 * warmth);
          const g = Math.round(pixels[index + 1] * (1 - warmth) + 232 * warmth);
          const b = Math.round(pixels[index + 2] * (1 - warmth) + 210 * warmth);
          candidates.push({
            x: (x / sampleWidth) * viewWidth,
            y: (y / sampleHeight) * viewHeight,
            color: `rgb(${r}, ${g}, ${b})`,
            alpha: Math.min(0.95, 0.34 + (luminance / 255) * 0.52 + Math.random() * 0.1),
          });
        }
      }
      if (!candidates.length) throw new Error('Portrait has no sampleable pixels');

      for (let i = candidates.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }

      const targetCount = Math.min(
        candidates.length,
        Math.max(2600, Math.min(7600, Math.round((viewWidth * viewHeight) / 46))),
      );

      root.dataset.particleCount = String(targetCount);
      particles = candidates.slice(0, targetCount).map((candidate) => {
        const angle = Math.random() * Math.PI * 2;
        const spread = 0.1 + Math.pow(Math.random(), 1.7) * 0.72;
        return {
          ...candidate,
          sx: candidate.x + Math.cos(angle) * viewWidth * spread,
          sy: candidate.y + Math.sin(angle) * viewHeight * spread,
          size: 0.45 + Math.random() * 0.75 + (Math.random() > 0.985 ? 0.45 : 0),
          delay: Math.random() * 460,
          duration: 760 + Math.random() * 620 + spread * 220,
          wobble: 1.5 + Math.random() * 7,
          phase: Math.random() * Math.PI * 2,
        };
      });

      const edgeCount = Math.min(28, Math.max(18, Math.round(viewWidth / 20)));
      edgeParticles = Array.from({ length: edgeCount }, (_, index) => {
        const side = index % 4;
        const along = (index + 0.5) / edgeCount;
        const candidate = candidates[index % candidates.length];
        const x = side === 0 ? along * viewWidth : side === 1 ? viewWidth : side === 2 ? (1 - along) * viewWidth : 0;
        const y = side === 0 ? 0 : side === 1 ? along * viewHeight : side === 2 ? viewHeight : (1 - along) * viewHeight;
        return {
          x,
          y,
          size: 0.7 + Math.random() * 0.7,
          alpha: 0.16 + Math.random() * 0.18,
          phase: Math.random() * Math.PI * 2,
          radius: 2 + Math.random() * 8,
          depth: 0.35 + Math.random() * 0.65,
          polarity: Math.random() < 0.32 ? -1 : 1,
          dispX: 0,
          dispY: 0,
          velX: 0,
          velY: 0,
          color: candidate.color,
        };
      });
    };

    const draw = (now: number) => {
      if (disposed) return;
      if (!startedAt) startedAt = now;
      const elapsed = now - startedAt;
      ctx.clearRect(0, 0, viewWidth, viewHeight);

      const interactive = fine && pointer.active;
      if (interactive) {
        pointer.smoothX += (pointer.x - pointer.smoothX) * 0.11;
        pointer.smoothY += (pointer.y - pointer.smoothY) * 0.11;
      }
      const pointerVx = pointer.vx;
      const pointerVy = pointer.vy;
      pointer.vx *= 0.82;
      pointer.vy *= 0.82;
      pointer.focus += ((interactive && pointer.near ? 1 : 0) - pointer.focus) * 0.09;

      if (elapsed < REVEAL_MS) {
        const imageProgress = easeInOutCubic(clamp((elapsed - IMAGE_FADE_START) / IMAGE_FADE_DURATION, 0, 1));
        const dustFade = 1 - easeInOutCubic(clamp((elapsed - DUST_FADE_START) / DUST_FADE_DURATION, 0, 1));
        image.style.opacity = imageProgress.toFixed(3);

        for (const particle of particles) {
          const local = clamp((elapsed - particle.delay) / particle.duration, 0, 1);
          if (local <= 0) continue;
          const assembled = easeInOutCubic(local);
          const residual = 1 - assembled;
          const x = particle.sx + (particle.x - particle.sx) * assembled + Math.sin(now * 0.0016 + particle.phase) * particle.wobble * residual;
          const y = particle.sy + (particle.y - particle.sy) * assembled + Math.cos(now * 0.0013 + particle.phase) * particle.wobble * residual;
          const birth = Math.min(1, local * 6);
          ctx.globalAlpha = particle.alpha * birth * (1 - imageProgress * 0.5) * dustFade;
          ctx.fillStyle = particle.color;
          ctx.fillRect(x, y, particle.size, particle.size);
        }
      } else {
        root.dataset.state = 'complete';
        delete root.dataset.revealing;
        image.style.opacity = '1';

        const normalizedX = clamp((pointer.smoothX / viewWidth - 0.5) * 2, -1, 1);
        const normalizedY = clamp((pointer.smoothY / viewHeight - 0.5) * 2, -1, 1);
        image.style.transform = `translate3d(${(normalizedX * 3.2 * pointer.focus).toFixed(2)}px, ${(normalizedY * 2.4 * pointer.focus).toFixed(2)}px, 0) scale(1.012)`;
        canvas.style.transform = `translate3d(${(normalizedX * 5.5 * pointer.focus).toFixed(2)}px, ${(normalizedY * 4 * pointer.focus).toFixed(2)}px, 0)`;
        if (shimmer) shimmer.style.transform = `translate3d(${(-normalizedX * 4 * pointer.focus).toFixed(2)}px, ${(-normalizedY * 3 * pointer.focus).toFixed(2)}px, 0)`;

        const drift = now * 0.00036;
        for (const particle of edgeParticles) {
          if (pointer.focus > 0.01) {
            const dx = particle.x + particle.dispX - pointer.smoothX;
            const dy = particle.y + particle.dispY - pointer.smoothY;
            const distanceSq = dx * dx + dy * dy;
            const radius = 70 + particle.depth * 74;
            if (distanceSq < radius * radius) {
              const distance = Math.sqrt(distanceSq) || 1;
              const strength = (1 - distance / radius) ** 2 * pointer.focus;
              const force = strength * (0.018 + particle.depth * 0.05) * particle.polarity;
              particle.velX += (dx / distance) * force + pointerVx * strength * particle.depth * 0.0032;
              particle.velY += (dy / distance) * force + pointerVy * strength * particle.depth * 0.0032;
            }
          }
          particle.velX *= 0.86;
          particle.velY *= 0.86;
          particle.dispX = (particle.dispX + particle.velX) * 0.92;
          particle.dispY = (particle.dispY + particle.velY) * 0.92;
          const displacement = Math.hypot(particle.dispX, particle.dispY);
          const limit = 4 + particle.depth * 9;
          if (displacement > limit) {
            particle.dispX = (particle.dispX / displacement) * limit;
            particle.dispY = (particle.dispY / displacement) * limit;
          }

          ctx.globalAlpha = particle.alpha * (0.62 + 0.38 * Math.sin(drift * 2 + particle.phase)) * (1 + pointer.focus * 0.25);
          ctx.fillStyle = particle.color;
          ctx.fillRect(
            particle.x + particle.dispX + Math.sin(drift + particle.phase) * particle.radius,
            particle.y + particle.dispY + Math.cos(drift * 0.8 + particle.phase) * particle.radius,
            particle.size,
            particle.size,
          );
        }
      }

      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };

    const begin = () => {
      if (disposed || frame) return;
      try {
        const rect = resize();
        buildParticles(rect);
        resetTransforms();
        startedAt = 0;
        root.dataset.revealing = 'true';
        frame = requestAnimationFrame(draw);
      } catch {
        showStatic();
      }
    };

    const start = () => {
      if (started) return;
      started = true;
      if (image.complete && image.naturalWidth > 0) {
        begin();
      } else {
        image.addEventListener('load', begin, { once: true });
        image.addEventListener('error', showStatic, { once: true });
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      } else if (started && !frame && !disposed) {
        frame = requestAnimationFrame(draw);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!fine) return;
      const rect = root.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const margin = 90;
      pointer.near = x > -margin && x < rect.width + margin && y > -margin && y < rect.height + margin;
      if (!pointer.active) {
        pointer.smoothX = x;
        pointer.smoothY = y;
        pointer.vx = 0;
        pointer.vy = 0;
      } else {
        pointer.vx = x - pointer.x;
        pointer.vy = y - pointer.y;
      }
      pointer.x = x;
      pointer.y = y;
      pointer.active = true;
    };

    const onPointerEnd = () => {
      pointer.active = false;
      pointer.near = false;
      pointer.vx = 0;
      pointer.vy = 0;
    };

    const onPointerChange = () => {
      fine = fineQuery.matches;
      if (!fine) onPointerEnd();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerEnd);
    window.addEventListener('blur', onPointerEnd);
    fineQuery.addEventListener('change', onPointerChange);

    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          observer = null;
          start();
        }
      }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
      observer.observe(root);
    } else {
      start();
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      image.removeEventListener('load', begin);
      image.removeEventListener('error', showStatic);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerleave', onPointerEnd);
      window.removeEventListener('blur', onPointerEnd);
      fineQuery.removeEventListener('change', onPointerChange);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [src]);

  return (
    <div ref={rootRef} className="portrait-reveal" data-particle-portrait data-state="idle">
      <canvas ref={canvasRef} className="portrait-reveal__canvas" aria-hidden="true" />
      <img
        ref={imageRef}
        className="portrait-reveal__image"
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
      />
      <span className="portrait-reveal__shimmer" aria-hidden="true" />
    </div>
  );
}
