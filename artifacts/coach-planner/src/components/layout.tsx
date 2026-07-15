import React from 'react';
import { Link, useLocation } from 'wouter';
import { useLanguage } from '../lib/i18n';
import { useTeam } from '../lib/team-context';
import { useListTeams } from '@workspace/api-client-react';
import { useAccessStatus } from '../lib/dev-api';
import { useIsPro } from '../lib/feature-gate';
import { 
  LayoutDashboard, 
  ClipboardList,
  Dumbbell,
  FileText,
  Activity,
  Users, 
  CalendarCheck, 
  Swords, 
  Target, 
  CreditCard, 
  Clock,
  Layers,
  BarChart2,
  Menu,
  Globe,
  Plus,
  ChevronsUpDown,
  Check,
  UserCog,
  StickyNote,
  ClipboardCheck,
  CalendarDays,
  Plane,
  ShieldCheck
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useClerk } from '@clerk/react';
import { NotificationBell } from '@/components/notification-bell';

export function Sidebar() {
  const { t, lang, setLang, isRtl } = useLanguage();
  const [location] = useLocation();
  const { activeTeamId, setActiveTeamId } = useTeam();
  const { data: teams } = useListTeams();
  const { signOut } = useClerk();

  const { data: access } = useAccessStatus();
  const isPro = useIsPro();

  const navSections = [
    {
      label: t('nav.section.overview'),
      links: [
        { href: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
      ],
    },
    {
      label: t('nav.section.squad'),
      links: [
        { href: '/players', label: t('nav.players'), icon: Users },
        { href: '/attendance', label: t('nav.attendance'), icon: CalendarCheck },
        { href: '/training-load', label: t('nav.rpe'), icon: Activity, pro: true },
      ],
    },
    {
      label: t('nav.section.competition'),
      links: [
        { href: '/matches', label: t('nav.matches'), icon: Swords },
{ href: '/readiness', label: t('nav.readiness'), icon: ClipboardCheck },
        { href: '/calendar', label: t('nav.calendar'), icon: CalendarDays },
        { href: '/availability', label: t('nav.availability'), icon: Plane },
        { href: '/goals', label: t('nav.goals'), icon: Target },
        { href: '/cards', label: t('nav.cards'), icon: CreditCard },
        { href: '/playing-time', label: t('nav.playingTime'), icon: Clock },
      ],
    },
    {
      label: t('nav.section.manage'),
      links: [
        { href: '/teams', label: t('nav.teams'), icon: Layers },
        { href: '/staff', label: t('nav.staff'), icon: UserCog },
        { href: '/notes', label: t('nav.notes'), icon: StickyNote },
        { href: '/reports', label: t('nav.reports'), icon: BarChart2 },
        { href: '/tactics', label: t('nav.tactics'), icon: ClipboardList },
        { href: '/trainings', label: t('nav.trainings'), icon: Dumbbell },
        { href: '/performance', label: t('nav.performance'), icon: Activity },
        { href: '/match-report', label: t('nav.matchReport'), icon: FileText },
        ...(access?.isAdmin ? [{ href: '/admin', label: t('nav.admin'), icon: ShieldCheck }] : []),
      ],
    },
  ];

  const activeTeam = teams?.find(team => team.id === activeTeamId);

  const navLinkClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
      active
        ? 'bg-primary/15 text-primary'
        : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
    }`;

  const content = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground w-64">
      {/* Logo */}
      <div className="p-5 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <img src="/logo-icon.svg" alt="TactixHub" className="w-7 h-7 shrink-0" />
          <h1 className="font-display font-bold text-[15px] text-foreground tracking-tight">{t('app.title')}</h1>
        </div>
        <div className="flex items-center gap-1">
        <NotificationBell />
        <Button 
          variant="ghost" 
          size="icon"
          aria-label="Toggle language"
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
          onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
        >
          <Globe className="h-4 w-4" />
        </Button>
        </div>
      </div>

      {/* Active team switcher - prominent card */}
      <div className="p-3 border-b border-white/[0.06]">
        {teams && teams.length > 0 ? (
          <DropdownMenu dir={isRtl ? 'rtl' : 'ltr'}>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] px-3 py-2.5 text-start transition-colors">
                <div className="w-8 h-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0 font-display font-bold text-xs">
                  {activeTeam?.name?.slice(0, 2).toUpperCase() || '--'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{activeTeam?.name || t('team.select')}</p>
                  {activeTeam?.season && (
                    <p className="text-xs text-muted-foreground truncate">{activeTeam.season}</p>
                  )}
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {teams.map((team) => (
                <DropdownMenuItem
                  key={team.id}
                  onClick={() => setActiveTeamId(team.id)}
                  className="gap-2 cursor-pointer"
                >
                  <div className="w-5 h-5 flex items-center justify-center shrink-0">
                    {team.id === activeTeamId && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <span className="truncate">{team.name}</span>
                </DropdownMenuItem>
              ))}
              <div className="my-1 h-px bg-border" />
              <DropdownMenuItem asChild className="gap-2 cursor-pointer text-primary">
                <Link href="/teams">
                  <Plus className="h-4 w-4" />
                  {t('team.create')}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Link href="/teams" className="flex items-center gap-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-dashed border-white/[0.12] px-3 py-2.5 transition-colors">
            <Plus className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm text-muted-foreground truncate">{t('team.createFirst')}</span>
          </Link>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 px-3 py-3 overflow-y-auto">
        {navSections.map((section, idx) => (
          <div key={section.label} className={idx > 0 ? 'pt-4' : ''}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.links.map((link) => {
                const active = location === link.href;
                const Icon = link.icon;
                const showProBadge = (link as { pro?: boolean }).pro && !isPro;
                return (
                  <Link key={link.href} href={link.href} className={navLinkClass(active)}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{link.label}</span>
                    {showProBadge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary shrink-0">
                        {t('feature.proBadge')}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer: logout */}
      <div className="p-3 border-t border-white/[0.06]">
        <Button
          variant="ghost"
          className="w-full h-9 justify-start text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.04] px-3"
          onClick={() => signOut({ redirectUrl: '/' })}
        >
          {t('nav.logout')}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden md:block h-screen fixed inset-y-0 z-50 print:hidden">
        {content}
      </div>
      <div className="md:hidden print:hidden fixed top-0 inset-x-0 h-14 bg-sidebar border-b border-white/[0.06] flex items-center px-4 justify-between z-40">
        <div className="flex items-center gap-2">
          <img src="/logo-icon.svg" alt="TactixHub" className="w-6 h-6" />
          <h1 className="font-display font-bold text-sm text-foreground tracking-tight">{t('app.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>
            <Globe className="h-4 w-4" />
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side={isRtl ? "right" : "left"} className="p-0 border-r-white/10 w-64">
              {content}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="md:ms-64 pt-16 md:pt-0 min-h-screen flex flex-col rtl:md:mr-64 rtl:md:ms-0">
        <main className="flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

// Rendered by every page when no team is active yet. Previously these pages
// did `return null`, which painted a completely black screen (no sidebar, no
// text) whenever the teams list was still loading, failed to load, or the
// user simply hadn't created a team — the main source of "black pages" when
// clicking sidebar options.
export function NoTeamState() {
  const { t } = useLanguage();
  const { isLoading } = useTeam();
  const { data: access, isLoading: accessLoading } = useAccessStatus();

  const loading = isLoading || accessLoading;

  return (
    <AppLayout>
      {loading ? (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : access?.status === 'pending' ? (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3 text-center px-6">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{t('access.pendingTitle')}</h2>
          <p className="text-sm text-muted-foreground max-w-sm">{t('access.pendingBody')}</p>
        </div>
      ) : access?.status === 'rejected' ? (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3 text-center px-6">
          <h2 className="text-xl font-bold text-foreground">{t('access.rejectedTitle')}</h2>
          <p className="text-sm text-muted-foreground max-w-sm">{t('access.rejectedBody')}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
          <h2 className="text-2xl font-bold text-foreground">{t('team.createFirst')}</h2>
          <Button asChild>
            <Link href="/teams">{t('nav.teams')}</Link>
          </Button>
        </div>
      )}
    </AppLayout>
  );
}
