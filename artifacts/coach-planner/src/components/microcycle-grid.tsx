import React from 'react';
import { format, isSameMonth, differenceInCalendarDays } from 'date-fns';
import { useLanguage } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { useCreateTraining, useUpdateTraining, type Training } from '@/lib/dev-api';
import type { Match } from '@workspace/api-client-react';
import { FOCUS_KEYS } from '@/pages/trainings';

const INTENSITIES = ['very_light', 'light', 'medium', 'high', 'very_high'] as const;

// A plain, dense table meant to feel like editing cells in a
// spreadsheet — click a cell, type, tab/click away to save — rather
// than the calendar's click-a-day-to-open-a-dialog flow. Coaches who
// already build their microcycle in Excel/Numbers are used to this
// exact interaction (fast, all cells visible at once, no dialogs),
// which the calendar view (built for browsing a month visually) never
// really replicated.
export function MicrocycleGrid({
  teamId, month, days, trainings, matches, onTrainingSaved,
}: {
  teamId: number;
  month: Date;
  days: Date[];
  trainings: Training[];
  matches: Match[];
  onTrainingSaved: (date: string, focus: string, intensity: string | null, durationMinutes: number | null) => void;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const createTraining = useCreateTraining(teamId);
  const updateTraining = useUpdateTraining(teamId);

  const monthDays = days.filter((d) => isSameMonth(d, month));

  // Smart default only — same "distance to nearest match" logic the
  // print view already uses. Never overwrites a value the coach
  // actually typed in (training.mdLabel, once saved, always wins) —
  // this only fills the placeholder shown when that field is empty,
  // so a normal week auto-labels itself and an unusual one (bye week,
  // early friendly that doesn't count, MD-4 during a real gap between
  // matches, ...) is still just a click away to override.
  const autoMdFor = React.useCallback(
    (d: Date): string => {
      const matchDates = matches.map((m) => new Date(m.date + 'T00:00:00'));
      if (matchDates.length === 0) return '';
      const nearest = matchDates.reduce((best, cur) =>
        Math.abs(differenceInCalendarDays(cur, d)) < Math.abs(differenceInCalendarDays(best, d)) ? cur : best
      );
      const diff = differenceInCalendarDays(d, nearest);
      return diff === 0 ? 'MD' : diff < 0 ? `MD${diff}` : `MD+${diff}`;
    },
    [matches],
  );

  const onError = () => toast({ title: t('common.saveFailed'), variant: 'destructive' });

  // Finds the existing training for a date, or creates a bare one
  // (rest_day placeholder) to attach the edited field to — so editing
  // just the MD cell on an otherwise-empty day doesn't require first
  // deciding on a session type.
  const withTrainingFor = (
    date: string,
    patch: Partial<Pick<Training, 'focus' | 'intensity' | 'durationMinutes' | 'mdLabel' | 'notes'>>,
  ) => {
    const existing = trainings.find((tr) => tr.date === date);
    const resultFocus = patch.focus ?? existing?.focus ?? 'rest_day';
    const resultIntensity = 'intensity' in patch ? (patch.intensity ?? null) : (existing?.intensity ?? null);
    const resultDuration = 'durationMinutes' in patch ? (patch.durationMinutes ?? null) : (existing?.durationMinutes ?? null);
    const onSuccess = () => onTrainingSaved(date, resultFocus, resultIntensity, resultDuration);
    if (existing) {
      updateTraining.mutate({ id: existing.id, ...patch }, { onError, onSuccess });
      return;
    }
    createTraining.mutate(
      {
        date,
        focus: resultFocus,
        ...(patch.intensity !== undefined && patch.intensity !== null && { intensity: patch.intensity }),
        ...(patch.durationMinutes !== undefined && patch.durationMinutes !== null && { durationMinutes: patch.durationMinutes }),
        ...(patch.mdLabel !== undefined && patch.mdLabel !== null && { mdLabel: patch.mdLabel }),
        ...(patch.notes !== undefined && patch.notes !== null && { notes: patch.notes }),
      },
      { onError, onSuccess },
    );
  };

  const cellInputClass = 'w-full bg-transparent text-xs px-1.5 py-1 rounded focus:bg-card focus:outline-none focus:ring-1 focus:ring-primary';

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs border-collapse min-w-[46rem]">
        <thead>
          <tr className="bg-muted/40 border-b border-border">
            <th className="text-start px-2 py-2 font-semibold w-20">{t('cal.printDate')}</th>
            <th className="text-start px-2 py-2 font-semibold w-24">{t('cal.printDay')}</th>
            <th className="text-start px-2 py-2 font-semibold w-20">MD</th>
            <th className="text-start px-2 py-2 font-semibold w-40">{t('cal.printSession')}</th>
            <th className="text-start px-2 py-2 font-semibold w-24">{t('cal.printDuration')}</th>
            <th className="text-start px-2 py-2 font-semibold w-32">{t('cal.printIntensity')}</th>
            <th className="text-start px-2 py-2 font-semibold">{t('cal.printNotes')}</th>
          </tr>
        </thead>
        <tbody>
          {monthDays.map((d) => {
            const key = format(d, 'yyyy-MM-dd');
            const training = trainings.find((tr) => tr.date === key);
            const match = matches.find((m) => m.date === key);

            return (
              <tr key={key} className="border-b border-border/60 hover:bg-muted/20">
                <td className="px-2 py-1 whitespace-nowrap text-muted-foreground" dir="ltr">{format(d, 'dd/MM')}</td>
                <td className="px-2 py-1 text-muted-foreground">{format(d, 'EEEE')}</td>
                <td className="px-1 py-1" dir="ltr">
                  <input
                    className={`${cellInputClass} font-mono`}
                    defaultValue={training?.mdLabel ?? autoMdFor(d)}
                    placeholder="MD-3"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v === (training?.mdLabel ?? '')) return;
                      withTrainingFor(key, { mdLabel: v || null });
                    }}
                  />
                </td>
                <td className="px-1 py-1">
                  {match ? (
                    <span className="px-1.5 py-1 text-primary font-medium block truncate">
                      {t('cal.printMatch')} — {match.opponent}
                    </span>
                  ) : (
                    // Free text rather than a fixed <select> — a training's
                    // focus can combine several preset keys plus custom
                    // text at once (set from the calendar's own day
                    // dialog), which a strict single-value dropdown can't
                    // represent and would silently show blank/reset for.
                    <input
                      className={cellInputClass}
                      list="grid-focus-options"
                      defaultValue={training?.focus ?? 'rest_day'}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v === (training?.focus ?? 'rest_day')) return;
                        withTrainingFor(key, { focus: v || 'rest_day' });
                      }}
                    />
                  )}
                </td>
                <td className="px-1 py-1">
                  {!match && (
                    <input
                      type="number" min="0" max="600"
                      className={cellInputClass}
                      defaultValue={training?.durationMinutes ?? ''}
                      placeholder="—"
                      onBlur={(e) => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        if (v === (training?.durationMinutes ?? null)) return;
                        withTrainingFor(key, { durationMinutes: v });
                      }}
                    />
                  )}
                </td>
                <td className="px-1 py-1">
                  {!match && (
                    <select
                      className={cellInputClass}
                      value={training?.intensity ?? ''}
                      onChange={(e) => withTrainingFor(key, { intensity: e.target.value || null })}
                    >
                      <option value="">—</option>
                      {INTENSITIES.map((k) => (
                        <option key={k} value={k}>{t(`train.intensity.${k}`)}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-1 py-1">
                  <input
                    className={cellInputClass}
                    defaultValue={training?.notes ?? ''}
                    placeholder="—"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v === (training?.notes ?? '')) return;
                      withTrainingFor(key, { notes: v || null });
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <datalist id="grid-focus-options">
        <option value="rest_day">{t('cal.rest')}</option>
        {FOCUS_KEYS.map((k) => (
          <option key={k} value={k}>{t(`train.focus.${k}`)}</option>
        ))}
      </datalist>
    </div>
  );
}
