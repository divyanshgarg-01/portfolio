import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';

/**
 * Local development media is written after `next build`, so Next's static
 * public-file handler does not see it. This route serves only the narrow
 * folder/filename shape produced by lib/media.ts.
 */
export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
};

interface Context {
  params: Promise<{ parts: string[] }>;
}

export async function GET(_request: Request, context: Context) {
  const { parts } = await context.params;
  if (parts.length !== 2) return new NextResponse('Not found', { status: 404 });

  const [folder, filename] = parts;
  if (!/^[a-z0-9-]{1,60}$/.test(folder)) return new NextResponse('Not found', { status: 404 });

  const match = /^([0-9a-f-]{36})\.(webp|png|jpe?g|pdf)$/.exec(filename);
  if (!match) return new NextResponse('Not found', { status: 404 });

  const contentType = CONTENT_TYPES[match[2]];
  if (!contentType) return new NextResponse('Not found', { status: 404 });
  // PDFs are private documents. Authorized routes read them from disk directly;
  // this public route must never expose them, even in local/E2E mode.
  if (contentType === 'application/pdf') return new NextResponse('Not found', { status: 404 });

  try {
    const bytes = await readFile(join(process.cwd(), 'public', 'uploads', folder, filename));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': contentType,
        // Paths are reused on replacement, so they must not be immutable.
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
