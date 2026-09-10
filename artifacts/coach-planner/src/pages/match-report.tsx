import React, { useState, useEffect } from 'react';
import { useSearch } from 'wouter';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { useTeam } from '@/lib/team-context';
import { useListMatches, useListPlayers, useListGoals, useListCards, useListPlayingTime, useUpdateMatch, useGetLineup, useCreateCard, useUpdateCard, useDeleteCard, getListMatchesQueryKey, getGetLineupQueryKey, getListCardsQueryKey, getGetCardsSummaryQueryKey } from '@workspace/api-client-react';
import { useRatings } from '@/lib/dev-api';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { VideoWithTags } from '@/components/video-with-tags';
import { HighlightClips } from '@/components/highlight-clips';
import { FileText, Printer, Video, Pencil, X, Check, Plus, Trash2 } from 'lucide-react';

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
  // Lets other pages (the Reports match table, for one) deep-link
  // straight to a specific match's report via ?matchId=123 instead of
  // landing here and having to re-pick the same match from the
  // dropdown a second time.
  const search = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(search);
    const fromUrl = params.get('matchId');
    if (fromUrl) setMatchId(parseInt(fromUrl, 10));
  }, [search]);
  const { data: ratings } = useRatings(teamId, matchId);
  const { data: lineup } = useGetLineup(matchId!, {
    query: { enabled: !!matchId, queryKey: getGetLineupQueryKey(matchId!) },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMatch = useUpdateMatch();
  const [editingVideo, setEditingVideo] = useState(false);
  const [videoDraft, setVideoDraft] = useState('');
  const createCard = useCreateCard();
  const updateCard = useUpdateCard();
  const deleteCard = useDeleteCard();
  const [addingCard, setAddingCard] = useState(false);
  const [cardPlayerId, setCardPlayerId] = useState('');
  const [cardMinute, setCardMinute] = useState('');
  const [cardType, setCardType] = useState<'yellow' | 'red'>('yellow');
  // Editing an existing card reuses the same three fields/inputs as
  // the add form below — editingCardId tracks which card (if any) is
  // currently being edited, null meaning the fields belong to the add
  // form instead.
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState({ teamPerformanceNotes: '', strengthsNotes: '', improvementNotes: '', generalNotes: '' });

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

  const handleAddCard = () => {
    if (!matchId || !cardPlayerId || !cardMinute) return;
    createCard.mutate(
      { teamId, data: { matchId, playerId: Number(cardPlayerId), cardType, minute: Number(cardMinute) } },
      {
        onSuccess: () => {
          // Also invalidates the cards summary — previously missed
          // here, meaning the dedicated Cards page's discipline table
          // (yellow/red totals, suspension status per player) could
          // show stale numbers after adding a card from this page
          // until something else happened to refetch it.
          queryClient.invalidateQueries({ queryKey: getListCardsQueryKey(teamId) });
          queryClient.invalidateQueries({ queryKey: getGetCardsSummaryQueryKey(teamId) });
          setAddingCard(false);
          setCardPlayerId('');
          setCardMinute('');
          setCardType('yellow');
        },
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }),
      },
    );
  };

  const startEditCard = (cardId: number, playerId: number, minute: number, type: 'yellow' | 'red') => {
    setAddingCard(false);
    setEditingCardId(cardId);
    setCardPlayerId(String(playerId));
    setCardMinute(String(minute));
    setCardType(type);
  };

  const handleSaveCardEdit = () => {
    if (!editingCardId || !cardPlayerId || !cardMinute) return;
    updateCard.mutate(
      { teamId, cardId: editingCardId, data: { playerId: Number(cardPlayerId), cardType, minute: Number(cardMinute) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCardsQueryKey(teamId) });
          queryClient.invalidateQueries({ queryKey: getGetCardsSummaryQueryKey(teamId) });
          setEditingCardId(null);
          setCardPlayerId('');
          setCardMinute('');
          setCardType('yellow');
        },
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }),
      },
    );
  };

  const handleDeleteCard = (cardId: number) => {
    deleteCard.mutate(
      { teamId, cardId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCardsQueryKey(teamId) });
          queryClient.invalidateQueries({ queryKey: getGetCardsSummaryQueryKey(teamId) });
        },
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }),
      },
    );
  };

  const openNotesEditor = () => {
    setNotesDraft({
      teamPerformanceNotes: m?.teamPerformanceNotes ?? '',
      strengthsNotes: m?.strengthsNotes ?? '',
      improvementNotes: m?.improvementNotes ?? '',
      generalNotes: m?.generalNotes ?? '',
    });
    setEditingNotes(true);
  };

  const saveNotes = () => {
    if (!matchId) return;
    updateMatch.mutate(
      { teamId, matchId, data: notesDraft },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey(teamId) });
          setEditingNotes(false);
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

            {lineup && lineup.entries.length > 0 && (
              <section>
                <h3 className="font-bold mb-1">🧩 {t('match.lineup')} ({lineup.formation})</h3>
                <div className="grid grid-cols-2 gap-x-4">
                  {lineup.entries
                    .filter((e) => e.slotIndex !== null)
                    .slice()
                    .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0))
                    .map((e) => (
                      <p key={e.id} className="text-sm flex items-center gap-1">
                        <span className="text-muted-foreground">#{e.jerseyNumber}</span>
                        {e.playerName}
                        {e.isCaptain && <span className="text-primary">⭐</span>}
                        <span className="text-muted-foreground text-xs">({e.position})</span>
                      </p>
                    ))}
                </div>
                {lineup.entries.some((e) => e.slotIndex === null) && (
                  <>
                    <p className="text-sm font-semibold mt-2 mb-1">{t('lineup.bench')}</p>
                    <div className="grid grid-cols-2 gap-x-4">
                      {lineup.entries
                        .filter((e) => e.slotIndex === null)
                        .map((e) => (
                          <p key={e.id} className="text-sm text-muted-foreground">
                            #{e.jerseyNumber} {e.playerName}
                          </p>
                        ))}
                    </div>
                  </>
                )}
              </section>
            )}

            {mGoals.length > 0 && (
              <section>
                <h3 className="font-bold mb-1">⚽ {t('nav.goals')}</h3>
                {mGoals.map((g, i) => {
                  const assist = g.assistPlayerId ? pName(g.assistPlayerId) : g.assistName;
                  return (
                    <p key={i} className="text-sm">
                      {g.minute}' — {g.type === 'scored' ? pName(g.scorerPlayerId) : t('report.conceded')} ({g.method})
                      {g.type === 'scored' && assist && (
                        <span className="text-muted-foreground"> · {t('report.assistBy')} {assist}</span>
                      )}
                    </p>
                  );
                })}
              </section>
            )}

            <section>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold flex items-center gap-1.5">🟨 {t('nav.cards')}</h3>
                {!addingCard && editingCardId === null && (
                  <button type="button" className="print:hidden text-xs text-primary hover:underline flex items-center gap-1" onClick={() => setAddingCard(true)}>
                    <Plus className="w-3.5 h-3.5" /> {t('report.addCard')}
                  </button>
                )}
              </div>
              {mCards.map((c) => (
                <div key={c.id} className="print:hidden flex items-center justify-between gap-2 text-sm rounded-lg border bg-card px-3 py-2 mb-1.5">
                  <span className="flex-1">{c.minute}' — {pName(c.playerId)} ({c.cardType})</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => startEditCard(c.id, c.playerId, c.minute, c.cardType as 'yellow' | 'red')}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteCard(c.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <p className="hidden print:block">
                {mCards.map((c) => (
                  <span key={c.id} className="block text-sm">{c.minute}' — {pName(c.playerId)} ({c.cardType})</span>
                ))}
              </p>
              {mCards.length === 0 && !addingCard && (
                <p className="text-sm text-muted-foreground print:hidden">{t('report.noCards')}</p>
              )}
              {(addingCard || editingCardId !== null) && (
                <div className="print:hidden flex flex-wrap items-center gap-2 mt-2 p-2 rounded-lg border bg-muted/30">
                  <Select value={cardPlayerId} onValueChange={setCardPlayerId}>
                    <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder={t('lineup.selectPlayer')} /></SelectTrigger>
                    <SelectContent>
                      {(players ?? []).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 text-xs w-20"
                    placeholder={t('report.minute')}
                    inputMode="numeric"
                    value={cardMinute}
                    onChange={(e) => setCardMinute(e.target.value.replace(/\D/g, ''))}
                  />
                  <Select value={cardType} onValueChange={(v) => setCardType(v as 'yellow' | 'red')}>
                    <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yellow">{t('report.yellowCard')}</SelectItem>
                      <SelectItem value="red">{t('report.redCard')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!cardPlayerId || !cardMinute || createCard.isPending || updateCard.isPending}
                    onClick={editingCardId !== null ? handleSaveCardEdit : handleAddCard}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAddingCard(false); setEditingCardId(null); }}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </section>

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

            <section>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="font-bold flex items-center gap-1.5">📝 {t('report.coachNotes')}</h3>
                {!editingNotes && (
                  <button type="button" className="print:hidden text-xs text-primary hover:underline flex items-center gap-1" onClick={openNotesEditor}>
                    <Pencil className="w-3.5 h-3.5" /> {t('common.edit')}
                  </button>
                )}
              </div>
              {editingNotes ? (
                <div className="print:hidden space-y-3">
                  {([
                    ['teamPerformanceNotes', t('report.teamPerformance')],
                    ['strengthsNotes', t('report.strengths')],
                    ['improvementNotes', t('report.improvementAreas')],
                    ['generalNotes', t('report.generalNotes')],
                  ] as const).map(([field, label]) => (
                    <div key={field}>
                      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
                      <Textarea
                        value={notesDraft[field]}
                        onChange={(e) => setNotesDraft((prev) => ({ ...prev, [field]: e.target.value }))}
                        rows={3}
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveNotes} disabled={updateMatch.isPending}>
                      <Check className="w-3.5 h-3.5 me-1" />{t('common.save')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (m.teamPerformanceNotes || m.strengthsNotes || m.improvementNotes || m.generalNotes) ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  {m.teamPerformanceNotes && (
                    <div><p className="text-xs font-semibold text-muted-foreground mb-0.5">{t('report.teamPerformance')}</p><p className="text-sm whitespace-pre-wrap">{m.teamPerformanceNotes}</p></div>
                  )}
                  {m.strengthsNotes && (
                    <div><p className="text-xs font-semibold text-muted-foreground mb-0.5">{t('report.strengths')}</p><p className="text-sm whitespace-pre-wrap">{m.strengthsNotes}</p></div>
                  )}
                  {m.improvementNotes && (
                    <div><p className="text-xs font-semibold text-muted-foreground mb-0.5">{t('report.improvementAreas')}</p><p className="text-sm whitespace-pre-wrap">{m.improvementNotes}</p></div>
                  )}
                  {m.generalNotes && (
                    <div className="sm:col-span-2"><p className="text-xs font-semibold text-muted-foreground mb-0.5">{t('report.generalNotes')}</p><p className="text-sm whitespace-pre-wrap">{m.generalNotes}</p></div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground print:hidden">{t('report.noNotesYet')}</p>
              )}
            </section>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
