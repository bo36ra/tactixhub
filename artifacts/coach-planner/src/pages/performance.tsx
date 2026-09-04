import React, { useState } from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { playerName } from '@/lib/player-name';
import { PlayerAvatar } from '@/components/player-avatar';
import { JerseyNumber } from '@/components/jersey-number';
import { useTeam } from '@/lib/team-context';
import { useListPlayers, useListMatches } from '@workspace/api-client-react';
import { useTactics, parseBoard } from '@/lib/tactics-api';
import {
  useInjuries, useCreateInjury, useUpdateInjury, useDeleteInjury,
  useRatings, useSaveRating, useRatingsSummary,
} from '@/lib/dev-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Activity, Star, Plus, Trash2, Save } from 'lucide-react';

export default function Performance() {
  const { t, lang } = useLanguage();
  const { activeTeamId } = useTeam();
  if (!activeTeamId) return <NoTeamState />;
  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold font-display">{t('nav.performance')}</h1>
        </div>
        <Tabs defaultValue="ratings">
          <TabsList>
            <TabsTrigger value="ratings">{t('perf.tabRatings')}</TabsTrigger>
            <TabsTrigger value="injuries">{t('perf.tabInjuries')}</TabsTrigger>
          </TabsList>
          <TabsContent value="ratings"><RatingsTab teamId={activeTeamId} t={t} /></TabsContent>
          <TabsContent value="injuries"><InjuriesTab teamId={activeTeamId} t={t} /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function RatingsTab({ teamId, t }: { teamId: number; t: (k: string) => string }) {
  const { lang } = useLanguage();
  const { data: matches } = useListMatches(teamId);
  const { data: players } = useListPlayers(teamId);
  const [matchId, setMatchId] = useState<number | null>(null);
  const { data: ratings } = useRatings(teamId, matchId);
  const save = useSaveRating(teamId, matchId);
  const { data: allTactics } = useTactics(teamId);

  const ratingFor = (playerId: number) => (ratings ?? []).find((r) => r.playerId === playerId);
  const [view, setView] = useState<'match' | 'season'>('match');
  const { data: summary } = useRatingsSummary(teamId);
  const summaryRows = React.useMemo(() => {
    const byPlayer = new Map((summary ?? []).map((s) => [s.playerId, s]));
    return (players ?? [])
      .map((p: any) => ({ player: p, entry: byPlayer.get(p.id) }))
      .filter((r) => r.entry)
      .sort((a, b) => (b.entry!.avgRating - a.entry!.avgRating));
  }, [players, summary]);

  // If a match-plan tactic is linked to this match, use its lineup to
  // order the ratings list — starting XI in their actual formation
  // order (goalkeeper through attack, by pitch position) first, then
  // whoever isn't in that lineup after. Falls back to plain roster
  // order when no match plan exists for this match yet.
  const { orderedPlayers, hasLineup } = React.useMemo(() => {
    const roster = players ?? [];
    if (!matchId) return { orderedPlayers: roster, hasLineup: false };
    const plan = (allTactics ?? []).find((tc) => tc.kind === 'match_plan' && tc.matchId === matchId);
    if (!plan) return { orderedPlayers: roster, hasLineup: false };
    const lineupIds = parseBoard(plan.data).markers
      .filter((m) => m.side === 'us' && m.playerId != null)
      .sort((a, b) => a.y - b.y)
      .map((m) => m.playerId as number);
    if (lineupIds.length === 0) return { orderedPlayers: roster, hasLineup: false };
    const byId = new Map(roster.map((p: any) => [p.id, p]));
    const lineup = lineupIds.map((id) => byId.get(id)).filter(Boolean);
    const rest = roster.filter((p: any) => !lineupIds.includes(p.id));
    return { orderedPlayers: [...lineup, ...rest], hasLineup: true };
  }, [players, matchId, allTactics]);

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setView('match')}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${view === 'match' ? 'bg-primary/15 text-primary border-primary/40' : 'border-border text-muted-foreground'}`}
        >
          {t('perf.matchView')}
        </button>
        <button
          type="button"
          onClick={() => setView('season')}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${view === 'season' ? 'bg-primary/15 text-primary border-primary/40' : 'border-border text-muted-foreground'}`}
        >
          {t('perf.seasonView')}
        </button>
      </div>

      {view === 'season' ? (
        summaryRows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t('perf.noRatingsYet')}</p>
        ) : (
          <div className="space-y-1.5">
            {summaryRows.map(({ player, entry }, i) => (
              <div key={player.id} className="flex items-center gap-3 border border-border rounded-lg p-2.5 bg-card">
                <span className="text-xs text-muted-foreground w-5 text-center shrink-0">{i + 1}</span>
                <PlayerAvatar photo={player.photo} jerseyNumber={player.jerseyNumber} className="w-8 h-8 text-xs shrink-0" />
                <span className="flex-1 truncate font-medium">{playerName(player, lang)}</span>
                <span className="text-xs text-muted-foreground shrink-0">{t('perf.ratingsCount').replace('{n}', String(entry!.count))}</span>
                <span className="pill-beige rounded px-2 py-0.5 text-xs font-bold flex items-center gap-1 shrink-0">
                  <Star className="w-3 h-3" />{entry!.avgRating}/10
                </span>
              </div>
            ))}
          </div>
        )
      ) : (
      <>
      <Select value={matchId ? String(matchId) : ''} onValueChange={(v) => setMatchId(parseInt(v))}>
        <SelectTrigger className="max-w-72"><SelectValue placeholder={t('perf.pickMatch')} /></SelectTrigger>
        <SelectContent>
          {(matches ?? []).map((m: any) => (
            <SelectItem key={m.id} value={String(m.id)}>{m.opponent} — {m.date}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {matchId && (
        <>
        {(ratings ?? []).length > 0 && (
          <div className="border border-border rounded-xl p-3 bg-card space-y-1.5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('perf.matchRatingsReport')}</h3>
            {(ratings ?? [])
              .slice()
              .sort((a, b) => b.rating - a.rating)
              .map((r) => {
                const p = (players ?? []).find((pl: any) => pl.id === r.playerId);
                if (!p) return null;
                return (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 truncate">
                      <PlayerAvatar photo={p.photo} jerseyNumber={p.jerseyNumber} className="w-6 h-6 text-[10px]" />
                      <span className="truncate">{playerName(p, lang)}</span>
                    </span>
                    <span className="pill-beige rounded px-2 py-0.5 text-xs font-bold flex items-center gap-1 shrink-0">
                      <Star className="w-3 h-3" />{r.rating}/10
                    </span>
                  </div>
                );
              })}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {hasLineup && (
            <p className="sm:col-span-2 text-xs text-primary bg-primary/10 rounded-lg px-3 py-1.5">{t('perf.orderedByLineup')}</p>
          )}
          {orderedPlayers.map((p: any) => {
            const r = ratingFor(p.id);
            return (
              <div key={p.id} className="border border-border rounded-lg p-3 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold flex items-center gap-2"><PlayerAvatar photo={p.photo} jerseyNumber={p.jerseyNumber} className="w-7 h-7 text-[11px]" /><span className="truncate">{playerName(p, lang)}</span></span>
                  {r && <span className="pill-beige rounded px-2 py-0.5 text-xs flex items-center gap-1">
                    <Star className="w-3 h-3" />{r.rating}/10</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button key={n}
                      onClick={() => save.mutate({ playerId: p.id, rating: n },
                        {
                          onSuccess: () => toast({ title: t('tactics.saved') }),
                          onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }),
                        })}
                      className={`w-7 h-7 rounded text-xs font-bold border transition-colors ${
                        r?.rating === n
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:border-primary'
                      }`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}
      </>
      )}
    </div>
  );
}

function InjuriesTab({ teamId, t }: { teamId: number; t: (k: string) => string }) {
  const { lang } = useLanguage();
  const { data: players } = useListPlayers(teamId);
  const { data: injuries, isLoading } = useInjuries(teamId);
  const create = useCreateInjury(teamId);
  const update = useUpdateInjury(teamId);
  const del = useDeleteInjury(teamId);
  const [form, setForm] = useState<{ playerId: string; type: string; date: string; expectedReturn: string; notes: string } | null>(null);

  const STATUS_STYLE: Record<string, string> = {
    out: 'bg-destructive/15 text-red-400 border border-destructive/30',
    recovering: 'pill-beige',
    recovered: 'pill-gray',
  };

  const save = () => {
    if (!form?.playerId || !form.type || !form.date) {
      toast({ variant: 'destructive', title: t('perf.injuryRequired') });
      return;
    }
    create.mutate({ ...form, playerId: parseInt(form.playerId) },
      {
        onSuccess: () => { toast({ title: t('tactics.saved') }); setForm(null); },
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }),
      });
  };

  return (
    <div className="space-y-3">
      {form ? (
        <div className="space-y-3 max-w-lg">
          <Select value={form.playerId} onValueChange={(v) => setForm({ ...form, playerId: v })}>
            <SelectTrigger><SelectValue placeholder={t('perf.pickPlayer')} /></SelectTrigger>
            <SelectContent>
              {(players ?? []).map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}><JerseyNumber n={p.jerseyNumber} className="" /> {playerName(p, lang)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder={t('perf.injuryType')} value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })} />
          <div className="flex gap-2">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <Input type="date" value={form.expectedReturn} placeholder={t('perf.expectedReturn')}
              onChange={(e) => setForm({ ...form, expectedReturn: e.target.value })} />
          </div>
          <Textarea rows={2} placeholder={t('train.notes')} value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex gap-2">
            <Button onClick={save} disabled={create.isPending}><Save className="w-4 h-4 me-1" />{t('common.save')}</Button>
            <Button variant="secondary" onClick={() => setForm(null)}>{t('common.cancel')}</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setForm({ playerId: '', type: '', date: '', expectedReturn: '', notes: '' })}>
          <Plus className="w-4 h-4 me-1" />{t('perf.newInjury')}
        </Button>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && (injuries ?? []).length === 0 && !form && (
        <p className="text-sm text-muted-foreground">{t('perf.emptyInjuries')}</p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {(injuries ?? []).map((inj) => (
          <div key={inj.id} className="border border-border rounded-lg p-3 bg-card space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{inj.playerName}</span>
              <Button size="icon" variant="ghost" onClick={() => del.mutate(inj.id, { onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }) })}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
            <p className="text-xs">{inj.type} · {inj.date}
              {inj.expectedReturn ? ` → ${inj.expectedReturn}` : ''}</p>
            <div className="flex gap-1">
              {(['out', 'recovering', 'recovered'] as const).map((st) => (
                <button key={st}
                  onClick={() => update.mutate({ id: inj.id, status: st }, { onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }) })}
                  className={`rounded px-2 py-0.5 text-xs ${inj.status === st ? STATUS_STYLE[st] : 'text-muted-foreground'}`}>
                  {t(`perf.status.${st}`)}
                </button>
              ))}
            </div>
            {inj.notes && <p className="text-xs text-muted-foreground">{inj.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
