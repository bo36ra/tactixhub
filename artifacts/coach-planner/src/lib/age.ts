// Age display helper: birth year is the stored truth (it never goes
// stale); the legacy age column is a fallback for older rows.
export function playerAge(p: { birthYear?: number | null; age?: number | null }): number | null {
  if (p.birthYear) return new Date().getFullYear() - p.birthYear;
  return p.age ?? null;
}
