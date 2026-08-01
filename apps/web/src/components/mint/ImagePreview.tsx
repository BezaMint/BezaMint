'use client';

import { useState } from 'react';
import { HiOutlinePhotograph, HiOutlineLink } from 'react-icons/hi';

interface ImagePreviewProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
}

export default function ImagePreview({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: ImagePreviewProps) {
  const [error, setError] = useState(false);

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
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt="Preview"
              className="w-full h-full object-cover"
              onError={() => setError(true)}
              onLoad={() => setError(false)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <HiOutlinePhotograph className="w-8 h-8 text-gray-600" />
            </div>
          )}
        </div>

        {/* URL Input */}
        <div className="flex-1 relative">
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
      </div>
      {error && <p className="text-xs text-red-400 mt-1">Failed to load image preview</p>}
    </div>
  );
}
