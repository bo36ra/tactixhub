import React from 'react';
import { AppLayout } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import {
  useAccessStatus, useAdminAccessRequests, useDecideAccessRequest,
  useAdminTeams, useUpdateTeamTier,
} from '@/lib/dev-api';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ShieldCheck, Check, X, Users } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-500/15 text-yellow-500',
  approved: 'bg-green-500/15 text-green-500',
  rejected: 'bg-red-500/15 text-red-500',
};

// Owner-only back office: review who's asking to join, and manually
// bump a team's tier once payment is settled out-of-band. No payment
// gateway wired yet — this is the whole "billing system" for now, and
// it's enough until real volume justifies more.
export function AdminPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data: access, isLoading: accessLoading } = useAccessStatus();
  const { data: requests } = useAdminAccessRequests();
  const decide = useDecideAccessRequest();
  const { data: teams } = useAdminTeams();
  const updateTier = useUpdateTeamTier();

  if (accessLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[50vh]">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!access?.isAdmin) {
    return (
      <AppLayout>
        <p className="text-sm text-muted-foreground text-center py-12">{t('admin.forbidden')}</p>
      </AppLayout>
    );
  }

  const pending = (requests ?? []).filter((r) => r.status === 'pending');
  const decided = (requests ?? []).filter((r) => r.status !== 'pending');

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold font-display">{t('admin.title')}</h1>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('admin.requests')}</h2>
          {(requests ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">{t('admin.noRequests')}</p>
          )}
          <div className="space-y-2">
            {[...pending, ...decided].map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl bg-card border border-border/60 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{r.displayName || r.email || r.userId}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[r.status] ?? ''}`}>
                  {t(`admin.status.${r.status}`)}
                </span>
                {r.status === 'pending' && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 text-green-500 hover:text-green-400"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate(
                          { id: r.id, decision: 'approve' },
                          { onSuccess: () => toast({ title: t('admin.approve') }) },
                        )
                      }
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate(
                          { id: r.id, decision: 'reject' },
                          { onSuccess: () => toast({ title: t('admin.reject') }) },
                        )
                      }
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> {t('admin.teams')}
          </h2>
          <p className="text-xs text-muted-foreground -mt-1">{t('admin.grantHint')}</p>
          <div className="space-y-2">
            {(teams ?? []).map((team) => (
              <div key={team.id} className="flex items-center gap-3 rounded-xl bg-card border border-border/60 px-3 py-2.5">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{team.name}</p>
                  {team.tier === 'pro' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary shrink-0">
                      {t('feature.proBadge')}
                    </span>
                  )}
                </div>
                <Select
                  value={team.tier}
                  onValueChange={(v) =>
                    updateTier.mutate(
                      { teamId: team.id, tier: v as 'free' | 'pro' },
                      { onSuccess: () => toast({ title: t('tactics.saved') }) },
                    )
                  }
                >
                  <SelectTrigger className="w-28 h-8 text-xs shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">{t('admin.tier.free')}</SelectItem>
                    <SelectItem value="pro">{t('admin.tier.pro')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default AdminPage;
