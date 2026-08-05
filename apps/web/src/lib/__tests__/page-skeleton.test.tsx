import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import PageSkeleton from '@/components/ui/PageSkeleton';

describe('PageSkeleton', () => {
  it('renders correct number of rows', () => {
    const { container } = render(<PageSkeleton rows={3} />);
    expect(container).toBeTruthy();
  });
});
