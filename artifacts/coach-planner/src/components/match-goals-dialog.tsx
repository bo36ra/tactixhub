import React from 'react';
import { useLanguage } from '@/lib/i18n';
import { playerName } from '@/lib/player-name';
import {
  useListGoals, useCreateGoal, useDeleteGoal, useListPlayers,
  getListGoalsQueryKey, getGetTopScorersQueryKey, getListPlayersQueryKey,
} from '@workspace/api-client-react';
import { GoalInputType, GoalInputMethod } from '@workspace/api-client-react';
import type { Match } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Plus } from 'lucide-react';

const NONE = 'none';

export function MatchGoalsDialog({
  teamId, match, open, onOpenChange,
}: {
  teamId: number;
  match: Match;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allGoals } = useListGoals(teamId, { query: { enabled: open, queryKey: getListGoalsQueryKey(teamId) } });
  const { data: players } = useListPlayers(teamId, { query: { enabled: open, queryKey: getListPlayersQueryKey(teamId) } });
  const createGoal = useCreateGoal();
  const deleteGoal = useDeleteGoal();

  const matchGoals = (allGoals ?? []).filter((g) => g.matchId === match.id).sort((a, b) => a.minute - b.minute);
  const scoredCount = matchGoals.filter((g) => g.type === 'scored').length;
  const concededCount = matchGoals.filter((g) => g.type === 'conceded').length;

  const [type, setType] = React.useState<GoalInputType>('scored');
  const [minute, setMinute] = React.useState('');
  const [scorerPlayerId, setScorerPlayerId] = React.useState(NONE);
  const [assistPlayerId, setAssistPlayerId] = React.useState(NONE);
  const [method, setMethod] = React.useState<GoalInputMethod>('open_play');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey(teamId) });
    queryClient.invalidateQueries({ queryKey: getGetTopScorersQueryKey(teamId) });
  };

  const canAddMore = type === 'scored' ? scoredCount < match.ourGoals : concededCount < match.theirGoals;

  const handleAdd = () => {
    if (!minute.trim()) return;
    createGoal.mutate(
      {
        teamId,
        data: {
          matchId: match.id,
          type,
          minute: parseInt(minute, 10),
          method,
          ...(type === 'scored' && scorerPlayerId !== NONE && { scorerPlayerId: Number(scorerPlayerId) }),
          ...(type === 'scored' && assistPlayerId !== NONE && { assistPlayerId: Number(assistPlayerId) }),
        },
      },
      {
        onSuccess: () => { invalidate(); setMinute(''); setScorerPlayerId(NONE); setAssistPlayerId(NONE); },
        onError: (err: unknown) => toast({ title: t('common.saveFailed'), description: err instanceof Error ? err.message : undefined, variant: 'destructive' }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('goal.matchGoals')} — {match.opponent} ({match.ourGoals}-{match.theirGoals})</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {matchGoals.length > 0 && (
            <div className="space-y-1.5">
              {matchGoals.map((g) => (
                <div key={g.id} className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2">
                  <span className="text-xs font-mono font-bold text-primary shrink-0" dir="ltr">{g.minute}'</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${g.type === 'scored' ? 'pill-green' : 'pill-red'}`}>
                    {g.type === 'scored' ? t('goal.typeScored') : t('goal.typeConceded')}
                  </span>
                  <div className="flex-1 min-w-0">
                    {g.type === 'scored' ? (
                      <>
                        <span className="text-sm font-semibold truncate">{g.scorerName || t('goal.unknownScorer')}</span>
                        {g.assistName && <span className="text-xs text-muted-foreground"> · {t('goal.assistedBy')} {g.assistName}</span>}
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t(`goal.${g.method}`)}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-destructive/60 hover:text-destructive shrink-0 p-1"
                    onClick={() => deleteGoal.mutate({ teamId, goalId: g.id }, { onSuccess: invalidate, onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }) })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {canAddMore ? (
            <div className="bg-card border rounded-xl p-3 space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setType('scored')}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-lg border ${type === 'scored' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}
                >
                  {t('goal.typeScored')}
                </button>
                <button
                  type="button"
                  onClick={() => setType('conceded')}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-lg border ${type === 'conceded' ? 'bg-destructive text-destructive-foreground border-destructive' : 'border-border text-muted-foreground'}`}
                >
                  {t('goal.typeConceded')}
                </button>
              </div>

              <div className="flex gap-2">
                <Input
                  type="number" min="1" max="130" value={minute}
                  onChange={(e) => setMinute(e.target.value)}
                  placeholder={t('goal.minute')}
                  className="w-20"
                />
                <Select value={method} onValueChange={(v: GoalInputMethod) => setMethod(v)}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.values(GoalInputMethod).map((m) => <SelectItem key={m} value={m}>{t(`goal.${m}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {type === 'scored' && (
                <>
                  <Select value={scorerPlayerId} onValueChange={setScorerPlayerId}>
                    <SelectTrigger><SelectValue placeholder={t('goal.scorer')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>-- {t('common.select')} --</SelectItem>
                      {players?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.jerseyNumber} - {playerName(p, lang)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={assistPlayerId} onValueChange={setAssistPlayerId}>
                    <SelectTrigger><SelectValue placeholder={t('goal.assist')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('goal.noAssist')}</SelectItem>
                      {players?.filter((p) => String(p.id) !== scorerPlayerId).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.jerseyNumber} - {playerName(p, lang)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </>
              )}

              <Button size="sm" className="w-full" disabled={!minute.trim() || createGoal.isPending} onClick={handleAdd}>
                <Plus className="w-4 h-4 me-1" />{t('common.add')}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">{t('goal.allRecorded')}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
