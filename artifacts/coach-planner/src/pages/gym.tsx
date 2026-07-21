import React from 'react';
import { AppLayout } from '@/components/layout';
import { ProPage } from '@/lib/feature-gate';
import { StickyHeader, PageTitle } from '@/components/page-header';
import { FeatureHint } from '@/components/feature-hint';
import { useLanguage } from '@/lib/i18n';
import { useTeam } from '@/lib/team-context';
import { useListPlayers, getListPlayersQueryKey } from '@workspace/api-client-react';
import {
  useBodyWeightEntries, useBatchUpsertBodyWeight,
  useOneRepMaxEntries, useBatchCreateOneRepMax, useDeleteOneRepMax,
} from '@/lib/dev-api';
import { playerName } from '@/lib/player-name';
import { PlayerAvatar } from '@/components/player-avatar';
import { useNameFilter, NameFilterInput } from '@/components/name-filter';
import { JerseyNumber } from '@/components/jersey-number';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Dumbbell, Weight, Trash2, Plus, ClipboardList, Calculator } from 'lucide-react';
import { format } from 'date-fns';
import { useWeightUnit, type WeightUnit } from '@/lib/weight-unit';

const LIFTS = ['back_squat', 'front_squat', 'bench_press', 'deadlift', 'overhead_press', 'power_clean'] as const;

interface UnitProps {
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
  toKg: (displayValue: number) => number;
}

function BodyWeightTab({ teamId, unit, toDisplay, toKg }: { teamId: number } & UnitProps) {
  const { t, lang, isRtl } = useLanguage();
  const { toast } = useToast();
  const { data: players, isLoading: playersLoading } = useListPlayers(teamId, {
    query: { enabled: !!teamId, queryKey: getListPlayersQueryKey(teamId) },
  });
  const { query: nameQuery, setQuery: setNameQuery, filtered: visiblePlayers } = useNameFilter(players);
  const [date, setDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const { data: entries } = useBodyWeightEntries(teamId, { from: date, to: date });
  const batchSave = useBatchUpsertBodyWeight(teamId);
  const [rows, setRows] = React.useState<Record<number, string>>({});

  // Prefill from whatever's already saved for this date, same "editing
  // a saved day loads the saved values" fix applied to attendance.
  React.useEffect(() => {
    const initial: Record<number, string> = {};
    (entries ?? []).forEach((e) => { initial[e.playerId] = String(toDisplay(e.weightKg)); });
    setRows(initial);
  }, [entries, unit]);

  const handleSave = () => {
    const parsed = Object.entries(rows)
      .map(([playerId, v]) => ({ playerId: Number(playerId), weightKg: toKg(parseFloat(v)) }))
      .filter((e) => Number.isFinite(e.weightKg) && e.weightKg > 0);
    if (parsed.length === 0) return;
    batchSave.mutate(
      { date, entries: parsed },
      {
        onSuccess: (saved) => toast({ title: t('rpe.savedCount').replace('{n}', String(saved.length)) }),
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' as any }),
      },
    );
  };

  if (!players || players.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">{t('rpe.noPlayers')}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">{t('rpe.date')}</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <NameFilterInput value={nameQuery} onChange={setNameQuery} />
      {playersLoading && [1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}

      <div className="space-y-2">
        {visiblePlayers.map((p) => (
          <div key={p.id} className="bg-card border rounded-xl p-3 flex items-center gap-3">
            <span className="text-sm font-medium truncate flex-1 min-w-0 flex items-center gap-1.5">
              <PlayerAvatar photo={p.photo} jerseyNumber={p.jerseyNumber} className="w-8 h-8 text-xs" />
              <span className="truncate">{playerName(p, lang)}</span>
            </span>
            <div className="relative w-28 shrink-0">
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="—"
                value={rows[p.id] ?? ''}
                onChange={(e) => setRows((prev) => ({ ...prev, [p.id]: e.target.value }))}
                className="pe-9 text-center"
              />
              <span className="absolute top-1/2 -translate-y-1/2 end-3 text-xs text-muted-foreground pointer-events-none">{unit}</span>
            </div>
          </div>
        ))}
      </div>

      <Button className="w-full" onClick={handleSave} disabled={batchSave.isPending}>
        {t('common.save')}
      </Button>
    </div>
  );
}

function OneRepMaxTab({ teamId, unit, toDisplay, toKg }: { teamId: number } & UnitProps) {
  const { t, lang, isRtl } = useLanguage();
  const { toast } = useToast();
  const { data: players, isLoading: playersLoading } = useListPlayers(teamId, {
    query: { enabled: !!teamId, queryKey: getListPlayersQueryKey(teamId) },
  });
  const { query: nameQuery, setQuery: setNameQuery, filtered: visiblePlayers } = useNameFilter(players);

  const [lift, setLift] = React.useState<string>('back_squat');
  const [customLift, setCustomLift] = React.useState('');
  const [date, setDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const resolvedLift = lift === '__custom__' ? customLift.trim() : lift;

  // All entries for this lift — used both to prefill the batch form for
  // the selected date, and to compute each player's most recent max for
  // the "current maxes" list below.
  const { data: liftEntries } = useOneRepMaxEntries(teamId, resolvedLift ? { lift: resolvedLift } : undefined);
  const batchSave = useBatchCreateOneRepMax(teamId);
  const del = useDeleteOneRepMax(teamId);
  const [rows, setRows] = React.useState<Record<number, { weight: string; reps: string }>>({});

  // Same "editing a saved day loads the saved values" fix as attendance
  // and body weight — re-opening a lift+date that already has entries
  // prefills instead of starting blank.
  React.useEffect(() => {
    const initial: Record<number, { weight: string; reps: string }> = {};
    (liftEntries ?? []).filter((e) => e.date === date).forEach((e) => {
      initial[e.playerId] = { weight: String(toDisplay(e.weightKg)), reps: String(e.reps) };
    });
    setRows(initial);
  }, [liftEntries, date, unit]);

  const handleSave = () => {
    if (!resolvedLift) {
      toast({ title: t('train.required'), variant: 'destructive' as any });
      return;
    }
    const entries = Object.entries(rows)
      .map(([playerId, r]) => ({ playerId: Number(playerId), weightKg: toKg(parseFloat(r.weight)), reps: parseInt(r.reps) || 1 }))
      .filter((e) => Number.isFinite(e.weightKg) && e.weightKg > 0);
    if (entries.length === 0) return;
    batchSave.mutate(
      { lift: resolvedLift, date, entries },
      {
        onSuccess: (saved) => toast({ title: t('rpe.savedCount').replace('{n}', String(saved.length)) }),
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' as any }),
      },
    );
  };

  const liftLabel = (l: string) => ((LIFTS as readonly string[]).includes(l) ? t(`gym.lift.${l}`) : l);

  // Epley formula — the standard estimate for translating a submaximal
  // set (weight x reps > 1) into an equivalent true 1RM. A set of 1
  // already *is* the max, no estimation needed.
  const estimatedOneRm = (weightKg: number, reps: number) => (reps <= 1 ? weightKg : weightKg * (1 + reps / 30));

  // Each player's most recent max for the selected lift (latest date
  // wins) — the reference list a coach checks while programming.
  const currentMaxes = React.useMemo(() => {
    if (!players || !liftEntries) return [];
    const latestByPlayer = new Map<number, (typeof liftEntries)[number]>();
    for (const e of liftEntries) {
      const existing = latestByPlayer.get(e.playerId);
      if (!existing || e.date > existing.date) latestByPlayer.set(e.playerId, e);
    }
    return players.filter((p) => latestByPlayer.has(p.id)).map((p) => ({ player: p, entry: latestByPlayer.get(p.id)! }));
  }, [players, liftEntries]);

  const [expandedPlayer, setExpandedPlayer] = React.useState<number | null>(null);
  const PERCENTAGES = [50, 60, 70, 75, 80, 85, 90, 95, 100];

  if (!players || players.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">{t('rpe.noPlayers')}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2 sm:col-span-1">
          <Label className="text-xs">{t('gym.lift')}</Label>
          <Select value={lift} onValueChange={setLift}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LIFTS.map((l) => <SelectItem key={l} value={l}>{t(`gym.lift.${l}`)}</SelectItem>)}
              <SelectItem value="__custom__">{t('train.focus.custom')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 col-span-2 sm:col-span-1">
          <Label className="text-xs">{t('rpe.date')}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {lift === '__custom__' && (
          <div className="space-y-1.5 col-span-2">
            <Input placeholder={t('gym.customLiftPh')} value={customLift} onChange={(e) => setCustomLift(e.target.value)} />
          </div>
        )}
      </div>

      <NameFilterInput value={nameQuery} onChange={setNameQuery} />
      {playersLoading && [1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}

      <div className="space-y-2">
        {visiblePlayers.map((p) => (
          <div key={p.id} className="bg-card border rounded-xl p-3 flex items-center gap-2">
            <span className="text-sm font-medium truncate flex-1 min-w-0 flex items-center gap-1.5">
              <PlayerAvatar photo={p.photo} jerseyNumber={p.jerseyNumber} className="w-8 h-8 text-xs" />
              <span className="truncate">{playerName(p, lang)}</span>
            </span>
            <div className="relative w-24 shrink-0">
              <Input
                type="number"
                inputMode="decimal"
                step="0.5"
                placeholder="—"
                value={rows[p.id]?.weight ?? ''}
                onChange={(e) => setRows((prev) => ({ ...prev, [p.id]: { weight: e.target.value, reps: prev[p.id]?.reps ?? '1' } }))}
                className="pe-8 text-center"
              />
              <span className="absolute top-1/2 -translate-y-1/2 end-2 text-[10px] text-muted-foreground pointer-events-none">{unit}</span>
            </div>
            <div className="relative w-16 shrink-0">
              <Input
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                placeholder="1"
                value={rows[p.id]?.reps ?? ''}
                onChange={(e) => setRows((prev) => ({ ...prev, [p.id]: { weight: prev[p.id]?.weight ?? '', reps: e.target.value } }))}
                className="pe-6 text-center"
              />
              <span className="absolute top-1/2 -translate-y-1/2 end-1.5 text-[10px] text-muted-foreground pointer-events-none">{t('gym.repsShort')}</span>
            </div>
          </div>
        ))}
      </div>

      <Button className="w-full" onClick={handleSave} disabled={batchSave.isPending || !resolvedLift}>
        {t('common.save')}
      </Button>

      {currentMaxes.length > 0 && (
        <div className="space-y-1.5 pt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t('gym.currentMaxes')} — {liftLabel(resolvedLift)}
          </p>
          <p className="text-[11px] text-muted-foreground">{t('gym.tapForPercentages')}</p>
          <div className="divide-y divide-border/50 bg-card border rounded-xl overflow-hidden">
            {currentMaxes.map(({ player, entry }) => {
              const est1rmKg = estimatedOneRm(entry.weightKg, entry.reps);
              const est1rm = toDisplay(est1rmKg);
              const displayWeight = toDisplay(entry.weightKg);
              return (
              <div key={player.id}>
                <div className="flex items-center gap-2 px-1">
                  <button
                    type="button"
                    onClick={() => setExpandedPlayer(expandedPlayer === player.id ? null : player.id)}
                    className="flex-1 flex items-center justify-between gap-3 px-2 py-2.5 min-w-0"
                  >
                    <span className="text-sm font-medium truncate flex items-center gap-1.5">
                      <PlayerAvatar photo={player.photo} jerseyNumber={player.jerseyNumber} className="w-7 h-7 text-[11px]" />
                      <span className="truncate">{playerName(player, lang)}</span>
                    </span>
                    <span className="text-end shrink-0" dir="ltr">
                      <span className="font-bold text-sm">{displayWeight}{unit}{entry.reps > 1 ? ` × ${entry.reps}` : ''}</span>
                      {entry.reps > 1 && <span className="block text-[10px] text-muted-foreground">{t('gym.estOneRm')}: {est1rm}{unit}</span>}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => del.mutate(entry.id)}
                    className="text-destructive/60 hover:text-destructive active:text-destructive p-2 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {expandedPlayer === player.id && (
                  <div className="px-3 pb-3 space-y-2">
                    <div className="grid grid-cols-3 gap-1.5">
                      {PERCENTAGES.map((pct) => (
                        <div key={pct} className={`rounded-lg px-2 py-1.5 text-center ${pct === 100 ? 'bg-primary/10' : 'bg-white/[0.03]'}`}>
                          <p className="text-[10px] text-muted-foreground">{pct}%</p>
                          <p className="text-sm font-bold" dir="ltr">{Math.round(((est1rm * pct) / 100) * 10) / 10}</p>
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const playerHistory = (liftEntries ?? [])
                        .filter((e) => e.playerId === player.id)
                        .sort((a, b) => b.date.localeCompare(a.date));
                      if (playerHistory.length <= 1) return null;
                      return (
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t('gym.progression')}</p>
                          <div className="flex flex-wrap gap-1.5" dir="ltr">
                            {playerHistory.map((h) => (
                              <span key={h.id} className="text-[11px] bg-white/[0.03] rounded-md px-2 py-1">
                                {h.date}: <span className="font-bold">{toDisplay(h.weightKg)}{unit}{h.reps > 1 ? `×${h.reps}` : ''}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// A per-player, per-day training log — several exercises in one
// session (unlike the 1RM tab, which is one lift for the whole squad
// at once). Reuses the exact same one-rep-max-entries data and batch
// endpoint (one entry at a time here), just a different lens on it:
// pick a player + date, see what's already logged for that day as a
// running reference, and append more exercises to it whenever.
function TrainingLogTab({ teamId, unit, toKg, toDisplay }: { teamId: number } & UnitProps) {
  const { t, lang, isRtl } = useLanguage();
  const { toast } = useToast();
  const { data: players } = useListPlayers(teamId, {
    query: { enabled: !!teamId, queryKey: getListPlayersQueryKey(teamId) },
  });
  const [playerId, setPlayerId] = React.useState<string>('');
  const [date, setDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: playerEntries } = useOneRepMaxEntries(teamId, playerId ? { playerId: Number(playerId) } : undefined);
  const dayEntries = React.useMemo(
    () => (playerEntries ?? []).filter((e) => e.date === date),
    [playerEntries, date],
  );

  const addExercise = useBatchCreateOneRepMax(teamId);
  const del = useDeleteOneRepMax(teamId);

  const [newLift, setNewLift] = React.useState('back_squat');
  const [newCustomLift, setNewCustomLift] = React.useState('');
  const [newWeight, setNewWeight] = React.useState('');
  const [newReps, setNewReps] = React.useState('1');
  const resolvedNewLift = newLift === '__custom__' ? newCustomLift.trim() : newLift;

  const liftLabel = (l: string) => ((LIFTS as readonly string[]).includes(l) ? t(`gym.lift.${l}`) : l);

  const handleAdd = () => {
    const w = parseFloat(newWeight);
    if (!playerId || !resolvedNewLift || !Number.isFinite(w) || w <= 0) {
      toast({ title: t('train.required'), variant: 'destructive' as any });
      return;
    }
    addExercise.mutate(
      { lift: resolvedNewLift, date, entries: [{ playerId: Number(playerId), weightKg: toKg(w), reps: parseInt(newReps) || 1 }] },
      {
        onSuccess: () => {
          toast({ title: t('tactics.saved') });
          setNewWeight('');
          setNewReps('1');
        },
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' as any }),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2 sm:col-span-1">
          <Label className="text-xs">{t('common.name')}</Label>
          <Select value={playerId} onValueChange={setPlayerId}>
            <SelectTrigger><SelectValue placeholder={t('reports.allTeam')} /></SelectTrigger>
            <SelectContent>
              {players?.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}><JerseyNumber n={p.jerseyNumber} className="font-mono text-xs text-muted-foreground" /> {playerName(p, lang)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 col-span-2 sm:col-span-1">
          <Label className="text-xs">{t('rpe.date')}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {!playerId ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t('gym.pickPlayerHint')}</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('gym.todaysLog')}</p>
            {dayEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6 bg-card border rounded-xl">{t('gym.noExercisesYet')}</p>
            ) : (
              <div className="divide-y divide-border/50 bg-card border rounded-xl overflow-hidden">
                {dayEntries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="text-sm font-medium truncate">{liftLabel(e.lift)}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-sm" dir="ltr">{toDisplay(e.weightKg)}{unit}{e.reps > 1 ? ` × ${e.reps}` : ''}</span>
                      <button
                        type="button"
                        onClick={() => del.mutate(e.id)}
                        className="text-destructive/60 hover:text-destructive active:text-destructive p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border rounded-xl p-3 space-y-2.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('gym.addExercise')}</p>
            <Select value={newLift} onValueChange={setNewLift}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LIFTS.map((l) => <SelectItem key={l} value={l}>{t(`gym.lift.${l}`)}</SelectItem>)}
                <SelectItem value="__custom__">{t('train.focus.custom')}</SelectItem>
              </SelectContent>
            </Select>
            {newLift === '__custom__' && (
              <Input placeholder={t('gym.customLiftPh')} value={newCustomLift} onChange={(e) => setNewCustomLift(e.target.value)} />
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Input
                  type="number" inputMode="decimal" step="0.5" placeholder="80"
                  value={newWeight} onChange={(e) => setNewWeight(e.target.value)} className="pe-9"
                />
                <span className="absolute top-1/2 -translate-y-1/2 end-3 text-xs text-muted-foreground pointer-events-none">{unit}</span>
              </div>
              <Input type="number" inputMode="numeric" min="1" placeholder={t('gym.reps')} value={newReps} onChange={(e) => setNewReps(e.target.value)} />
            </div>
            <Button className="w-full gap-1.5" onClick={handleAdd} disabled={addExercise.isPending}>
              <Plus className="w-4 h-4" /> {t('gym.addExercise')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// Standalone calculator — no player, no save, just the math. Shows
// both common formulas side by side so a coach can compare them
// instead of trusting one blindly: Epley (simple, stays sane at any
// rep count) and Brzycki (slightly more precise under ~10 reps, but
// breaks down — can go negative — as reps approach 37, so it's capped
// off past that range rather than shown as a nonsense number).
function CalculatorTab({ unit }: { unit: WeightUnit }) {
  const { t } = useLanguage();
  const [weight, setWeight] = React.useState('');
  const [reps, setReps] = React.useState('1');

  const w = parseFloat(weight);
  const r = parseInt(reps) || 1;
  const valid = Number.isFinite(w) && w > 0 && r >= 1;

  const epley = valid ? w * (1 + r / 30) : null;
  const brzycki = valid && r < 37 ? w * (36 / (37 - r)) : null;
  // Lombardi: a power curve rather than a linear/rational one — tends
  // to sit below Epley at higher rep counts, another data point rather
  // than a tie-breaker between the two.
  const lombardi = valid ? w * Math.pow(r, 0.1) : null;

  const PERCENTAGES = [50, 60, 70, 75, 80, 85, 90, 95, 100];

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-xl p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <Label className="text-xs">{t('gym.weight')} ({unit})</Label>
            <Input type="number" inputMode="decimal" step="0.5" placeholder="100" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t('gym.reps')}</Label>
            <Input type="number" inputMode="numeric" min="1" placeholder="5" value={reps} onChange={(e) => setReps(e.target.value)} />
          </div>
        </div>
      </div>

      {!valid ? (
        <p className="text-sm text-muted-foreground text-center py-6">{t('gym.calcHint')}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-card border rounded-xl p-2.5 text-center space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Epley</p>
              <p className="text-lg font-bold" dir="ltr">{Math.round(epley! * 10) / 10}{unit}</p>
            </div>
            <div className="bg-card border rounded-xl p-2.5 text-center space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Brzycki</p>
              <p className="text-lg font-bold" dir="ltr">{brzycki !== null ? `${Math.round(brzycki * 10) / 10}${unit}` : '—'}</p>
            </div>
            <div className="bg-card border rounded-xl p-2.5 text-center space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Lombardi</p>
              <p className="text-lg font-bold" dir="ltr">{Math.round(lombardi! * 10) / 10}{unit}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('gym.percentTable')} (Epley)</p>
            <div className="grid grid-cols-3 gap-1.5">
              {PERCENTAGES.map((pct) => (
                <div key={pct} className={`rounded-lg px-2 py-1.5 text-center ${pct === 100 ? 'bg-primary/10' : 'bg-white/[0.03]'}`}>
                  <p className="text-[10px] text-muted-foreground">{pct}%</p>
                  <p className="text-sm font-bold" dir="ltr">{Math.round(((epley! * pct) / 100) * 10) / 10}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Gym() {
  const { t } = useLanguage();
  const { activeTeamId } = useTeam();
  const { unit, setUnit, toDisplay, toKg } = useWeightUnit();
  if (!activeTeamId) return null;

  return (
    <ProPage>
      <AppLayout>
        <div className="space-y-4">
          <StickyHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Dumbbell className="w-6 h-6 text-primary" />
                <PageTitle>{t('gym.title')}</PageTitle>
              </div>
              <div className="flex rounded-lg border border-border/60 overflow-hidden shrink-0">
                {(['kg', 'lb'] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={`px-2.5 py-1 text-xs font-semibold uppercase transition-colors ${
                      unit === u ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/[0.04]'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </StickyHeader>

          <FeatureHint id="gym" title={t('gym.hintTitle')} body={t('gym.hintBody')} />

          <Tabs defaultValue="weight">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="weight" className="gap-1.5"><Weight className="w-3.5 h-3.5" />{t('gym.tabWeight')}</TabsTrigger>
              <TabsTrigger value="orm" className="gap-1.5"><Dumbbell className="w-3.5 h-3.5" />{t('gym.tabOrm')}</TabsTrigger>
              <TabsTrigger value="log" className="gap-1.5"><ClipboardList className="w-3.5 h-3.5" />{t('gym.tabLog')}</TabsTrigger>
              <TabsTrigger value="calc" className="gap-1.5"><Calculator className="w-3.5 h-3.5" />{t('gym.tabCalc')}</TabsTrigger>
            </TabsList>
            <TabsContent value="weight"><BodyWeightTab teamId={activeTeamId} unit={unit} toDisplay={toDisplay} toKg={toKg} /></TabsContent>
            <TabsContent value="orm"><OneRepMaxTab teamId={activeTeamId} unit={unit} toDisplay={toDisplay} toKg={toKg} /></TabsContent>
            <TabsContent value="log"><TrainingLogTab teamId={activeTeamId} unit={unit} toDisplay={toDisplay} toKg={toKg} /></TabsContent>
            <TabsContent value="calc"><CalculatorTab unit={unit} /></TabsContent>
          </Tabs>
        </div>
      </AppLayout>
    </ProPage>
  );
}
