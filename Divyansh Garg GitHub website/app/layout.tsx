import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import { MotionProvider } from '@/components/motion/MotionProvider';
import './globals.css';

// Fraunces is retained only for the particle name/monogram silhouette.
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' });
// Set the intent before the hero is painted. Without JS/canvas the attribute is
// never added and the ordinary semantic heading remains as a static fallback.
const heroIntentScript = `(function(){try{var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;if(!reduce){document.documentElement.setAttribute('data-intro','pending');setTimeout(function(){document.documentElement.removeAttribute('data-intro');},6000);}if(reduce||!window.HTMLCanvasElement)return;var c=document.createElement('canvas');if(!c.getContext||!c.getContext('2d'))return;document.documentElement.setAttribute('data-hero-intent','particles');}catch(e){}})();`;

function publicMetadataBase(): URL | undefined {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  title: 'Divyansh Garg — Data, Business & Technology',
  description: 'Portfolio of Divyansh Garg, undergraduate at IIT Madras, exploring data, business and technology.',
  metadataBase: publicMetadataBase(),
  openGraph: {
    title: 'Divyansh Garg — Data, Business & Technology',
    description: 'Portfolio of Divyansh Garg, undergraduate at IIT Madras.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fraunces.variable} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: heroIntentScript }} />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
