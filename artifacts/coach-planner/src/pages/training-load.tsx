import React from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { useTeam } from '@/lib/team-context';
import { useListPlayers } from '@workspace/api-client-react';
import { useRpeEntries, useBatchCreateRpeEntries, useDeleteRpeEntry, type RpeEntry } from '@/lib/dev-api';
import {
  computeSnapshot, weeklyLoadSeries, THRESHOLDS, STATUS_COLORS, sessionLoad,
} from '@/lib/rpe-calc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format, subDays } from 'date-fns';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine } from 'recharts';
import { Activity, AlertTriangle, Trash2 } from 'lucide-react';

function LogTab({ teamId }: { teamId: number }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data: players } = useListPlayers(teamId);
  const batchSave = useBatchCreateRpeEntries(teamId);

  const [date, setDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [sessionType, setSessionType] = React.useState('training');
  const [rows, setRows] = React.useState<Record<number, { duration: string; rpe: number; notes: string }>>({});

  const setRow = (playerId: number, patch: Partial<{ duration: string; rpe: number; notes: string }>) => {
    setRows((prev) => ({
      ...prev,
      [playerId]: { duration: prev[playerId]?.duration ?? '', rpe: prev[playerId]?.rpe ?? 5, notes: prev[playerId]?.notes ?? '', ...patch },
    }));
  };

  const handleSave = () => {
    const entries = Object.entries(rows)
      .filter(([, r]) => r.duration && Number(r.duration) > 0)
      .map(([playerId, r]) => ({ playerId: Number(playerId), durationMinutes: Number(r.duration), rpe: r.rpe, notes: r.notes || undefined }));
    if (entries.length === 0) return;
    batchSave.mutate(
      { date, sessionType, entries },
      {
        onSuccess: (saved) => {
          toast({ title: t('rpe.savedCount').replace('{n}', String(saved.length)) });
          setRows({});
        },
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' as any }),
      },
    );
  };

  if (!players || players.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">{t('rpe.noPlayers')}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t('rpe.date')}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t('rpe.sessionType')}</Label>
          <Select value={sessionType} onValueChange={setSessionType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="training">{t('rpe.sessionType.training')}</SelectItem>
              <SelectItem value="match">{t('rpe.sessionType.match')}</SelectItem>
              <SelectItem value="other">{t('rpe.sessionType.other')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        {players.map((p) => {
          const row = rows[p.id] ?? { duration: '', rpe: 5, notes: '' };
          const load = row.duration ? Number(row.duration) * row.rpe : null;
          return (
            <div key={p.id} className="bg-card border rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold truncate">#{p.jerseyNumber} {p.name}</span>
                {load !== null && <span className="text-xs font-mono text-primary shrink-0" dir="ltr">{load} {t('rpe.au')}</span>}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min="0" max="300" placeholder={t('rpe.duration')}
                  className="w-24 h-9 text-sm shrink-0"
                  value={row.duration}
                  onChange={(e) => setRow(p.id, { duration: e.target.value })}
                />
                <input
                  type="range" min={0} max={10} value={row.rpe}
                  onChange={(e) => setRow(p.id, { rpe: Number(e.target.value) })}
                  className="flex-1 accent-primary"
                />
                <span className="w-7 text-center text-sm font-bold text-primary shrink-0">{row.rpe}</span>
              </div>
              <Input
                placeholder={t('rpe.notesPh')}
                className="h-9 text-xs"
                value={row.notes}
                onChange={(e) => setRow(p.id, { notes: e.target.value })}
              />
            </div>
          );
        })}
      </div>

      <Button className="w-full" disabled={batchSave.isPending} onClick={handleSave}>
        {t('rpe.saveAll')}
      </Button>
    </div>
  );
}

function StatCard({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div className="bg-card border rounded-xl p-3">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-extrabold" style={color ? { color } : undefined} dir="ltr">
        {value}{unit ? ` ${unit}` : ''}
      </p>
    </div>
  );
}

function DashboardTab({ teamId }: { teamId: number }) {
  const { t } = useLanguage();
  const { data: players } = useListPlayers(teamId);
  const [playerId, setPlayerId] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!playerId && players && players.length > 0) setPlayerId(players[0].id);
  }, [players, playerId]);

  const from = format(subDays(new Date(), 70), 'yyyy-MM-dd');
  const { data: entries } = useRpeEntries(teamId, { playerId: playerId ?? undefined, from });
  const deleteEntry = useDeleteRpeEntry(teamId);

  if (!players || players.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">{t('rpe.noPlayers')}</p>;
  }

  const list = entries ?? [];
  const snapshot = computeSnapshot(list, new Date());
  const series = weeklyLoadSeries(list, new Date(), 8);
  const recent = [...list].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <div className="space-y-4">
      <Select value={playerId ? String(playerId) : undefined} onValueChange={(v) => setPlayerId(Number(v))}>
        <SelectTrigger><SelectValue placeholder={t('rpe.selectPlayer')} /></SelectTrigger>
        <SelectContent>
          {players.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>#{p.jerseyNumber} {p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ backgroundColor: STATUS_COLORS[snapshot.status] + '22' }}>
        <Activity className="w-5 h-5 shrink-0" style={{ color: STATUS_COLORS[snapshot.status] }} />
        <span className="text-sm font-bold" style={{ color: STATUS_COLORS[snapshot.status] }}>{t('rpe.status.' + snapshot.status)}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <StatCard label={t('rpe.dailyLoad')} value={String(snapshot.dailyLoad)} unit={t('rpe.au')} />
        <StatCard label={t('rpe.weeklyLoad')} value={String(snapshot.weeklyLoad)} unit={t('rpe.au')} color={snapshot.weeklyLoad > THRESHOLDS.weeklyLoad ? STATUS_COLORS.high : undefined} />
        <StatCard label={t('rpe.twoWeekLoad')} value={String(snapshot.twoWeekLoad)} unit={t('rpe.au')} color={snapshot.twoWeekLoad > THRESHOLDS.twoWeekLoad ? STATUS_COLORS.high : undefined} />
        <StatCard label={t('rpe.monotony')} value={snapshot.monotony.toFixed(2)} color={snapshot.monotony > THRESHOLDS.monotony ? STATUS_COLORS.moderate : undefined} />
        <StatCard label={t('rpe.strain')} value={String(Math.round(snapshot.strain))} unit={t('rpe.au')} color={snapshot.strain > THRESHOLDS.strain ? STATUS_COLORS.high : undefined} />
      </div>

      <div className="space-y-2">
        {snapshot.alerts.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('rpe.noAlerts')}</p>
        ) : (
          snapshot.alerts.map((a) => (
            <div key={a.key} className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-xs text-red-300">{t('rpe.alert.' + a.key)}</span>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold">{t('rpe.last8Weeks')}</h3>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#332F27" vertical={false} />
              <XAxis dataKey="weekStart" tick={{ fontSize: 10, fill: '#9C9483' }} tickFormatter={(v) => format(new Date(v), 'MM/dd')} />
              <YAxis tick={{ fontSize: 10, fill: '#9C9483' }} />
              <Tooltip contentStyle={{ background: '#221F1A', border: '1px solid #332F27', fontSize: 12 }} />
              <Bar dataKey="load" radius={[4, 4, 0, 0]}>
                {series.map((s, i) => (
                  <Cell key={i} fill={s.load > THRESHOLDS.weeklyLoad ? STATUS_COLORS.high : '#E8B64C'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold">{t('rpe.recentLog')}</h3>
        {recent.length === 0 && <p className="text-xs text-muted-foreground">{t('rpe.noEntries')}</p>}
        {recent.map((e: RpeEntry) => (
          <div key={e.id} className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" dir="ltr">{e.date} · {t('rpe.sessionType.' + e.sessionType)}</p>
              <p className="text-xs text-muted-foreground" dir="ltr">{e.durationMinutes}min x RPE{e.rpe} = {sessionLoad(e)} {t('rpe.au')}</p>
              {e.notes && <p className="text-xs text-muted-foreground mt-0.5">{e.notes}</p>}
            </div>
            <button type="button" className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => deleteEntry.mutate(e.id)}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SquadTab({ teamId }: { teamId: number }) {
  const { t } = useLanguage();
  const { data: players } = useListPlayers(teamId);
  const from = format(subDays(new Date(), 70), 'yyyy-MM-dd');
  const { data: allEntries } = useRpeEntries(teamId, { from });

  const rows = React.useMemo(() => {
    if (!players) return [];
    const byPlayer = new Map<number, RpeEntry[]>();
    for (const e of allEntries ?? []) {
      if (!byPlayer.has(e.playerId)) byPlayer.set(e.playerId, []);
      byPlayer.get(e.playerId)!.push(e);
    }
    return players
      .map((p) => {
        const snapshot = computeSnapshot(byPlayer.get(p.id) ?? [], new Date());
        return { player: p, snapshot };
      })
      .sort((a, b) => b.snapshot.weeklyLoad - a.snapshot.weeklyLoad);
  }, [players, allEntries]);

  if (!players || players.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">{t('rpe.noPlayers')}</p>;
  }

  const summary = {
    low: rows.filter((r) => r.snapshot.status === 'low').length,
    moderate: rows.filter((r) => r.snapshot.status === 'moderate').length,
    high: rows.filter((r) => r.snapshot.status === 'high').length,
    very_high: rows.filter((r) => r.snapshot.status === 'very_high').length,
  };
  const hasAnyData = rows.some((r) => r.snapshot.weeklyLoad > 0);
  const chartData = rows.map((r) => ({
    name: `#${r.player.jerseyNumber}`,
    load: r.snapshot.weeklyLoad,
    status: r.snapshot.status,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {(['low', 'moderate', 'high', 'very_high'] as const).map((s) => (
          <div key={s} className="rounded-xl p-2.5 text-center" style={{ backgroundColor: STATUS_COLORS[s] + '1a' }}>
            <p className="text-xl font-extrabold" style={{ color: STATUS_COLORS[s] }}>{summary[s]}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{t(`rpe.summary${s === 'low' ? 'Low' : s === 'moderate' ? 'Moderate' : s === 'high' ? 'High' : 'VeryHigh'}`)}</p>
          </div>
        ))}
      </div>

      {!hasAnyData ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t('rpe.noData')}</p>
      ) : (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-bold">{t('rpe.tabSquad')}</h3>
            <p className="text-xs text-muted-foreground">{t('rpe.squadSortedByLoad')}</p>
            <div className="space-y-1.5">
              {rows.map(({ player, snapshot }) => (
                <div key={player.id} className="flex items-center gap-3 bg-card border rounded-lg px-3 py-2.5" style={{ borderInlineStartColor: STATUS_COLORS[snapshot.status], borderInlineStartWidth: 4 }}>
                  <span className="text-sm font-semibold flex-1 min-w-0 truncate">#{player.jerseyNumber} {player.name}</span>
                  {snapshot.alerts.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[snapshot.status] + '22', color: STATUS_COLORS[snapshot.status] }}>
                      {t('rpe.alertsCount').replace('{n}', String(snapshot.alerts.length))}
                    </span>
                  )}
                  <span className="text-sm font-mono font-bold shrink-0" dir="ltr" style={{ color: STATUS_COLORS[snapshot.status] }}>{snapshot.weeklyLoad} {t('rpe.au')}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold">{t('rpe.comparisonChart')}</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#332F27" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9C9483' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#9C9483' }} />
                  <Tooltip contentStyle={{ background: '#221F1A', border: '1px solid #332F27', fontSize: 12 }} />
                  <ReferenceLine y={THRESHOLDS.weeklyLoad} stroke="#D96B5B" strokeDasharray="4 4" />
                  <Bar dataKey="load" radius={[4, 4, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={STATUS_COLORS[d.status as keyof typeof STATUS_COLORS]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function TrainingLoadPage() {
  const { t } = useLanguage();
  const { activeTeamId } = useTeam();
  if (!activeTeamId) return <NoTeamState />;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold font-display">{t('rpe.title')}</h1>
        </div>
        <Tabs defaultValue="log">
          <TabsList>
            <TabsTrigger value="log">{t('rpe.tabLog')}</TabsTrigger>
            <TabsTrigger value="squad">{t('rpe.tabSquad')}</TabsTrigger>
            <TabsTrigger value="dashboard">{t('rpe.tabDashboard')}</TabsTrigger>
          </TabsList>
          <TabsContent value="log"><LogTab teamId={activeTeamId} /></TabsContent>
          <TabsContent value="squad"><SquadTab teamId={activeTeamId} /></TabsContent>
          <TabsContent value="dashboard"><DashboardTab teamId={activeTeamId} /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

export default TrainingLoadPage;
