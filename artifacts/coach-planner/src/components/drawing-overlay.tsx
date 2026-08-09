import React from 'react';

export interface Arrow { x1: number; y1: number; x2: number; y2: number }

// A transparent SVG layer positioned exactly over the video area. In
// draw mode it captures drag gestures to add arrows; otherwise it just
// renders whatever arrows are passed in, read-only. Coordinates are
// percentages (0-100) of the overlay's own box, not pixels — so an
// arrow drawn on a small phone screen still lines up correctly if the
// same tag is viewed later on a bigger screen or in fullscreen.
export function DrawingOverlay({
  arrows, editable, onChange,
}: {
  arrows: Arrow[];
  editable: boolean;
  onChange?: (arrows: Arrow[]) => void;
}) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const draftStart = React.useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = React.useState<Arrow | null>(null);

  const toPercent = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    };
  };

  const handleStart = (clientX: number, clientY: number) => {
    if (!editable) return;
    draftStart.current = toPercent(clientX, clientY);
  };
  const handleMove = (clientX: number, clientY: number) => {
    if (!editable || !draftStart.current) return;
    const p = toPercent(clientX, clientY);
    setDraft({ x1: draftStart.current.x, y1: draftStart.current.y, x2: p.x, y2: p.y });
  };
  const handleEnd = () => {
    if (!editable || !draftStart.current || !draft) { draftStart.current = null; setDraft(null); return; }
    const dist = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1);
    if (dist > 2) onChange?.([...arrows, draft]);
    draftStart.current = null;
    setDraft(null);
  };

  const allArrows = draft ? [...arrows, draft] : arrows;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full"
      style={{ touchAction: editable ? 'none' : 'auto', pointerEvents: editable ? 'auto' : 'none' }}
      onPointerDown={(e) => handleStart(e.clientX, e.clientY)}
      onPointerMove={(e) => handleMove(e.clientX, e.clientY)}
      onPointerUp={handleEnd}
      onPointerLeave={handleEnd}
    >
      <defs>
        <marker id="video-arrowhead" markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#FFD84D" />
        </marker>
      </defs>
      {allArrows.map((a, i) => (
        <line
          key={i}
          x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
          stroke="#FFD84D" strokeWidth="1.1" strokeLinecap="round"
          markerEnd="url(#video-arrowhead)"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
