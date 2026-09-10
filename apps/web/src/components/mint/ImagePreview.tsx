'use client';

import { useRef, useState } from 'react';
import { HiOutlinePhotograph, HiOutlineLink, HiOutlineUpload } from 'react-icons/hi';
import { compressImageFile } from '@/lib/imageCompression';

interface ImagePreviewProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function ImagePreview({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: ImagePreviewProps) {
  const [error, setError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Only JPEG, PNG, WebP and GIF images are supported');
      return;
    }

    setUploading(true);
    try {
      // Compress + convert to WebP on the client to keep uploads small and cheap.
      const compressed = await compressImageFile(file, { maxDimension: 1400, quality: 0.8 });

      const body = new FormData();
      body.append('file', compressed);

      const response = await fetch('/api/ipfs/upload-file', { method: 'POST', body });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Image upload failed');
      }

      onChange(result.ipfsUri || result.gatewayUrl || '');
      setError(false);
    } catch (err: unknown) {
      setUploadError((err as Error)?.message || 'Image upload failed. Try a URL instead.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="input-label">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      <div className="flex items-center gap-3">
        {/* Preview */}
        <div className="w-20 h-20 flex-shrink-0 rounded-xl bg-bezamint-muted/50 border border-bezamint-border overflow-hidden">
          {value && !error ? (
            <img
              src={value}
              alt="Preview"
              className="w-full h-full object-cover"
              onError={() => setError(true)}
              onLoad={() => setError(false)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {uploading ? (
                <svg className="animate-spin h-6 w-6 text-gray-500" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                <HiOutlinePhotograph className="w-8 h-8 text-gray-600" />
              )}
            </div>
          )}
        </div>

        {/* URL Input + Upload */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <HiOutlineLink className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="url"
                value={value}
                onChange={(e) => {
                  setError(false);
                  onChange(e.target.value);
                }}
                placeholder={placeholder}
                className="input-field pl-10"
                required={required}
              />
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn-secondary py-2.5 px-3 flex-shrink-0 flex items-center gap-1.5 text-sm disabled:opacity-50"
              title="Upload an image from your device"
            >
              <HiOutlineUpload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      {uploadError && <p className="text-xs text-red-400 mt-1">{uploadError}</p>}
      {error && !uploadError && (
        <p className="text-xs text-red-400 mt-1">Failed to load image preview</p>
      )}
    </div>
  );
}
