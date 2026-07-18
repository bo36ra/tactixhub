import React from 'react';
import { Link } from 'wouter';
import { useLanguage } from '@/lib/i18n';
import { useTeam } from '@/lib/team-context';
import { useSearch } from '@/lib/dev-api';
import { playerName } from '@/lib/player-name';
import { PlayerAvatar } from '@/components/player-avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Users, Swords, StickyNote } from 'lucide-react';

export function SearchOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, lang } = useLanguage();
  const { activeTeamId } = useTeam();
  const [query, setQuery] = React.useState('');
  const { data, isFetching } = useSearch(activeTeamId ?? 0, query);

  const hasQuery = query.trim().length >= 2;
  const hasResults = !!data && (data.players.length > 0 || data.matches.length > 0 || data.notes.length > 0);

  const close = () => {
    onOpenChange(false);
    setQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); else onOpenChange(true); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="sr-only">{t('search.title')}</DialogTitle>
          <div className="relative">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
            <Input
              autoFocus
              className="ps-9"
              placeholder={t('search.placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </DialogHeader>

        <div className="px-4 pb-4 space-y-4">
          {!hasQuery && (
            <p className="text-sm text-muted-foreground text-center py-8">{t('search.hint')}</p>
          )}
          {hasQuery && !isFetching && !hasResults && (
            <p className="text-sm text-muted-foreground text-center py-8">{t('search.noResults')}</p>
          )}

          {data && data.players.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Users className="w-3 h-3" /> {t('nav.players')}
              </p>
              {data.players.map((p) => (
                <Link key={p.id} href={`/players/${p.id}`} onClick={close} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                  <PlayerAvatar photo={p.photo} jerseyNumber={p.jerseyNumber} className="w-8 h-8 text-xs" />
                  <span className="text-sm font-medium">{playerName(p, lang)}</span>
                </Link>
              ))}
            </div>
          )}

          {data && data.matches.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Swords className="w-3 h-3" /> {t('nav.matches')}
              </p>
              {data.matches.map((m) => (
                <Link key={m.id} href="/matches" onClick={close} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                  <span className="text-sm font-medium">{m.opponent}</span>
                  <span className="text-xs text-muted-foreground" dir="ltr">{m.ourGoals}-{m.theirGoals} · {m.date}</span>
                </Link>
              ))}
            </div>
          )}

          {data && data.notes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <StickyNote className="w-3 h-3" /> {t('nav.notes')}
              </p>
              {data.notes.map((n) => (
                <Link key={n.id} href="/notes" onClick={close} className="block rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                  {n.title && <p className="text-sm font-medium truncate">{n.title}</p>}
                  <p className="text-xs text-muted-foreground truncate">{n.content}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
