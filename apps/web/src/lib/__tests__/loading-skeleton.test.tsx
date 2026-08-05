import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

describe('LoadingSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<LoadingSkeleton />);
    expect(container).toBeTruthy();
  });
});
