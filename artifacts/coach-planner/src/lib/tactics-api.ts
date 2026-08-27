import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

// Board format stored as a JSON string in the `data` column.
export type EquipmentType = 'cone' | 'barrier' | 'goal' | 'flag';
export interface BoardMarker {
  id: string;
  x: number; // 0..100 (percent of pitch width)
  y: number; // 0..100 (percent of pitch height)
  label: string;
  side: 'us' | 'them' | 'ball' | 'equipment';
  // Which equipment shape to render — only meaningful when side is 'equipment'.
  equipment?: EquipmentType;
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
export const EVENT_TYPES = [
  'pass', 'shot', 'reception', 'loss', 'recovery', 'press', 'tackle',
  'off_ball_movement', 'cross', 'corner', 'foul',
] as const;
// 'custom' isn't in EVENT_TYPES (that list drives the fixed color-coded
// grid) but is a valid event type — lets a coach log something not on
// the predefined list at all, with their own label and short code.
export type TacticalEventType = typeof EVENT_TYPES[number] | 'custom';
export const FOUL_SUBTYPES = ['AF', 'DF', 'PK', 'YC', 'RC', 'HB'] as const;
export type FoulSubtype = typeof FOUL_SUBTYPES[number];

export const CORNER_SUBTYPES = ['CA', 'CD'] as const;
export const SHOT_SUBTYPES = ['ON', 'OFF', 'BLK', 'GOAL'] as const;

// Which event types have a secondary short-code breakdown, and what
// codes are available for each — drives both the "pick a subtype"
// step when logging an event and the legend shown under the board.
export const SUBTYPES_BY_EVENT: Partial<Record<TacticalEventType, readonly string[]>> = {
  foul: FOUL_SUBTYPES,
  corner: CORNER_SUBTYPES,
  shot: SHOT_SUBTYPES,
};

// Every event type gets a short badge code — foul/corner/shot show
// their more specific subtype code instead (AF, CA, ON, ...) when one
// is set, this is the fallback so every marker on the pitch reads as
// "what happened" regardless of color, which is now team-based rather
// than type-based.
export const EVENT_TYPE_CODES: Record<TacticalEventType, string> = {
  pass: 'PA', shot: 'SH', reception: 'RC', loss: 'LO', recovery: 'RV',
  press: 'PR', tackle: 'TK', off_ball_movement: 'OB', cross: 'CR',
  corner: 'CO', foul: 'FO', custom: '',
};

export interface TacticalEvent {
  id: string;
  x: number; // 0..100
  y: number; // 0..100
  type: TacticalEventType;
  // Only for type:'custom' — a coach-written name and short code,
  // used instead of an i18n lookup wherever the event is displayed.
  customLabel?: string | null;
  // Whether this event directly resulted in a goal — specifically for
  // a penalty (foul/PK), so scoring it doesn't need a second, separate
  // shot event for what is really one occurrence on the pitch.
  resultedInGoal?: boolean;
  // Which side this event belongs to — drives the marker's color
  // (team-based) while the badge/symbol stays type-based, so a coach
  // can read "who did it" and "what happened" from the same marker
  // without them competing for the same visual channel.
  team?: 'us' | 'them';
  // Currently only meaningful for type:'foul' (AF/DF/PK/YC/RC/HB) —
  // kept as a plain string rather than a foul-specific field name so
  // other event types can grow their own short-code subtypes later
  // without another schema-shaped change.
  subtype?: string | null;
  playerId?: number | null;
  minute?: number | null; // manually-entered match minute, independent of createdAt
  createdAt: number; // Date.now() at creation — used to order events when minute isn't set
}

export interface BoardData {
  markers: BoardMarker[];
  arrows: BoardArrow[];
  lines?: BoardLine[];
  drawings?: BoardDrawing[];
  frames?: BoardFrame[];
  notes?: string;
  // Only populated for kind:'analysis' boards — the rest of BoardData
  // (markers/arrows) is shared and reused as-is by the analysis board
  // for player positions and drawn movement lines.
  events?: TacticalEvent[];
}

export type TacticKind = 'general' | 'set_piece' | 'match_plan' | 'analysis';
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
      events: d.events ?? [],
    };
  } catch {
    return { markers: [], arrows: [], lines: [], drawings: [], frames: [], notes: '', events: [] };
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
