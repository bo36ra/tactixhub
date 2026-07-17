import React from 'react';
import { RefreshCw } from 'lucide-react';

const TRIGGER_DISTANCE = 64;
const MAX_PULL = 100;

// Wraps a page's content so dragging down from the very top of the
// scroll position (touch only — this is a phone gesture, not a mouse
// one) reveals a spinner and calls onRefresh once pulled far enough.
// Hand-rolled rather than a library since the gesture itself is simple:
// track touch Y from touchstart, only engage while window.scrollY is 0
// (otherwise it would fight with normal scrolling), and animate the
// indicator's height back to 0 on release.
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown> | void; children: React.ReactNode }) {
  const [pullDistance, setPullDistance] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const startY = React.useRef<number | null>(null);
  const engaged = React.useRef(false);
  const pullRef = React.useRef(0);
  const refreshingRef = React.useRef(false);

  React.useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 0) {
        startY.current = e.touches[0].clientY;
        engaged.current = true;
      } else {
        engaged.current = false;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!engaged.current || startY.current === null || refreshingRef.current) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && window.scrollY <= 0) {
        const next = Math.min(delta * 0.5, MAX_PULL);
        pullRef.current = next;
        setPullDistance(next);
      } else {
        engaged.current = false;
      }
    };
    const onTouchEnd = async () => {
      if (!engaged.current) return;
      engaged.current = false;
      startY.current = null;
      if (pullRef.current >= TRIGGER_DISTANCE) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullDistance(TRIGGER_DISTANCE);
        try {
          await onRefresh();
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
          pullRef.current = 0;
          setPullDistance(0);
        }
      } else {
        pullRef.current = 0;
        setPullDistance(0);
      }
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh]);

  const progress = Math.min(pullDistance / TRIGGER_DISTANCE, 1);

  return (
    <div className="relative">
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
        style={{ height: pullDistance }}
      >
        <RefreshCw
          className="w-5 h-5 text-primary"
          style={{
            transform: `rotate(${progress * 360}deg)`,
            opacity: progress,
            animation: refreshing ? 'spin 0.7s linear infinite' : undefined,
          }}
        />
      </div>
      {children}
    </div>
  );
}
