import React from 'react';
import { AppLayout } from '@/components/layout';
import { StickyHeader, PageTitle } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { PullToRefresh } from '@/components/pull-to-refresh';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { useGetDashboard, useCreateTeam, getListTeamsQueryKey, getGetDashboardQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useQueryClient } from '@tanstack/react-query';
import { Users, Swords, Target, ShieldAlert, Dumbbell, Check } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'wouter';
import { focusLabel } from '@/pages/trainings';

function CreateTeamModal() {
  const { t } = useLanguage();
  const createTeam = useCreateTeam();
  const [name, setName] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createTeam.mutate({ data: { name } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() });
        setOpen(false);
        setName('');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full md:w-auto">{t('team.create')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('team.create')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('team.name')}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createTeam.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Dashboard() {
  const { t, isRtl } = useLanguage();
  const { activeTeamId } = useTeam();
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { data: stats, isLoading, refetch } = useGetDashboard(
    activeTeamId!,
    { date: todayStr },
    { query: { enabled: !!activeTeamId, queryKey: getGetDashboardQueryKey(activeTeamId!) } },
  );

  if (!activeTeamId) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <h2 className="text-2xl font-bold text-foreground">{t('team.createFirst')}</h2>
          <CreateTeamModal />
        </div>
      </AppLayout>
    );
  }

  if (isLoading || !stats) {
    return (
      <AppLayout>
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
          <Skeleton className="h-40 rounded-xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PullToRefresh onRefresh={() => refetch()}>
      <div className="space-y-5">
        <StickyHeader>
          <PageTitle>{t('nav.dashboard')}</PageTitle>
        </StickyHeader>

        {/* Today — the day's action items, front and center */}
        {stats.today && (
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{t('dashboard.today')}</h3>
            {stats.today.trainings.length === 0 && stats.today.matches.length === 0 ? (
              <div className="bg-card border rounded-xl p-4 text-sm text-muted-foreground text-center">
                {t('dashboard.todayEmpty')}
              </div>
            ) : (
              <div className="grid gap-2">
                {stats.today.trainings.length > 0 && (
                  <div className="bg-card border rounded-xl p-3.5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Dumbbell className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{t('dashboard.trainingToday')}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {stats.today.trainings.map((tr) => focusLabel(t, tr.focus)).join(' + ')}
                        {stats.today.trainings[0].time ? ` · ${stats.today.trainings[0].time}` : ''}
                      </p>
                    </div>
                    <Link href="/attendance">
                      <Button size="sm" variant={stats.today.attendanceMarked ? 'outline' : 'default'} className="gap-1.5 shrink-0">
                        {stats.today.attendanceMarked && <Check className="w-3.5 h-3.5" />}
                        {stats.today.attendanceMarked ? t('dashboard.attendanceDone') : t('dashboard.markAttendance')}
                      </Button>
                    </Link>
                  </div>
                )}
                {stats.today.matches.map((m) => (
                  <div key={m.id} className="bg-card border rounded-xl p-3.5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Swords className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{t('dashboard.matchToday')}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.opponent}</p>
                    </div>
                    <Link href="/matches">
                      <Button size="sm" variant="outline" className="shrink-0">{t('dashboard.viewMatch')}</Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-card border p-4 rounded-xl shadow-sm space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">{t('stat.totalPlayers')}</span>
              <Users className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.totalPlayers}</p>
          </div>
          
          <div className="bg-card border p-4 rounded-xl shadow-sm space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">{t('stat.winRate')}</span>
              <Swords className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {stats.wins} <span className="text-sm text-muted-foreground font-normal">/ {stats.totalMatches}</span>
            </p>
          </div>

          <div className="bg-card border p-4 rounded-xl shadow-sm space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">{t('stat.goalsScored')}</span>
              <Target className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.goalsScored}</p>
          </div>

          <div className="bg-card border p-4 rounded-xl shadow-sm space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">{t('stat.goalsConceded')}</span>
              <ShieldAlert className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.goalsConceded}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Matches */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-lg font-bold">{t('dash.recentMatches')}</h3>
            <div className="bg-card border rounded-xl overflow-hidden">
              {stats.recentMatches.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">{t('common.noData')}</div>
              ) : (
                <div className="divide-y">
                  {stats.recentMatches.map(match => {
                    const result = match.ourGoals > match.theirGoals ? 'win' : match.ourGoals < match.theirGoals ? 'loss' : 'draw';
                    const pillClass = result === 'win' ? 'pill-green' : result === 'loss' ? 'pill-red' : 'pill-gray';
                    return (
                      <div key={match.id} className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-foreground">{match.opponent}</p>
                          <p className="text-sm text-muted-foreground">{format(new Date(match.date), 'MMM d, yyyy')} • {t(`match.${match.type}`)}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <p className="font-bold text-lg" dir="ltr">{match.ourGoals} - {match.theirGoals}</p>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${pillClass}`}>
                            {t(`match.${result}`)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-8">
            {/* Top Scorers */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold">{t('dash.topScorers')}</h3>
              <div className="bg-card border rounded-xl overflow-hidden">
                {stats.topScorers.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">{t('common.noData')}</div>
                ) : (
                  <div className="divide-y">
                    {stats.topScorers.map(scorer => (
                      <div key={scorer.playerId} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground font-mono w-4">{scorer.jerseyNumber}</span>
                          <span className="font-medium text-foreground">{scorer.playerName}</span>
                        </div>
                        <span className="font-bold">{scorer.goalsScored}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Card Warnings */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold">{t('dash.cardWarnings')}</h3>
              <div className="bg-card border rounded-xl overflow-hidden">
                {stats.cardWarnings.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">{t('common.noData')}</div>
                ) : (
                  <div className="divide-y">
                    {stats.cardWarnings.map(card => {
                      const pillClass = card.status === 'suspended' ? 'pill-red' : card.status === 'warning' ? 'pill-yellow' : 'pill-gray';
                      return (
                        <div key={card.playerId} className="p-4 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">{card.playerName}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pillClass}`}>
                              {t(`discipline.${card.status}`)}
                            </span>
                          </div>
                          <div className="flex gap-2 text-sm">
                            <span className="text-yellow-600 font-medium">{card.yellowCards} {t('card.yellow')}</span>
                            <span className="text-red-600 font-medium">{card.redCards} {t('card.red')}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      </PullToRefresh>
    </AppLayout>
  );
}
