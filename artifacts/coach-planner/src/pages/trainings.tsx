import { format, startOfWeek, addWeeks } from 'date-fns';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import React, { useState } from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { useTeam } from '@/lib/team-context';
import { useTrainings, useCreateTraining, useDeleteTraining } from '@/lib/dev-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Dumbbell, Plus, Trash2, Save } from 'lucide-react';

export const FOCUS_KEYS = [
  'preparation',
  'warmup',
  'fitness',
  'speed_agility',
  'technical',
  'tactics',
  'attacking',
  'defending',
  'transition',
  'possession',
  'finishing',
  'setpieces',
  'goalkeeping',
  'match_sim',
  'mental',
  'recovery',
] as const;

// A training's focus is free text in the database — most values come
// from the chip grid (known FOCUS_KEYS), but a coach can also type a
// custom focus of their own. Known keys get translated; anything else
// (a custom focus) is shown as-is.
export function focusLabel(t: (k: string) => string, focus: string): string {
  return (FOCUS_KEYS as readonly string[]).includes(focus) ? t(`train.focus.${focus}`) : focus;
}

export default function Trainings() {
  const { t } = useLanguage();
  const { activeTeamId } = useTeam();
  if (!activeTeamId) return <NoTeamState />;
  return <Inner teamId={activeTeamId} t={t} />;
}

function Inner({ teamId, t }: { teamId: number; t: (k: string) => string }) {
  const { data: trainings, isLoading } = useTrainings(teamId);
  // Weekly training load = Σ intensity-factor × minutes, bucketed into
  // the last 6 ISO weeks. Turns the intensity/duration fields into an
  // at-a-glance overload check before injuries happen.
  const weeklyLoad = React.useMemo(() => {
    const factors: Record<string, number> = { light: 1, medium: 2, high: 3 };
    const weeks: { key: string; label: string; load: number; sessions: number }[] = [];
    const thisWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
    for (let i = 5; i >= 0; i--) {
      const start = addWeeks(thisWeek, -i);
      weeks.push({ key: format(start, 'yyyy-MM-dd'), label: format(start, 'dd/MM'), load: 0, sessions: 0 });
    }
    for (const tr of trainings ?? []) {
      const weekKey = format(startOfWeek(new Date(tr.date), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const bucket = weeks.find((w) => w.key === weekKey);
      if (!bucket) continue;
      bucket.sessions += 1;
      bucket.load += (factors[tr.intensity ?? 'medium'] ?? 2) * (tr.durationMinutes ?? 60);
    }
    return weeks;
  }, [trainings]);
  const hasLoad = weeklyLoad.some((w) => w.sessions > 0);

  const create = useCreateTraining(teamId);
  const del = useDeleteTraining(teamId);
  const [form, setForm] = useState<{ date: string; time: string; focus: string; customFocus: string; intensity: string; duration: string; drills: string; notes: string } | null>(null);

  const save = () => {
    if (!form?.date || !form.focus || (form.focus === '__custom__' && !form.customFocus.trim())) {
      toast({ variant: 'destructive', title: t('train.required') });
      return;
    }
    create.mutate(
      {
        date: form.date,
        time: form.time || undefined,
        focus: form.focus === '__custom__' ? form.customFocus.trim() : form.focus,
        intensity: form.intensity || undefined,
        durationMinutes: form.duration ? Number(form.duration) : undefined,
        drills: form.drills || undefined,
        notes: form.notes || undefined,
      },
      { onSuccess: () => { toast({ title: t('tactics.saved') }); setForm(null); } },
    );
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold font-display">{t('nav.trainings')}</h1>
        </div>

        {hasLoad && (
          <div className="bg-card border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-1">{t('train.loadTitle')}</h3>
            <p className="text-[11px] text-muted-foreground mb-3">{t('train.loadHint')}</p>
            <div className="h-40" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyLoad} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.45)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.45)' }} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    contentStyle={{ background: '#221f1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number, _name, item) => [`${value} · ${item?.payload?.sessions} ${t('train.sessions')}`, t('train.loadTitle')]}
                  />
                  <Bar dataKey="load" fill="#e8b64c" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {form ? (
          <div className="space-y-3 max-w-lg">
            <div className="flex gap-2">
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
            <Select value={form.focus} onValueChange={(v) => setForm({ ...form, focus: v })}>
              <SelectTrigger><SelectValue placeholder={t('train.focus')} /></SelectTrigger>
              <SelectContent>
                {FOCUS_KEYS.map((k) => <SelectItem key={k} value={k}>{t(`train.focus.${k}`)}</SelectItem>)}
                <SelectItem value="__custom__">{t('train.focus.custom')}</SelectItem>
              </SelectContent>
            </Select>
            {form.focus === '__custom__' && (
              <Input
                placeholder={t('train.focusCustomPh')}
                value={form.customFocus}
                onChange={(e) => setForm({ ...form, customFocus: e.target.value })}
              />
            )}
            <div className="flex gap-2">
              <Select value={form.intensity} onValueChange={(v) => setForm({ ...form, intensity: v })}>
                <SelectTrigger><SelectValue placeholder={t('train.intensity')} /></SelectTrigger>
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
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
              />
            </div>
            <Textarea rows={3} placeholder={t('train.drills')} value={form.drills}
              onChange={(e) => setForm({ ...form, drills: e.target.value })} />
            <Textarea rows={2} placeholder={t('train.notes')} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <div className="flex gap-2">
              <Button onClick={save} disabled={create.isPending}><Save className="w-4 h-4 me-1" />{t('common.save')}</Button>
              <Button variant="secondary" onClick={() => setForm(null)}>{t('common.cancel')}</Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setForm({ date: '', time: '', focus: '', customFocus: '', intensity: '', duration: '', drills: '', notes: '' })}>
            <Plus className="w-4 h-4 me-1" />{t('train.new')}
          </Button>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
        {!isLoading && (trainings ?? []).length === 0 && !form && (
          <p className="text-sm text-muted-foreground">{t('train.empty')}</p>
        )}
        {(() => {
          const today = format(new Date(), 'yyyy-MM-dd');
          // Upcoming soonest-first so the next session leads; past stays
          // newest-first (server order).
          const upcoming = (trainings ?? []).filter((tr) => tr.date >= today).sort((a, b) => a.date.localeCompare(b.date));
          const past = (trainings ?? []).filter((tr) => tr.date < today);
          const renderCard = (tr: (typeof upcoming)[number]) => (
            <div key={tr.id} className="border border-border rounded-lg p-3 bg-card space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{tr.date}{tr.time ? ` · ${tr.time}` : ''}</span>
                <Button size="icon" variant="ghost" onClick={() => del.mutate(tr.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="pill-beige rounded px-2 py-0.5 text-xs">{focusLabel(t, tr.focus)}</span>
                {tr.intensity && (
                  <span className={`rounded px-2 py-0.5 text-xs ${
                    tr.intensity === 'high' ? 'pill-red' : tr.intensity === 'medium' ? 'pill-yellow' : 'pill-green'
                  }`}>
                    {t(`train.intensity.${tr.intensity}`)}
                  </span>
                )}
                {tr.durationMinutes && (
                  <span className="rounded px-2 py-0.5 text-xs bg-white/[0.06] text-muted-foreground" dir="ltr">
                    {tr.durationMinutes} {t('train.minutes')}
                  </span>
                )}
              </div>
              {tr.drills && <p className="text-xs whitespace-pre-wrap">{tr.drills}</p>}
              {tr.notes && <p className="text-xs text-muted-foreground">{tr.notes}</p>}
            </div>
          );
          return (
            <>
              {upcoming.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">{t('train.upcoming')} ({upcoming.length})</h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{upcoming.map(renderCard)}</div>
                </div>
              )}
              {past.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">{t('train.past')} ({past.length})</h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{past.map(renderCard)}</div>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </AppLayout>
  );
}
