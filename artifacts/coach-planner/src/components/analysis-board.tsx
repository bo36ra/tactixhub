import React from 'react';
import { useLanguage } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { useListPlayers } from '@workspace/api-client-react';
import {
  useTactics, useSaveTactic, useDeleteTactic, parseBoard,
  type BoardData, type BoardMarker, type Tactic, type TacticalEvent, type TacticalEventType, EVENT_TYPES,
  SUBTYPES_BY_EVENT,
} from '@/lib/tactics-api';
import { PITCH_GRADIENT } from '@/lib/chart-theme';
import { playerName } from '@/lib/player-name';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  MousePointer2, UserPlus, ArrowUpRight, Undo2, Redo2, Eraser, Save, X,
  ListFilter, ZoomIn, ZoomOut, Trash2, ChevronDown, BarChart3,
} from 'lucide-react';

type Mode = 'select' | 'add-player' | 'arrow' | 'erase';

const EVENT_COLORS: Record<TacticalEventType, string> = {
  pass: '#5B9BD5', shot: '#E85D5D', reception: '#6FCF97', loss: '#B0473E',
  recovery: '#4C7A52', press: '#F2994A', tackle: '#BB8FCE', off_ball_movement: '#9C9483',
  cross: '#4FC3F7', corner: '#FFD84D', foul: '#D96B5B', custom: '#7D8590',
};

function eventTypeLabel(ev: { type: TacticalEventType; customLabel?: string | null }, t: (k: string) => string) {
  return ev.type === 'custom' ? (ev.customLabel || t('analysis.evt.custom')) : t(`analysis.evt.${ev.type}`);
}

function emptyAnalysisBoard(): BoardData {
  return { markers: [], arrows: [], lines: [], drawings: [], frames: [], notes: '', events: [] };
}

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

export function AnalysisBoard({ teamId }: { teamId: number }) {
  const { t, lang, isRtl } = useLanguage();
  const { toast } = useToast();
  const { data: tactics } = useTactics(teamId);
  const { data: players } = useListPlayers(teamId);
  const save = useSaveTactic(teamId);
  const del = useDeleteTactic(teamId);

  const sessions = (tactics ?? []).filter((tc) => tc.kind === 'analysis');

  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [sessionName, setSessionName] = React.useState('');
  const [board, setBoardRaw] = React.useState<BoardData>(emptyAnalysisBoard());
  const [sessionPickerOpen, setSessionPickerOpen] = React.useState(sessions.length === 0);

  // ---- Undo/redo: a simple snapshot stack. Fine at this scale (a
  // session's data is small — markers/arrows/events, not video) —
  // no need for a diff-based history.
  const historyRef = React.useRef<BoardData[]>([emptyAnalysisBoard()]);
  const historyIndexRef = React.useRef(0);
  const [historyTick, setHistoryTick] = React.useState(0); // forces re-render on undo/redo availability change

  const setBoard = (next: BoardData, { commit = true }: { commit?: boolean } = {}) => {
    setBoardRaw(next);
    if (commit) {
      const trimmed = historyRef.current.slice(0, historyIndexRef.current + 1);
      trimmed.push(next);
      historyRef.current = trimmed;
      historyIndexRef.current = trimmed.length - 1;
      setHistoryTick((n) => n + 1);
    }
  };

  const undo = () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    setBoardRaw(historyRef.current[historyIndexRef.current]);
    setHistoryTick((n) => n + 1);
  };
  const redo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    setBoardRaw(historyRef.current[historyIndexRef.current]);
    setHistoryTick((n) => n + 1);
  };
  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const openSession = (tc?: Tactic) => {
    if (tc) {
      setEditingId(tc.id);
      setSessionName(tc.name);
      const parsed = parseBoard(tc.data);
      setBoardRaw(parsed);
      historyRef.current = [parsed];
      historyIndexRef.current = 0;
    } else {
      setEditingId(null);
      setSessionName('');
      const fresh = emptyAnalysisBoard();
      setBoardRaw(fresh);
      historyRef.current = [fresh];
      historyIndexRef.current = 0;
    }
    setHistoryTick((n) => n + 1);
    setSessionPickerOpen(false);
  };

  const handleSave = () => {
    if (!sessionName.trim()) {
      toast({ title: t('analysis.nameRequired'), variant: 'destructive' });
      return;
    }
    save.mutate(
      { id: editingId ?? undefined, name: sessionName.trim(), kind: 'analysis', data: board },
      {
        onSuccess: (saved) => {
          toast({ title: t('tactics.saved') });
          setEditingId(saved.id);
        },
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }),
      },
    );
  };

  // ------------------------------------------------------------ gestures
  const containerRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [mode, setMode] = React.useState<Mode>('select');
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [arrowDraft, setArrowDraft] = React.useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [pendingPos, setPendingPos] = React.useState<{ x: number; y: number } | null>(null);
  const [eventsPanelOpen, setEventsPanelOpen] = React.useState(false);
  const [statsOpen, setStatsOpen] = React.useState(false);

  const gesture = React.useRef<{
    kind: 'none' | 'marker' | 'arrow' | 'pan-or-tap';
    markerId?: string;
    startClientX: number;
    startClientY: number;
    startPercent: { x: number; y: number };
    moved: boolean;
    pinch?: { startDist: number; startZoom: number };
  }>({ kind: 'none', startClientX: 0, startClientY: 0, startPercent: { x: 0, y: 0 }, moved: false });

  const toPercent = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    };
  };

  const eraseAt = (p: { x: number; y: number }) => {
    let bestKind: 'marker' | 'event' | 'arrow' | null = null;
    let bestIdx = -1;
    let bestDist = 5; // percent units — generous enough for a fingertip
    board.markers.forEach((m, i) => {
      const d = dist(m.x, m.y, p.x, p.y);
      if (d < bestDist) { bestDist = d; bestKind = 'marker'; bestIdx = i; }
    });
    (board.events ?? []).forEach((e, i) => {
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < bestDist) { bestDist = d; bestKind = 'event'; bestIdx = i; }
    });
    board.arrows.forEach((a, i) => {
      const d = distToSeg(p.x, p.y, a.x1, a.y1, a.x2, a.y2);
      if (d < bestDist) { bestDist = d; bestKind = 'arrow'; bestIdx = i; }
    });
    if (bestKind === 'marker') {
      setBoard({ ...board, markers: board.markers.filter((_, i) => i !== bestIdx) });
    } else if (bestKind === 'event') {
      setBoard({ ...board, events: (board.events ?? []).filter((_, i) => i !== bestIdx) });
    } else if (bestKind === 'arrow') {
      setBoard({ ...board, arrows: board.arrows.filter((_, i) => i !== bestIdx) });
    }
  };

  const hitTestMarker = (p: { x: number; y: number }): BoardMarker | null => {
    let best: BoardMarker | null = null;
    let bestDist = 6; // percent units
    for (const m of board.markers) {
      const d = dist(m.x, m.y, p.x, p.y);
      if (d < bestDist) { best = m; bestDist = d; }
    }
    return best;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      gesture.current.pinch = { startDist: dist(a.clientX, a.clientY, b.clientX, b.clientY), startZoom: zoom };
      gesture.current.kind = 'none';
      return;
    }
    const touch = e.touches[0];
    const p = toPercent(touch.clientX, touch.clientY);
    const hit = mode === 'select' ? hitTestMarker(p) : null;
    gesture.current = {
      kind: hit ? 'marker' : mode === 'arrow' ? 'arrow' : 'pan-or-tap',
      markerId: hit?.id,
      startClientX: touch.clientX,
      startClientY: touch.clientY,
      startPercent: p,
      moved: false,
    };
    if (mode === 'arrow') setArrowDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2 && gesture.current.pinch) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = dist(a.clientX, a.clientY, b.clientX, b.clientY);
      const nextZoom = Math.max(1, Math.min(3, gesture.current.pinch.startZoom * (d / gesture.current.pinch.startDist)));
      setZoom(nextZoom);
      return;
    }
    const touch = e.touches[0];
    if (!touch) return;
    const p = toPercent(touch.clientX, touch.clientY);
    const moveDist = dist(touch.clientX, touch.clientY, gesture.current.startClientX, gesture.current.startClientY);
    if (moveDist > 6) gesture.current.moved = true;

    if (gesture.current.kind === 'marker' && gesture.current.markerId) {
      setBoardRaw({
        ...board,
        markers: board.markers.map((m) => (m.id === gesture.current.markerId ? { ...m, x: p.x, y: p.y } : m)),
      });
    } else if (gesture.current.kind === 'arrow') {
      setArrowDraft((prev) => (prev ? { ...prev, x2: p.x, y2: p.y } : prev));
    } else if (gesture.current.kind === 'pan-or-tap' && zoom > 1 && gesture.current.moved) {
      setPan((prev) => ({
        x: prev.x + (touch.clientX - gesture.current.startClientX) / zoom,
        y: prev.y + (touch.clientY - gesture.current.startClientY) / zoom,
      }));
      gesture.current.startClientX = touch.clientX;
      gesture.current.startClientY = touch.clientY;
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length > 0) return; // still mid multi-touch gesture
    const g = gesture.current;
    if (g.kind === 'marker' && g.markerId) {
      setBoard(board); // commit the already-live-updated position to history
    } else if (g.kind === 'arrow') {
      if (arrowDraft && dist(arrowDraft.x1, arrowDraft.y1, arrowDraft.x2, arrowDraft.y2) > 3) {
        setBoard({ ...board, arrows: [...board.arrows, arrowDraft] });
      }
      setArrowDraft(null);
    } else if (g.kind === 'pan-or-tap' && !g.moved) {
      // a genuine tap
      if (mode === 'select') {
        setPendingPos(g.startPercent);
      } else if (mode === 'add-player') {
        const id = `p-${Date.now()}`;
        setBoard({ ...board, markers: [...board.markers, { id, x: g.startPercent.x, y: g.startPercent.y, label: '', side: 'us' }] });
      } else if (mode === 'erase') {
        eraseAt(g.startPercent);
      }
    }
    gesture.current = { kind: 'none', startClientX: 0, startClientY: 0, startPercent: { x: 0, y: 0 }, moved: false };
  };

  // Mouse fallback for desktop/trackpad testing — same logic, single pointer only (no pinch)
  const mouseDown = React.useRef(false);
  const onMouseDown = (e: React.MouseEvent) => {
    mouseDown.current = true;
    const p = toPercent(e.clientX, e.clientY);
    const hit = mode === 'select' ? hitTestMarker(p) : null;
    gesture.current = {
      kind: hit ? 'marker' : mode === 'arrow' ? 'arrow' : 'pan-or-tap',
      markerId: hit?.id,
      startClientX: e.clientX, startClientY: e.clientY, startPercent: p, moved: false,
    };
    if (mode === 'arrow') setArrowDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!mouseDown.current) return;
    const p = toPercent(e.clientX, e.clientY);
    const moveDist = dist(e.clientX, e.clientY, gesture.current.startClientX, gesture.current.startClientY);
    if (moveDist > 4) gesture.current.moved = true;
    if (gesture.current.kind === 'marker' && gesture.current.markerId) {
      setBoardRaw({ ...board, markers: board.markers.map((m) => (m.id === gesture.current.markerId ? { ...m, x: p.x, y: p.y } : m)) });
    } else if (gesture.current.kind === 'arrow') {
      setArrowDraft((prev) => (prev ? { ...prev, x2: p.x, y2: p.y } : prev));
    }
  };
  const onMouseUp = () => {
    if (!mouseDown.current) return;
    mouseDown.current = false;
    const g = gesture.current;
    if (g.kind === 'marker' && g.markerId) {
      setBoard(board);
    } else if (g.kind === 'arrow') {
      if (arrowDraft && dist(arrowDraft.x1, arrowDraft.y1, arrowDraft.x2, arrowDraft.y2) > 3) {
        setBoard({ ...board, arrows: [...board.arrows, arrowDraft] });
      }
      setArrowDraft(null);
    } else if (g.kind === 'pan-or-tap' && !g.moved) {
      if (mode === 'select') setPendingPos(g.startPercent);
      else if (mode === 'add-player') {
        const id = `p-${Date.now()}`;
        setBoard({ ...board, markers: [...board.markers, { id, x: g.startPercent.x, y: g.startPercent.y, label: '', side: 'us' }] });
      } else if (mode === 'erase') {
        eraseAt(g.startPercent);
      }
    }
    gesture.current = { kind: 'none', startClientX: 0, startClientY: 0, startPercent: { x: 0, y: 0 }, moved: false };
  };

  const events = (board.events ?? []).slice().sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0) || a.createdAt - b.createdAt);

  const addEvent = (type: TacticalEventType, subtype: string | null, customLabel: string | null, playerId: number | null, minute: number | null) => {
    if (!pendingPos) return;
    const ev: TacticalEvent = { id: `e-${Date.now()}`, x: pendingPos.x, y: pendingPos.y, type, subtype, customLabel, playerId, minute, createdAt: Date.now() };
    setBoard({ ...board, events: [...(board.events ?? []), ev] });
    setPendingPos(null);
  };

  const deleteEvent = (id: string) => {
    setBoard({ ...board, events: (board.events ?? []).filter((e) => e.id !== id) });
  };

  const handleClear = () => {
    setBoard(emptyAnalysisBoard());
  };

  return (
    <div className="flex flex-col rounded-xl border border-border overflow-hidden bg-card" style={{ height: 'calc(100vh - 13rem)', minHeight: '32rem' }}>
      {/* Top toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border shrink-0">
        <button type="button" onClick={() => setSessionPickerOpen(true)} className="flex items-center gap-1.5 text-sm font-semibold truncate min-w-0">
          <span className="truncate">{sessionName || t('analysis.untitled')}</span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setStatsOpen(true)} title={t('analysis.report')}>
            <BarChart3 className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 md:hidden" onClick={() => setEventsPanelOpen(true)}>
            <ListFilter className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={handleSave} disabled={save.isPending} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />{t('common.save')}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left tool rail */}
        <div className="flex flex-col items-center gap-1 p-1.5 border-e border-border shrink-0">
          <Button size="icon" variant={mode === 'select' ? 'default' : 'ghost'} className="h-10 w-10" onClick={() => setMode('select')} title={t('analysis.toolSelect')}>
            <MousePointer2 className="w-4.5 h-4.5" />
          </Button>
          <Button size="icon" variant={mode === 'add-player' ? 'default' : 'ghost'} className="h-10 w-10" onClick={() => setMode('add-player')} title={t('analysis.toolPlayer')}>
            <UserPlus className="w-4.5 h-4.5" />
          </Button>
          <Button size="icon" variant={mode === 'arrow' ? 'default' : 'ghost'} className="h-10 w-10" onClick={() => setMode('arrow')} title={t('analysis.toolArrow')}>
            <ArrowUpRight className="w-4.5 h-4.5" />
          </Button>
          <Button size="icon" variant={mode === 'erase' ? 'default' : 'ghost'} className="h-10 w-10" onClick={() => setMode('erase')} title={t('analysis.toolErase')}>
            <Eraser className="w-4.5 h-4.5" />
          </Button>
          <div className="h-px w-6 bg-border my-1" />
          <Button size="icon" variant="ghost" className="h-10 w-10" onClick={undo} disabled={!canUndo} title={t('tactics.undo')}>
            <Undo2 className="w-4.5 h-4.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-10 w-10" onClick={redo} disabled={!canRedo} title={t('analysis.redo')}>
            <Redo2 className="w-4.5 h-4.5" />
          </Button>
          <div className="h-px w-6 bg-border my-1" />
          <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => setZoom((z) => Math.min(3, z + 0.4))} title={t('analysis.zoomIn')}>
            <ZoomIn className="w-4.5 h-4.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => { setZoom((z) => Math.max(1, z - 0.4)); setPan({ x: 0, y: 0 }); }} title={t('analysis.zoomOut')}>
            <ZoomOut className="w-4.5 h-4.5" />
          </Button>
          <div className="h-px w-6 bg-border my-1" />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-10 w-10 text-destructive/70 hover:text-destructive" title={t('tactics.clearAll')}>
                <Trash2 className="w-4.5 h-4.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
                <AlertDialogDescription>{t('analysis.clearAllConfirm')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleClear} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {t('tactics.clearAll')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Pitch */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden bg-black/20">
          <div
            className="absolute inset-2 sm:inset-4"
            style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`, transformOrigin: 'center', touchAction: 'none' }}
          >
            <svg
              ref={svgRef}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="w-full h-full rounded-lg border border-border select-none"
              style={{ aspectRatio: '100 / 140', background: PITCH_GRADIENT, touchAction: 'none', margin: '0 auto', display: 'block', maxWidth: 'min(100%, calc((100vh - 20rem) * 100 / 140))' }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              {/* pitch markings, normalized to 0-100 x 0-100 */}
              <g stroke="rgba(255,255,255,0.55)" strokeWidth="0.5" fill="none" vectorEffect="non-scaling-stroke">
                <rect x="2" y="2" width="96" height="96" rx="0.6" />
                <line x1="2" y1="50" x2="98" y2="50" />
                <circle cx="50" cy="50" r="9" />
                <rect x="26" y="2" width="48" height="16" />
                <rect x="26" y="82" width="48" height="16" />
                <rect x="38" y="2" width="24" height="6" />
                <rect x="38" y="92" width="24" height="6" />
              </g>

              {board.arrows.map((a, i) => (
                <g key={i}>
                  <defs>
                    <marker id={`aa-${i}`} markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
                      <path d="M0,0 L6,3 L0,6 Z" fill="#FFD84D" />
                    </marker>
                  </defs>
                  <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="#FFD84D" strokeWidth="0.8" markerEnd={`url(#aa-${i})`} vectorEffect="non-scaling-stroke" />
                </g>
              ))}
              {arrowDraft && (
                <line x1={arrowDraft.x1} y1={arrowDraft.y1} x2={arrowDraft.x2} y2={arrowDraft.y2} stroke="#FFD84D" strokeWidth="0.8" strokeDasharray="1.5 1" vectorEffect="non-scaling-stroke" />
              )}

              {events.map((ev) => (
                <g key={ev.id} transform={`translate(${ev.x}, ${ev.y})`}>
                  {ev.subtype ? (
                    <>
                      <rect x="-4.6" y="-2.6" width="9.2" height="5.2" rx="1" fill={EVENT_COLORS[ev.type]} stroke="#111" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
                      <text textAnchor="middle" dy="1.4" fontSize="3.6" fontWeight="800" fill="#fff">{ev.subtype}</text>
                    </>
                  ) : (
                    <circle r="1.6" fill={EVENT_COLORS[ev.type]} stroke="#111" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
                  )}
                </g>
              ))}

              {board.markers.map((m) => (
                <g key={m.id} transform={`translate(${m.x}, ${m.y})`}>
                  <circle r="3.2" fill={m.color ?? (m.side === 'us' ? '#FFD84D' : '#F4F1EC')} stroke="#1a1a1a" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
                  {m.label && <text textAnchor="middle" dy="1.1" fontSize="3" fontWeight="700" fill="#1a1a1a">{m.label}</text>}
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* Right events panel (desktop) */}
        <div className="hidden md:flex flex-col w-72 border-s border-border shrink-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-border shrink-0">
            <p className="text-xs font-semibold text-muted-foreground">{t('analysis.eventsList')} ({events.length})</p>
          </div>
          <EventsList events={events} players={players ?? []} lang={lang} t={t} onDelete={deleteEvent} />
        </div>
      </div>

      {/* Bottom timeline */}
      <div className="border-t border-border px-2 py-2 shrink-0 overflow-x-auto">
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-1">{t('analysis.timelineEmpty')}</p>
        ) : (
          <div className="flex gap-1.5" dir="ltr">
            {events.map((ev) => (
              <div key={ev.id} className="flex flex-col items-center shrink-0 w-14">
                <span className="w-2.5 h-2.5 rounded-full mb-1" style={{ backgroundColor: EVENT_COLORS[ev.type] }} />
                <span className="text-[10px] text-muted-foreground font-mono">{ev.minute != null ? `${ev.minute}'` : '--'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Legend t={t} />

      {/* Mobile events sheet */}
      <Sheet open={eventsPanelOpen} onOpenChange={setEventsPanelOpen}>
        <SheetContent side={isRtl ? 'left' : 'right'} className="w-full sm:max-w-sm p-0 flex flex-col">
          <SheetHeader className="px-3 py-2 border-b border-border shrink-0">
            <SheetTitle className="text-sm">{t('analysis.eventsList')} ({events.length})</SheetTitle>
          </SheetHeader>
          <EventsList events={events} players={players ?? []} lang={lang} t={t} onDelete={deleteEvent} />
        </SheetContent>
      </Sheet>

      {/* Add-event dialog */}
      <AddEventDialog
        open={pendingPos !== null}
        pos={pendingPos}
        players={players ?? []}
        lang={lang}
        t={t}
        onCancel={() => setPendingPos(null)}
        onConfirm={addEvent}
      />

      {/* Stats / report dialog */}
      <StatsDialog open={statsOpen} onOpenChange={setStatsOpen} events={events} players={players ?? []} lang={lang} t={t} />

      {/* Session picker */}
      <Dialog open={sessionPickerOpen} onOpenChange={setSessionPickerOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('analysis.sessions')}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder={t('analysis.sessionName')} className="flex-1" />
              <Button onClick={() => openSession()}>{t('analysis.newSession')}</Button>
            </div>
            {sessions.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-border">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                    <button type="button" className="flex-1 text-start text-sm font-medium truncate" onClick={() => openSession(s)}>
                      {s.name}
                    </button>
                    <button type="button" className="text-destructive/60 hover:text-destructive p-1" onClick={() => del.mutate(s.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Legend({ t }: { t: (k: string) => string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="border-t border-border shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        {t('analysis.legend')}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2.5 max-h-40 overflow-y-auto">
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {EVENT_TYPES.map((et) => (
              <div key={et} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: EVENT_COLORS[et] }} />
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">{t(`analysis.evt.${et}`)}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: EVENT_COLORS.custom }} />
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">{t('analysis.evt.custom')} ({t('analysis.legendCustomNote')})</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {EVENT_TYPES.filter((et) => SUBTYPES_BY_EVENT[et]).flatMap((et) =>
              (SUBTYPES_BY_EVENT[et] ?? []).map((st) => (
                <div key={`${et}-${st}`} className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: EVENT_COLORS[et], color: '#fff' }}>{st}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{t(`analysis.sub.${et}.${st}`)}</span>
                </div>
              )),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EventsList({
  events, players, lang, t, onDelete,
}: {
  events: TacticalEvent[];
  players: { id: number; name: string; nameAlt?: string | null; jerseyNumber: number }[];
  lang: string;
  t: (k: string) => string;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">{t('analysis.noEvents')}</p>
      ) : (
        events.map((ev) => {
          const player = players.find((p) => p.id === ev.playerId);
          return (
            <div key={ev.id} className="flex items-center gap-2 bg-muted/40 rounded-lg px-2.5 py-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: EVENT_COLORS[ev.type] }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">
                  {eventTypeLabel(ev, t)}
                  {ev.subtype && (
                    <span className="ms-1.5 text-[9px] font-bold bg-primary/15 text-primary px-1 py-0.5 rounded">
                      {ev.type === 'custom' ? ev.subtype : t(`analysis.sub.${ev.type}.${ev.subtype}`)}
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {ev.minute != null ? `${ev.minute}' · ` : ''}{player ? playerName(player, lang) : t('analysis.noPlayer')}
                </p>
              </div>
              <button type="button" className="text-destructive/50 hover:text-destructive p-1 shrink-0" onClick={() => onDelete(ev.id)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

function StatsDialog({
  open, onOpenChange, events, players, lang, t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: TacticalEvent[];
  players: { id: number; name: string; nameAlt?: string | null; jerseyNumber: number }[];
  lang: string;
  t: (k: string) => string;
}) {
  const [view, setView] = React.useState<'overview' | 'byPlayer' | 'timeline'>('overview');
  const [openPlayerId, setOpenPlayerId] = React.useState<number | null>(null);

  const byType = EVENT_TYPES.map((et) => ({ type: et as TacticalEventType, count: events.filter((e) => e.type === et).length })).filter((r) => r.count > 0);
  const customCount = events.filter((e) => e.type === 'custom').length;
  if (customCount > 0) byType.push({ type: 'custom', count: customCount });
  const subtypeBreakdowns = EVENT_TYPES
    .filter((et) => SUBTYPES_BY_EVENT[et])
    .map((et) => ({
      type: et,
      rows: (SUBTYPES_BY_EVENT[et] ?? []).map((st) => ({
        subtype: st,
        count: events.filter((e) => e.type === et && e.subtype === st).length,
      })).filter((r) => r.count > 0),
    }))
    .filter((g) => g.rows.length > 0);
  const byPlayerCount = players
    .map((p) => ({ player: p, count: events.filter((e) => e.playerId === p.id).length }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const noPlayerCount = events.filter((e) => !e.playerId).length;

  const sortedEvents = events.slice().sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0) || a.createdAt - b.createdAt);

  const eventLabel = (ev: TacticalEvent) => {
    const sub = ev.subtype ? ` (${ev.subtype})` : '';
    return `${eventTypeLabel(ev, t)}${sub}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t('analysis.report')}</DialogTitle></DialogHeader>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{t('analysis.noEvents')}</p>
        ) : (
          <div className="space-y-4">
            <div className="bg-primary/10 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-primary">{events.length}</p>
              <p className="text-xs text-muted-foreground">{t('analysis.totalEvents')}</p>
            </div>

            {/* View filter */}
            <div className="flex gap-1.5 bg-muted/40 rounded-lg p-1">
              {(['overview', 'byPlayer', 'timeline'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-md ${view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                >
                  {t(`analysis.view.${v}`)}
                </button>
              ))}
            </div>

            {/* ---- Overview ---- */}
            {view === 'overview' && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{t('analysis.byType')}</p>
                  <div className="space-y-1">
                    {byType.map((r) => (
                      <div key={r.type} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: EVENT_COLORS[r.type] }} />
                        <span className="text-sm flex-1">{t(`analysis.evt.${r.type}`)}</span>
                        <span className="text-sm font-bold" dir="ltr">{r.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {subtypeBreakdowns.map((g) => (
                  <div key={g.type}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      {t(`analysis.evt.${g.type}`)} — {t('analysis.subBreakdown')}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {g.rows.map((r) => (
                        <div key={r.subtype} className="flex items-center justify-between bg-muted/40 rounded-lg px-2.5 py-1.5">
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: EVENT_COLORS[g.type] }}>{r.subtype}</span>
                          <span className="text-xs text-muted-foreground" dir="ltr">{r.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ---- By player ---- */}
            {view === 'byPlayer' && (
              <div className="space-y-1.5">
                {byPlayerCount.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">{t('analysis.noPlayerEvents')}</p>
                ) : byPlayerCount.map(({ player, count }) => {
                  const playerEvents = sortedEvents.filter((e) => e.playerId === player.id);
                  const isOpen = openPlayerId === player.id;
                  return (
                    <div key={player.id} className="border border-border rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpenPlayerId(isOpen ? null : player.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30"
                      >
                        <span className="text-sm font-semibold flex-1 text-start truncate">{playerName(player, lang)}</span>
                        <span className="text-xs text-muted-foreground" dir="ltr">{count}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="px-3 py-2 space-y-1.5">
                          {playerEvents.map((ev) => (
                            <div key={ev.id} className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: EVENT_COLORS[ev.type] }} />
                              <span className="text-xs flex-1">{eventLabel(ev)}</span>
                              <span className="text-[10px] text-muted-foreground font-mono" dir="ltr">{ev.minute != null ? `${ev.minute}'` : '--'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {noPlayerCount > 0 && (
                  <p className="text-[11px] text-muted-foreground text-center pt-1">{t('analysis.noPlayerEventsCount')}: {noPlayerCount}</p>
                )}
              </div>
            )}

            {/* ---- Timeline / detailed log ---- */}
            {view === 'timeline' && (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-2 py-1.5 text-start font-semibold text-muted-foreground">{t('goal.minute')}</th>
                      <th className="px-2 py-1.5 text-start font-semibold text-muted-foreground">{t('match.tagPlayer')}</th>
                      <th className="px-2 py-1.5 text-start font-semibold text-muted-foreground">{t('analysis.eventCol')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortedEvents.map((ev) => {
                      const p = players.find((pl) => pl.id === ev.playerId);
                      return (
                        <tr key={ev.id}>
                          <td className="px-2 py-1.5 font-mono text-muted-foreground" dir="ltr">{ev.minute != null ? `${ev.minute}'` : '--'}</td>
                          <td className="px-2 py-1.5 truncate max-w-[6rem]">{p ? playerName(p, lang) : t('analysis.noPlayer')}</td>
                          <td className="px-2 py-1.5">
                            <span className="inline-flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: EVENT_COLORS[ev.type] }} />
                              {eventLabel(ev)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddEventDialog({
  open, pos, players, lang, t, onCancel, onConfirm,
}: {
  open: boolean;
  pos: { x: number; y: number } | null;
  players: { id: number; name: string; nameAlt?: string | null; jerseyNumber: number }[];
  lang: string;
  t: (k: string) => string;
  onCancel: () => void;
  onConfirm: (type: TacticalEventType, subtype: string | null, customLabel: string | null, playerId: number | null, minute: number | null) => void;
}) {
  const [type, setType] = React.useState<TacticalEventType>('pass');
  const [subtype, setSubtype] = React.useState<string | null>(null);
  const [customLabel, setCustomLabel] = React.useState('');
  const [customCode, setCustomCode] = React.useState('');
  const [playerId, setPlayerId] = React.useState<string>('none');
  const [minute, setMinute] = React.useState('');

  React.useEffect(() => {
    if (open) { setType('pass'); setSubtype(null); setCustomLabel(''); setCustomCode(''); setPlayerId('none'); setMinute(''); }
  }, [open]);

  const subtypeOptions = SUBTYPES_BY_EVENT[type];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('analysis.addEvent')}
            {pos && <span className="text-xs font-normal text-muted-foreground ms-2" dir="ltr">X:{Math.round(pos.x)} Y:{Math.round(pos.y)}</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {EVENT_TYPES.map((et) => (
              <button
                key={et}
                type="button"
                onClick={() => { setType(et); setSubtype(SUBTYPES_BY_EVENT[et]?.[0] ?? null); }}
                className={`text-[11px] font-semibold py-2 rounded-lg border ${type === et ? 'text-black border-transparent' : 'border-border text-muted-foreground'}`}
                style={type === et ? { backgroundColor: EVENT_COLORS[et] } : undefined}
              >
                {t(`analysis.evt.${et}`)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setType('custom'); setSubtype(null); }}
              className={`text-[11px] font-semibold py-2 rounded-lg border ${type === 'custom' ? 'text-white border-transparent' : 'border-border text-muted-foreground'}`}
              style={type === 'custom' ? { backgroundColor: EVENT_COLORS.custom } : undefined}
            >
              {t('analysis.evt.custom')}
            </button>
          </div>

          {type === 'custom' && (
            <div className="space-y-1.5">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground mb-1">{t('analysis.customLabelField')}</p>
                <Input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder={t('analysis.customLabelPlaceholder')} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground mb-1">{t('analysis.customCodeField')}</p>
                <Input value={customCode} onChange={(e) => setCustomCode(e.target.value.slice(0, 4).toUpperCase())} placeholder={t('analysis.customCodePlaceholder')} dir="ltr" className="w-28" />
              </div>
            </div>
          )}

          {subtypeOptions && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground">{t('analysis.subtypeLabel')}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {subtypeOptions.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSubtype(st)}
                    className={`text-xs font-bold py-1.5 rounded-lg border ${subtype === st ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              {subtype && <p className="text-[10px] text-muted-foreground">{t(`analysis.sub.${type}.${subtype}`)}</p>}
            </div>
          )}

          <div className="flex gap-2">
            <Input type="number" min="0" max="130" value={minute} onChange={(e) => setMinute(e.target.value)} placeholder={t('goal.minute')} className="w-24" />
            <Select value={playerId} onValueChange={setPlayerId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder={t('match.tagPlayer')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('match.tagNoPlayer')}</SelectItem>
                {players.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.jerseyNumber} - {playerName(p, lang)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            disabled={type === 'custom' && !customLabel.trim()}
            onClick={() => onConfirm(
              type,
              type === 'custom' ? (customCode.trim() || null) : (subtypeOptions ? subtype : null),
              type === 'custom' ? customLabel.trim() : null,
              playerId !== 'none' ? Number(playerId) : null,
              minute.trim() ? parseInt(minute, 10) : null,
            )}
          >
            {t('common.add')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
