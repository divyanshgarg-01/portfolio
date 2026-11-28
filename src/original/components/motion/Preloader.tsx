'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { label, type LabelMap } from '@/lib/labels';
import { useMotion } from './MotionProvider';

const WORDS = ['Research', 'Building', 'Refining', 'Shipping'];

function preloaderWords(labels?: LabelMap): string[] {
  const section = labels?.preloader;
  const words = section && typeof section === 'object' ? (section as Record<string, unknown>).words : undefined;
  return Array.isArray(words) && words.length > 0 && words.every((word) => typeof word === 'string')
    ? (words as string[])
    : WORDS;
}

export function Preloader({ enabled, labels }: { enabled: boolean; labels?: LabelMap }) {
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const { reduced } = useMotion();
  const words = preloaderWords(labels);

  useEffect(() => {
    if (!enabled || reduced) return;
    try {
      if (sessionStorage.getItem('dg-intro') === '1') return;
      sessionStorage.setItem('dg-intro', '1');
    } catch {
      // Private browsing can block storage; show the loader anyway.
    }
    setMounted(true);
  }, [enabled, reduced]);

  useEffect(() => {
    if (!mounted) return;
    const root = rootRef.current;
    if (!root) return;
    const state = { value: 0 };
    let wordIndex = 0;
    const wordTimer = window.setInterval(() => {
      wordIndex = (wordIndex + 1) % words.length;
      if (wordRef.current) wordRef.current.textContent = words[wordIndex];
    }, 420);
    const timeline = gsap.timeline({
      onComplete: () => setMounted(false),
    });
    timeline
      .to(state, {
        value: 100,
        duration: 1.8,
        ease: 'power3.inOut',
        onUpdate: () => {
          if (countRef.current) countRef.current.textContent = String(Math.round(state.value)).padStart(3, '0');
          if (barRef.current) barRef.current.style.transform = `scaleX(${state.value / 100})`;
        },
      })
      .to(root, { clipPath: 'inset(0 0 100% 0)', duration: 0.9, ease: 'expo.inOut' }, '-=0.5');
    return () => {
      window.clearInterval(wordTimer);
      timeline.kill();
    };
  }, [mounted]);

  if (!mounted) return null;
  return (
    <div className="loader" ref={rootRef} aria-hidden="true">
      <div className="loader__count" ref={countRef}>{label(labels, 'preloader.countFallback', '000')}</div>
      <div className="loader__row">
        <div className="loader__word" ref={wordRef}>{words[0]}</div>
        <div className="loader__word">{label(labels, 'preloader.signature', 'DIVYANSH GARG — PORTFOLIO')}</div>
      </div>
      <div className="loader__bar" ref={barRef} />
    </div>
  );
}
