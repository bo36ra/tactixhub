import React from 'react';
import { AppLayout } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { useTeam } from '@/lib/team-context';
import {
  useListTeams,
  useCreateTeam,
  useDeleteTeam,
  getListTeamsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2, CheckCircle2, Users } from 'lucide-react';

export function Teams() {
  const { t, isRtl } = useLanguage();
  const { activeTeamId, setActiveTeamId } = useTeam();
  const queryClient = useQueryClient();

  const [open, setOpen] = React.useState(false);
  const [formData, setFormData] = React.useState({ name: '', ageGroup: '', season: '' });

  const { data: teams, isLoading } = useListTeams();
  const createTeam = useCreateTeam();
  const deleteTeam = useDeleteTeam();

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    createTeam.mutate(
      {
        data: {
          name: formData.name.trim(),
          ageGroup: formData.ageGroup.trim() || undefined,
          season: formData.season.trim() || undefined,
        },
      },
      {
        onSuccess: (team) => {
          queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() });
          setActiveTeamId(team.id);
          setOpen(false);
          setFormData({ name: '', ageGroup: '', season: '' });
        },
      },
    );
  };

  const handleDelete = (teamId: number) => {
    deleteTeam.mutate(
      { teamId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() });
          if (activeTeamId === teamId) setActiveTeamId(null);
        },
      },
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">{t('nav.teams')}</h2>
            <p className="text-muted-foreground text-sm mt-1">{t('team.subtitle')}</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" /> {t('team.create')}
              </Button>
            </DialogTrigger>
            <DialogContent dir={isRtl ? 'rtl' : 'ltr'} className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('team.create')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('team.name')} *</Label>
                  <Input
                    required
                    placeholder={t('team.namePlaceholder')}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('team.ageGroup')}</Label>
                  <Input
                    placeholder={t('team.ageGroupPlaceholder')}
                    value={formData.ageGroup}
                    onChange={(e) => setFormData({ ...formData, ageGroup: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('team.season')}</Label>
                  <Input
                    placeholder={t('team.seasonPlaceholder')}
                    value={formData.season}
                    onChange={(e) => setFormData({ ...formData, season: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={createTeam.isPending}>
                    {t('common.save')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading && (
          <div className="py-12 text-center text-muted-foreground">{t('common.loading')}</div>
        )}

        {!isLoading && (!teams || teams.length === 0) && (
          <div className="py-20 text-center border-2 border-dashed rounded-xl space-y-3">
            <Users className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">{t('team.createFirst')}</p>
            <Button onClick={() => setOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" /> {t('team.create')}
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {teams?.map((team) => {
            const isActive = team.id === activeTeamId;
            return (
              <div
                key={team.id}
                className={`flex items-center justify-between p-5 rounded-xl border transition-all cursor-pointer ${
                  isActive
                    ? 'border-foreground bg-foreground text-background'
                    : 'bg-card hover:border-foreground/30'
                }`}
                onClick={() => setActiveTeamId(team.id)}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${
                      isActive ? 'bg-background text-foreground' : 'bg-muted text-foreground'
                    }`}
                  >
                    {team.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-base">{team.name}</p>
                    <p className={`text-xs mt-0.5 ${isActive ? 'text-background/60' : 'text-muted-foreground'}`}>
                      {[team.ageGroup, team.season].filter(Boolean).join(' · ') || t('team.noDetails')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {isActive && (
                    <span className="flex items-center gap-1.5 text-xs font-medium bg-background/20 text-background px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t('team.active')}
                    </span>
                  )}
                  {/* Previously hidden when only one team existed
                      (teams.length > 1), which made it look like there was
                      no delete feature at all. Deleting the last team is a
                      valid action — the page falls back to the "create your
                      first team" state. */}
                  <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${
                            isActive
                              ? 'text-background/60 hover:text-background hover:bg-background/10'
                              : 'text-muted-foreground hover:text-destructive'
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
                          <AlertDialogDescription>{t('team.deleteConfirm')}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(team.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {t('common.delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
