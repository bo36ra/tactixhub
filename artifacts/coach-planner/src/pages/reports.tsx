import React, { useState } from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { playerName } from '@/lib/player-name';
import { JerseyNumber } from '@/components/jersey-number';
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
  getListMatchesQueryKey,
  getListPlayersQueryKey,
  getGetPlayingTimeSummaryQueryKey,
  getGetTopScorersQueryKey,
  getGetCardsSummaryQueryKey,
  getGetAttendanceSummaryQueryKey,
} from '@workspace/api-client-react';
import { format, startOfWeek, endOfWeek, startOfMonth, addMonths, addDays, getDaysInMonth } from 'date-fns';
import { FileBarChart2, User, CalendarDays, ChevronLeft, ChevronRight, GitCompareArrows } from 'lucide-react';
import { STATUS_STYLES } from '@/pages/attendance';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
  const [gridDate, setGridDate] = useState(() => new Date());
  const gridMonth = startOfMonth(gridDate);
  // Monthly stays exactly as it was (day-of-month keyed, scoped to one
  // calendar month) — daily/weekly are a separate, date-string-keyed
  // computation below so the working monthly view is never at risk of
  // a shared-code regression.
  const [gridViewMode, setGridViewMode] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
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

  type RangeRec = { status: string; note: string | null };
  const rangeDates = React.useMemo(() => {
    if (gridViewMode === 'daily') return [format(gridDate, 'yyyy-MM-dd')];
    if (gridViewMode === 'weekly') {
      const start = startOfWeek(gridDate, { weekStartsOn: 6 }); // Saturday-start (Gulf convention)
      return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'));
    }
    return [];
  }, [gridViewMode, gridDate]);

  const rangeGrid = React.useMemo(() => {
    if (gridViewMode === 'monthly' || !players) return null;
    const byDate = new Map<string, Map<number, RangeRec[]>>();
    const dateSet = new Set(rangeDates);
    for (const rec of allAttendance ?? []) {
      if (!dateSet.has(rec.date)) continue;
      const statuses = byDate.get(rec.date) ?? new Map<number, RangeRec[]>();
      const list = statuses.get(rec.playerId) ?? [];
      list.push({ status: rec.status ?? (rec.present ? 'present' : 'absent'), note: rec.note ?? null });
      statuses.set(rec.playerId, list);
      byDate.set(rec.date, statuses);
    }
    return byDate;
  }, [gridViewMode, allAttendance, rangeDates, players]);

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
  }, [players, allAttendance, gridDate.getFullYear(), gridDate.getMonth()]);

  // Simple "who has status X this month" summary for the status filter —
  // a plain list (player + occurrence count + dates) reads much faster
  // for spotting a pattern than scanning a dimmed grid for one color.
  // Attendance rate for whichever range the daily/weekly/monthly toggle
  // is currently on — same present/absent classification the old
  // separate 7/30/90-day rollup used (r.present boolean), just now
  // driven by the grid's own date navigation instead of a second,
  // disconnected set of controls.
  const rateSummary = React.useMemo(() => {
    if (!allAttendance) return null;
    const monthKey = format(gridMonth, 'yyyy-MM');
    const dateSet = gridViewMode === 'monthly' ? null : new Set(rangeDates);
    const recs = allAttendance.filter((r) =>
      gridViewMode === 'monthly' ? r.date.startsWith(monthKey) : dateSet!.has(r.date),
    );
    if (recs.length === 0) return null;
    const present = recs.filter((r) => r.present).length;
    return { total: recs.length, present, rate: Math.round((present / recs.length) * 100) };
  }, [allAttendance, gridViewMode, gridMonth, rangeDates]);

  const statusFilterSummary = React.useMemo(() => {
    if (!players) return [];
    const byPlayer = new Map<number, { day: number; note: string | null }[]>();
    const totalByPlayer = new Map<number, number>();

    if (gridViewMode === 'monthly') {
      if (!monthGrid) return [];
      for (const day of monthGrid.activeDays) {
        const dayMap = monthGrid.byDay.get(day);
        if (!dayMap) continue;
        for (const [playerId, recs] of dayMap) {
          totalByPlayer.set(playerId, (totalByPlayer.get(playerId) ?? 0) + 1);
          const match = recs.find((r) => r.status === gridStatusFilter);
          if (!match) continue;
          const list = byPlayer.get(playerId) ?? [];
          list.push({ day, note: match.note });
          byPlayer.set(playerId, list);
        }
      }
    } else {
      if (!rangeGrid) return [];
      for (const dateStr of rangeDates) {
        const dayMap = rangeGrid.get(dateStr);
        if (!dayMap) continue;
        const dayNum = Number(dateStr.slice(8, 10));
        for (const [playerId, recs] of dayMap) {
          totalByPlayer.set(playerId, (totalByPlayer.get(playerId) ?? 0) + 1);
          const match = recs.find((r) => r.status === gridStatusFilter);
          if (!match) continue;
          const list = byPlayer.get(playerId) ?? [];
          list.push({ day: dayNum, note: match.note });
          byPlayer.set(playerId, list);
        }
      }
    }

    return players
      .filter((p) => byPlayer.has(p.id))
      .map((p) => ({ player: p, occurrences: byPlayer.get(p.id)!, total: totalByPlayer.get(p.id) ?? 0 }))
      .sort((a, b) => b.occurrences.length / b.total - a.occurrences.length / a.total);
  }, [monthGrid, rangeGrid, rangeDates, gridViewMode, players, gridStatusFilter]);

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
                      <SelectItem key={p.id} value={String(p.id)}><JerseyNumber n={p.jerseyNumber} className="" /> {playerName(p, lang)}</SelectItem>
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
            {/* Attendance rate for whatever range the grid below is
                currently showing — one set of controls (the grid's own
                daily/weekly/monthly toggle + date picker) now drives
                both the rate and the detailed breakdown, instead of two
                separate, disconnected navigation controls. */}
            {rateSummary && (
              <div className="bg-card border rounded-xl p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground text-sm">{t('reports.attendanceRate')}</p>
                  <p className="text-xs text-muted-foreground">
                    {rateSummary.total} {t('report.sessions')}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                    rateSummary.rate >= 80 ? 'pill-green' : rateSummary.rate >= 60 ? 'pill-yellow' : 'pill-red'
                  }`}
                  dir="ltr"
                >
                  {rateSummary.present}/{rateSummary.total} · {rateSummary.rate}%
                </span>
              </div>
            )}

            {/* Monthly grid */}
            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b space-y-2.5">
                <h3 className="font-bold text-sm sm:text-base">
                  {gridViewMode === 'daily' ? t('reports.dayGrid') : gridViewMode === 'weekly' ? t('reports.weekGrid') : t('reports.monthGrid')}
                </h3>
                <div className="flex gap-1.5">
                  {(['daily', 'weekly', 'monthly'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setGridViewMode(mode)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        gridViewMode === mode ? 'bg-primary text-primary-foreground border-primary' : 'border-border/60 text-muted-foreground hover:bg-white/[0.04]'
                      }`}
                    >
                      {mode === 'daily' ? t('reports.dailyMode') : mode === 'weekly' ? t('reports.weeklyMode') : t('reports.monthlyMode')}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    value={format(gridDate, 'yyyy-MM-dd')}
                    onChange={(e) => e.target.value && setGridDate(new Date(`${e.target.value}T00:00:00`))}
                    className="h-8 flex-1 min-w-[9.5rem] text-xs"
                  />
                  <Select value={gridPlayer} onValueChange={setGridPlayer}>
                    <SelectTrigger className="h-8 flex-1 min-w-[8rem] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('reports.allTeam')}</SelectItem>
                      {players?.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}><JerseyNumber n={p.jerseyNumber} className="" /> {playerName(p, lang)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={gridStatusFilter} onValueChange={setGridStatusFilter}>
                    <SelectTrigger className="h-8 flex-1 min-w-[8rem] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('reports.allStatuses')}</SelectItem>
                      {ALL_ATTENDANCE_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>{t(`att.status.${status}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {gridStatusFilter !== 'all' ? (
                statusFilterSummary.length === 0 ? (
                  <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                    {t('reports.noMatchesStatus')}
                  </p>
                ) : (
                  <div className="divide-y divide-border/50">
                    {statusFilterSummary.map(({ player, occurrences, total }) => (
                      <div key={player.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-muted-foreground font-mono text-xs shrink-0">{player.jerseyNumber}</span>
                          <span className="font-medium text-sm truncate">{playerName(player, lang)}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_STYLES[gridStatusFilter] ?? ''}`} dir="ltr">
                            {occurrences.length}/{total} · {Math.round((occurrences.length / total) * 100)}%
                          </span>
                          <span className="text-[11px] text-muted-foreground font-mono" dir="ltr">
                            {occurrences.map((o) => o.day).join(', ')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : gridViewMode === 'daily' ? (
                (() => {
                  const dateStr = format(gridDate, 'yyyy-MM-dd');
                  const dayMap = rangeGrid?.get(dateStr);
                  const rows = (players ?? [])
                    .filter((p) => gridPlayer === 'all' || String(p.id) === gridPlayer)
                    .map((p) => ({ player: p, recs: dayMap?.get(p.id) ?? [] }));
                  const withData = rows.filter((r) => r.recs.length > 0);
                  if (withData.length === 0) {
                    return (
                      <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                        {t('reports.noSessionThisDay')}
                      </p>
                    );
                  }
                  return (
                    <div className="divide-y divide-border/50">
                      {withData.map(({ player, recs }) => (
                        <div key={player.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-muted-foreground font-mono text-xs shrink-0">{player.jerseyNumber}</span>
                            <span className="font-medium text-sm truncate">{playerName(player, lang)}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {recs.map((rec, i) => (
                              <span
                                key={i}
                                title={rec.note ?? undefined}
                                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_STYLES[rec.status] ?? ''}`}
                              >
                                {t(`att.status.${rec.status}`)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              ) : gridViewMode === 'weekly' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-muted text-muted-foreground">
                        <th className="px-3 py-2 text-start sticky start-0 bg-muted z-10 min-w-32">
                          {t('common.name')}
                        </th>
                        {rangeDates.map((dateStr) => {
                          const d = new Date(`${dateStr}T00:00:00`);
                          const weekdayFmt = new Intl.DateTimeFormat(isRtl ? 'ar' : 'en', { weekday: 'short' });
                          return (
                            <th key={dateStr} className="px-1 py-2 text-center font-mono min-w-10" dir="ltr">
                              <div className="flex flex-col items-center leading-tight">
                                <span className="text-[9px] font-sans opacity-70 normal-case">{weekdayFmt.format(d)}</span>
                                <span>{d.getDate()}</span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {(players ?? [])
                        .filter((p) => gridPlayer === 'all' || String(p.id) === gridPlayer)
                        .map((player) => (
                          <tr key={player.id}>
                            <td className="px-3 py-1.5 sticky start-0 bg-card z-10 font-medium truncate max-w-[9rem]">
                              {playerName(player, lang)}
                            </td>
                            {rangeDates.map((dateStr) => {
                              const recs = rangeGrid?.get(dateStr)?.get(player.id) ?? [];
                              return (
                                <td key={dateStr} className="px-1 py-1.5 text-center">
                                  <div className="flex items-center justify-center gap-0.5">
                                    {recs.length === 0 ? (
                                      <span className="text-muted-foreground/30">·</span>
                                    ) : (
                                      recs.map((rec, i) => (
                                        <span
                                          key={i}
                                          title={`${t(`att.status.${rec.status}`)}${rec.note ? ` — ${rec.note}` : ''}`}
                                          className={`inline-flex items-center justify-center w-6 h-6 rounded-md border text-[10px] font-bold ${STATUS_STYLES[rec.status] ?? ''}`}
                                        >
                                          {t(`att.status.short.${rec.status}`)}
                                        </span>
                                      ))
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
              ) : gridPlayer !== 'all' ? (
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
                          return (
                            <div
                              key={day}
                              role={hasNote ? 'button' : undefined}
                              onClick={() => hasNote && setTilePopup({ day, recs })}
                              title={recs.map((r) => `${t(`att.status.${r.status}`)}${r.note ? ` — ${r.note}` : ''}`).join(' · ')}
                              className={`relative rounded-xl px-1 py-2 flex flex-col items-center gap-0.5 border overflow-hidden ${
                                primary ? STATUS_STYLES[primary] : 'bg-white/[0.02] border-white/[0.05] text-muted-foreground/50'
                              } ${hasNote ? 'cursor-pointer ring-1 ring-amber-400/40' : ''}`}
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
                                      statuses.map((rec, i) => (
                                        <span
                                          key={i}
                                          title={`${t(`att.status.${rec.status}`)}${rec.note ? ` — ${rec.note}` : ''}`}
                                          className={`inline-flex items-center justify-center w-6 h-6 rounded-md border text-[10px] font-bold ${STATUS_STYLES[rec.status] ?? ''}`}
                                        >
                                          {t(`att.status.short.${rec.status}`)}
                                        </span>
                                      ))
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
