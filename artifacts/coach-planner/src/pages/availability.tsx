import React from 'react';
import { PageTitle } from '@/components/page-header';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { playerName } from '@/lib/player-name';
import { JerseyNumber } from '@/components/jersey-number';
import { useListPlayers, getListPlayersQueryKey } from '@workspace/api-client-react';
import { useAvailability, useCreateAvailability, useDeleteAvailability } from '@/lib/dev-api';
import { PlayerAvatar } from '@/components/player-avatar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plane, Plus, Trash2, Calendar } from 'lucide-react';

const TYPE_COLORS: Record<string, string> = {
  travel: 'bg-sky-500/15 text-sky-400',
  national_team: 'bg-primary/15 text-primary',
  study: 'bg-purple-500/15 text-purple-400',
  other: 'bg-white/[0.08] text-muted-foreground',
};

// Full-roster view of planned absences — travel, national team, study —
// across the whole upcoming period, not just what's active right now
// (that narrower slice lives on the Readiness page). Entries whose end
// date has passed are simply not shown here anymore: from the coach's
// perspective they're gone on their own, no manual cleanup needed.
export function AvailabilityPage() {
  const { t, isRtl, lang } = useLanguage();
  const { activeTeamId } = useTeam();
  const tid = activeTeamId ?? 0;
  const enabled = !!activeTeamId;
  const { toast } = useToast();

  const { data: players } = useListPlayers(tid, { query: { enabled, queryKey: getListPlayersQueryKey(tid) } });
  const { data: availability } = useAvailability(tid);
  const createAvailability = useCreateAvailability(tid);
  const deleteAvailability = useDeleteAvailability(tid);

  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ playerId: '', type: 'travel', startDate: '', endDate: '', note: '' });
  const [deleteId, setDeleteId] = React.useState<number | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const nameOf = React.useMemo(() => new Map((players ?? []).map((p) => [p.id, p])), [players]);

  const { ongoing, upcoming } = React.useMemo(() => {
    const rows = (availability ?? []).filter((a) => !a.endDate || a.endDate >= today);
    return {
      ongoing: rows.filter((a) => a.startDate <= today).sort((a, b) => (a.endDate ?? '9999').localeCompare(b.endDate ?? '9999')),
      upcoming: rows.filter((a) => a.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    };
  }, [availability, today]);

  if (!activeTeamId) return <NoTeamState />;

  const Row = ({ a }: { a: NonNullable<typeof availability>[number] }) => {
    const player = nameOf.get(a.playerId);
    return (
      <div className="flex items-center gap-3 rounded-xl bg-card border border-border/60 px-3 py-2.5">
        <PlayerAvatar photo={player?.photo} jerseyNumber={player?.jerseyNumber ?? 0} className="w-9 h-9 text-xs shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{player?.name ?? '—'}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${TYPE_COLORS[a.type] ?? TYPE_COLORS.other}`}>
              {t(`avail.type.${a.type}`)}
            </span>
            <span className="text-[11px] text-muted-foreground" dir="ltr">
              {a.startDate} → {a.endDate ?? t('avail.ongoing')}
            </span>
          </div>
          {a.note && <p className="text-xs text-foreground/80 truncate mt-0.5">{a.note}</p>}
        </div>
        <button
          type="button"
          className="text-destructive/60 hover:text-destructive active:text-destructive shrink-0"
          onClick={() => setDeleteId(a.id)}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageTitle>{t('avail.title')}</PageTitle>
          <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" /> {t('avail.add')}
          </Button>
        </div>

        {ongoing.length === 0 && upcoming.length === 0 ? (
          <div className="bg-card border rounded-xl p-8 text-center">
            <Plane className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{t('avail.empty')}</p>
          </div>
        ) : (
          <>
            {ongoing.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">{t('ready.away')} ({ongoing.length})</h3>
                <div className="space-y-2">{ongoing.map((a) => <Row key={a.id} a={a} />)}</div>
              </div>
            )}
            {upcoming.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> {t('ready.upcoming')} ({upcoming.length})
                </h3>
                <div className="space-y-2">{upcoming.map((a) => <Row key={a.id} a={a} />)}</div>
              </div>
            )}
          </>
        )}

        {/* Add entry */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent dir={isRtl ? 'rtl' : 'ltr'} className="max-h-[85vh] overflow-y-auto max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('avail.add')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('common.player')}</Label>
                <Select value={form.playerId} onValueChange={(v) => setForm({ ...form, playerId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(players ?? []).map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}><JerseyNumber n={p.jerseyNumber} className="" /> {playerName(p, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('common.status')}</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['travel', 'national_team', 'study', 'other'] as const).map((k) => (
                      <SelectItem key={k} value={k}>{t(`avail.type.${k}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('avail.from')}</Label>
                  <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('avail.to')}</Label>
                  <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('avail.notePh')}</Label>
                <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
              <Button
                className="w-full gap-1.5"
                disabled={!form.playerId || !form.startDate || createAvailability.isPending}
                onClick={() =>
                  createAvailability.mutate(
                    {
                      playerId: Number(form.playerId),
                      type: form.type,
                      startDate: form.startDate,
                      ...(form.endDate && { endDate: form.endDate }),
                      ...(form.note.trim() && { note: form.note.trim() }),
                    },
                    {
                      onError: (err) =>
                        toast({
                          title: t('common.saveFailed'),
                          description: err instanceof Error ? err.message : undefined,
                          variant: 'destructive' as any,
                        }),
                      onSuccess: () => {
                        toast({ title: t('tactics.saved') });
                        setForm({ playerId: '', type: 'travel', startDate: '', endDate: '', note: '' });
                        setOpen(false);
                      },
                    },
                  )
                }
              >
                <Plus className="w-3.5 h-3.5" /> {t('avail.add')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={deleteId !== null}
          title={t('avail.deleteConfirm')}
          onConfirm={() => {
            if (deleteId !== null) deleteAvailability.mutate(deleteId);
            setDeleteId(null);
          }}
          onOpenChange={(o) => !o && setDeleteId(null)}
        />
      </div>
    </AppLayout>
  );
}

export default AvailabilityPage;
