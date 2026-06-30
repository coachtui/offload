/**
 * Minimal error boundary. Wrap non-critical UI (e.g. the proximity banner) so a
 * render error in that subtree renders nothing instead of crashing the whole app.
 */
import React from 'react';

interface Props {
  children: React.ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ''}] caught:`, error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
