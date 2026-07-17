import React from 'react';
import { Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { hapticImpact } from '@/lib/native';

const REVEAL = 76;

// Swipe a row to reveal a delete action behind it — the same gesture as
// Mail/Messages. RTL-aware: LTR reveals by swiping left (action sits on
// the right), Arabic reveals by swiping right (action sits on the left),
// matching which direction actually feels like "swiping the row away"
// in each reading direction. Vertical scrolling is left alone — the
// gesture only engages once a touch is clearly more horizontal than
// vertical, so it doesn't fight with scrolling the list.
export function SwipeToDelete({ onDelete, children }: { onDelete: () => void; children: React.ReactNode }) {
  const { isRtl } = useLanguage();
  const [offset, setOffset] = React.useState(0);
  const startX = React.useRef<number | null>(null);
  const startY = React.useRef<number | null>(null);
  const axis = React.useRef<'x' | 'y' | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    axis.current = null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null || startY.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (axis.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (axis.current !== 'x') return;
    const revealing = isRtl ? dx : -dx;
    setOffset(Math.max(0, Math.min(revealing, REVEAL)));
  };
  const onTouchEnd = () => {
    setOffset((o) => (o > REVEAL / 2 ? REVEAL : 0));
    startX.current = null;
    startY.current = null;
    axis.current = null;
  };

  const revealed = offset > REVEAL / 2;
  const translate = isRtl ? offset : -offset;

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div
        className="absolute inset-y-0 flex items-center justify-center bg-destructive text-destructive-foreground"
        style={{ [isRtl ? 'left' : 'right']: 0, width: REVEAL } as React.CSSProperties}
      >
        <button
          type="button"
          className="flex flex-col items-center gap-0.5 w-full h-full justify-center"
          onClick={() => {
            hapticImpact('medium');
            setOffset(0);
            onDelete();
          }}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${translate}px)`,
          transition: revealed || offset === 0 ? 'transform 0.2s ease-out' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
