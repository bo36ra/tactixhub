import React from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { StickyHeader, PageTitle } from '@/components/page-header';
import { PullToRefresh } from '@/components/pull-to-refresh';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { playerName } from '@/lib/player-name';
import { useListMatches, getListMatchesQueryKey, useListAttendance, getListAttendanceQueryKey, useListPlayers, getListPlayersQueryKey, useCreateMatch, useUpdateMatch, useDeleteMatch, useListGoals, getListGoalsQueryKey, type MatchInputType } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  useTrainings, useCreateTraining, useWeekCycle, useSaveWeekCycle, useApplyCycle,
  useMonthPlan, useSaveMonthPlan, useDeleteTraining, useUpdateTraining, type CycleDay,
} from '@/lib/dev-api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FOCUS_KEYS, focusLabel } from '@/pages/trainings';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  isSameMonth,
  isToday,
  differenceInCalendarDays,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Swords, Dumbbell, Repeat, Target, Plus, Trash2, Pencil, Eye, Printer, LayoutGrid, CalendarDays } from 'lucide-react';
import { MicrocycleGrid } from '@/components/microcycle-grid';
import { endOfMonth as eom } from 'date-fns';

// One month view that merges matches and training sessions — the coach's
// whole schedule in a single grid instead of two separate pages.
export function CalendarPage() {
  const { t, isRtl, lang } = useLanguage();
  const { activeTeamId } = useTeam();
  const [viewMode, setViewMode] = React.useState<'calendar' | 'grid'>('calendar');
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
  const { data: allGoals } = useListGoals(tid, { query: { enabled, queryKey: getListGoalsQueryKey(tid) } });

  // Per-day absence/excuse notes: "player — reason" for every attendance
  // record that carries a note.
  const excusesByDay = React.useMemo(() => {
    const nameOf = new Map((players ?? []).map((p) => [p.id, playerName(p, lang)]));
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
  const { data: cycle } = useWeekCycle(tid, monthKey);
  const saveCycle = useSaveWeekCycle(tid, monthKey);
  // Keeps the weekly cycle a live reflection of the calendar rather
  // than a separate thing that only syncs once when first opened —
  // every time a training is added or edited for a specific date, the
  // matching day-of-week slot in the cycle is updated to match too,
  // silently, in the background. The cycle dialog's own Save/Apply
  // buttons still work exactly as before for editing the template
  // directly; this just means the two are never out of sync from the
  // calendar side either.
  const syncCycleFromTraining = React.useCallback(
    (date: string, focus: string, intensity: string | null, durationMinutes: number | null) => {
      if (focus === 'rest_day') return; // a one-off rest day shouldn't turn that weekday into a rest template
      const dow = (new Date(date + 'T00:00:00').getDay() + 6) % 7;
      const merged: CycleDay[] = (cycle ?? []).filter((c) => c.dayOfWeek !== dow);
      merged.push({ dayOfWeek: dow, focus, intensity, durationMinutes, time: null });
      saveCycle.mutate(merged);
    },
    [cycle, saveCycle],
  );
  const applyCycle = useApplyCycle(tid);
  const createTraining = useCreateTraining(tid);
  const deleteTraining = useDeleteTraining(tid);
  const createMatch = useCreateMatch();
  const updateMatch = useUpdateMatch();
  const deleteMatch = useDeleteMatch();
  const [matchDeleteId, setMatchDeleteId] = React.useState<number | null>(null);
  const [detail, setDetail] = React.useState<{ kind: 'training' | 'match'; id: number } | null>(null);
  const [summaryDay, setSummaryDay] = React.useState<string | null>(null);
  const updateTraining = useUpdateTraining(tid);
  const queryClient = useQueryClient();

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
  const [cycleInferred, setCycleInferred] = React.useState(false);
  // What date range "Apply" actually targets — previously hardcoded to
  // "today through end of month", meaning every application spread
  // across every remaining week of the month whether that was intended
  // or not. Defaults to that same range for familiarity, but the coach
  // can narrow it to just the current week or pick any custom range.
  const [applyRangePreset, setApplyRangePreset] = React.useState<'week' | 'month' | 'custom'>('month');
  const [applyFromCustom, setApplyFromCustom] = React.useState('');
  const [applyToCustom, setApplyToCustom] = React.useState('');

  const resolveApplyRange = (): { from: string; to: string } | null => {
    const today = new Date();
    const monthStart = today > month ? today : month;
    if (applyRangePreset === 'month') {
      return { from: format(monthStart, 'yyyy-MM-dd'), to: format(eom(month), 'yyyy-MM-dd') };
    }
    if (applyRangePreset === 'week') {
      const weekStart = startOfWeek(monthStart, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(monthStart, { weekStartsOn: 1 });
      return { from: format(weekStart > monthStart ? weekStart : monthStart, 'yyyy-MM-dd'), to: format(weekEnd, 'yyyy-MM-dd') };
    }
    if (applyFromCustom && applyToCustom) return { from: applyFromCustom, to: applyToCustom };
    return null;
  };
  React.useEffect(() => {
    if (cycleOpen) {
      setApplyRangePreset('month');
      setApplyFromCustom('');
      setApplyToCustom('');
    }
  }, [cycleOpen]);

  React.useEffect(() => {
    if (!cycleOpen) return;
    // The backend fills in computed 'match' entries (id: -1) for any
    // weekday with no explicit row, straight from real match data —
    // those aren't a "saved cycle" on their own, just useful context
    // to merge in either way below.
    const explicitCycle = (cycle ?? []).filter((c) => c.id !== -1);
    if (explicitCycle.length > 0) {
      // A cycle was actually saved before — use it (plus any computed
      // match fills for days that were never explicitly set) as-is.
      const draft: (CycleDay | null)[] = Array(7).fill(null);
      (cycle ?? []).forEach((c) => { draft[c.dayOfWeek] = { ...c }; });
      setCycleDraft(draft);
      setCycleInferred(false);
      return;
    }
    // No saved cycle for this month yet. Rather than showing every day
    // as blank/rest — confusing when this month's calendar already has
    // a real, repeating pattern of individually-added trainings — infer
    // a starting draft from that month's own existing data only (not
    // other months', now that each month has its own cycle): for each
    // day of week, the most recent training actually logged on that
    // weekday within this month. The coach still has to press Save to
    // make it a real cycle; this only pre-fills the form.
    const draft: (CycleDay | null)[] = Array(7).fill(null);
    const combined: { date: string; dow: number; entry: CycleDay }[] = [];
    (trainings ?? [])
      .filter((tr) => tr.focus !== 'rest_day' && tr.date.startsWith(monthKey))
      .forEach((tr) => {
        const dow = (new Date(tr.date + 'T00:00:00').getDay() + 6) % 7;
        combined.push({
          date: tr.date,
          dow,
          entry: { dayOfWeek: dow, focus: tr.focus.split(',')[0]?.trim() || tr.focus, intensity: tr.intensity, durationMinutes: tr.durationMinutes, time: tr.time },
        });
      });
    (matches ?? [])
      .filter((m) => m.date.startsWith(monthKey))
      .forEach((m) => {
        const dow = (new Date(m.date + 'T00:00:00').getDay() + 6) % 7;
        combined.push({ date: m.date, dow, entry: { dayOfWeek: dow, focus: 'match', intensity: null, durationMinutes: null, time: null } });
      });
    combined
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(({ dow, entry }) => { draft[dow] = entry; });
    setCycleDraft(draft);
    setCycleInferred(draft.some(Boolean));
  }, [cycleOpen, cycle, trainings, matches, monthKey]);

  // quick-add on a day
  const [dayOpen, setDayOpen] = React.useState<string | null>(null);
  const [dayFocus, setDayFocus] = React.useState<string[]>(['tactics']);
  const [dayIntensity, setDayIntensity] = React.useState('medium');
  const [dayDuration, setDayDuration] = React.useState('90');
  const [dayCustomFocus, setDayCustomFocus] = React.useState('');
  const [dayKind, setDayKind] = React.useState<'training' | 'match' | 'rest'>('training');
  const [dayRestNote, setDayRestNote] = React.useState('');
  const [dayOpponent, setDayOpponent] = React.useState('');
  const [dayMatchType, setDayMatchType] = React.useState<'league' | 'friendly' | 'cup'>('league');
  // Editing an existing item from this day (null = adding new)
  const [editTrainingId, setEditTrainingId] = React.useState<number | null>(null);
  const [editMatchId, setEditMatchId] = React.useState<number | null>(null);
  const [dayScoreUs, setDayScoreUs] = React.useState('0');
  const [dayScoreThem, setDayScoreThem] = React.useState('0');

  const resetDayForm = () => {
    setEditTrainingId(null);
    setEditMatchId(null);
    setDayOpponent('');
    setDayScoreUs('0');
    setDayScoreThem('0');
    setDayKind('training');
    setDayCustomFocus('');
    setDayRestNote('');
  };
  // A fully past month can't receive planned sessions
  const monthInPast = eom(month) < new Date(new Date().toDateString());
  const showError = (err: unknown) =>
    toast({ title: err instanceof Error ? err.message : 'Error', variant: 'destructive' });

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
      push(tr.date, { kind: 'training', label: focusLabel(t, tr.focus), sub: tr.time ?? undefined, planned: tr.date > todayIso });
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

  // One row per day actually in this month, with an "MD" (match day)
  // relative label — MD on a match date itself, MD-N for N days before
  // the nearest match, MD+N for N days after. This mirrors the layout
  // of the uploaded Excel microcycle template (Date / Day / MD /
  // Session / Duration / ... columns), used only for the print view.
  const printRows = React.useMemo(() => {
    const matchDates = (matches ?? []).map((m) => new Date(m.date + 'T00:00:00'));
    return days
      .filter((d) => isSameMonth(d, month))
      .map((d) => {
        const key = format(d, 'yyyy-MM-dd');
        const dayMatch = (matches ?? []).find((m) => m.date === key);
        const dayTraining = (trainings ?? []).find((tr) => tr.date === key);
        let mdLabel = '';
        if (dayTraining?.mdLabel) {
          mdLabel = dayTraining.mdLabel;
        } else if (matchDates.length > 0) {
          const nearest = matchDates.reduce((best, cur) =>
            Math.abs(differenceInCalendarDays(cur, d)) < Math.abs(differenceInCalendarDays(best, d)) ? cur : best
          );
          const diff = differenceInCalendarDays(d, nearest); // negative = before the match, positive = after
          mdLabel = diff === 0 ? 'MD' : diff < 0 ? `MD${diff}` : `MD+${diff}`;
        }
        return {
          date: d,
          dayName: format(d, 'EEEE'),
          mdLabel,
          session: dayMatch
            ? `${t('cal.printMatch')} — ${dayMatch.opponent}`
            : dayTraining
            ? focusLabel(t, dayTraining.focus)
            : t('cal.rest'),
          duration: dayMatch ? 90 : dayTraining?.durationMinutes ?? null,
          intensity: dayTraining?.intensity ? t(`train.intensity.${dayTraining.intensity}`) : '',
          notes: dayTraining?.notes ?? '',
        };
      });
  }, [days, month, matches, trainings, t]);

  const weekdayLabels = React.useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(isRtl ? 'ar' : 'en', { weekday: 'short' }).format(addDays(monday, i)),
    );
  }, [isRtl]);

  if (!activeTeamId) return <NoTeamState />;

  return (
    <AppLayout>
      <PullToRefresh onRefresh={() => queryClient.invalidateQueries()}>
      <div className="space-y-6 print:hidden">
        <StickyHeader>
        <div className="flex items-center justify-between">
          <PageTitle>{t('cal.title')}</PageTitle>
          <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setViewMode((v) => (v === 'calendar' ? 'grid' : 'calendar'))}>
            {viewMode === 'calendar' ? <LayoutGrid className="w-3.5 h-3.5" /> : <CalendarDays className="w-3.5 h-3.5" />}
            {viewMode === 'calendar' ? t('cal.gridView') : t('cal.calendarView')}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" /> {t('cal.print')}
          </Button>
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
        </StickyHeader>

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
                    {
                      onSuccess: () => toast({ title: t('tactics.saved') }),
                      onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }),
                    },
                  )
                }
              >
                {t('common.save')}
              </Button>
            </div>
          )}
        </div>

        {viewMode === 'calendar' ? (
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
              const hasContent = events.length > 0 || (excusesByDay.get(key) ?? []).length > 0;
              return (
                <div
                  key={key}
                  role="button"
                  onClick={() => {
                    if (!inMonth) return;
                    setDayOpen(key);
                    // Pre-fill the add-training defaults from the weekly
                    // cycle's template for this day of week — previously
                    // this always started from the same hardcoded
                    // defaults regardless of what the cycle said, which
                    // made the cycle feel disconnected from the calendar
                    // even though "Apply Cycle" already respects it when
                    // generating a whole month at once. This covers the
                    // other path: clicking a single day by hand.
                    const dayHasContent = (eventsByDay.get(key) ?? []).length > 0;
                    if (!dayHasContent) {
                      const dow = (day.getDay() + 6) % 7; // JS Sunday=0 → ISO Monday=0, matches the backend's cycle/apply conversion
                      const tpl = (cycle ?? []).find((c) => c.dayOfWeek === dow);
                      if (tpl) {
                        setDayFocus(tpl.focus.split(',').map((f) => f.trim()).filter(Boolean));
                        setDayIntensity(tpl.intensity ?? 'medium');
                        setDayDuration(tpl.durationMinutes != null ? String(tpl.durationMinutes) : '90');
                      }
                    }
                  }}
                  className={`relative min-h-20 sm:min-h-24 border-t border-e border-border/40 p-1 sm:p-1.5 cursor-pointer hover:bg-white/[0.03] transition-colors ${
                    inMonth ? '' : 'opacity-35 pointer-events-none'
                  }`}
                >
                  {hasContent && (
                    <button
                      type="button"
                      aria-label={t('cal.details')}
                      onClick={(e) => { e.stopPropagation(); setSummaryDay(key); }}
                      className="absolute top-0.5 end-0.5 z-10 p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-white/[0.08]"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                  )}
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-mono ${
                      isToday(day) ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground'
                    }`}
                    dir="ltr"
                  >
                    {format(day, 'd')}
                  </span>
                  <div className="mt-0.5 space-y-0.5">
                    {(excusesByDay.get(key) ?? []).length > 0 && (
                      <span
                        title={(excusesByDay.get(key) ?? []).map((ex) => `${ex.playerName}: ${ex.note}`).join(' · ')}
                        className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400"
                      />
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
        ) : (
          <MicrocycleGrid teamId={tid} month={month} days={days} trainings={trainings ?? []} matches={matches ?? []} onTrainingSaved={syncCycleFromTraining} />
        )}

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
        {/* Direct day summary — tap the eye on a calendar cell to see
            everything committed that day without opening the add/edit
            form first. Read-only; each row still opens full detail. */}
        <Dialog open={summaryDay !== null} onOpenChange={(o) => !o && setSummaryDay(null)}>
          <DialogContent dir={isRtl ? 'rtl' : 'ltr'} className="max-w-sm max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">
                {summaryDay ? format(new Date(summaryDay + 'T00:00:00'), 'dd/MM/yyyy') : ''}
              </DialogTitle>
            </DialogHeader>
            {(() => {
              if (!summaryDay) return null;
              const dayTrainings = (trainings ?? []).filter((tr) => tr.date === summaryDay);
              const dayMatches = (matches ?? []).filter((m) => m.date === summaryDay);
              const dayExcuses = excusesByDay.get(summaryDay) ?? [];
              if (dayTrainings.length === 0 && dayMatches.length === 0 && dayExcuses.length === 0) {
                return <p className="text-sm text-muted-foreground">{t('cal.noContent')}</p>;
              }
              return (
                <div className="space-y-2">
                  {dayMatches.map((m) => (
                    <button
                      key={`m${m.id}`}
                      type="button"
                      onClick={() => { setDetail({ kind: 'match', id: m.id }); setSummaryDay(null); }}
                      className="w-full flex items-center gap-2 rounded-lg bg-primary/[0.07] border border-primary/20 px-3 py-2 text-sm text-start hover:bg-primary/[0.12] transition-colors"
                    >
                      <Swords className="w-4 h-4 text-primary shrink-0" />
                      <span className="truncate flex-1">{m.opponent}</span>
                      <span className="font-mono" dir="ltr">{m.ourGoals} - {m.theirGoals}</span>
                    </button>
                  ))}
                  {dayTrainings.map((tr) => (
                    <button
                      key={`t${tr.id}`}
                      type="button"
                      onClick={() => { setDetail({ kind: 'training', id: tr.id }); setSummaryDay(null); }}
                      className="w-full flex items-center gap-2 rounded-lg bg-white/[0.04] border border-border/50 px-3 py-2 text-sm text-start hover:bg-white/[0.08] transition-colors"
                    >
                      <Dumbbell className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1">{focusLabel(t, tr.focus)}</span>
                      {tr.intensity && <span className="text-xs text-muted-foreground">{t(`train.intensity.${tr.intensity}`)}</span>}
                      {tr.durationMinutes && <span className="text-xs text-muted-foreground" dir="ltr">{tr.durationMinutes}{t('train.minutes')}</span>}
                    </button>
                  ))}
                  {dayExcuses.length > 0 && (
                    <div className="pt-1.5 space-y-1">
                      <p className="text-[10px] font-semibold text-amber-400/90">{t('cal.excuses')}</p>
                      {dayExcuses.map((ex, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs">
                          <span className="font-medium shrink-0">{ex.playerName}</span>
                          <span className="text-foreground/90">{ex.note}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Weekly cycle editor */}
        <Dialog open={cycleOpen} onOpenChange={setCycleOpen}>
          <DialogContent dir={isRtl ? 'rtl' : 'ltr'} className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('cal.cycle')} — {format(month, 'MM / yyyy')}</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground -mt-2">{t('cal.cycleHint')}</p>
            <p className="text-[11px] text-primary bg-primary/10 rounded-lg px-3 py-1.5">{t('cal.cycleMonthNote')}</p>
            {cycleInferred && (
              <p className="text-xs bg-primary/10 text-primary rounded-lg px-3 py-2">{t('cal.cycleInferredNote')}</p>
            )}
            <div className="space-y-2">
              {weekdayLabels.map((label, dow) => {
                const day = cycleDraft[dow];
                const isRest = day?.focus === 'rest_day';
                const focusText = (day?.focus === 'match' || isRest) ? '' : (day?.focus ?? '');
                return (
                  <div key={dow} className="flex items-center gap-1.5 flex-wrap">
                    <span className="w-10 text-xs text-muted-foreground shrink-0">{label}</span>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          // An explicit stored 'rest_day' entry, not just
                          // clearing the slot to null/absent — absence
                          // means "no explicit choice for this weekday",
                          // which falls back to the computed match check.
                          // A day the coach has explicitly marked Rest
                          // needs to actually override that computed
                          // value, which only works if it's a real,
                          // saved choice of its own.
                          const next = [...cycleDraft];
                          next[dow] = { dayOfWeek: dow, focus: 'rest_day', intensity: null, durationMinutes: null, time: null };
                          setCycleDraft(next);
                        }}
                        className={`h-9 px-2 rounded-lg text-[11px] font-medium border ${isRest ? 'bg-primary/15 text-primary border-primary/40' : 'border-border/60 text-muted-foreground'}`}
                      >
                        {t('cal.rest')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { const next = [...cycleDraft]; next[dow] = { dayOfWeek: dow, focus: 'match', intensity: null, durationMinutes: null, time: null }; setCycleDraft(next); }}
                        className={`h-9 px-2 rounded-lg text-[11px] font-medium border ${day?.focus === 'match' ? 'bg-primary/15 text-primary border-primary/40' : 'border-border/60 text-muted-foreground'}`}
                      >
                        {t('cal.kindMatch')}
                      </button>
                    </div>
                    {day && day.focus !== 'match' && !isRest && (
                      <>
                        {/* Free text rather than a fixed Select — a training
                            synced from the calendar can combine several
                            focus keys plus custom text (e.g.
                            "strength,speed_agility,extra note"), which a
                            strict single-value dropdown can't represent
                            and would show blank for. This always displays
                            and can edit whatever string is actually
                            stored, matching the calendar's own flexibility. */}
                        <Input
                          className="flex-1 min-w-28 h-9 text-xs"
                          list="cycle-focus-options"
                          placeholder={t('train.focusCustomPh')}
                          value={focusText}
                          onChange={(e) => {
                            const next = [...cycleDraft];
                            next[dow] = { dayOfWeek: dow, focus: e.target.value, intensity: day.intensity ?? 'medium', durationMinutes: day.durationMinutes ?? 90, time: day.time ?? null };
                            setCycleDraft(next);
                          }}
                        />
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
                            {(['very_light', 'light', 'medium', 'high', 'very_high'] as const).map((k) => (
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
            <datalist id="cycle-focus-options">
              {FOCUS_KEYS.map((k) => (
                <option key={k} value={k}>{t(`train.focus.${k}`)}</option>
              ))}
            </datalist>
            <div className="space-y-1.5 rounded-lg border border-border/60 p-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground">{t('cal.applyRangeLabel')}</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setApplyRangePreset('week')}
                  className={`flex-1 text-[11px] font-medium py-1.5 rounded-lg border ${applyRangePreset === 'week' ? 'bg-primary/15 text-primary border-primary/40' : 'border-border/60 text-muted-foreground'}`}
                >
                  {t('cal.applyRangeWeek')}
                </button>
                <button
                  type="button"
                  onClick={() => setApplyRangePreset('month')}
                  className={`flex-1 text-[11px] font-medium py-1.5 rounded-lg border ${applyRangePreset === 'month' ? 'bg-primary/15 text-primary border-primary/40' : 'border-border/60 text-muted-foreground'}`}
                >
                  {t('cal.applyRangeMonth')}
                </button>
                <button
                  type="button"
                  onClick={() => setApplyRangePreset('custom')}
                  className={`flex-1 text-[11px] font-medium py-1.5 rounded-lg border ${applyRangePreset === 'custom' ? 'bg-primary/15 text-primary border-primary/40' : 'border-border/60 text-muted-foreground'}`}
                >
                  {t('cal.applyRangeCustom')}
                </button>
              </div>
              {applyRangePreset === 'custom' ? (
                <div className="flex items-center gap-2">
                  <Input type="date" className="flex-1 h-9 text-xs" value={applyFromCustom} onChange={(e) => setApplyFromCustom(e.target.value)} />
                  <span className="text-muted-foreground text-xs">–</span>
                  <Input type="date" className="flex-1 h-9 text-xs" value={applyToCustom} onChange={(e) => setApplyToCustom(e.target.value)} />
                </div>
              ) : (
                (() => {
                  const r = resolveApplyRange();
                  return r ? (
                    <p className="text-[11px] text-muted-foreground" dir="ltr">{r.from} → {r.to}</p>
                  ) : null;
                })()
              )}
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
              <Button
                variant="outline"
                disabled={saveCycle.isPending || applyCycle.isPending || monthInPast}
                onClick={() => {
                  const range = resolveApplyRange();
                  if (!range) { toast({ title: t('cal.applyRangeInvalid'), variant: 'destructive' }); return; }
                  // Exclude computed-only entries (id: -1, the
                  // backend's auto-detected Match days) the coach never
                  // actually touched — saving them would turn a
                  // dynamically-computed value into a permanently stored
                  // one, reintroducing exactly the staleness problem
                  // going stale-proof was meant to fix.
                  const days = cycleDraft.filter((d): d is CycleDay => d !== null && d.id !== -1);
                  saveCycle.mutate(days, {
                    onError: showError,
                    onSuccess: () => {
                      applyCycle.mutate(
                        range,
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
                  // Exclude computed-only entries (id: -1, the
                  // backend's auto-detected Match days) the coach never
                  // actually touched — saving them would turn a
                  // dynamically-computed value into a permanently stored
                  // one, reintroducing exactly the staleness problem
                  // going stale-proof was meant to fix.
                  const days = cycleDraft.filter((d): d is CycleDay => d !== null && d.id !== -1);
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
        <Dialog open={dayOpen !== null} onOpenChange={(o) => { if (!o) { setDayOpen(null); resetDayForm(); } }}>
          <DialogContent dir={isRtl ? 'rtl' : 'ltr'} className="max-w-sm max-h-[85vh] overflow-y-auto">
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
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-primary shrink-0"
                        onClick={() => setDetail({ kind: 'match', id: m.id })}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-primary shrink-0"
                        onClick={() => {
                          setDayKind('match');
                          setEditMatchId(m.id);
                          setEditTrainingId(null);
                          setDayOpponent(m.opponent);
                          setDayMatchType(m.type as MatchInputType);
                          setDayScoreUs(String(m.ourGoals));
                          setDayScoreThem(String(m.theirGoals));
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className="text-destructive/60 hover:text-destructive active:text-destructive shrink-0"
                        onClick={() => setMatchDeleteId(m.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {dayTrainings.map((tr) => (
                    <div key={`t${tr.id}`} className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-border/50 px-2.5 py-1.5 text-xs">
                      <Dumbbell className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{focusLabel(t, tr.focus)}</span>
                      {tr.intensity && <span className="text-muted-foreground">{t(`train.intensity.${tr.intensity}`)}</span>}
                      {tr.durationMinutes && <span className="text-muted-foreground" dir="ltr">{tr.durationMinutes}{t('train.minutes')}</span>}
                      <button
                        type="button"
                        className="ms-auto text-muted-foreground hover:text-primary shrink-0"
                        onClick={() => setDetail({ kind: 'training', id: tr.id })}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-primary shrink-0"
                        onClick={() => {
                          setEditTrainingId(tr.id);
                          setEditMatchId(null);
                          if (tr.focus === 'rest_day') {
                            setDayKind('rest');
                            setDayRestNote(tr.notes ?? '');
                            return;
                          }
                          setDayKind('training');
                          const parts = tr.focus.split(',').map((f) => f.trim()).filter(Boolean);
                          const knownParts = parts.filter((f) => (FOCUS_KEYS as readonly string[]).includes(f));
                          const customParts = parts.filter((f) => !(FOCUS_KEYS as readonly string[]).includes(f));
                          setDayFocus(knownParts);
                          setDayCustomFocus(customParts.join(', '));
                          setDayIntensity(tr.intensity ?? 'medium');
                          setDayDuration(tr.durationMinutes ? String(tr.durationMinutes) : '');
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className="text-destructive/60 hover:text-destructive active:text-destructive shrink-0"
                        onClick={() => deleteTraining.mutate(tr.id, { onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }) })}
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
              {/* What is being added: a training session or a match */}
              <div className="grid grid-cols-3 rounded-lg border border-border/60 overflow-hidden">
                {(['training', 'match', 'rest'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDayKind(k)}
                    className={`py-2 text-xs sm:text-sm font-semibold transition-colors ${
                      dayKind === k ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-white/[0.04]'
                    }`}
                  >
                    {t(k === 'training' ? 'cal.kindTraining' : k === 'match' ? 'cal.kindMatch' : 'cal.kindRest')}
                  </button>
                ))}
              </div>

              {dayKind === 'match' ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('cal.opponent')}</Label>
                    <Input
                      placeholder={t('cal.opponentPh')}
                      value={dayOpponent}
                      onChange={(e) => setDayOpponent(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('match.matchType')}</Label>
                    <div className="flex rounded-lg border border-border/60 overflow-hidden w-fit">
                      {(['league', 'friendly', 'cup'] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setDayMatchType(k)}
                          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                            dayMatchType === k ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-white/[0.04]'
                          }`}
                        >
                          {t(`match.${k}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {editMatchId !== null && dayOpen !== null && dayOpen <= todayIso && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('cal.score')}</Label>
                      <div className="flex items-center gap-2" dir="ltr">
                        <Input type="number" min="0" className="w-20 text-center" value={dayScoreUs} onChange={(e) => setDayScoreUs(e.target.value)} />
                        <span className="text-muted-foreground">-</span>
                        <Input type="number" min="0" className="w-20 text-center" value={dayScoreThem} onChange={(e) => setDayScoreThem(e.target.value)} />
                      </div>
                    </div>
                  )}
                  {editMatchId !== null && dayOpen !== null && dayOpen > todayIso && (
                    <p className="text-[11px] text-muted-foreground">{t('cal.matchNotPlayedYet')}</p>
                  )}
                  <Button
                    className="w-full gap-1.5"
                    disabled={!dayOpponent.trim() || createMatch.isPending || updateMatch.isPending}
                    onClick={() => {
                      if (!dayOpen || !activeTeamId) return;
                      const done = () => {
                        toast({ title: t('match.saved') });
                        queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey(activeTeamId) });
                        // The cycle now computes "match" days directly
                        // from real match data on the backend rather than
                        // needing an explicit push here — just refetch it
                        // so a currently-open cycle view picks up the
                        // change.
                        queryClient.invalidateQueries({ queryKey: ['week-cycle', activeTeamId, monthKey] });
                        resetDayForm();
                        setDayOpen(null);
                      };
                      if (editMatchId !== null) {
                        updateMatch.mutate(
                          {
                            teamId: activeTeamId,
                            matchId: editMatchId,
                            data: {
                              opponent: dayOpponent.trim(),
                              type: dayMatchType,
                              ourGoals: Math.max(0, Number(dayScoreUs) || 0),
                              theirGoals: Math.max(0, Number(dayScoreThem) || 0),
                            },
                          },
                          { onError: showError, onSuccess: done },
                        );
                      } else {
                        createMatch.mutate(
                          {
                            teamId: activeTeamId,
                            data: { opponent: dayOpponent.trim(), date: dayOpen, type: dayMatchType as MatchInputType, ourGoals: 0, theirGoals: 0 },
                          },
                          { onError: showError, onSuccess: done },
                        );
                      }
                    }}
                  >
                    {editMatchId !== null ? t('cal.saveEdit') : (<><Plus className="w-4 h-4" /> {t('cal.addMatch')}</>)}
                  </Button>
                </>
              ) : dayKind === 'rest' ? (
                <>
                  <div className="rounded-xl bg-white/[0.03] border border-border/50 px-4 py-5 flex flex-col items-center gap-2 text-center">
                    <span className="text-2xl">🌙</span>
                    <p className="text-sm text-muted-foreground">{t('cal.restMarked')}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('cal.restNote')}</Label>
                    <Input
                      placeholder={t('cal.restNote')}
                      value={dayRestNote}
                      onChange={(e) => setDayRestNote(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full gap-1.5"
                    disabled={createTraining.isPending || updateTraining.isPending}
                    onClick={() => {
                      if (!dayOpen) return;
                      const done = () => {
                        toast({ title: t('tactics.saved') });
                        syncCycleFromTraining(dayOpen, 'rest_day', null, null);
                        resetDayForm();
                        setDayOpen(null);
                      };
                      if (editTrainingId !== null) {
                        updateTraining.mutate(
                          { id: editTrainingId, focus: 'rest_day', intensity: null, durationMinutes: null, notes: dayRestNote.trim() || null },
                          { onError: showError, onSuccess: done },
                        );
                      } else {
                        createTraining.mutate(
                          { date: dayOpen, focus: 'rest_day', notes: dayRestNote.trim() || undefined },
                          { onError: showError, onSuccess: done },
                        );
                      }
                    }}
                  >
                    {editTrainingId !== null ? t('cal.saveEdit') : (<><Plus className="w-4 h-4" /> {t('cal.kindRest')}</>)}
                  </Button>
                </>
              ) : (
              <>
              <div className="space-y-1.5">
              <Label className="text-xs">{t('cal.focusLabel')}</Label>
              <p className="text-[11px] text-muted-foreground">{t('train.focusMultiHint')}</p>
              {/* Focus as a tappable chip grid — every option visible at
                  once, no dropdown to fight with on a phone. Multiple
                  chips can be active together for one session. */}
              <div className="grid grid-cols-3 gap-1.5">
                {FOCUS_KEYS.map((k) => {
                  const active = dayFocus.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setDayFocus(active ? dayFocus.filter((f) => f !== k) : [...dayFocus, k])}
                      className={`px-1.5 py-2 rounded-lg text-[11px] leading-tight font-medium border transition-colors ${
                        active
                          ? 'bg-primary/15 text-primary border-primary/40'
                          : 'border-border/60 text-muted-foreground hover:bg-white/[0.04]'
                      }`}
                    >
                      {t(`train.focus.${k}`)}
                    </button>
                  );
                })}
              </div>
              <Input
                placeholder={t('train.focusCustomPh')}
                value={dayCustomFocus}
                onChange={(e) => setDayCustomFocus(e.target.value)}
              />
              </div>
              <div className="flex gap-3 flex-wrap">
                <div className="space-y-1.5">
                <Label className="text-xs">{t('train.intensity')}</Label>
                <div className="flex rounded-lg border border-border/60 overflow-hidden shrink-0">
                  {(['very_light', 'light', 'medium', 'high', 'very_high'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setDayIntensity(k)}
                      className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        dayIntensity === k
                          ? k === 'very_high' ? 'bg-red-500/20 text-red-400' : k === 'high' ? 'bg-orange-500/20 text-orange-400' : k === 'medium' ? 'bg-yellow-500/20 text-yellow-500' : k === 'light' ? 'bg-green-500/20 text-green-500' : 'bg-blue-500/20 text-blue-400'
                          : 'text-muted-foreground hover:bg-white/[0.04]'
                      }`}
                    >
                      {t(`train.intensity.${k}`)}
                    </button>
                  ))}
                </div>
                </div>
                <div className="space-y-1.5 flex-1 min-w-24">
                <Label className="text-xs">{t('train.duration')}</Label>
                <Input
                  type="number"
                  min="1"
                  max="600"
                  value={dayDuration}
                  onChange={(e) => setDayDuration(e.target.value)}
                />
                </div>
              </div>
              <Button
                className="w-full gap-1.5"
                disabled={createTraining.isPending || updateTraining.isPending || (dayFocus.length === 0 && !dayCustomFocus.trim())}
                onClick={() => {
                  if (!dayOpen) return;
                  const resolvedFocus = [...dayFocus, ...(dayCustomFocus.trim() ? [dayCustomFocus.trim()] : [])].join(',');
                  const resolvedDuration = dayDuration ? Number(dayDuration) : null;
                  const done = () => {
                    toast({ title: t('tactics.saved') });
                    syncCycleFromTraining(dayOpen, resolvedFocus, dayIntensity, resolvedDuration);
                    resetDayForm();
                    setDayOpen(null);
                  };
                  if (editTrainingId !== null) {
                    updateTraining.mutate(
                      {
                        id: editTrainingId,
                        focus: resolvedFocus,
                        intensity: dayIntensity,
                        durationMinutes: resolvedDuration,
                      },
                      { onError: showError, onSuccess: done },
                    );
                  } else {
                    createTraining.mutate(
                      {
                        date: dayOpen,
                        focus: resolvedFocus,
                        intensity: dayIntensity,
                        durationMinutes: resolvedDuration ?? undefined,
                      },
                      { onError: showError, onSuccess: done },
                    );
                  }
                }}
              >
                {editTrainingId !== null ? t('cal.saveEdit') : (<><Plus className="w-4 h-4" /> {t('cal.addTraining')}</>)}
              </Button>
              </>
              )}
            </div>
          </DialogContent>
        </Dialog>
        {/* Details viewer: full content of a training or match */}
        <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
          <DialogContent dir={isRtl ? 'rtl' : 'ltr'} className="max-w-sm max-h-[85vh] overflow-y-auto">
            {(() => {
              if (!detail) return null;
              if (detail.kind === 'training') {
                const tr = (trainings ?? []).find((x) => x.id === detail.id);
                if (!tr) return null;
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle className="text-base flex items-center gap-2">
                        <Dumbbell className="w-4 h-4 text-primary" />
                        {focusLabel(t, tr.focus)}
                        <span className="text-sm font-normal text-muted-foreground" dir="ltr">{tr.date}</span>
                      </DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-wrap gap-1.5">
                      {tr.intensity && (
                        <span className={`rounded px-2 py-0.5 text-xs ${
                          tr.intensity === 'very_high' ? 'bg-red-500/15 text-red-400' : tr.intensity === 'high' ? 'bg-orange-500/15 text-orange-400' : tr.intensity === 'medium' ? 'bg-yellow-500/15 text-yellow-500' : tr.intensity === 'light' ? 'bg-green-500/15 text-green-500' : 'bg-blue-500/15 text-blue-400'
                        }`}>
                          {t(`train.intensity.${tr.intensity}`)}
                        </span>
                      )}
                      {tr.durationMinutes && (
                        <span className="rounded px-2 py-0.5 text-xs bg-white/[0.06] text-muted-foreground" dir="ltr">
                          {tr.durationMinutes} {t('train.minutes')}
                        </span>
                      )}
                      {tr.time && (
                        <span className="rounded px-2 py-0.5 text-xs bg-white/[0.06] text-muted-foreground" dir="ltr">{tr.time}</span>
                      )}
                    </div>
                    {tr.drills && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold text-muted-foreground">{t('train.drills')}</p>
                        <p className="text-sm whitespace-pre-wrap rounded-lg bg-white/[0.03] border border-border/50 px-3 py-2">{tr.drills}</p>
                      </div>
                    )}
                    {tr.notes && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold text-muted-foreground">{t('train.notes')}</p>
                        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{tr.notes}</p>
                      </div>
                    )}
                    {!tr.drills && !tr.notes && (
                      <p className="text-xs text-muted-foreground">{t('cal.noContent')}</p>
                    )}
                  </>
                );
              }
              const m = (matches ?? []).find((x) => x.id === detail.id);
              if (!m) return null;
              const matchGoals = (allGoals ?? []).filter((g) => g.matchId === m.id);
              const ourGoals = matchGoals.filter((g) => g.type === 'scored').sort((a, b) => a.minute - b.minute);
              const theirGoals = matchGoals.filter((g) => g.type === 'conceded').sort((a, b) => a.minute - b.minute);
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-base flex items-center gap-2">
                      <Swords className="w-4 h-4 text-primary" />
                      {m.opponent}
                      <span className="ms-auto font-mono text-lg" dir="ltr">{m.ourGoals} - {m.theirGoals}</span>
                    </DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded px-2 py-0.5 text-xs bg-primary/10 text-primary">{t(`match.${m.type}`)}</span>
                    <span className="rounded px-2 py-0.5 text-xs bg-white/[0.06] text-muted-foreground" dir="ltr">{m.date}</span>
                  </div>
                  {ourGoals.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-green-500">{t('cal.goalsFor')}</p>
                      {ourGoals.map((g) => (
                        <div key={g.id} className="flex items-start gap-2 text-sm rounded-lg bg-white/[0.03] border border-border/50 px-3 py-1.5">
                          <span className="font-mono text-xs text-muted-foreground shrink-0" dir="ltr">{g.minute}'</span>
                          <span>{g.scorerName ?? '—'}</span>
                          {g.note && <span className="text-xs text-muted-foreground">{g.note}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {theirGoals.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-red-400">{t('cal.goalsAgainst')}</p>
                      {theirGoals.map((g) => (
                        <div key={g.id} className="flex items-start gap-2 text-sm rounded-lg bg-white/[0.03] border border-border/50 px-3 py-1.5">
                          <span className="font-mono text-xs text-muted-foreground shrink-0" dir="ltr">{g.minute}'</span>
                          {g.note ? <span className="text-xs text-muted-foreground">{g.note}</span> : <span className="text-muted-foreground">—</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {matchGoals.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t('cal.noContent')}</p>
                  )}
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={matchDeleteId !== null}
          title={t('match.deleteConfirm')}
          onConfirm={() => {
            if (matchDeleteId !== null && activeTeamId) {
              deleteMatch.mutate(
                { teamId: activeTeamId, matchId: matchDeleteId },
                {
                  onError: showError,
                  onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey(activeTeamId) });
                    // The backend itself clears the cycle's Match marker
                    // when that was the last match on this weekday (see
                    // the matches DELETE route) — refetch here so the
                    // frontend picks up that server-side change rather
                    // than trying to replicate the same decision against
                    // whatever match/cycle data happens to already be
                    // loaded client-side.
                    queryClient.invalidateQueries({ queryKey: ['week-cycle', activeTeamId, monthKey] });
                  },
                },
              );
            }
            setMatchDeleteId(null);
          }}
          onOpenChange={(o) => !o && setMatchDeleteId(null)}
        />
      </div>

      {/* Print-only view — a plain table, one row per day, laid out like
          the uploaded Excel microcycle template rather than the
          interactive grid above (which doesn't translate well to print:
          clickable cells, dialogs, and a 6-week grid with padding days
          from neighboring months aren't meaningful on paper). */}
      <div className="hidden print:block p-6">
        <h1 className="text-lg font-bold mb-1">{t('cal.title')} — {format(month, 'MM / yyyy')}</h1>
        <table className="w-full text-xs border-collapse" dir={isRtl ? 'rtl' : 'ltr'}>
          <thead>
            <tr className="border-b-2 border-black">
              <th className="text-start py-1.5 pe-2">{t('cal.printDate')}</th>
              <th className="text-start py-1.5 pe-2">{t('cal.printDay')}</th>
              <th className="text-start py-1.5 pe-2">MD</th>
              <th className="text-start py-1.5 pe-2">{t('cal.printSession')}</th>
              <th className="text-start py-1.5 pe-2">{t('cal.printDuration')}</th>
              <th className="text-start py-1.5 pe-2">{t('cal.printIntensity')}</th>
              <th className="text-start py-1.5">{t('cal.printNotes')}</th>
            </tr>
          </thead>
          <tbody>
            {printRows.map((row) => (
              <tr key={row.date.toISOString()} className="border-b border-gray-300">
                <td className="py-1 pe-2 whitespace-nowrap" dir="ltr">{format(row.date, 'dd/MM')}</td>
                <td className="py-1 pe-2">{row.dayName}</td>
                <td className="py-1 pe-2 font-mono" dir="ltr">{row.mdLabel}</td>
                <td className="py-1 pe-2">{row.session}</td>
                <td className="py-1 pe-2">{row.duration != null ? `${row.duration}'` : ''}</td>
                <td className="py-1 pe-2">{row.intensity}</td>
                <td className="py-1">{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </PullToRefresh>
    </AppLayout>
  );
}

export default CalendarPage;
