'use client';

import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi';
import type { NftAttribute } from '@bezamint/shared';

interface AttributeEditorProps {
  attributes: NftAttribute[];
  onChange: (attributes: NftAttribute[]) => void;
  maxAttributes?: number;
}

const EMPTY_ATTRIBUTE: NftAttribute = { traitType: '', value: '', displayType: 'string' };

export default function AttributeEditor({
  attributes,
  onChange,
  maxAttributes = 20,
}: AttributeEditorProps) {
  const addAttribute = () => {
    if (attributes.length >= maxAttributes) return;
    onChange([...attributes, { ...EMPTY_ATTRIBUTE }]);
  };

  const removeAttribute = (index: number) => {
    onChange(attributes.filter((_, i) => i !== index));
  };

  const updateAttribute = (index: number, field: keyof NftAttribute, value: string) => {
    const updated = attributes.map((attr, i) =>
      i === index ? { ...attr, [field]: value } : attr,
    );
    onChange(updated);
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

      {attributes.map((attr, idx) => (
        <div
          key={idx}
          className="flex items-start gap-2 p-3 rounded-xl bg-bezamint-muted/30 border border-bezamint-border group"
        >
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Trait (e.g. Color)"
              value={attr.traitType}
              onChange={(e) => updateAttribute(idx, 'traitType', e.target.value)}
              className="input-field text-sm py-2"
            />
            <input
              type="text"
              placeholder="Value (e.g. Gold)"
              value={attr.value}
              onChange={(e) => updateAttribute(idx, 'value', e.target.value)}
              className="input-field text-sm py-2"
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
      ))}

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
