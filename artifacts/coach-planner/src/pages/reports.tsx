import React, { useState } from 'react';
import { AppLayout } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { useTeam } from '@/lib/team-context';
import {
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
import { format, startOfWeek, endOfWeek, startOfMonth } from 'date-fns';
import { FileBarChart2, User, CalendarDays } from 'lucide-react';

type TabId = 'games' | 'players' | 'schedule';

export function Reports() {
  const { t, isRtl } = useLanguage();
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
        name: p.name,
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

  if (!activeTeamId) return null;

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'games', label: t('report.games'), icon: FileBarChart2 },
    { id: 'players', label: t('report.players'), icon: User },
    { id: 'schedule', label: t('report.schedule'), icon: CalendarDays },
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
                        <td className="px-4 py-3 font-semibold">{p.name}</td>
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
      </div>
    </AppLayout>
  );
}
