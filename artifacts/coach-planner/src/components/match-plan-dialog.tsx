import React from 'react';
import { useLanguage } from '@/lib/i18n';
import { useMatchPlan, useSaveMatchPlan } from '@/lib/dev-api';
import type { Match } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// Pre-match planning dialog: head-to-head record against this opponent
// (computed from the matches the coach already recorded), the plan from
// the previous meeting for quick reference, and two editable fields —
// opponent scouting notes and team instructions.
interface MatchPlanDialogProps {
  teamId: number;
  match: Match;
  allMatches: Match[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

export function MatchPlanDialog({ teamId, match, allMatches, open, onOpenChange }: MatchPlanDialogProps) {
  const { t, isRtl } = useLanguage();
  const { toast } = useToast();
  const { data: plan, isLoading } = useMatchPlan(open ? teamId : 0, open ? match.id : null);
  const savePlan = useSaveMatchPlan(teamId);

  const [opponentNotes, setOpponentNotes] = React.useState('');
  const [instructions, setInstructions] = React.useState('');

  // Load stored values whenever the dialog opens for a match
  React.useEffect(() => {
    if (!open || isLoading) return;
    setOpponentNotes(plan?.opponentNotes ?? '');
    setInstructions(plan?.instructions ?? '');
  }, [open, isLoading, plan]);

  // Head-to-head vs the same opponent (name match, case-insensitive),
  // excluding this match itself; newest first.
  const h2h = React.useMemo(() => {
    const opponent = match.opponent.trim().toLowerCase();
    const meetings = allMatches
      .filter((m) => m.id !== match.id && m.opponent.trim().toLowerCase() === opponent)
      .sort((a, b) => b.date.localeCompare(a.date));
    let w = 0, d = 0, l = 0, gf = 0, ga = 0;
    for (const m of meetings) {
      gf += m.ourGoals;
      ga += m.theirGoals;
      if (m.ourGoals > m.theirGoals) w++;
      else if (m.ourGoals < m.theirGoals) l++;
      else d++;
    }
    return { meetings, w, d, l, gf, ga };
  }, [allMatches, match]);

  const previousMeetingId = h2h.meetings[0]?.id ?? null;
  const { data: previousPlan } = useMatchPlan(
    open && previousMeetingId ? teamId : 0,
    open ? previousMeetingId : null,
  );

  const handleSave = () => {
    savePlan.mutate(
      { matchId: match.id, opponentNotes, instructions },
      {
        onSuccess: () => {
          toast({ title: t('plan.saved') });
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={isRtl ? 'rtl' : 'ltr'} className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('plan.title')} — {match.opponent}
          </DialogTitle>
        </DialogHeader>

        {/* Head-to-head */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">{t('plan.h2h')}</p>
          {h2h.meetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('plan.h2hNone')}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="px-2 py-0.5 rounded bg-white/[0.06] font-medium">
                  {interpolate(t('plan.h2hRecord'), { w: h2h.w, d: h2h.d, l: h2h.l })}
                </span>
                <span className="px-2 py-0.5 rounded bg-white/[0.06] font-medium" dir="ltr">
                  {interpolate(t('plan.h2hGoals'), { gf: h2h.gf, ga: h2h.ga })}
                </span>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">{t('plan.lastMeetings')}</p>
                <div className="space-y-1">
                  {h2h.meetings.slice(0, 3).map((m) => {
                    const result = m.ourGoals > m.theirGoals ? 'pill-green' : m.ourGoals < m.theirGoals ? 'pill-red' : 'pill-yellow';
                    return (
                      <div key={m.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{format(new Date(m.date + 'T00:00:00'), 'dd/MM/yyyy')}</span>
                        <span className={`${result} px-2 py-0.5 rounded font-mono font-bold`} dir="ltr">
                          {m.ourGoals} - {m.theirGoals}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {previousPlan?.opponentNotes && (
                <div className="pt-1 border-t border-white/[0.06]">
                  <p className="text-[11px] text-muted-foreground mb-0.5">{t('plan.previousPlan')}</p>
                  <p className="text-xs whitespace-pre-wrap">{previousPlan.opponentNotes}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Plan fields */}
        <div className="space-y-2">
          <Label>{t('plan.opponentNotes')}</Label>
          <Textarea
            rows={3}
            placeholder={t('plan.opponentNotesPh')}
            value={opponentNotes}
            onChange={(e) => setOpponentNotes(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('plan.instructions')}</Label>
          <Textarea
            rows={3}
            placeholder={t('plan.instructionsPh')}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={savePlan.isPending}>{t('common.save')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
