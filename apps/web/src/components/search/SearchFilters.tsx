'use client';

import { useCallback } from 'react';

interface SearchFiltersProps {
  categories: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function SearchFilters({ categories, selected, onChange }: SearchFiltersProps) {
  const toggle = useCallback(
    (cat: string) => {
      if (selected.includes(cat)) {
        onChange(selected.filter((c) => c !== cat));
      } else {
        onChange([...selected, cat]);
      }
    },
    [selected, onChange],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Filters</h3>
        {selected.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="text-xs text-bezamint-secondary hover:text-bezamint-primary transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => {
          const isActive = selected.includes(cat.value);
          return (
            <button
              key={cat.value}
              onClick={() => toggle(cat.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                isActive
                  ? 'bg-bezamint-primary/20 border-bezamint-primary/50 text-bezamint-secondary'
                  : 'bg-bezamint-muted/30 border-bezamint-border text-gray-400 hover:border-gray-600 hover:text-gray-300'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
