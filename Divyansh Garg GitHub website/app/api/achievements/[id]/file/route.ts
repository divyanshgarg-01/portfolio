import { NextResponse } from 'next/server';
import { servePublishedAchievementFile } from '@/lib/achievement-file';
import { apiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * Authorized access to media attached to a published achievement. This avoids
 * exposing private storage object paths in the public HTML.
 */
export async function GET(_request: Request, context: Context): Promise<NextResponse> {
  try {
    return await servePublishedAchievementFile((await context.params).id, {
      label: 'Achievement',
    });
  } catch (error) {
    return apiError(error);
  }
}
