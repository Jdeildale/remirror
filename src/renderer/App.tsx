import React, { useEffect, useState } from 'react';
import { Onboarding } from './routes/Onboarding';
import { Status } from './routes/Status';
import { useRemirror } from './hooks/useRemirror';

type Route = 'loading' | 'onboarding' | 'status';

export function App() {
  const api = useRemirror();
  const [route, setRoute] = useState<Route>('loading');

  useEffect(() => {
    api.isOnboardingNeeded().then(needed => setRoute(needed ? 'onboarding' : 'status'));
  }, [api]);

  if (route === 'loading') {
    return <div className="flex items-center justify-center h-full text-muted">Loading…</div>;
  }
  if (route === 'onboarding') {
    return <Onboarding onComplete={() => { api.completeOnboarding(); setRoute('status'); }} />;
  }
  return <Status />;
}
