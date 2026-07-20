// A jersey number like "#7" mixes a symbol + Latin digit — placing it
// directly next to Arabic text (even in its own sibling element)
// confuses the browser's bidi algorithm without an explicit direction
// on the number itself, which is what was throwing off whole rows on
// several pages. dir="ltr" here properly isolates it as an LTR
// "island" within RTL flow, the standard fix for this exact class of
// bug (embedding a number/code reference inside RTL text).
export function JerseyNumber({ n, className = 'text-muted-foreground font-mono text-xs' }: { n: number; className?: string }) {
  return (
    <span className={className} dir="ltr">#{n}</span>
  );
}
