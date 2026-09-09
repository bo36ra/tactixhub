import React, { useEffect, useState } from 'react';
import { PullToRefresh } from '@/components/pull-to-refresh';
import { useRoute, Link } from 'wouter';
import { AppLayout, NoTeamState } from '@/components/layout';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/lib/i18n';
import { playerName } from '@/lib/player-name';
import { JerseyNumber } from '@/components/jersey-number';
import { PITCH_GRADIENT } from '@/lib/chart-theme';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useListPlayers,
  useGetLineup,
  useSaveLineup,
  getListPlayersQueryKey,
  getGetLineupQueryKey,
} from '@workspace/api-client-react';
import { useTeam } from '@/lib/team-context';
import { FORMATIONS, FORMATION_NAMES } from '@/lib/formations';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ArrowLeft, Star, Check, X } from 'lucide-react';

export function Lineup() {
  const { t, isRtl, lang } = useLanguage();
  const { toast } = useToast();
  const { activeTeamId } = useTeam();
  const queryClient = useQueryClient();
  const [, params] = useRoute('/matches/:matchId/lineup');
  const matchId = params?.matchId ? Number(params.matchId) : undefined;

  const [formation, setFormation] = useState('4-3-3');
  // slotIndex -> playerId
  const [assignments, setAssignments] = useState<Record<number, number | undefined>>({});
  const [captainSlot, setCaptainSlot] = useState<number | undefined>(undefined);
  // Named substitutes for this specific match — a curated subset of
  // "everyone not starting" (benchPlayers below), not the same thing.
  // A 20-player squad has plenty who aren't even in the matchday squad
  // at all; this tracks who specifically is on the bench, saved with
  // slotIndex: null (already supported by the schema/backend, just
  // never had UI to set it before this).
  const [substituteIds, setSubstituteIds] = useState<Set<number>>(new Set());
  // Guest players — someone not in the roster at all (e.g. promoted up
  // from a younger age group just for this match, which typically
  // changes every match). Tracked separately since they have no real
  // playerId to key off; slotIndex -> guest for starters, a plain list
  // for guest substitutes.
  const [guestAssignments, setGuestAssignments] = useState<Record<number, { name: string; jerseyNumber: number } | undefined>>({});
  const [guestSubstitutes, setGuestSubstitutes] = useState<{ name: string; jerseyNumber: number }[]>([]);
  const [guestNameInput, setGuestNameInput] = useState('');
  const [guestNumberInput, setGuestNumberInput] = useState('');
  const [addingBenchGuest, setAddingBenchGuest] = useState(false);
  const [addingSlotGuest, setAddingSlotGuest] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  const { data: players, isLoading } = useListPlayers(activeTeamId!, {
    query: { enabled: !!activeTeamId, queryKey: getListPlayersQueryKey(activeTeamId!) },
  });

  const { data: lineup } = useGetLineup(matchId!, {
    query: { enabled: !!matchId, queryKey: getGetLineupQueryKey(matchId!) },
  });

  const saveLineup = useSaveLineup();

  // Hydrate local state once the saved lineup loads
  useEffect(() => {
    if (!lineup) return;
    setFormation(lineup.formation || '4-3-3');
    const next: Record<number, number | undefined> = {};
    const guestNext: Record<number, { name: string; jerseyNumber: number } | undefined> = {};
    let captain: number | undefined;
    const subs = new Set<number>();
    const guestSubs: { name: string; jerseyNumber: number }[] = [];
    lineup.entries.forEach((e) => {
      const isGuest = e.playerId == null;
      if (e.slotIndex !== null && e.slotIndex !== undefined) {
        if (isGuest) guestNext[e.slotIndex] = { name: e.playerName ?? '', jerseyNumber: e.jerseyNumber ?? 0 };
        else next[e.slotIndex] = e.playerId!;
        if (e.isCaptain) captain = e.slotIndex;
      } else if (isGuest) {
        guestSubs.push({ name: e.playerName ?? '', jerseyNumber: e.jerseyNumber ?? 0 });
      } else {
        subs.add(e.playerId!);
      }
    });
    setAssignments(next);
    setGuestAssignments(guestNext);
    setCaptainSlot(captain);
    setSubstituteIds(subs);
    setGuestSubstitutes(guestSubs);
  }, [lineup]);

  if (!activeTeamId) return <NoTeamState />;
  if (!matchId) return <NoTeamState />;

  const slots = FORMATIONS[formation] ?? FORMATIONS['4-3-3'];
  const assignedPlayerIds = new Set(Object.values(assignments).filter(Boolean) as number[]);
  const benchPlayers = (players ?? []).filter((p) => !assignedPlayerIds.has(p.id));

  const playerById = (id?: number) => players?.find((p) => p.id === id);

  const handleAssign = (slotIndex: number, playerId: string) => {
    setAssignments((prev) => ({ ...prev, [slotIndex]: playerId ? Number(playerId) : undefined }));
    setGuestAssignments((prev) => ({ ...prev, [slotIndex]: undefined }));
    if (playerId) {
      setSubstituteIds((prev) => {
        if (!prev.has(Number(playerId))) return prev;
        const next = new Set(prev);
        next.delete(Number(playerId));
        return next;
      });
    }
  };

  const handleAssignGuest = (slotIndex: number, guest: { name: string; jerseyNumber: number }) => {
    setAssignments((prev) => ({ ...prev, [slotIndex]: undefined }));
    setGuestAssignments((prev) => ({ ...prev, [slotIndex]: guest }));
  };

  const handleFormationChange = (next: string) => {
    // Keep the goalkeeper if already assigned; drop outfield assignments
    // that don't map cleanly since slot layouts differ between formations.
    setFormation(next);
    setAssignments((prev) => ({ 0: prev[0] }));
    setGuestAssignments((prev) => ({ 0: prev[0] }));
    setCaptainSlot(undefined);
  };

  const handleSave = () => {
    const startingEntries = Object.entries(assignments)
      .filter(([, playerId]) => !!playerId)
      .map(([slotIndex, playerId]) => ({
        playerId: playerId as number,
        slotIndex: Number(slotIndex),
        isCaptain: Number(slotIndex) === captainSlot,
      }));
    const guestStartingEntries = Object.entries(guestAssignments)
      .filter(([, g]) => !!g)
      .map(([slotIndex, g]) => ({
        guestName: g!.name,
        guestJerseyNumber: g!.jerseyNumber,
        slotIndex: Number(slotIndex),
        isCaptain: Number(slotIndex) === captainSlot,
      }));
    const substituteEntries = Array.from(substituteIds).map((playerId) => ({
      playerId,
      slotIndex: null,
      isCaptain: false,
    }));
    const guestSubstituteEntries = guestSubstitutes.map((g) => ({
      guestName: g.name,
      guestJerseyNumber: g.jerseyNumber,
      slotIndex: null,
      isCaptain: false,
    }));
    const entries = [...startingEntries, ...guestStartingEntries, ...substituteEntries, ...guestSubstituteEntries];

    saveLineup.mutate(
      { matchId, data: { formation, entries } },
      {
        onSuccess: () => {
          setSaved(true);
          queryClient.invalidateQueries({ queryKey: getGetLineupQueryKey(matchId) });
          setTimeout(() => setSaved(false), 2000);
        },
        onError: () => toast({ title: t('common.saveFailed'), variant: 'destructive' }),
      },
    );
  };

  const BackIcon = isRtl ? ArrowRight : ArrowLeft;

  return (
    <AppLayout>
      <PullToRefresh onRefresh={() => queryClient.invalidateQueries()}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <Link href="/matches" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <BackIcon className="w-3.5 h-3.5" />
              {t('lineup.back')}
            </Link>
            <h2 className="text-2xl font-bold">{t('match.lineup')}</h2>
          </div>
          <div className="flex items-center gap-3">
            <Select value={formation} onValueChange={handleFormationChange}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATION_NAMES.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleSave} disabled={saveLineup.isPending} className="gap-2">
              {saved ? <Check className="w-4 h-4" /> : null}
              {saved ? t('lineup.saved') : t('lineup.save')}
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* Pitch */}
          <div
            className="relative w-full rounded-xl overflow-hidden border"
            style={{
              aspectRatio: '3 / 4',
              background: PITCH_GRADIENT,
            }}
          >
            {/* pitch markings */}
            <div className="absolute inset-3 border border-white/30 rounded-sm" />
            <div className="absolute left-1/2 top-1/2 w-full h-px bg-white/30 -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute left-1/2 top-1/2 w-20 h-20 border border-white/30 rounded-full -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute left-1/2 bottom-3 w-1/3 h-[12%] border border-white/30 border-b-0 -translate-x-1/2" />
            <div className="absolute left-1/2 top-3 w-1/3 h-[12%] border border-white/30 border-t-0 -translate-x-1/2" />

            {slots.map((slot) => {
              const player = playerById(assignments[slot.slotIndex]);
              const guest = guestAssignments[slot.slotIndex];
              const isCaptain = captainSlot === slot.slotIndex;
              return (
                <div
                  key={slot.slotIndex}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
                  style={{ left: `${slot.x}%`, top: `${100 - slot.y}%` }}
                >
                  <button
                    onClick={() => { setPickingSlot(slot.slotIndex); setPickerSearch(''); }}
                    className={`w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold border-2 shadow-md transition-transform hover:scale-105 relative overflow-hidden ${
                      player || guest
                        ? 'bg-primary text-primary-foreground border-white'
                        : 'bg-white/15 text-white/70 border-white/40 border-dashed'
                    }`}
                  >
                    {player?.photo ? (
                      <img src={player.photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      guest ? guest.jerseyNumber : (player ? player.jerseyNumber : slot.label)
                    )}
                    {isCaptain && (
                      <Star className="w-3 h-3 absolute -top-1 -right-1 fill-yellow-400 text-yellow-400 z-10" />
                    )}
                  </button>
                  <span className="text-[10px] font-medium text-white bg-black/40 px-1.5 py-0.5 rounded max-w-[72px] truncate">
                    {guest ? guest.name : (player ? playerName(player, lang) : t('lineup.empty'))}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Slot assignment list + bench */}
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold mb-2">{t('lineup.starters')}</p>
              <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                {slots.map((slot) => (
                  <div key={slot.slotIndex} className="flex items-center gap-2">
                    <span className="w-9 text-[11px] font-bold text-muted-foreground shrink-0">{slot.label}</span>
                    {guestAssignments[slot.slotIndex] ? (
                      <div className="flex-1 flex items-center gap-1.5 h-8 px-2 rounded-md border bg-primary/10 text-xs">
                        <span className="flex-1 truncate">
                          #{guestAssignments[slot.slotIndex]!.jerseyNumber} {guestAssignments[slot.slotIndex]!.name} · {t('lineup.guest')}
                        </span>
                        <button type="button" onClick={() => setGuestAssignments((prev) => ({ ...prev, [slot.slotIndex]: undefined }))}>
                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    ) : (
                      <Select
                        value={assignments[slot.slotIndex] ? String(assignments[slot.slotIndex]) : undefined}
                        onValueChange={(v) => handleAssign(slot.slotIndex, v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={t('lineup.selectPlayer')} />
                        </SelectTrigger>
                        <SelectContent>
                          {(players ?? [])
                            .filter((p) => !assignedPlayerIds.has(p.id) || assignments[slot.slotIndex] === p.id)
                            .map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                <JerseyNumber n={p.jerseyNumber} className="" /> {playerName(p, lang)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-1">{t('lineup.bench')} ({substituteIds.size + guestSubstitutes.length})</p>
              <p className="text-xs text-muted-foreground mb-2">{t('lineup.benchHint')}</p>
              <div className="flex flex-wrap gap-1.5">
                {isLoading && [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6 w-16 rounded-full" />)}
                {benchPlayers.map((p) => {
                  const isSub = substituteIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setSubstituteIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          return next;
                        })
                      }
                      className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
                        isSub
                          ? 'bg-primary/15 border-primary text-primary font-semibold'
                          : 'bg-card border-border text-muted-foreground'
                      }`}
                    >
                      <JerseyNumber n={p.jerseyNumber} className="" /> {playerName(p, lang)}
                    </button>
                  );
                })}
                {guestSubstitutes.map((g, i) => (
                  <span key={`guest-${i}`} className="text-xs rounded-full pl-2.5 pr-1 py-1 border bg-primary/15 border-primary text-primary font-semibold flex items-center gap-1">
                    #{g.jerseyNumber} {g.name} · {t('lineup.guest')}
                    <button type="button" onClick={() => setGuestSubstitutes((prev) => prev.filter((_, idx) => idx !== i))}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {!isLoading && benchPlayers.length === 0 && guestSubstitutes.length === 0 && (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
                <button
                  type="button"
                  onClick={() => { setAddingBenchGuest(true); setGuestNameInput(''); setGuestNumberInput(''); }}
                  className="text-xs rounded-full px-2.5 py-1 border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
                >
                  + {t('lineup.addGuest')}
                </button>
              </div>
              {addingBenchGuest && (
                <div className="flex items-center gap-1.5 mt-2 p-2 rounded-lg border bg-muted/30">
                  <Input
                    className="h-8 text-xs w-16"
                    placeholder="#"
                    inputMode="numeric"
                    value={guestNumberInput}
                    onChange={(e) => setGuestNumberInput(e.target.value.replace(/\D/g, ''))}
                  />
                  <Input
                    className="h-8 text-xs flex-1"
                    placeholder={t('lineup.guestNamePlaceholder')}
                    value={guestNameInput}
                    onChange={(e) => setGuestNameInput(e.target.value)}
                    autoFocus
                  />
                  <Button
                    size="sm" className="h-8"
                    disabled={!guestNameInput.trim() || !guestNumberInput}
                    onClick={() => {
                      setGuestSubstitutes((prev) => [...prev, { name: guestNameInput.trim(), jerseyNumber: Number(guestNumberInput) }]);
                      setAddingBenchGuest(false);
                    }}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setAddingBenchGuest(false)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tap-the-circle player picker — the pitch circles previously only
          toggled captain status once a player was already assigned; picking
          or changing who's in a slot required scrolling to the list below.
          This opens from any circle (empty or filled) as a faster, more
          direct alternative — the list below still works exactly as before
          for anyone who prefers it, both stay in sync against the same
          assignments state. */}
      <Sheet open={pickingSlot !== null} onOpenChange={(o) => { if (!o) { setPickingSlot(null); setAddingSlotGuest(false); } }}>
        <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {pickingSlot !== null && (slots.find((s) => s.slotIndex === pickingSlot)?.label ?? '')}
              {' — '}{t('lineup.selectPlayer')}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-2">
            {pickingSlot !== null && playerById(assignments[pickingSlot]) && (() => {
              const current = playerById(assignments[pickingSlot])!;
              const isCurrentCaptain = captainSlot === pickingSlot;
              return (
                <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                  {current.photo ? (
                    <img src={current.photo} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <JerseyNumber n={current.jerseyNumber} className="" />
                  )}
                  <span className="flex-1 truncate text-sm font-medium">{playerName(current, lang)}</span>
                  <Button
                    size="sm" variant={isCurrentCaptain ? 'default' : 'outline'}
                    onClick={() => setCaptainSlot(isCurrentCaptain ? undefined : pickingSlot)}
                  >
                    <Star className={`w-3.5 h-3.5 ${isCurrentCaptain ? 'fill-current' : ''}`} />
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                    onClick={() => { handleAssign(pickingSlot, ''); setPickingSlot(null); }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              );
            })()}

            {pickingSlot !== null && guestAssignments[pickingSlot] && (() => {
              const guest = guestAssignments[pickingSlot]!;
              const isCurrentCaptain = captainSlot === pickingSlot;
              return (
                <div className="flex items-center gap-2 p-2 rounded-lg border bg-primary/10">
                  <JerseyNumber n={guest.jerseyNumber} className="" />
                  <span className="flex-1 truncate text-sm font-medium">{guest.name} · {t('lineup.guest')}</span>
                  <Button
                    size="sm" variant={isCurrentCaptain ? 'default' : 'outline'}
                    onClick={() => setCaptainSlot(isCurrentCaptain ? undefined : pickingSlot)}
                  >
                    <Star className={`w-3.5 h-3.5 ${isCurrentCaptain ? 'fill-current' : ''}`} />
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                    onClick={() => { setGuestAssignments((prev) => ({ ...prev, [pickingSlot]: undefined })); setPickingSlot(null); }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              );
            })()}

            <Input
              autoFocus
              placeholder={t('tactics.searchPlayerPlaceholder')}
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
            />

            <div className="space-y-1">
              {(players ?? [])
                .filter((p) => !assignedPlayerIds.has(p.id) || (pickingSlot !== null && assignments[pickingSlot] === p.id))
                .filter((p) => {
                  const q = pickerSearch.trim().toLowerCase();
                  return !q || playerName(p, lang).toLowerCase().includes(q) || String(p.jerseyNumber).includes(q);
                })
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 text-start"
                    onClick={() => {
                      if (pickingSlot !== null) handleAssign(pickingSlot, String(p.id));
                      setPickingSlot(null);
                    }}
                  >
                    {p.photo ? (
                      <img src={p.photo} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <JerseyNumber n={p.jerseyNumber} className="" />
                    )}
                    <span className="truncate text-sm">{playerName(p, lang)}</span>
                  </button>
                ))}
            </div>

            {/* Guest player — someone promoted up for this match only,
                not in the roster at all. Free-text name + number rather
                than a roster pick, since there's nothing to select from
                the list above for them. */}
            {addingSlotGuest ? (
              <div className="flex items-center gap-1.5 p-2 rounded-lg border bg-muted/30">
                <Input
                  className="h-9 text-sm w-16"
                  placeholder="#"
                  inputMode="numeric"
                  value={guestNumberInput}
                  onChange={(e) => setGuestNumberInput(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
                <Input
                  className="h-9 text-sm flex-1"
                  placeholder={t('lineup.guestNamePlaceholder')}
                  value={guestNameInput}
                  onChange={(e) => setGuestNameInput(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!guestNameInput.trim() || !guestNumberInput}
                  onClick={() => {
                    if (pickingSlot !== null) {
                      handleAssignGuest(pickingSlot, { name: guestNameInput.trim(), jerseyNumber: Number(guestNumberInput) });
                    }
                    setAddingSlotGuest(false);
                    setPickingSlot(null);
                  }}
                >
                  <Check className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAddingSlotGuest(false)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline" className="w-full"
                onClick={() => { setAddingSlotGuest(true); setGuestNameInput(''); setGuestNumberInput(''); }}
              >
                + {t('lineup.addGuest')}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </PullToRefresh>
    </AppLayout>
  );
}
