'use client';

import React from 'react';
import { HiOutlineExclamationCircle } from 'react-icons/hi';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary that catches render errors and displays a
 * user-friendly fallback UI instead of a blank white screen.
 */
export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    // In production, you would send this to your error monitoring service
    if (process.env.NODE_ENV === 'development') {
      console.error('[ErrorBoundary]', error, errorInfo.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="card max-w-md w-full text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 mb-4">
              <HiOutlineExclamationCircle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-gray-400 mb-6">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <pre className="mb-6 p-4 bg-bezamint-muted/30 rounded-xl text-xs text-left text-red-400 overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <button onClick={this.handleReset} className="btn-primary text-sm">
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
