import React from 'react';

// Tracks whether the page has scrolled past a threshold — used to shrink
// a page's title and turn on the sticky header's background/border, the
// same way a native iOS large-title nav bar collapses as you scroll.
export function useScrollShrink(threshold = 32): boolean {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
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
// this only adds the sticky positioning shell around it.
export function StickyHeader({ children }: { children: React.ReactNode }) {
  const scrolled = useScrollShrink();
  return (
    <div
      className={`sticky top-14 md:top-0 z-30 -mx-4 md:-mx-8 px-4 md:px-8 transition-all duration-200 ${
        scrolled ? 'py-3 bg-background/90 backdrop-blur-md border-b border-white/[0.06]' : 'py-0 bg-transparent'
      }`}
    >
      {children}
    </div>
  );
}

// Title text that shrinks once the page scrolls, mirroring iOS's large
// title -> compact title transition. Drop-in replacement for
// <h2 className="text-2xl font-bold">{title}</h2>.
export function PageTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const scrolled = useScrollShrink();
  return (
    <h2 className={`font-bold transition-all duration-200 ${scrolled ? 'text-lg' : 'text-2xl'} ${className}`}>
      {children}
    </h2>
  );
}
