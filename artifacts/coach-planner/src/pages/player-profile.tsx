import React from 'react';
import { useRoute, Link, Redirect } from 'wouter';
import { AppLayout } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { useGetPlayerTimeline, getGetPlayerTimelineQueryKey, useUpdatePlayer, useListPlayers, getListPlayersQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTeam } from '@/lib/team-context';
import { compressImageFile } from '@/lib/image';
import { PlayerAvatar } from '@/components/player-avatar';
import { Button } from '@/components/ui/button';
import { usePlayerRatings } from '@/lib/dev-api';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import { ArrowRight, ArrowLeft, Swords, CalendarCheck, CircleDot, Square, Camera } from 'lucide-react';

export function PlayerProfile() {
  const { t, isRtl } = useLanguage();
  const [, params] = useRoute('/players/:playerId');
  const playerId = params?.playerId ? Number(params.playerId) : undefined;

  const { data } = useGetPlayerTimeline(playerId!, {
    query: { enabled: !!playerId, queryKey: getGetPlayerTimelineQueryKey(playerId!) },
  });
  const { activeTeamId } = useTeam();
  const queryClient = useQueryClient();
  const updatePlayer = useUpdatePlayer();
  const photoInputRef = React.useRef<HTMLInputElement>(null);
  const { data: ratingHistory } = usePlayerRatings(activeTeamId ?? 0, playerId);

  const ratingPoints = React.useMemo(
    () =>
      (ratingHistory ?? []).map((r) => ({
        label: `${format(new Date(r.date), 'dd/MM')} ${r.opponent}`,
        rating: r.rating,
      })),
    [ratingHistory],
  );
  const avgRating = ratingPoints.length
    ? ratingPoints.reduce((sum, r) => sum + r.rating, 0) / ratingPoints.length
    : null;

  const savePhoto = (photo: string | null) => {
    if (!activeTeamId || !playerId) return;
    updatePlayer.mutate(
      { teamId: activeTeamId, playerId, data: { photo } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPlayerTimelineQueryKey(playerId) });
          queryClient.invalidateQueries({ queryKey: getListPlayersQueryKey(activeTeamId) });
        },
      },
    );
  };

  // A malformed player URL used to render a black screen; send the user back
  // to a real page instead.
  if (!playerId) return <Redirect to="/players" />;

  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const player = data?.player;
  const timeline = data?.timeline ?? [];

  const pillClass = player?.status === 'active' ? 'pill-green' : player?.status === 'injured' ? 'pill-red' : 'pill-yellow';

  return (
    <AppLayout>
      <div className="space-y-6">
        <Link href="/players" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <BackIcon className="w-3.5 h-3.5" />
          {t('profile.back')}
        </Link>

        {player && (
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <PlayerAvatar photo={player.photo} jerseyNumber={player.jerseyNumber} className="w-20 h-20 text-xl" />
              <button
                type="button"
                title={player.photo ? t('player.photoChange') : t('player.photoChoose')}
                onClick={() => photoInputRef.current?.click()}
                className="absolute -bottom-1 -end-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:opacity-90"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    savePhoto(await compressImageFile(file));
                  } catch { /* unreadable file — ignore */ }
                }}
              />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{player.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground">
                  {t(`position.${player.position}`)}{player.age ? ` · ${player.age}` : ''}{player.nationality ? ` · ${player.nationality}` : ''}
                </span>
                {player.status && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pillClass}`}>
                    {t(`status.${player.status}`)}
                  </span>
                )}
                {player.photo && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={() => savePhoto(null)}>
                    {t('player.photoRemove')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {ratingPoints.length >= 2 && (
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">{t('profile.ratingCurve')}</h3>
              {avgRating !== null && (
                <span className="text-xs text-muted-foreground">
                  {t('profile.avgRating')}: <span className="font-bold text-foreground">{avgRating.toFixed(1)}</span>/10
                </span>
              )}
            </div>
            <div className="h-44" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ratingPoints} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.45)' }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 10]} tickCount={6} tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.45)' }} />
                  <Tooltip
                    contentStyle={{ background: '#221f1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                  />
                  <Line type="monotone" dataKey="rating" stroke="#e8b64c" strokeWidth={2} dot={{ r: 3, fill: '#e8b64c' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">{t('profile.timeline')}</h3>

          {timeline.length === 0 && (
            <div className="bg-card border rounded-xl px-6 py-12 text-center text-muted-foreground">
              {t('profile.empty')}
            </div>
          )}

          <div className="space-y-2.5">
            {timeline.map((entry, i) => {
              const isMatch = entry.sessionType === 'match';
              return (
                <div key={i} className="bg-card border rounded-xl p-4 flex items-center gap-4">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isMatch ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isMatch ? <Swords className="w-4 h-4" /> : <CalendarCheck className="w-4 h-4" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {format(new Date(entry.date + 'T00:00:00'), 'MMM d, yyyy')}
                      {isMatch && entry.opponent ? ` · ${entry.opponent}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isMatch
                        ? `${t(`match.${entry.matchType}`)} · ${entry.ourGoals ?? 0}-${entry.theirGoals ?? 0}`
                        : t('attendance.training')}
                    </p>
                  </div>

                  {!entry.present ? (
                    <span className="pill-red px-2.5 py-1 rounded-full text-xs font-medium shrink-0">
                      {t('profile.absent')}
                    </span>
                  ) : isMatch ? (
                    <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                      <span>{entry.minutesPlayed ?? 0} {t('profile.minutes')}</span>
                      {!!entry.goalsScored && (
                        <span className="flex items-center gap-1 text-primary font-medium">
                          <CircleDot className="w-3 h-3" />
                          {entry.goalsScored}
                        </span>
                      )}
                      {!!entry.yellowCards && (
                        <span className="flex items-center gap-1">
                          <Square className="w-3 h-3 fill-yellow-400 text-yellow-500" />
                          {entry.yellowCards}
                        </span>
                      )}
                      {!!entry.redCards && (
                        <span className="flex items-center gap-1">
                          <Square className="w-3 h-3 fill-red-500 text-red-600" />
                          {entry.redCards}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="pill-green px-2.5 py-1 rounded-full text-xs font-medium shrink-0">
                      {t('profile.present')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
