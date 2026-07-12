import React from 'react';
import { Link } from 'wouter';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { useListMatches, useCreateMatch, useDeleteMatch, getListMatchesQueryKey } from '@workspace/api-client-react';
import { MatchInputType } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, Calendar, LayoutGrid, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import { MatchPlanDialog } from '@/components/match-plan-dialog';

export function Matches() {
  const { t, isRtl } = useLanguage();
  const { activeTeamId } = useTeam();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [planMatchId, setPlanMatchId] = React.useState<number | null>(null);

  const [formData, setFormData] = React.useState({
    opponent: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 'league' as MatchInputType,
    ourGoals: '0',
    theirGoals: '0'
  });

  const { data: matches } = useListMatches(activeTeamId!, {
    query: { enabled: !!activeTeamId, queryKey: getListMatchesQueryKey(activeTeamId!) }
  });

  const createMatch = useCreateMatch();
  const deleteMatch = useDeleteMatch();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId) return;
    createMatch.mutate({
      teamId: activeTeamId,
      data: {
        opponent: formData.opponent,
        date: formData.date,
        type: formData.type,
        ourGoals: parseInt(formData.ourGoals, 10),
        theirGoals: parseInt(formData.theirGoals, 10)
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey(activeTeamId) });
        setOpen(false);
        setFormData({ opponent: '', date: format(new Date(), 'yyyy-MM-dd'), type: 'league', ourGoals: '0', theirGoals: '0' });
      }
    });
  };

  const handleDelete = (matchId: number) => {
    deleteMatch.mutate({ teamId: activeTeamId!, matchId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey(activeTeamId!) });
      }
    });
  };

  if (!activeTeamId) return <NoTeamState />;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-2xl font-bold">{t('nav.matches')}</h2>
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> {t('match.add')}</Button>
            </DialogTrigger>
            <DialogContent dir={isRtl ? 'rtl' : 'ltr'}>
              <DialogHeader>
                <DialogTitle>{t('match.add')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('match.opponent')}</Label>
                  <Input required value={formData.opponent} onChange={e => setFormData({...formData, opponent: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('common.date')}</Label>
                    <Input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('common.type')}</Label>
                    <Select value={formData.type} onValueChange={(val: MatchInputType) => setFormData({...formData, type: val})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.values(MatchInputType).map(type => (
                          <SelectItem key={type} value={type}>{t(`match.${type}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('match.ourGoals')}</Label>
                    <Input type="number" required min="0" value={formData.ourGoals} onChange={e => setFormData({...formData, ourGoals: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('match.theirGoals')}</Label>
                    <Input type="number" required min="0" value={formData.theirGoals} onChange={e => setFormData({...formData, theirGoals: e.target.value})} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit" disabled={createMatch.isPending}>{t('common.save')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {matches?.map(match => {
            const result = match.ourGoals > match.theirGoals ? 'win' : match.ourGoals < match.theirGoals ? 'loss' : 'draw';
            const resultBg = result === 'win' ? 'bg-green-50/50' : result === 'loss' ? 'bg-red-50/50' : 'bg-yellow-50/50';
            const pillClass = result === 'win' ? 'pill-green' : result === 'loss' ? 'pill-red' : 'pill-yellow';
            
            return (
              <div key={match.id} className={`bg-card border rounded-xl overflow-hidden transition-all hover:shadow-md ${resultBg}`}>
                <div className="p-5 flex justify-between items-start border-b border-border/50">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{format(new Date(match.date + 'T00:00:00'), 'MMM d, yyyy')}</span>
                    </div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t(`match.${match.type}`)}</p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive -mt-1 -mr-2">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('match.deleteConfirm')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(match.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          {t('common.delete')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <div className="p-6 flex flex-col items-center justify-center gap-4 bg-card/80">
                  <div className="text-center w-full truncate font-bold text-lg text-foreground px-4">
                    {match.opponent}
                  </div>
                  <div className="flex items-center justify-center gap-6">
                    <div className="text-4xl font-black tabular-nums tracking-tighter" dir="ltr">{match.ourGoals}</div>
                    <div className="text-muted-foreground font-medium">-</div>
                    <div className="text-4xl font-black tabular-nums tracking-tighter text-muted-foreground" dir="ltr">{match.theirGoals}</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mt-2 ${pillClass}`}>
                    {t(`match.${result}`)}
                  </span>
                  <div className="flex gap-2 mt-1">
                    <Link href={`/matches/${match.id}/lineup`}>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <LayoutGrid className="w-3.5 h-3.5" />
                        {t('match.lineup')}
                      </Button>
                    </Link>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPlanMatchId(match.id)}>
                      <ClipboardList className="w-3.5 h-3.5" />
                      {t('plan.open')}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          {matches?.length === 0 && (
            <div className="col-span-full py-20 text-center text-muted-foreground border-2 border-dashed rounded-xl">
              {t('common.noData')}
            </div>
          )}
        </div>

        {planMatchId !== null && activeTeamId && matches && (
          <MatchPlanDialog
            teamId={activeTeamId}
            match={matches.find((m) => m.id === planMatchId)!}
            allMatches={matches}
            open={planMatchId !== null}
            onOpenChange={(o) => !o && setPlanMatchId(null)}
          />
        )}
      </div>
    </AppLayout>
  );
}
