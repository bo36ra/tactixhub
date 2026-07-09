import React, { useEffect } from 'react';
import { AppLayout } from '@/components/layout';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { useListPlayers, useCreateAttendance, useGetAttendanceSummary, getGetAttendanceSummaryQueryKey, getListPlayersQueryKey } from '@workspace/api-client-react';
import { AttendanceInputSessionType } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { format } from 'date-fns';

export function Attendance() {
  const { t, isRtl } = useLanguage();
  const { activeTeamId } = useTeam();
  const queryClient = useQueryClient();

  const [date, setDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [sessionType, setSessionType] = React.useState<AttendanceInputSessionType>('training');
  const [records, setRecords] = React.useState<Record<number, boolean>>({});

  const { data: players } = useListPlayers(activeTeamId!, {
    query: { enabled: !!activeTeamId, queryKey: getListPlayersQueryKey(activeTeamId!) }
  });

  const { data: summary } = useGetAttendanceSummary(activeTeamId!, {
    query: { enabled: !!activeTeamId, queryKey: getGetAttendanceSummaryQueryKey(activeTeamId!) }
  });

  const createAttendance = useCreateAttendance();

  // Initialize records when players load
  useEffect(() => {
    if (players && Object.keys(records).length === 0) {
      const initial: Record<number, boolean> = {};
      players.forEach(p => initial[p.id] = true); // Default all to present
      setRecords(initial);
    }
  }, [players]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId || !date) return;
    
    const entries = Object.entries(records).map(([playerId, present]) => ({
      playerId: Number(playerId),
      present
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
        // Reset to all present for convenience
        const initial: Record<number, boolean> = {};
        players?.forEach(p => initial[p.id] = true);
        setRecords(initial);
      }
    });
  };

  const togglePresence = (playerId: number, present: boolean) => {
    setRecords(prev => ({ ...prev, [playerId]: present }));
  };

  if (!activeTeamId) return null;

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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {players?.map(player => {
                    const isPresent = records[player.id];
                    return (
                      <div key={player.id} className="flex items-center justify-between p-3 border rounded-lg bg-background">
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground font-mono text-sm">{player.jerseyNumber}</span>
                          <span className="font-medium text-sm">{player.name}</span>
                        </div>
                        <div className="flex bg-muted rounded-md p-1">
                          <button
                            type="button"
                            onClick={() => togglePresence(player.id, true)}
                            className={`p-1.5 rounded text-sm transition-colors ${isPresent ? 'bg-green-100 text-green-700 shadow-sm' : 'text-muted-foreground hover:bg-black/5'}`}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePresence(player.id, false)}
                            className={`p-1.5 rounded text-sm transition-colors ${!isPresent ? 'bg-red-100 text-red-700 shadow-sm' : 'text-muted-foreground hover:bg-black/5'}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
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
