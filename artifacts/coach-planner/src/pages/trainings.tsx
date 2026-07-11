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

const FOCUS_KEYS = ['warmup', 'tactics', 'fitness', 'finishing', 'possession', 'setpieces', 'recovery'] as const;

export default function Trainings() {
  const { t } = useLanguage();
  const { activeTeamId } = useTeam();
  if (!activeTeamId) return <NoTeamState />;
  return <Inner teamId={activeTeamId} t={t} />;
}

function Inner({ teamId, t }: { teamId: number; t: (k: string) => string }) {
  const { data: trainings, isLoading } = useTrainings(teamId);
  const create = useCreateTraining(teamId);
  const del = useDeleteTraining(teamId);
  const [form, setForm] = useState<{ date: string; time: string; focus: string; drills: string; notes: string } | null>(null);

  const save = () => {
    if (!form?.date || !form.focus) {
      toast({ variant: 'destructive', title: t('train.required') });
      return;
    }
    create.mutate(form, { onSuccess: () => { toast({ title: t('tactics.saved') }); setForm(null); } });
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold font-display">{t('nav.trainings')}</h1>
        </div>

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
              </SelectContent>
            </Select>
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
          <Button onClick={() => setForm({ date: '', time: '', focus: '', drills: '', notes: '' })}>
            <Plus className="w-4 h-4 me-1" />{t('train.new')}
          </Button>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
        {!isLoading && (trainings ?? []).length === 0 && !form && (
          <p className="text-sm text-muted-foreground">{t('train.empty')}</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(trainings ?? []).map((tr) => (
            <div key={tr.id} className="border border-border rounded-lg p-3 bg-card space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{tr.date}{tr.time ? ` · ${tr.time}` : ''}</span>
                <Button size="icon" variant="ghost" onClick={() => del.mutate(tr.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
              <span className="pill-beige rounded px-2 py-0.5 text-xs">{t(`train.focus.${tr.focus}`)}</span>
              {tr.drills && <p className="text-xs whitespace-pre-wrap">{tr.drills}</p>}
              {tr.notes && <p className="text-xs text-muted-foreground">{tr.notes}</p>}
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
