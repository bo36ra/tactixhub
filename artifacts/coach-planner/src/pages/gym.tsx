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
import { useNameFilter, NameFilterInput } from '@/components/name-filter';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Dumbbell, Weight, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

const LIFTS = ['back_squat', 'front_squat', 'bench_press', 'deadlift', 'overhead_press', 'power_clean'] as const;

function BodyWeightTab({ teamId }: { teamId: number }) {
  const { t, lang } = useLanguage();
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
    (entries ?? []).forEach((e) => { initial[e.playerId] = String(e.weightKg); });
    setRows(initial);
  }, [entries]);

  const handleSave = () => {
    const parsed = Object.entries(rows)
      .map(([playerId, v]) => ({ playerId: Number(playerId), weightKg: parseFloat(v) }))
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
            <span className="text-sm font-medium truncate flex-1 min-w-0">#{p.jerseyNumber} {playerName(p, lang)}</span>
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
              <span className="absolute top-1/2 -translate-y-1/2 end-3 text-xs text-muted-foreground pointer-events-none">{t('gym.kg')}</span>
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

function OneRepMaxTab({ teamId }: { teamId: number }) {
  const { t, lang } = useLanguage();
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
  const [rows, setRows] = React.useState<Record<number, string>>({});

  // Same "editing a saved day loads the saved values" fix as attendance
  // and body weight — re-opening a lift+date that already has entries
  // prefills instead of starting blank.
  React.useEffect(() => {
    const initial: Record<number, string> = {};
    (liftEntries ?? []).filter((e) => e.date === date).forEach((e) => { initial[e.playerId] = String(e.weightKg); });
    setRows(initial);
  }, [liftEntries, date]);

  const handleSave = () => {
    if (!resolvedLift) {
      toast({ title: t('train.required'), variant: 'destructive' as any });
      return;
    }
    const entries = Object.entries(rows)
      .map(([playerId, v]) => ({ playerId: Number(playerId), weightKg: parseFloat(v) }))
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
          <div key={p.id} className="bg-card border rounded-xl p-3 flex items-center gap-3">
            <span className="text-sm font-medium truncate flex-1 min-w-0">#{p.jerseyNumber} {playerName(p, lang)}</span>
            <div className="relative w-28 shrink-0">
              <Input
                type="number"
                inputMode="decimal"
                step="0.5"
                placeholder="—"
                value={rows[p.id] ?? ''}
                onChange={(e) => setRows((prev) => ({ ...prev, [p.id]: e.target.value }))}
                className="pe-9 text-center"
              />
              <span className="absolute top-1/2 -translate-y-1/2 end-3 text-xs text-muted-foreground pointer-events-none">{t('gym.kg')}</span>
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
            {currentMaxes.map(({ player, entry }) => (
              <div key={player.id}>
                <div className="flex items-center gap-2 px-1">
                  <button
                    type="button"
                    onClick={() => setExpandedPlayer(expandedPlayer === player.id ? null : player.id)}
                    className="flex-1 flex items-center justify-between gap-3 px-2 py-2.5 min-w-0"
                  >
                    <span className="text-sm font-medium truncate">#{player.jerseyNumber} {playerName(player, lang)}</span>
                    <span className="font-bold text-sm shrink-0" dir="ltr">{entry.weightKg} {t('gym.kg')}</span>
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
                          <p className="text-sm font-bold" dir="ltr">{Math.round(((entry.weightKg * pct) / 100) * 10) / 10}</p>
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
                                {h.date}: <span className="font-bold">{h.weightKg}{t('gym.kg')}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Gym() {
  const { t } = useLanguage();
  const { activeTeamId } = useTeam();
  if (!activeTeamId) return null;

  return (
    <ProPage>
      <AppLayout>
        <div className="space-y-4">
          <StickyHeader>
            <div className="flex items-center gap-2">
              <Dumbbell className="w-6 h-6 text-primary" />
              <PageTitle>{t('gym.title')}</PageTitle>
            </div>
          </StickyHeader>

          <FeatureHint id="gym" title={t('gym.hintTitle')} body={t('gym.hintBody')} />

          <Tabs defaultValue="weight">
            <TabsList>
              <TabsTrigger value="weight" className="gap-1.5"><Weight className="w-3.5 h-3.5" />{t('gym.tabWeight')}</TabsTrigger>
              <TabsTrigger value="orm" className="gap-1.5"><Dumbbell className="w-3.5 h-3.5" />{t('gym.tabOrm')}</TabsTrigger>
            </TabsList>
            <TabsContent value="weight"><BodyWeightTab teamId={activeTeamId} /></TabsContent>
            <TabsContent value="orm"><OneRepMaxTab teamId={activeTeamId} /></TabsContent>
          </Tabs>
        </div>
      </AppLayout>
    </ProPage>
  );
}
