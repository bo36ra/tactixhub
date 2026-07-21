import React from 'react';

const STORAGE_KEY = 'tactixhub_weight_unit';
const KG_PER_LB = 0.45359237;

export type WeightUnit = 'kg' | 'lb';

// Weights are always stored and sent to the API in kg — this hook only
// affects how they're displayed and entered. Converting at the UI
// boundary (not in the database) keeps the stored data unambiguous
// regardless of which unit a coach happens to prefer, and avoids any
// risk of double-converting or drifting values over repeated edits.
export function useWeightUnit() {
  const [unit, setUnitState] = React.useState<WeightUnit>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'lb' ? 'lb' : 'kg';
    } catch {
      return 'kg';
    }
  });

  const setUnit = (u: WeightUnit) => {
    setUnitState(u);
    try {
      localStorage.setItem(STORAGE_KEY, u);
    } catch {
      // ignore
    }
  };

  // kg -> whatever the current display unit is, rounded to 1 decimal
  const toDisplay = (kg: number) => {
    const v = unit === 'lb' ? kg / KG_PER_LB : kg;
    return Math.round(v * 10) / 10;
  };

  // display value (in the current unit) -> kg, for saving
  const toKg = (displayValue: number) => {
    const v = unit === 'lb' ? displayValue * KG_PER_LB : displayValue;
    return Math.round(v * 10) / 10;
  };

  return { unit, setUnit, toDisplay, toKg };
}
