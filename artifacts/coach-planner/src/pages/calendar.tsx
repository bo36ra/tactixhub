import React from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { useListMatches, getListMatchesQueryKey, useListAttendance, getListAttendanceQueryKey, useListPlayers, getListPlayersQueryKey } from '@workspace/api-client-react';
import {
  useTrainings, useCreateTraining, useWeekCycle, useSaveWeekCycle, useApplyCycle,
  useMonthPlan, useSaveMonthPlan, useDeleteTraining, type CycleDay,
} from '@/lib/dev-api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FOCUS_KEYS } from '@/pages/trainings';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  addDays,
  addMonths,
  isSameMonth,
  isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Swords, Dumbbell, Repeat, Target, Plus, Trash2 } from 'lucide-react';
import { endOfMonth as eom } from 'date-fns';

// One month view that merges matches and training sessions — the coach's
// whole schedule in a single grid instead of two separate pages.
export function CalendarPage() {
  const { t, isRtl } = useLanguage();
  const { activeTeamId } = useTeam();
  const tid = activeTeamId ?? 0;
  const enabled = !!activeTeamId;
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));

  const { toast } = useToast();
  const monthKey = format(month, 'yyyy-MM');
  const todayIso = format(new Date(), 'yyyy-MM-dd');

  const { data: matches } = useListMatches(tid, { query: { enabled, queryKey: getListMatchesQueryKey(tid) } });
  const { data: trainings } = useTrainings(tid);
  const { data: allAttendance } = useListAttendance(tid, { query: { enabled, queryKey: getListAttendanceQueryKey(tid) } });
  const { data: players } = useListPlayers(tid, { query: { enabled, queryKey: getListPlayersQueryKey(tid) } });

  // Per-day absence/excuse notes: "player — reason" for every attendance
  // record that carries a note.
  const excusesByDay = React.useMemo(() => {
    const nameOf = new Map((players ?? []).map((p) => [p.id, p.name]));
    const map = new Map<string, { playerName: string; status: string; note: string }[]>();
    for (const rec of allAttendance ?? []) {
      if (!rec.note) continue;
      const list = map.get(rec.date) ?? [];
      list.push({ playerName: nameOf.get(rec.playerId) ?? '', status: rec.status ?? 'absent', note: rec.note });
      map.set(rec.date, list);
    }
    return map;
  }, [allAttendance, players]);
  const { data: monthPlan } = useMonthPlan(tid, monthKey);
  const saveMonthPlan = useSaveMonthPlan(tid);
  const { data: cycle } = useWeekCycle(tid);
  const saveCycle = useSaveWeekCycle(tid);
  const applyCycle = useApplyCycle(tid);
  const createTraining = useCreateTraining(tid);
  const deleteTraining = useDeleteTraining(tid);

  // month goal inline editing
  const [goalDraft, setGoalDraft] = React.useState('');
  const [notesDraft, setNotesDraft] = React.useState('');
  React.useEffect(() => {
    setGoalDraft(monthPlan?.goal ?? '');
    setNotesDraft(monthPlan?.notes ?? '');
  }, [monthPlan, monthKey]);
  const goalDirty = goalDraft !== (monthPlan?.goal ?? '') || notesDraft !== (monthPlan?.notes ?? '');

  // weekly cycle editor
  const [cycleOpen, setCycleOpen] = React.useState(false);
  const [cycleDraft, setCycleDraft] = React.useState<(CycleDay | null)[]>(Array(7).fill(null));
  React.useEffect(() => {
    if (!cycleOpen) return;
    const draft: (CycleDay | null)[] = Array(7).fill(null);
    (cycle ?? []).forEach((c) => { draft[c.dayOfWeek] = { ...c }; });
    setCycleDraft(draft);
  }, [cycleOpen, cycle]);

  // quick-add on a day
  const [dayOpen, setDayOpen] = React.useState<string | null>(null);
  const [dayFocus, setDayFocus] = React.useState('tactics');
  const [dayIntensity, setDayIntensity] = React.useState('medium');
  const [dayDuration, setDayDuration] = React.useState('90');
  // A fully past month can't receive planned sessions
  const monthInPast = eom(month) < new Date(new Date().toDateString());
  const showError = (err: unknown) =>
    toast({ title: err instanceof Error ? err.message : 'Error', variant: 'destructive' as any });

  const eventsByDay = React.useMemo(() => {
    const map = new Map<string, { kind: 'match' | 'training'; label: string; sub?: string; planned?: boolean }[]>();
    const push = (date: string, ev: { kind: 'match' | 'training'; label: string; sub?: string; planned?: boolean }) => {
      const list = map.get(date) ?? [];
      list.push(ev);
      map.set(date, list);
    };
    for (const m of matches ?? []) {
      push(m.date, { kind: 'match', label: m.opponent, sub: `${m.ourGoals}-${m.theirGoals}` });
    }
    for (const tr of trainings ?? []) {
      push(tr.date, { kind: 'training', label: t(`train.focus.${tr.focus}`), sub: tr.time ?? undefined, planned: tr.date > todayIso });
    }
    return map;
  }, [matches, trainings, t, todayIso]);

  // Build the 6-week grid (Mon-first) covering the month
  const days = React.useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const gridEnd = endOfMonth(month);
    const out: Date[] = [];
    let cursor = gridStart;
    while (cursor <= gridEnd || out.length % 7 !== 0) {
      out.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return out;
  }, [month]);

  const weekdayLabels = React.useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(isRtl ? 'ar' : 'en', { weekday: 'short' }).format(addDays(monday, i)),
    );
  }, [isRtl]);

  if (!activeTeamId) return <NoTeamState />;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{t('cal.title')}</h2>
          <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCycleOpen(true)}>
            <Repeat className="w-3.5 h-3.5" /> {t('cal.cycle')}
          </Button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-1.5 rounded-md hover:bg-white/[0.06] text-muted-foreground"
              onClick={() => setMonth((m) => addMonths(m, -1))}
            >
              {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            <span className="text-sm font-medium min-w-24 text-center" dir="ltr">
              {format(month, 'MM / yyyy')}
            </span>
            <button
              type="button"
              className="p-1.5 rounded-md hover:bg-white/[0.06] text-muted-foreground"
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
          </div>
        </div>

        {/* Mesocycle: month goal */}
        <div className="bg-card border rounded-xl p-3 sm:p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-primary" /> {t('cal.monthGoal')}
          </p>
          <Input
            placeholder={t('cal.monthGoalPh')}
            value={goalDraft}
            onChange={(e) => setGoalDraft(e.target.value)}
          />
          <Textarea
            rows={2}
            placeholder={t('cal.monthNotes')}
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
          />
          {goalDirty && (
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={saveMonthPlan.isPending}
                onClick={() =>
                  saveMonthPlan.mutate(
                    { month: monthKey, goal: goalDraft, notes: notesDraft },
                    { onSuccess: () => toast({ title: t('tactics.saved') }) },
                  )
                }
              >
                {t('common.save')}
              </Button>
            </div>
          )}
        </div>

        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 bg-muted text-muted-foreground text-[11px] font-semibold">
            {weekdayLabels.map((label) => (
              <div key={label} className="px-1 py-2 text-center">{label}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const events = eventsByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, month);
              return (
                <div
                  key={key}
                  role="button"
                  onClick={() => { if (inMonth) { setDayOpen(key); } }}
                  className={`min-h-20 sm:min-h-24 border-t border-e border-border/40 p-1 sm:p-1.5 cursor-pointer hover:bg-white/[0.03] transition-colors ${
                    inMonth ? '' : 'opacity-35 pointer-events-none'
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-mono ${
                      isToday(day) ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground'
                    }`}
                    dir="ltr"
                  >
                    {format(day, 'd')}
                  </span>
                  <div className="mt-0.5 space-y-0.5">
                    {(excusesByDay.get(key) ?? []).slice(0, 2).map((ex, i) => (
                      <div
                        key={`ex${i}`}
                        title={`${ex.playerName}: ${ex.note}`}
                        className="text-[9px] leading-tight truncate text-amber-400/90"
                      >
                        {ex.playerName}: {ex.note}
                      </div>
                    ))}
                    {(excusesByDay.get(key) ?? []).length > 2 && (
                      <div className="text-[9px] text-amber-400/60">+{(excusesByDay.get(key) ?? []).length - 2}</div>
                    )}
                    {events.map((ev, i) => (
                      <div
                        key={i}
                        title={`${t(ev.kind === 'match' ? 'cal.match' : 'cal.training')}: ${ev.label}`}
                        className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight truncate ${
                          ev.kind === 'match'
                            ? 'bg-primary/15 text-primary font-semibold'
                            : ev.planned
                              ? 'border border-dashed border-white/25 text-muted-foreground'
                              : 'bg-white/[0.06] text-muted-foreground'
                        }`}
                      >
                        {ev.kind === 'match' ? (
                          <Swords className="w-2.5 h-2.5 shrink-0" />
                        ) : (
                          <Dumbbell className="w-2.5 h-2.5 shrink-0" />
                        )}
                        <span className="truncate">{ev.label}</span>
                        {ev.sub && <span className="ms-auto font-mono shrink-0" dir="ltr">{ev.sub}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-primary/40" /> {t('cal.match')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-white/[0.15]" /> {t('cal.training')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-dashed border-white/40" /> {t('cal.planned')}
          </span>
        </div>
        {/* Weekly cycle editor */}
        <Dialog open={cycleOpen} onOpenChange={setCycleOpen}>
          <DialogContent dir={isRtl ? 'rtl' : 'ltr'} className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('cal.cycle')}</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground -mt-2">{t('cal.cycleHint')}</p>
            <div className="space-y-2">
              {weekdayLabels.map((label, dow) => {
                const day = cycleDraft[dow];
                return (
                  <div key={dow} className="flex items-center gap-2">
                    <span className="w-10 text-xs text-muted-foreground shrink-0">{label}</span>
                    <Select
                      value={day ? day.focus : 'rest'}
                      onValueChange={(v) => {
                        const next = [...cycleDraft];
                        next[dow] = v === 'rest' ? null : { dayOfWeek: dow, focus: v, intensity: day?.intensity ?? 'medium', durationMinutes: day?.durationMinutes ?? 90, time: day?.time ?? null };
                        setCycleDraft(next);
                      }}
                    >
                      <SelectTrigger className="flex-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rest">{t('cal.rest')}</SelectItem>
                        {FOCUS_KEYS.map((k) => (
                          <SelectItem key={k} value={k}>{t(`train.focus.${k}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {day && (
                      <>
                        <Select
                          value={day.intensity ?? 'medium'}
                          onValueChange={(v) => {
                            const next = [...cycleDraft];
                            next[dow] = { ...day, intensity: v };
                            setCycleDraft(next);
                          }}
                        >
                          <SelectTrigger className="w-24 h-9 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(['light', 'medium', 'high'] as const).map((k) => (
                              <SelectItem key={k} value={k}>{t(`train.intensity.${k}`)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min="1"
                          max="600"
                          className="w-20 h-9 text-xs"
                          value={day.durationMinutes ?? ''}
                          placeholder={t('train.minutes')}
                          onChange={(e) => {
                            const next = [...cycleDraft];
                            next[dow] = { ...day, durationMinutes: e.target.value ? Number(e.target.value) : null };
                            setCycleDraft(next);
                          }}
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
              <Button
                variant="outline"
                disabled={saveCycle.isPending || applyCycle.isPending || monthInPast}
                onClick={() => {
                  const days = cycleDraft.filter(Boolean) as CycleDay[];
                  saveCycle.mutate(days, {
                    onError: showError,
                    onSuccess: () => {
                      const from = format(new Date() > month ? new Date() : month, 'yyyy-MM-dd');
                      const to = format(eom(month), 'yyyy-MM-dd');
                      applyCycle.mutate(
                        { from, to },
                        {
                          onError: showError,
                          onSuccess: (r) => {
                            toast({ title: t('cal.applied').replace('{n}', String(r.created)) });
                            setCycleOpen(false);
                          },
                        },
                      );
                    },
                  });
                }}
              >
                {t('cal.applyMonth')}
              </Button>
              <Button
                disabled={saveCycle.isPending}
                onClick={() => {
                  const days = cycleDraft.filter(Boolean) as CycleDay[];
                  saveCycle.mutate(days, {
                    onError: showError,
                    onSuccess: () => {
                      toast({ title: t('cal.cycleSaved') });
                      setCycleOpen(false);
                    },
                  });
                }}
              >
                {t('cal.saveCycle')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Quick add training on a day */}
        <Dialog open={dayOpen !== null} onOpenChange={(o) => !o && setDayOpen(null)}>
          <DialogContent dir={isRtl ? 'rtl' : 'ltr'} className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('cal.dayTitle').replace('{date}', dayOpen ? format(new Date(dayOpen + 'T00:00:00'), 'dd/MM/yyyy') : '')}</DialogTitle>
            </DialogHeader>
            {(() => {
              const dayTrainings = (trainings ?? []).filter((tr) => tr.date === dayOpen);
              const dayMatches = (matches ?? []).filter((m) => m.date === dayOpen);
              const dayExcuses = excusesByDay.get(dayOpen ?? '') ?? [];
              if (dayTrainings.length === 0 && dayMatches.length === 0 && dayExcuses.length === 0) return null;
              return (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-muted-foreground">{t('cal.onThisDay')}</p>
                  {dayMatches.map((m) => (
                    <div key={`m${m.id}`} className="flex items-center gap-2 rounded-lg bg-primary/[0.07] border border-primary/20 px-2.5 py-1.5 text-xs">
                      <Swords className="w-3 h-3 text-primary shrink-0" />
                      <span className="truncate">{m.opponent}</span>
                      <span className="ms-auto font-mono" dir="ltr">{m.ourGoals} - {m.theirGoals}</span>
                    </div>
                  ))}
                  {dayTrainings.map((tr) => (
                    <div key={`t${tr.id}`} className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-border/50 px-2.5 py-1.5 text-xs">
                      <Dumbbell className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{t(`train.focus.${tr.focus}`)}</span>
                      {tr.intensity && <span className="text-muted-foreground">{t(`train.intensity.${tr.intensity}`)}</span>}
                      {tr.durationMinutes && <span className="text-muted-foreground" dir="ltr">{tr.durationMinutes}{t('train.minutes')}</span>}
                      <button
                        type="button"
                        className="ms-auto text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => deleteTraining.mutate(tr.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {dayExcuses.length > 0 && (
                    <div className="pt-1.5 space-y-1">
                      <p className="text-[10px] font-semibold text-amber-400/90">{t('cal.excuses')}</p>
                      {dayExcuses.map((ex, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs">
                          <span className="font-medium shrink-0">{ex.playerName}</span>
                          <span className="text-muted-foreground shrink-0">({t(`att.status.${ex.status}`)})</span>
                          <span className="text-foreground/90">{ex.note}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="space-y-3">
              <Select value={dayFocus} onValueChange={setDayFocus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FOCUS_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>{t(`train.focus.${k}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Select value={dayIntensity} onValueChange={setDayIntensity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['light', 'medium', 'high'] as const).map((k) => (
                      <SelectItem key={k} value={k}>{t(`train.intensity.${k}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="1"
                  max="600"
                  placeholder={t('train.duration')}
                  value={dayDuration}
                  onChange={(e) => setDayDuration(e.target.value)}
                />
              </div>
              <Button
                className="w-full gap-1.5"
                disabled={createTraining.isPending}
                onClick={() => {
                  if (!dayOpen) return;
                  createTraining.mutate(
                    {
                      date: dayOpen,
                      focus: dayFocus,
                      intensity: dayIntensity,
                      durationMinutes: dayDuration ? Number(dayDuration) : undefined,
                    },
                    {
                      onError: showError,
                      onSuccess: () => {
                        toast({ title: t('tactics.saved') });
                        setDayOpen(null);
                      },
                    },
                  );
                }}
              >
                <Plus className="w-4 h-4" /> {t('cal.addTraining')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

export default CalendarPage;
