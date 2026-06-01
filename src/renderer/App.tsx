import React, { useEffect, useState } from 'react';
import { Onboarding } from './routes/Onboarding';
import { Status } from './routes/Status';
import { useRemirror } from './hooks/useRemirror';

type Route = 'loading' | 'onboarding' | 'status';
type Tab = 'today' | 'brief' | 'projects' | 'exclusions' | 'schedule';

export function App() {
  const api = useRemirror();
  const [route, setRoute] = useState<Route>('loading');
  const [tab, setTab] = useState<Tab>('today');

  useEffect(() => {
    api.isOnboardingNeeded().then(needed => setRoute(needed ? 'onboarding' : 'status'));
    const off = api.onNavigate((r) => {
      if (r === 'settings:projects') setTab('projects');
      else if (r === 'settings:exclusions') setTab('exclusions');
      else if (r === 'settings:schedule') setTab('schedule');
      else setTab('today');
    });
    return off;
  }, [api]);

  if (route === 'loading') {
    return <div className="flex items-center justify-center h-full text-muted">Loading…</div>;
  }
  if (route === 'onboarding') {
    return <Onboarding onComplete={() => { api.completeOnboarding(); setRoute('status'); }} />;
  }
  return <Status tab={tab} onTabChange={setTab} />;
}
