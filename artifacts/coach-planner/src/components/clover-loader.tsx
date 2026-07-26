// A 6-petal flower-of-hearts loading mark — inspired by a reference
// image the coach shared, redrawn as clean vector shapes (the source
// was a heavily textured photo/art piece, not a clean logo, so it
// couldn't be traced pixel-for-pixel into something crisp enough to
// read well at small sizes).
//
// The first version staggered each petal's pulse independently, which
// meant the full flower silhouette was never actually visible at any
// single moment (petals were always at different scales) — at a glance
// it just read as a shapeless blob rather than a recognizable clover.
// This version keeps the whole shape intact and just breathes/rotates
// together, so it's always legible as "the clover," not a random blob.
export function CloverLoader({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox="-100 -100 200 200" width={size} height={size} className="clover-loader">
      <defs>
        <path
          id="clover-petal"
          d="M 0,-10 C -14,-26 -38,-22 -38,-2 C -38,14 -20,28 0,44 C 20,28 38,14 38,-2 C 38,-22 14,-26 0,-10 Z"
        />
      </defs>
      <g fill="hsl(var(--primary))">
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <use key={deg} href="#clover-petal" transform={`rotate(${deg})`} />
        ))}
        <circle r="9" />
      </g>
    </svg>
  );
}
