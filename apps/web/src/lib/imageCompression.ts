/**
 * Client-side image compression utilities.
 *
 * Large full-resolution uploads are slow and expensive (Pinata charges per
 * request and per byte). Before anything reaches the network we resize the
 * image to a max dimension and re-encode it as WebP, which dramatically cuts
 * payload size while keeping visual quality for NFT images.
 */

export interface CompressOptions {
  /** Maximum width/height in pixels (aspect ratio preserved). Default 1400. */
  maxDimension?: number;
  /** WebP quality 0..1. Default 0.8. */
  quality?: number;
}

/**
 * Compute the target dimensions that preserve aspect ratio while fitting
 * within `maxDimension`. Pure function, unit-testable without a browser.
 */
export function computeCompressedDimensions(
  width: number,
  height: number,
  maxDimension = 1400,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Invalid image dimensions');
  }
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Whether a file is an acceptable raster image for compression.
 */
export function isImageFile(file: { type?: string; name?: string }): boolean {
  return typeof file?.type === 'string' && file.type.startsWith('image/');
}

/**
 * Compress + re-encode a raster image file to WebP in the browser.
 * Uses createImageBitmap for efficient decode and canvas for scaling.
 * Returns a new File suitable for upload.
 */
export async function compressImageFile(file: File, options: CompressOptions = {}): Promise<File> {
  const { maxDimension = 1400, quality = 0.8 } = options;

  if (!isImageFile(file)) {
    throw new Error('Only image files can be compressed');
  }
  if (!('createImageBitmap' in window)) {
    throw new Error('Image compression is not supported in this browser');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = computeCompressedDimensions(
      bitmap.width,
      bitmap.height,
      maxDimension,
    );

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is not available');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality),
    );
    if (!blob) {
      throw new Error('Image encoding failed');
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${baseName}.webp`, { type: 'image/webp' });
  } finally {
    bitmap.close();
  }
}
