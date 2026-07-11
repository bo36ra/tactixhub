import { useEffect, useRef } from "react";
import { ClerkProvider, useClerk, useAuth } from '@clerk/react';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient, MutationCache } from "@tanstack/react-query";
import { setAuthTokenGetter, ApiError } from '@workspace/api-client-react';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

// Every save/create/delete in the app used to fail in complete silence when
// the API call errored (backend asleep, network, auth, validation) — the
// dialog just stayed open and "nothing happened." This surfaces the actual
// error as a toast for every mutation app-wide.
function describeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const serverMsg =
      error.data && typeof error.data === 'object' && 'error' in error.data
        ? String((error.data as { error: unknown }).error)
        : error.statusText;
    if (error.status === 401) return 'Not signed in / session expired — try signing in again.';
    return `Server error ${error.status}: ${serverMsg}`;
  }
  if (error instanceof TypeError) {
    // fetch() network failures (server unreachable, CORS, DNS) surface as TypeError
    return 'Could not reach the server. It may be starting up — wait ~30s and try again.';
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Request failed',
        description: describeApiError(error),
      });
    },
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

import { LanguageProvider } from '@/lib/i18n';
import { TeamProvider } from '@/lib/team-context';

import { lazy, Suspense } from 'react';

// Each page loads as its own small chunk on first visit instead of all
// pages being bundled into one large file the browser must download before
// showing anything. Landing/auth stay eager since they're the first thing
// almost everyone sees.
import { Landing } from '@/pages/landing';
import { SignInPage, SignUpPage } from '@/pages/auth';
const Dashboard = lazy(() => import('@/pages/dashboard').then(m => ({ default: m.Dashboard })));
const Players = lazy(() => import('@/pages/players').then(m => ({ default: m.Players })));
const Attendance = lazy(() => import('@/pages/attendance').then(m => ({ default: m.Attendance })));
const Matches = lazy(() => import('@/pages/matches').then(m => ({ default: m.Matches })));
const Goals = lazy(() => import('@/pages/goals').then(m => ({ default: m.Goals })));
const Cards = lazy(() => import('@/pages/cards').then(m => ({ default: m.Cards })));
const PlayingTime = lazy(() => import('@/pages/playing-time').then(m => ({ default: m.PlayingTime })));
const Teams = lazy(() => import('@/pages/teams').then(m => ({ default: m.Teams })));
const Reports = lazy(() => import('@/pages/reports').then(m => ({ default: m.Reports })));
const Lineup = lazy(() => import('@/pages/lineup').then(m => ({ default: m.Lineup })));
const PlayerProfile = lazy(() => import('@/pages/player-profile').then(m => ({ default: m.PlayerProfile })));
const Tactics = lazy(() => import('@/pages/tactics'));
const Trainings = lazy(() => import('@/pages/trainings'));
const Performance = lazy(() => import('@/pages/performance'));
const MatchReport = lazy(() => import('@/pages/match-report'));
const Staff = lazy(() => import('@/pages/staff'));
const Notes = lazy(() => import('@/pages/notes'));
const NotFound = lazy(() => import('@/pages/not-found'));

// The original app derived this from the Replit hostname (dynamic per-deploy
// subdomains); that lookup returns nothing on any other host (Vercel, etc.)
// and silently crashes the whole app before it renders. Just use the key.
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
// If this resolves to an empty string (as opposed to being fully unset),
// passing it straight to ClerkProvider builds a broken URL with no
// hostname ("https:///npm/...") and Clerk fails to load with zero
// visible error on screen. Only pass it through if it's a real value.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL || undefined;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

// If this key is missing, don't crash the whole module at import time —
// that kind of top-level throw happens before React (or even our own
// error-logging code) gets a chance to run, and produces a totally silent
// blank page with nothing on screen. Render a real, visible message instead.
const clerkKeyMissing = !clerkPubKey;

const clerkAppearance = {
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "#C9AF8E",
    colorForeground: "#EAE0D0",
    colorMutedForeground: "#807670",
    colorDanger: "#f87171",
    colorBackground: "#181613",
    colorInput: "#242220",
    colorInputForeground: "#EAE0D0",
    colorNeutral: "#2B2926",
    fontFamily: "'Space Grotesk', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "rounded-2xl w-[440px] max-w-full overflow-hidden shadow-2xl border border-[#2B2926]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-bold tracking-tight",
    formButtonPrimary: "hover:opacity-90",
    socialButtonsBlockButton: "border border-[#2B2926] hover:border-[#3a3835]",
  },
};

// Frontend and backend now live on different domains (Render), so the
// browser won't automatically attach Clerk's session cookie to API calls
// the way it did when both were served from the same Replit origin. This
// explicitly fetches a fresh token from Clerk and attaches it as an
// `Authorization: Bearer <token>` header on every request instead.
function AuthTokenSync() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function PageLoadingFallback() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

// While Clerk is initializing, `<Show>` renders neither branch — which used
// to leave a completely black screen on `/` and on every protected route
// (a black flash on every refresh/deep-link, or a permanently black page if
// Clerk fails to load). Use useAuth().isLoaded so there is always something
// visible on screen.
function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <PageLoadingFallback />;
  return isSignedIn ? <Redirect to="/dashboard" /> : <Landing />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <PageLoadingFallback />;
  if (!isSignedIn) return <Redirect to="/" />;
  return <Component />;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <AuthTokenSync />
        <ClerkQueryClientCacheInvalidator />
        <LanguageProvider>
          <TeamProvider>
            <Suspense fallback={<PageLoadingFallback />}>
              <Switch>
                <Route path="/" component={HomeRedirect} />
                <Route path="/sign-in/*?" component={SignInPage} />
                <Route path="/sign-up/*?" component={SignUpPage} />

                <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
                <Route path="/players"><ProtectedRoute component={Players} /></Route>
                <Route path="/players/:playerId"><ProtectedRoute component={PlayerProfile} /></Route>
                <Route path="/attendance"><ProtectedRoute component={Attendance} /></Route>
                <Route path="/matches"><ProtectedRoute component={Matches} /></Route>
                <Route path="/goals"><ProtectedRoute component={Goals} /></Route>
                <Route path="/cards"><ProtectedRoute component={Cards} /></Route>
                <Route path="/playing-time"><ProtectedRoute component={PlayingTime} /></Route>
                <Route path="/teams"><ProtectedRoute component={Teams} /></Route>
                <Route path="/staff"><ProtectedRoute component={Staff} /></Route>
                <Route path="/notes"><ProtectedRoute component={Notes} /></Route>
                <Route path="/reports"><ProtectedRoute component={Reports} /></Route>
                <Route path="/tactics"><ProtectedRoute component={Tactics} /></Route>
                <Route path="/trainings"><ProtectedRoute component={Trainings} /></Route>
                <Route path="/performance"><ProtectedRoute component={Performance} /></Route>
                <Route path="/match-report"><ProtectedRoute component={MatchReport} /></Route>
                <Route path="/matches/:matchId/lineup"><ProtectedRoute component={Lineup} /></Route>

                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </TeamProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  if (clerkKeyMissing) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#181613',
        color: '#EAE0D0',
        fontFamily: 'monospace',
        padding: '24px',
        direction: 'ltr',
        textAlign: 'left',
      }}>
        <h1 style={{ color: '#f87171', fontSize: '18px', marginBottom: '12px' }}>
          Configuration error
        </h1>
        <p style={{ fontSize: '13px', lineHeight: 1.6 }}>
          VITE_CLERK_PUBLISHABLE_KEY is missing from this deployment's environment variables.
          Add it in your hosting platform's project settings, then redeploy.
        </p>
      </div>
    );
  }

  return (
    <WouterRouter base={basePath}>
      <TooltipProvider>
        <ClerkProviderWithRoutes />
        <Toaster />
      </TooltipProvider>
    </WouterRouter>
  );
}

export default App;
