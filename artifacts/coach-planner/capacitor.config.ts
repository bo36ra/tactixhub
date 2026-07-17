import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tactixhub.app',
  appName: 'TactixHub',
  // Vite's build output — matches the same dist folder Render deploys.
  // Only used as a local fallback; server.url below takes priority.
  webDir: 'dist/public',
  // Load the live, already-deployed site directly instead of bundling a
  // static local build. Two reasons this matters:
  // 1) Clerk (and most hosted auth providers) validate the request's
  //    origin against the domain registered in their dashboard — a
  //    locally-bundled build serves from capacitor://localhost, an
  //    origin Clerk doesn't recognize, so sign-in silently fails.
  //    Loading the real https:// domain makes auth behave exactly like
  //    it does in a normal browser.
  // 2) Every future deploy (git push -> Render rebuild) shows up in the
  //    app immediately on next launch — no more local rebuild/cap sync
  //    needed for ordinary feature updates.
  server: {
    url: 'https://coach-planner-web-3.onrender.com',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#141210',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
