import React from 'react';
import { AppLayout } from '@/components/layout';
import { ProPage } from '@/lib/feature-gate';
import { useLanguage } from '@/lib/i18n';
import { useTeam } from '@/lib/team-context';
import {
  useExerciseLibrary, useCreateLibraryExercise, useUpdateLibraryExercise, useDeleteLibraryExercise,
  type LibraryExercise,
} from '@/lib/dev-api';
import { compressImageFile } from '@/lib/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { BookOpen, Plus, Search, ImagePlus, Trash2, Pencil } from 'lucide-react';

const CATEGORIES = ['warm_up', 'possession', 'finishing', 'defending', 'set_piece', 'conditioning', 'small_sided_game', 'cool_down', 'other'] as const;

const EMPTY_FORM = {
  title: '', category: 'other' as string, objectiveOffense: '', objectiveDefense: '',
  space: '', playersFormat: '', minutes: '', explanation: '', image: null as string | null,
};

function ExerciseEditor({
  teamId, exercise, onClose,
}: {
  teamId: number; exercise: LibraryExercise | null; onClose: () => void;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const create = useCreateLibraryExercise(teamId);
  const update = useUpdateLibraryExercise(teamId);
  const [form, setForm] = React.useState(EMPTY_FORM);

  React.useEffect(() => {
    if (exercise) {
      setForm({
        title: exercise.title, category: exercise.category,
        objectiveOffense: exercise.objectiveOffense ?? '', objectiveDefense: exercise.objectiveDefense ?? '',
        space: exercise.space ?? '', playersFormat: exercise.playersFormat ?? '',
        minutes: exercise.minutes != null ? String(exercise.minutes) : '',
        explanation: exercise.explanation ?? '', image: exercise.image,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [exercise]);

  const handleImage = async (file: File) => {
    try {
      setForm((f) => ({ ...f, image: null }));
      const compressed = await compressImageFile(file, 700);
      setForm((f) => ({ ...f, image: compressed }));
    } catch {
      toast({ title: t('common.saveFailed'), variant: 'destructive' as any });
    }
  };

  const handleSave = () => {
    if (!form.title.trim()) return;
    const payload = {
      title: form.title.trim(),
      category: form.category,
      objectiveOffense: form.objectiveOffense.trim() || null,
      objectiveDefense: form.objectiveDefense.trim() || null,
      space: form.space.trim() || null,
      playersFormat: form.playersFormat.trim() || null,
      minutes: form.minutes ? Number(form.minutes) : null,
      explanation: form.explanation.trim() || null,
      image: form.image,
    };
    const onSuccess = () => { toast({ title: t('tactics.saved') }); onClose(); };
    const onError = () => toast({ title: t('common.saveFailed'), variant: 'destructive' as any });
    if (exercise) update.mutate({ id: exercise.id, ...payload }, { onSuccess, onError });
    else create.mutate(payload, { onSuccess, onError });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{exercise ? t('library.editExercise') : t('library.addExercise')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('sessionPlan.blockTitle')}</Label>
            <Input placeholder={t('library.titlePh')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('library.category')}</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`library.category.${c}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="sm:w-40 shrink-0">
              {form.image ? (
                <div className="relative">
                  <img src={form.image} alt="" className="w-full aspect-video object-cover rounded-lg border border-border/60" />
                  <button type="button" className="absolute top-1 end-1 bg-black/60 text-white rounded-md p-1" onClick={() => setForm({ ...form, image: null })}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-1 aspect-video rounded-lg border border-dashed border-border/60 text-muted-foreground cursor-pointer hover:bg-white/[0.03] text-xs">
                  <ImagePlus className="w-5 h-5" />
                  {t('sessionPlan.uploadImage')}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImage(f); e.target.value = ''; }} />
                </label>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">{t('sessionPlan.space')}</Label>
                  <Input className="h-8 text-xs" dir="ltr" placeholder={t('sessionPlan.spacePh')} value={form.space} onChange={(e) => setForm({ ...form, space: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">{t('sessionPlan.playersFormat')}</Label>
                  <Input className="h-8 text-xs" dir="ltr" placeholder={t('sessionPlan.playersFormatPh')} value={form.playersFormat} onChange={(e) => setForm({ ...form, playersFormat: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">{t('sessionPlan.minutes')}</Label>
                  <Input className="h-8 text-xs" type="number" min="0" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">{t('sessionPlan.mainObjective')} · {t('sessionPlan.offense')}</Label>
                  <Input className="h-8 text-xs" value={form.objectiveOffense} onChange={(e) => setForm({ ...form, objectiveOffense: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">{t('sessionPlan.mainObjective')} · {t('sessionPlan.defense')}</Label>
                  <Input className="h-8 text-xs" value={form.objectiveDefense} onChange={(e) => setForm({ ...form, objectiveDefense: e.target.value })} />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t('sessionPlan.explanation')}</Label>
            <Textarea rows={3} placeholder={t('sessionPlan.explanationPh')} value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={!form.title.trim() || create.isPending || update.isPending}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExerciseLibraryPage() {
  const { t } = useLanguage();
  const { activeTeamId } = useTeam();
  const tid = activeTeamId ?? 0;
  const { toast } = useToast();
  const { data: exercises } = useExerciseLibrary(tid);
  const deleteExercise = useDeleteLibraryExercise(tid);

  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const [editing, setEditing] = React.useState<LibraryExercise | null>(null);
  const [creating, setCreating] = React.useState(false);

  const filtered = (exercises ?? []).filter((ex) => {
    const matchesCategory = category === 'all' || ex.category === category;
    const matchesSearch = !search.trim() || ex.title.toLowerCase().includes(search.trim().toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <ProPage>
      <AppLayout>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold font-display">{t('library.title')}</h1>
              <p className="text-xs text-muted-foreground">{t('library.subtitle')}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
              <Input className="ps-9" placeholder={t('library.searchPh')} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('library.allCategories')}</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`library.category.${c}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button className="gap-1.5 shrink-0" onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4" /> {t('library.addExercise')}
            </Button>
          </div>

          {(exercises ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">{t('library.empty')}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">{t('library.noResults')}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((ex) => (
                <div key={ex.id} className="bg-card border rounded-xl overflow-hidden group">
                  {ex.image ? (
                    <img src={ex.image} alt="" className="w-full aspect-video object-cover" />
                  ) : (
                    <div className="w-full aspect-video bg-white/[0.03] flex items-center justify-center">
                      <BookOpen className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm truncate">{ex.title}</span>
                      {ex.minutes && <span className="text-xs text-muted-foreground shrink-0" dir="ltr">{ex.minutes}′</span>}
                    </div>
                    <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                      {t(`library.category.${ex.category}`)}
                    </span>
                    <div className="flex items-center gap-1.5 pt-1">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 flex-1" onClick={() => setEditing(ex)}>
                        <Pencil className="w-3 h-3" /> {t('common.edit')}
                      </Button>
                      <Button
                        size="sm" variant="outline" className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => deleteExercise.mutate(ex.id, { onSuccess: () => toast({ title: t('common.delete') }) })}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {(creating || editing) && (
          <ExerciseEditor teamId={tid} exercise={editing} onClose={() => { setCreating(false); setEditing(null); }} />
        )}
      </AppLayout>
    </ProPage>
  );
}

export default ExerciseLibraryPage;
