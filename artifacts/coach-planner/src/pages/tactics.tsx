import React, { useRef, useState, useEffect } from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { useTeam } from '@/lib/team-context';
import { useListMatches, getListMatchesQueryKey } from '@workspace/api-client-react';
import {
  useTactics, useSaveTactic, useDeleteTactic,
  useOpponentNotes, useSaveOpponentNote, useDeleteOpponentNote,
  parseBoard, type BoardData, type BoardMarker, type Tactic, type TacticKind,
  type BoardFrame, type EquipmentType,
} from '@/lib/tactics-api';
import {
  screenToWorld, hitTestErasable, hitTestMovable, deleteErasable,
  moveMarker, translateArrow, translateLine, translateZone,
  addArrow, addLine, addZone, addPenStroke, duplicateMarker,
  duplicateArrow, duplicateLine, duplicateZone,
} from '@/lib/tactics-engine';
import { useBoardHistory } from '@/lib/use-board-history';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PITCH_GRADIENT } from '@/lib/chart-theme';
import { Trash2, Undo2, Redo2, Eraser, Save, Plus, ClipboardList, Play, Camera, Pencil, Minus, Maximize, Minimize, Move as MoveIcon, ArrowUpRight, Footprints, BoxSelect, MoreHorizontal, Copy } from 'lucide-react';
import { AnalysisBoard } from '@/components/analysis-board';

// ---------------------------------------------------------------- board

const DEFAULT_MARKERS: BoardMarker[] = [
  // Our XI in a 4-3-3 (percent coordinates, attacking upward)
  { id: 'gk', x: 50, y: 92, label: '1', side: 'us' },
  { id: 'd1', x: 18, y: 76, label: '2', side: 'us' },
  { id: 'd2', x: 38, y: 80, label: '4', side: 'us' },
  { id: 'd3', x: 62, y: 80, label: '5', side: 'us' },
  { id: 'd4', x: 82, y: 76, label: '3', side: 'us' },
  { id: 'm1', x: 30, y: 58, label: '8', side: 'us' },
  { id: 'm2', x: 50, y: 64, label: '6', side: 'us' },
  { id: 'm3', x: 70, y: 58, label: '10', side: 'us' },
  { id: 'f1', x: 22, y: 36, label: '7', side: 'us' },
  { id: 'f2', x: 50, y: 30, label: '9', side: 'us' },
  { id: 'f3', x: 78, y: 36, label: '11', side: 'us' },
  { id: 'ball', x: 50, y: 48, label: '', side: 'ball' },
];

// Each preset is 11 positions ordered from deepest (GK) to most
// advanced — applying one takes whichever markers are currently on
// the "us" side, sorted by their current depth (y, descending, i.e.
// closest to the own goal first), and reassigns them onto this list in
// the same order. That preserves each marker's id/label/color (and
// therefore who's who) while only changing the shape, and doesn't
// require the squad to already be in the default 11 marker ids —
// works the same after markers have been dragged around or recolored.
const FORMATIONS: Record<string, { x: number; y: number }[]> = {
  '4-3-3': [
    { x: 50, y: 92 },
    { x: 18, y: 76 }, { x: 38, y: 80 }, { x: 62, y: 80 }, { x: 82, y: 76 },
    { x: 30, y: 58 }, { x: 50, y: 64 }, { x: 70, y: 58 },
    { x: 22, y: 36 }, { x: 50, y: 30 }, { x: 78, y: 36 },
  ],
  '4-4-2': [
    { x: 50, y: 92 },
    { x: 18, y: 76 }, { x: 38, y: 80 }, { x: 62, y: 80 }, { x: 82, y: 76 },
    { x: 15, y: 55 }, { x: 38, y: 58 }, { x: 62, y: 58 }, { x: 85, y: 55 },
    { x: 38, y: 32 }, { x: 62, y: 32 },
  ],
  '4-2-3-1': [
    { x: 50, y: 92 },
    { x: 18, y: 76 }, { x: 38, y: 80 }, { x: 62, y: 80 }, { x: 82, y: 76 },
    { x: 38, y: 64 }, { x: 62, y: 64 },
    { x: 20, y: 44 }, { x: 50, y: 46 }, { x: 80, y: 44 },
    { x: 50, y: 28 },
  ],
  '4-1-4-1': [
    { x: 50, y: 92 },
    { x: 18, y: 76 }, { x: 38, y: 80 }, { x: 62, y: 80 }, { x: 82, y: 76 },
    { x: 50, y: 66 },
    { x: 15, y: 50 }, { x: 38, y: 48 }, { x: 62, y: 48 }, { x: 85, y: 50 },
    { x: 50, y: 28 },
  ],
  '3-5-2': [
    { x: 50, y: 92 },
    { x: 30, y: 78 }, { x: 50, y: 82 }, { x: 70, y: 78 },
    { x: 10, y: 56 }, { x: 30, y: 60 }, { x: 50, y: 64 }, { x: 70, y: 60 }, { x: 90, y: 56 },
    { x: 38, y: 32 }, { x: 62, y: 32 },
  ],
  '3-4-3': [
    { x: 50, y: 92 },
    { x: 30, y: 78 }, { x: 50, y: 82 }, { x: 70, y: 78 },
    { x: 15, y: 56 }, { x: 38, y: 60 }, { x: 62, y: 60 }, { x: 85, y: 56 },
    { x: 22, y: 34 }, { x: 50, y: 30 }, { x: 78, y: 34 },
  ],
  '5-3-2': [
    { x: 50, y: 92 },
    { x: 10, y: 76 }, { x: 28, y: 80 }, { x: 50, y: 82 }, { x: 72, y: 80 }, { x: 90, y: 76 },
    { x: 30, y: 56 }, { x: 50, y: 60 }, { x: 70, y: 56 },
    { x: 38, y: 32 }, { x: 62, y: 32 },
  ],
};

const emptyBoard = (): BoardData => ({
  markers: DEFAULT_MARKERS.map((m) => ({ ...m })),
  arrows: [],
  lines: [],
  zones: [],
  drawings: [],
  frames: [],
  notes: '',
});

// Training equipment renders as a distinct shape rather than a labeled
// circle, so it reads at a glance as "not a player" — a cone, a low
// hurdle/barrier, a small goal, and a corner flag, the standard set
// for marking out a training-game grid or drill.
function EquipmentShape({ type, color }: { type: EquipmentType; color?: string }) {
  if (type === 'cone') {
    return <polygon points="0,-3.2 2.6,3 -2.6,3" fill={color ?? '#F2994A'} stroke="#7a3d0e" strokeWidth="0.4" />;
  }
  if (type === 'barrier') {
    return (
      <g>
        <rect x="-4" y="-1" width="8" height="2" rx="0.5" fill={color ?? '#E85D5D'} stroke="#7a2020" strokeWidth="0.3" />
        <rect x="-3.4" y="1" width="0.8" height="1.6" fill="#555" />
        <rect x="2.6" y="1" width="0.8" height="1.6" fill="#555" />
      </g>
    );
  }
  if (type === 'goal') {
    return (
      <g fill="none" stroke={color ?? '#F4F1EC'} strokeWidth="0.7">
        <line x1="-4" y1="2.5" x2="-4" y2="-2.5" />
        <line x1="4" y1="2.5" x2="4" y2="-2.5" />
        <line x1="-4" y1="-2.5" x2="4" y2="-2.5" />
      </g>
    );
  }
  // flag
  return (
    <g>
      <line x1="0" y1="3" x2="0" y2="-3.2" stroke="#555" strokeWidth="0.5" />
      <polygon points="0,-3.2 3.4,-2.2 0,-1.2" fill={color ?? '#5B9BD5'} />
    </g>
  );
}

function TacticBoard({
  board, commitBoard, setBoardLive, beginLiveChange, commitLiveChange, mode, selectedMarkerId, onSelectMarker, selectedShape, onSelectShape, isFullscreen,
}: {
  board: BoardData;
  commitBoard: (b: BoardData) => void;
  setBoardLive: (b: BoardData) => void;
  beginLiveChange: () => void;
  commitLiveChange: () => void;
  mode: 'move' | 'arrow' | 'dashed-arrow' | 'line' | 'zone' | 'pen' | 'erase';
  selectedMarkerId: string | null;
  onSelectMarker: (id: string | null) => void;
  selectedShape: { kind: 'arrow' | 'line' | 'zone'; index: number } | null;
  onSelectShape: (shape: { kind: 'arrow' | 'line' | 'zone'; index: number } | null) => void;
  isFullscreen?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragId = useRef<string | null>(null);
  // Move mode previously only ever grabbed markers — an arrow, line, or
  // zone once drawn could only be deleted and redrawn, never nudged
  // into place. These track dragging one of those instead, storing the
  // pointer-to-shape offset at grab time so the whole shape translates
  // together rather than snapping one point to the finger.
  const dragArrow = useRef<{ index: number; dx1: number; dy1: number; dx2: number; dy2: number } | null>(null);
  const dragLine = useRef<{ index: number; dx1: number; dy1: number; dx2: number; dy2: number } | null>(null);
  const dragZone = useRef<{ index: number; dx: number; dy: number } | null>(null);
  const arrowStart = useRef<{ x: number; y: number } | null>(null);
  const penPath = useRef<{ x: number; y: number }[] | null>(null);
  const [penPreview, setPenPreview] = useState<{ x: number; y: number }[]>([]);
  const [preview, setPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // Pinch-to-zoom + 2-finger pan — the board previously set
  // touch-action:none to stop single-finger drawing gestures from
  // triggering the browser's own page scroll/zoom, but that also
  // blocked pinch-zoom entirely without putting anything in its place,
  // leaving no way to zoom in for precision at all. Deliberately
  // two-finger-only: a single finger is already fully committed to
  // drawing/moving markers, so zoom/pan needs its own, non-conflicting
  // gesture rather than trying to share one.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pinchState = useRef<{ startDist: number; startZoom: number; startMid: { x: number; y: number }; startPan: { x: number; y: number } } | null>(null);

  const touchDist = (t1: React.Touch, t2: React.Touch) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  const touchMid = (t1: React.Touch, t2: React.Touch) => ({ x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 });

  const onTouchStartZoom = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    pinchState.current = {
      startDist: touchDist(e.touches[0], e.touches[1]),
      startZoom: zoom,
      startMid: touchMid(e.touches[0], e.touches[1]),
      startPan: pan,
    };
  };
  const onTouchMoveZoom = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchState.current) return;
    e.preventDefault();
    const dist = touchDist(e.touches[0], e.touches[1]);
    const mid = touchMid(e.touches[0], e.touches[1]);
    const nextZoom = Math.max(1, Math.min(3, pinchState.current.startZoom * (dist / pinchState.current.startDist)));
    setZoom(nextZoom);
    setPan({
      x: pinchState.current.startPan.x + (mid.x - pinchState.current.startMid.x) / nextZoom,
      y: pinchState.current.startPan.y + (mid.y - pinchState.current.startMid.y) / nextZoom,
    });
  };
  const onTouchEndZoom = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchState.current = null;
  };

  const toPct = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return screenToWorld(e.clientX, e.clientY, rect);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toPct(e);
    if (mode === 'erase') {
      const hit = hitTestErasable(board, p);
      if (hit) {
        commitBoard(deleteErasable(board, hit));
        if (hit.kind === 'marker' && hit.markerId && selectedMarkerId === hit.markerId) onSelectMarker(null);
      }
    } else if (mode === 'pen') {
      penPath.current = [p];
      setPenPreview([p]);
    } else if (mode === 'arrow' || mode === 'dashed-arrow' || mode === 'line' || mode === 'zone') {
      arrowStart.current = p;
      setPreview({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    } else {
      // Move mode: try a marker first (existing behavior, and markers
      // sit "on top" conceptually), then fall back to grabbing the
      // nearest arrow/line/zone so those can be repositioned too
      // instead of only ever being delete-and-redraw.
      dragArrow.current = null;
      dragLine.current = null;
      dragZone.current = null;
      const grab = hitTestMovable(board, p);
      if (grab) beginLiveChange();
      if (grab?.kind === 'marker') {
        dragId.current = grab.markerId;
        onSelectMarker(grab.markerId);
        onSelectShape(null);
      } else {
        dragId.current = null;
        onSelectMarker(null);
        if (grab?.kind === 'arrow') { dragArrow.current = { index: grab.index, ...grab.offset }; onSelectShape({ kind: 'arrow', index: grab.index }); }
        else if (grab?.kind === 'line') { dragLine.current = { index: grab.index, ...grab.offset }; onSelectShape({ kind: 'line', index: grab.index }); }
        else if (grab?.kind === 'zone') { dragZone.current = { index: grab.index, ...grab.offset }; onSelectShape({ kind: 'zone', index: grab.index }); }
        else onSelectShape(null);
      }
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (mode === 'pen' && penPath.current) {
      const p = toPct(e);
      const last = penPath.current[penPath.current.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 1) {
        penPath.current = [...penPath.current, p];
        setPenPreview(penPath.current);
      }
    } else if ((mode === 'arrow' || mode === 'dashed-arrow' || mode === 'line' || mode === 'zone') && arrowStart.current) {
      const p = toPct(e);
      setPreview({ x1: arrowStart.current.x, y1: arrowStart.current.y, x2: p.x, y2: p.y });
    } else if (dragId.current) {
      const p = toPct(e);
      setBoardLive(moveMarker(board, dragId.current, p.x, p.y));
    } else if (dragArrow.current) {
      const p = toPct(e);
      const { index, ...offset } = dragArrow.current;
      setBoardLive(translateArrow(board, index, p, offset));
    } else if (dragLine.current) {
      const p = toPct(e);
      const { index, ...offset } = dragLine.current;
      setBoardLive(translateLine(board, index, p, offset));
    } else if (dragZone.current) {
      const p = toPct(e);
      const { index, ...offset } = dragZone.current;
      setBoardLive(translateZone(board, index, p, offset));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (mode === 'pen' && penPath.current) {
      commitBoard(addPenStroke(board, penPath.current));
      penPath.current = null;
      setPenPreview([]);
    }
    if ((mode === 'arrow' || mode === 'dashed-arrow' || mode === 'line' || mode === 'zone') && arrowStart.current) {
      const p = toPct(e);
      const a = arrowStart.current;
      if (mode === 'arrow') commitBoard(addArrow(board, a, p, 'solid'));
      else if (mode === 'dashed-arrow') commitBoard(addArrow(board, a, p, 'dashed'));
      else if (mode === 'zone') commitBoard(addZone(board, a, p));
      else commitBoard(addLine(board, a, p));
      arrowStart.current = null;
      setPreview(null);
    }
    if (dragId.current || dragArrow.current || dragLine.current || dragZone.current) commitLiveChange();
    dragId.current = null;
    dragArrow.current = null;
    dragLine.current = null;
    dragZone.current = null;
  };

  return (
    <div
      className={`relative mx-auto overflow-hidden rounded-xl border border-border ${isFullscreen ? 'w-full h-[calc(100vh-9rem)]' : 'w-full max-w-md'}`}
      onTouchStart={onTouchStartZoom}
      onTouchMove={onTouchMoveZoom}
      onTouchEnd={onTouchEndZoom}
      style={{ touchAction: 'none' }}
    >
      {zoom > 1 && (
        <button
          type="button"
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="absolute top-2 end-2 z-10 bg-black/60 text-white text-[10px] font-semibold px-2 py-1 rounded-full"
        >
          {Math.round(zoom * 100)}% ↺
        </button>
      )}
      <div style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`, transformOrigin: 'center', width: '100%', height: '100%' }}>
        <svg
          ref={svgRef}
          viewBox="0 0 100 140"
          className={`mx-auto select-none ${isFullscreen ? 'w-full h-full' : 'w-full max-w-md'}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ touchAction: 'none', background: PITCH_GRADIENT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
      {/* pitch markings */}
      <g stroke="rgba(255,255,255,0.55)" strokeWidth="0.6" fill="none">
        <rect x="3" y="3" width="94" height="134" rx="1" />
        <line x1="3" y1="70" x2="97" y2="70" />
        <circle cx="50" cy="70" r="10" />
        <rect x="26" y="3" width="48" height="16" />
        <rect x="26" y="121" width="48" height="16" />
        <rect x="38" y="3" width="24" height="6" />
        <rect x="38" y="131" width="24" height="6" />
      </g>

      {/* freehand drawings (chalk) */}
      {(board.drawings ?? []).map((d, i) => (
        <polyline key={`d${i}`} fill="none" stroke="#FFFFFF" strokeWidth="0.9"
          strokeLinecap="round" strokeLinejoin="round" opacity="0.9"
          points={d.points.map((p) => `${p.x},${p.y * 1.4}`).join(' ')} />
      ))}
      {penPreview.length > 1 && (
        <polyline fill="none" stroke="#FFFFFF" strokeWidth="0.9" opacity="0.6"
          strokeLinecap="round" strokeLinejoin="round"
          points={penPreview.map((p) => `${p.x},${p.y * 1.4}`).join(' ')} />
      )}

      {/* zone-divider lines (thirds, channels, or freehand splits) */}
      {(board.lines ?? []).map((l, i) => (
        <line key={`ln${i}`} x1={l.x1} y1={l.y1 * 1.4} x2={l.x2} y2={l.y2 * 1.4}
          stroke="rgba(255,255,255,0.65)" strokeWidth="0.6" strokeDasharray="3 2" />
      ))}

      {/* tactical zones — filled area highlights (pressing trigger, defensive block, target area, ...) */}
      {(board.zones ?? []).map((z, i) => (
        <rect key={`z${i}`} x={z.x} y={z.y * 1.4} width={z.width} height={z.height * 1.4}
          fill={z.color ?? '#5B9BD5'} fillOpacity="0.22" stroke={z.color ?? '#5B9BD5'} strokeWidth="0.5" strokeOpacity="0.6" />
      ))}

      {/* arrows — solid = pass/ball movement, dashed = run without the ball */}
      <defs>
        <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#FFD84D" />
        </marker>
      </defs>
      {board.arrows.map((a, i) => (
        <line key={i} x1={a.x1} y1={a.y1 * 1.4} x2={a.x2} y2={a.y2 * 1.4}
          stroke="#FFD84D" strokeWidth="1.1" strokeDasharray={a.style === 'dashed' ? '3 2.5' : undefined} markerEnd="url(#arrowhead)" />
      ))}
      {preview && mode === 'line' && (
        <line x1={preview.x1} y1={preview.y1 * 1.4} x2={preview.x2} y2={preview.y2 * 1.4}
          stroke="rgba(255,255,255,0.65)" strokeWidth="0.6" strokeDasharray="3 2" opacity="0.8" />
      )}
      {preview && (mode === 'arrow' || mode === 'dashed-arrow') && (
        <line x1={preview.x1} y1={preview.y1 * 1.4} x2={preview.x2} y2={preview.y2 * 1.4}
          stroke="#FFD84D" strokeWidth="1.1" strokeDasharray={mode === 'dashed-arrow' ? '3 2.5' : undefined} opacity="0.6" markerEnd="url(#arrowhead)" />
      )}
      {preview && mode === 'zone' && (
        <rect
          x={Math.min(preview.x1, preview.x2)} y={Math.min(preview.y1, preview.y2) * 1.4}
          width={Math.abs(preview.x2 - preview.x1)} height={Math.abs(preview.y2 - preview.y1) * 1.4}
          fill="#5B9BD5" fillOpacity="0.2" stroke="#5B9BD5" strokeWidth="0.5" strokeOpacity="0.7"
        />
      )}

      {/* markers */}
      {board.markers.map((m) => {
        const fill = m.color ?? (m.side === 'us' ? '#FFD84D' : '#F4F1EC');
        const stroke = m.color ? '#1a1a1a' : (m.side === 'us' ? '#7a6410' : '#333');
        return (
        <g key={m.id} transform={`translate(${m.x}, ${m.y * 1.4})`} style={{ cursor: 'grab' }}>
          {m.id === selectedMarkerId && m.side !== 'ball' && (
            <circle r="5.6" fill="none" stroke="#4FC3F7" strokeWidth="0.6" strokeDasharray="1.4 1" />
          )}
          {m.side === 'ball' ? (
            <circle r="2.2" fill={m.color ?? '#FFFFFF'} stroke="#111" strokeWidth="0.4" />
          ) : m.side === 'equipment' ? (
            <EquipmentShape type={m.equipment ?? 'cone'} color={m.color} />
          ) : (
            <>
              <circle r="4.2" fill={fill} stroke={stroke} strokeWidth="0.5" />
              <text textAnchor="middle" dy="1.6" fontSize="4"
                fontWeight="700" fill="#1a1a1a">{m.label}</text>
            </>
          )}
        </g>
        );
      })}
        </svg>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- boards tab

function BoardsTab({
  teamId, kind, openId, onOpened,
}: {
  teamId: number; kind: TacticKind; openId?: number | null; onOpened?: () => void;
}) {
  const { t } = useLanguage();
  const { data: tactics, isLoading } = useTactics(teamId);
  const { data: matches } = useListMatches(teamId, { query: { enabled: kind === 'match_plan', queryKey: getListMatchesQueryKey(teamId) } });
  const save = useSaveTactic(teamId);
  const del = useDeleteTactic(teamId);

  const [editing, setEditing] = useState<{ id?: number; name: string; matchId: number | null } | null>(null);
  const { board, commitBoard, setBoardLive, beginLiveChange, commitLiveChange, undo, redo, canUndo, canRedo, resetBoard } = useBoardHistory(emptyBoard());
  // (setBoard supports functional updates natively; playback relies on it)
  const [mode, setMode] = useState<'move' | 'arrow' | 'dashed-arrow' | 'line' | 'zone' | 'pen' | 'erase'>('move');
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedShape, setSelectedShape] = useState<{ kind: 'arrow' | 'line' | 'zone'; index: number } | null>(null);
  // Keyboard shortcuts — Delete removes the selected marker or shape,
  // Ctrl/Cmd+D duplicates it, Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or
  // Ctrl/Cmd+Y redoes. Skips entirely while a text field has focus (the
  // label input, notes textarea, tactic-name field, ...) so it never
  // fights the browser's own native undo/typing behavior there — this
  // is specifically for shortcuts aimed at the board itself.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTextInput) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (ctrl && e.key.toLowerCase() === 'd' && selectedMarkerId) {
        e.preventDefault();
        const id = `dup-${Date.now()}`;
        const result = duplicateMarker(board, selectedMarkerId, id);
        if (result) { commitBoard(result.board); setSelectedMarkerId(id); }
      } else if (ctrl && e.key.toLowerCase() === 'd' && selectedShape) {
        e.preventDefault();
        const next =
          selectedShape.kind === 'arrow' ? duplicateArrow(board, selectedShape.index)
          : selectedShape.kind === 'line' ? duplicateLine(board, selectedShape.index)
          : duplicateZone(board, selectedShape.index);
        commitBoard(next);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMarkerId) {
        e.preventDefault();
        commitBoard({ ...board, markers: board.markers.filter((m) => m.id !== selectedMarkerId) });
        setSelectedMarkerId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShape) {
        e.preventDefault();
        commitBoard(deleteErasable(board, { kind: selectedShape.kind, index: selectedShape.index }));
        setSelectedShape(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, selectedMarkerId, selectedShape, board, commitBoard]);

  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // Presenting the board to the squad on a tablet/TV works much better
  // full-bleed, without the rest of the app's chrome around it — the
  // standard Fullscreen API expands just this container rather than
  // the whole page, so the toolbar (formation picker, add player, etc.)
  // stays usable while presenting. Listens for fullscreenchange too,
  // since the person can also exit via Esc or the browser's own UI,
  // not just this toggle button.
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      boardContainerRef.current?.requestFullscreen?.().catch(() => {
        // Some browser/WebView contexts reject this (e.g. no user
        // gesture, or unsupported) — the button just stays a no-op
        // rather than throwing an unhandled rejection.
      });
    }
  };
  const [playing, setPlaying] = useState(false);
  const animRef = useRef<number | null>(null);

  // Capture the current player positions as an animation frame
  // Reassigns the current "us" markers onto a formation preset's shape,
  // ordered by current depth (own-goal-ward first) so each marker keeps
  // its id/label/color — only the layout changes. Markers beyond the
  // preset's 11 slots (extras added via "Add player") are left as-is.
  // Reassigns markers of the given side onto a formation preset's shape,
  // ordered by current depth so each marker keeps its id/label/color —
  // only the layout changes (see FORMATIONS' comment for why). For
  // "them" the preset is mirrored top-to-bottom (y -> 140 - y) so the
  // opponent faces our team from the opposite end, the standard way a
  // two-team tactical diagram is read. If there are fewer than 11
  // markers of that side yet (e.g. no opponents added), creates the
  // rest — makes "apply formation" work as a complete starting point
  // for the opponent, not just something that only helps once 11
  // opponent markers already exist one at a time.
  const applyFormation = (key: string, side: 'us' | 'them' = 'us') => {
    const preset = FORMATIONS[key];
    if (!preset) return;
    // Marker y is stored on a 0..100 scale (the SVG render multiplies
    // by 1.4 to reach the 140-tall viewBox) — mirroring must flip
    // against that same 100, not the rendered 140, or the opponent's
    // positions land in roughly the same region as ours instead of the
    // opposite end of the pitch.
    const positions = side === 'them' ? preset.map((p) => ({ x: p.x, y: 100 - p.y })) : preset;
    const existing = board.markers.filter((m) => m.side === side).sort((a, b) => b.y - a.y);
    const toKeep = existing.slice(0, positions.length);
    const missingCount = positions.length - toKeep.length;
    const newMarkers: BoardMarker[] = Array.from({ length: missingCount }, (_, i) => ({
      id: `extra-${Date.now()}-${i}`,
      x: 50, y: 50, label: '', side,
    }));
    const allForSide = [...toKeep, ...newMarkers];
    const positioned = new Map(allForSide.map((m, i) => [m.id, positions[i]]));
    const placedNewMarkers = newMarkers.map((m) => ({ ...m, ...positioned.get(m.id)! }));
    commitBoard({
      ...board,
      markers: [
        ...board.markers.map((m) => {
          const pos = positioned.get(m.id);
          return pos ? { ...m, x: pos.x, y: pos.y } : m;
        }),
        ...placedNewMarkers,
      ],
    });
  };

  const addFrame = () => {
    const frame: BoardFrame = { markers: board.markers.map((m) => ({ ...m })) };
    commitBoard({ ...board, frames: [...(board.frames ?? []), frame] });
  };

  const loadFrame = (i: number) => {
    const f = (board.frames ?? [])[i];
    if (f) commitBoard({ ...board, markers: f.markers.map((m) => ({ ...m })) });
  };

  const removeFrame = (i: number) => {
    commitBoard({ ...board, frames: (board.frames ?? []).filter((_, idx) => idx !== i) });
  };

  // Play: interpolate marker positions between consecutive frames (like
  // TacticalPad sequences). ~0.9s per transition, ease-in-out.
  const play = () => {
    const frames = board.frames ?? [];
    if (frames.length < 2 || playing) return;
    setPlaying(true);
    const DURATION = 900;
    let seg = 0;
    let start = performance.now();
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const a = frames[seg].markers;
      const b = frames[seg + 1].markers;
      const k = ease(t);
      setBoardLive((prev) => ({
        ...prev,
        markers: prev.markers.map((m) => {
          const from = a.find((x) => x.id === m.id);
          const to = b.find((x) => x.id === m.id);
          if (!from || !to) return m;
          return { ...m, x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
        }),
      }));
      if (t >= 1) {
        seg += 1;
        if (seg >= frames.length - 1) { setPlaying(false); return; }
        start = now;
      }
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
  };

  const list = (tactics ?? []).filter((x) => x.kind === kind);

  React.useEffect(() => {
    if (openId == null) return;
    const tc = list.find((x) => x.id === openId);
    if (tc) {
      open(tc);
      onOpened?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, list.length]);

  const open = (tc?: Tactic) => {
    if (tc) {
      setEditing({ id: tc.id, name: tc.name, matchId: tc.matchId });
      resetBoard(parseBoard(tc.data));
    } else {
      setEditing({ name: '', matchId: null });
      resetBoard(emptyBoard());
    }
    setMode('move');
  };

  const doSave = () => {
    if (!editing?.name.trim()) {
      toast({ variant: 'destructive', title: t('tactics.nameRequired') });
      return;
    }
    save.mutate(
      { id: editing.id, name: editing.name.trim(), kind, matchId: editing.matchId, data: board },
      {
        onSuccess: () => { toast({ title: t('tactics.saved') }); setEditing(null); },
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }),
      },
    );
  };

  if (editing) {
    return (
      <div ref={boardContainerRef} className={isFullscreen ? 'space-y-3 bg-background p-4 overflow-y-auto h-full' : 'space-y-3'}>
        <div className="flex flex-wrap gap-2 items-center">
          <Input value={editing.name} placeholder={t('tactics.namePlaceholder')}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="max-w-56" />
          {kind === 'match_plan' && (
            <Select value={editing.matchId ? String(editing.matchId) : 'none'}
              onValueChange={(v) => setEditing({ ...editing, matchId: v === 'none' ? null : parseInt(v) })}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('tactics.noMatch')}</SelectItem>
                {(matches ?? []).map((m: any) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.opponent} — {m.date}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Drawing tools — a single scrollable row instead of the three
            stacked groups this used to be. Bigger, consistent icon
            buttons meant for a thumb on a phone rather than a mouse
            pointer; scrolls sideways if it doesn't fit rather than
            wrapping to more rows, so the board itself stays the focus
            instead of tool clutter pushing it down the page. */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <Button size="icon" className="h-11 w-11 shrink-0" variant={mode === 'move' ? 'default' : 'secondary'} onClick={() => setMode('move')} title={t('tactics.modeMove')}>
            <MoveIcon className="w-5 h-5" />
          </Button>
          <Button size="icon" className="h-11 w-11 shrink-0" variant={mode === 'arrow' ? 'default' : 'secondary'} onClick={() => setMode('arrow')} title={t('tactics.modeArrow')}>
            <ArrowUpRight className="w-5 h-5" />
          </Button>
          <Button size="icon" className="h-11 w-11 shrink-0" variant={mode === 'dashed-arrow' ? 'default' : 'secondary'} onClick={() => setMode('dashed-arrow')} title={t('tactics.modeDashedArrow')}>
            <Footprints className="w-5 h-5" />
          </Button>
          <Button size="icon" className="h-11 w-11 shrink-0" variant={mode === 'line' ? 'default' : 'secondary'} onClick={() => setMode('line')} title={t('tactics.modeLine')}>
            <Minus className="w-5 h-5" />
          </Button>
          <Button size="icon" className="h-11 w-11 shrink-0" variant={mode === 'zone' ? 'default' : 'secondary'} onClick={() => setMode('zone')} title={t('tactics.modeZone')}>
            <BoxSelect className="w-5 h-5" />
          </Button>
          <Button size="icon" className="h-11 w-11 shrink-0" variant={mode === 'pen' ? 'default' : 'secondary'} onClick={() => setMode('pen')} title={t('tactics.modePen')}>
            <Pencil className="w-5 h-5" />
          </Button>
          <Button size="icon" className="h-11 w-11 shrink-0" variant={mode === 'erase' ? 'default' : 'secondary'} onClick={() => setMode('erase')} title={t('tactics.modeErase')}>
            <Eraser className="w-5 h-5" />
          </Button>
          <Button size="icon" className="h-11 w-11 shrink-0" variant="secondary" title={t('tactics.undo')} disabled={!canUndo} onClick={undo}>
            <Undo2 className="w-5 h-5" />
          </Button>
          <Button size="icon" className="h-11 w-11 shrink-0" variant="secondary" title={t('tactics.redo')} disabled={!canRedo} onClick={redo}>
            <Redo2 className="w-5 h-5" />
          </Button>
          <div className="w-px h-8 bg-border shrink-0 mx-0.5" />
          <Button size="icon" className="h-11 w-11 shrink-0" variant="outline" onClick={() => setAddMenuOpen(true)} title={t('tactics.addMenu')}>
            <Plus className="w-5 h-5" />
          </Button>
          <Button size="icon" className="h-11 w-11 shrink-0" variant="outline" onClick={() => setMoreMenuOpen(true)} title={t('tactics.moreMenu')}>
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </div>

        {/* + menu — every "add something to the board" action grouped
            behind one button instead of five separate controls always
            sitting in the toolbar. */}
        <Sheet open={addMenuOpen} onOpenChange={setAddMenuOpen}>
          <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
            <SheetHeader><SheetTitle>{t('tactics.addMenu')}</SheetTitle></SheetHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="secondary" className="h-12 text-xs px-1"
                  onClick={() => {
                    const id = `extra-${Date.now()}`;
                    commitBoard({ ...board, markers: [...board.markers, { id, x: 50, y: 50, label: '', side: 'us' }] });
                    setMode('move');
                    setSelectedMarkerId(id);
                    setAddMenuOpen(false);
                  }}
                >
                  <Plus className="w-4 h-4 me-1" />{t('tactics.addPlayer')}
                </Button>
                <Button
                  variant="secondary" className="h-12 text-xs px-1"
                  onClick={() => {
                    const id = `extra-${Date.now()}`;
                    commitBoard({ ...board, markers: [...board.markers, { id, x: 50, y: 50, label: '', side: 'them' }] });
                    setMode('move');
                    setSelectedMarkerId(id);
                    setAddMenuOpen(false);
                  }}
                >
                  <Plus className="w-4 h-4 me-1" />{t('tactics.addOpponent')}
                </Button>
                <Button
                  variant="secondary" className="h-12 text-xs px-1"
                  onClick={() => {
                    // The board starts with one ball by default — this is
                    // purely a recovery path for when it's been erased
                    // (deliberately or by accident) and there was
                    // previously no way to bring it back short of
                    // clearing the whole board.
                    const id = `ball-${Date.now()}`;
                    commitBoard({ ...board, markers: [...board.markers, { id, x: 50, y: 50, label: '', side: 'ball' }] });
                    setMode('move');
                    setSelectedMarkerId(id);
                    setAddMenuOpen(false);
                  }}
                >
                  <Plus className="w-4 h-4 me-1" />{t('tactics.addBall')}
                </Button>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t('tactics.addEquipment')}</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['cone', 'barrier', 'goal', 'flag'] as EquipmentType[]).map((eq) => (
                    <Button
                      key={eq} variant="outline" className="h-12 text-xs"
                      onClick={() => {
                        const id = `equip-${Date.now()}`;
                        commitBoard({ ...board, markers: [...board.markers, { id, x: 50, y: 50, label: '', side: 'equipment', equipment: eq }] });
                        setMode('move');
                        setSelectedMarkerId(id);
                        setAddMenuOpen(false);
                      }}
                    >
                      {t(`tactics.equip${eq.charAt(0).toUpperCase()}${eq.slice(1)}`)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t('tactics.formationUs')}</p>
                <Select onValueChange={(v) => { applyFormation(v, 'us'); setAddMenuOpen(false); }}>
                  <SelectTrigger className="h-11"><SelectValue placeholder={t('tactics.formationUs')} /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(FORMATIONS).map((key) => (
                      <SelectItem key={key} value={key} dir="ltr">{key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t('tactics.formationThem')}</p>
                <Select onValueChange={(v) => { applyFormation(v, 'them'); setAddMenuOpen(false); }}>
                  <SelectTrigger className="h-11"><SelectValue placeholder={t('tactics.formationThem')} /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(FORMATIONS).map((key) => (
                      <SelectItem key={key} value={key} dir="ltr">{key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* ⋯ menu — less-frequent, whole-board actions (clearing
            everything, fullscreen, zone templates) tucked away instead
            of permanently occupying toolbar space. */}
        <Sheet open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
          <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
            <SheetHeader><SheetTitle>{t('tactics.moreMenu')}</SheetTitle></SheetHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary" className="h-12"
                  onClick={() => { toggleFullscreen(); setMoreMenuOpen(false); }}
                >
                  {isFullscreen ? <Minimize className="w-4 h-4 me-1" /> : <Maximize className="w-4 h-4 me-1" />}
                  {isFullscreen ? t('tactics.exitFullscreen') : t('tactics.fullscreen')}
                </Button>
                <Button
                  variant="secondary" className="h-12 text-destructive"
                  onClick={() => { commitBoard(emptyBoard()); setMoreMenuOpen(false); }}
                >
                  <Trash2 className="w-4 h-4 me-1" />{t('tactics.clearAll')}
                </Button>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t('tactics.zoneTemplates')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline" className="h-11"
                    onClick={() => {
                      commitBoard({
                        ...board,
                        lines: [
                          ...(board.lines ?? []),
                          { x1: 3, y1: 33.33, x2: 97, y2: 33.33 },
                          { x1: 3, y1: 66.67, x2: 97, y2: 66.67 },
                        ],
                      });
                      setMoreMenuOpen(false);
                    }}
                  >
                    {t('tactics.zoneThirds')}
                  </Button>
                  <Button
                    variant="outline" className="h-11"
                    onClick={() => {
                      commitBoard({
                        ...board,
                        lines: [
                          ...(board.lines ?? []),
                          { x1: 21.8, y1: 0, x2: 21.8, y2: 100 },
                          { x1: 40.6, y1: 0, x2: 40.6, y2: 100 },
                          { x1: 59.4, y1: 0, x2: 59.4, y2: 100 },
                          { x1: 78.2, y1: 0, x2: 78.2, y2: 100 },
                        ],
                      });
                      setMoreMenuOpen(false);
                    }}
                  >
                    {t('tactics.zoneChannels')}
                  </Button>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <TacticBoard board={board} commitBoard={commitBoard} setBoardLive={setBoardLive} beginLiveChange={beginLiveChange} commitLiveChange={commitLiveChange} mode={mode} selectedMarkerId={selectedMarkerId} onSelectMarker={setSelectedMarkerId} selectedShape={selectedShape} onSelectShape={setSelectedShape} isFullscreen={isFullscreen} />

        {/* Marker editor — appears once a marker is tapped/dragged in
            move mode. Recoloring here is what makes a training-game
            3-team split possible: add extra players/opponents, then
            give one group a third distinct color instead of being
            locked to the fixed us/them colors. */}
        {selectedMarkerId && (() => {
          const marker = board.markers.find((m) => m.id === selectedMarkerId);
          if (!marker || marker.side === 'ball') return null;
          const COLORS = ['#FFD84D', '#F4F1EC', '#E85D5D', '#5B9BD5', '#6FCF97', '#F2994A', '#BB8FCE'];
          const isActiveColor = (c: string) =>
            marker.color ? marker.color === c : (marker.side === 'us' ? c === '#FFD84D' : c === '#F4F1EC');
          return (
            <div className="bg-card border rounded-xl p-3 flex flex-wrap items-center gap-3">
              <Input
                value={marker.label}
                onChange={(e) => setBoardLive({
                  ...board,
                  markers: board.markers.map((m) => (m.id === selectedMarkerId ? { ...m, label: e.target.value } : m)),
                })}
                placeholder={t('tactics.markerLabel')}
                className="h-9 w-24 shrink-0"
              />
              <div className="flex items-center gap-1.5 flex-1 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => commitBoard({
                      ...board,
                      markers: board.markers.map((m) => (m.id === selectedMarkerId ? { ...m, color: c } : m)),
                    })}
                    className={`w-7 h-7 rounded-full border-2 shrink-0 ${isActiveColor(c) ? 'border-primary' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <Button
                size="sm" variant="ghost" className="shrink-0"
                onClick={() => {
                  // A small offset so the copy doesn't land exactly on
                  // top of the original — same label/side/equipment/
                  // color, just a new id and nudged position, then
                  // selected so it's immediately ready to drag into
                  // place (e.g. placing several cones or mini goals
                  // quickly rather than reopening the + menu each time).
                  const id = `dup-${Date.now()}`;
                  const result = duplicateMarker(board, selectedMarkerId, id);
                  if (result) {
                    commitBoard(result.board);
                    setSelectedMarkerId(id);
                  }
                }}
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button
                size="sm" variant="ghost" className="text-destructive hover:text-destructive shrink-0"
                onClick={() => {
                  commitBoard({ ...board, markers: board.markers.filter((m) => m.id !== selectedMarkerId) });
                  setSelectedMarkerId(null);
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          );
        })()}

        {/* Shape editor — same idea as the marker editor above, but for
            a selected arrow/line/zone. Shapes don't have a label or
            color to edit here, just duplicate (this is specifically
            what draw-a-zone → copy-it → move-it needed and didn't have
            before) and delete. */}
        {selectedShape && (
          <div className="bg-card border rounded-xl p-3 flex items-center gap-3">
            <span className="text-sm text-muted-foreground flex-1">
              {selectedShape.kind === 'zone' ? t('tactics.modeZone') : selectedShape.kind === 'arrow' ? t('tactics.modeArrow') : t('tactics.modeLine')}
            </span>
            <Button
              size="sm" variant="ghost" className="shrink-0"
              onClick={() => {
                const next =
                  selectedShape.kind === 'arrow' ? duplicateArrow(board, selectedShape.index)
                  : selectedShape.kind === 'line' ? duplicateLine(board, selectedShape.index)
                  : duplicateZone(board, selectedShape.index);
                commitBoard(next);
                const newIndex =
                  selectedShape.kind === 'arrow' ? next.arrows.length - 1
                  : selectedShape.kind === 'line' ? (next.lines ?? []).length - 1
                  : (next.zones ?? []).length - 1;
                setSelectedShape({ kind: selectedShape.kind, index: newIndex });
              }}
            >
              <Copy className="w-4 h-4" />
            </Button>
            <Button
              size="sm" variant="ghost" className="text-destructive hover:text-destructive shrink-0"
              onClick={() => {
                commitBoard(deleteErasable(board, { kind: selectedShape.kind, index: selectedShape.index }));
                setSelectedShape(null);
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Animation frames (TacticalPad-style sequences) */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={addFrame} disabled={playing}>
            <Camera className="w-4 h-4 me-1" />{t('tactics.addFrame')}
          </Button>
          {(board.frames ?? []).map((_, i) => (
            <span key={i} className="inline-flex items-center gap-1 pill-beige rounded px-2 py-1 text-xs">
              <button onClick={() => loadFrame(i)} disabled={playing}>{i + 1}</button>
              <button onClick={() => removeFrame(i)} disabled={playing} className="opacity-70">×</button>
            </span>
          ))}
          {(board.frames ?? []).length >= 2 && (
            <Button size="sm" onClick={play} disabled={playing}>
              <Play className="w-4 h-4 me-1" />{playing ? t('tactics.playing') : t('tactics.play')}
            </Button>
          )}
          {(board.frames ?? []).length < 2 && (
            <span className="text-xs text-muted-foreground">{t('tactics.frameHint')}</span>
          )}
        </div>

        <Textarea value={board.notes ?? ''} placeholder={t('tactics.notesPlaceholder')}
          onChange={(e) => setBoardLive({ ...board, notes: e.target.value })} rows={3} />

        <div className="flex gap-2">
          <Button onClick={doSave} disabled={save.isPending}>
            <Save className="w-4 h-4 me-1" /> {t('common.save')}
          </Button>
          <Button variant="secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button onClick={() => open()}><Plus className="w-4 h-4 me-1" /> {t('tactics.new')}</Button>
      {isLoading && <p className="text-muted-foreground text-sm">{t('common.loading')}</p>}
      {!isLoading && list.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('tactics.empty')}</p>
      )}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((tc) => (
          <div key={tc.id}
            className="border border-border rounded-lg p-3 bg-card flex items-center justify-between gap-2">
            <button className="text-start flex-1" onClick={() => open(tc)}>
              <div className="font-semibold">{tc.name}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(tc.createdAt).toLocaleDateString()}
                {tc.matchId && (matches ?? []).find((m: any) => m.id === tc.matchId)
                  ? ` · ${(matches ?? []).find((m) => m.id === tc.matchId)?.opponent}` : ''}
              </div>
            </button>
            <Button size="icon" variant="ghost" onClick={() => del.mutate(tc.id, { onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }) })}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- opponents tab

function OpponentsTab({ teamId }: { teamId: number }) {
  const { t } = useLanguage();
  const { data: notes, isLoading } = useOpponentNotes(teamId);
  const save = useSaveOpponentNote(teamId);
  const del = useDeleteOpponentNote(teamId);
  const [form, setForm] = useState<{ id?: number; opponent: string; strengths: string; weaknesses: string; plan: string } | null>(null);

  const doSave = () => {
    if (!form?.opponent.trim()) {
      toast({ variant: 'destructive', title: t('tactics.opponentRequired') });
      return;
    }
    save.mutate(form, {
      onSuccess: () => { toast({ title: t('tactics.saved') }); setForm(null); },
      onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }),
    });
  };

  if (form) {
    return (
      <div className="space-y-3 max-w-lg">
        <Input value={form.opponent} placeholder={t('tactics.opponentName')}
          onChange={(e) => setForm({ ...form, opponent: e.target.value })} />
        <Textarea value={form.strengths} placeholder={t('tactics.strengths')} rows={2}
          onChange={(e) => setForm({ ...form, strengths: e.target.value })} />
        <Textarea value={form.weaknesses} placeholder={t('tactics.weaknesses')} rows={2}
          onChange={(e) => setForm({ ...form, weaknesses: e.target.value })} />
        <Textarea value={form.plan} placeholder={t('tactics.gamePlan')} rows={3}
          onChange={(e) => setForm({ ...form, plan: e.target.value })} />
        <div className="flex gap-2">
          <Button onClick={doSave} disabled={save.isPending}>
            <Save className="w-4 h-4 me-1" /> {t('common.save')}
          </Button>
          <Button variant="secondary" onClick={() => setForm(null)}>{t('common.cancel')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button onClick={() => setForm({ opponent: '', strengths: '', weaknesses: '', plan: '' })}>
        <Plus className="w-4 h-4 me-1" /> {t('tactics.newNote')}
      </Button>
      {isLoading && <p className="text-muted-foreground text-sm">{t('common.loading')}</p>}
      {!isLoading && (notes ?? []).length === 0 && (
        <p className="text-muted-foreground text-sm">{t('tactics.emptyNotes')}</p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {(notes ?? []).map((n) => (
          <div key={n.id} className="border border-border rounded-lg p-3 bg-card space-y-1">
            <div className="flex items-center justify-between">
              <button className="font-semibold" onClick={() =>
                setForm({ id: n.id, opponent: n.opponent, strengths: n.strengths ?? '', weaknesses: n.weaknesses ?? '', plan: n.plan ?? '' })}>
                {n.opponent}
              </button>
              <Button size="icon" variant="ghost" onClick={() => del.mutate(n.id, { onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }) })}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
            {n.strengths && <p className="text-xs"><span className="pill-beige px-1.5 py-0.5 rounded me-1">{t('tactics.strengthsShort')}</span>{n.strengths}</p>}
            {n.weaknesses && <p className="text-xs"><span className="pill-gray px-1.5 py-0.5 rounded me-1">{t('tactics.weaknessesShort')}</span>{n.weaknesses}</p>}
            {n.plan && <p className="text-xs text-muted-foreground">{n.plan}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AllTab({
  teamId, onOpen,
}: {
  teamId: number; onOpen: (kind: TacticKind, id: number) => void;
}) {
  const { t } = useLanguage();
  const { data: tactics, isLoading } = useTactics(teamId);
  const { data: matches } = useListMatches(teamId, { query: { enabled: true, queryKey: getListMatchesQueryKey(teamId) } });

  const sorted = React.useMemo(
    () => [...(tactics ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [tactics],
  );

  const KIND_STYLES: Record<TacticKind, string> = {
    general: 'pill-beige',
    set_piece: 'pill-yellow',
    match_plan: 'pill-green',
    analysis: 'pill-blue',
  };

  if (isLoading) return <p className="text-muted-foreground text-sm">{t('common.loading')}</p>;
  if (sorted.length === 0) return <p className="text-muted-foreground text-sm">{t('tactics.emptyAll')}</p>;

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((tc) => (
        <button
          key={`${tc.kind}-${tc.id}`}
          className="text-start border border-border rounded-lg p-3 bg-card hover:bg-white/[0.03] transition-colors"
          onClick={() => onOpen(tc.kind, tc.id)}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold truncate">{tc.name}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${KIND_STYLES[tc.kind]}`}>
              {t(`tactics.kind.${tc.kind}`)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {new Date(tc.createdAt).toLocaleDateString()}
            {tc.matchId && (matches ?? []).find((m: any) => m.id === tc.matchId)
              ? ` · ${(matches ?? []).find((m) => m.id === tc.matchId)?.opponent}` : ''}
          </div>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- page

const TAB_BY_KIND: Record<TacticKind, string> = { general: 'board', set_piece: 'setpieces', match_plan: 'plans', analysis: 'analysis' };

export function Tactics() {
  const { t } = useLanguage();
  const { activeTeamId } = useTeam();
  const [tab, setTab] = useState('all');
  const [pending, setPending] = useState<{ kind: TacticKind; id: number } | null>(null);

  if (!activeTeamId) return <NoTeamState />;

  const jumpTo = (kind: TacticKind, id: number) => {
    setPending({ kind, id });
    setTab(TAB_BY_KIND[kind]);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold font-display">{t('nav.tactics')}</h1>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">{t('tactics.tabAll')}</TabsTrigger>
            <TabsTrigger value="board">{t('tactics.tabBoard')}</TabsTrigger>
            <TabsTrigger value="analysis">{t('analysis.tabAnalysis')}</TabsTrigger>
            <TabsTrigger value="setpieces">{t('tactics.tabSetPieces')}</TabsTrigger>
            <TabsTrigger value="plans">{t('tactics.tabPlans')}</TabsTrigger>
            <TabsTrigger value="opponents">{t('tactics.tabOpponents')}</TabsTrigger>
          </TabsList>
          <TabsContent value="all"><AllTab teamId={activeTeamId} onOpen={jumpTo} /></TabsContent>
          <TabsContent value="board">
            <BoardsTab
              teamId={activeTeamId} kind="general"
              openId={pending?.kind === 'general' ? pending.id : null}
              onOpened={() => setPending(null)}
            />
          </TabsContent>
          <TabsContent value="analysis">
            <AnalysisBoard teamId={activeTeamId} />
          </TabsContent>
          <TabsContent value="setpieces">
            <BoardsTab
              teamId={activeTeamId} kind="set_piece"
              openId={pending?.kind === 'set_piece' ? pending.id : null}
              onOpened={() => setPending(null)}
            />
          </TabsContent>
          <TabsContent value="plans">
            <BoardsTab
              teamId={activeTeamId} kind="match_plan"
              openId={pending?.kind === 'match_plan' ? pending.id : null}
              onOpened={() => setPending(null)}
            />
          </TabsContent>
          <TabsContent value="opponents"><OpponentsTab teamId={activeTeamId} /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

export default Tactics;
