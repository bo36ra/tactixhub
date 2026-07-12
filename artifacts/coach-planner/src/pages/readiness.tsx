import React from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import {
  useListPlayers,
  getListPlayersQueryKey,
  useGetCardsSummary,
  getGetCardsSummaryQueryKey,
  useGetAttendanceSummary,
  getGetAttendanceSummaryQueryKey,
} from '@workspace/api-client-react';
import { useInjuries } from '@/lib/dev-api';
import { PlayerAvatar } from '@/components/player-avatar';
import { Link } from 'wouter';
import { CheckCircle2, HeartPulse, Ban, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

// One glance before naming the squad: who is injured, who is suspended
// on cards, and whose attendance has dropped — aggregated from data the
// coach already records elsewhere in the app.
type Verdict = 'available' | 'injured' | 'suspended' | 'watch';

const VERDICT_META: Record<Verdict, { icon: typeof CheckCircle2; pill: string }> = {
  available: { icon: CheckCircle2, pill: 'bg-green-500/15 text-green-500' },
  injured: { icon: HeartPulse, pill: 'bg-red-500/15 text-red-500' },
  suspended: { icon: Ban, pill: 'bg-orange-500/15 text-orange-400' },
  watch: { icon: AlertTriangle, pill: 'bg-yellow-500/15 text-yellow-500' },
};

export function Readiness() {
  const { t } = useLanguage();
  const { activeTeamId } = useTeam();
  const tid = activeTeamId ?? 0;
  const enabled = !!activeTeamId;

  const { data: players } = useListPlayers(tid, { query: { enabled, queryKey: getListPlayersQueryKey(tid) } });
  const { data: injuries } = useInjuries(tid);
  const { data: cardsSummary } = useGetCardsSummary(tid, { query: { enabled, queryKey: getGetCardsSummaryQueryKey(tid) } });
  const { data: attendanceSummary } = useGetAttendanceSummary(tid, { query: { enabled, queryKey: getGetAttendanceSummaryQueryKey(tid) } });

  const rows = React.useMemo(() => {
    if (!players) return [];
    return players.map((p) => {
      const injury = (injuries ?? []).find(
        (i) => i.playerId === p.id && (i.status === 'out' || i.status === 'recovering'),
      );
      const cards = cardsSummary?.find((c) => c.playerId === p.id);
      const attendance = attendanceSummary?.find((a) => a.playerId === p.id);

      const reasons: string[] = [];
      let verdict: Verdict = 'available';

      if (injury || p.status === 'injured') {
        verdict = 'injured';
        if (injury) {
          reasons.push(`${t('ready.reason.injury')}: ${injury.type}`);
          if (injury.expectedReturn) {
            reasons.push(`${t('ready.reason.expectedReturn')}: ${format(new Date(injury.expectedReturn), 'dd/MM/yyyy')}`);
          }
        } else {
          reasons.push(t('ready.reason.playerStatus'));
        }
      } else if (cards?.status === 'suspended' || p.status === 'suspended') {
        verdict = 'suspended';
        reasons.push(cards?.status === 'suspended' ? t('ready.reason.suspendedCards') : t('ready.reason.playerStatus'));
      } else if (attendance && attendance.totalPresent + attendance.totalAbsent > 0 && attendance.attendanceRate < 60) {
        verdict = 'watch';
        reasons.push(`${t('ready.reason.lowAttendance')} (${Math.round(attendance.attendanceRate)}%)`);
      }

      return { player: p, verdict, reasons };
    });
  }, [players, injuries, cardsSummary, attendanceSummary, t]);

  const counts = React.useMemo(() => {
    const c: Record<Verdict, number> = { available: 0, injured: 0, suspended: 0, watch: 0 };
    rows.forEach((r) => c[r.verdict]++);
    return c;
  }, [rows]);

  if (!activeTeamId) return <NoTeamState />;

  const sections: { verdict: Verdict; label: string }[] = [
    { verdict: 'injured', label: t('ready.injured') },
    { verdict: 'suspended', label: t('ready.suspended') },
    { verdict: 'watch', label: t('ready.watch') },
    { verdict: 'available', label: t('ready.available') },
  ];

  return (
    <AppLayout>
      <div className="space-y-8">
        <h2 className="text-2xl font-bold">{t('ready.title')}</h2>

        {/* Summary counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {sections.map(({ verdict, label }) => {
            const Icon = VERDICT_META[verdict].icon;
            return (
              <div key={verdict} className="bg-card border rounded-xl p-4 flex items-center gap-3">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center ${VERDICT_META[verdict].pill}`}>
                  <Icon className="w-4.5 h-4.5 w-5 h-5" />
                </span>
                <div>
                  <p className="text-xl font-bold leading-none">{counts[verdict]}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('ready.empty')}</p>
        ) : (
          sections.map(({ verdict, label }) => {
            const group = rows.filter((r) => r.verdict === verdict);
            if (group.length === 0) return null;
            const Icon = VERDICT_META[verdict].icon;
            return (
              <div key={verdict}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Icon className="w-4 h-4" /> {label} ({group.length})
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.map(({ player, reasons }) => (
                    <Link
                      key={player.id}
                      href={`/players/${player.id}`}
                      className="bg-card border rounded-xl p-3 flex items-start gap-3 hover:border-primary/40 transition-colors"
                    >
                      <PlayerAvatar photo={player.photo} jerseyNumber={player.jerseyNumber} className="w-10 h-10 text-sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{player.name}</p>
                        <p className="text-xs text-muted-foreground">{t(`position.${player.position}`)}</p>
                        {reasons.map((reason, i) => (
                          <p key={i} className="text-xs text-muted-foreground/90 mt-0.5">{reason}</p>
                        ))}
                      </div>
                      <span className={`ms-auto shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${VERDICT_META[verdict].pill}`}>
                        {label}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </AppLayout>
  );
}

export default Readiness;
