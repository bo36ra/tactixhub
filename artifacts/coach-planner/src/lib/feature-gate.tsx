import React from 'react';
import { useListTeams } from '@workspace/api-client-react';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { useAccessStatus } from '@/lib/dev-api';
import { AppLayout } from '@/components/layout';
import { Lock } from 'lucide-react';

// Reads the active team's tier. A team becomes 'pro' when the site
// owner flips it from /admin — which today is also how a free trial or
// a comp for a trusted coach is granted (no payment gateway yet, so
// every Pro grant is a manual decision by the owner).
export function useIsPro(): boolean {
  const { activeTeamId } = useTeam();
  const { data: teams } = useListTeams();
  const { data: access } = useAccessStatus();
  // The owner (super admin) always sees Pro features — they're running
  // the platform and need to see everything to support and demo it.
  if (access?.isAdmin) return true;
  const team = teams?.find((t) => t.id === activeTeamId);
  return team?.tier === 'pro';
}

// Inline lock card — use when only PART of a page is Pro (wrap that
// section's JSX). For a whole page, use ProPage below instead.
export function FeatureGate({ children }: { children: React.ReactNode }) {
  const isPro = useIsPro();
  const { t } = useLanguage();
  if (isPro) return <>{children}</>;
  return <LockedCard t={t} />;
}

// Whole-page lock — renders inside the app shell so the nav stays put
// and the locked state looks intentional, not broken.
export function ProPage({ children }: { children: React.ReactNode }) {
  const isPro = useIsPro();
  const { t } = useLanguage();
  if (isPro) return <>{children}</>;
  return (
    <AppLayout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <LockedCard t={t} />
      </div>
    </AppLayout>
  );
}

function LockedCard({ t }: { t: (k: string) => string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-card/50 px-6 py-10 text-center max-w-sm mx-auto">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-1">
        <Lock className="w-6 h-6 text-primary" />
      </div>
      <p className="text-base font-bold">{t('feature.locked')}</p>
      <p className="text-sm text-muted-foreground">{t('feature.lockedBody')}</p>
      <p className="text-xs text-muted-foreground mt-1">{t('feature.lockedHint')}</p>
    </div>
  );
}
