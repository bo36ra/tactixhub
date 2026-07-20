// Was "#7" (symbol + digit) — mixing that with adjacent Arabic text kept
// causing bidi (bidirectional text) rendering issues across several
// pages even after isolating it with dir="ltr". Simpler and more
// reliable to just not use the "#" at all: a bare number next to a
// player's name reads fine on its own in a sports-roster context.
export function JerseyNumber({ n, className = 'text-muted-foreground font-mono text-xs' }: { n: number; className?: string }) {
  return (
    <span className={className} dir="ltr">{n}</span>
  );
}
