import React, { createContext, useContext, useState, useEffect } from 'react';
import { useListTeams, getListTeamsQueryKey } from '@workspace/api-client-react';
import { useAuth } from '@clerk/react';

interface TeamContextType {
  activeTeamId: number | null;
  setActiveTeamId: (id: number | null) => void;
  isLoading: boolean;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const [activeTeamId, setActiveTeamIdState] = useState<number | null>(() => {
    const saved = localStorage.getItem('coach_active_team');
    return saved ? parseInt(saved, 10) : null;
  });

  const setActiveTeamId = (id: number | null) => {
    setActiveTeamIdState(id);
    if (id) {
      localStorage.setItem('coach_active_team', id.toString());
    } else {
      localStorage.removeItem('coach_active_team');
    }
  };

  // Only fetch teams once Clerk has loaded and the user is signed in.
  // Without this gate the request fires on the public landing page and
  // during Clerk's startup — before an auth token exists — producing 401s
  // and caching an empty result that made pages think there was no team.
  const { isLoaded, isSignedIn } = useAuth();
  // If we have an active team but it's not in the list, or if we don't have one and there are teams,
  // we auto-select the first one.
  const { data: teams, isLoading: teamsLoading } = useListTeams({
    query: { enabled: isLoaded && !!isSignedIn, queryKey: getListTeamsQueryKey() },
  });
  // Report "loading" until auth has resolved AND (if signed in) teams have
  // arrived, so pages show a spinner instead of a premature empty state.
  const isLoading = !isLoaded || (!!isSignedIn && teamsLoading);

  useEffect(() => {
    if (!isLoading && teams) {
      if (teams.length > 0) {
        const teamExists = teams.some(t => t.id === activeTeamId);
        if (!teamExists) {
          setActiveTeamId(teams[0].id);
        }
      } else {
        setActiveTeamId(null);
      }
    }
  }, [teams, isLoading, activeTeamId]);

  return (
    <TeamContext.Provider value={{ activeTeamId, setActiveTeamId, isLoading }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
}
