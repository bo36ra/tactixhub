// Recharts (the charting library used across the app) needs literal
// color strings for its stroke/fill/background props — it can't
// consume Tailwind classes or reference CSS custom properties the way
// regular DOM elements can in every browser context reliably, so these
// can't just be `hsl(var(--primary))` etc. the way normal UI elements
// are styled.
//
// This is also a deliberately distinct, warmer palette from the main
// UI's green-tinted dark theme — not a case of "should have matched
// --border/--muted-foreground but drifted." Charts commonly use a
// separate, coordinated palette so data lines/bars read as "data ink"
// rather than blending into UI chrome. What WAS a real problem: this
// palette was duplicated (with inconsistent casing — #E8B64C vs
// #e8b64c) across training-load.tsx, player-profile.tsx, and
// trainings.tsx independently, so a deliberate change to it required
// hunting through three files. Centralized here instead.
export const CHART_COLORS = {
  grid: '#332F27',
  axisText: '#9C9483',
  tooltipBg: '#221F1A',
  tooltipBorder: '#332F27',
  // Primary line/bar color for single-series charts (RPE load, ratings, etc.)
  accent: '#E8B64C',
  // Secondary series when a chart shows two metrics together (e.g. strain vs monotony)
  secondary: '#5BA8D9',
  // Threshold/reference lines (e.g. a weekly-load danger line)
  danger: '#D96B5B',
} as const;

// The pitch's green gradient — shared by the lineup builder and the
// tactics board, which independently had the exact same literal string
// duplicated between them.
export const PITCH_GRADIENT = 'linear-gradient(180deg, #1e7a3d 0%, #24923f 50%, #1e7a3d 100%)';
