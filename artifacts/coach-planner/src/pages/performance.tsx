import React, { useState } from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { useTeam } from '@/lib/team-context';
import { useListPlayers, useListMatches } from '@workspace/api-client-react';
import {
  useInjuries, useCreateInjury, useUpdateInjury, useDeleteInjury,
  useRatings, useSaveRating,
} from '@/lib/dev-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Activity, Star, Plus, Trash2, Save } from 'lucide-react';

export default function Performance() {
  const { t } = useLanguage();
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
  const { data: matches } = useListMatches(teamId);
  const { data: players } = useListPlayers(teamId);
  const [matchId, setMatchId] = useState<number | null>(null);
  const { data: ratings } = useRatings(teamId, matchId);
  const save = useSaveRating(teamId, matchId);

  const ratingFor = (playerId: number) => (ratings ?? []).find((r) => r.playerId === playerId);

  return (
    <div className="space-y-3">
      <Select value={matchId ? String(matchId) : ''} onValueChange={(v) => setMatchId(parseInt(v))}>
        <SelectTrigger className="max-w-72"><SelectValue placeholder={t('perf.pickMatch')} /></SelectTrigger>
        <SelectContent>
          {(matches ?? []).map((m: any) => (
            <SelectItem key={m.id} value={String(m.id)}>{m.opponent} — {m.date}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {matchId && (
        <div className="grid gap-2 sm:grid-cols-2">
          {(players ?? []).map((p: any) => {
            const r = ratingFor(p.id);
            return (
              <div key={p.id} className="border border-border rounded-lg p-3 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">#{p.jerseyNumber} {p.name}</span>
                  {r && <span className="pill-beige rounded px-2 py-0.5 text-xs flex items-center gap-1">
                    <Star className="w-3 h-3" />{r.rating}/10</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button key={n}
                      onClick={() => save.mutate({ playerId: p.id, rating: n },
                        { onSuccess: () => toast({ title: t('tactics.saved') }) })}
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
      )}
    </div>
  );
}

function InjuriesTab({ teamId, t }: { teamId: number; t: (k: string) => string }) {
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
      { onSuccess: () => { toast({ title: t('tactics.saved') }); setForm(null); } });
  };

  return (
    <div className="space-y-3">
      {form ? (
        <div className="space-y-3 max-w-lg">
          <Select value={form.playerId} onValueChange={(v) => setForm({ ...form, playerId: v })}>
            <SelectTrigger><SelectValue placeholder={t('perf.pickPlayer')} /></SelectTrigger>
            <SelectContent>
              {(players ?? []).map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>#{p.jerseyNumber} {p.name}</SelectItem>
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
              <Button size="icon" variant="ghost" onClick={() => del.mutate(inj.id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
            <p className="text-xs">{inj.type} · {inj.date}
              {inj.expectedReturn ? ` → ${inj.expectedReturn}` : ''}</p>
            <div className="flex gap-1">
              {(['out', 'recovering', 'recovered'] as const).map((st) => (
                <button key={st}
                  onClick={() => update.mutate({ id: inj.id, status: st })}
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
