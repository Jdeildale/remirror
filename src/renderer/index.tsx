import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('Renderer fatal:', error);
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: '2rem',
            fontFamily: 'sans-serif',
            color: '#faf7f0',
            background: '#1a1816',
            minHeight: '100vh',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
            Remirror could not start
          </h1>
          <p style={{ marginBottom: '1rem', color: '#b8b1a4' }}>
            {this.state.error.message}
          </p>
          <p style={{ fontSize: '0.875rem', color: '#8a7f70' }}>
            Try restarting the app. If this persists, check the logs at
            %APPDATA%\Remirror\logs\main.log.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
