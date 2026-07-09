import { useEffect, useRef } from "react";
import { ClerkProvider, Show, useClerk } from '@clerk/react';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

import { LanguageProvider } from '@/lib/i18n';
import { TeamProvider } from '@/lib/team-context';

import { Landing } from '@/pages/landing';
import { SignInPage, SignUpPage } from '@/pages/auth';
import { Dashboard } from '@/pages/dashboard';
import { Players } from '@/pages/players';
import { Attendance } from '@/pages/attendance';
import { Matches } from '@/pages/matches';
import { Goals } from '@/pages/goals';
import { Cards } from '@/pages/cards';
import { PlayingTime } from '@/pages/playing-time';
import { Teams } from '@/pages/teams';
import { Reports } from '@/pages/reports';
import { Lineup } from '@/pages/lineup';
import { PlayerProfile } from '@/pages/player-profile';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// The original app derived this from the Replit hostname (dynamic per-deploy
// subdomains); that lookup returns nothing on any other host (Vercel, etc.)
// and silently crashes the whole app before it renders. Just use the key.
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

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

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
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
        <ClerkQueryClientCacheInvalidator />
        <LanguageProvider>
          <TeamProvider>
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
              <Route path="/reports"><ProtectedRoute component={Reports} /></Route>
              <Route path="/matches/:matchId/lineup"><ProtectedRoute component={Lineup} /></Route>

              <Route component={NotFound} />
            </Switch>
          </TeamProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
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
