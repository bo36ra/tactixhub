import { format, startOfWeek, addWeeks } from 'date-fns';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import React, { useState } from 'react';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useIsPro } from '@/lib/feature-gate';
import { useLanguage } from '@/lib/i18n';
import { useTeam } from '@/lib/team-context';
import { useTrainings, useCreateTraining, useDeleteTraining, useExerciseLibrary, type LibraryExercise } from '@/lib/dev-api';
import { Link } from 'wouter';
import { NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Dumbbell, Plus, Trash2, Save, BookOpen } from 'lucide-react';

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

// A training's focus is free text in the database — a coach can select
// several preset focuses for one session (stored comma-joined, e.g.
// "warmup,tactics") plus an optional custom focus of their own; a value
// with no commas is just the single-focus case. Known keys get
// translated and joined with " + "; anything unrecognized (a custom
// focus) is shown as-is.
export function focusLabel(t: (k: string) => string, focus: string): string {
  if (focus === 'rest_day') return `🌙 ${t('cal.kindRest')}`;
  return focus
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => ((FOCUS_KEYS as readonly string[]).includes(f) ? t(`train.focus.${f}`) : f))
    .join(' + ');
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
    const factors: Record<string, number> = { very_light: 1, light: 2, medium: 3, high: 4, very_high: 5 };
    const weeks: { key: string; label: string; load: number; sessions: number }[] = [];
    const thisWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
    for (let i = 5; i >= 0; i--) {
      const start = addWeeks(thisWeek, -i);
      weeks.push({ key: format(start, 'yyyy-MM-dd'), label: format(start, 'dd/MM'), load: 0, sessions: 0 });
    }
    for (const tr of trainings ?? []) {
      if (tr.focus === 'rest_day') continue; // rest days carry no load
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
  const [form, setForm] = useState<{ date: string; time: string; focus: string[]; customFocus: string; intensity: string; duration: string; drills: string; notes: string } | null>(null);
  const isPro = useIsPro();
  const { data: library } = useExerciseLibrary(isPro ? teamId : 0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  const addFromLibrary = (ex: LibraryExercise) => {
    if (!form) return;
    const line = ex.explanation ? `${ex.title}: ${ex.explanation}` : ex.title;
    setForm({ ...form, drills: form.drills ? `${form.drills}\n${line}` : line });
    setPickerOpen(false);
  };

  const save = () => {
    const customTrimmed = form?.customFocus.trim() ?? '';
    const combinedFocus = [...(form?.focus ?? []), ...(customTrimmed ? [customTrimmed] : [])];
    if (!form?.date || combinedFocus.length === 0) {
      toast({ variant: 'destructive', title: t('train.required') });
      return;
    }
    create.mutate(
      {
        date: form.date,
        time: form.time || undefined,
        focus: combinedFocus.join(','),
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
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t('train.focusMultiHint')}</p>
              <div className="flex flex-wrap gap-1.5">
                {FOCUS_KEYS.map((k) => {
                  const active = form.focus.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          focus: active ? form.focus.filter((f) => f !== k) : [...form.focus, k],
                        })
                      }
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border/60 hover:border-primary/50'
                      }`}
                    >
                      {t(`train.focus.${k}`)}
                    </button>
                  );
                })}
              </div>
            </div>
            <Input
              placeholder={t('train.focusCustomPh')}
              value={form.customFocus}
              onChange={(e) => setForm({ ...form, customFocus: e.target.value })}
            />
            <div className="flex gap-2">
              <Select value={form.intensity} onValueChange={(v) => setForm({ ...form, intensity: v })}>
                <SelectTrigger><SelectValue placeholder={t('train.intensity')} /></SelectTrigger>
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
                placeholder={t('train.duration')}
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
              />
            </div>
            {isPro && (
              <Button type="button" size="sm" variant="outline" className="gap-1.5 w-fit" onClick={() => setPickerOpen(true)}>
                <BookOpen className="w-4 h-4" /> {t('library.addFromGallery')}
              </Button>
            )}
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
          <Button onClick={() => setForm({ date: '', time: '', focus: [], customFocus: '', intensity: '', duration: '', drills: '', notes: '' })}>
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
                    tr.intensity === 'very_high' ? 'pill-red' : tr.intensity === 'high' ? 'pill-orange' : tr.intensity === 'medium' ? 'pill-yellow' : tr.intensity === 'light' ? 'pill-green' : 'pill-blue'
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
              <Link href={`/training-plan/${tr.id}`}>
                <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer pt-1">
                  <NotebookPen className="w-3.5 h-3.5" /> {t('sessionPlan.detailedPlan')}
                </span>
              </Link>
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

      {isPro && (
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('library.pickTitle')}</DialogTitle>
            </DialogHeader>
            <Input
              placeholder={t('library.searchPh')}
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
            />
            <div className="space-y-2 pt-1">
              {(library ?? [])
                .filter((ex) => !pickerSearch.trim() || ex.title.toLowerCase().includes(pickerSearch.trim().toLowerCase()))
                .map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    className="w-full flex items-center gap-3 rounded-lg border border-border/60 p-2 text-start hover:bg-white/[0.04]"
                    onClick={() => addFromLibrary(ex)}
                  >
                    {ex.image ? (
                      <img src={ex.image} alt="" className="w-14 h-14 rounded-md object-cover shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-md bg-white/[0.04] flex items-center justify-center shrink-0">
                        <BookOpen className="w-5 h-5 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{ex.title}</p>
                      <p className="text-xs text-muted-foreground">{t(`library.category.${ex.category}`)}{ex.minutes ? ` · ${ex.minutes}′` : ''}</p>
                    </div>
                  </button>
                ))}
              {(library ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">{t('library.empty')}</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
