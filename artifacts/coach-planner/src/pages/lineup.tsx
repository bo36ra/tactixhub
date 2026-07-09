import React, { useEffect, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { AppLayout } from '@/components/layout';
import { useLanguage } from '@/lib/i18n';
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
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ArrowLeft, Star, Check } from 'lucide-react';

export function Lineup() {
  const { t, isRtl } = useLanguage();
  const { activeTeamId } = useTeam();
  const queryClient = useQueryClient();
  const [, params] = useRoute('/matches/:matchId/lineup');
  const matchId = params?.matchId ? Number(params.matchId) : undefined;

  const [formation, setFormation] = useState('4-3-3');
  // slotIndex -> playerId
  const [assignments, setAssignments] = useState<Record<number, number | undefined>>({});
  const [captainSlot, setCaptainSlot] = useState<number | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  const { data: players } = useListPlayers(activeTeamId!, {
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
    let captain: number | undefined;
    lineup.entries.forEach((e) => {
      if (e.slotIndex !== null && e.slotIndex !== undefined) {
        next[e.slotIndex] = e.playerId;
        if (e.isCaptain) captain = e.slotIndex;
      }
    });
    setAssignments(next);
    setCaptainSlot(captain);
  }, [lineup]);

  if (!activeTeamId || !matchId) return null;

  const slots = FORMATIONS[formation] ?? FORMATIONS['4-3-3'];
  const assignedPlayerIds = new Set(Object.values(assignments).filter(Boolean) as number[]);
  const benchPlayers = (players ?? []).filter((p) => !assignedPlayerIds.has(p.id));

  const playerById = (id?: number) => players?.find((p) => p.id === id);

  const handleAssign = (slotIndex: number, playerId: string) => {
    setAssignments((prev) => ({ ...prev, [slotIndex]: playerId ? Number(playerId) : undefined }));
  };

  const handleFormationChange = (next: string) => {
    // Keep the goalkeeper if already assigned; drop outfield assignments
    // that don't map cleanly since slot layouts differ between formations.
    setFormation(next);
    setAssignments((prev) => ({ 0: prev[0] }));
    setCaptainSlot(undefined);
  };

  const handleSave = () => {
    const entries = Object.entries(assignments)
      .filter(([, playerId]) => !!playerId)
      .map(([slotIndex, playerId]) => ({
        playerId: playerId as number,
        slotIndex: Number(slotIndex),
        isCaptain: Number(slotIndex) === captainSlot,
      }));

    saveLineup.mutate(
      { matchId, data: { formation, entries } },
      {
        onSuccess: () => {
          setSaved(true);
          queryClient.invalidateQueries({ queryKey: getGetLineupQueryKey(matchId) });
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  };

  const BackIcon = isRtl ? ArrowRight : ArrowLeft;

  return (
    <AppLayout>
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
              background: 'linear-gradient(180deg, #1e7a3d 0%, #24923f 50%, #1e7a3d 100%)',
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
              const isCaptain = captainSlot === slot.slotIndex;
              return (
                <div
                  key={slot.slotIndex}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
                  style={{ left: `${slot.x}%`, top: `${100 - slot.y}%` }}
                >
                  <button
                    onClick={() => player && setCaptainSlot(isCaptain ? undefined : slot.slotIndex)}
                    className={`w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold border-2 shadow-md transition-transform hover:scale-105 ${
                      player
                        ? 'bg-primary text-primary-foreground border-white'
                        : 'bg-white/15 text-white/70 border-white/40 border-dashed'
                    }`}
                  >
                    {player ? player.jerseyNumber : slot.label}
                    {isCaptain && (
                      <Star className="w-3 h-3 absolute -top-1 -right-1 fill-yellow-400 text-yellow-400" />
                    )}
                  </button>
                  <span className="text-[10px] font-medium text-white bg-black/40 px-1.5 py-0.5 rounded max-w-[72px] truncate">
                    {player ? player.name : t('lineup.empty')}
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
                              #{p.jerseyNumber} {p.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">{t('lineup.bench')} ({benchPlayers.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {benchPlayers.map((p) => (
                  <span key={p.id} className="text-xs bg-card border rounded-full px-2.5 py-1 text-muted-foreground">
                    #{p.jerseyNumber} {p.name}
                  </span>
                ))}
                {benchPlayers.length === 0 && (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
