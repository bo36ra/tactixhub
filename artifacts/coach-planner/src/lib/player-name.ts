// Bilingual player-name display. Coaches with an international squad can
// store a second-language spelling (nameAlt); we show whichever script
// matches the current UI language when both are present, and always fall
// back to the primary name. We detect script by content, not by which
// field is which, since the coach may have typed either language first.
const ARABIC_RE = /[\u0600-\u06FF]/;

function isArabic(text: string): boolean {
  return ARABIC_RE.test(text);
}

// Returns the best name to show for the given UI language ('ar' | 'en').
// When both names exist, prefer the one whose script matches the UI;
// otherwise show the primary name.
export function playerName(
  p: { name: string; nameAlt?: string | null },
  lang: string,
): string {
  const primary = p.name;
  const alt = p.nameAlt?.trim();
  if (!alt) return primary;

  const wantArabic = lang === 'ar';
  const primaryIsArabic = isArabic(primary);
  const altIsArabic = isArabic(alt);

  // If exactly one of them matches the desired script, use that one.
  if (wantArabic) {
    if (primaryIsArabic && !altIsArabic) return primary;
    if (!primaryIsArabic && altIsArabic) return alt;
  } else {
    if (!primaryIsArabic && altIsArabic) return primary;
    if (primaryIsArabic && !altIsArabic) return alt;
  }
  // Otherwise (both same script, or neither detectable) keep the primary.
  return primary;
}
