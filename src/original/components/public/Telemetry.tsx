'use client';

import { useEffect, useRef, useState } from 'react';
import { label, type LabelMap } from '@/lib/labels';

function formatTime(timezone: string, labels?: LabelMap): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  } catch {
    return label(labels, 'telemetry.clockFallback', '--:--');
  }
}

export function LocalClock({ timezone, labels }: { timezone: string; labels?: LabelMap }) {
  const [time, setTime] = useState(() => formatTime(timezone, labels));

  useEffect(() => {
    const update = () => setTime(formatTime(timezone, labels));
    update();
    const timer = window.setInterval(update, 30000);
    return () => window.clearInterval(timer);
  }, [timezone, labels]);

  return <span suppressHydrationWarning>{time}</span>;
}

export function ScrollProgress() {
  const bar = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progress = Math.min(1, Math.max(0, window.scrollY / max));
        if (bar.current) bar.current.style.transform = `scaleX(${progress.toFixed(4)})`;
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="scroll-progress" aria-hidden="true"><span ref={bar} /></div>
  );
}
