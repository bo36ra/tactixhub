import React, { useEffect } from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { useGetPlayingTimeSummary, useRecordPlayingTime, useListMatches, useListPlayers, getGetPlayingTimeSummaryQueryKey, getListMatchesQueryKey, getListPlayersQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { format } from 'date-fns';

export function PlayingTime() {
  const { t, isRtl } = useLanguage();
  const { activeTeamId } = useTeam();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const [matchId, setMatchId] = React.useState('');
  const [minutesMap, setMinutesMap] = React.useState<Record<number, string>>({});

  const { data: summary } = useGetPlayingTimeSummary(activeTeamId!, { query: { enabled: !!activeTeamId, queryKey: getGetPlayingTimeSummaryQueryKey(activeTeamId!) } });
  const { data: matches } = useListMatches(activeTeamId!, { query: { enabled: !!activeTeamId, queryKey: getListMatchesQueryKey(activeTeamId!) } });
  const { data: players } = useListPlayers(activeTeamId!, { query: { enabled: !!activeTeamId, queryKey: getListPlayersQueryKey(activeTeamId!) } });

  const recordTime = useRecordPlayingTime();

  useEffect(() => {
    if (players && Object.keys(minutesMap).length === 0) {
      const initial: Record<number, string> = {};
      players.forEach(p => initial[p.id] = ''); // empty string = 0 minutes default
      setMinutesMap(initial);
    }
  }, [players]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId || !matchId) return;
    
    const entries = Object.entries(minutesMap)
      .map(([playerId, minutes]) => ({
        playerId: Number(playerId),
        minutes: minutes === '' ? 0 : Number(minutes)
      }))
      .filter(e => e.minutes >= 0); // include zeros so records can be cleared/updated

    recordTime.mutate({
      teamId: activeTeamId,
      data: {
        matchId: parseInt(matchId, 10),
        entries
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPlayingTimeSummaryQueryKey(activeTeamId) });
        setOpen(false);
        setMatchId('');
        const initial: Record<number, string> = {};
        players?.forEach(p => initial[p.id] = '');
        setMinutesMap(initial);
      }
    });
  };

  if (!activeTeamId) return <NoTeamState />;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-2xl font-bold">{t('nav.playingTime')}</h2>
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> {t('time.add')}</Button>
            </DialogTrigger>
            <DialogContent dir={isRtl ? 'rtl' : 'ltr'} className="max-w-2xl max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>{t('time.add')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
                <div className="space-y-4 mb-4">
                  <div className="space-y-2">
                    <Label>{t('goal.match')}</Label>
                    <Select value={matchId} onValueChange={setMatchId}>
                      <SelectTrigger><SelectValue placeholder={t('common.select')} /></SelectTrigger>
                      <SelectContent>
                        {matches?.map(m => (
                          <SelectItem key={m.id} value={m.id.toString()}>
                            {m.opponent} ({format(new Date(m.date + 'T00:00:00'), 'MMM d')})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-1 space-y-2 min-h-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {players?.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-2 border rounded bg-muted/20">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono">{p.jerseyNumber}</span>
                          <span className="text-sm font-medium">{p.name}</span>
                        </div>
                        <Input 
                          type="number" 
                          min="0" 
                          max="130" 
                          placeholder="0"
                          className="w-20 h-8 text-right font-mono" 
                          value={minutesMap[p.id] || ''} 
                          onChange={e => setMinutesMap(prev => ({...prev, [p.id]: e.target.value}))} 
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit" disabled={recordTime.isPending || !matchId}>{t('common.save')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right">
              <thead className="bg-muted text-muted-foreground font-medium border-b">
                <tr>
                  <th className="px-6 py-4 w-16">#</th>
                  <th className="px-6 py-4">{t('common.name')}</th>
                  <th className="px-6 py-4 text-center">{t('time.totalMinutes')}</th>
                  <th className="px-6 py-4 text-center">{t('time.matchesPlayed')}</th>
                  <th className="px-6 py-4 text-center">{t('time.avg')}</th>
                  <th className="px-6 py-4 min-w-[200px]">{t('time.participation')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summary?.map(row => {
                  const rate = row.participationPct;
                  const barClass = rate >= 70 ? 'bg-green-500' : rate >= 40 ? 'bg-yellow-500' : 'bg-red-500';
                  return (
                    <tr key={row.playerId} className="hover:bg-muted/50">
                      <td className="px-6 py-4 font-mono font-medium text-muted-foreground">{row.jerseyNumber}</td>
                      <td className="px-6 py-4 font-semibold text-foreground">{row.playerName}</td>
                      <td className="px-6 py-4 text-center font-bold">{row.totalMinutes}'</td>
                      <td className="px-6 py-4 text-center font-medium">{row.matchesPlayed}</td>
                      <td className="px-6 py-4 text-center text-muted-foreground">{Math.round(row.avgPerMatch)}'</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3" dir="ltr">
                          <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.min(rate, 100)}%` }} />
                          </div>
                          <span className="text-xs font-bold w-9 text-right">{rate.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {summary?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      {t('common.noData')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
