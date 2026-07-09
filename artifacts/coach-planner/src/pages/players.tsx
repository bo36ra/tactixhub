import React from 'react';
import { Link } from 'wouter';
import { AppLayout } from '@/components/layout';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { useListPlayers, useCreatePlayer, useDeletePlayer, getListPlayersQueryKey } from '@workspace/api-client-react';
import { PlayerInputPosition, PlayerInputStatus } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, Search } from 'lucide-react';

export function Players() {
  const { t, isRtl } = useLanguage();
  const { activeTeamId } = useTeam();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const [formData, setFormData] = React.useState({
    name: '',
    jerseyNumber: '',
    position: 'forward' as PlayerInputPosition,
    age: '',
    nationality: '',
    status: 'active' as PlayerInputStatus
  });

  const { data: players, isLoading } = useListPlayers(activeTeamId!, {
    query: { enabled: !!activeTeamId, queryKey: getListPlayersQueryKey(activeTeamId!) }
  });

  const [search, setSearch] = React.useState('');
  const [positionFilter, setPositionFilter] = React.useState<PlayerInputPosition | 'all'>('all');

  const filteredPlayers = React.useMemo(() => {
    return (players ?? []).filter(player => {
      const matchesSearch = player.name.toLowerCase().includes(search.trim().toLowerCase());
      const matchesPosition = positionFilter === 'all' || player.position === positionFilter;
      return matchesSearch && matchesPosition;
    });
  }, [players, search, positionFilter]);

  const createPlayer = useCreatePlayer();
  const deletePlayer = useDeletePlayer();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId) return;
    createPlayer.mutate({
      teamId: activeTeamId,
      data: {
        name: formData.name,
        jerseyNumber: Number(formData.jerseyNumber),
        position: formData.position,
        age: formData.age ? Number(formData.age) : undefined,
        nationality: formData.nationality || undefined,
        status: formData.status
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPlayersQueryKey(activeTeamId) });
        setOpen(false);
        setFormData({ name: '', jerseyNumber: '', position: 'forward', age: '', nationality: '', status: 'active' });
      }
    });
  };

  const handleDelete = (playerId: number) => {
    deletePlayer.mutate({ teamId: activeTeamId!, playerId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPlayersQueryKey(activeTeamId!) });
      }
    });
  };

  if (!activeTeamId) return null;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-2xl font-bold">{t('nav.players')}</h2>
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> {t('player.add')}</Button>
            </DialogTrigger>
            <DialogContent dir={isRtl ? 'rtl' : 'ltr'}>
              <DialogHeader>
                <DialogTitle>{t('player.add')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('common.name')}</Label>
                  <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('common.jersey')}</Label>
                    <Input type="number" required min="1" max="99" value={formData.jerseyNumber} onChange={e => setFormData({...formData, jerseyNumber: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('common.age')}</Label>
                    <Input type="number" min="10" max="60" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('common.nationality')}</Label>
                  <Input value={formData.nationality} onChange={e => setFormData({...formData, nationality: e.target.value})} placeholder={t('common.nationalityPlaceholder')} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('common.position')}</Label>
                    <Select value={formData.position} onValueChange={(val: PlayerInputPosition) => setFormData({...formData, position: val})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.values(PlayerInputPosition).map(pos => (
                          <SelectItem key={pos} value={pos}>{t(`position.${pos}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('common.status')}</Label>
                    <Select value={formData.status} onValueChange={(val: PlayerInputStatus) => setFormData({...formData, status: val})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.values(PlayerInputStatus).map(s => (
                          <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit" disabled={createPlayer.isPending}>{t('common.save')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search + position filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('common.searchPlaceholder')}
              className="ps-9"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setPositionFilter('all')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                positionFilter === 'all' ? 'bg-primary/15 text-primary border-primary/30' : 'text-muted-foreground border-white/[0.08] hover:bg-white/[0.04]'
              }`}
            >
              {t('common.filterAll')}
            </button>
            {Object.values(PlayerInputPosition).map(pos => (
              <button
                key={pos}
                onClick={() => setPositionFilter(pos)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  positionFilter === pos ? 'bg-primary/15 text-primary border-primary/30' : 'text-muted-foreground border-white/[0.08] hover:bg-white/[0.04]'
                }`}
              >
                {t(`position.${pos}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Empty state */}
        {players?.length === 0 && (
          <div className="bg-card border rounded-xl px-6 py-12 text-center text-muted-foreground">
            {t('common.noData')}
          </div>
        )}
        {players && players.length > 0 && filteredPlayers.length === 0 && (
          <div className="bg-card border rounded-xl px-6 py-12 text-center text-muted-foreground">
            {t('common.noResults')}
          </div>
        )}

        {/* Mobile: card list */}
        {filteredPlayers.length > 0 && (
          <div className="grid gap-2.5 sm:hidden">
            {filteredPlayers.map(player => {
              const pillClass = player.status === 'active' ? 'pill-green' : player.status === 'injured' ? 'pill-red' : 'pill-yellow';
              return (
                <div key={player.id} className="bg-card border rounded-xl p-4 flex items-center gap-3">
                  <Link href={`/players/${player.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-mono font-bold text-sm text-muted-foreground shrink-0">
                      {player.jerseyNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{player.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(`position.${player.position}`)}{player.age ? ` · ${player.age}` : ''}{player.nationality ? ` · ${player.nationality}` : ''}
                      </p>
                    </div>
                  </Link>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${pillClass}`}>
                    {t(`status.${player.status}`)}
                  </span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('player.deleteConfirm')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(player.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          {t('common.delete')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              );
            })}
          </div>
        )}

        {/* Desktop: table */}
        {filteredPlayers.length > 0 && (
          <div className="hidden sm:block bg-card border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted text-muted-foreground font-medium border-b">
                  <tr>
                    <th className="px-6 py-4 w-16">#</th>
                    <th className="px-6 py-4">{t('common.name')}</th>
                    <th className="px-6 py-4">{t('common.position')}</th>
                    <th className="px-6 py-4">{t('common.age')}</th>
                    <th className="px-6 py-4">{t('common.nationality')}</th>
                    <th className="px-6 py-4">{t('common.status')}</th>
                    <th className="px-6 py-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPlayers.map(player => {
                    const pillClass = player.status === 'active' ? 'pill-green' : player.status === 'injured' ? 'pill-red' : 'pill-yellow';
                    return (
                      <tr key={player.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-medium text-muted-foreground">{player.jerseyNumber}</td>
                        <td className="px-6 py-4 font-semibold text-foreground">
                          <Link href={`/players/${player.id}`} className="hover:text-primary hover:underline">
                            {player.name}
                          </Link>
                        </td>
                        <td className="px-6 py-4">{t(`position.${player.position}`)}</td>
                        <td className="px-6 py-4">{player.age || '-'}</td>
                        <td className="px-6 py-4">{player.nationality || '-'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium inline-block ${pillClass}`}>
                            {t(`status.${player.status}`)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
                                <AlertDialogDescription>{t('player.deleteConfirm')}</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(player.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  {t('common.delete')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
