const TAU = Math.PI * 2;

const NAME_COLORS = [
  '#ffffff',
  '#f5f7fa',
  '#dfe4ec',
  '#fff3df',
  '#ead0a2',
  '#cfe1f7',
  '#e0d5f0',
  '#f0c8bb',
];

const GALAXY_COLORS = ['#f1f1f4', '#d9dce2', '#e9dcc6', '#cbb68f', '#b9c9df'];
const GLOW_SPRITE_SIZE = 48;

function polygonVertices(sides: number): Array<[number, number]> {
  return Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * TAU + Math.PI / sides;
    return [Math.cos(angle), Math.sin(angle)];
  });
}
const HEX_VERTICES = polygonVertices(6);
const OCT_VERTICES = polygonVertices(8);

interface NameParticle {
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  delay: number;
  size: number;
  alpha: number;
  shape: number;
  colorIndex: number;
  glow: boolean;
  depth: number;
  edge: boolean;
  sinPhase: number;
  cosPhase: number;
  orbit: number;
  dispX: number;
  dispY: number;
  velX: number;
  velY: number;
  drawX: number;
  drawY: number;
}

interface GalaxyParticle {
  centerX: number;
  centerY: number;
  radius: number;
  angle: number;
  speed: number;
  flatten: number;
  scale: number;
  size: number;
  alpha: number;
  colorIndex: number;
  depth: number;
  core: boolean;
}

interface TrailSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  colorIndex: number;
}

interface Point {
  x: number;
  y: number;
  edge?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function shuffle<T>(values: T[]): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [values[index], values[swap]] = [values[swap], values[index]];
  }
  return values;
}

function selectEvenly(points: Point[], target: number, cellSize: number): Point[] {
  if (points.length <= target) return points;
  const cells = new Map<string, Point[]>();
  for (const point of points) {
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
    const cell = cells.get(key);
    if (cell) cell.push(point);
    else cells.set(key, [point]);
  }
  const groups = Array.from(cells.values()).map(shuffle);
  shuffle(groups);
  const base = Math.floor(target / groups.length);
  const remainder = target % groups.length;
  const selected: Point[] = [];
  groups.forEach((group, index) => {
    const quota = Math.min(group.length, base + (index < remainder ? 1 : 0));
    for (let position = 0; position < quota; position += 1) selected.push(group[position]);
  });
  return selected;
}

function glowSprite(color: string): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = GLOW_SPRITE_SIZE;
  sprite.height = GLOW_SPRITE_SIZE;
  const context = sprite.getContext('2d');
  if (!context) return sprite;
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const radius = GLOW_SPRITE_SIZE / 2;
  const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
  gradient.addColorStop(0, `rgba(${r},${g},${b},0.82)`);
  gradient.addColorStop(0.32, `rgba(${r},${g},${b},0.28)`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, GLOW_SPRITE_SIZE, GLOW_SPRITE_SIZE);
  return sprite;
}

export class HeroNameField {
  private readonly canvas: HTMLCanvasElement;
  private readonly title: HTMLElement;
  private readonly underline: HTMLElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly reduced: boolean;
  private readonly buckets: number[][] = Array.from(
    { length: NAME_COLORS.length * 8 * 4 },
    () => [],
  );
  private readonly glows: number[] = [];
  private readonly glowSprites: HTMLCanvasElement[];

  private particles: NameParticle[] = [];
  private galaxies: GalaxyParticle[] = [];
  private sparks: TrailSpark[] = [];
  private width = 0;
  private height = 0;
  private dpr = 1;
  private mobile = false;
  private pointerClientX = -10000;
  private pointerClientY = -10000;
  private pointerActive = false;
  private pointerVX = 0;
  private pointerVY = 0;
  private pointerPrevX = -10000;
  private pointerPrevY = -10000;
  private introReady = false;
  private nameStartAt = 0;
  private underlineStartAt = 0;
  private underlineFormed = false;
  private underlineActiveStart = 0;
  private underlineLeft = 0;
  private underlineRight = 0;
  private underlineY = 0;
  private formed = false;
  private lastProgress = 0;

  constructor(
    canvas: HTMLCanvasElement,
    title: HTMLElement,
    underline: HTMLElement,
    reduced: boolean,
  ) {
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Hero name canvas is unavailable');
    this.canvas = canvas;
    this.title = title;
    this.underline = underline;
    this.context = context;
    this.reduced = reduced;
    this.glowSprites = NAME_COLORS.map(glowSprite);
  }

  resize(heroRect: DOMRect, dpr: number, mobile: boolean): void {
    this.width = heroRect.width;
    this.height = heroRect.height;
    this.dpr = dpr;
    this.mobile = mobile;
    this.canvas.width = Math.max(1, Math.floor(this.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(this.height * dpr));

    const titleRect = this.title.getBoundingClientRect();
    const underlineRect = this.underline.getBoundingClientRect();
    this.underlineLeft = underlineRect.left - heroRect.left;
    this.underlineRight = this.underlineLeft + underlineRect.width;
    this.underlineY = underlineRect.top - heroRect.top + underlineRect.height * 0.5;
    const targets = this.sampleGlyphs(titleRect, heroRect);
    if (!targets.length) return;

    const subRect = document.querySelector('.hero__sub')?.getBoundingClientRect() ?? null;
    this.particles = this.createParticles(targets, titleRect, heroRect);
    this.rebuildBuckets();
    this.galaxies = this.createGalaxies(titleRect, underlineRect, subRect, heroRect);
    this.formed = this.reduced || this.formed;
    this.lastProgress = this.formed ? 1 : 0;
    this.sparks = [];

    this.title.dataset.cosmosNameActive = '1';
    this.underline.dataset.cosmosUnderlineActive = '1';
    if (this.reduced) {
      this.introReady = true;
      this.nameStartAt = 0;
      this.underlineFormed = true;
      this.underlineActiveStart = 0;
    }
  }

  setPointer(clientX: number, clientY: number, active: boolean): void {
    if (this.reduced) return;
    if (this.pointerPrevX < -9000) {
      this.pointerPrevX = clientX;
      this.pointerPrevY = clientY;
    }
    this.pointerVX = (clientX - this.pointerPrevX) * 0.6 + this.pointerVX * 0.4;
    this.pointerVY = (clientY - this.pointerPrevY) * 0.6 + this.pointerVY * 0.4;
    this.pointerPrevX = clientX;
    this.pointerPrevY = clientY;
    this.pointerClientX = clientX;
    this.pointerClientY = clientY;
    this.pointerActive = active;
  }

  clearPointer(): void {
    this.pointerActive = false;
    this.pointerVX = 0;
    this.pointerVY = 0;
    this.pointerPrevX = -10000;
    this.pointerPrevY = -10000;
  }

  getProgress(): number {
    return this.lastProgress;
  }

  update(time: number, delta: number, heroRect: DOMRect): void {
    if (!this.particles.length) return;
    if (heroRect.bottom < -20 || heroRect.top > window.innerHeight + 20) {
      this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.context.clearRect(0, 0, this.width, this.height);
      return;
    }

    // Begin assembly as soon as the field is sampled. The loader, when shown,
    // sits above the canvas, so the name is already well formed when it clears.
    if (!this.introReady) {
      this.introReady = true;
      this.nameStartAt = time;
      this.underlineStartAt = this.nameStartAt + 2100;
    }

    const elapsed = this.reduced ? 6000 : Math.max(0, time - this.nameStartAt);
    const progress = this.reduced ? 1 : clamp(elapsed / 2600, 0, 1);
    if (progress >= 1) this.formed = true;
    this.lastProgress = progress;

    const context = this.context;
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    context.clearRect(0, 0, this.width, this.height);

    this.drawGalaxies(time);
    this.updateUnderline(time);
    this.drawName(time, delta, progress, heroRect);
    this.drawSparks(delta);
  }

  private sampleGlyphs(titleRect: DOMRect, heroRect: DOMRect): Point[] {
    const offscreen = document.createElement('canvas');
    const width = Math.max(1, Math.floor(titleRect.width));
    const height = Math.max(1, Math.floor(titleRect.height));
    offscreen.width = width;
    offscreen.height = height;
    const context = offscreen.getContext('2d', { willReadFrequently: true });
    if (!context) return [];

    const computed = getComputedStyle(this.title);
    const font = computed.font || `${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
    const text = (this.title.dataset.cosmosName || this.title.textContent || '').trim().toUpperCase();
    const fontSize = parseFloat(computed.fontSize) || 64;
    const lineHeight = parseFloat(computed.lineHeight) || fontSize * 1.05;

    context.font = font;
    context.fillStyle = '#fff';
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    (context as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = computed.letterSpacing;

    const lines: string[] = [];
    if (computed.whiteSpace === 'nowrap' || computed.whiteSpace === 'pre') {
      lines.push(text);
    } else {
      let current = '';
      for (const word of text.split(/\s+/).filter(Boolean)) {
        const candidate = current ? `${current} ${word}` : word;
        if (!current || context.measureText(candidate).width <= width + 2) current = candidate;
        else {
          lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
    }
    if (!lines.length) return [];

    const naturalWidth = Math.max(1, ...lines.map((line) => context.measureText(line).width));
    const scaleX = clamp(width / naturalWidth, 0.52, 1);
    context.setTransform(scaleX, 0, 0, 1, 0, 0);

    const metrics = context.measureText(lines[0]);
    const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.76;
    const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
    lines.forEach((line, index) => {
      const baseline = lineHeight * (index + 0.5) + (ascent - descent) * 0.5;
      context.fillText(line, 0, baseline);
    });

    const pixels = context.getImageData(0, 0, width, height).data;
    const targetCount = this.mobile ? 4400 : 9200;
    const steps = this.mobile ? [1.45, 1.2, 1] : [1.8, 1.5, 1.25];
    let candidates: Point[] = [];
    let edgeCandidates: Point[] = [];

    for (const step of steps) {
      candidates = [];
      edgeCandidates = [];
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const px = Math.floor(x);
          const py = Math.floor(y);
          const index = (py * width + px) * 4 + 3;
          if (pixels[index] <= 105) continue;
          const nx = Math.min(width - 1, px + 2);
          const ny = Math.min(height - 1, py + 2);
          const horizontalEdge = pixels[(py * width + nx) * 4 + 3] <= 105;
          const verticalEdge = pixels[(ny * width + px) * 4 + 3] <= 105;
          const point = {
            x: titleRect.left - heroRect.left + x + (Math.random() - 0.5) * 0.55,
            y: titleRect.top - heroRect.top + y + (Math.random() - 0.5) * 0.55,
            edge: horizontalEdge || verticalEdge,
          };
          candidates.push(point);
          if (point.edge) edgeCandidates.push(point);
        }
      }
      if (candidates.length >= targetCount) break;
    }

    const selected = selectEvenly(candidates, targetCount, this.mobile ? 5 : 7);
    shuffle(edgeCandidates);
    const edgeCount = Math.min(edgeCandidates.length, Math.floor(targetCount * 0.06));
    for (let index = 0; index < edgeCount; index += 1) {
      selected.push({
        x: edgeCandidates[index].x + (Math.random() - 0.5) * 3,
        y: edgeCandidates[index].y + (Math.random() - 0.5) * 3,
        edge: true,
      });
    }
    return selected;
  }

  private createParticles(targets: Point[], titleRect: DOMRect, heroRect: DOMRect): NameParticle[] {
    const centerX = titleRect.left - heroRect.left + titleRect.width * 0.5;
    const centerY = titleRect.top - heroRect.top + titleRect.height * 0.5;
    const titleWidth = Math.max(1, titleRect.width);

    return targets.map((target) => {
      const angle = Math.random() * TAU;
      const radius = (this.mobile ? 110 : 190) + Math.random() * (this.mobile ? 230 : 430);
      const roll = Math.random();
      const shape = roll < 0.55 ? 0 : roll < 0.87 ? 1 : roll < 0.97 ? 2 : 3;
      const colorRoll = Math.random();
      let colorIndex = 0;
      if (colorRoll < 0.3) colorIndex = 0;
      else if (colorRoll < 0.56) colorIndex = 1;
      else if (colorRoll < 0.74) colorIndex = 2;
      else if (colorRoll < 0.84) colorIndex = 3;
      else if (colorRoll < 0.91) colorIndex = 4;
      else if (colorRoll < 0.96) colorIndex = 5;
      else if (colorRoll < 0.985) colorIndex = 6;
      else colorIndex = 7;

      const depth = 0.65 + Math.random() * 0.7;
      const isEdge = target.edge === true;
      let size = (this.mobile ? 0.72 : 0.86) * (0.85 + depth * 0.3)
        + Math.random() * (this.mobile ? 0.6 : 0.75);
      if (Math.random() < 0.03) size += this.mobile ? 0.3 : 0.45;
      if (isEdge) size *= 0.88;
      const alpha = clamp(
        (0.72 + depth * 0.18 + Math.random() * 0.1) * (isEdge ? 0.86 : 1),
        0.6,
        1,
      );

      return {
        targetX: target.x,
        targetY: target.y,
        startX: centerX + Math.cos(angle) * radius,
        startY: centerY + Math.sin(angle) * radius * 0.62,
        delay: clamp((target.x / titleWidth) * 460 + Math.random() * 340, 0, 800),
        size,
        alpha,
        shape,
        colorIndex,
        glow: Math.random() < (isEdge ? 0.055 : 0.045),
        depth,
        edge: isEdge,
        sinPhase: Math.sin(Math.random() * TAU),
        cosPhase: Math.cos(Math.random() * TAU),
        orbit: (0.4 + Math.random() * 1.05) * depth * (isEdge ? 1.25 : 1),
        dispX: 0,
        dispY: 0,
        velX: 0,
        velY: 0,
        drawX: 0,
        drawY: 0,
      };
    });
  }

  private rebuildBuckets(): void {
    for (const bucket of this.buckets) bucket.length = 0;
    this.glows.length = 0;
    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index];
      const bin = clamp(Math.floor(particle.alpha * 8), 0, 7);
      this.buckets[(particle.colorIndex * 8 + bin) * 4 + particle.shape].push(index);
      if (particle.glow && bin >= 5) this.glows.push(index);
    }
  }

  private createGalaxies(
    titleRect: DOMRect,
    underlineRect: DOMRect,
    subRect: DOMRect | null,
    heroRect: DOMRect,
  ): GalaxyParticle[] {
    const titleTop = titleRect.top - heroRect.top;
    const anchors: Array<{ x: number; y: number }> = this.mobile
      ? [
          { x: this.width * 0.18, y: titleTop - 165 },
          { x: this.width * 0.52, y: titleTop - 92 },
          { x: this.width * 0.84, y: titleTop - 140 },
        ]
      : [
          { x: this.width * 0.14, y: titleTop - 240 },
          { x: this.width * 0.46, y: titleTop - 145 },
          { x: this.width * 0.78, y: titleTop - 220 },
          { x: this.width * 0.63, y: titleTop - 82 },
        ];

    const blocked = [titleRect, underlineRect, subRect, document.querySelector('.hero__foot')?.getBoundingClientRect() ?? null]
      .filter((rect): rect is DOMRect => Boolean(rect))
      .map((rect) => ({
        left: rect.left - heroRect.left - 12,
        right: rect.right - heroRect.left + 12,
        top: rect.top - heroRect.top - 12,
        bottom: rect.bottom - heroRect.top + 12,
      }));
    const isClear = (x: number, y: number, scale: number) => blocked.every((rect) => (
      x + scale < rect.left || x - scale > rect.right || y + scale < rect.top || y - scale > rect.bottom
    ));

    const galaxies: GalaxyParticle[] = [];
    for (const anchor of anchors) {
      const scale = (this.mobile ? 24 : 28) + Math.random() * (this.mobile ? 18 : 26);
      const cx = clamp(anchor.x, scale + 8, this.width - scale - 8);
      let cy = clamp(anchor.y, 112 + scale, titleTop - scale - 18);
      let attempts = 0;
      while (!isClear(cx, cy, scale) && attempts < 5) {
        cy -= 34 + scale * 0.35;
        cy = Math.max(96 + scale, cy);
        attempts += 1;
      }
      if (!isClear(cx, cy, scale)) continue;

      const kind = Math.floor(Math.random() * 4);
      const arms = 1 + Math.floor(Math.random() * 2);
      const rotation = Math.random() * TAU;
      const flatten = kind === 2
        ? 0.26 + Math.random() * 0.2
        : kind === 3 ? 0.42 + Math.random() * 0.18 : 0.62 + Math.random() * 0.28;
      const count = this.mobile ? 58 + Math.floor(Math.random() * 20) : 72 + Math.floor(Math.random() * 28);

      galaxies.push({
        centerX: cx,
        centerY: cy,
        radius: 0,
        angle: 0,
        speed: 0,
        flatten: 1,
        scale,
        size: scale,
        alpha: 0.15,
        colorIndex: 0,
        depth: 1,
        core: true,
      });

      for (let index = 0; index < count; index += 1) {
        const t = Math.pow(Math.random(), 0.68);
        const radius = Math.max(1, t * scale);
        let localX = 0;
        let localY = 0;
        if (kind === 0) {
          const angle = rotation + (index % arms) * TAU / arms + t * (2.2 + Math.random() * 0.8);
          const scatter = (Math.random() - 0.5) * (1.5 + t * scale * 0.2);
          localX = Math.cos(angle) * radius + Math.cos(angle + Math.PI / 2) * scatter;
          localY = Math.sin(angle) * radius * flatten + Math.sin(angle + Math.PI / 2) * scatter * flatten;
        } else if (kind === 1) {
          const angle = rotation + (Math.random() - 0.5) * 1.5 + t * 0.9;
          localX = Math.cos(angle) * radius + (Math.random() - 0.5) * 2.4;
          localY = Math.sin(angle) * radius * flatten + (Math.random() - 0.5) * 1.6;
        } else if (kind === 2) {
          const angle = Math.random() * TAU;
          const r = Math.pow(Math.random(), 0.6) * scale;
          localX = Math.cos(angle) * r;
          localY = Math.sin(angle) * r * flatten;
        } else {
          localX = (Math.random() - 0.5) * scale * 2;
          localY = (Math.random() - 0.5) * scale * 0.5;
        }

        const orbitalRadius = Math.hypot(localX, localY / flatten) || 1;
        const core = orbitalRadius < scale * 0.2;
        const colorRoll = Math.random();
        galaxies.push({
          centerX: cx,
          centerY: cy,
          radius: orbitalRadius,
          angle: Math.atan2(localY / flatten, localX),
          speed: (0.00004 + Math.random() * 0.000075) * (Math.random() < 0.5 ? -1 : 1),
          flatten,
          scale,
          size: (core ? 0.75 : this.mobile ? 0.75 : 0.6)
            + Math.random() * (this.mobile ? 0.85 : 0.75),
          alpha: (core ? 0.5 : this.mobile ? 0.38 : 0.32) + Math.random() * 0.3,
          colorIndex: colorRoll < 0.76
            ? Math.floor(Math.random() * 2)
            : Math.floor(Math.random() * GALAXY_COLORS.length),
          depth: 0.4 + Math.random() * 0.6,
          core: false,
        });
      }
    }
    return galaxies;
  }

  private drawGalaxies(time: number): void {
    const context = this.context;
    for (const galaxy of this.galaxies) {
      const twinkle = this.reduced ? 1 : 0.86 + 0.14 * Math.sin(time * 0.0007 + galaxy.centerX);
      if (galaxy.core) {
        const glowSize = galaxy.scale * 1.5;
        context.globalAlpha = galaxy.alpha * twinkle;
        context.drawImage(
          this.glowSprites[0],
          galaxy.centerX - glowSize / 2,
          galaxy.centerY - glowSize / 2,
          glowSize,
          glowSize,
        );
        continue;
      }
      const angle = galaxy.angle + (this.reduced ? 0 : time * galaxy.speed);
      const x = galaxy.centerX + Math.cos(angle) * galaxy.radius;
      const y = galaxy.centerY + Math.sin(angle) * galaxy.radius * galaxy.flatten;
      context.globalAlpha = galaxy.alpha * twinkle;
      context.fillStyle = GALAXY_COLORS[galaxy.colorIndex];
      context.fillRect(x, y, galaxy.size, galaxy.size);
    }
    context.globalAlpha = 1;
  }

  private drawName(time: number, _delta: number, progress: number, heroRect: DOMRect): void {
    const context = this.context;
    const pointerRadius = this.mobile ? 130 : 205;
    const pointerX = this.pointerClientX - heroRect.left;
    const pointerY = this.pointerClientY - heroRect.top;
    const active = this.pointerActive && !this.reduced;
    const pointerVX = active ? this.pointerVX : 0;
    const pointerVY = active ? this.pointerVY : 0;
    this.pointerVX *= 0.76;
    this.pointerVY *= 0.76;
    const driftTimeA = time * 0.00048;
    const driftTimeB = time * 0.00039;
    const sinA = this.reduced ? 0 : Math.sin(driftTimeA);
    const cosA = this.reduced ? 0 : Math.cos(driftTimeA);
    const sinB = this.reduced ? 0 : Math.sin(driftTimeB);
    const cosB = this.reduced ? 0 : Math.cos(driftTimeB);
    const introFade = 0.42 + 0.58 * progress;

    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index];
      const localProgress = clamp((progress * 2600 - particle.delay) / 1780, 0, 1);
      const eased = easeOutCubic(localProgress);
      const baseX = particle.startX + (particle.targetX - particle.startX) * eased;
      const baseY = particle.startY + (particle.targetY - particle.startY) * eased;

      if (active && eased > 0.15) {
        const dx = baseX + particle.dispX - pointerX;
        const dy = baseY + particle.dispY - pointerY;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < pointerRadius * pointerRadius) {
          const distance = Math.sqrt(distanceSq) || 1;
          const strength = (1 - distance / pointerRadius) ** 2;
          const outward = strength * (this.mobile ? 2.4 : 2.7) * particle.depth;
          particle.velX += (dx / distance) * outward + (-dy / distance) * strength * 1.1;
          particle.velY += (dy / distance) * outward + (dx / distance) * strength * 1.1;
          particle.velX += pointerVX * strength * 0.04;
          particle.velY += pointerVY * strength * 0.04;
        }
      }

      particle.velX += -particle.dispX * 0.055;
      particle.velY += -particle.dispY * 0.055;
      particle.velX *= 0.86;
      particle.velY *= 0.86;
      particle.dispX = clamp(particle.dispX + particle.velX, -44, 44);
      particle.dispY = clamp(particle.dispY + particle.velY, -44, 44);

      const drift = eased * particle.orbit;
      particle.drawX = baseX + particle.dispX + (sinA * particle.cosPhase + cosA * particle.sinPhase) * drift;
      particle.drawY = baseY + particle.dispY + (cosB * particle.cosPhase - sinB * particle.sinPhase) * drift * 0.7;
    }

    for (let bin = 0; bin < 8; bin += 1) {
      const binShimmer = this.reduced ? 1 : 0.97 + 0.03 * Math.sin(driftTimeA + bin * 0.7);
      context.globalAlpha = Math.min(1, ((bin + 0.9) / 8) * introFade * binShimmer);
      for (let color = 0; color < NAME_COLORS.length; color += 1) {
        const colorBase = (color * 8 + bin) * 4;
        for (let shape = 0; shape < 4; shape += 1) {
          const bucket = this.buckets[colorBase + shape];
          if (!bucket.length) continue;
          context.fillStyle = NAME_COLORS[color];
          for (const index of bucket) {
            const particle = this.particles[index];
            this.drawShape(particle.drawX, particle.drawY, particle.size, shape);
          }
        }
      }
    }

    if (this.glows.length) {
      context.globalAlpha = 0.32 * introFade;
      for (let color = 0; color < NAME_COLORS.length; color += 1) {
        for (const index of this.glows) {
          const particle = this.particles[index];
          if (particle.colorIndex !== color) continue;
          const radius = particle.size * 3.2;
          context.drawImage(
            this.glowSprites[color],
            particle.drawX - radius,
            particle.drawY - radius,
            radius * 2,
            radius * 2,
          );
        }
      }
    }
    context.globalAlpha = 1;
  }

  private drawShape(x: number, y: number, size: number, shape: number): void {
    const context = this.context;
    if (shape === 0) {
      const side = Math.max(0.8, size * 0.72);
      context.fillRect(Math.round(x), Math.round(y), side, side);
      return;
    }
    if (shape === 1) {
      context.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
      return;
    }
    const vertices = shape === 2 ? HEX_VERTICES : OCT_VERTICES;
    const radius = size * 0.64;
    context.beginPath();
    for (let index = 0; index < vertices.length; index += 1) {
      const px = x + vertices[index][0] * radius;
      const py = y + vertices[index][1] * radius;
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
  }

  private updateUnderline(time: number): void {
    const context = this.context;
    const left = this.underlineLeft;
    const right = this.underlineRight;
    const width = right - left;
    if (width < 20) return;
    const baseY = this.underlineY;
    const centerX = (left + right) / 2;
    const radiusX = width / 2;
    // A shallow orbital trough: the near arc dips below the name while the
    // receding arc stays compressed, giving the path depth without a full loop.
    const frontDip = clamp(width * 0.011, 8, 13);
    const backDip = frontDip * 0.38;

    const pointAt = (value: number) => {
      const sine = Math.sin(value);
      return {
        x: centerX + Math.cos(value) * radiusX,
        y: baseY + sine * (sine >= 0 ? frontDip : backDip),
        depth: (sine + 1) / 2,
      };
    };
    const strokeArc = (start: number, end: number, color: string | CanvasGradient, lineWidth: number, alpha: number) => {
      const steps = 70;
      context.globalAlpha = alpha * (this.underlineFormed ? 1 : 0.22);
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.beginPath();
      for (let index = 0; index <= steps; index += 1) {
        const point = pointAt(start + ((end - start) * index) / steps);
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.stroke();
    };

    // Receding half: thin, muted gold, almost hidden behind the name.
    strokeArc(Math.PI, TAU, 'rgba(184,137,91,0.42)', 0.85, 0.5);
    // Near half: champagne path with a soft, wide underglow for definition.
    const nearPath = context.createLinearGradient(left, baseY, right, baseY + frontDip);
    nearPath.addColorStop(0, 'rgba(255,238,202,0.9)');
    nearPath.addColorStop(0.5, 'rgba(233,196,142,0.95)');
    nearPath.addColorStop(1, 'rgba(184,137,91,0.4)');
    strokeArc(0, Math.PI, 'rgba(255,224,176,0.08)', 5, 1);
    strokeArc(0, Math.PI, nearPath, 1.7, 1);
    context.globalAlpha = 1;

    if (this.reduced) {
      this.underlineFormed = true;
      const rest = pointAt(Math.PI / 2);
      const restGlow = 25;
      context.globalAlpha = 0.52;
      context.drawImage(this.glowSprites[3], rest.x - restGlow / 2, rest.y - restGlow / 2, restGlow, restGlow);
      context.globalAlpha = 0.9;
      context.fillStyle = NAME_COLORS[3];
      context.fillRect(rest.x - 1.7, rest.y - 1.7, 3.4, 3.4);
      context.globalAlpha = 1;
      return;
    }
    if (!this.underlineFormed) {
      if (time < this.underlineStartAt) return;
      this.underlineFormed = true;
      this.underlineActiveStart = time;
    }

    const phase = ((time - this.underlineActiveStart) / 9800) * TAU;
    const segments = 22;
    for (let index = segments - 1; index >= 0; index -= 1) {
      const from = pointAt(phase - index * 0.015);
      const to = pointAt(phase - (index + 1) * 0.015);
      const fade = (1 - index / segments) ** 1.8;
      const depthLight = 0.5 + 0.5 * from.depth;
      context.globalAlpha = 1;
      context.strokeStyle = `rgba(255,${Math.round(211 + 27 * from.depth)},${Math.round(157 + 55 * from.depth)},${(fade * depthLight * 0.66).toFixed(3)})`;
      context.lineWidth = 0.45 + fade * (0.35 + 1.3 * from.depth);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }

    const head = pointAt(phase);
    const haloSize = 16 + 22 * head.depth;
    context.globalAlpha = 0.34 + 0.48 * head.depth;
    context.drawImage(this.glowSprites[3], head.x - haloSize / 2, head.y - haloSize / 2, haloSize, haloSize);
    const emberSize = 9 + 12 * head.depth;
    context.globalAlpha = 0.18 + 0.24 * head.depth;
    context.drawImage(this.glowSprites[4], head.x - emberSize / 2, head.y - emberSize / 2, emberSize, emberSize);

    const headSize = 1.9 + 2.5 * head.depth;
    context.globalAlpha = 0.72 + 0.28 * head.depth;
    context.fillStyle = NAME_COLORS[3];
    context.save();
    context.translate(head.x, head.y);
    context.rotate(phase * 0.6);
    context.beginPath();
    context.moveTo(0, -headSize * 0.64);
    context.lineTo(headSize * 0.6, 0);
    context.lineTo(0, headSize * 0.64);
    context.lineTo(-headSize * 0.6, 0);
    context.closePath();
    context.fill();
    context.fillStyle = NAME_COLORS[0];
    const coreSize = 0.9 + 0.8 * head.depth;
    context.fillRect(-coreSize / 2, -coreSize / 2, coreSize, coreSize);
    context.restore();
    context.globalAlpha = 1;

    if (head.depth > 0.68 && Math.random() < 0.009) {
      const sparkLife = 320 + Math.random() * 420;
      const tangentX = -Math.sin(phase) * radiusX;
      const tangentY = Math.cos(phase) * frontDip;
      const tangentLength = Math.hypot(tangentX, tangentY) || 1;
      this.sparks.push({
        x: head.x + (Math.random() - 0.5) * 4,
        y: head.y + (Math.random() - 0.5) * 4,
        vx: (-tangentX / tangentLength) * 0.055 + (Math.random() - 0.5) * 0.03,
        vy: (-tangentY / tangentLength) * 0.055 + (Math.random() - 0.5) * 0.04,
        life: sparkLife,
        maxLife: sparkLife,
        size: 0.5 + Math.random() * 0.75,
        colorIndex: Math.random() < 0.72 ? 3 : 0,
      });
    }
  }

  private drawSparks(delta: number): void {
    const context = this.context;
    this.sparks = this.sparks.filter((spark) => {
      spark.x += spark.vx * delta;
      spark.y += spark.vy * delta;
      spark.life -= delta;
      if (spark.life <= 0) return false;
      context.globalAlpha = (spark.life / spark.maxLife) * 0.55;
      context.fillStyle = NAME_COLORS[spark.colorIndex];
      context.fillRect(spark.x, spark.y, spark.size, spark.size);
      return true;
    });
    context.globalAlpha = 1;
  }
}
