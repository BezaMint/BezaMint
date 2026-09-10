import { describe, it, expect } from 'vitest';
import { computeCompressedDimensions, isImageFile } from '../imageCompression';

describe('computeCompressedDimensions', () => {
  it('keeps small images unchanged', () => {
    expect(computeCompressedDimensions(800, 600, 1400)).toEqual({ width: 800, height: 600 });
  });

  it('downscales wide images to the max dimension', () => {
    const dims = computeCompressedDimensions(4000, 1000, 1400);
    expect(dims.width).toBe(1400);
    expect(dims.height).toBe(350);
  });

  it('downscales tall images preserving aspect ratio', () => {
    const dims = computeCompressedDimensions(500, 2000, 1000);
    expect(dims.height).toBe(1000);
    expect(dims.width).toBe(250);
  });

  it('handles square images at exactly the max dimension', () => {
    expect(computeCompressedDimensions(1400, 1400, 1400)).toEqual({ width: 1400, height: 1400 });
  });

  it('never produces zero-size dimensions', () => {
    const dims = computeCompressedDimensions(1, 1, 500);
    expect(dims.width).toBeGreaterThanOrEqual(1);
    expect(dims.height).toBeGreaterThanOrEqual(1);
  });

  it('rejects invalid dimensions', () => {
    expect(() => computeCompressedDimensions(0, 100)).toThrow();
    expect(() => computeCompressedDimensions(-5, 100)).toThrow();
    expect(() => computeCompressedDimensions(Number.NaN, 100)).toThrow();
  });
});

describe('isImageFile', () => {
  it('accepts common raster image types', () => {
    expect(isImageFile({ type: 'image/png' })).toBe(true);
    expect(isImageFile({ type: 'image/jpeg' })).toBe(true);
    expect(isImageFile({ type: 'image/webp' })).toBe(true);
  });

  it('rejects non-image and missing types', () => {
    expect(isImageFile({ type: 'application/pdf' })).toBe(false);
    expect(isImageFile({ type: '' })).toBe(false);
    expect(isImageFile({})).toBe(false);
  });
});
