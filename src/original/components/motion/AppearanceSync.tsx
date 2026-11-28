'use client';

import { useEffect } from 'react';
import type { SiteSettings } from '@/lib/types';

const accents: Record<string, { primary: string; bright: string; deep: string; wash: string }> = {
  caramel: { primary: '#b8895b', bright: '#d8a876', deep: '#98714c', wash: 'rgba(184, 137, 91, 0.12)' },
  bronze: { primary: '#98714c', bright: '#c09a70', deep: '#77583a', wash: 'rgba(152, 113, 76, 0.12)' },
  warm: { primary: '#d8a876', bright: '#efd1a8', deep: '#b8895b', wash: 'rgba(216, 168, 118, 0.12)' },
  text: { primary: '#a99b8d', bright: '#f1e9df', deep: '#7c6d60', wash: 'rgba(241, 233, 223, 0.08)' },
};

export function AppearanceSync({ appearance }: { appearance: SiteSettings['appearance'] }) {
  useEffect(() => {
    const root = document.documentElement;
    const palette = accents[appearance.accent] ?? accents.caramel;
    root.style.setProperty('--accent', palette.primary);
    root.style.setProperty('--accent-bright', palette.bright);
    root.style.setProperty('--accent-deep', palette.deep);
    root.style.setProperty('--accent-wash', palette.wash);
    document.body.dataset.grain = appearance.grain ? 'on' : 'off';
  }, [appearance]);
  return null;
}
