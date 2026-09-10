'use client';

import { useState } from 'react';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineExclamationCircle } from 'react-icons/hi';
import type { NftAttribute } from '@bezamint/shared';
import { METADATA_LIMITS } from '@bezamint/shared';

interface AttributeEditorProps {
  attributes: NftAttribute[];
  onChange: (attributes: NftAttribute[]) => void;
  maxAttributes?: number;
}

const EMPTY_ATTRIBUTE: NftAttribute = { traitType: '', value: '', displayType: 'string' };

export default function AttributeEditor({
  attributes,
  onChange,
  maxAttributes = METADATA_LIMITS.attributes.max,
}: AttributeEditorProps) {
  const [errors, setErrors] = useState<Record<number, string>>({});

  const validateRow = (idx: number, attrs: NftAttribute[]): string | null => {
    const attr = attrs[idx];
    if (!attr) return null;
    if (!attr.traitType.trim() || !attr.value.trim()) {
      return 'Both trait and value are required';
    }
    const duplicate = attrs.findIndex(
      (a, i) =>
        i !== idx && a.traitType.trim().toLowerCase() === attr.traitType.trim().toLowerCase(),
    );
    if (duplicate !== -1) {
      return 'Trait names must be unique';
    }
    if (attr.value.trim().length > METADATA_LIMITS.attributeValue.max) {
      return `Value must be ${METADATA_LIMITS.attributeValue.max} characters or fewer`;
    }
    return null;
  };

  const addAttribute = () => {
    if (attributes.length >= maxAttributes) return;
    onChange([...attributes, { ...EMPTY_ATTRIBUTE }]);
  };

  const removeAttribute = (index: number) => {
    const next = attributes.filter((_, i) => i !== index);
    onChange(next);
    setErrors((prev) => {
      const n = { ...prev };
      delete n[index];
      return n;
    });
  };

  const updateAttribute = (index: number, field: keyof NftAttribute, value: string) => {
    const updated = attributes.map((attr, i) => (i === index ? { ...attr, [field]: value } : attr));
    onChange(updated);
    setErrors((prev) => {
      const n = { ...prev };
      if (field === 'traitType' || field === 'value') {
        const err = validateRow(index, updated);
        if (err) n[index] = err;
        else delete n[index];
      }
      return n;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="input-label">Attributes / Traits</label>
        <span className="text-xs text-gray-500">
          {attributes.length}/{maxAttributes}
        </span>
      </div>

      {attributes.length === 0 && (
        <p className="text-sm text-gray-500 py-2">
          No attributes yet. Add traits like &quot;Color&quot;, &quot;Rarity&quot;, etc.
        </p>
      )}

      {attributes.map((attr, idx) => {
        const err = errors[idx];
        return (
          <div
            key={idx}
            className={`p-3 rounded-xl bg-bezamint-muted/30 border transition-colors group ${
              err ? 'border-red-500/40' : 'border-bezamint-border'
            }`}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Trait (e.g. Color)"
                  value={attr.traitType}
                  onChange={(e) => updateAttribute(idx, 'traitType', e.target.value)}
                  maxLength={64}
                  className="input-field text-sm py-2"
                  aria-invalid={!!err}
                />
                <input
                  type="text"
                  placeholder="Value (e.g. Gold)"
                  value={attr.value}
                  onChange={(e) => updateAttribute(idx, 'value', e.target.value)}
                  maxLength={METADATA_LIMITS.attributeValue.max}
                  className="input-field text-sm py-2"
                  aria-invalid={!!err}
                />
                <select
                  value={attr.displayType || 'string'}
                  onChange={(e) => updateAttribute(idx, 'displayType', e.target.value)}
                  className="input-field text-sm py-2"
                >
                  <option value="string">Text</option>
                  <option value="number">Number</option>
                  <option value="boost_number">Boost Number</option>
                  <option value="boost_percentage">Boost %</option>
                  <option value="date">Date</option>
                </select>
              </div>
              <button
                onClick={() => removeAttribute(idx)}
                className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all mt-0.5"
                title="Remove attribute"
              >
                <HiOutlineTrash className="w-4 h-4" />
              </button>
            </div>
            {err && (
              <p className="flex items-center gap-1 text-xs text-red-400 mt-2">
                <HiOutlineExclamationCircle className="w-3 h-3" />
                {err}
              </p>
            )}
          </div>
        );
      })}

      <button
        onClick={addAttribute}
        disabled={attributes.length >= maxAttributes}
        className="flex items-center gap-2 text-sm text-bezamint-secondary hover:text-bezamint-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <HiOutlinePlus className="w-4 h-4" />
        Add Attribute
      </button>
    </div>
  );
}
