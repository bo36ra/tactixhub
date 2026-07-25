// A 6-petal flower-of-hearts loading mark — inspired by a reference
// image the coach shared, redrawn as clean vector shapes (the source
// was a heavily textured photo/art piece, not a clean logo, so it
// couldn't be traced pixel-for-pixel into something crisp enough to
// read well at small sizes). Petals pulse in sequence around the
// center rather than a plain spinning ring.
export function CloverLoader({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox="-100 -100 200 200" width={size} height={size}>
      <defs>
        <path
          id="clover-petal"
          d="M 0,-10 C -14,-26 -38,-22 -38,-2 C -38,14 -20,28 0,44 C 20,28 38,14 38,-2 C 38,-22 14,-26 0,-10 Z"
        />
      </defs>
      <g fill="hsl(var(--primary))">
        {[0, 60, 120, 180, 240, 300].map((deg, i) => (
          <g key={deg} transform={`rotate(${deg})`}>
            <use
              href="#clover-petal"
              className="clover-petal"
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          </g>
        ))}
        <circle r="9" />
      </g>
    </svg>
  );
}
