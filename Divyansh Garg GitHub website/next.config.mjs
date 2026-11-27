/** @type {import('next').NextConfig} */
const dev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  allowedDevOrigins: ['127.0.0.1'],
  // Media URLs come from CMS records at runtime: local `/uploads/...` paths,
  // full Supabase public URLs, or storage object paths resolved in the browser.
  // The public site uses plain <img> with width/height + loading="lazy" so it
  // works with both backends without needing a build-time remote-pattern list.
  images: { unoptimized: true },
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};

export default nextConfig;
