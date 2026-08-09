import React, { useState } from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { useTeam } from '@/lib/team-context';
import { useListMatches, useListPlayers, useListGoals, useListCards, useListPlayingTime, useUpdateMatch, getListMatchesQueryKey } from '@workspace/api-client-react';
import { useRatings } from '@/lib/dev-api';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { VideoWithTags } from '@/components/video-with-tags';
import { HighlightClips } from '@/components/highlight-clips';
import { FileText, Printer, Video, Pencil, X, Check } from 'lucide-react';

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMatch = useUpdateMatch();
  const [editingVideo, setEditingVideo] = useState(false);
  const [videoDraft, setVideoDraft] = useState('');

  const m = (matches ?? []).find((x) => x.id === matchId);
  const pName = (id: number | null | undefined) =>
    (players ?? []).find((p) => p.id === id)?.name ?? '—';
  const mGoals = (goals ?? []).filter((g) => g.matchId === matchId);
  const mCards = (cards ?? []).filter((c) => c.matchId === matchId);
  const mMinutes = (minutes ?? []).filter((x) => x.matchId === matchId && x.minutes > 0);
  const best = (ratings ?? []).slice().sort((a, b) => b.rating - a.rating)[0];

  const saveVideoUrl = () => {
    if (!matchId) return;
    updateMatch.mutate(
      { teamId, matchId, data: { videoUrl: videoDraft } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey(teamId) });
          setEditingVideo(false);
        },
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }),
      },
    );
  };

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
              {(matches ?? []).map((x) => (
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

            {(m.videoUrl || editingVideo) && (
              <section className="print:hidden">
                <h3 className="font-bold mb-1.5 flex items-center gap-1.5">🎥 {t('match.videoTitle')}</h3>
                {editingVideo ? (
                  <div className="flex gap-2">
                    <Input
                      value={videoDraft}
                      onChange={(e) => setVideoDraft(e.target.value)}
                      placeholder={t('match.videoPlaceholder')}
                      dir="ltr"
                      className="flex-1"
                    />
                    <Button size="icon" onClick={saveVideoUrl} disabled={updateMatch.isPending}><Check className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditingVideo(false)}><X className="w-4 h-4" /></Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {m.videoUrl && <VideoWithTags url={m.videoUrl} teamId={teamId} matchId={m.id} />}
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      onClick={() => { setVideoDraft(m.videoUrl ?? ''); setEditingVideo(true); }}
                    >
                      <Pencil className="w-3 h-3" /> {t('match.editVideoLink')}
                    </button>
                  </div>
                )}
              </section>
            )}
            {!m.videoUrl && !editingVideo && (
              <button
                type="button"
                className="print:hidden flex items-center gap-1.5 text-sm text-primary hover:underline"
                onClick={() => { setVideoDraft(''); setEditingVideo(true); }}
              >
                <Video className="w-4 h-4" /> {t('match.addVideoLink')}
              </button>
            )}

            <section className="print:hidden">
              <HighlightClips teamId={teamId} matchId={m.id} />
            </section>

            {mGoals.length > 0 && (
              <section>
                <h3 className="font-bold mb-1">⚽ {t('nav.goals')}</h3>
                {mGoals.map((g, i) => (
                  <p key={i} className="text-sm">
                    {g.minute}' — {g.type === 'scored' ? pName(g.scorerPlayerId) : t('report.conceded')} ({g.method})
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
