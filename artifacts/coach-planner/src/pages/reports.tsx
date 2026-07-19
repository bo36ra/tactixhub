import React, { useState } from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { playerName } from '@/lib/player-name';
import { useTeam } from '@/lib/team-context';
import {
  useListAttendance,
  getListAttendanceQueryKey,
  useListMatches,
  useListPlayers,
  useGetPlayingTimeSummary,
  useGetTopScorers,
  useGetCardsSummary,
  useGetAttendanceSummary,
  useGetAttendanceSchedule,
  getListMatchesQueryKey,
  getListPlayersQueryKey,
  getGetPlayingTimeSummaryQueryKey,
  getGetTopScorersQueryKey,
  getGetCardsSummaryQueryKey,
  getGetAttendanceSummaryQueryKey,
  getGetAttendanceScheduleQueryKey,
} from '@workspace/api-client-react';
import { format, startOfWeek, endOfWeek, startOfMonth, addMonths, getDaysInMonth } from 'date-fns';
import { FileBarChart2, User, CalendarDays, ChevronLeft, ChevronRight, GitCompareArrows } from 'lucide-react';
import { STATUS_STYLES } from '@/pages/attendance';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePlayerRatings } from '@/lib/dev-api';
import { PlayerAvatar } from '@/components/player-avatar';

type TabId = 'games' | 'players' | 'schedule' | 'compare';

// Every attendance status the monthly grid can show, training and match
// days combined — single source of truth for both the legend and the
// status filter dropdown so they can never drift out of sync.
const ALL_ATTENDANCE_STATUSES = [
  'present', 'late_excused', 'late_unexcused', 'absent',
  'starter', 'substitute', 'bench', 'not_called',
  'excused_absence', 'injured', 'called_up', 'national_duty', 'other',
] as const;

export function Reports() {
  const { t, isRtl, lang } = useLanguage();
  const { activeTeamId } = useTeam();
  const [tab, setTab] = React.useState<TabId>('games');

  const enabled = !!activeTeamId;
  const tid = activeTeamId!;

  const { data: matches } = useListMatches(tid, { query: { enabled, queryKey: getListMatchesQueryKey(tid) } });
  const { data: players } = useListPlayers(tid, { query: { enabled, queryKey: getListPlayersQueryKey(tid) } });
  const { data: timeSummary } = useGetPlayingTimeSummary(tid, { query: { enabled, queryKey: getGetPlayingTimeSummaryQueryKey(tid) } });
  const { data: scorers } = useGetTopScorers(tid, { query: { enabled, queryKey: getGetTopScorersQueryKey(tid) } });
  const { data: cardsSummary } = useGetCardsSummary(tid, { query: { enabled, queryKey: getGetCardsSummaryQueryKey(tid) } });
  const { data: attendanceSummary } = useGetAttendanceSummary(tid, { query: { enabled, queryKey: getGetAttendanceSummaryQueryKey(tid) } });
  const [scheduleDays, setScheduleDays] = useState<number | undefined>(30);
  const [gridMonth, setGridMonth] = useState(() => startOfMonth(new Date()));
  const [gridPlayer, setGridPlayer] = useState<string>('all');
  const [gridStatusFilter, setGridStatusFilter] = useState<string>('all');
  // Tap popup for a day tile carrying an excuse note
  const [tilePopup, setTilePopup] = useState<{ day: number; recs: { status: string; note: string | null }[] } | null>(null);
  const [cmpA, setCmpA] = useState<string>('');
  const [cmpB, setCmpB] = useState<string>('');
  const { data: ratingsA } = usePlayerRatings(tid, cmpA ? Number(cmpA) : undefined);
  const { data: ratingsB } = usePlayerRatings(tid, cmpB ? Number(cmpB) : undefined);
  const avgOf = (rs?: { rating: number }[]) =>
    rs && rs.length ? rs.reduce((s, r) => s + r.rating, 0) / rs.length : null;
  const { data: allAttendance } = useListAttendance(tid, { query: { enabled, queryKey: getListAttendanceQueryKey(tid) } });

  // Monthly grid: players as rows, every day of the selected month as
  // columns, one colored cell per recorded status. Built client-side from
  // the raw attendance rows.
  const monthGrid = React.useMemo(() => {
    if (!players) return null;
    const monthKey = format(gridMonth, 'yyyy-MM');
    const daysInMonth = getDaysInMonth(gridMonth);
    // date -> playerId -> records (training + match can share a day)
    type GridRec = { status: string; note: string | null };
    const byDay = new Map<number, Map<number, GridRec[]>>();
    let hasRecords = false;
    for (const rec of allAttendance ?? []) {
      if (!rec.date.startsWith(monthKey)) continue;
      hasRecords = true;
      const day = Number(rec.date.slice(8, 10));
      const statuses = byDay.get(day) ?? new Map<number, GridRec[]>();
      const list = statuses.get(rec.playerId) ?? [];
      list.push({ status: rec.status ?? (rec.present ? 'present' : 'absent'), note: rec.note ?? null });
      statuses.set(rec.playerId, list);
      byDay.set(day, statuses);
    }
    // Only render columns for days that actually had a session — a full
    // 1..31 grid is mostly empty and unreadable on mobile.
    const activeDays = Array.from(byDay.keys()).sort((a, b) => a - b);
    return { daysInMonth, activeDays, byDay, hasRecords };
  }, [players, allAttendance, gridMonth]);

  const [scheduleGroupBy, setScheduleGroupBy] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const { data: schedule } = useGetAttendanceSchedule(
    tid,
    { days: scheduleDays },
    { query: { enabled, queryKey: getGetAttendanceScheduleQueryKey(tid, { days: scheduleDays }) } },
  );

  // Rolls the day-by-day schedule up into week or month buckets — same
  // underlying data, just grouped by time window instead of listed per day.
  const scheduleBuckets = React.useMemo(() => {
    if (!schedule || scheduleGroupBy === 'daily') return null;
    const buckets = new Map<
      string,
      { label: string; sortKey: string; sessions: number; present: number; total: number }
    >();
    for (const day of schedule) {
      const d = new Date(day.date + 'T00:00:00');
      let key: string;
      let label: string;
      if (scheduleGroupBy === 'weekly') {
        const start = startOfWeek(d, { weekStartsOn: 6 }); // Saturday-start week (Gulf convention)
        const end = endOfWeek(d, { weekStartsOn: 6 });
        key = format(start, 'yyyy-MM-dd');
        label = `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
      } else {
        const start = startOfMonth(d);
        key = format(start, 'yyyy-MM');
        label = format(start, 'MMMM yyyy');
      }
      const bucket = buckets.get(key) ?? { label, sortKey: key, sessions: 0, present: 0, total: 0 };
      bucket.sessions += 1;
      bucket.present += day.presentCount;
      bucket.total += day.totalPlayers;
      buckets.set(key, bucket);
    }
    return Array.from(buckets.values())
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
      .map((b) => ({ ...b, attendanceRate: b.total > 0 ? (b.present / b.total) * 100 : 0 }));
  }, [schedule, scheduleGroupBy]);

  // Aggregate player full details
  const playerReport = React.useMemo(() => {
    if (!players) return [];
    return players.map((p) => {
      const time = timeSummary?.find((r) => r.playerId === p.id);
      const scorer = scorers?.find((r) => r.playerId === p.id);
      const cards = cardsSummary?.find((r) => r.playerId === p.id);
      const attendance = attendanceSummary?.find((r) => r.playerId === p.id);

      return {
        id: p.id,
        jerseyNumber: p.jerseyNumber,
        name: playerName(p, lang),
        photo: p.photo,
        position: p.position,
        age: p.age,
        status: p.status,
        matchesPlayed: time?.matchesPlayed ?? 0,
        totalMinutes: time?.totalMinutes ?? 0,
        avgMinutes: time?.avgPerMatch ?? 0,
        participation: time?.participationPct ?? 0,
        goalsScored: scorer?.goalsScored ?? 0,
        goalsConceded: scorer?.goalsConceded ?? 0,
        yellowCards: cards?.yellowCards ?? 0,
        redCards: cards?.redCards ?? 0,
        disciplineStatus: cards?.status ?? 'clean',
        attendancePresent: attendance?.totalPresent ?? 0,
        attendanceAbsent: attendance?.totalAbsent ?? 0,
        attendanceRate: attendance?.attendanceRate ?? 0,
      };
    });
  }, [players, timeSummary, scorers, cardsSummary, attendanceSummary]);

  // Match stats summary
  const matchStats = React.useMemo(() => {
    if (!matches) return { played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0 };
    return matches.reduce(
      (acc, m) => ({
        played: acc.played + 1,
        wins: acc.wins + (m.ourGoals > m.theirGoals ? 1 : 0),
        draws: acc.draws + (m.ourGoals === m.theirGoals ? 1 : 0),
        losses: acc.losses + (m.ourGoals < m.theirGoals ? 1 : 0),
        scored: acc.scored + m.ourGoals,
        conceded: acc.conceded + m.theirGoals,
      }),
      { played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0 },
    );
  }, [matches]);

  if (!activeTeamId) return <NoTeamState />;

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'games', label: t('report.games'), icon: FileBarChart2 },
    { id: 'players', label: t('report.players'), icon: User },
    { id: 'schedule', label: t('report.schedule'), icon: CalendarDays },
    { id: 'compare', label: t('report.compare'), icon: GitCompareArrows },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">{t('nav.reports')}</h2>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── GAMES REPORT ── */}
        {tab === 'games' && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: t('report.played'), value: matchStats.played, color: '' },
                { label: t('match.win'), value: matchStats.wins, color: 'text-green-600' },
                { label: t('match.draw'), value: matchStats.draws, color: 'text-yellow-600' },
                { label: t('match.loss'), value: matchStats.losses, color: 'text-red-600' },
                { label: t('stat.goalsScored'), value: matchStats.scored, color: 'text-blue-600' },
                { label: t('stat.goalsConceded'), value: matchStats.conceded, color: 'text-orange-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-card border rounded-xl p-4 text-center space-y-1">
                  <p className={`text-3xl font-black ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                </div>
              ))}
            </div>

            {/* Match table */}
            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className={`w-full text-sm ${isRtl ? 'text-right' : 'text-left'}`}>
                  <thead className="bg-muted text-muted-foreground font-medium border-b">
                    <tr>
                      <th className="px-5 py-4">{t('common.date')}</th>
                      <th className="px-5 py-4">{t('match.opponent')}</th>
                      <th className="px-5 py-4">{t('common.type')}</th>
                      <th className="px-5 py-4 text-center">{t('report.score')}</th>
                      <th className="px-5 py-4 text-center">{t('report.result')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {matches?.map((m) => {
                      const result =
                        m.ourGoals > m.theirGoals ? 'win' : m.ourGoals < m.theirGoals ? 'loss' : 'draw';
                      const pillClass =
                        result === 'win' ? 'pill-green' : result === 'loss' ? 'pill-red' : 'pill-yellow';
                      return (
                        <tr key={m.id} className="hover:bg-muted/40 transition-colors">
                          <td className="px-5 py-3.5 text-muted-foreground">
                            {format(new Date(m.date + 'T00:00:00'), 'MMM d, yyyy')}
                          </td>
                          <td className="px-5 py-3.5 font-semibold">{m.opponent}</td>
                          <td className="px-5 py-3.5 text-muted-foreground">{t(`match.${m.type}`)}</td>
                          <td className="px-5 py-3.5 text-center font-black tabular-nums" dir="ltr">
                            {m.ourGoals} – {m.theirGoals}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${pillClass}`}>
                              {t(`match.${result}`)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {matches?.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                          {t('common.noData')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── PLAYER REPORT ── */}
        {tab === 'players' && (
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className={`w-full text-sm ${isRtl ? 'text-right' : 'text-left'}`}>
                <thead className="bg-muted text-muted-foreground font-medium border-b">
                  <tr>
                    <th className="px-4 py-4 w-10">#</th>
                    <th className="px-4 py-4 min-w-[140px]">{t('common.name')}</th>
                    <th className="px-4 py-4">{t('common.position')}</th>
                    <th className="px-4 py-4">{t('common.status')}</th>
                    <th className="px-4 py-4 text-center">{t('report.gamesPlayed')}</th>
                    <th className="px-4 py-4 text-center">{t('time.totalMinutes')}</th>
                    <th className="px-4 py-4 text-center">{t('time.avg')}</th>
                    <th className="px-4 py-4 text-center">{t('stat.goalsScored')}</th>
                    <th className="px-4 py-4 text-center">{t('card.yellow')}</th>
                    <th className="px-4 py-4 text-center">{t('card.red')}</th>
                    <th className="px-4 py-4 text-center">{t('attendance.rate')}</th>
                    <th className="px-4 py-4">{t('report.discipline')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {playerReport.map((p) => {
                    const statusPill =
                      p.status === 'active' ? 'pill-green' : p.status === 'injured' ? 'pill-red' : 'pill-yellow';
                    const discPill =
                      p.disciplineStatus === 'suspended'
                        ? 'pill-red'
                        : p.disciplineStatus === 'warning'
                          ? 'pill-yellow'
                          : p.disciplineStatus === 'caution'
                            ? 'pill-beige'
                            : 'pill-green';
                    const attRate = p.attendanceRate;
                    const attPill =
                      attRate >= 80 ? 'pill-green' : attRate >= 60 ? 'pill-yellow' : 'pill-red';

                    return (
                      <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 font-mono text-muted-foreground font-medium">
                          {p.jerseyNumber}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          <span className="flex items-center gap-2.5">
                            <PlayerAvatar photo={p.photo} jerseyNumber={p.jerseyNumber} className="w-8 h-8 text-xs" />
                            {playerName(p, lang)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{t(`position.${p.position}`)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusPill}`}>
                            {t(`status.${p.status}`)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold">{p.matchesPlayed}</td>
                        <td className="px-4 py-3 text-center font-bold">{p.totalMinutes}'</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">
                          {Math.round(p.avgMinutes)}'
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-emerald-400">{p.goalsScored}</td>
                        <td className="px-4 py-3 text-center font-medium text-amber-300">
                          {p.yellowCards}
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-rose-400">{p.redCards}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${attPill}`} dir="ltr">
                            {attRate.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${discPill}`}>
                            {t(`discipline.${p.disciplineStatus}`)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {playerReport.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">
                        {t('common.noData')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ATTENDANCE SCHEDULE ── */}
        {tab === 'compare' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 max-w-xl">
              {([['A', cmpA, setCmpA, 'cmp.pickA'], ['B', cmpB, setCmpB, 'cmp.pickB']] as const).map(([key, value, setter, label]) => (
                <Select key={key} value={value} onValueChange={setter}>
                  <SelectTrigger><SelectValue placeholder={t(label)} /></SelectTrigger>
                  <SelectContent>
                    {playerReport.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>#{p.jerseyNumber} {playerName(p, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
            </div>

            {(() => {
              const a = playerReport.find((p) => String(p.id) === cmpA);
              const b = playerReport.find((p) => String(p.id) === cmpB);
              if (!a || !b) return <p className="text-sm text-muted-foreground">{t('cmp.hint')}</p>;
              const ratingA = avgOf(ratingsA);
              const ratingB = avgOf(ratingsB);
              // higherWins=false for cards, where fewer is better
              const metrics: { label: string; a: number | null; b: number | null; higherWins: boolean; decimals?: number }[] = [
                { label: t('cmp.matches'), a: a.matchesPlayed, b: b.matchesPlayed, higherWins: true },
                { label: t('cmp.minutes'), a: a.totalMinutes, b: b.totalMinutes, higherWins: true },
                { label: t('cmp.avgMinutes'), a: a.avgMinutes, b: b.avgMinutes, higherWins: true, decimals: 1 },
                { label: t('cmp.participation'), a: a.participation, b: b.participation, higherWins: true, decimals: 0 },
                { label: t('cmp.goals'), a: a.goalsScored, b: b.goalsScored, higherWins: true },
                { label: t('cmp.yellow'), a: a.yellowCards, b: b.yellowCards, higherWins: false },
                { label: t('cmp.red'), a: a.redCards, b: b.redCards, higherWins: false },
                { label: t('cmp.attendance'), a: a.attendanceRate, b: b.attendanceRate, higherWins: true, decimals: 0 },
                { label: t('cmp.avgRating'), a: ratingA, b: ratingB, higherWins: true, decimals: 1 },
              ];
              const fmt = (v: number | null, d = 0) => (v === null ? '—' : v.toFixed(d));
              const cellClass = (mine: number | null, other: number | null, higherWins: boolean) => {
                if (mine === null || other === null || mine === other) return '';
                const better = higherWins ? mine > other : mine < other;
                return better ? 'text-green-500 font-bold' : 'text-muted-foreground';
              };
              return (
                <div className="bg-card border rounded-xl overflow-hidden max-w-xl">
                  <div className="grid grid-cols-3 text-sm">
                    <div className="px-4 py-3 bg-muted font-semibold text-muted-foreground">{t('cmp.metric')}</div>
                    {[a, b].map((p) => (
                      <div key={p.id} className="px-4 py-3 bg-muted font-semibold flex items-center gap-2 min-w-0">
                        <PlayerAvatar photo={p.photo} jerseyNumber={p.jerseyNumber} className="w-7 h-7 text-[10px]" />
                        <span className="truncate">{playerName(p, lang)}</span>
                      </div>
                    ))}
                    {metrics.map((m, i) => (
                      <React.Fragment key={i}>
                        <div className="px-4 py-2.5 border-t border-border/50 text-muted-foreground">{m.label}</div>
                        <div className={`px-4 py-2.5 border-t border-border/50 tabular-nums ${cellClass(m.a, m.b, m.higherWins)}`} dir="ltr">{fmt(m.a, m.decimals)}</div>
                        <div className={`px-4 py-2.5 border-t border-border/50 tabular-nums ${cellClass(m.b, m.a, m.higherWins)}`} dir="ltr">{fmt(m.b, m.decimals)}</div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {tab === 'schedule' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                {[
                  { label: t('report.last7'), value: 7 },
                  { label: t('report.last30'), value: 30 },
                  { label: t('report.last90'), value: 90 },
                  { label: t('report.allTime'), value: undefined },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setScheduleDays(opt.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      scheduleDays === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 bg-muted rounded-lg p-1">
                {(['daily', 'weekly', 'monthly'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setScheduleGroupBy(g)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      scheduleGroupBy === g ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {t(`report.groupBy.${g}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Weekly / Monthly rollup */}
            {scheduleBuckets && (
              <div className="space-y-2.5">
                {scheduleBuckets.length === 0 && (
                  <div className="bg-card border rounded-xl px-6 py-12 text-center text-muted-foreground">
                    {t('report.scheduleEmpty')}
                  </div>
                )}
                {scheduleBuckets.map((b) => {
                  const attPill = b.attendanceRate >= 80 ? 'pill-green' : b.attendanceRate >= 60 ? 'pill-yellow' : 'pill-red';
                  return (
                    <div key={b.sortKey} className="bg-card border rounded-xl p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground text-sm">{b.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.sessions} {t('report.sessions')}
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${attPill}`} dir="ltr">
                        {b.present}/{b.total} · {b.attendanceRate.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Monthly grid */}
            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="font-bold text-sm sm:text-base">{t('reports.monthGrid')}</h3>
                <div className="flex items-center gap-2">
                  <Select value={gridPlayer} onValueChange={setGridPlayer}>
                    <SelectTrigger className="h-8 w-36 sm:w-44 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('reports.allTeam')}</SelectItem>
                      {players?.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>#{p.jerseyNumber} {playerName(p, lang)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={gridStatusFilter} onValueChange={setGridStatusFilter}>
                    <SelectTrigger className="h-8 w-32 sm:w-40 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('reports.allStatuses')}</SelectItem>
                      {ALL_ATTENDANCE_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>{t(`att.status.${status}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="p-1.5 rounded-md hover:bg-white/[0.06] text-muted-foreground"
                    onClick={() => setGridMonth(m => addMonths(m, -1))}
                  >
                    {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                  </button>
                  <span className="text-sm font-medium min-w-24 text-center" dir="ltr">
                    {format(gridMonth, 'MM / yyyy')}
                  </span>
                  <button
                    type="button"
                    className="p-1.5 rounded-md hover:bg-white/[0.06] text-muted-foreground"
                    onClick={() => setGridMonth(m => addMonths(m, 1))}
                  >
                    {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
                </div>
              </div>

              {gridPlayer !== 'all' ? (
                (() => {
                  // Calendar-tile view for one player: each day of the month
                  // is a rounded tile colored by that player's status —
                  // reads like a habit tracker, one glance per month.
                  const pid = Number(gridPlayer);
                  const daysInMonth = monthGrid?.daysInMonth ?? 30;
                  const anyRecord = monthGrid
                    ? Array.from(monthGrid.byDay.values()).some((m) => m.has(pid))
                    : false;
                  if (!anyRecord) {
                    return (
                      <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                        {t('reports.noRecordsPlayer')}
                      </p>
                    );
                  }
                  const weekdayFmt = new Intl.DateTimeFormat(isRtl ? 'ar' : 'en', { weekday: 'short' });
                  return (
                    <div className="p-3 sm:p-4">
                      <div className="grid grid-cols-6 sm:grid-cols-7 gap-1.5 sm:gap-2">
                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                          const date = new Date(gridMonth.getFullYear(), gridMonth.getMonth(), day);
                          const recs = monthGrid?.byDay.get(day)?.get(pid) ?? [];
                          const primary = recs[0]?.status;
                          const hasNote = recs.some((r) => r.note);
                          const tileMatches = gridStatusFilter === 'all' || recs.some((r) => r.status === gridStatusFilter);
                          return (
                            <div
                              key={day}
                              role={hasNote ? 'button' : undefined}
                              onClick={() => hasNote && setTilePopup({ day, recs })}
                              title={recs.map((r) => `${t(`att.status.${r.status}`)}${r.note ? ` — ${r.note}` : ''}`).join(' · ')}
                              className={`relative rounded-xl px-1 py-2 flex flex-col items-center gap-0.5 border overflow-hidden transition-opacity ${
                                primary ? STATUS_STYLES[primary] : 'bg-white/[0.02] border-white/[0.05] text-muted-foreground/50'
                              } ${hasNote ? 'cursor-pointer ring-1 ring-amber-400/40' : ''} ${tileMatches ? '' : 'opacity-15'}`}
                            >
                              <span className="text-[9px] leading-none opacity-70">{weekdayFmt.format(date)}</span>
                              <span className="text-sm font-bold leading-none" dir="ltr">{day}</span>
                              <span className="h-2 flex items-center gap-0.5">
                                {recs.map((_, i) => (
                                  <span key={i} className={`w-1.5 h-1.5 rounded-full ${primary ? 'bg-current' : ''}`} />
                                ))}
                              </span>
                              {hasNote && (
                                <span className="absolute top-1 end-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()
              ) : !monthGrid?.hasRecords ? (
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                  {t('reports.noRecordsMonth')}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="text-xs border-collapse min-w-full">
                      <thead>
                        <tr className="bg-muted text-muted-foreground">
                          <th className="px-3 py-2 text-start sticky start-0 bg-muted z-10 min-w-32">
                            {t('common.name')}
                          </th>
                          {monthGrid.activeDays.map(day => {
                            const date = new Date(gridMonth.getFullYear(), gridMonth.getMonth(), day);
                            const weekdayFmt = new Intl.DateTimeFormat(isRtl ? 'ar' : 'en', { weekday: 'short' });
                            return (
                              <th key={day} className="px-1 py-2 text-center font-mono min-w-8" dir="ltr">
                                <div className="flex flex-col items-center leading-tight">
                                  <span className="text-[9px] font-sans opacity-70 normal-case">{weekdayFmt.format(date)}</span>
                                  <span>{day}</span>
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {players?.map(player => (
                          <tr key={player.id} className="hover:bg-muted/40">
                            <td className="px-3 py-1.5 font-medium sticky start-0 bg-card z-10 whitespace-nowrap">
                              <span className="text-muted-foreground font-mono me-1.5">{player.jerseyNumber}</span>
                              {playerName(player, lang)}
                            </td>
                            {monthGrid.activeDays.map(day => {
                              const statuses = monthGrid.byDay.get(day)?.get(player.id) ?? [];
                              return (
                                <td key={day} className="px-1 py-1.5 text-center">
                                  <div className="flex items-center justify-center gap-0.5">
                                    {statuses.length === 0 ? (
                                      <span className="text-muted-foreground/30">·</span>
                                    ) : (
                                      statuses.map((rec, i) => {
                                        const matches = gridStatusFilter === 'all' || rec.status === gridStatusFilter;
                                        return (
                                          <span
                                            key={i}
                                            title={`${t(`att.status.${rec.status}`)}${rec.note ? ` — ${rec.note}` : ''}`}
                                            className={`inline-flex items-center justify-center w-6 h-6 rounded-md border text-[10px] font-bold transition-opacity ${STATUS_STYLES[rec.status] ?? ''} ${matches ? '' : 'opacity-15'}`}
                                          >
                                            {t(`att.status.short.${rec.status}`)}
                                          </span>
                                        );
                                      })
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3 border-t flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">{t('reports.legend')}:</span>
                    {ALL_ATTENDANCE_STATUSES.map(status => (
                      <span key={status} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md border text-[9px] font-bold ${STATUS_STYLES[status]}`}>
                          {t(`att.status.short.${status}`)}
                        </span>
                        {t(`att.status.${status}`)}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Daily list */}
            {!scheduleBuckets && (!schedule || schedule.length === 0) && (
              <div className="bg-card border rounded-xl px-6 py-12 text-center text-muted-foreground">
                {t('report.scheduleEmpty')}
              </div>
            )}
            {!scheduleBuckets && schedule?.map((day) => {
              const attPill =
                day.attendanceRate >= 80 ? 'pill-green' : day.attendanceRate >= 60 ? 'pill-yellow' : 'pill-red';
              return (
                <div key={`${day.date}-${day.sessionType}`} className="bg-card border rounded-xl p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <CalendarDays className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">
                          {format(new Date(day.date + 'T00:00:00'), 'MMM d, yyyy')}
                        </p>
                        <p className="text-xs text-muted-foreground">{t(`attendance.${day.sessionType}`)}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${attPill}`} dir="ltr">
                      {day.presentCount}/{day.totalPlayers} · {day.attendanceRate.toFixed(0)}%
                    </span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        {t('report.present')} ({day.presentCount})
                      </p>
                      <p className="text-foreground">
                        {day.presentPlayerNames.length > 0 ? day.presentPlayerNames.join('، ') : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        {t('report.absent')} ({day.absentCount})
                      </p>
                      <p className="text-muted-foreground">
                        {day.absentPlayerNames.length > 0 ? day.absentPlayerNames.join('، ') : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* Excuse popup for a tapped day tile */}
        <Dialog open={tilePopup !== null} onOpenChange={(o) => !o && setTilePopup(null)}>
          <DialogContent dir={isRtl ? 'rtl' : 'ltr'} className="max-w-sm max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">
                {t('reports.monthNotes')} — {format(gridMonth, 'MM/yyyy')}
                <span className="text-primary" dir="ltr"> · {tilePopup?.day}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {(tilePopup?.recs ?? []).map((rec, i) => (
                <div key={i} className="rounded-lg bg-white/[0.03] border border-border/50 px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${STATUS_STYLES[rec.status] ?? ''}`}>
                    {t(`att.status.${rec.status}`)}
                  </span>
                  {rec.note && <p className="text-sm mt-1.5 whitespace-pre-wrap">{rec.note}</p>}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
