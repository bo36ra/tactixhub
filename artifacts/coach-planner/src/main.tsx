import { createRoot } from 'react-dom/client';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { setBaseUrl } from '@workspace/api-client-react';

import './index.css';

// When the frontend and backend are deployed as two separate services
// (e.g. frontend on Vercel, backend on Railway/Render), point every
// relative `/api/...` call at the backend's own domain. Leave VITE_API_URL
// unset when both are served from the same origin (e.g. local dev).
if (import.meta.env.VITE_API_URL) {
  setBaseUrl(import.meta.env.VITE_API_URL);
}

// Without this, any error thrown while loading/rendering the app (missing
// env var, bad Clerk key, etc.) crashes silently and leaves a blank/black
// page with nothing in the DOM — impossible to diagnose without devtools.
// This prints the actual message on screen instead, whether it happened
// while importing App.tsx or later while rendering it.
class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Root render error:', error, info);
  }
  render() {
    if (this.state.error) {
      return <ErrorScreen error={this.state.error} />;
    }
    return this.props.children;
  }
}

function ErrorScreen({ error }: { error: Error }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#181613',
      color: '#EAE0D0',
      fontFamily: 'monospace',
      padding: '24px',
      direction: 'ltr',
      textAlign: 'left',
    }}>
      <h1 style={{ color: '#f87171', fontSize: '18px', marginBottom: '12px' }}>
        App failed to start
      </h1>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: 1.6 }}>
        {error.message}
        {'\n\n'}
        {error.stack}
      </pre>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);

import('./App')
  .then(({ default: App }) => {
    root.render(
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>,
    );
  })
  .catch((error: Error) => {
    console.error('Failed to load App:', error);
    root.render(<ErrorScreen error={error} />);
  });
