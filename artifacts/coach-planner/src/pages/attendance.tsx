import React, { useEffect } from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { useListPlayers, useCreateAttendance, useGetAttendanceSummary, getGetAttendanceSummaryQueryKey, getListPlayersQueryKey } from '@workspace/api-client-react';
import { AttendanceInputSessionType } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';

// Statuses differ by session type: trainings track lateness with/without
// an excuse; match days track the call-up (starter / sub / not called).
export const TRAINING_STATUSES = ['present', 'late_excused', 'late_unexcused', 'absent'] as const;
export const MATCH_STATUSES = ['starter', 'substitute', 'not_called'] as const;
// Statuses where the coach usually wants to record the reason
export const NOTE_STATUSES = ['late_excused', 'late_unexcused', 'absent', 'not_called'];

export const STATUS_STYLES: Record<string, string> = {
  present: 'bg-green-500/15 text-green-500 border-green-500/30',
  late_excused: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30',
  late_unexcused: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
  absent: 'bg-red-500/15 text-red-500 border-red-500/30',
  starter: 'bg-primary/15 text-primary border-primary/30',
  substitute: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  not_called: 'bg-white/[0.06] text-muted-foreground border-white/10',
};

export function Attendance() {
  const { t, isRtl } = useLanguage();
  const { activeTeamId } = useTeam();
  const queryClient = useQueryClient();

  const [date, setDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [sessionType, setSessionType] = React.useState<AttendanceInputSessionType>('training');
  const [records, setRecords] = React.useState<Record<number, string>>({});
  const [notes, setNotes] = React.useState<Record<number, string>>({});

  const { data: players } = useListPlayers(activeTeamId!, {
    query: { enabled: !!activeTeamId, queryKey: getListPlayersQueryKey(activeTeamId!) }
  });

  const { data: summary } = useGetAttendanceSummary(activeTeamId!, {
    query: { enabled: !!activeTeamId, queryKey: getGetAttendanceSummaryQueryKey(activeTeamId!) }
  });

  const createAttendance = useCreateAttendance();

  // Default statuses: trainings assume everyone showed up; match days
  // assume everyone is on the bench (fewest taps for a typical squad).
  const defaultStatus = sessionType === 'match' ? 'substitute' : 'present';
  useEffect(() => {
    if (!players) return;
    const initial: Record<number, string> = {};
    players.forEach(p => initial[p.id] = defaultStatus);
    setRecords(initial);
    setNotes({});
  }, [players, sessionType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId || !date) return;
    
    const entries = Object.entries(records).map(([playerId, status]) => ({
      playerId: Number(playerId),
      status: status as any,
      ...(notes[Number(playerId)]?.trim() && { note: notes[Number(playerId)].trim() }),
    }));

    createAttendance.mutate({
      teamId: activeTeamId,
      data: {
        date: date,
        sessionType,
        records: entries
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAttendanceSummaryQueryKey(activeTeamId) });
        // Reset to defaults for convenience
        const initial: Record<number, string> = {};
        players?.forEach(p => initial[p.id] = defaultStatus);
        setRecords(initial);
        setNotes({});
      }
    });
  };

  const setStatus = (playerId: number, status: string) => {
    setRecords(prev => ({ ...prev, [playerId]: status }));
  };

  const statuses = sessionType === 'match' ? MATCH_STATUSES : TRAINING_STATUSES;

  if (!activeTeamId) return <NoTeamState />;

  return (
    <AppLayout>
      <div className="space-y-12">
        {/* Record Session Form */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">{t('nav.attendance')}</h2>
          
          <div className="bg-card border rounded-xl p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>{t('common.date')}</Label>
                  <Input type="date" required value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('common.type')}</Label>
                  <Select value={sessionType} onValueChange={(val: AttendanceInputSessionType) => setSessionType(val)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="training">{t('attendance.training')}</SelectItem>
                      <SelectItem value="match">{t('attendance.match')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={createAttendance.isPending} className="w-full">
                    {t('common.save')}
                  </Button>
                </div>
              </div>

              <div className="pt-6 border-t">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {players?.map(player => {
                    const current = records[player.id] ?? defaultStatus;
                    return (
                      <div key={player.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border rounded-lg bg-background">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-muted-foreground font-mono text-sm">{player.jerseyNumber}</span>
                          <span className="font-medium text-sm truncate">{player.name}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 shrink-0">
                          {statuses.map(status => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => setStatus(player.id, status)}
                              className={`px-2 py-1 rounded-md text-xs font-medium border transition-colors ${
                                current === status
                                  ? STATUS_STYLES[status]
                                  : 'border-transparent text-muted-foreground hover:bg-white/[0.05]'
                              }`}
                            >
                              {t(`att.status.${status}`)}
                            </button>
                          ))}
                        </div>
                        {NOTE_STATUSES.includes(current) && (
                          <input
                            type="text"
                            placeholder={t('att.notePh')}
                            value={notes[player.id] ?? ''}
                            onChange={e => setNotes(prev => ({ ...prev, [player.id]: e.target.value }))}
                            className="w-full sm:w-auto sm:flex-1 bg-transparent border border-border/60 rounded-md px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                {players?.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm">{t('common.noData')}</p>
                )}
              </div>
            </form>
          </div>
        </section>

        {/* Summary Table */}
        <section className="space-y-4">
          <h3 className="text-xl font-bold">{t('attendance.summary')}</h3>
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted text-muted-foreground font-medium border-b">
                  <tr>
                    <th className="px-6 py-4 w-16">#</th>
                    <th className="px-6 py-4">{t('common.name')}</th>
                    <th className="px-6 py-4 text-center">{t('attendance.present')}</th>
                    <th className="px-6 py-4 text-center">{t('attendance.absent')}</th>
                    <th className="px-6 py-4 text-right">{t('attendance.rate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary?.map(row => {
                    const rate = row.attendanceRate;
                    const pillClass = rate >= 80 ? 'pill-green' : rate >= 60 ? 'pill-yellow' : 'pill-red';
                    return (
                      <tr key={row.playerId} className="hover:bg-muted/50">
                        <td className="px-6 py-4 font-mono font-medium text-muted-foreground">{row.jerseyNumber}</td>
                        <td className="px-6 py-4 font-semibold text-foreground">{row.playerName}</td>
                        <td className="px-6 py-4 text-center text-green-700 font-medium">{row.totalPresent}</td>
                        <td className="px-6 py-4 text-center text-red-700 font-medium">{row.totalAbsent}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold inline-block ${pillClass}`} dir="ltr">
                            {rate.toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {summary?.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                        {t('common.noData')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
