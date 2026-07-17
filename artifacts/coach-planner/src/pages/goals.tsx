import React from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { playerName } from '@/lib/player-name';
import { 
  useListGoals, useCreateGoal, useDeleteGoal, useGetTopScorers,
  useListMatches, useListPlayers,
  getListGoalsQueryKey, getGetTopScorersQueryKey, getListMatchesQueryKey, getListPlayersQueryKey
} from '@workspace/api-client-react';
import { GoalInputType, GoalInputMethod } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';

export function Goals() {
  const { t, isRtl, lang } = useLanguage();
  const { activeTeamId } = useTeam();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const showApiError = (err: unknown) =>
    toast({ title: t('common.saveFailed'), description: err instanceof Error ? err.message : undefined, variant: 'destructive' as any });
  const [open, setOpen] = React.useState(false);

  const [formData, setFormData] = React.useState({
    type: 'scored' as GoalInputType,
    matchId: '',
    scorerPlayerId: 'none',
    minute: '',
    method: 'open_play' as GoalInputMethod,
    note: ''
  });

  const { data: goals } = useListGoals(activeTeamId!, { query: { enabled: !!activeTeamId, queryKey: getListGoalsQueryKey(activeTeamId!) } });
  const { data: topScorers } = useGetTopScorers(activeTeamId!, { query: { enabled: !!activeTeamId, queryKey: getGetTopScorersQueryKey(activeTeamId!) } });
  const { data: matches } = useListMatches(activeTeamId!, { query: { enabled: !!activeTeamId, queryKey: getListMatchesQueryKey(activeTeamId!) } });
  const { data: players } = useListPlayers(activeTeamId!, { query: { enabled: !!activeTeamId, queryKey: getListPlayersQueryKey(activeTeamId!) } });

  const createGoal = useCreateGoal();
  const deleteGoal = useDeleteGoal();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId || !formData.matchId) return;
    createGoal.mutate({
      teamId: activeTeamId,
      data: {
        matchId: parseInt(formData.matchId, 10),
        type: formData.type,
        scorerPlayerId: formData.type === 'scored' && formData.scorerPlayerId !== 'none' ? parseInt(formData.scorerPlayerId, 10) : undefined,
        minute: parseInt(formData.minute, 10),
        method: formData.method,
        ...(formData.note.trim() && { note: formData.note.trim() })
      }
    }, {
      onError: showApiError,
      onSuccess: () => {
        toast({ title: t('goal.saved') });
        queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey(activeTeamId) });
        queryClient.invalidateQueries({ queryKey: getGetTopScorersQueryKey(activeTeamId) });
        setOpen(false);
        setFormData(prev => ({ ...prev, minute: '', scorerPlayerId: 'none', note: '' }));
      }
    });
  };

  const handleDelete = (goalId: number) => {
    deleteGoal.mutate({ teamId: activeTeamId!, goalId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey(activeTeamId!) });
        queryClient.invalidateQueries({ queryKey: getGetTopScorersQueryKey(activeTeamId!) });
      }
    });
  };

  const matchMap = React.useMemo(() => {
    const map: Record<number, any> = {};
    matches?.forEach(m => map[m.id] = m);
    return map;
  }, [matches]);

  if (!activeTeamId) return <NoTeamState />;

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-2xl font-bold">{t('nav.goals')}</h2>
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> {t('goal.add')}</Button>
            </DialogTrigger>
            <DialogContent dir={isRtl ? 'rtl' : 'ltr'} className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('goal.add')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('common.type')}</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="goalType" checked={formData.type === 'scored'} onChange={() => setFormData({...formData, type: 'scored'})} className="accent-primary" />
                      <span>{t('goal.typeScored')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="goalType" checked={formData.type === 'conceded'} onChange={() => setFormData({...formData, type: 'conceded', scorerPlayerId: 'none'})} className="accent-primary" />
                      <span>{t('goal.typeConceded')}</span>
                    </label>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>{t('goal.match')}</Label>
                  <Select value={formData.matchId} onValueChange={v => setFormData({...formData, matchId: v})}>
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

                {formData.type === 'scored' && (
                  <div className="space-y-2">
                    <Label>{t('goal.scorer')}</Label>
                    <Select value={formData.scorerPlayerId} onValueChange={v => setFormData({...formData, scorerPlayerId: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- {t('common.select')} --</SelectItem>
                        {players?.map(p => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            {p.jerseyNumber} - {playerName(p, lang)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('goal.minute')}</Label>
                    <Input type="number" required min="1" max="130" value={formData.minute} onChange={e => setFormData({...formData, minute: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('goal.method')}</Label>
                    <Select value={formData.method} onValueChange={(v: GoalInputMethod) => setFormData({...formData, method: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.values(GoalInputMethod).map(m => (
                          <SelectItem key={m} value={m}>{t(`goal.${m}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t('goal.note')}</Label>
                  <Textarea
                    rows={2}
                    placeholder={t('goal.notePlaceholder')}
                    value={formData.note}
                    onChange={e => setFormData({...formData, note: e.target.value})}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit" disabled={createGoal.isPending || !formData.matchId}>{t('common.save')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Top Scorers Table */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold">{t('dash.topScorers')}</h3>
            <div className="bg-card border rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted text-muted-foreground font-medium border-b">
                  <tr>
                    <th className="px-4 py-3 w-12">#</th>
                    <th className="px-4 py-3">{t('common.name')}</th>
                    <th className="px-4 py-3 text-center">{t('stat.goalsScored')}</th>
                    <th className="px-4 py-3 text-center">{t('goals.conceded')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {topScorers?.map((scorer, i) => (
                    <tr key={scorer.playerId} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-muted-foreground font-medium">{i + 1}</td>
                      <td className="px-4 py-3 font-semibold">{scorer.playerName}</td>
                      <td className="px-4 py-3 text-center font-bold">{scorer.goalsScored}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {scorer.position === 'goalkeeper' ? scorer.goalsConceded : '-'}
                      </td>
                    </tr>
                  ))}
                  {topScorers?.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        {t('common.noData')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Goal Log Table */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold">{t('nav.goals')} ({t('goal.typeScored')} & {t('goal.typeConceded')})</h3>
            <div className="bg-card border rounded-xl overflow-hidden h-[500px] overflow-y-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted text-muted-foreground font-medium border-b sticky top-0">
                  <tr>
                    <th className="px-4 py-3 w-16">{t('goal.minute')}</th>
                    <th className="px-4 py-3">{t('common.type')}</th>
                    <th className="px-4 py-3">{t('goal.match')}</th>
                    <th className="px-4 py-3">{t('goal.scorer')}</th>
                    <th className="px-4 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {goals?.map((goal) => {
                    const match = matchMap[goal.matchId];
                    const isScored = goal.type === 'scored';
                    const pillClass = isScored ? 'pill-green' : 'pill-red';
                    return (
                      <tr key={goal.id} className="hover:bg-muted/50">
                        <td className="px-4 py-3 font-mono text-muted-foreground">{goal.minute}'</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${pillClass}`}>
                            {isScored ? t('goal.typeScored') : t('goal.typeConceded')}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium">{match?.opponent}</td>
                        <td className="px-4 py-3">
                          {isScored ? <span className="font-semibold">{goal.scorerName || '-'}</span> : <span className="text-muted-foreground">{t(`goal.${goal.method}`)}</span>}
                          {goal.note && (
                            <p className="text-xs text-muted-foreground mt-1 max-w-64 whitespace-pre-wrap">{goal.note}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/60 hover:text-destructive active:text-destructive" onClick={() => handleDelete(goal.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {goals?.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                        {t('common.noData')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
