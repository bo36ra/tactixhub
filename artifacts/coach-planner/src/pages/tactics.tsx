import React, { useRef, useState } from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { useTeam } from '@/lib/team-context';
import { useListMatches } from '@workspace/api-client-react';
import {
  useTactics, useSaveTactic, useDeleteTactic,
  useOpponentNotes, useSaveOpponentNote, useDeleteOpponentNote,
  parseBoard, type BoardData, type BoardMarker, type Tactic, type TacticKind,
  type BoardFrame,
} from '@/lib/tactics-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Trash2, Undo2, Eraser, Save, Plus, ClipboardList, Play, Camera, Pencil } from 'lucide-react';

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

const emptyBoard = (): BoardData => ({
  markers: DEFAULT_MARKERS.map((m) => ({ ...m })),
  arrows: [],
  drawings: [],
  frames: [],
  notes: '',
});

function TacticBoard({
  board, setBoard, mode,
}: {
  board: BoardData;
  setBoard: (b: BoardData) => void;
  mode: 'move' | 'arrow' | 'pen' | 'erase';
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragId = useRef<string | null>(null);
  const arrowStart = useRef<{ x: number; y: number } | null>(null);
  const penPath = useRef<{ x: number; y: number }[] | null>(null);
  const [penPreview, setPenPreview] = useState<{ x: number; y: number }[]>([]);
  const [preview, setPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const toPct = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toPct(e);
    if (mode === 'erase') {
      // Delete only the tapped arrow or drawing — nearest within reach.
      const distToSeg = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
      };
      let bestKind: 'arrow' | 'drawing' | null = null;
      let bestIdx = -1;
      let bestDist = 5; // tap tolerance in pitch percent units
      board.arrows.forEach((a, i) => {
        const d = distToSeg(p.x, p.y, a.x1, a.y1, a.x2, a.y2);
        if (d < bestDist) { bestDist = d; bestKind = 'arrow'; bestIdx = i; }
      });
      (board.drawings ?? []).forEach((dr, i) => {
        for (let j = 0; j < dr.points.length - 1; j++) {
          const d = distToSeg(p.x, p.y, dr.points[j].x, dr.points[j].y, dr.points[j + 1].x, dr.points[j + 1].y);
          if (d < bestDist) { bestDist = d; bestKind = 'drawing'; bestIdx = i; }
        }
      });
      if (bestKind === 'arrow') {
        setBoard({ ...board, arrows: board.arrows.filter((_, i) => i !== bestIdx) });
      } else if (bestKind === 'drawing') {
        setBoard({ ...board, drawings: (board.drawings ?? []).filter((_, i) => i !== bestIdx) });
      }
    } else if (mode === 'pen') {
      penPath.current = [p];
      setPenPreview([p]);
    } else if (mode === 'arrow') {
      arrowStart.current = p;
      setPreview({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    } else {
      // pick the nearest marker within reach
      let best: string | null = null;
      let bestDist = 8;
      for (const m of board.markers) {
        const d = Math.hypot(m.x - p.x, (m.y - p.y) * 1.4);
        if (d < bestDist) { best = m.id; bestDist = d; }
      }
      dragId.current = best;
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
    } else if (mode === 'arrow' && arrowStart.current) {
      const p = toPct(e);
      setPreview({ x1: arrowStart.current.x, y1: arrowStart.current.y, x2: p.x, y2: p.y });
    } else if (dragId.current) {
      const p = toPct(e);
      setBoard({
        ...board,
        markers: board.markers.map((m) => (m.id === dragId.current ? { ...m, x: p.x, y: p.y } : m)),
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (mode === 'pen' && penPath.current) {
      if (penPath.current.length > 2) {
        setBoard({ ...board, drawings: [...(board.drawings ?? []), { points: penPath.current }] });
      }
      penPath.current = null;
      setPenPreview([]);
    }
    if (mode === 'arrow' && arrowStart.current) {
      const p = toPct(e);
      const a = arrowStart.current;
      if (Math.hypot(p.x - a.x, p.y - a.y) > 4) {
        setBoard({ ...board, arrows: [...board.arrows, { x1: a.x, y1: a.y, x2: p.x, y2: p.y }] });
      }
      arrowStart.current = null;
      setPreview(null);
    }
    dragId.current = null;
  };

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 140"
      className="w-full max-w-md mx-auto rounded-xl border border-border select-none"
      style={{ touchAction: 'none', background: 'linear-gradient(180deg, #1e7a3d 0%, #24923f 50%, #1e7a3d 100%)' }}
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

      {/* arrows */}
      <defs>
        <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#FFD84D" />
        </marker>
      </defs>
      {board.arrows.map((a, i) => (
        <line key={i} x1={a.x1} y1={a.y1 * 1.4} x2={a.x2} y2={a.y2 * 1.4}
          stroke="#FFD84D" strokeWidth="1.1" strokeDasharray="2 2" markerEnd="url(#arrowhead)" />
      ))}
      {preview && (
        <line x1={preview.x1} y1={preview.y1 * 1.4} x2={preview.x2} y2={preview.y2 * 1.4}
          stroke="#FFD84D" strokeWidth="1.1" strokeDasharray="2 2" opacity="0.6" markerEnd="url(#arrowhead)" />
      )}

      {/* markers */}
      {board.markers.map((m) => (
        <g key={m.id} transform={`translate(${m.x}, ${m.y * 1.4})`} style={{ cursor: 'grab' }}>
          {m.side === 'ball' ? (
            <circle r="2.2" fill="#FFFFFF" stroke="#111" strokeWidth="0.4" />
          ) : (
            <>
              <circle r="4.2" fill={m.side === 'us' ? '#FFD84D' : '#F4F1EC'}
                stroke={m.side === 'us' ? '#7a6410' : '#333'} strokeWidth="0.5" />
              <text textAnchor="middle" dy="1.6" fontSize="4"
                fontWeight="700" fill="#1a1a1a">{m.label}</text>
            </>
          )}
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- boards tab

function BoardsTab({ teamId, kind }: { teamId: number; kind: TacticKind }) {
  const { t } = useLanguage();
  const { data: tactics, isLoading } = useTactics(teamId);
  const { data: matches } = useListMatches(teamId, { query: { enabled: kind === 'match_plan' } } as any);
  const save = useSaveTactic(teamId);
  const del = useDeleteTactic(teamId);

  const [editing, setEditing] = useState<{ id?: number; name: string; matchId: number | null } | null>(null);
  const [board, setBoard] = useState<BoardData>(emptyBoard());
  // (setBoard supports functional updates natively; playback relies on it)
  const [mode, setMode] = useState<'move' | 'arrow' | 'pen' | 'erase'>('move');
  const [playing, setPlaying] = useState(false);
  const animRef = useRef<number | null>(null);

  // Capture the current player positions as an animation frame
  const addFrame = () => {
    const frame: BoardFrame = { markers: board.markers.map((m) => ({ ...m })) };
    setBoard({ ...board, frames: [...(board.frames ?? []), frame] });
  };

  const loadFrame = (i: number) => {
    const f = (board.frames ?? [])[i];
    if (f) setBoard({ ...board, markers: f.markers.map((m) => ({ ...m })) });
  };

  const removeFrame = (i: number) => {
    setBoard({ ...board, frames: (board.frames ?? []).filter((_, idx) => idx !== i) });
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
      setBoard((prev) => ({
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

  const open = (tc?: Tactic) => {
    if (tc) {
      setEditing({ id: tc.id, name: tc.name, matchId: tc.matchId });
      setBoard(parseBoard(tc.data));
    } else {
      setEditing({ name: '', matchId: null });
      setBoard(emptyBoard());
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
      { onSuccess: () => { toast({ title: t('tactics.saved') }); setEditing(null); } },
    );
  };

  if (editing) {
    return (
      <div className="space-y-3">
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

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={mode === 'move' ? 'default' : 'secondary'} onClick={() => setMode('move')}>
            {t('tactics.modeMove')}
          </Button>
          <Button size="sm" variant={mode === 'arrow' ? 'default' : 'secondary'} onClick={() => setMode('arrow')}>
            {t('tactics.modeArrow')}
          </Button>
          <Button size="sm" variant={mode === 'pen' ? 'default' : 'secondary'} onClick={() => setMode('pen')}>
            <Pencil className="w-4 h-4 me-1" />{t('tactics.modePen')}
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() =>
              mode === 'pen'
                ? setBoard({ ...board, drawings: (board.drawings ?? []).slice(0, -1) })
                : setBoard({ ...board, arrows: board.arrows.slice(0, -1) })}>
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button size="sm" variant={mode === 'erase' ? 'default' : 'secondary'} onClick={() => setMode('erase')}>
            <Eraser className="w-4 h-4 me-1" />{t('tactics.modeErase')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setBoard(emptyBoard())}>
            {t('tactics.clearAll')}
          </Button>
        </div>

        <TacticBoard board={board} setBoard={setBoard} mode={mode} />

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
          onChange={(e) => setBoard({ ...board, notes: e.target.value })} rows={3} />

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
                  ? ` · ${(matches as any[]).find((m: any) => m.id === tc.matchId)?.opponent}` : ''}
              </div>
            </button>
            <Button size="icon" variant="ghost" onClick={() => del.mutate(tc.id)}>
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
    save.mutate(form, { onSuccess: () => { toast({ title: t('tactics.saved') }); setForm(null); } });
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
              <Button size="icon" variant="ghost" onClick={() => del.mutate(n.id)}>
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

// ---------------------------------------------------------------- page

export function Tactics() {
  const { t } = useLanguage();
  const { activeTeamId } = useTeam();
  if (!activeTeamId) return <NoTeamState />;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold font-display">{t('nav.tactics')}</h1>
        </div>
        <Tabs defaultValue="board">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="board">{t('tactics.tabBoard')}</TabsTrigger>
            <TabsTrigger value="setpieces">{t('tactics.tabSetPieces')}</TabsTrigger>
            <TabsTrigger value="plans">{t('tactics.tabPlans')}</TabsTrigger>
            <TabsTrigger value="opponents">{t('tactics.tabOpponents')}</TabsTrigger>
          </TabsList>
          <TabsContent value="board"><BoardsTab teamId={activeTeamId} kind="general" /></TabsContent>
          <TabsContent value="setpieces"><BoardsTab teamId={activeTeamId} kind="set_piece" /></TabsContent>
          <TabsContent value="plans"><BoardsTab teamId={activeTeamId} kind="match_plan" /></TabsContent>
          <TabsContent value="opponents"><OpponentsTab teamId={activeTeamId} /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

export default Tactics;
