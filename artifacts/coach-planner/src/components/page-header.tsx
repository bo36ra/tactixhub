import React from 'react';
import { Capacitor } from '@capacitor/core';

// Tracks whether the page has scrolled past a threshold — used to shrink
// a page's title and turn on the sticky header's background/border, the
// same way a native iOS large-title nav bar collapses as you scroll.
// Only meaningful inside the actual installed app: a collapsing-title
// nav bar is a strong "this is an app" signal, so the website (any
// device, including a phone's browser) keeps a plain static title
// instead of picking up an app-like animation it was never meant to have.
export function useScrollShrink(threshold = 32): boolean {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}

// Wraps a page's title row (title + any action buttons alongside it) so
// it pins to the top and gains a blurred background once the page
// scrolls — the row's own layout (flex, buttons, etc.) is untouched,
// this only adds the sticky positioning shell around it. On the website
// this is just a plain, non-sticky wrapper.
export function StickyHeader({ children }: { children: React.ReactNode }) {
  const scrolled = useScrollShrink();
  const isNative = Capacitor.isNativePlatform();
  if (!isNative) return <div>{children}</div>;
  return (
    <div
      className={`sticky top-[calc(3.5rem+env(safe-area-inset-top))] md:top-0 z-30 -mx-4 md:-mx-8 px-4 md:px-8 transition-all duration-200 ${
        scrolled ? 'py-3 bg-background/90 backdrop-blur-md border-b border-white/[0.06]' : 'py-0 bg-transparent'
      }`}
    >
      {children}
    </div>
  );
}

// Title text that shrinks once the page scrolls, mirroring iOS's large
// title -> compact title transition. Drop-in replacement for
// <h2 className="text-2xl font-bold">{title}</h2>. On the website this
// renders as a plain, fixed-size title — same markup, no animation.
export function PageTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const scrolled = useScrollShrink();
  const isNative = Capacitor.isNativePlatform();
  return (
    <h2 className={`font-bold transition-all duration-200 ${isNative && scrolled ? 'text-lg' : 'text-2xl'} ${className}`}>
      {children}
    </h2>
  );
}
