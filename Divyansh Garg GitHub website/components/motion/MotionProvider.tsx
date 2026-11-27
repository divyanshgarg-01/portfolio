'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger);

interface MotionContextValue {
  reduced: boolean;
  finePointer: boolean;
  lenis: Lenis | null;
  stopScroll: () => void;
  startScroll: () => void;
  refresh: () => void;
}

const MotionContext = createContext<MotionContextValue>({
  reduced: false,
  finePointer: false,
  lenis: null,
  stopScroll: () => undefined,
  startScroll: () => undefined,
  refresh: () => undefined,
});

export const useMotion = (): MotionContextValue => useContext(MotionContext);

export function MotionProvider({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(false);
  const [finePointer, setFinePointer] = useState(false);
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointerQuery = window.matchMedia('(pointer: fine)');
    const sync = () => {
      setReduced(motionQuery.matches);
      setFinePointer(pointerQuery.matches);
      document.documentElement.dataset.motion = motionQuery.matches ? 'off' : 'on';
    };
    sync();
    motionQuery.addEventListener('change', sync);
    pointerQuery.addEventListener('change', sync);

    let tick: ((time: number) => void) | null = null;
    if (!motionQuery.matches) {
      const lenis = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 1 });
      lenisRef.current = lenis;
      lenis.on('scroll', ScrollTrigger.update);
      tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }

    return () => {
      motionQuery.removeEventListener('change', sync);
      pointerQuery.removeEventListener('change', sync);
      if (tick) gsap.ticker.remove(tick);
      lenisRef.current?.destroy();
      lenisRef.current = null;
    };
  }, []);

  const stopScroll = () => {
    lenisRef.current?.stop();
    document.documentElement.style.overflow = 'hidden';
  };
  const startScroll = () => {
    lenisRef.current?.start();
    document.documentElement.style.overflow = '';
  };

  return (
    <MotionContext.Provider
      value={{
        reduced,
        finePointer,
        lenis: lenisRef.current,
        stopScroll,
        startScroll,
        refresh: () => ScrollTrigger.refresh(),
      }}
    >
      {children}
    </MotionContext.Provider>
  );
}
