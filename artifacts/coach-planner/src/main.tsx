import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// When the frontend and backend are deployed as two separate services
// (e.g. frontend on Vercel, backend on Railway/Render), point every
// relative `/api/...` call at the backend's own domain. Leave VITE_API_URL
// unset when both are served from the same origin (e.g. local dev).
if (import.meta.env.VITE_API_URL) {
  setBaseUrl(import.meta.env.VITE_API_URL);
}

createRoot(document.getElementById('root')!).render(<App />);
