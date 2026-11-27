import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { dataMode, getAdminDb } from './db';
import { createPublicSupabaseClient, createSupabaseAdapter } from './db/supabase';
import { createSupabaseServerClient } from './supabase-server';
import { createServiceSupabaseClient } from './service-supabase';
import { getMediaUsageMap } from './media-usage';
import type { DbAdapter } from './db/interface';
import type { MediaAsset, SessionUser } from './types';

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_PDF = 20 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const SIGNED_URL_TTL_SECONDS = 5 * 60;

export class MediaError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'MediaError';
  }
}

interface PreparedUpload {
  bytes: Uint8Array;
  objectPath: string;
  publicPath: string;
  displayName: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  blurDataUrl: string;
  bucket: 'media-public' | 'media-private';
}

function magicType(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | 'pdf' | null {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  return null;
}

function publicBucket(): string {
  return process.env.SUPABASE_STORAGE_PUBLIC_BUCKET || 'media-public';
}

function privateBucket(): string {
  return process.env.SUPABASE_STORAGE_PRIVATE_BUCKET || 'media-private';
}

const LOCAL_PRIVATE_DIR = 'private-uploads';

function isPrivateAsset(asset: Pick<MediaAsset, 'bucket'>): boolean {
  // CMS uploads classify PDFs as private. Static PDFs intentionally placed in
  // public/uploads (such as the CV) are public site assets and stay there.
  return asset.bucket === 'media-private';
}

/**
 * Local private media is stored outside `public/` so Next's static file handler
 * cannot bypass the authorization routes. Public images and the static CV stay
 * under `public/uploads/`.
 */
export function localObjectPath(asset: Pick<MediaAsset, 'path' | 'folder' | 'filename' | 'bucket' | 'mimeType'>): string {
  const objectPath = storageObjectPath(asset);
  return isPrivateAsset(asset)
    ? join(process.cwd(), LOCAL_PRIVATE_DIR, objectPath)
    : join(process.cwd(), 'public', 'uploads', objectPath);
}

/** Storage object key for a persisted asset, independent of URL representation. */
export function storageObjectPath(asset: Pick<MediaAsset, 'path' | 'folder' | 'filename' | 'bucket'>): string {
  const path = asset.path || '';
  if (path.startsWith('/uploads/')) return path.slice('/uploads/'.length);
  if (/^https?:\/\//i.test(path)) {
    const marker = `/storage/v1/object/${asset.bucket === 'media-public' ? 'public/' : ''}`;
    const index = path.indexOf(marker);
    if (index >= 0) {
      const remainder = path.slice(index + marker.length);
      const withoutBucket = remainder.startsWith(`${asset.bucket}/`)
        ? remainder.slice(asset.bucket.length + 1)
        : remainder;
      return withoutBucket;
    }
  }
  return `${asset.folder}/${asset.filename}`;
}

/** Public URL for a public-bucket asset. Private assets never use this helper. */
export function getPublicMediaUrl(asset: MediaAsset): string {
  if (dataMode === 'local') return asset.path;
  if (/^https?:\/\//i.test(asset.path)) return asset.path;
  const bucket = asset.bucket === 'media-private' ? privateBucket() : publicBucket();
  return createPublicSupabaseClient().storage.from(bucket).getPublicUrl(storageObjectPath(asset)).data.publicUrl;
}

async function prepareUpload(file: File, folder: string): Promise<PreparedUpload> {
  if (!ALLOWED.has(file.type)) throw new MediaError('Only JPEG, PNG, WebP and PDF files are allowed');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = magicType(bytes);
  if (!detected) throw new MediaError('File signature does not match its declared type');
  const expected: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
  if (expected[detected] !== file.type) throw new MediaError('File signature does not match its declared type');
  if (file.size > (detected === 'pdf' ? MAX_PDF : MAX_IMAGE)) throw new MediaError('File is too large');

  const safeFolder = /^[a-z0-9-]+$/.test(folder) ? folder : 'misc';
  const id = randomUUID();
  const ext = detected === 'pdf' ? 'pdf' : 'webp';
  const filename = `${id}.${ext}`;
  const objectPath = `${safeFolder}/${filename}`;
  const publicPath = `/uploads/${objectPath}`;
  const bucket: 'media-public' | 'media-private' = detected === 'pdf' ? 'media-private' : 'media-public';
  let width = 0;
  let height = 0;
  let blurDataUrl = '';
  let outputBytes = bytes;
  let mimeType = 'application/pdf';

  if (detected !== 'pdf') {
    const pipeline = sharp(Buffer.from(bytes), { failOn: 'warning' }).rotate();
    const meta = await pipeline.metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
    const webp = await pipeline.resize({ width: Math.min(width, 1920), withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    const preview = await sharp(webp).resize(20, 20, { fit: 'inside' }).webp({ quality: 30 }).toBuffer();
    blurDataUrl = `data:image/webp;base64,${preview.toString('base64')}`;
    outputBytes = new Uint8Array(webp);
    mimeType = 'image/webp';
  }

  return {
    bytes: outputBytes,
    objectPath,
    publicPath,
    displayName: file.name.slice(0, 120),
    mimeType,
    size: outputBytes.byteLength,
    width,
    height,
    blurDataUrl,
    bucket,
  };
}

function persistedPath(prepared: PreparedUpload): string {
  if (dataMode === 'local') return prepared.publicPath;
  if (prepared.bucket === 'media-private') return prepared.objectPath;
  return createPublicSupabaseClient()
    .storage.from(publicBucket())
    .getPublicUrl(prepared.objectPath).data.publicUrl;
}

async function writeObject(prepared: PreparedUpload, objectPath: string, bucketName: string, upsert = false): Promise<void> {
  if (dataMode === 'local') {
    const abs = isPrivateAsset(prepared)
      ? join(process.cwd(), LOCAL_PRIVATE_DIR, objectPath)
      : join(process.cwd(), 'public', 'uploads', objectPath);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, Buffer.from(prepared.bytes));
    return;
  }
  const client = await createSupabaseServerClient();
  const { error } = await client.storage.from(bucketName).upload(objectPath, prepared.bytes, {
    contentType: prepared.mimeType,
    upsert,
  });
  if (error) throw new MediaError(`Upload failed: ${error.message}`, 500);
}

export async function processUpload(file: File, folder: string, _user: SessionUser): Promise<MediaAsset> {
  const db = await getAdminDb();
  const prepared = await prepareUpload(file, folder);
  const bucketName = prepared.bucket === 'media-private' ? privateBucket() : publicBucket();
  await writeObject(prepared, prepared.objectPath, bucketName);

  return db.createMedia({
    id: randomUUID(),
    path: persistedPath(prepared),
    bucket: prepared.bucket,
    filename: prepared.displayName,
    folder: folder.replace(/[^a-z0-9-]/gi, '') || 'misc',
    altText: '',
    mimeType: prepared.mimeType,
    size: prepared.size,
    width: prepared.width,
    height: prepared.height,
    blurDataUrl: prepared.blurDataUrl,
    uploadedBy: _user.id,
  });
}

async function readObject(asset: MediaAsset): Promise<Uint8Array | null> {
  const objectPath = storageObjectPath(asset);
  if (dataMode === 'local') {
    try {
      return new Uint8Array(await readFile(localObjectPath(asset)));
    } catch {
      return null;
    }
  }
  const bucket = asset.bucket === 'media-private' ? privateBucket() : publicBucket();
  const { data, error } = await createServiceSupabaseClient().storage.from(bucket).download(objectPath);
  return error || !data ? null : new Uint8Array(await data.arrayBuffer());
}

async function restoreObject(asset: MediaAsset, bytes: Uint8Array): Promise<void> {
  const objectPath = storageObjectPath(asset);
  if (dataMode === 'local') {
    const abs = localObjectPath(asset);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, Buffer.from(bytes));
    return;
  }
  const bucket = asset.bucket === 'media-private' ? privateBucket() : publicBucket();
  const { error } = await createServiceSupabaseClient().storage
    .from(bucket)
    .upload(objectPath, bytes, { contentType: asset.mimeType, upsert: true });
  if (error) throw new MediaError(`Replacement failed and the original file could not be restored: ${error.message}`, 500);
}

export async function replaceUpload(assetId: string, file: File, user: SessionUser): Promise<MediaAsset> {
  const db = await getAdminDb();
  const existing = await db.getMedia(assetId);
  if (!existing) throw new MediaError('Media asset not found', 404);
  const isPdfUpload = file.type === 'application/pdf';
  const isPdfAsset = existing.mimeType === 'application/pdf';
  if (isPdfUpload !== isPdfAsset) {
    throw new MediaError('Replacement file type must match the existing asset (image or PDF)');
  }

  const prepared = await prepareUpload(file, existing.folder);
  const objectPath = storageObjectPath(existing);
  const bucket = existing.bucket === 'media-private' ? privateBucket() : publicBucket();
  const original = await readObject(existing);
  try {
    await writeObject(prepared, objectPath, bucket, true);
  } catch (error) {
    if (original) await restoreObject(existing, original);
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new MediaError(`Upload failed: ${message}`, 500);
  }

  const finalPath = dataMode === 'local'
    ? existing.path
    : existing.bucket === 'media-private'
      ? objectPath
      : createPublicSupabaseClient().storage.from(publicBucket()).getPublicUrl(objectPath).data.publicUrl;

  await db.updateMedia(assetId, {
    path: finalPath,
    bucket: existing.bucket,
    filename: prepared.displayName,
    mimeType: prepared.mimeType,
    size: prepared.size,
    width: prepared.width,
    height: prepared.height,
    blurDataUrl: prepared.blurDataUrl,
    uploadedBy: user.id,
  });
  revalidatePath('/');
  const updated = await db.getMedia(assetId);
  if (!updated) throw new MediaError('Media asset not found after replacement', 500);
  return updated;
}

export async function deleteUpload(assetId: string, db?: DbAdapter): Promise<void> {
  const adapter = db ?? await getAdminDb();
  const asset = await adapter.getMedia(assetId);
  if (!asset) throw new MediaError('Media asset not found', 404);
  const usage = await getMediaUsageMap(adapter);
  const referenced = [...(usage[asset.id] ?? []), ...(usage[asset.path] ?? [])];
  if (referenced.length > 0) {
    throw new MediaError(`This asset is used in ${referenced.length} place(s) and cannot be deleted`, 409);
  }

  const objectPath = storageObjectPath(asset);
  if (dataMode === 'local') {
    try {
      await unlink(localObjectPath(asset));
    } catch {
      // Already removed.
    }
  } else {
    const client = await createSupabaseServerClient();
    const bucket = asset.bucket === 'media-private' ? privateBucket() : publicBucket();
    const { error } = await client.storage.from(bucket).remove([objectPath]);
    if (error) throw new MediaError(`Could not remove stored file: ${error.message}`, 500);
  }
  await adapter.deleteMedia(assetId);
}

/**
 * Mint a short-lived signed URL for a private document. Callers must have
 * already verified the signed-in user and role; the service-role client is
 * isolated here because private storage has no anon/authenticated SELECT.
 */
export async function createSignedMediaUrl(assetId: string, user: SessionUser): Promise<string> {
  if (!user) throw new MediaError('Authentication required', 401);
  const db = await getAdminDb();
  const asset = await db.getMedia(assetId);
  if (!asset) throw new MediaError('Media asset not found', 404);
  if (asset.bucket !== 'media-private' && asset.mimeType !== 'application/pdf') {
    throw new MediaError('This asset is public', 400);
  }
  if (dataMode === 'local') {
    return `/api/media/${assetId}/signed`;
  }
  const service = createServiceSupabaseClient();
  const bucket = asset.bucket === 'media-private' ? privateBucket() : publicBucket();
  const { data, error } = await service.storage
    .from(bucket)
    .createSignedUrl(storageObjectPath(asset), SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw new MediaError(`Could not create signed URL: ${error?.message ?? 'unknown error'}`, 500);
  return data.signedUrl;
}

/**
 * Load an asset for a verified, published certificate. Private media has no
 * anon RLS policy, so Supabase mode intentionally uses the service role here;
 * callers MUST authorize the certificate before invoking this helper.
 */
export async function getCertificateAsset(assetId: string): Promise<MediaAsset | null> {
  if (dataMode === 'local') return (await getAdminDb()).getMedia(assetId);
  return createSupabaseAdapter(createServiceSupabaseClient()).getMedia(assetId);
}

/** Short-lived public URL for a published certificate's private PDF. */
export async function createSignedCertificateUrl(asset: MediaAsset): Promise<string> {
  if (dataMode === 'local') throw new MediaError('Local certificate files are streamed directly', 400);
  const service = createServiceSupabaseClient();
  const bucket = asset.bucket === 'media-private' ? privateBucket() : publicBucket();
  const { data, error } = await service.storage
    .from(bucket)
    .createSignedUrl(storageObjectPath(asset), SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw new MediaError(`Could not open certificate: ${error?.message ?? 'unknown error'}`, 500);
  return data.signedUrl;
}
