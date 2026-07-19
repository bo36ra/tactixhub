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
  // The white strip behind the status bar was never the webview itself —
  // it was the *native root view's* default (white) background showing
  // through the status-bar inset area above the webview. The clean fix
  // is simply painting that native layer the app's own dark color, and
  // keeping the normal 'automatic' inset layout (webview starts below
  // the status bar, exactly as it originally did — no edge-to-edge
  // extension, no safe-area layout complications). This replaces the
  // earlier contentInset:'never' + setOverlaysWebView approach, which
  // did remove the white strip but at the cost of shifting the whole
  // layout up under the notch.
  // The status bar sits directly above the mobile top bar, which uses
  // the app's --sidebar color (#080D0A) rather than the general page
  // --background (#0D1210) — matching the wrong one of these two very
  // close but distinct shades is exactly what left a visible seam here.
  backgroundColor: '#080D0A',
  ios: {
    contentInset: 'automatic',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      // The splash screen hands off directly into the general page
      // background (--background), not the top-bar-specific --sidebar
      // shade used just above — matches index.css exactly instead of
      // an earlier approximated value.
      backgroundColor: '#0D1210',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
