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
  useOneRepMaxEntries, useCreateOneRepMax, useDeleteOneRepMax,
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
  const { t, lang, isRtl } = useLanguage();
  const { toast } = useToast();
  const { data: players } = useListPlayers(teamId, {
    query: { enabled: !!teamId, queryKey: getListPlayersQueryKey(teamId) },
  });
  const [playerId, setPlayerId] = React.useState<string>('');
  const [lift, setLift] = React.useState<string>('back_squat');
  const [customLift, setCustomLift] = React.useState('');
  const [weight, setWeight] = React.useState('');
  const [date, setDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));

  const resolvedLift = lift === '__custom__' ? customLift.trim() : lift;
  const { data: history } = useOneRepMaxEntries(teamId, playerId ? { playerId: Number(playerId) } : undefined);
  const create = useCreateOneRepMax(teamId);
  const del = useDeleteOneRepMax(teamId);

  const handleSave = () => {
    const w = parseFloat(weight);
    if (!playerId || !resolvedLift || !Number.isFinite(w) || w <= 0) {
      toast({ title: t('train.required'), variant: 'destructive' as any });
      return;
    }
    create.mutate(
      { playerId: Number(playerId), lift: resolvedLift, date, weightKg: w },
      {
        onSuccess: () => {
          toast({ title: t('tactics.saved') });
          setWeight('');
        },
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' as any }),
      },
    );
  };

  const liftLabel = (l: string) => ((LIFTS as readonly string[]).includes(l) ? t(`gym.lift.${l}`) : l);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2 sm:col-span-1">
          <Label className="text-xs">{t('common.name')}</Label>
          <Select value={playerId} onValueChange={setPlayerId}>
            <SelectTrigger><SelectValue placeholder={t('reports.allTeam')} /></SelectTrigger>
            <SelectContent>
              {players?.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>#{p.jerseyNumber} {playerName(p, lang)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
        {lift === '__custom__' && (
          <div className="space-y-1.5 col-span-2">
            <Input placeholder={t('gym.customLiftPh')} value={customLift} onChange={(e) => setCustomLift(e.target.value)} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">{t('gym.weightKg')}</Label>
          <Input type="number" inputMode="decimal" step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t('rpe.date')}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <Button className="w-full" onClick={handleSave} disabled={create.isPending}>
        {t('common.save')}
      </Button>

      {playerId && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">{t('gym.history')}</p>
          {(!history || history.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t('gym.noHistory')}</p>
          ) : (
            <div className="divide-y divide-border/50 bg-card border rounded-xl overflow-hidden">
              {[...history].reverse().map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{liftLabel(h.lift)}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{h.date}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-sm" dir="ltr">{h.weightKg} {t('gym.kg')}</span>
                    <button
                      type="button"
                      onClick={() => del.mutate(h.id)}
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
