import React from 'react';
import { PageTitle } from '@/components/page-header';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { playerName } from '@/lib/player-name';
import { useListCards, useCreateCard, useDeleteCard, useGetCardsSummary, useListMatches, useListPlayers, getListCardsQueryKey, getGetCardsSummaryQueryKey, getListMatchesQueryKey, getListPlayersQueryKey } from '@workspace/api-client-react';
import { CardInputCardType } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';

export function Cards() {
  const { t, isRtl, lang } = useLanguage();
  const { activeTeamId } = useTeam();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const [formData, setFormData] = React.useState({
    matchId: '',
    playerId: '',
    cardType: 'yellow' as CardInputCardType,
    minute: ''
  });

  const { data: cards } = useListCards(activeTeamId!, { query: { enabled: !!activeTeamId, queryKey: getListCardsQueryKey(activeTeamId!) } });
  const { data: summary } = useGetCardsSummary(activeTeamId!, { query: { enabled: !!activeTeamId, queryKey: getGetCardsSummaryQueryKey(activeTeamId!) } });
  const { data: matches } = useListMatches(activeTeamId!, { query: { enabled: !!activeTeamId, queryKey: getListMatchesQueryKey(activeTeamId!) } });
  const { data: players } = useListPlayers(activeTeamId!, { query: { enabled: !!activeTeamId, queryKey: getListPlayersQueryKey(activeTeamId!) } });

  const createCard = useCreateCard();
  const deleteCard = useDeleteCard();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId || !formData.matchId || !formData.playerId) return;
    createCard.mutate({
      teamId: activeTeamId,
      data: {
        matchId: parseInt(formData.matchId, 10),
        playerId: parseInt(formData.playerId, 10),
        cardType: formData.cardType,
        minute: parseInt(formData.minute, 10)
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCardsQueryKey(activeTeamId) });
        queryClient.invalidateQueries({ queryKey: getGetCardsSummaryQueryKey(activeTeamId) });
        setOpen(false);
        setFormData(prev => ({ ...prev, minute: '' }));
      }
    });
  };

  const handleDelete = (cardId: number) => {
    deleteCard.mutate({ teamId: activeTeamId!, cardId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCardsQueryKey(activeTeamId!) });
        queryClient.invalidateQueries({ queryKey: getGetCardsSummaryQueryKey(activeTeamId!) });
      }
    });
  };

  if (!activeTeamId) return <NoTeamState />;

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <PageTitle>{t('nav.cards')}</PageTitle>
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> {t('card.add')}</Button>
            </DialogTrigger>
            <DialogContent dir={isRtl ? 'rtl' : 'ltr'} className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('card.add')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
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

                <div className="space-y-2">
                  <Label>{t('card.player')}</Label>
                  <Select value={formData.playerId} onValueChange={v => setFormData({...formData, playerId: v})}>
                    <SelectTrigger><SelectValue placeholder={t('common.select')} /></SelectTrigger>
                    <SelectContent>
                      {players?.map(p => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.jerseyNumber} - {playerName(p, lang)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('common.type')}</Label>
                    <Select value={formData.cardType} onValueChange={(v: CardInputCardType) => setFormData({...formData, cardType: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yellow">{t('card.yellow')}</SelectItem>
                        <SelectItem value="red">{t('card.red')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('goal.minute')}</Label>
                    <Input type="number" required min="1" max="130" value={formData.minute} onChange={e => setFormData({...formData, minute: e.target.value})} />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit" disabled={createCard.isPending || !formData.matchId || !formData.playerId}>{t('common.save')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Discipline Summary Table */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold">{t('nav.cards')}</h3>
            <div className="bg-card border rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted text-muted-foreground font-medium border-b">
                  <tr>
                    <th className="px-4 py-3">{t('common.name')}</th>
                    <th className="px-4 py-3 text-center">{t('card.yellow')}</th>
                    <th className="px-4 py-3 text-center">{t('card.red')}</th>
                    <th className="px-4 py-3">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary?.map((row) => {
                    const statusClass = 
                      row.status === 'suspended' ? 'pill-red' : 
                      row.status === 'warning' ? 'pill-yellow' : 
                      row.status === 'caution' ? 'bg-orange-100 text-orange-800' : 'pill-green';
                    
                    return (
                      <tr key={row.playerId} className="hover:bg-muted/50">
                        <td className="px-4 py-3 font-semibold">{row.playerName}</td>
                        <td className="px-4 py-3 text-center font-medium text-yellow-600">{row.yellowCards}</td>
                        <td className="px-4 py-3 text-center font-medium text-red-600">{row.redCards}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${statusClass}`}>
                            {t(`discipline.${row.status}`)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {summary?.length === 0 && (
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

          {/* Cards Log Table */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold">Log</h3>
            <div className="bg-card border rounded-xl overflow-hidden h-[500px] overflow-y-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted text-muted-foreground font-medium border-b sticky top-0">
                  <tr>
                    <th className="px-4 py-3 w-16">{t('goal.minute')}</th>
                    <th className="px-4 py-3">{t('common.type')}</th>
                    <th className="px-4 py-3">{t('card.player')}</th>
                    <th className="px-4 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cards?.map((card) => {
                    const isYellow = card.cardType === 'yellow';
                    return (
                      <tr key={card.id} className="hover:bg-muted/50">
                        <td className="px-4 py-3 font-mono text-muted-foreground">{card.minute}'</td>
                        <td className="px-4 py-3">
                          <div className={`w-4 h-6 rounded-sm shadow-sm ${isYellow ? 'bg-yellow-400' : 'bg-red-600'}`} />
                        </td>
                        <td className="px-4 py-3 font-semibold">{card.playerName}</td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/60 hover:text-destructive active:text-destructive" onClick={() => handleDelete(card.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {cards?.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
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
