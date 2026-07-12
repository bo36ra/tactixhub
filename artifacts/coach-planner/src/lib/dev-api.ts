import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

export interface Training { id: number; teamId: number; date: string; time: string | null; focus: string; intensity: string | null; durationMinutes: number | null; drills: string | null; notes: string | null; createdAt: string }
export interface Injury { id: number; teamId: number; playerId: number; playerName?: string; type: string; date: string; expectedReturn: string | null; status: 'out' | 'recovering' | 'recovered'; notes: string | null; createdAt: string }
export interface Rating { id: number; teamId: number; matchId: number; playerId: number; rating: number; note: string | null }

const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

export function useTrainings(teamId: number) {
  return useQuery({ queryKey: ['trainings', teamId], queryFn: () => customFetch<Training[]>(`/teams/${teamId}/trainings`) });
}
export function useCreateTraining(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { date: string; time?: string; focus: string; intensity?: string; durationMinutes?: number; drills?: string; notes?: string }) =>
      customFetch<Training>(`/teams/${teamId}/trainings`, { method: 'POST', ...json(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trainings', teamId] }),
  });
}
export function useDeleteTraining(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch<void>(`/teams/${teamId}/trainings/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trainings', teamId] }),
  });
}

export interface PlayerRatingPoint { id: number; matchId: number; rating: number; note: string | null; date: string; opponent: string }
export function usePlayerRatings(teamId: number, playerId: number | undefined) {
  return useQuery({
    queryKey: ['player-ratings', teamId, playerId],
    enabled: !!teamId && !!playerId,
    queryFn: () => customFetch<PlayerRatingPoint[]>(`/teams/${teamId}/players/${playerId}/ratings`),
  });
}

export function useInjuries(teamId: number) {
  return useQuery({ queryKey: ['injuries', teamId], queryFn: () => customFetch<Injury[]>(`/teams/${teamId}/injuries`) });
}
export function useCreateInjury(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { playerId: number; type: string; date: string; expectedReturn?: string; notes?: string }) =>
      customFetch<Injury>(`/teams/${teamId}/injuries`, { method: 'POST', ...json(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['injuries', teamId] }),
  });
}
export function useUpdateInjury(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; status?: string; expectedReturn?: string; notes?: string }) =>
      customFetch<Injury>(`/teams/${teamId}/injuries/${input.id}`, { method: 'PATCH', ...json(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['injuries', teamId] }),
  });
}
export function useDeleteInjury(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch<void>(`/teams/${teamId}/injuries/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['injuries', teamId] }),
  });
}

export function useRatings(teamId: number, matchId: number | null) {
  return useQuery({
    queryKey: ['ratings', teamId, matchId],
    enabled: !!matchId,
    queryFn: () => customFetch<Rating[]>(`/teams/${teamId}/matches/${matchId}/ratings`),
  });
}
export function useSaveRating(teamId: number, matchId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { playerId: number; rating: number; note?: string }) =>
      customFetch<Rating>(`/teams/${teamId}/matches/${matchId}/ratings`, { method: 'POST', ...json(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ratings', teamId, matchId] }),
  });
}
