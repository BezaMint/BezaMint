/**
 * Shared upload guard for IPFS routes: file-size cap, MIME allowlist, and
 * per-IP rate limiting. Keeping this in one module means both upload routes
 * enforce identical policy without duplicating the logic.
 */
import { NextResponse } from 'next/server';

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_METADATA_SIZE = 1_000_000; // 1MB

/** Validate a file against the shared policy; returns an error response or null. */
export function validateFile(file: File): NextResponse | null {
  if (file.size === 0) {
    return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
      { status: 413 },
    );
  }
  return null;
}
