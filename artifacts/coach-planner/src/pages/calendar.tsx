import React from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useTeam } from '@/lib/team-context';
import { useLanguage } from '@/lib/i18n';
import { useListMatches, getListMatchesQueryKey } from '@workspace/api-client-react';
import { useTrainings } from '@/lib/dev-api';
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
import { ChevronLeft, ChevronRight, Swords, Dumbbell } from 'lucide-react';

// One month view that merges matches and training sessions — the coach's
// whole schedule in a single grid instead of two separate pages.
export function CalendarPage() {
  const { t, isRtl } = useLanguage();
  const { activeTeamId } = useTeam();
  const tid = activeTeamId ?? 0;
  const enabled = !!activeTeamId;
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));

  const { data: matches } = useListMatches(tid, { query: { enabled, queryKey: getListMatchesQueryKey(tid) } });
  const { data: trainings } = useTrainings(tid);

  const eventsByDay = React.useMemo(() => {
    const map = new Map<string, { kind: 'match' | 'training'; label: string; sub?: string }[]>();
    const push = (date: string, ev: { kind: 'match' | 'training'; label: string; sub?: string }) => {
      const list = map.get(date) ?? [];
      list.push(ev);
      map.set(date, list);
    };
    for (const m of matches ?? []) {
      push(m.date, { kind: 'match', label: m.opponent, sub: `${m.ourGoals}-${m.theirGoals}` });
    }
    for (const tr of trainings ?? []) {
      push(tr.date, { kind: 'training', label: t(`train.focus.${tr.focus}`), sub: tr.time ?? undefined });
    }
    return map;
  }, [matches, trainings, t]);

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
                  className={`min-h-20 sm:min-h-24 border-t border-e border-border/40 p-1 sm:p-1.5 ${
                    inMonth ? '' : 'opacity-35'
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
                    {events.map((ev, i) => (
                      <div
                        key={i}
                        title={`${t(ev.kind === 'match' ? 'cal.match' : 'cal.training')}: ${ev.label}`}
                        className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight truncate ${
                          ev.kind === 'match'
                            ? 'bg-primary/15 text-primary font-semibold'
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
        </div>
      </div>
    </AppLayout>
  );
}

export default CalendarPage;
