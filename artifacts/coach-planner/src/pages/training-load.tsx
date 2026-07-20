import React from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { FeatureHint } from '@/components/feature-hint';
import { TermHelp } from '@/components/term-help';
import { useNameFilter, NameFilterInput } from '@/components/name-filter';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n';
import { playerName } from '@/lib/player-name';
import { PlayerAvatar } from '@/components/player-avatar';
import { JerseyNumber } from '@/components/jersey-number';
import { useTeam } from '@/lib/team-context';
import { useListPlayers } from '@workspace/api-client-react';
import { useRpeEntries, useBatchCreateRpeEntries, useDeleteRpeEntry, useWellnessEntries, useBatchUpsertWellness, useTrainings, type RpeEntry } from '@/lib/dev-api';
import {
  computeSnapshot, weeklyLoadSeries, monotonyStrainSeries, THRESHOLDS, STATUS_COLORS, sessionLoad,
  wellnessScore, readinessScore, ACWR_SWEET_SPOT, ACWR_DANGER, forecastNextWeek,
} from '@/lib/rpe-calc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format, subDays } from 'date-fns';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine, LineChart, Line, Legend } from 'recharts';
import { Activity, AlertTriangle, Trash2, Download, Printer } from 'lucide-react';

function ScaleSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="text-xs font-bold text-primary">{value}</span>
      </div>
      <input type="range" min={1} max={5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
    </div>
  );
}

function WellnessTab({ teamId }: { teamId: number }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const { data: players, isLoading: playersLoading } = useListPlayers(teamId);
  const { query: nameQuery, setQuery: setNameQuery, filtered: visiblePlayers } = useNameFilter(players);
  const batchSave = useBatchUpsertWellness(teamId);

  const [date, setDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [rows, setRows] = React.useState<Record<number, { sleepQuality: number; fatigue: number; soreness: number; mood: number }>>({});

  const DEFAULT_ROW = { sleepQuality: 3, fatigue: 3, soreness: 3, mood: 3 };
  const setRow = (playerId: number, patch: Partial<{ sleepQuality: number; fatigue: number; soreness: number; mood: number }>) => {
    setRows((prev) => ({
      ...prev,
      [playerId]: { ...DEFAULT_ROW, ...prev[playerId], ...patch },
    }));
  };

  const handleSave = () => {
    const entries = Object.entries(rows).map(([playerId, r]) => ({ playerId: Number(playerId), ...r }));
    if (entries.length === 0) return;
    batchSave.mutate(
      { date, entries },
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
      <div className="space-y-1.5">
        <Label className="text-xs">{t('rpe.date')}</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">{t('rpe.scale1to5')}</p>
      <NameFilterInput value={nameQuery} onChange={setNameQuery} />
      {playersLoading && [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}

      <div className="space-y-2">
        {visiblePlayers.map((p) => {
          const row = rows[p.id] ?? { sleepQuality: 3, fatigue: 3, soreness: 3, mood: 3 };
          return (
            <div key={p.id} className="bg-card border rounded-xl p-3 space-y-2.5">
              <span className="text-sm font-semibold truncate flex items-center gap-2"><PlayerAvatar photo={p.photo} jerseyNumber={p.jerseyNumber} className="w-7 h-7 text-[11px]" /><span className="truncate">{playerName(p, lang)}</span></span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <ScaleSlider label={t('rpe.sleepQuality')} value={row.sleepQuality} onChange={(v) => setRow(p.id, { sleepQuality: v })} />
                <ScaleSlider label={t('rpe.fatigue')} value={row.fatigue} onChange={(v) => setRow(p.id, { fatigue: v })} />
                <ScaleSlider label={t('rpe.soreness')} value={row.soreness} onChange={(v) => setRow(p.id, { soreness: v })} />
                <ScaleSlider label={t('rpe.mood')} value={row.mood} onChange={(v) => setRow(p.id, { mood: v })} />
              </div>
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

function LogTab({ teamId }: { teamId: number }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const { data: players, isLoading: playersLoading } = useListPlayers(teamId);
  const { query: nameQuery, setQuery: setNameQuery, filtered: visiblePlayers } = useNameFilter(players);
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

      <NameFilterInput value={nameQuery} onChange={setNameQuery} />
      {playersLoading && [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      <div className="space-y-2">
        {visiblePlayers.map((p) => {
          const row = rows[p.id] ?? { duration: '', rpe: 5, notes: '' };
          const load = row.duration ? Number(row.duration) * row.rpe : null;
          return (
            <div key={p.id} className="bg-card border rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold truncate flex items-center gap-2"><PlayerAvatar photo={p.photo} jerseyNumber={p.jerseyNumber} className="w-7 h-7 text-[11px]" /><span className="truncate">{playerName(p, lang)}</span></span>
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

function StatCard({ label, value, unit, color, help }: { label: string; value: string; unit?: string; color?: string; help?: React.ReactNode }) {
  return (
    <div className="bg-card border rounded-xl p-3">
      <p className="text-[11px] text-muted-foreground mb-1 flex items-center">{label}{help}</p>
      <p className="text-xl font-extrabold" style={color ? { color } : undefined} dir="ltr">
        {value}{unit ? ` ${unit}` : ''}
      </p>
    </div>
  );
}

function DashboardTab({ teamId }: { teamId: number }) {
  const { t, lang } = useLanguage();
  const { data: players } = useListPlayers(teamId);
  const [playerId, setPlayerId] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!playerId && players && players.length > 0) setPlayerId(players[0].id);
  }, [players, playerId]);

  const from = format(subDays(new Date(), 70), 'yyyy-MM-dd');
  const { data: entries } = useRpeEntries(teamId, { playerId: playerId ?? undefined, from });
  const { data: wellnessEntries } = useWellnessEntries(teamId, { playerId: playerId ?? undefined, from });
  const { data: allTrainings } = useTrainings(teamId);
  const deleteEntry = useDeleteRpeEntry(teamId);

  if (!players || players.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">{t('rpe.noPlayers')}</p>;
  }

  const list = entries ?? [];
  const snapshot = computeSnapshot(list, new Date());
  const series = weeklyLoadSeries(list, new Date(), 8);
  const trendSeries = monotonyStrainSeries(list, new Date(), 8);
  const recent = [...list].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const latestWellness = [...(wellnessEntries ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const nextWeekStr = format(subDays(new Date(), -7), 'yyyy-MM-dd');
  const upcomingDurations = (allTrainings ?? [])
    .filter((tr) => tr.date > todayStr && tr.date <= nextWeekStr && tr.focus !== 'rest_day' && tr.durationMinutes)
    .map((tr) => tr.durationMinutes as number);
  const forecast = forecastNextWeek(list, upcomingDurations);

  return (
    <div className="space-y-4">
      <Select value={playerId ? String(playerId) : undefined} onValueChange={(v) => setPlayerId(Number(v))}>
        <SelectTrigger><SelectValue placeholder={t('rpe.selectPlayer')} /></SelectTrigger>
        <SelectContent>
          {players.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}><JerseyNumber n={p.jerseyNumber} className="" /> {playerName(p, lang)}</SelectItem>
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
        <StatCard
          label={t('rpe.monotony')}
          value={snapshot.monotony.toFixed(2)}
          color={snapshot.monotony > THRESHOLDS.monotony ? STATUS_COLORS.moderate : undefined}
          help={<TermHelp>{t('rpe.helpMonotony')}</TermHelp>}
        />
        <StatCard
          label={t('rpe.strain')}
          value={String(Math.round(snapshot.strain))}
          unit={t('rpe.au')}
          color={snapshot.strain > THRESHOLDS.strain ? STATUS_COLORS.high : undefined}
          help={<TermHelp>{t('rpe.helpStrain')}</TermHelp>}
        />
        <StatCard
          label={t('rpe.acwr')}
          value={snapshot.acwr === null ? '—' : snapshot.acwr.toFixed(2)}
          color={snapshot.acwr !== null && snapshot.acwr > ACWR_DANGER ? STATUS_COLORS.high : snapshot.acwr !== null && (snapshot.acwr < ACWR_SWEET_SPOT[0] || snapshot.acwr > ACWR_SWEET_SPOT[1]) ? STATUS_COLORS.moderate : STATUS_COLORS.low}
          help={<TermHelp>{t('rpe.helpAcwr')}</TermHelp>}
        />
        {latestWellness && (
          <>
            <StatCard label={t('rpe.wellnessScore')} value={String(wellnessScore(latestWellness))} unit="/100" help={<TermHelp>{t('rpe.helpWellness')}</TermHelp>} />
            <StatCard label={t('rpe.readinessScore')} value={String(readinessScore(latestWellness))} unit="/100" help={<TermHelp>{t('rpe.helpReadiness')}</TermHelp>} />
          </>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground -mt-2">{t('rpe.acwrSweetSpot')}</p>

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
        <h3 className="text-sm font-bold">{t('rpe.monotonyStrainTrend')}</h3>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendSeries} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#332F27" vertical={false} />
              <XAxis dataKey="weekStart" tick={{ fontSize: 10, fill: '#9C9483' }} tickFormatter={(v) => format(new Date(v), 'MM/dd')} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#9C9483' }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9C9483' }} />
              <Tooltip contentStyle={{ background: '#221F1A', border: '1px solid #332F27', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="left" type="monotone" dataKey="monotony" stroke="#E8B64C" name={t('rpe.monotony')} dot={false} strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="strain" stroke="#5BA8D9" name={t('rpe.strain')} dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold">{t('rpe.forecast')}</h3>
        {forecast === null ? (
          <p className="text-xs text-muted-foreground">{t('rpe.forecastNoData')}</p>
        ) : (
          <div className="rounded-xl p-3 space-y-1" style={{ backgroundColor: (forecast.exceedsThreshold ? STATUS_COLORS.high : STATUS_COLORS.low) + '1a' }}>
            <p className="text-xl font-extrabold" style={{ color: forecast.exceedsThreshold ? STATUS_COLORS.high : STATUS_COLORS.low }} dir="ltr">
              {forecast.forecastLoad} {t('rpe.au')}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {t('rpe.forecastBasis').replace('{min}', String(forecast.scheduledMinutes)).replace('{rpe}', forecast.avgRpe.toFixed(1))}
            </p>
            {forecast.exceedsThreshold && (
              <div className="flex items-center gap-1.5 pt-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: STATUS_COLORS.high }} />
                <span className="text-xs" style={{ color: STATUS_COLORS.high }}>{t('rpe.forecastWarning')}</span>
              </div>
            )}
          </div>
        )}
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
            <button type="button" className="text-destructive/60 hover:text-destructive active:text-destructive shrink-0" onClick={() => deleteEntry.mutate(e.id)}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SquadTab({ teamId }: { teamId: number }) {
  const { t, isRtl, lang } = useLanguage();
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

  const handleExportCsv = () => {
    const header = ['Player', 'Jersey', 'Weekly Load (AU)', 'Two-Week Load (AU)', 'Monotony', 'Strain', 'ACWR', 'Status', 'Alerts'];
    const lines = rows.map(({ player, snapshot }) => [
      player.name, player.jerseyNumber, snapshot.weeklyLoad, snapshot.twoWeekLoad,
      snapshot.monotony.toFixed(2), Math.round(snapshot.strain), snapshot.acwr === null ? '' : snapshot.acwr.toFixed(2),
      snapshot.status, snapshot.alerts.length,
    ]);
    const csv = [header, ...lines].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-load-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
    name: `${r.player.jerseyNumber}`,
    load: r.snapshot.weeklyLoad,
    status: r.snapshot.status,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 print:hidden">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExportCsv}>
          <Download className="w-4 h-4" /> {t('rpe.exportCsv')}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="w-4 h-4" /> {t('rpe.printReport')}
        </Button>
      </div>

      <div className="print:hidden space-y-4">
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
                    <span className="text-sm font-semibold flex-1 min-w-0 truncate flex items-center gap-2"><PlayerAvatar photo={player.photo} jerseyNumber={player.jerseyNumber} className="w-7 h-7 text-[11px]" /><span className="truncate">{playerName(player, lang)}</span></span>
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

      {/* Printable report */}
      <div className="hidden print:block text-black" dir={isRtl ? 'rtl' : 'ltr'}>
        <h1 className="text-xl font-bold mb-1">{t('rpe.reportTitle')}</h1>
        <p className="text-xs text-gray-600 mb-4">{t('rpe.reportGenerated')}: {format(new Date(), 'yyyy-MM-dd')}</p>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-1.5 text-start">{t('common.player')}</th>
              <th className="border border-gray-300 p-1.5">{t('rpe.weeklyLoad')}</th>
              <th className="border border-gray-300 p-1.5">{t('rpe.twoWeekLoad')}</th>
              <th className="border border-gray-300 p-1.5">{t('rpe.monotony')}</th>
              <th className="border border-gray-300 p-1.5">{t('rpe.strain')}</th>
              <th className="border border-gray-300 p-1.5">{t('rpe.acwr')}</th>
              <th className="border border-gray-300 p-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ player, snapshot }) => (
              <tr key={player.id}>
                <td className="border border-gray-300 p-1.5"><JerseyNumber n={player.jerseyNumber} className="" /> {playerName(player, lang)}</td>
                <td className="border border-gray-300 p-1.5 text-center">{snapshot.weeklyLoad}</td>
                <td className="border border-gray-300 p-1.5 text-center">{snapshot.twoWeekLoad}</td>
                <td className="border border-gray-300 p-1.5 text-center">{snapshot.monotony.toFixed(2)}</td>
                <td className="border border-gray-300 p-1.5 text-center">{Math.round(snapshot.strain)}</td>
                <td className="border border-gray-300 p-1.5 text-center">{snapshot.acwr === null ? '—' : snapshot.acwr.toFixed(2)}</td>
                <td className="border border-gray-300 p-1.5 text-center">{t(`rpe.status.${snapshot.status}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TrainingLoadPage() {
  const { t, lang } = useLanguage();
  const { activeTeamId } = useTeam();
  if (!activeTeamId) return <NoTeamState />;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold font-display">{t('rpe.title')}</h1>
        </div>
        <FeatureHint id="training-load" title={t('rpe.hintTitle')} body={t('rpe.hintBody')} />
        <Tabs defaultValue="log">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="log">{t('rpe.tabLog')}</TabsTrigger>
            <TabsTrigger value="wellness">{t('rpe.tabWellness')}</TabsTrigger>
            <TabsTrigger value="squad">{t('rpe.tabSquad')}</TabsTrigger>
            <TabsTrigger value="dashboard">{t('rpe.tabDashboard')}</TabsTrigger>
          </TabsList>
          <TabsContent value="log"><LogTab teamId={activeTeamId} /></TabsContent>
          <TabsContent value="wellness"><WellnessTab teamId={activeTeamId} /></TabsContent>
          <TabsContent value="squad"><SquadTab teamId={activeTeamId} /></TabsContent>
          <TabsContent value="dashboard"><DashboardTab teamId={activeTeamId} /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

export default TrainingLoadPage;
