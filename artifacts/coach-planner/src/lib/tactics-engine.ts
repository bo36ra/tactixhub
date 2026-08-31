import type { BoardData, BoardMarker, BoardArrow, BoardLine, BoardZone } from './tactics-api';

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------
// The board's world coordinate system is a 0-100 x 0-100 percentage grid
// (not pixels), independent of screen size, zoom, or which platform is
// rendering it — the same convention the existing BoardData shapes already
// use. A renderer's only job is converting its own input coordinates
// (pointer, touch, whatever) into this space before calling into the engine.

export interface WorldPoint { x: number; y: number }

/** A renderer-supplied client point + the on-screen rect of the board,
 * converted into the 0-100 world coordinate space. This is the one place
 * screen pixels ever enter the engine — every function below this line
 * operates purely in world coordinates. */
export function screenToWorld(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): WorldPoint {
  return {
    x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
    y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)),
  };
}

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------

/** Shortest distance from a point to a line segment. */
export function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Radial distance from a point to a marker, y-scaled to match the pitch's
 * portrait aspect ratio (the board renders at a 100x140 viewBox even though
 * marker x/y are both stored 0-100) — matches how markers actually appear
 * on screen rather than treating the coordinate space as square. */
export function distToMarker(px: number, py: number, marker: { x: number; y: number }): number {
  return Math.hypot(marker.x - px, (marker.y - py) * 1.4);
}

export function pointInZone(px: number, py: number, zone: BoardZone): boolean {
  return px >= zone.x && px <= zone.x + zone.width && py >= zone.y && py <= zone.y + zone.height;
}

// ---------------------------------------------------------------------------
// Hit-testing
// ---------------------------------------------------------------------------
// Two distinct hit-test routines rather than one shared "closest thing"
// function — Erase and Move genuinely prioritize differently (Erase checks
// markers against a separately-tracked best distance so a marker sitting
// exactly on top of an arrow still wins if it's closer; Move tries markers
// first, unconditionally, before ever considering a shape underneath one).
// Unifying them risks silently changing which object wins a tie.

export type ErasableKind = 'marker' | 'arrow' | 'line' | 'zone' | 'drawing';
export interface ErasableHit { kind: ErasableKind; index: number; markerId?: string }

export function hitTestErasable(board: BoardData, p: WorldPoint): ErasableHit | null {
  let bestKind: Exclude<ErasableKind, 'marker'> | null = null;
  let bestIdx = -1;
  let bestDist = 5; // tap tolerance, world units

  board.arrows.forEach((a, i) => {
    const d = distToSegment(p.x, p.y, a.x1, a.y1, a.x2, a.y2);
    if (d < bestDist) { bestDist = d; bestKind = 'arrow'; bestIdx = i; }
  });
  (board.lines ?? []).forEach((l, i) => {
    const d = distToSegment(p.x, p.y, l.x1, l.y1, l.x2, l.y2);
    if (d < bestDist) { bestDist = d; bestKind = 'line'; bestIdx = i; }
  });
  (board.drawings ?? []).forEach((dr, i) => {
    for (let j = 0; j < dr.points.length - 1; j++) {
      const d = distToSegment(p.x, p.y, dr.points[j].x, dr.points[j].y, dr.points[j + 1].x, dr.points[j + 1].y);
      if (d < bestDist) { bestDist = d; bestKind = 'drawing'; bestIdx = i; }
    }
  });
  (board.zones ?? []).forEach((z, i) => {
    if (pointInZone(p.x, p.y, z)) { bestDist = 0; bestKind = 'zone'; bestIdx = i; }
  });

  let bestMarkerId: string | null = null;
  let bestMarkerDist = 6;
  for (const m of board.markers) {
    const d = distToMarker(p.x, p.y, m);
    if (d < bestMarkerDist) { bestMarkerDist = d; bestMarkerId = m.id; }
  }

  if (bestMarkerId && bestMarkerDist < bestDist) return { kind: 'marker', index: -1, markerId: bestMarkerId };
  if (bestKind) return { kind: bestKind, index: bestIdx };
  return null;
}

export type MovableGrab =
  | { kind: 'marker'; markerId: string }
  | { kind: 'arrow'; index: number; offset: { dx1: number; dy1: number; dx2: number; dy2: number } }
  | { kind: 'line'; index: number; offset: { dx1: number; dy1: number; dx2: number; dy2: number } }
  | { kind: 'zone'; index: number; offset: { dx: number; dy: number } };

/** What Move mode would grab at this point — a marker first if one is
 * within reach, otherwise the nearest arrow/line, otherwise a zone the
 * point falls inside. Returns the drag offset needed to translate the
 * whole shape (not just snap one point to the pointer). */
export function hitTestMovable(board: BoardData, p: WorldPoint): MovableGrab | null {
  let bestMarkerId: string | null = null;
  let bestMarkerDist = 8;
  for (const m of board.markers) {
    const d = distToMarker(p.x, p.y, m);
    if (d < bestMarkerDist) { bestMarkerDist = d; bestMarkerId = m.id; }
  }
  if (bestMarkerId) return { kind: 'marker', markerId: bestMarkerId };

  let bestShapeDist = 5;
  let grabbedArrow = -1;
  let grabbedLine = -1;
  board.arrows.forEach((a, i) => {
    const d = distToSegment(p.x, p.y, a.x1, a.y1, a.x2, a.y2);
    if (d < bestShapeDist) { bestShapeDist = d; grabbedArrow = i; grabbedLine = -1; }
  });
  (board.lines ?? []).forEach((l, i) => {
    const d = distToSegment(p.x, p.y, l.x1, l.y1, l.x2, l.y2);
    if (d < bestShapeDist) { bestShapeDist = d; grabbedLine = i; grabbedArrow = -1; }
  });
  if (grabbedArrow !== -1) {
    const a = board.arrows[grabbedArrow];
    return { kind: 'arrow', index: grabbedArrow, offset: { dx1: a.x1 - p.x, dy1: a.y1 - p.y, dx2: a.x2 - p.x, dy2: a.y2 - p.y } };
  }
  if (grabbedLine !== -1) {
    const l = (board.lines ?? [])[grabbedLine];
    return { kind: 'line', index: grabbedLine, offset: { dx1: l.x1 - p.x, dy1: l.y1 - p.y, dx2: l.x2 - p.x, dy2: l.y2 - p.y } };
  }
  const zoneIdx = (board.zones ?? []).findIndex((z) => pointInZone(p.x, p.y, z));
  if (zoneIdx !== -1) {
    const z = (board.zones ?? [])[zoneIdx];
    return { kind: 'zone', index: zoneIdx, offset: { dx: z.x - p.x, dy: z.y - p.y } };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mutations — every function here takes a BoardData and returns a new one.
// None of them mutate their input, and none know anything about React,
// pointer events, or how they got called — matching the Command-style
// "operate purely on the document" principle from the architecture
// discussion, just without the full execute()/undo() class ceremony that
// would be premature to add before this extraction has proven itself.
// ---------------------------------------------------------------------------

export function moveMarker(board: BoardData, markerId: string, x: number, y: number): BoardData {
  return { ...board, markers: board.markers.map((m) => (m.id === markerId ? { ...m, x, y } : m)) };
}

export function translateArrow(board: BoardData, index: number, p: WorldPoint, offset: { dx1: number; dy1: number; dx2: number; dy2: number }): BoardData {
  return {
    ...board,
    arrows: board.arrows.map((a, i) => (i === index ? { ...a, x1: p.x + offset.dx1, y1: p.y + offset.dy1, x2: p.x + offset.dx2, y2: p.y + offset.dy2 } : a)),
  };
}

export function translateLine(board: BoardData, index: number, p: WorldPoint, offset: { dx1: number; dy1: number; dx2: number; dy2: number }): BoardData {
  return {
    ...board,
    lines: (board.lines ?? []).map((l, i) => (i === index ? { ...l, x1: p.x + offset.dx1, y1: p.y + offset.dy1, x2: p.x + offset.dx2, y2: p.y + offset.dy2 } : l)),
  };
}

export function translateZone(board: BoardData, index: number, p: WorldPoint, offset: { dx: number; dy: number }): BoardData {
  return { ...board, zones: (board.zones ?? []).map((z, i) => (i === index ? { ...z, x: p.x + offset.dx, y: p.y + offset.dy } : z)) };
}

export function deleteErasable(board: BoardData, hit: ErasableHit): BoardData {
  switch (hit.kind) {
    case 'marker':
      return { ...board, markers: board.markers.filter((m) => m.id !== hit.markerId) };
    case 'arrow':
      return { ...board, arrows: board.arrows.filter((_, i) => i !== hit.index) };
    case 'line':
      return { ...board, lines: (board.lines ?? []).filter((_, i) => i !== hit.index) };
    case 'zone':
      return { ...board, zones: (board.zones ?? []).filter((_, i) => i !== hit.index) };
    case 'drawing':
      return { ...board, drawings: (board.drawings ?? []).filter((_, i) => i !== hit.index) };
  }
}

const MIN_SHAPE_LENGTH = 4; // world units — below this, a drag is treated as an accidental tap, not a real arrow/line/zone

export function addArrow(board: BoardData, start: WorldPoint, end: WorldPoint, style: 'solid' | 'dashed'): BoardData {
  if (Math.hypot(end.x - start.x, end.y - start.y) <= MIN_SHAPE_LENGTH) return board;
  const arrow: BoardArrow = { x1: start.x, y1: start.y, x2: end.x, y2: end.y, style };
  return { ...board, arrows: [...board.arrows, arrow] };
}

export function addLine(board: BoardData, start: WorldPoint, end: WorldPoint): BoardData {
  if (Math.hypot(end.x - start.x, end.y - start.y) <= MIN_SHAPE_LENGTH) return board;
  const line: BoardLine = { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  return { ...board, lines: [...(board.lines ?? []), line] };
}

export function addZone(board: BoardData, start: WorldPoint, end: WorldPoint): BoardData {
  if (Math.hypot(end.x - start.x, end.y - start.y) <= MIN_SHAPE_LENGTH) return board;
  const zone: BoardZone = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
  return { ...board, zones: [...(board.zones ?? []), zone] };
}

export function addPenStroke(board: BoardData, points: WorldPoint[]): BoardData {
  if (points.length <= 2) return board;
  return { ...board, drawings: [...(board.drawings ?? []), { points }] };
}

export function duplicateMarker(board: BoardData, markerId: string, newId: string): { board: BoardData; newMarker: BoardMarker } | null {
  const marker = board.markers.find((m) => m.id === markerId);
  if (!marker) return null;
  const copy: BoardMarker = { ...marker, id: newId, x: Math.min(96, marker.x + 6), y: Math.min(96, marker.y + 6) };
  return { board: { ...board, markers: [...board.markers, copy] }, newMarker: copy };
}

// Same nudge-and-copy idea as duplicateMarker, extended to shapes —
// mirrors an arrow/line by translating both endpoints together, a zone
// by translating its origin, so the copy keeps its exact size/angle
// rather than landing exactly on top of the original.
const SHAPE_DUP_OFFSET = 6;

export function duplicateArrow(board: BoardData, index: number): BoardData {
  const a = board.arrows[index];
  if (!a) return board;
  const copy: BoardArrow = { ...a, x1: a.x1 + SHAPE_DUP_OFFSET, y1: a.y1 + SHAPE_DUP_OFFSET, x2: a.x2 + SHAPE_DUP_OFFSET, y2: a.y2 + SHAPE_DUP_OFFSET };
  return { ...board, arrows: [...board.arrows, copy] };
}

export function duplicateLine(board: BoardData, index: number): BoardData {
  const l = (board.lines ?? [])[index];
  if (!l) return board;
  const copy: BoardLine = { ...l, x1: l.x1 + SHAPE_DUP_OFFSET, y1: l.y1 + SHAPE_DUP_OFFSET, x2: l.x2 + SHAPE_DUP_OFFSET, y2: l.y2 + SHAPE_DUP_OFFSET };
  return { ...board, lines: [...(board.lines ?? []), copy] };
}

export function duplicateZone(board: BoardData, index: number): BoardData {
  const z = (board.zones ?? [])[index];
  if (!z) return board;
  const copy: BoardZone = { ...z, x: z.x + SHAPE_DUP_OFFSET, y: z.y + SHAPE_DUP_OFFSET };
  return { ...board, zones: [...(board.zones ?? []), copy] };
}
