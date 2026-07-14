import { format, subDays, startOfWeek, addDays } from 'date-fns';
import type { RpeEntry } from './dev-api';

// Session-RPE training-load math, following Foster's method exactly as
// published (Session-RPE Method for Training Load Monitoring, 2001) and
// as commonly implemented by club load-monitoring platforms:
//   Session Load  = duration (min) x RPE (0-10 CR-10 scale)
//   Daily Load    = sum of session loads that day
//   Weekly Load   = sum of the 7 daily loads in the week
//   Monotony      = mean(daily loads over 7 days) / stddev(daily loads)
//   Strain        = Weekly Load x Monotony
// Monotony/Strain are undefined when there's no variation in daily load
// (stddev = 0). If every day had load > 0 with zero variation, that is
// itself the maximum-risk case Monotony exists to flag, so we return a
// large sentinel value rather than NaN/Infinity.
const MONOTONY_SENTINEL_MAX = 99;

export function sessionLoad(entry: Pick<RpeEntry, 'durationMinutes' | 'rpe'>): number {
  return entry.durationMinutes * entry.rpe;
}

export function dailyLoadsMap(entries: RpeEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.date, (map.get(e.date) ?? 0) + sessionLoad(e));
  }
  return map;
}

// Returns the 7 daily load values (oldest -> newest) for the ISO week
// (Mon-Sun) containing `refDate`, using 0 for days with no entries.
export function weekDailyLoads(dailyLoads: Map<string, number>, refDate: Date): number[] {
  const monday = startOfWeek(refDate, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => dailyLoads.get(format(addDays(monday, i), 'yyyy-MM-dd')) ?? 0);
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function mean(values: number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

export function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

export function monotony(weekLoads: number[]): number {
  const sd = stddev(weekLoads);
  const m = mean(weekLoads);
  if (sd === 0) return m > 0 ? MONOTONY_SENTINEL_MAX : 0;
  return m / sd;
}

export function strain(weeklyLoad: number, monotonyValue: number): number {
  return weeklyLoad * monotonyValue;
}

// Rolling N-day load ending on (and including) refDate.
export function rollingLoad(dailyLoads: Map<string, number>, refDate: Date, days: number): number {
  let total = 0;
  for (let i = 0; i < days; i++) {
    total += dailyLoads.get(format(subDays(refDate, i), 'yyyy-MM-dd')) ?? 0;
  }
  return total;
}

export interface LoadAlert {
  key: string;
  severity: 'moderate' | 'high';
}

export interface LoadSnapshot {
  dailyLoad: number;
  weeklyLoad: number;
  prevWeeklyLoad: number;
  twoWeekLoad: number;
  monotony: number;
  strain: number;
  alerts: LoadAlert[];
  status: 'low' | 'moderate' | 'high' | 'very_high';
}

// Threshold constants — commonly-cited practical guidelines from the
// session-RPE / Foster-Gabbett literature. They're heuristics, not fixed
// biological laws, so they're kept in one place in case a team wants to
// tune them per age group later.
export const THRESHOLDS = {
  weeklyLoad: 1750,
  twoWeekLoad: 4000,
  weekOverWeekSpike: 1250,
  monotony: 2.0,
  strain: 4000,
};

export function computeSnapshot(entries: RpeEntry[], refDate: Date): LoadSnapshot {
  const dailyLoads = dailyLoadsMap(entries);
  const today = format(refDate, 'yyyy-MM-dd');
  const dailyLoad = dailyLoads.get(today) ?? 0;

  const thisWeek = weekDailyLoads(dailyLoads, refDate);
  const lastWeek = weekDailyLoads(dailyLoads, subDays(refDate, 7));
  const weeklyLoad = sum(thisWeek);
  const prevWeeklyLoad = sum(lastWeek);
  const twoWeekLoad = rollingLoad(dailyLoads, refDate, 14);
  const monotonyValue = monotony(thisWeek);
  const strainValue = strain(weeklyLoad, monotonyValue);

  const alerts: LoadAlert[] = [];
  if (weeklyLoad > THRESHOLDS.weeklyLoad) alerts.push({ key: 'weeklyLoad', severity: 'high' });
  if (twoWeekLoad > THRESHOLDS.twoWeekLoad) alerts.push({ key: 'twoWeekLoad', severity: 'high' });
  if (weeklyLoad - prevWeeklyLoad > THRESHOLDS.weekOverWeekSpike) alerts.push({ key: 'spike', severity: 'high' });
  if (monotonyValue > THRESHOLDS.monotony) alerts.push({ key: 'monotony', severity: 'moderate' });
  if (strainValue > THRESHOLDS.strain) alerts.push({ key: 'strain', severity: 'high' });

  const highCount = alerts.filter((a) => a.severity === 'high').length;
  const total = alerts.length;
  let status: LoadSnapshot['status'] = 'low';
  if (total >= 3 || highCount >= 2) status = 'very_high';
  else if (total >= 2 || highCount >= 1) status = 'high';
  else if (total >= 1) status = 'moderate';

  return { dailyLoad, weeklyLoad, prevWeeklyLoad, twoWeekLoad, monotony: monotonyValue, strain: strainValue, alerts, status };
}

// Weekly load series for the last N weeks (for the bar chart), oldest first.
export function weeklyLoadSeries(entries: RpeEntry[], refDate: Date, weeks: number) {
  const dailyLoads = dailyLoadsMap(entries);
  const out: { weekStart: string; load: number }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const weekRef = subDays(refDate, w * 7);
    const monday = startOfWeek(weekRef, { weekStartsOn: 1 });
    const loads = weekDailyLoads(dailyLoads, weekRef);
    out.push({ weekStart: format(monday, 'yyyy-MM-dd'), load: sum(loads) });
  }
  return out;
}

export const STATUS_COLORS: Record<LoadSnapshot['status'], string> = {
  low: '#5DBB7E',
  moderate: '#E8B64C',
  high: '#E08A3E',
  very_high: '#D96B5B',
};
