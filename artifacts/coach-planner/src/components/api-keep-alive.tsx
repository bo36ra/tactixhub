import { useEffect } from 'react';
import { healthCheck } from '@workspace/api-client-react';

// The API runs on Render's free tier, which spins the service down after
// ~15 minutes of no traffic. A coach with the tab open reading a page
// generates zero requests — so the server goes to sleep underneath them,
// and their next click hangs for 30–60s while it cold-starts ("the app
// froze / white page"). While a tab is open and visible, ping /healthz
// every 10 minutes so the server never sleeps mid-session.
const PING_INTERVAL_MS = 10 * 60 * 1000;

export function ApiKeepAlive() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const ping = () => {
      // Fire-and-forget: a failed ping (server mid-restart, offline) must
      // never surface to the user.
      healthCheck().catch(() => {});
    };

    const start = () => {
      if (timer) return;
      ping();
      timer = setInterval(ping, PING_INTERVAL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    // Only ping while the tab is actually visible — a backgrounded tab
    // shouldn't keep a free-tier server awake all night.
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, []);

  return null;
}
