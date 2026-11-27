'use client';

import { useEffect, useRef } from 'react';
import { HeroNameField } from './HeroNameField';
import { useMotion } from './MotionProvider';

type Density = 'low' | 'medium' | 'high';

interface Particle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  depth: number;
  phase: number;
  twinkle: number;
  speedX: number;
  speedY: number;
  colorIndex: number;
  polarity: number;
  dispX: number;
  dispY: number;
  velX: number;
  velY: number;
}

interface ConstellationLine {
  a: Particle;
  b: Particle;
  phase: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  width: number;
  life: number;
  maxLife: number;
  color: string;
  brightness: number;
  head: number;
  sparks: boolean;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

const TAU = Math.PI * 2;

const STAR_COLORS = [
  '#f5f5f7',
  '#d9dbe0',
  '#eee6d8',
  '#dbc198',
  '#cbd8ea',
  '#cfc7e0',
  '#e2c8c5',
  '#c9a273',
];
const METEOR_RGB = ['245,245,247', '238,227,211', '207,219,239'];

function gaussian(): number {
  const u = Math.max(Math.random(), 0.0001);
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function wrap(value: number, max: number): number {
  return ((value % max) + max) % max;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function MicroCosmos({ density = 'medium' }: { density?: Density }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { reduced } = useMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;

    const heroEl = document.querySelector<HTMLElement>('[data-hero-section]');
    const heroCanvas = document.querySelector<HTMLCanvasElement>('[data-hero-name-canvas]');
    const heroTitle = document.querySelector<HTMLElement>('[data-cosmos-name]');
    const heroUnderline = document.querySelector<HTMLElement>('[data-hero-underline]');
    let heroField: HeroNameField | null = null;
    let heroTouching = false;
    let fontsRebuilt = false;
    if (heroEl && heroCanvas && heroTitle && heroUnderline) {
      try {
        heroField = new HeroNameField(heroCanvas, heroTitle, heroUnderline, reduced);
      } catch {
        heroField = null;
      }
    }

    const mobileQuery = window.matchMedia('(max-width: 700px)');
    const coarseQuery = window.matchMedia('(pointer: coarse)');
    const fineQuery = window.matchMedia('(pointer: fine)');
    let mobile = mobileQuery.matches;
    let coarse = coarseQuery.matches;
    let fine = fineQuery.matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles: Particle[] = [];
    let constellations: ConstellationLine[] = [];
    let meteors: Meteor[] = [];
    let sparks: Spark[] = [];
    let frame = 0;
    let lastTime = 0;
    let nextMeteorAt = performance.now() + 3200 + Math.random() * 8000;
    let meteorCount = 0;
    let running = true;
    let visible = !document.hidden;
    let scrollY = window.scrollY;
    let heroRectCache: DOMRect | null = heroEl?.getBoundingClientRect() ?? null;
    const syncHeroRect = () => { heroRectCache = heroEl?.getBoundingClientRect() ?? null; };

    const pointer = {
      x: -10000,
      y: -10000,
      smoothX: -10000,
      smoothY: -10000,
      vx: 0,
      vy: 0,
      active: false,
    };

    const buildField = () => {
      const multiplier = density === 'low' ? 0.78 : density === 'high' ? 1.18 : 1;
      const area = width * height;
      const target = Math.min(
        mobile ? 2400 : 9600,
        Math.round((area / (mobile ? 215 : 185)) * multiplier),
      );

      particles = [];

      const addParticle = (
        x: number,
        y: number,
        options: {
          depthBias?: number;
          alphaBoost?: number;
          fine?: boolean;
          dim?: boolean;
          galaxy?: boolean;
        } = {},
      ) => {
        if (particles.length >= target) return;
        const depth = clamp((options.depthBias ?? 0) + Math.random() * 0.92, 0.08, 1);
        const roll = Math.random();
        let size: number;
        let alpha: number;

        if (options.dim) {
          size = 0.34 + Math.random() * 0.4;
          alpha = 0.13 + Math.random() * 0.17;
        } else if (options.fine) {
          size = 0.38 + Math.random() * 0.42;
          alpha = 0.2 + Math.random() * 0.22;
        } else if (roll < 0.8) {
          size = 0.42 + Math.random() * 0.56;
          alpha = 0.3 + Math.random() * 0.3;
        } else if (roll < 0.95) {
          size = 0.92 + Math.random() * 0.4;
          alpha = 0.46 + Math.random() * 0.26;
        } else if (roll < 0.99) {
          size = 1.3 + Math.random() * 0.36;
          alpha = 0.62 + Math.random() * 0.2;
        } else {
          size = 1.66 + Math.random() * 0.34;
          alpha = 0.76 + Math.random() * 0.16;
        }

        const colourRoll = Math.random();
        let colorIndex: number;
        if (colourRoll < 0.34) colorIndex = 0;
        else if (colourRoll < 0.62) colorIndex = 1;
        else if (colourRoll < 0.78) colorIndex = 2;
        else if (colourRoll < 0.85) colorIndex = 3;
        else if (colourRoll < 0.93) colorIndex = 4;
        else if (colourRoll < 0.97) colorIndex = 5;
        else if (colourRoll < 0.99) colorIndex = 6;
        else colorIndex = 7;

        if (options.galaxy && Math.random() < 0.22) {
          colorIndex = [2, 3, 4, 5, 6][Math.floor(Math.random() * 5)];
        }

        const drift = 0.004 + depth * 0.016;
        particles.push({
          x: wrap(x, width),
          y: wrap(y, height),
          size,
          alpha: Math.min(1, alpha + (options.alphaBoost ?? 0)),
          depth,
          phase: Math.random() * TAU,
          twinkle: 0.0006 + Math.random() * 0.0014,
          speedX: (Math.random() - 0.5) * drift * 1.5,
          speedY: (Math.random() - 0.5) * drift,
          colorIndex,
          polarity: Math.random() < (options.galaxy ? 0.38 : 0.32) ? -1 : 1,
          dispX: 0,
          dispY: 0,
          velX: 0,
          velY: 0,
        });
      };

      const uniformCount = Math.floor(target * 0.42);
      for (let index = 0; index < uniformCount; index += 1) {
        addParticle(Math.random() * width, Math.random() * height);
      }

      const bandCount = Math.floor(target * 0.08);
      const bandAngle = -0.42;
      const bandCos = Math.cos(bandAngle);
      const bandSin = Math.sin(bandAngle);
      const bandLength = Math.max(width, height) * 1.35;
      for (let index = 0; index < bandCount; index += 1) {
        const along = (Math.random() - 0.5) * bandLength;
        const across = gaussian() * (mobile ? 24 : 48);
        addParticle(
          width / 2 + bandCos * along - bandSin * across,
          height * 0.46 + bandSin * along + bandCos * across,
          { depthBias: 0.05, fine: true },
        );
      }

      const galaxyCount = mobile ? 16 : 42;
      const galaxyTotal = Math.floor(target * 0.34);
      const perGalaxy = Math.max(24, Math.floor(galaxyTotal / galaxyCount));
      for (let index = 0; index < galaxyCount; index += 1) {
        const cx = Math.random() * width;
        const cy = Math.random() * height;
        const scale = (mobile ? 7 : 10) + Math.random() * (mobile ? 18 : 32);
        const kind = Math.floor(Math.random() * 4);
        const arms = 1 + Math.floor(Math.random() * 3);
        const rotation = Math.random() * TAU;
        const arm = Math.floor(Math.random() * arms);
        const flatten = kind === 2 ? 0.22 + Math.random() * 0.25 : 0.5 + Math.random() * 0.38;
        const coreCount = Math.max(4, Math.floor(perGalaxy * 0.12));

        for (let core = 0; core < coreCount; core += 1) {
          const radius = Math.abs(gaussian()) * scale * 0.1;
          const angle = Math.random() * TAU;
          addParticle(
            cx + Math.cos(angle) * radius,
            cy + Math.sin(angle) * radius * flatten,
            { depthBias: 0.2, fine: true, alphaBoost: 0.05, galaxy: true },
          );
        }

        for (let armParticle = coreCount; armParticle < perGalaxy; armParticle += 1) {
          const t = Math.pow(Math.random(), 0.7);
          const radius = t * scale;
          let localX: number;
          let localY: number;

          if (kind === 0) {
            const angle = rotation + arm * TAU / arms + t * (2.4 + Math.random() * 1.4) + gaussian() * 0.16;
            const scatter = gaussian() * (0.8 + t * scale * 0.1);
            localX = Math.cos(angle) * radius + Math.cos(angle + Math.PI / 2) * scatter;
            localY = (Math.sin(angle) * radius + Math.sin(angle + Math.PI / 2) * scatter) * flatten;
          } else if (kind === 1) {
            const angle = rotation + (Math.random() - 0.5) * 1.7 + t * 0.9;
            const scatter = gaussian() * (1 + t * scale * 0.14);
            localX = Math.cos(angle) * radius + scatter;
            localY = Math.sin(angle) * radius * flatten + gaussian() * 1.4;
          } else if (kind === 2) {
            const angle = Math.random() * TAU;
            const r = Math.pow(Math.random(), 0.6) * scale;
            localX = Math.cos(angle) * r;
            localY = Math.sin(angle) * r * flatten;
          } else {
            const along = gaussian() * scale * 1.4;
            const across = gaussian() * scale * 0.18;
            localX = Math.cos(rotation) * along - Math.sin(rotation) * across;
            localY = (Math.sin(rotation) * along + Math.cos(rotation) * across) * flatten;
          }

          addParticle(cx + localX, cy + localY, {
            depthBias: 0.14,
            fine: true,
            galaxy: true,
          });
        }
      }

      const dustCount = target - particles.length;
      const dustCenters = mobile ? 12 : 24;
      for (let center = 0; center < dustCenters; center += 1) {
        const cx = Math.random() * width;
        const cy = Math.random() * height;
        const radius = (mobile ? 14 : 18) + Math.random() * (mobile ? 24 : 38);
        const perCenter = Math.max(1, Math.floor(dustCount / dustCenters));
        for (let index = 0; index < perCenter; index += 1) {
          addParticle(cx + gaussian() * radius, cy + gaussian() * radius, {
            depthBias: 0.32,
            dim: true,
          });
        }
      }

      particles.sort((a, b) => a.depth - b.depth);
      canvas.dataset.starCount = String(particles.length);

      const candidates = particles.filter((particle) => particle.size >= 1.3).slice(0, mobile ? 24 : 48);
      const maxDistanceSq = (mobile ? 54 : 70) ** 2;
      const maxLines = mobile ? 6 : 18;
      constellations = [];
      for (let first = 0; first < candidates.length && constellations.length < maxLines; first += 1) {
        for (let second = first + 1; second < candidates.length && constellations.length < maxLines; second += 1) {
          const dx = candidates[first].x - candidates[second].x;
          const dy = candidates[first].y - candidates[second].y;
          if (dx * dx + dy * dy > maxDistanceSq) continue;
          constellations.push({ a: candidates[first], b: candidates[second], phase: Math.random() * TAU });
        }
      }
    };

    const resize = () => {
      mobile = mobileQuery.matches;
      coarse = coarseQuery.matches;
      fine = fineQuery.matches;
      width = document.documentElement.clientWidth;
      height = document.documentElement.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, reduced ? 1 : mobile ? 1.25 : 1.5);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      buildField();
      syncHeroRect();
      if (heroField && heroRectCache) {
        heroField.resize(heroRectCache, dpr, mobile);
        heroField.update(performance.now(), 16, heroRectCache);
        // The glyph field is sampled and a first particle frame is already on
        // the canvas, so reveal it now. There is no text-shaped placeholder to
        // wait out. If sampling failed, restore the semantic heading fallback.
        if (heroTitle?.dataset.cosmosNameActive === '1') {
          document.documentElement.dataset.heroIntent = 'particles-ready';
        } else {
          document.documentElement.removeAttribute('data-hero-intent');
        }
      }
    };

    const spawnMeteor = (time: number) => {
      const pathAngles = [0.3, 1.05, 2.15, 2.7, -0.04];
      const angle = pathAngles[meteorCount % pathAngles.length] + (Math.random() - 0.5) * 0.26;

      const rightward = Math.cos(angle) >= 0;
      const upward = Math.sin(angle) < 0;
      const x = rightward
        ? -40 + Math.random() * width * 0.72
        : width + 40 - Math.random() * width * 0.72;
      const y = upward
        ? height + 20 + Math.random() * height * 0.3
        : -30 + Math.random() * height * 0.56;
      const rare = Math.random() < 0.18;
      const speed = (0.44 + Math.random() * 0.4) * (rare ? 1.28 : 1);
      const life = 820 + Math.random() * (rare ? 760 : 560);
      meteors.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: (58 + Math.random() * 92) * (rare ? 1.55 : 1),
        width: (0.82 + Math.random() * 0.78) * (rare ? 1.55 : 1),
        life,
        maxLife: life,
        color: METEOR_RGB[Math.random() < 0.72 ? 0 : Math.random() < 0.7 ? 1 : 2],
        brightness: (1.05 + Math.random() * 0.45) * (rare ? 1.34 : 1),
        head: (1.25 + Math.random() * 0.85) * (rare ? 1.6 : 1),
        sparks: false,
      });
      meteorCount += 1;
      nextMeteorAt = time + 3400 + Math.random() * 8200;
    };

    const render = (time: number) => {
      if (!running || !visible) return;
      const delta = Math.min(40, Math.max(6, time - (lastTime || time - 16)));
      lastTime = time;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const interactive = !reduced && pointer.active && !coarse && fine;
      if (interactive) {
        pointer.smoothX += (pointer.x - pointer.smoothX) * 0.09;
        pointer.smoothY += (pointer.y - pointer.smoothY) * 0.09;
      }
      const pointerVx = pointer.vx;
      const pointerVy = pointer.vy;
      pointer.vx *= 0.82;
      pointer.vy *= 0.82;

      const parallaxX = interactive ? (pointer.smoothX - width / 2) * 0.014 : 0;
      const parallaxY = interactive ? (pointer.smoothY - height / 2) * 0.014 : 0;
      const scrollDrift = reduced ? 0 : scrollY;

      context.lineWidth = 0.4;
      constellations.forEach((line) => {
        const ax = line.a.x + parallaxX * line.a.depth + line.a.dispX;
        const ay = wrap(line.a.y - scrollDrift * (0.004 + line.a.depth * 0.02) + parallaxY * line.a.depth + line.a.dispY, height);
        const bx = line.b.x + parallaxX * line.b.depth + line.b.dispX;
        const by = wrap(line.b.y - scrollDrift * (0.004 + line.b.depth * 0.02) + parallaxY * line.b.depth + line.b.dispY, height);
        const shimmer = reduced ? 0.7 : 0.75 + 0.25 * Math.sin(time * 0.0003 + line.phase);
        context.strokeStyle = `rgba(245,245,247,${(0.009 * shimmer).toFixed(3)})`;
        context.beginPath();
        context.moveTo(ax, ay);
        context.lineTo(bx, by);
        context.stroke();
      });

      for (const particle of particles) {
        if (!reduced) {
          particle.x = wrap(particle.x + particle.speedX * delta, width);
          particle.y = wrap(particle.y + particle.speedY * delta, height);
        }

        const radius = (mobile ? 70 : 106) + particle.depth * (mobile ? 48 : 80);
        if (interactive) {
          const dx = particle.x + particle.dispX - pointer.smoothX;
          const dy = particle.y + particle.dispY - pointer.smoothY;
          const distanceSq = dx * dx + dy * dy;
          if (distanceSq < radius * radius) {
            const distance = Math.sqrt(distanceSq) || 1;
            const strength = (1 - distance / radius) ** 2;
            const force = strength * (0.045 + particle.depth * 0.1) * particle.polarity;
            particle.velX += (dx / distance) * force + pointerVx * strength * particle.depth * 0.003;
            particle.velY += (dy / distance) * force + pointerVy * strength * particle.depth * 0.003;
          }
        }
        particle.velX *= 0.88;
        particle.velY *= 0.88;
        particle.dispX = (particle.dispX + particle.velX) * 0.93;
        particle.dispY = (particle.dispY + particle.velY) * 0.93;
        const displacement = Math.hypot(particle.dispX, particle.dispY);
        const limit = 5 + particle.depth * 13;
        if (displacement > limit) {
          particle.dispX = (particle.dispX / displacement) * limit;
          particle.dispY = (particle.dispY / displacement) * limit;
        }
        const ambientX = coarse && !reduced ? Math.sin(time * 0.00022 + particle.phase) * particle.depth * 1.5 : 0;
        const ambientY = coarse && !reduced ? Math.cos(time * 0.00018 + particle.phase) * particle.depth * 1.2 : 0;
        const x = particle.x + parallaxX * particle.depth + particle.dispX + ambientX;
        const y = wrap(
          particle.y - scrollDrift * (0.004 + particle.depth * 0.02) + parallaxY * particle.depth + particle.dispY + ambientY,
          height,
        );
        const twinkle = reduced ? 1 : 0.9 + 0.1 * Math.sin(time * particle.twinkle + particle.phase);
        const glow = interactive
          ? clamp(1 - Math.hypot(x - pointer.smoothX, y - pointer.smoothY) / radius, 0, 1) * 0.05 * particle.depth
          : 0;
        context.globalAlpha = Math.min(1, particle.alpha * twinkle + glow);
        context.fillStyle = STAR_COLORS[particle.colorIndex];
        context.fillRect(x - particle.size / 2, y - particle.size / 2, particle.size, particle.size);
      }
      context.globalAlpha = 1;

      if (heroField && heroRectCache) {
        heroField.update(time, delta, heroRectCache);
      }

      if (!reduced) {
        if (time > nextMeteorAt) spawnMeteor(time);
        meteors = meteors.filter((meteor) => {
          meteor.x += meteor.vx * delta;
          meteor.y += meteor.vy * delta;
          meteor.life -= delta;
          if (meteor.life <= 0) return false;
          const fade = Math.min(1, meteor.life / (meteor.maxLife * 0.55));
          const speed = Math.hypot(meteor.vx, meteor.vy);
          const tailX = meteor.x - (meteor.vx / speed) * meteor.length;
          const tailY = meteor.y - (meteor.vy / speed) * meteor.length;
          const trail = context.createLinearGradient(tailX, tailY, meteor.x, meteor.y);
          trail.addColorStop(0, `rgba(${meteor.color},0)`);
          trail.addColorStop(0.72, `rgba(${meteor.color},${(0.14 * meteor.brightness * fade).toFixed(3)})`);
          trail.addColorStop(1, `rgba(${meteor.color},${(0.42 * meteor.brightness * fade).toFixed(3)})`);
          context.strokeStyle = trail;
          context.lineWidth = meteor.width;
          context.beginPath();
          context.moveTo(tailX, tailY);
          context.lineTo(meteor.x, meteor.y);
          context.stroke();

          const halo = context.createRadialGradient(meteor.x, meteor.y, 0, meteor.x, meteor.y, meteor.head * 3.2);
          halo.addColorStop(0, `rgba(${meteor.color},${(0.34 * fade).toFixed(3)})`);
          halo.addColorStop(1, `rgba(${meteor.color},0)`);
          context.fillStyle = halo;
          context.beginPath();
          context.arc(meteor.x, meteor.y, meteor.head * 3.2, 0, TAU);
          context.fill();
          context.fillStyle = `rgba(250,250,252,${(0.75 * fade).toFixed(3)})`;
          context.fillRect(meteor.x - meteor.head / 2, meteor.y - meteor.head / 2, meteor.head, meteor.head);

          if (!meteor.sparks && meteor.life < meteor.maxLife * 0.78) {
            meteor.sparks = true;
            const count = meteor.head > 1.4 ? 7 : 3;
            for (let index = 0; index < count; index += 1) {
              const angle = Math.random() * TAU;
              const spread = 0.05 + Math.random() * 0.16;
              const sparkLife = 260 + Math.random() * 340;
              sparks.push({
                x: meteor.x + (Math.random() - 0.5) * 6,
                y: meteor.y + (Math.random() - 0.5) * 6,
                vx: Math.cos(angle) * spread - meteor.vx * 0.08,
                vy: Math.sin(angle) * spread - meteor.vy * 0.08,
                life: sparkLife,
                maxLife: sparkLife,
                size: 0.4 + Math.random() * 0.6,
                color: meteor.color,
              });
            }
          }
          return true;
        });

        sparks = sparks.filter((spark) => {
          spark.x += spark.vx * delta;
          spark.y += spark.vy * delta;
          spark.life -= delta;
          if (spark.life <= 0) return false;
          context.globalAlpha = (spark.life / spark.maxLife) * 0.42;
          context.fillStyle = `rgba(${spark.color},1)`;
          context.fillRect(spark.x, spark.y, spark.size, spark.size);
          return true;
        });
        context.globalAlpha = 1;
      }

      if (!reduced && running && visible) frame = requestAnimationFrame(render);
    };

    const restart = () => {
      cancelAnimationFrame(frame);
      lastTime = 0;
      if (!reduced && visible && running) frame = requestAnimationFrame(render);
      else render(performance.now());
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reduced) return;
      if (heroField) {
        heroField.setPointer(event.clientX, event.clientY, !coarse || heroTouching);
      }
      if (coarse || !fine) return;
      if (!pointer.active) {
        pointer.smoothX = event.clientX;
        pointer.smoothY = event.clientY;
        pointer.vx = 0;
        pointer.vy = 0;
      } else {
        pointer.vx = event.clientX - pointer.x;
        pointer.vy = event.clientY - pointer.y;
      }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    };

    const onHeroPointerDown = (event: PointerEvent) => {
      if (reduced || !coarse || !heroField) return;
      heroTouching = true;
      heroField.setPointer(event.clientX, event.clientY, true);
    };

    const onHeroPointerUp = () => {
      heroTouching = false;
      heroField?.clearPointer();
    };

    const onScroll = () => {
      scrollY = window.scrollY;
      syncHeroRect();
    };
    const onVisibility = () => {
      visible = !document.hidden;
      restart();
    };
    const onResize = () => {
      resize();
      restart();
    };
    const onPointerChange = () => {
      coarse = coarseQuery.matches;
      fine = fineQuery.matches;
      if (coarse || !fine) pointer.active = false;
      if (coarse) onHeroPointerUp();
    };
    const onPointerLeave = () => {
      pointer.active = false;
      pointer.vx = 0;
      pointer.vy = 0;
      heroField?.clearPointer();
    };

    resize();
    restart();
    if (heroField && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!running || fontsRebuilt || !heroEl || !heroField) return;
        fontsRebuilt = true;
        if (heroField.getProgress() > 0.02) return;
        heroField.resize(heroEl.getBoundingClientRect(), dpr, mobile);
      });
    }
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onHeroPointerDown, { passive: true });
    window.addEventListener('pointerup', onHeroPointerUp, { passive: true });
    window.addEventListener('pointercancel', onHeroPointerUp, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('blur', onPointerLeave);
    coarseQuery.addEventListener('change', onPointerChange);
    fineQuery.addEventListener('change', onPointerChange);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onHeroPointerDown);
      window.removeEventListener('pointerup', onHeroPointerUp);
      window.removeEventListener('pointercancel', onHeroPointerUp);
      document.removeEventListener('visibilitychange', onVisibility);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      coarseQuery.removeEventListener('change', onPointerChange);
      fineQuery.removeEventListener('change', onPointerChange);
    };
  }, [density, reduced]);

  return <canvas className="cosmos-canvas" ref={canvasRef} aria-hidden="true" />;
}
