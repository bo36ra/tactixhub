import { createRoot } from 'react-dom/client';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { setBaseUrl } from '@workspace/api-client-react';
import { initStatusBar } from './lib/native';
import App from './App';

import './index.css';

initStatusBar();

declare global {
  interface Window {
    __logBoot?: (msg: string) => void;
  }
}
window.__logBoot?.('2. main.tsx module started');

// When the frontend and backend are deployed as two separate services
// (e.g. frontend on Vercel, backend on Railway/Render), point every
// relative `/api/...` call at the backend's own domain. Leave VITE_API_URL
// unset when both are served from the same origin (e.g. local dev).
if (import.meta.env.VITE_API_URL) {
  setBaseUrl(import.meta.env.VITE_API_URL);
}
window.__logBoot?.('3. setBaseUrl done, VITE_API_URL=' + (import.meta.env.VITE_API_URL || '(unset)'));
const _pk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';
window.__logBoot?.('3b. CLERK_KEY len=' + _pk.length + ' value=[' + _pk + ']');
window.__logBoot?.('3c. CLERK_PROXY_URL=[' + (import.meta.env.VITE_CLERK_PROXY_URL || '') + ']');

// Every page is lazy-loaded as a hashed chunk. After a redeploy the old
// hashed filenames no longer exist on the server, so a tab that was opened
// before the deploy fails to import the chunk on its next navigation and
// the screen dies. Vite emits 'vite:preloadError' for exactly this case —
// reload once to pick up the new build (guarded so a genuinely broken
// deploy can't cause an infinite reload loop).
const RELOAD_GUARD_KEY = 'chunk-reload-at';
function reloadOnceForStaleChunks(): boolean {
  const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
  if (Date.now() - last < 30_000) return false;
  sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  window.location.reload();
  return true;
}
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForStaleChunks()) event.preventDefault();
});

function isStaleChunkError(error: Error): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(
    `${error.name} ${error.message}`,
  );
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
    // A stale-chunk crash right after a redeploy is fixed by reloading —
    // do that silently instead of showing the error screen.
    if (isStaleChunkError(error)) reloadOnceForStaleChunks();
  }
  render() {
    if (this.state.error) {
      if (isStaleChunkError(this.state.error)) {
        // Reload already triggered in componentDidCatch — keep the screen
        // calm (dark, branded) instead of flashing a stack trace.
        return (
          <div style={{ minHeight: '100vh', background: '#181613', color: '#EAE0D0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
            <p>Updating TactixHub…</p>
          </div>
        );
      }
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
window.__logBoot?.('4. root created, rendering App...');

root.render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>,
);
window.__logBoot?.('5. render() called');
