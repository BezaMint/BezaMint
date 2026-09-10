'use client';

import { useState } from 'react';
import { HiOutlinePhotograph } from 'react-icons/hi';

interface SmartImageProps {
  src?: string;
  alt: string;
  className?: string;
  /** Rendered when the image fails to load */
  fallback?: React.ReactNode;
}

/**
 * Image with a loading shimmer while the asset downloads and a fallback
 * (default: a photo icon) when it fails to load or the source is empty.
 */
export default function SmartImage({ src, alt, className = '', fallback }: SmartImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const showFallback = !src || hasError;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {showFallback ? (
        <div className="w-full h-full flex items-center justify-center bg-bezamint-muted/30">
          {fallback ?? <HiOutlinePhotograph className="w-8 h-8 text-gray-600" />}
        </div>
      ) : (
        <>
          {isLoading && (
            <div
              className="absolute inset-0 animate-pulse bg-bezamint-muted/40"
              aria-hidden="true"
            />
          )}
          <img
            src={src}
            alt={alt}
            loading="lazy"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isLoading ? 'opacity-0' : 'opacity-100'
            }`}
          />
        </>
      )}
    </div>
  );
}
