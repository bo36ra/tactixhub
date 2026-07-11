import React, { useState } from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { useTeam } from '@/lib/team-context';
import { useListMatches, useListPlayers, useListGoals, useListCards, useListPlayingTime } from '@workspace/api-client-react';
import { useRatings } from '@/lib/dev-api';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { FileText, Printer } from 'lucide-react';

export default function MatchReport() {
  const { t } = useLanguage();
  const { activeTeamId } = useTeam();
  if (!activeTeamId) return <NoTeamState />;
  return <Inner teamId={activeTeamId} t={t} />;
}

function Inner({ teamId, t }: { teamId: number; t: (k: string) => string }) {
  const { data: matches } = useListMatches(teamId);
  const { data: players } = useListPlayers(teamId);
  const { data: goals } = useListGoals(teamId);
  const { data: cards } = useListCards(teamId);
  const { data: minutes } = useListPlayingTime(teamId);
  const [matchId, setMatchId] = useState<number | null>(null);
  const { data: ratings } = useRatings(teamId, matchId);

  const m: any = (matches ?? []).find((x: any) => x.id === matchId);
  const pName = (id: number | null) =>
    (players ?? []).find((p: any) => p.id === id)?.name ?? '—';
  const mGoals = ((goals ?? []) as any[]).filter((g) => g.matchId === matchId);
  const mCards = ((cards ?? []) as any[]).filter((c) => c.matchId === matchId);
  const mMinutes = ((minutes ?? []) as any[]).filter((x) => x.matchId === matchId && x.minutes > 0);
  const best = (ratings ?? []).slice().sort((a, b) => b.rating - a.rating)[0];

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold font-display">{t('nav.matchReport')}</h1>
          </div>
          {m && (
            <Button onClick={() => window.print()}>
              <Printer className="w-4 h-4 me-1" />{t('report.share')}
            </Button>
          )}
        </div>

        <div className="print:hidden">
          <Select value={matchId ? String(matchId) : ''} onValueChange={(v) => setMatchId(parseInt(v))}>
            <SelectTrigger className="max-w-72"><SelectValue placeholder={t('perf.pickMatch')} /></SelectTrigger>
            <SelectContent>
              {(matches ?? []).map((x: any) => (
                <SelectItem key={x.id} value={String(x.id)}>{x.opponent} — {x.date}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {m && (
          <div className="border border-border rounded-xl bg-card p-5 space-y-4 print:border-0 print:bg-white print:text-black">
            <div className="text-center space-y-1">
              <div className="flex items-center justify-center gap-2">
                <img src="/logo-icon.svg" alt="" className="w-6 h-6" />
                <span className="font-display font-bold">{t('app.title')}</span>
              </div>
              <h2 className="text-xl font-bold">{t('report.vs')} {m.opponent}</h2>
              <p className="text-sm text-muted-foreground print:text-gray-600">{m.date} · {m.type} · {m.formation}</p>
              <p className="text-4xl font-display font-bold">{m.ourGoals} – {m.theirGoals}</p>
              {best && (
                <p className="text-sm">⭐ {t('report.motm')}: <b>{pName(best.playerId)}</b> ({best.rating}/10)</p>
              )}
            </div>

            {mGoals.length > 0 && (
              <section>
                <h3 className="font-bold mb-1">⚽ {t('nav.goals')}</h3>
                {mGoals.map((g, i) => (
                  <p key={i} className="text-sm">
                    {g.minute}' — {g.type === 'for' ? pName(g.scorerPlayerId) : t('report.conceded')} ({g.method})
                  </p>
                ))}
              </section>
            )}

            {mCards.length > 0 && (
              <section>
                <h3 className="font-bold mb-1">🟨 {t('nav.cards')}</h3>
                {mCards.map((c, i) => (
                  <p key={i} className="text-sm">{c.minute}' — {pName(c.playerId)} ({c.cardType})</p>
                ))}
              </section>
            )}

            {(ratings ?? []).length > 0 && (
              <section>
                <h3 className="font-bold mb-1">📊 {t('perf.tabRatings')}</h3>
                <div className="grid grid-cols-2 gap-x-4">
                  {(ratings ?? []).slice().sort((a, b) => b.rating - a.rating).map((r) => (
                    <p key={r.id} className="text-sm flex justify-between">
                      <span>{pName(r.playerId)}</span><b>{r.rating}/10</b>
                    </p>
                  ))}
                </div>
              </section>
            )}

            {mMinutes.length > 0 && (
              <section>
                <h3 className="font-bold mb-1">⏱ {t('nav.playingTime')}</h3>
                <div className="grid grid-cols-2 gap-x-4">
                  {mMinutes.sort((a, b) => b.minutes - a.minutes).map((x, i) => (
                    <p key={i} className="text-sm flex justify-between">
                      <span>{pName(x.playerId)}</span><span>{x.minutes}'</span>
                    </p>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
