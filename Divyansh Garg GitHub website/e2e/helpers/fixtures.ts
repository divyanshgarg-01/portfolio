import { Buffer } from 'node:buffer';
import sharp from 'sharp';

/** Synthetic marker used only by e2e draft records; it must never leak publicly. */
export const DRAFT_ONLY_MARKER = '__E2E_DRAFT_ONLY_MARKER__';

export function uniqueRunId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function testProjectTitle(runId: string): string {
  return `E2E Draft Project ${runId}`;
}

/** A tiny, real image generated at runtime so no binary fixture is checked in. */
export async function tinyWebpBuffer(): Promise<Buffer> {
  const bytes = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 197, g: 147, b: 93 },
    },
  })
    .webp({ quality: 80 })
    .toBuffer();
  return Buffer.from(bytes);
}
