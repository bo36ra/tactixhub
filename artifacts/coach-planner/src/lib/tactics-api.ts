import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

// Board format stored as a JSON string in the `data` column.
export interface BoardMarker {
  id: string;
  x: number; // 0..100 (percent of pitch width)
  y: number; // 0..100 (percent of pitch height)
  label: string;
  side: 'us' | 'them' | 'ball';
  // Overrides the side's default color when set — lets a coach split
  // markers into a third (or more) group for training-game scenarios
  // (e.g. splitting the squad into 3 teams) without needing a rigid
  // third "side" value; any marker can be recolored individually.
  color?: string;
}
export interface BoardArrow { x1: number; y1: number; x2: number; y2: number }
// Same shape as an arrow, but rendered as a plain zone-divider line (no
// arrowhead) — for a coach splitting the pitch into thirds, channels,
// or any custom zone rather than showing a player/ball movement.
export interface BoardLine { x1: number; y1: number; x2: number; y2: number }
export interface BoardDrawing { points: { x: number; y: number }[] }
// A frame is a snapshot of marker positions; playback interpolates between frames.
export interface BoardFrame { markers: BoardMarker[] }
export interface BoardData {
  markers: BoardMarker[];
  arrows: BoardArrow[];
  lines?: BoardLine[];
  drawings?: BoardDrawing[];
  frames?: BoardFrame[];
  notes?: string;
}

export type TacticKind = 'general' | 'set_piece' | 'match_plan';
export interface Tactic {
  id: number;
  teamId: number;
  name: string;
  kind: TacticKind;
  matchId: number | null;
  data: string;
  createdAt: string;
}
export interface OpponentNote {
  id: number;
  teamId: number;
  opponent: string;
  strengths: string | null;
  weaknesses: string | null;
  plan: string | null;
  createdAt: string;
}

export function parseBoard(data: string): BoardData {
  try {
    const d = JSON.parse(data);
    return {
      markers: d.markers ?? [],
      arrows: d.arrows ?? [],
      lines: d.lines ?? [],
      drawings: d.drawings ?? [],
      frames: d.frames ?? [],
      notes: d.notes ?? '',
    };
  } catch {
    return { markers: [], arrows: [], lines: [], drawings: [], frames: [], notes: '' };
  }
}

const tacticsKey = (teamId: number) => ['tactics', teamId] as const;
const notesKey = (teamId: number) => ['opponent-notes', teamId] as const;

export function useTactics(teamId: number, enabled = true) {
  return useQuery({
    queryKey: tacticsKey(teamId),
    enabled,
    queryFn: () => customFetch<Tactic[]>(`/teams/${teamId}/tactics`),
  });
}

export function useSaveTactic(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: number; name: string; kind: TacticKind; matchId?: number | null; data: BoardData }) =>
      input.id
        ? customFetch<Tactic>(`/teams/${teamId}/tactics/${input.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: input.name, kind: input.kind, matchId: input.matchId ?? null, data: JSON.stringify(input.data) }),
            headers: { 'Content-Type': 'application/json' },
          })
        : customFetch<Tactic>(`/teams/${teamId}/tactics`, {
            method: 'POST',
            body: JSON.stringify({ name: input.name, kind: input.kind, matchId: input.matchId ?? null, data: JSON.stringify(input.data) }),
            headers: { 'Content-Type': 'application/json' },
          }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tacticsKey(teamId) }),
  });
}

export function useDeleteTactic(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch<void>(`/teams/${teamId}/tactics/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tacticsKey(teamId) }),
  });
}

export function useOpponentNotes(teamId: number, enabled = true) {
  return useQuery({
    queryKey: notesKey(teamId),
    enabled,
    queryFn: () => customFetch<OpponentNote[]>(`/teams/${teamId}/opponent-notes`),
  });
}

export function useSaveOpponentNote(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: number; opponent: string; strengths?: string; weaknesses?: string; plan?: string }) =>
      input.id
        ? customFetch<OpponentNote>(`/teams/${teamId}/opponent-notes/${input.id}`, {
            method: 'PATCH',
            body: JSON.stringify(input),
            headers: { 'Content-Type': 'application/json' },
          })
        : customFetch<OpponentNote>(`/teams/${teamId}/opponent-notes`, {
            method: 'POST',
            body: JSON.stringify(input),
            headers: { 'Content-Type': 'application/json' },
          }),
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey(teamId) }),
  });
}

export function useDeleteOpponentNote(teamId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch<void>(`/teams/${teamId}/opponent-notes/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey(teamId) }),
  });
}
