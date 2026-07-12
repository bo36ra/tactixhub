import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

export interface Training { id: number; teamId: number; date: string; time: string | null; focus: string; intensity: string | null; durationMinutes: number | null; drills: string | null; notes: string | null; createdAt: string }
export interface Injury { id: number; teamId: number; playerId: number; playerName?: string; type: string; date: string; expectedReturn: string | null; status: 'out' | 'recovering' | 'recovered'; notes: string | null; createdAt: string }
export interface Rating { id: number; teamId: number; matchId: number; playerId: number; rating: number; note: string | null }

const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

export function useTrainings(teamId: number) {
  return useQuery({ queryKey: ['trainings', teamId], queryFn: () => customFetch<Training[]>(`/api/teams/${teamId}/trainings`) });
}
export function useCreateTraining(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { date: string; time?: string; focus: string; intensity?: string; durationMinutes?: number; drills?: string; notes?: string }) =>
      customFetch<Training>(`/api/teams/${teamId}/trainings`, { method: 'POST', ...json(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trainings', teamId] }),
  });
}
export function useDeleteTraining(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch<void>(`/api/teams/${teamId}/trainings/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trainings', teamId] }),
  });
}

export interface PlayerRatingPoint { id: number; matchId: number; rating: number; note: string | null; date: string; opponent: string }
export function usePlayerRatings(teamId: number, playerId: number | undefined) {
  return useQuery({
    queryKey: ['player-ratings', teamId, playerId],
    enabled: !!teamId && !!playerId,
    queryFn: () => customFetch<PlayerRatingPoint[]>(`/api/teams/${teamId}/players/${playerId}/ratings`),
  });
}

export interface MatchPlan { id: number; teamId: number; matchId: number; opponentNotes: string | null; instructions: string | null; updatedAt: string }
export function useMatchPlan(teamId: number, matchId: number | null) {
  return useQuery({
    queryKey: ['match-plan', teamId, matchId],
    enabled: !!teamId && !!matchId,
    queryFn: () => customFetch<MatchPlan | null>(`/api/teams/${teamId}/matches/${matchId}/plan`),
  });
}
export function useSaveMatchPlan(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { matchId: number; opponentNotes?: string; instructions?: string }) =>
      customFetch<MatchPlan>(`/api/teams/${teamId}/matches/${input.matchId}/plan`, {
        method: 'PUT',
        body: JSON.stringify({ opponentNotes: input.opponentNotes, instructions: input.instructions }),
      }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['match-plan', teamId, vars.matchId] }),
  });
}

export interface CycleDay { id?: number; dayOfWeek: number; focus: string; intensity: string | null; durationMinutes: number | null; time: string | null }
export function useWeekCycle(teamId: number) {
  return useQuery({
    queryKey: ['week-cycle', teamId],
    enabled: !!teamId,
    queryFn: () => customFetch<CycleDay[]>(`/api/teams/${teamId}/cycle`),
  });
}
export function useSaveWeekCycle(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: CycleDay[]) =>
      customFetch<CycleDay[]>(`/api/teams/${teamId}/cycle`, { method: 'PUT', body: JSON.stringify({ days }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['week-cycle', teamId] }),
  });
}
export function useApplyCycle(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { from: string; to: string }) =>
      customFetch<{ created: number }>(`/api/teams/${teamId}/cycle/apply`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trainings', teamId] }),
  });
}
export interface MonthPlan { id: number; teamId: number; month: string; goal: string | null; notes: string | null; updatedAt: string }
export function useMonthPlan(teamId: number, month: string) {
  return useQuery({
    queryKey: ['month-plan', teamId, month],
    enabled: !!teamId && !!month,
    queryFn: () => customFetch<MonthPlan | null>(`/api/teams/${teamId}/month-plan/${month}`),
  });
}
export function useSaveMonthPlan(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { month: string; goal?: string; notes?: string }) =>
      customFetch<MonthPlan>(`/api/teams/${teamId}/month-plan/${input.month}`, { method: 'PUT', body: JSON.stringify({ goal: input.goal, notes: input.notes }) }),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['month-plan', teamId, vars.month] }),
  });
}

export interface Availability { id: number; teamId: number; playerId: number; type: string; startDate: string; endDate: string | null; note: string | null; createdAt: string }
export function useAvailability(teamId: number) {
  return useQuery({
    queryKey: ['availability', teamId],
    enabled: !!teamId,
    queryFn: () => customFetch<Availability[]>(`/api/teams/${teamId}/availability`),
  });
}
export function useCreateAvailability(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { playerId: number; type: string; startDate: string; endDate?: string; note?: string }) =>
      customFetch<Availability>(`/api/teams/${teamId}/availability`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['availability', teamId] }),
  });
}
export function useDeleteAvailability(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<void>(`/api/teams/${teamId}/availability/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['availability', teamId] }),
  });
}

export function useBulkInvite(teamId: number) {
  return useMutation({
    mutationFn: (input: { email: string; role: string; displayName?: string; teamIds: number[] }) =>
      customFetch<{ invited: number[]; skipped: { teamId: number; reason: string }[] }>(
        `/api/teams/${teamId}/members/bulk`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
  });
}

export function useInjuries(teamId: number) {
  return useQuery({ queryKey: ['injuries', teamId], queryFn: () => customFetch<Injury[]>(`/api/teams/${teamId}/injuries`) });
}
export function useCreateInjury(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { playerId: number; type: string; date: string; expectedReturn?: string; notes?: string }) =>
      customFetch<Injury>(`/api/teams/${teamId}/injuries`, { method: 'POST', ...json(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['injuries', teamId] }),
  });
}
export function useUpdateInjury(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; status?: string; expectedReturn?: string; notes?: string }) =>
      customFetch<Injury>(`/api/teams/${teamId}/injuries/${input.id}`, { method: 'PATCH', ...json(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['injuries', teamId] }),
  });
}
export function useDeleteInjury(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch<void>(`/api/teams/${teamId}/injuries/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['injuries', teamId] }),
  });
}

export function useRatings(teamId: number, matchId: number | null) {
  return useQuery({
    queryKey: ['ratings', teamId, matchId],
    enabled: !!matchId,
    queryFn: () => customFetch<Rating[]>(`/api/teams/${teamId}/matches/${matchId}/ratings`),
  });
}
export function useSaveRating(teamId: number, matchId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { playerId: number; rating: number; note?: string }) =>
      customFetch<Rating>(`/api/teams/${teamId}/matches/${matchId}/ratings`, { method: 'POST', ...json(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ratings', teamId, matchId] }),
  });
}
