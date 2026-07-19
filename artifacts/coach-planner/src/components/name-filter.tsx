import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n';
import { playerName } from '@/lib/player-name';

// One shared search-by-name filter for every page that lists the squad
// (attendance, cards, goals, playing time, ...). With a 30+ player
// squad, scrolling to find one name on a phone is slow — typing 2-3
// letters is much faster. Matches against both the primary and the
// bilingual alternate name, case-insensitively, so it works whichever
// language the coach types in.
export function useNameFilter<T extends { name: string; nameAlt?: string | null }>(items: T[] | undefined) {
  const [query, setQuery] = React.useState('');
  const q = query.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    if (!items) return [] as T[];
    if (!q) return items;
    return items.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.nameAlt ?? '').toLowerCase().includes(q),
    );
  }, [items, q]);
  return { query, setQuery, filtered };
}

export function NameFilterInput({ value, onChange, className = '' }: { value: string; onChange: (v: string) => void; className?: string }) {
  const { t } = useLanguage();
  return (
    <div className={`relative ${className}`}>
      <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground pointer-events-none" />
      <Input
        className="ps-9"
        placeholder={t('nameFilter.placeholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// Convenience label helper re-export so call sites filtering by name
// don't need a second import for displaying it.
export { playerName };
