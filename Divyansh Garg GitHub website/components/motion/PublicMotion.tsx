'use client';

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useMotion } from './MotionProvider';

// The provider learns the media query on its first effect, so read it here too
// to avoid a brief animated (hidden text) frame for reduced-motion visitors.
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);
}

function splitIntoWords(element: HTMLElement): HTMLElement[] {
  if (element.dataset.splitDone === '1') return Array.from(element.querySelectorAll<HTMLElement>('.mask-word > span'));
  const text = element.textContent?.trim().replace(/\s+/g, ' ') ?? '';
  const originalNodes = Array.from(element.childNodes);
  element.setAttribute('aria-label', text);
  element.textContent = '';

  const words: HTMLElement[] = [];
  const addWord = (word: string, parent: HTMLElement, trailingSpace: boolean) => {
    const outer = document.createElement('span');
    outer.className = 'mask-word';
    const inner = document.createElement('span');
    inner.innerHTML = escapeHtml(word);
    outer.appendChild(inner);
    parent.appendChild(outer);
    if (trailingSpace) parent.appendChild(document.createTextNode(' '));
    words.push(inner);
  };

  const walk = (node: Node, parent: HTMLElement) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const pieces = (node.textContent ?? '').split(/(\s+)/).filter((piece) => piece.length > 0);
      pieces.forEach((piece, index) => {
        if (/^\s+$/.test(piece)) {
          parent.appendChild(document.createTextNode(' '));
          return;
        }
        addWord(piece, parent, index === pieces.length - 1 && /\s$/.test(node.textContent ?? ''));
      });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const source = node as HTMLElement;
    const clone = source.tagName === 'BR'
      ? document.createElement('br')
      : document.createElement(source.tagName.toLowerCase());
    Array.from(source.attributes).forEach((attribute) => clone.setAttribute(attribute.name, attribute.value));
    Array.from(source.childNodes).forEach((child) => walk(child, clone));
    parent.appendChild(clone);
  };

  originalNodes.forEach((node) => walk(node, element));
  element.dataset.splitDone = '1';
  return words;
}

function splitIntoChars(element: HTMLElement): HTMLElement[] {
  if (element.dataset.splitDone === '1') return Array.from(element.querySelectorAll<HTMLElement>('.char'));
  const text = element.textContent ?? '';
  element.setAttribute('aria-label', text.trim());
  element.textContent = '';
  const chars: HTMLElement[] = [];
  for (const character of Array.from(text)) {
    const span = document.createElement('span');
    span.className = character === ' ' ? 'char char--space' : 'char';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = character === ' ' ? '&nbsp;' : escapeHtml(character);
    element.appendChild(span);
    chars.push(span);
  }
  element.dataset.splitDone = '1';
  return chars;
}

// Short, per-character decode inspired by the restrained reveal timing on
// prem-kumar-sharma.github.io. Time-based so it resolves at the same speed on
// slow devices, and always restores the exact CMS wording when interrupted.
function scrambleText(element: HTMLElement, finalText: string): () => void {
  const glyphs = '!/\\_-=+*^?#[]{}ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const source = Array.from(element.textContent ?? finalText);
  const target = Array.from(finalText);
  const queue = Array.from({ length: Math.max(source.length, target.length) }, (_, index) => {
    const start = Math.random() * 60;
    return {
      from: source[index] ?? '',
      to: target[index] ?? '',
      start,
      end: start + 150 + Math.random() * 90,
      char: '',
    };
  });
  const render = (value: string) => (value === ' ' ? '&nbsp;' : escapeHtml(value));
  let startAt = 0;
  let raf = 0;
  let cancelled = false;
  const restore = () => { element.textContent = finalText; };
  const tick = (now: number) => {
    if (cancelled) return;
    if (!startAt) startAt = now;
    const elapsed = now - startAt;
    let settled = 0;
    let markup = '';
    queue.forEach((item) => {
      if (elapsed >= item.end) {
        settled += 1;
        markup += render(item.to);
      } else if (elapsed >= item.start) {
        if (!item.char || Math.random() < 0.28) item.char = glyphs[Math.floor(Math.random() * glyphs.length)];
        markup += `<span class="scr" aria-hidden="true">${escapeHtml(item.char)}</span>`;
      } else {
        markup += render(item.from);
      }
    });
    element.innerHTML = markup;
    if (settled < queue.length) raf = requestAnimationFrame(tick);
    else restore();
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    restore();
  };
}

function setupRollText(): void {
  document.querySelectorAll<HTMLElement>('[data-roll]').forEach((element) => {
    if (element.dataset.rollReady === '1') return;
    const text = element.textContent?.trim() ?? '';
    if (!text) return;
    element.dataset.rollReady = '1';
    element.classList.add('roll');
    const inner = document.createElement('span');
    inner.className = 'roll__in';
    inner.dataset.text = text;
    inner.textContent = text;
    element.textContent = '';
    element.appendChild(inner);
  });
}

export function PublicMotion() {
  const { reduced, finePointer, lenis, stopScroll, startScroll } = useMotion();

  useEffect(() => {
    const isReduced = reduced || prefersReducedMotion();
    if (isReduced) {
      document.documentElement.classList.remove('motion-ready');
      document.documentElement.removeAttribute('data-intro');
      // Static fallbacks: anything animated by the non-reduced branch must still
      // end up in its final, readable state.
      document.querySelectorAll<HTMLElement>('[data-hero-underline]').forEach((element) => {
        element.style.transform = 'scaleX(1)';
      });
      document.querySelectorAll<HTMLElement>('[data-count]').forEach((element) => {
        const target = Number(element.dataset.count ?? 0);
        const decimals = Number(element.dataset.decimals ?? 0);
        const suffix = element.dataset.suffix ?? '';
        if (!Number.isFinite(target)) return;
        element.textContent = `${target.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
      });
      return;
    }
    document.documentElement.classList.add('motion-ready');
    // GSAP takes over the pre-paint hidden state synchronously below.
    document.documentElement.removeAttribute('data-intro');

    const cleanups: Array<() => void> = [];
    let currentlyTimeline: gsap.core.Timeline | null = null;
    const ctx = gsap.context(() => {
      // Hero particle name and supporting stagger. The name itself is drawn on
      // the cosmos canvas; only the semantic heading characters are split.
      const charTargets = gsap.utils.toArray<HTMLElement>('[data-chars]');
      charTargets.forEach((element) => {
        const chars = splitIntoChars(element);
        gsap.fromTo(chars, { yPercent: 115, rotate: 7 }, { yPercent: 0, rotate: 0, duration: 1.35, ease: 'expo.out', stagger: 0.034, delay: 0.25 });
      });
      const heroItems = gsap.utils.toArray<HTMLElement>('[data-hero]');
      if (heroItems.length) {
        gsap.fromTo(heroItems, { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: 0.08, delay: 0.4 });
      }
      // Main subtitle: close-set characters settle upward out of a soft blur.
      const lede = document.querySelector<HTMLElement>('[data-hero-lede]');
      if (lede) {
        const chars = splitIntoChars(lede);
        gsap.fromTo(chars, {
          yPercent: 85,
          opacity: 0,
          filter: 'blur(6px)',
        }, {
          yPercent: 0,
          opacity: 1,
          filter: 'blur(0px)',
          duration: 0.95,
          ease: 'expo.out',
          stagger: 0.018,
          delay: 0.75,
          onComplete: () => gsap.set(chars, { clearProps: 'filter' }),
        });
      }
      // CURRENTLY: one mono label and a single rotating text slot. Each title
      // exits upward and is fully gone before the next rises into the same
      // position; the loop starts only after the intro has settled.
      const currently = document.querySelector<HTMLElement>('[data-currently]');
      if (currently) {
        const label = currently.querySelector<HTMLElement>('[data-currently-label]');
        const lines = gsap.utils.toArray<HTMLElement>(currently.querySelectorAll('[data-currently-line] > span'));
        if (label) {
          gsap.fromTo(label, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: 'power2.out', delay: 0.72 });
        }
        if (lines.length) {
          gsap.set(lines, { yPercent: 110, opacity: 0 });
          if (lines.length > 1) {
            let index = 0;
            const cycle = () => {
              const current = lines[index];
              const next = lines[(index + 1) % lines.length];
              currentlyTimeline = gsap.timeline({ onComplete: cycle })
                .to(current, { yPercent: -110, opacity: 0, duration: 0.38, ease: 'power2.in' })
                .set(current, { yPercent: 110 })
                .set(next, { yPercent: 110, opacity: 0 })
                // A deliberate empty beat: the old title is fully gone before
                // the next one starts rising into the same slot.
                .to({}, { duration: 0.16 })
                .to(next, { yPercent: 0, opacity: 1, duration: 0.48, ease: 'expo.out' })
                .to({}, { duration: 1.9 });
              index = (index + 1) % lines.length;
            };
            gsap.fromTo(lines[0], { yPercent: 108, opacity: 0 }, {
              yPercent: 0,
              opacity: 1,
              duration: 0.62,
              ease: 'expo.out',
              delay: 0.82,
              onComplete: cycle,
            });
          } else {
            gsap.fromTo(lines[0], { yPercent: 108, opacity: 0 }, {
              yPercent: 0, opacity: 1, duration: 0.62, ease: 'expo.out', delay: 0.82,
            });
          }
        }
      }
      const underline = document.querySelector<HTMLElement>('[data-hero-underline]');
      if (underline) {
        underline.style.removeProperty('transform'); // undo any reduced-motion static fallback
        gsap.to(underline, { scaleX: 1, duration: 1, ease: 'expo.out', delay: 1.05 });
      }

      // Masked word headings. Editorial phrases enter a beat later with a soft
      // blur so the italic serif reads as a deliberate second voice.
      gsap.utils.toArray<HTMLElement>('[data-split]').forEach((element) => {
        const words = splitIntoWords(element);
        const plainWords = words.filter((word) => !word.closest('.editorial'));
        const editorialWords = words.filter((word) => word.closest('.editorial'));
        const trigger = () => ({ trigger: element, start: 'top 85%', once: true });
        if (plainWords.length) {
          gsap.fromTo(plainWords, { yPercent: 110 }, {
            yPercent: 0,
            duration: 1.15,
            ease: 'expo.out',
            stagger: 0.055,
            scrollTrigger: trigger(),
          });
        }
        if (editorialWords.length) {
          gsap.fromTo(editorialWords, { yPercent: 112, opacity: 0, filter: 'blur(4px)' }, {
            yPercent: 0,
            opacity: 1,
            filter: 'blur(0px)',
            duration: 1.25,
            ease: 'expo.out',
            stagger: 0.07,
            delay: 0.12,
            scrollTrigger: trigger(),
            onComplete: () => gsap.set(editorialWords, { clearProps: 'filter' }),
          });
        }
      });

      // Word-by-word fill statement.
      gsap.utils.toArray<HTMLElement>('[data-fill]').forEach((element) => {
        const words = splitIntoWords(element);
        words.forEach((word) => (word.className = 'fill-word'));
        gsap.to(words, {
          opacity: 1,
          ease: 'none',
          stagger: 0.42,
          scrollTrigger: { trigger: element, start: 'top 78%', end: 'bottom 42%', scrub: 0.6 },
        });
      });

      // Batched reveals.
      ScrollTrigger.batch('[data-reveal]', {
        start: 'top 90%',
        once: true,
        onEnter: (batch) => {
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: 0.95,
            ease: 'expo.out',
            stagger: Math.min(0.07, 0.45 / batch.length),
            onComplete: () => batch.forEach((element) => element.classList.add('is-in')),
          });
        },
      });

      // Skill categories arrive as a heading followed by their tokens. Nothing
      // is hidden in CSS, so reduced-motion and no-JS visitors see everything.
      gsap.utils.toArray<HTMLElement>('[data-skill-group]').forEach((group) => {
        const heading = group.querySelector<HTMLElement>('[data-skill-heading]');
        const tokens = gsap.utils.toArray<HTMLElement>(group.querySelectorAll('[data-skill-token]'));
        const trigger = () => ({ trigger: group, start: 'top 84%', once: true });
        if (heading) {
          gsap.fromTo(heading, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.85, ease: 'expo.out', scrollTrigger: trigger() });
        }
        if (tokens.length) {
          gsap.fromTo(tokens, { y: 12, opacity: 0 }, {
            y: 0,
            opacity: 1,
            duration: 0.7,
            ease: 'power3.out',
            stagger: 0.035,
            scrollTrigger: { ...trigger(), start: 'top 80%' },
          });
        }
      });

      // Scramble kickers.
      gsap.utils.toArray<HTMLElement>('[data-scramble]').forEach((element) => {
        const finalText = element.textContent ?? '';
        ScrollTrigger.create({
          trigger: element,
          start: 'top 92%',
          once: true,
          onEnter: () => cleanups.push(scrambleText(element, finalText)),
        });
      });

      // Counters.
      gsap.utils.toArray<HTMLElement>('[data-count]').forEach((element) => {
        const target = Number(element.dataset.count ?? 0);
        const suffix = element.dataset.suffix ?? '';
        const decimals = Number(element.dataset.decimals ?? 0);
        const state = { value: 0 };
        gsap.to(state, {
          value: target,
          duration: 2.2,
          ease: 'power3.out',
          scrollTrigger: { trigger: element, start: 'top 92%', once: true },
          onUpdate: () => {
            element.textContent = `${state.value.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
          },
        });
      });

      // Portrait reveal and parallax.
      document.querySelectorAll<HTMLElement>('[data-portrait]:not([data-particle-portrait])').forEach((portrait) => {
        const inner = portrait.querySelector<HTMLElement>('[data-portrait-inner]');
        const image = portrait.querySelector<HTMLElement>('img');
        if (inner) {
          gsap.fromTo(inner, { clipPath: 'inset(100% 0 0 0)' }, {
            clipPath: 'inset(0% 0 0 0)', duration: 1.6, ease: 'expo.inOut',
            scrollTrigger: { trigger: portrait, start: 'top 82%', once: true },
          });
        }
        if (image) {
          gsap.fromTo(image, { scale: 1.45 }, {
            scale: 1.15, duration: 2, ease: 'power2.out',
            scrollTrigger: { trigger: portrait, start: 'top 82%', once: true },
          });
          gsap.fromTo(image, { yPercent: -6 }, {
            yPercent: 6, ease: 'none',
            scrollTrigger: { trigger: portrait, start: 'top bottom', end: 'bottom top', scrub: true },
          });
        }
      });

      // Hero scroll parallax.
      const hero = document.querySelector<HTMLElement>('[data-hero-section]');
      if (hero) {
        const title = hero.querySelector<HTMLElement>('.hero__title');
        const foot = hero.querySelector<HTMLElement>('.hero__foot');
        if (title) gsap.to(title, { yPercent: -18, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
        if (foot) {
          // Keep the CTA buttons at full opacity while the hero is in view. The
          // previous scrubbed fade on the whole foot captured its intro opacity
          // (0) as the start value, so scrolling left the buttons at opacity 0.
          gsap.to(foot, { yPercent: -40, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
          const footDetails = foot.querySelectorAll<HTMLElement>('.scroll-cue, .hero__coordinates');
          if (footDetails.length) {
            gsap.to(footDetails, { opacity: 0, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
          }
        }
      }

      // Desktop pinned horizontal work gallery.
      const mm = gsap.matchMedia();
      mm.add('(min-width: 901px)', () => {
        const pin = document.querySelector<HTMLElement>('[data-work-pin]');
        const track = document.querySelector<HTMLElement>('[data-work-track]');
        const progress = document.querySelector<HTMLElement>('[data-work-progress]');
        if (!pin || !track) return;
        const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + 80);
        const tween = gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: pin,
            start: 'top top',
            end: () => `+=${distance()}`,
            scrub: 0.8,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              if (progress) progress.style.transform = `scaleX(${self.progress})`;
            },
          },
        });
        gsap.utils.toArray<HTMLElement>('.project-card__art svg').forEach((art) => {
          const card = art.closest('.project-card');
          if (!card) return;
          gsap.fromTo(art, { xPercent: -12 }, {
            xPercent: 12, ease: 'none',
            scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true },
          });
        });
        return () => {
          tween.scrollTrigger?.kill();
          tween.kill();
        };
      });
      cleanups.push(() => mm.revert());

      // Velocity-aware marquee.
      const marquee = document.querySelector<HTMLElement>('[data-marquee]');
      if (marquee) {
        let offset = 0;
        let lastScroll = window.scrollY;
        let visible = true;
        const observer = new IntersectionObserver((entries) => { visible = entries[0]?.isIntersecting ?? false; });
        observer.observe(marquee);
        const tick = () => {
          if (!visible) return;
          const current = window.scrollY;
          const velocity = current - lastScroll;
          lastScroll = current;
          const direction = velocity > 0.5 ? 1 : velocity < -0.5 ? -1 : 1;
          const speed = 0.025 + Math.min(Math.abs(velocity) * 0.008, 0.3);
          offset = (offset + direction * speed + 50) % 50;
          marquee.style.transform = `translate3d(-${offset}%, 0, 0)`;
        };
        gsap.ticker.add(tick);
        cleanups.push(() => { gsap.ticker.remove(tick); observer.disconnect(); });
      }

      // Magnetic buttons.
      if (finePointer) {
        gsap.utils.toArray<HTMLElement>('[data-magnetic]').forEach((element) => {
          const strength = Number(element.dataset.magnetic ?? 0.25);
          const xTo = gsap.quickTo(element, 'x', { duration: 0.6, ease: 'power3.out' });
          const yTo = gsap.quickTo(element, 'y', { duration: 0.6, ease: 'power3.out' });
          const move = (event: PointerEvent) => {
            const rect = element.getBoundingClientRect();
            xTo((event.clientX - rect.left - rect.width / 2) * strength);
            yTo((event.clientY - rect.top - rect.height / 2) * strength);
          };
          const leave = () => { xTo(0); yTo(0); };
          element.addEventListener('pointermove', move);
          element.addEventListener('pointerleave', leave);
          cleanups.push(() => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerleave', leave); });
        });
      }
    });

    let mounted = true;
    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (mounted) ScrollTrigger.refresh();
      });
    }

    return () => {
      mounted = false;
      currentlyTimeline?.kill();
      cleanups.forEach((cleanup) => cleanup());
      ctx.revert();
    };
  }, [reduced, finePointer]);

  // Navigation state, active links, menu, accordion, lightbox, copy, footer, floating CTA.
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const isReduced = reduced || prefersReducedMotion();

    if (!isReduced) setupRollText();

    // Pointer drag for every horizontal rail; touch keeps native horizontal scrolling.
    if (finePointer && !reduced) {
      Array.from(document.querySelectorAll<HTMLElement>('[data-drag-rail]')).forEach((rail) => {
        let down = false;
        let moved = false;
        let startX = 0;
        let startScroll = 0;
        const onDown = (event: PointerEvent) => {
          if (event.button !== 0 || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
          down = true;
          moved = false;
          startX = event.clientX;
          startScroll = rail.scrollLeft;
          rail.setPointerCapture?.(event.pointerId);
        };
        const onMove = (event: PointerEvent) => {
          if (!down) return;
          const delta = event.clientX - startX;
          if (Math.abs(delta) > 6) moved = true;
          if (moved && event.cancelable) event.preventDefault();
          rail.scrollLeft = startScroll - delta;
        };
        const onUp = (event: PointerEvent) => {
          down = false;
          rail.releasePointerCapture?.(event.pointerId);
        };
        const onClick = (event: MouseEvent) => {
          if (!moved) return;
          event.preventDefault();
          event.stopPropagation();
          moved = false;
        };
        rail.addEventListener('pointerdown', onDown);
        rail.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        rail.addEventListener('click', onClick, true);
        cleanups.push(() => {
          rail.removeEventListener('pointerdown', onDown);
          rail.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          rail.removeEventListener('click', onClick, true);
        });
      });
    }

    const nav = document.querySelector<HTMLElement>('[data-nav]');
    const menuBtn = document.querySelector<HTMLButtonElement>('[data-menu-btn]');
    const menuPanel = document.querySelector<HTMLElement>('[data-menu-panel]');
    let lastY = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      if (nav) {
        nav.classList.toggle('is-scrolled', y > 40);
        nav.classList.toggle('is-hidden', y > 400 && y > lastY && !menuPanel?.classList.contains('is-open'));
      }
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const activeLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]'));
    const activeObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        activeLinks.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll<HTMLElement>('section[id]').forEach((section) => activeObserver.observe(section));

    const closeMenu = () => {
      menuPanel?.classList.remove('is-open');
      menuBtn?.setAttribute('aria-expanded', 'false');
      menuBtn?.setAttribute('aria-label', 'Open menu');
      startScroll();
    };
    const onMenuClick = () => {
      const open = !menuPanel?.classList.contains('is-open');
      menuPanel?.classList.toggle('is-open', open);
      menuBtn?.setAttribute('aria-expanded', String(open));
      menuBtn?.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (open) stopScroll(); else startScroll();
    };
    menuBtn?.addEventListener('click', onMenuClick);
    cleanups.push(() => menuBtn?.removeEventListener('click', onMenuClick));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);

    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
    const anchorHandler = (event: MouseEvent) => {
      const link = (event.currentTarget as HTMLAnchorElement);
      const id = link.getAttribute('href')?.slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      closeMenu();
      if (reduced || !lenis) {
        target.scrollIntoView();
      } else {
        lenis.scrollTo(target, { duration: 1.1 });
      }
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      history.replaceState(null, '', `#${id}`);
    };
    anchors.forEach((anchor) => anchor.addEventListener('click', anchorHandler));

    // Accordion.
    const accordionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-accordion]'));
    // Keep collapsed panels out of the accessibility tree and out of the tab order.
    // `inert` is used instead of `hidden` so the existing grid-row transition still works.
    document.querySelectorAll<HTMLElement>('.exp-row').forEach((row) => {
      const panel = row.querySelector<HTMLElement>('.exp-row__panel');
      if (!panel) return;
      panel.setAttribute('aria-hidden', 'true');
      panel.toggleAttribute('inert', true);
    });
    const accordionHandler = (event: MouseEvent) => {
      const button = event.currentTarget as HTMLButtonElement;
      const row = button.closest<HTMLElement>('.exp-row');
      const open = !row?.classList.contains('is-open');
      row?.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
      const panel = row?.querySelector<HTMLElement>('.exp-row__panel');
      if (panel) {
        panel.setAttribute('aria-hidden', String(!open));
        panel.toggleAttribute('inert', !open);
      }
      window.setTimeout(() => ScrollTrigger.refresh(), 520);
    };
    accordionButtons.forEach((button) => button.addEventListener('click', accordionHandler));

    // Certificate lightbox.
    const dialog = document.querySelector<HTMLDialogElement>('[data-lightbox]');
    const lightboxImage = dialog?.querySelector<HTMLImageElement>('[data-lightbox-image]');
    const lightboxTitle = dialog?.querySelector<HTMLElement>('[data-lightbox-title]');
    const openButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-lightbox-open]'));
    let lightboxTrigger: HTMLElement | null = null;
    const openLightbox = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.('[data-lightbox-ignore]')) return;
      const button = event.currentTarget as HTMLButtonElement;
      if (!dialog) return;
      if (lightboxImage) {
        lightboxImage.src = button.dataset.src ?? '';
        lightboxImage.alt = button.dataset.alt ?? '';
      }
      if (lightboxTitle) lightboxTitle.textContent = button.dataset.title ?? '';
      lightboxTrigger = button;
      if (!dialog.open) dialog.showModal();
      stopScroll();
      // Native dialogs focus the first focusable child, but be explicit so focus
      // never lands on the page behind the modal.
      dialog.querySelector<HTMLElement>('[data-lightbox-close]')?.focus();
    };
    openButtons.forEach((button) => button.addEventListener('click', openLightbox));
    const closeLightbox = () => { dialog?.close(); startScroll(); };
    const backdropClick = (event: MouseEvent) => { if (event.target === dialog) closeLightbox(); };
    const onLightboxClose = () => {
      startScroll();
      if (lightboxTrigger?.isConnected) lightboxTrigger.focus();
      lightboxTrigger = null;
    };
    const lightboxCloseButton = dialog?.querySelector<HTMLElement>('[data-lightbox-close]');
    lightboxCloseButton?.addEventListener('click', closeLightbox);
    dialog?.addEventListener('click', backdropClick);
    dialog?.addEventListener('close', onLightboxClose);
    cleanups.push(() => {
      openButtons.forEach((button) => button.removeEventListener('click', openLightbox));
      lightboxCloseButton?.removeEventListener('click', closeLightbox);
      dialog?.removeEventListener('click', backdropClick);
      dialog?.removeEventListener('close', onLightboxClose);
    });

    const pdfButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-pdf-open]'));
    const pdfHandler = (event: MouseEvent) => {
      const src = (event.currentTarget as HTMLButtonElement).dataset.pdfOpen;
      if (src) window.open(src, '_blank', 'noopener,noreferrer');
    };
    pdfButtons.forEach((button) => button.addEventListener('click', pdfHandler));
    cleanups.push(() => pdfButtons.forEach((button) => button.removeEventListener('click', pdfHandler)));

    // Horizontal certificate rail: trackpad horizontal swipes and touch work
    // natively; translate vertical wheel input while the rail can still scroll
    // so mouse users do not need to find the scrollbar. Page scrolling resumes
    // at either end of the rail.
    const railWheelHandlers = new Map<HTMLElement, (event: WheelEvent) => void>();
    Array.from(document.querySelectorAll<HTMLElement>('[data-certificate-rail]')).forEach((rail) => {
      const onWheel = (event: WheelEvent) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        const max = rail.scrollWidth - rail.clientWidth;
        if (max <= 0) return;
        if ((event.deltaY < 0 && rail.scrollLeft <= 0) || (event.deltaY > 0 && rail.scrollLeft >= max - 1)) return;
        event.preventDefault();
        rail.scrollLeft = Math.max(0, Math.min(max, rail.scrollLeft + event.deltaY));
      };
      rail.addEventListener('wheel', onWheel, { passive: false });
      railWheelHandlers.set(rail, onWheel);
    });
    cleanups.push(() => {
      railWheelHandlers.forEach((handler, rail) => rail.removeEventListener('wheel', handler));
      railWheelHandlers.clear();
    });

    // Copy email.
    const copyButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-copy-email]'));
    const copyHandler = async (event: MouseEvent) => {
      const button = event.currentTarget as HTMLButtonElement;
      const email = button.dataset.copyEmail ?? '';
      try {
        await navigator.clipboard.writeText(email);
        const label = button.querySelector<HTMLElement>('[data-copy-label]') ?? button;
        const original = label.textContent ?? 'Copy';
        label.textContent = 'Copied ✓';
        window.setTimeout(() => { label.textContent = original; }, 2200);
      } catch {
        window.location.href = `mailto:${email}`;
      }
    };
    copyButtons.forEach((button) => button.addEventListener('click', copyHandler));

    // Fitted footer wordmark.
    const mark = document.querySelector<HTMLElement>('[data-footer-mark]');
    const fitMark = () => {
      if (!mark) return;
      const parent = mark.parentElement;
      if (!parent) return;
      mark.style.fontSize = '100px';
      const width = mark.getBoundingClientRect().width;
      if (!width) return;
      const size = (parent.clientWidth / width) * 100 * 0.96;
      mark.style.fontSize = `${Math.max(24, Math.min(size, 320))}px`;
    };
    fitMark();
    document.fonts?.ready.then(fitMark).catch(() => undefined);
    window.addEventListener('resize', fitMark);

    // Floating CTA.
    const floating = document.querySelector<HTMLElement>('[data-floating-cta]');
    let floatingObserver: IntersectionObserver | undefined;
    if (floating) {
      const blockers = Array.from(document.querySelectorAll<HTMLElement>('[data-cta-blocker]'));
      const visible = new Set<Element>();
      floatingObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => { if (entry.isIntersecting) visible.add(entry.target); else visible.delete(entry.target); });
        floating.classList.toggle('is-visible', visible.size === 0);
      });
      blockers.forEach((blocker) => floatingObserver?.observe(blocker));
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', fitMark);
      activeObserver.disconnect();
      floatingObserver?.disconnect();
      anchors.forEach((anchor) => anchor.removeEventListener('click', anchorHandler));
      accordionButtons.forEach((button) => button.removeEventListener('click', accordionHandler));
      openButtons.forEach((button) => button.removeEventListener('click', openLightbox));
      pdfButtons.forEach((button) => button.removeEventListener('click', pdfHandler));
      copyButtons.forEach((button) => button.removeEventListener('click', copyHandler));
      dialog?.removeEventListener('click', backdropClick);
    };
  }, [reduced, finePointer, lenis, stopScroll, startScroll]);

  // Keyboard focus basics for modal overlays: keep Tab inside the visible modal,
  // focus the terminal input when it opens and return focus to the opener on close.
  // Escape is already handled by the native <dialog> and by the Terminal component.
  useEffect(() => {
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getOverlay = () => document.querySelector<HTMLElement>('dialog[open], .terminal-backdrop [role="dialog"][aria-modal="true"]');
    const getTerminal = () => document.querySelector<HTMLElement>('.terminal-backdrop [role="dialog"][aria-modal="true"]');

    let terminalOverlay: HTMLElement | null = null;
    let terminalTrigger: HTMLElement | null = null;
    const syncTerminalFocus = () => {
      const current = getTerminal();
      if (current && current !== terminalOverlay) {
        terminalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        terminalOverlay = current;
        if (!current.contains(document.activeElement)) {
          current.querySelector<HTMLElement>(focusableSelector)?.focus();
        }
      } else if (!current && terminalOverlay) {
        terminalOverlay = null;
        if (terminalTrigger?.isConnected) terminalTrigger.focus();
        terminalTrigger = null;
      }
    };
    const observer = new MutationObserver(syncTerminalFocus);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    syncTerminalFocus();

    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const overlay = getOverlay();
      if (!overlay) return;
      const focusables = Array.from(overlay.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true' && !element.closest('[inert]'));
      if (!focusables.length) {
        event.preventDefault();
        overlay.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapTab, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', trapTab, true);
    };
  }, []);

  // Custom cursor (fine pointer only).
  useEffect(() => {
    if (!finePointer || reduced) return;
    const dot = document.querySelector<HTMLElement>('[data-cursor-dot]');
    const ring = document.querySelector<HTMLElement>('[data-cursor-ring]');
    if (!dot || !ring) return;
    let targetX = -100;
    let targetY = -100;
    let x = -100;
    let y = -100;
    let raf = 0;
    const move = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      dot.style.transform = `translate3d(${targetX - 2.5}px, ${targetY - 2.5}px, 0)`;
      dot.classList.add('is-visible');
      ring.classList.add('is-visible');
      const label = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-cursor]')?.dataset.cursor ?? '';
      ring.textContent = label;
      ring.classList.toggle('is-hover', Boolean(label));
    };
    const render = () => {
      x += (targetX - x) * 0.2;
      y += (targetY - y) * 0.2;
      ring.style.transform = `translate3d(${x - 17}px, ${y - 17}px, 0)`;
      raf = requestAnimationFrame(render);
    };
    window.addEventListener('pointermove', move);
    raf = requestAnimationFrame(render);
    return () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(raf);
    };
  }, [finePointer, reduced]);

  return null;
}
