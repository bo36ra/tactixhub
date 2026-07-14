import React from 'react';
import { useListTeams } from '@workspace/api-client-react';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { Lock } from 'lucide-react';

// Reads the active team's tier. Every team is 'free' today — nothing in
// the app calls this yet. It exists so that when a feature is chosen
// for the paid tier later, gating it is a one-line change instead of a
// new subsystem: wrap the feature's JSX in <FeatureGate>, or check
// useIsPro() before an action.
export function useIsPro(): boolean {
  const { activeTeamId } = useTeam();
  const { data: teams } = useListTeams();
  const team = teams?.find((t) => t.id === activeTeamId);
  return team?.tier === 'pro';
}

// Wrap any feature's UI in this to lock it behind the Pro tier. Renders
// the children normally once the team is Pro; otherwise shows a small
// locked-state card instead.
export function FeatureGate({ children }: { children: React.ReactNode }) {
  const isPro = useIsPro();
  const { t } = useLanguage();

  if (isPro) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-card/50 px-6 py-10 text-center">
      <Lock className="w-6 h-6 text-muted-foreground" />
      <p className="text-sm font-semibold">{t('feature.locked')}</p>
      <p className="text-xs text-muted-foreground max-w-xs">{t('feature.lockedBody')}</p>
    </div>
  );
}
