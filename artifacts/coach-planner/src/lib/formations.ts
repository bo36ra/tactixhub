// Slot layout for each formation: 11 positions on a vertical pitch
// (x/y as percentages, y=0 is our goal line, y=100 is the opponent's).
// slotIndex 0 is always the goalkeeper. Order after that follows the
// formation string left group -> right group, back -> front, which is
// also the order lineup_entries.slotIndex maps to.

export interface FormationSlot {
  slotIndex: number;
  label: string;
  x: number;
  y: number;
}

export const FORMATIONS: Record<string, FormationSlot[]> = {
  "4-3-3": [
    { slotIndex: 0, label: "GK", x: 50, y: 6 },
    { slotIndex: 1, label: "LB", x: 15, y: 24 },
    { slotIndex: 2, label: "CB", x: 37, y: 20 },
    { slotIndex: 3, label: "CB", x: 63, y: 20 },
    { slotIndex: 4, label: "RB", x: 85, y: 24 },
    { slotIndex: 5, label: "CM", x: 30, y: 48 },
    { slotIndex: 6, label: "CM", x: 50, y: 44 },
    { slotIndex: 7, label: "CM", x: 70, y: 48 },
    { slotIndex: 8, label: "LW", x: 18, y: 76 },
    { slotIndex: 9, label: "ST", x: 50, y: 84 },
    { slotIndex: 10, label: "RW", x: 82, y: 76 },
  ],
  "4-4-2": [
    { slotIndex: 0, label: "GK", x: 50, y: 6 },
    { slotIndex: 1, label: "LB", x: 15, y: 24 },
    { slotIndex: 2, label: "CB", x: 37, y: 20 },
    { slotIndex: 3, label: "CB", x: 63, y: 20 },
    { slotIndex: 4, label: "RB", x: 85, y: 24 },
    { slotIndex: 5, label: "LM", x: 15, y: 52 },
    { slotIndex: 6, label: "CM", x: 40, y: 48 },
    { slotIndex: 7, label: "CM", x: 60, y: 48 },
    { slotIndex: 8, label: "RM", x: 85, y: 52 },
    { slotIndex: 9, label: "ST", x: 38, y: 82 },
    { slotIndex: 10, label: "ST", x: 62, y: 82 },
  ],
  "4-2-3-1": [
    { slotIndex: 0, label: "GK", x: 50, y: 6 },
    { slotIndex: 1, label: "LB", x: 15, y: 22 },
    { slotIndex: 2, label: "CB", x: 37, y: 18 },
    { slotIndex: 3, label: "CB", x: 63, y: 18 },
    { slotIndex: 4, label: "RB", x: 85, y: 22 },
    { slotIndex: 5, label: "CDM", x: 37, y: 40 },
    { slotIndex: 6, label: "CDM", x: 63, y: 40 },
    { slotIndex: 7, label: "LW", x: 18, y: 62 },
    { slotIndex: 8, label: "CAM", x: 50, y: 60 },
    { slotIndex: 9, label: "RW", x: 82, y: 62 },
    { slotIndex: 10, label: "ST", x: 50, y: 84 },
  ],
  "3-5-2": [
    { slotIndex: 0, label: "GK", x: 50, y: 6 },
    { slotIndex: 1, label: "CB", x: 25, y: 20 },
    { slotIndex: 2, label: "CB", x: 50, y: 16 },
    { slotIndex: 3, label: "CB", x: 75, y: 20 },
    { slotIndex: 4, label: "LWB", x: 10, y: 46 },
    { slotIndex: 5, label: "CM", x: 35, y: 48 },
    { slotIndex: 6, label: "CM", x: 65, y: 48 },
    { slotIndex: 7, label: "RWB", x: 90, y: 46 },
    { slotIndex: 8, label: "CAM", x: 50, y: 62 },
    { slotIndex: 9, label: "ST", x: 38, y: 84 },
    { slotIndex: 10, label: "ST", x: 62, y: 84 },
  ],
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);
