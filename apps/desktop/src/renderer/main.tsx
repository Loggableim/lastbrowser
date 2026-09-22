import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

interface RootErrorBoundaryProps {
  children: ReactNode;
}

interface RootErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  constructor(props: RootErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[RootErrorBoundary] Uncaught renderer error:', error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleReset = (): void => {
    try {
      window.localStorage.removeItem('lastbrowser.tabs.v1');
      window.localStorage.removeItem('lastbrowser.activePanel');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          backgroundColor: '#07111F',
          color: '#E8F2FF',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '24px',
          boxSizing: 'border-box',
          textAlign: 'center'
        }}>
          <div style={{
            maxWidth: '520px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '32px',
            backdropFilter: 'blur(20px)'
          }}>
            <div style={{ fontSize: '36px', marginBottom: '16px' }}>⚡</div>
            <h2 style={{ fontSize: '20px', margin: '0 0 12px 0', fontWeight: 600 }}>
              Unerwarteter Anzeigefehler
            </h2>
            <p style={{ fontSize: '13px', color: 'rgba(232, 242, 255, 0.7)', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              Ein Fehler in der Benutzeroberfläche hat das Laden verhindert. Du kannst die Ansicht neu laden oder den Cache zurücksetzen.
            </p>
            {this.state.error && (
              <pre style={{
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 100, 100, 0.2)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '11px',
                color: '#ff8a8a',
                textAlign: 'left',
                overflowX: 'auto',
                marginBottom: '20px',
                maxHeight: '120px'
              }}>
                {this.state.error.message || String(this.state.error)}
              </pre>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #00d9ff, #2563eb)',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Neu laden
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'rgba(232, 242, 255, 0.8)',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Tabs zurücksetzen
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
