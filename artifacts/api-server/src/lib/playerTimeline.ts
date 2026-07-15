import { eq, and } from "drizzle-orm";
import {
  db,
  playersTable,
  matchesTable,
  playingTimeTable,
  goalsTable,
  cardsTable,
  attendanceTable,
} from "@workspace/db";

export interface PlayerTimelineEntry {
  date: string;
  sessionType: "match" | "training";
  present: boolean;
  matchId?: number;
  opponent?: string;
  matchType?: string;
  ourGoals?: number;
  theirGoals?: number;
  minutesPlayed?: number;
  goalsScored?: number;
  yellowCards?: number;
  redCards?: number;
}

/**
 * Connects five tables that each hold one slice of a single player's
 * history — players, matches, playing_time, goals, cards, attendance —
 * into one chronological timeline for a player profile page.
 */
export async function buildPlayerTimeline(playerId: number) {
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) return null;

  const teamId = player.teamId;

  const [matches, playingTimeRows, goalRows, cardRows, attendanceRows] = await Promise.all([
    db.select().from(matchesTable).where(eq(matchesTable.teamId, teamId)),
    db.select().from(playingTimeTable).where(eq(playingTimeTable.playerId, playerId)),
    db
      .select()
      .from(goalsTable)
      .where(and(eq(goalsTable.scorerPlayerId, playerId), eq(goalsTable.type, "scored"))),
    db.select().from(cardsTable).where(eq(cardsTable.playerId, playerId)),
    db.select().from(attendanceTable).where(eq(attendanceTable.playerId, playerId)),
  ]);

  // date -> matchId, assuming at most one match per day (true for
  // amateur/youth schedules, which this app targets)
  const matchIdByDate = new Map(matches.map((m) => [m.date, m.id] as const));
  const matchById = new Map(matches.map((m) => [m.id, m] as const));

  const statsByMatchId = new Map<
    number,
    { minutes: number; goals: number; yellow: number; red: number; present: boolean }
  >();
  const ensure = (matchId: number) => {
    let s = statsByMatchId.get(matchId);
    if (!s) {
      s = { minutes: 0, goals: 0, yellow: 0, red: 0, present: false };
      statsByMatchId.set(matchId, s);
    }
    return s;
  };

  for (const row of playingTimeRows) {
    const s = ensure(row.matchId);
    s.minutes += row.minutes;
    s.present = true;
  }
  for (const row of goalRows) {
    ensure(row.matchId).goals += 1;
  }
  for (const row of cardRows) {
    const s = ensure(row.matchId);
    if (row.cardType === "yellow") s.yellow += 1;
    else if (row.cardType === "red") s.red += 1;
  }

  const trainingEntries: PlayerTimelineEntry[] = [];
  for (const row of attendanceRows) {
    if (row.sessionType === "match") {
      const matchId = matchIdByDate.get(row.date);
      if (matchId) {
        ensure(matchId).present = row.present;
      }
      // If attendance references a match day with no matching match record,
      // it's dropped — the coach likely deleted that match afterward.
    } else {
      trainingEntries.push({
        date: row.date,
        sessionType: "training",
        present: row.present,
      });
    }
  }

  const matchEntries: PlayerTimelineEntry[] = Array.from(statsByMatchId.entries()).map(
    ([matchId, s]) => {
      const match = matchById.get(matchId);
      return {
        date: match?.date ?? "",
        sessionType: "match" as const,
        present: s.present,
        matchId,
        opponent: match?.opponent,
        matchType: match?.type,
        ourGoals: match?.ourGoals,
        theirGoals: match?.theirGoals,
        minutesPlayed: s.minutes,
        goalsScored: s.goals,
        yellowCards: s.yellow,
        redCards: s.red,
      };
    },
  );

  const timeline = [...matchEntries, ...trainingEntries].sort((a, b) => b.date.localeCompare(a.date));

  return {
    player: {
      id: player.id,
      name: player.name,
      nameAlt: player.nameAlt,
      jerseyNumber: player.jerseyNumber,
      position: player.position,
      age: player.age,
      nationality: player.nationality,
      status: player.status,
      photo: player.photo,
      phone: player.phone,
      birthYear: player.birthYear,
    },
    timeline,
  };
}
