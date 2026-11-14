import "server-only";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";

export const MEDIA_BUCKET = "media";
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Re-encodes an uploaded photo as a resized JPEG plus a small thumbnail. Re-encoding
 * drops all metadata, including the GPS location phones put in photos, and turns
 * the image the right way up first.
 */
export async function processPhoto(file: File): Promise<{ full: Buffer; thumb: Buffer }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("too large");
  const input = Buffer.from(await file.arrayBuffer());
  const base = sharp(input, { failOn: "error", limitInputPixels: 50_000_000 }).rotate();
  const [full, thumb] = await Promise.all([
    base.clone().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer(),
    base.clone().resize(400, 400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer(),
  ]);
  return { full, thumb };
}

export async function uploadPhoto(path: string, data: Buffer): Promise<void> {
  const { error } = await createAdminClient()
    .storage.from(MEDIA_BUCKET)
    .upload(path, data, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
}

export async function removePhotos(paths: string[]): Promise<void> {
  if (paths.length) await createAdminClient().storage.from(MEDIA_BUCKET).remove(paths);
}

/**
 * Links that expire after an hour, so a forwarded link stops working. Only call this
 * with paths read through the logged-in user's own (row-level secured) query.
 */
export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const { data } = await createAdminClient().storage.from(MEDIA_BUCKET).createSignedUrls(paths, 3600);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}
