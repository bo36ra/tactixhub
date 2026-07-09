import React from 'react';
import { useRoute, Link } from 'wouter';
import { AppLayout } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { useGetPlayerTimeline, getGetPlayerTimelineQueryKey } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ArrowRight, ArrowLeft, Swords, CalendarCheck, CircleDot, Square } from 'lucide-react';

export function PlayerProfile() {
  const { t, isRtl } = useLanguage();
  const [, params] = useRoute('/players/:playerId');
  const playerId = params?.playerId ? Number(params.playerId) : undefined;

  const { data } = useGetPlayerTimeline(playerId!, {
    query: { enabled: !!playerId, queryKey: getGetPlayerTimelineQueryKey(playerId!) },
  });

  if (!playerId) return null;

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
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center font-mono font-bold text-xl text-muted-foreground shrink-0">
              {player.jerseyNumber}
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
              </div>
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
