import React from 'react';
import { Capacitor } from '@capacitor/core';
import { WifiOff } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

// Native apps get their connectivity status from Capacitor's Network
// plugin (more reliable than the browser's online/offline events on a
// WKWebView); a plain browser tab falls back to navigator.onLine + the
// window online/offline events. Either way this returns a single
// boolean the rest of the app can react to.
export function useIsOnline(): boolean {
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let remove: (() => void) | undefined;
      import('@capacitor/network').then(({ Network }) => {
        Network.getStatus().then((s) => setOnline(s.connected));
        Network.addListener('networkStatusChange', (s) => setOnline(s.connected)).then((handle) => {
          remove = () => handle.remove();
        });
      });
      return () => remove?.();
    }
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

// A pitch with weak signal is exactly where a coach is using this app —
// silently failing to save an attendance record or a match result looks
// identical to the app being frozen. This banner makes the actual cause
// obvious instead of leaving the coach guessing.
export function OfflineBanner() {
  const online = useIsOnline();
  const { t } = useLanguage();
  if (online) return null;
  return (
    <div className="fixed top-[calc(3.5rem+env(safe-area-inset-top))] md:top-0 inset-x-0 md:start-64 z-50 bg-destructive text-destructive-foreground text-xs font-medium py-1.5 px-3 flex items-center justify-center gap-1.5 print:hidden">
      <WifiOff className="w-3.5 h-3.5" />
      {t('offline.banner')}
    </div>
  );
}
