import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// PORT and BASE_PATH only matter for `vite dev`/`vite preview` (a local dev
// server needs a port; Replit's proxy needs a base path). A static build
// for Vercel/Netlify/etc. needs neither, so we fall back to safe defaults
// instead of throwing — the old hard-required env vars broke `vite build`
// on any host that doesn't set them.
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || '/';

// Render exposes the deployed commit as RENDER_GIT_COMMIT. Stamping it
// into a meta tag makes "which version is live right now?" answerable by
// fetching the page — no dashboard access needed.
const buildCommit = (process.env.RENDER_GIT_COMMIT || 'dev').slice(0, 7);
const buildVersionPlugin = () => ({
  name: 'build-version-meta',
  transformIndexHtml(html: string) {
    return html.replace(
      '</title>',
      `</title>\n    <meta name="build-commit" content="${buildCommit}" />\n    <meta name="build-time" content="${new Date().toISOString()}" />`,
    );
  },
});

export default defineConfig({
  base: basePath,
  plugins: [
    buildVersionPlugin(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
