import React from 'react';
import { useRoute, Link } from 'wouter';
import { AppLayout } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
import { useTeam } from '@/lib/team-context';
import {
  useTrainings, useUpdateTraining, useTrainingBlocks, useSaveTrainingBlocks,
  type TrainingBlock,
} from '@/lib/dev-api';
import { focusLabel } from '@/pages/trainings';
import { compressImageFile } from '@/lib/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowRight, ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, ImagePlus, Printer, Save,
} from 'lucide-react';

// A full printable session-plan sheet for one training: header metadata
// (place, headcount, objectives, meso/microcycle labels) plus an ordered
// list of exercise blocks, each with its own diagram, space, format,
// duration, and explanation — mirroring the paper templates coaches
// already use, but editable and shareable from the app.
export function TrainingPlanPage() {
  const [, params] = useRoute('/training-plan/:trainingId');
  const trainingId = params?.trainingId ? Number(params.trainingId) : null;
  const { t, isRtl } = useLanguage();
  const { activeTeamId } = useTeam();
  const tid = activeTeamId ?? 0;
  const { toast } = useToast();

  const { data: trainings } = useTrainings(tid);
  const training = React.useMemo(() => (trainings ?? []).find((tr) => tr.id === trainingId), [trainings, trainingId]);
  const updateTraining = useUpdateTraining(tid);
  const { data: savedBlocks } = useTrainingBlocks(tid, trainingId);
  const saveBlocks = useSaveTrainingBlocks(tid, trainingId);

  const [header, setHeader] = React.useState({
    place: '', playersTotal: '', playersUnavailable: '', material: '',
    mainObjectiveOffense: '', mainObjectiveDefense: '', complementaryObjective: '',
    mesocycleLabel: '', microcycleLabel: '', planNumber: '',
  });
  React.useEffect(() => {
    if (!training) return;
    setHeader({
      place: training.place ?? '',
      playersTotal: training.playersTotal != null ? String(training.playersTotal) : '',
      playersUnavailable: training.playersUnavailable != null ? String(training.playersUnavailable) : '',
      material: training.material ?? '',
      mainObjectiveOffense: training.mainObjectiveOffense ?? '',
      mainObjectiveDefense: training.mainObjectiveDefense ?? '',
      complementaryObjective: training.complementaryObjective ?? '',
      mesocycleLabel: training.mesocycleLabel ?? '',
      microcycleLabel: training.microcycleLabel ?? '',
      planNumber: training.planNumber ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [training?.id]);

  const [blocks, setBlocks] = React.useState<TrainingBlock[]>([]);
  const [loadedOnce, setLoadedOnce] = React.useState(false);
  React.useEffect(() => {
    if (savedBlocks && !loadedOnce) {
      setBlocks(savedBlocks);
      setLoadedOnce(true);
    }
  }, [savedBlocks, loadedOnce]);

  const [dirty, setDirty] = React.useState(false);
  const markDirty = () => setDirty(true);

  const updateBlock = (i: number, patch: Partial<TrainingBlock>) => {
    setBlocks((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
    markDirty();
  };
  const addBlock = () => {
    setBlocks((prev) => [
      ...prev,
      { title: '', objectiveOffense: null, objectiveDefense: null, space: null, playersFormat: null, minutes: null, explanation: null, image: null },
    ]);
    markDirty();
  };
  const removeBlock = (i: number) => {
    setBlocks((prev) => prev.filter((_, idx) => idx !== i));
    markDirty();
  };
  const moveBlock = (i: number, dir: -1 | 1) => {
    setBlocks((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    markDirty();
  };

  const cumulative = React.useMemo(() => {
    let sum = 0;
    return blocks.map((b) => {
      sum += b.minutes ?? 0;
      return sum;
    });
  }, [blocks]);
  const totalMinutes = cumulative.length ? cumulative[cumulative.length - 1] : 0;

  const handleImageUpload = async (i: number, file: File) => {
    try {
      const compressed = await compressImageFile(file, 700);
      updateBlock(i, { image: compressed });
    } catch {
      toast({ title: t('common.saveFailed'), variant: 'destructive' as any });
    }
  };

  const handleSaveAll = () => {
    if (!trainingId) return;
    updateTraining.mutate(
      {
        id: trainingId,
        place: header.place.trim() || null,
        playersTotal: header.playersTotal ? Number(header.playersTotal) : null,
        playersUnavailable: header.playersUnavailable ? Number(header.playersUnavailable) : null,
        material: header.material.trim() || null,
        mainObjectiveOffense: header.mainObjectiveOffense.trim() || null,
        mainObjectiveDefense: header.mainObjectiveDefense.trim() || null,
        complementaryObjective: header.complementaryObjective.trim() || null,
        mesocycleLabel: header.mesocycleLabel.trim() || null,
        microcycleLabel: header.microcycleLabel.trim() || null,
        planNumber: header.planNumber.trim() || null,
      },
      {
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' as any }),
        onSuccess: () => {
          saveBlocks.mutate(blocks, {
            onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' as any }),
            onSuccess: () => {
              toast({ title: t('tactics.saved') });
              setDirty(false);
            },
          });
        },
      },
    );
  };

  if (!training) {
    return (
      <AppLayout>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </AppLayout>
    );
  }

  const BackIcon = isRtl ? ArrowRight : ArrowLeft;

  return (
    <AppLayout>
      <div className="space-y-6 print:hidden">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/trainings">
              <button type="button" className="p-2 rounded-lg hover:bg-white/[0.06] text-muted-foreground shrink-0">
                <BackIcon className="w-5 h-5" />
              </button>
            </Link>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold truncate">{t('sessionPlan.title')}</h2>
              <p className="text-xs text-muted-foreground" dir="ltr">{training.date} · {focusLabel(t, training.focus)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="w-4 h-4" /> {t('sessionPlan.print')}
            </Button>
            <Button size="sm" className="gap-1.5" disabled={updateTraining.isPending || saveBlocks.isPending} onClick={handleSaveAll}>
              <Save className="w-4 h-4" /> {t('common.save')}
            </Button>
          </div>
        </div>
        {dirty && <p className="text-xs text-amber-400">{t('sessionPlan.unsaved')}</p>}

        <div className="bg-card border rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-bold">{t('sessionPlan.sessionInfo')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('sessionPlan.mesocycle')}</Label>
              <Input value={header.mesocycleLabel} onChange={(e) => { setHeader({ ...header, mesocycleLabel: e.target.value }); markDirty(); }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('sessionPlan.microcycle')}</Label>
              <Input value={header.microcycleLabel} onChange={(e) => { setHeader({ ...header, microcycleLabel: e.target.value }); markDirty(); }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('sessionPlan.planNumber')}</Label>
              <Input value={header.planNumber} onChange={(e) => { setHeader({ ...header, planNumber: e.target.value }); markDirty(); }} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('sessionPlan.place')}</Label>
              <Input placeholder={t('sessionPlan.placePh')} value={header.place} onChange={(e) => { setHeader({ ...header, place: e.target.value }); markDirty(); }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('sessionPlan.material')}</Label>
              <Input placeholder={t('sessionPlan.materialPh')} value={header.material} onChange={(e) => { setHeader({ ...header, material: e.target.value }); markDirty(); }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('sessionPlan.playersTotal')}</Label>
              <Input type="number" min="0" value={header.playersTotal} onChange={(e) => { setHeader({ ...header, playersTotal: e.target.value }); markDirty(); }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('sessionPlan.playersUnavailable')}</Label>
              <Input type="number" min="0" value={header.playersUnavailable} onChange={(e) => { setHeader({ ...header, playersUnavailable: e.target.value }); markDirty(); }} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('sessionPlan.mainObjective')} — {t('sessionPlan.offense')}</Label>
            <Textarea rows={2} value={header.mainObjectiveOffense} onChange={(e) => { setHeader({ ...header, mainObjectiveOffense: e.target.value }); markDirty(); }} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('sessionPlan.mainObjective')} — {t('sessionPlan.defense')}</Label>
            <Textarea rows={2} value={header.mainObjectiveDefense} onChange={(e) => { setHeader({ ...header, mainObjectiveDefense: e.target.value }); markDirty(); }} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('sessionPlan.complementaryObjective')}</Label>
            <Textarea rows={2} value={header.complementaryObjective} onChange={(e) => { setHeader({ ...header, complementaryObjective: e.target.value }); markDirty(); }} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">{t('sessionPlan.exercises')} {blocks.length > 0 && `(${blocks.length})`}</h3>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={addBlock}>
              <Plus className="w-4 h-4" /> {t('sessionPlan.addBlock')}
            </Button>
          </div>

          {blocks.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">{t('sessionPlan.noBlocks')}</p>
          )}

          {blocks.map((b, i) => (
            <div key={i} className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-1 pt-1 shrink-0">
                  <button type="button" disabled={i === 0} className="text-muted-foreground disabled:opacity-25 hover:text-primary" onClick={() => moveBlock(i, -1)}>
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button type="button" disabled={i === blocks.length - 1} className="text-muted-foreground disabled:opacity-25 hover:text-primary" onClick={() => moveBlock(i, 1)}>
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Label className="text-xs">{t('sessionPlan.blockTitle')}</Label>
                  <Input placeholder={t('sessionPlan.blockTitlePh')} value={b.title} onChange={(e) => updateBlock(i, { title: e.target.value })} />
                </div>
                <span className="text-xs font-mono text-muted-foreground shrink-0 pt-6" dir="ltr">
                  {t('sessionPlan.cumulative')}: {cumulative[i]}′
                </span>
                <button type="button" className="text-muted-foreground hover:text-destructive shrink-0 pt-6" onClick={() => removeBlock(i)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="sm:w-40 shrink-0">
                  {b.image ? (
                    <div className="relative">
                      <img src={b.image} alt="" className="w-full aspect-video object-cover rounded-lg border border-border/60" />
                      <button
                        type="button"
                        className="absolute top-1 end-1 bg-black/60 text-white rounded-md p-1"
                        onClick={() => updateBlock(i, { image: null })}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-1 aspect-video rounded-lg border border-dashed border-border/60 text-muted-foreground cursor-pointer hover:bg-white/[0.03] text-xs">
                      <ImagePlus className="w-5 h-5" />
                      {t('sessionPlan.uploadImage')}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(i, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">{t('sessionPlan.space')}</Label>
                      <Input className="h-8 text-xs" placeholder={t('sessionPlan.spacePh')} dir="ltr" value={b.space ?? ''} onChange={(e) => updateBlock(i, { space: e.target.value || null })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">{t('sessionPlan.playersFormat')}</Label>
                      <Input className="h-8 text-xs" placeholder={t('sessionPlan.playersFormatPh')} dir="ltr" value={b.playersFormat ?? ''} onChange={(e) => updateBlock(i, { playersFormat: e.target.value || null })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">{t('sessionPlan.minutes')}</Label>
                      <Input className="h-8 text-xs" type="number" min="0" value={b.minutes ?? ''} onChange={(e) => updateBlock(i, { minutes: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">{t('sessionPlan.mainObjective')} · {t('sessionPlan.offense')}</Label>
                      <Input className="h-8 text-xs" value={b.objectiveOffense ?? ''} onChange={(e) => updateBlock(i, { objectiveOffense: e.target.value || null })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">{t('sessionPlan.mainObjective')} · {t('sessionPlan.defense')}</Label>
                      <Input className="h-8 text-xs" value={b.objectiveDefense ?? ''} onChange={(e) => updateBlock(i, { objectiveDefense: e.target.value || null })} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">{t('sessionPlan.explanation')}</Label>
                    <Textarea rows={2} className="text-xs" placeholder={t('sessionPlan.explanationPh')} value={b.explanation ?? ''} onChange={(e) => updateBlock(i, { explanation: e.target.value || null })} />
                  </div>
                </div>
              </div>
            </div>
          ))}

          {blocks.length > 0 && (
            <div className="flex justify-end">
              <span className="text-sm font-bold" dir="ltr">{t('sessionPlan.totalTime')}: {totalMinutes}′</span>
            </div>
          )}
        </div>
      </div>

      <div className="hidden print:block text-black" style={{ fontFamily: 'sans-serif' }} dir={isRtl ? 'rtl' : 'ltr'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '2px solid #222', paddingBottom: 10, marginBottom: 12 }}>
          <img src="/logo-icon.svg" alt="" style={{ width: 40, height: 40 }} />
          <div>
            <p style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>TactixHub</p>
            <p style={{ fontSize: 12, margin: 0, color: '#555' }} dir="ltr">{training.date} — {focusLabel(t, training.focus)}</p>
          </div>
          <div style={{ marginInlineStart: 'auto', fontSize: 12, textAlign: 'end' }}>
            {header.mesocycleLabel && <p style={{ margin: 0 }}>{t('sessionPlan.mesocycle')}: {header.mesocycleLabel}</p>}
            {header.microcycleLabel && <p style={{ margin: 0 }}>{t('sessionPlan.microcycle')}: {header.microcycleLabel}</p>}
            {header.planNumber && <p style={{ margin: 0 }}>{t('sessionPlan.planNumber')}: {header.planNumber}</p>}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
          <tbody>
            <tr>
              {header.place && <td style={{ border: '1px solid #ccc', padding: 6 }}><b>{t('sessionPlan.place')}:</b> {header.place}</td>}
              {header.playersTotal && <td style={{ border: '1px solid #ccc', padding: 6 }}><b>{t('sessionPlan.playersTotal')}:</b> {header.playersTotal}</td>}
              {header.playersUnavailable && <td style={{ border: '1px solid #ccc', padding: 6 }}><b>{t('sessionPlan.playersUnavailable')}:</b> {header.playersUnavailable}</td>}
            </tr>
            {header.material && (
              <tr><td colSpan={3} style={{ border: '1px solid #ccc', padding: 6 }}><b>{t('sessionPlan.material')}:</b> {header.material}</td></tr>
            )}
            {header.mainObjectiveOffense && (
              <tr><td colSpan={3} style={{ border: '1px solid #ccc', padding: 6 }}><b>{t('sessionPlan.mainObjective')} ({t('sessionPlan.offense')}):</b> {header.mainObjectiveOffense}</td></tr>
            )}
            {header.mainObjectiveDefense && (
              <tr><td colSpan={3} style={{ border: '1px solid #ccc', padding: 6 }}><b>{t('sessionPlan.mainObjective')} ({t('sessionPlan.defense')}):</b> {header.mainObjectiveDefense}</td></tr>
            )}
            {header.complementaryObjective && (
              <tr><td colSpan={3} style={{ border: '1px solid #ccc', padding: 6 }}><b>{t('sessionPlan.complementaryObjective')}:</b> {header.complementaryObjective}</td></tr>
            )}
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#eee' }}>
              <th style={{ border: '1px solid #ccc', padding: 6, width: '18%' }}>—</th>
              <th style={{ border: '1px solid #ccc', padding: 6 }}>{t('sessionPlan.exercises')}</th>
              <th style={{ border: '1px solid #ccc', padding: 6, width: '8%' }}>{t('sessionPlan.minutes')}</th>
              <th style={{ border: '1px solid #ccc', padding: 6, width: '10%' }}>{t('sessionPlan.cumulative')}</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b, i) => (
              <tr key={i} style={{ pageBreakInside: 'avoid' }}>
                <td style={{ border: '1px solid #ccc', padding: 6 }}>
                  {b.image && <img src={b.image} alt="" style={{ width: '100%' }} />}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 6 }}>
                  <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{b.title}</p>
                  {(b.space || b.playersFormat) && (
                    <p style={{ margin: '0 0 4px', fontSize: 10 }} dir="ltr">
                      {b.space && <span>{t('sessionPlan.space')}: {b.space} </span>}
                      {b.playersFormat && <span>· {t('sessionPlan.playersFormat')}: {b.playersFormat}</span>}
                    </p>
                  )}
                  {b.objectiveOffense && <p style={{ margin: '0 0 2px', fontSize: 10 }}><b>{t('sessionPlan.offense')}:</b> {b.objectiveOffense}</p>}
                  {b.objectiveDefense && <p style={{ margin: '0 0 2px', fontSize: 10 }}><b>{t('sessionPlan.defense')}:</b> {b.objectiveDefense}</p>}
                  {b.explanation && <p style={{ margin: 0, fontSize: 10, color: '#333' }}>{b.explanation}</p>}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 6, textAlign: 'center' }} dir="ltr">{b.minutes ?? '—'}′</td>
                <td style={{ border: '1px solid #ccc', padding: 6, textAlign: 'center' }} dir="ltr">{cumulative[i]}′</td>
              </tr>
            ))}
          </tbody>
        </table>
        {blocks.length > 0 && (
          <p style={{ textAlign: 'end', fontSize: 12, fontWeight: 700, marginTop: 8 }} dir="ltr">
            {t('sessionPlan.totalTime')}: {totalMinutes}′
          </p>
        )}
      </div>
    </AppLayout>
  );
}

export default TrainingPlanPage;
