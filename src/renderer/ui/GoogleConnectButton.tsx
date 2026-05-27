import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { GoogleStatusDTO } from '@shared/types';
import { Button } from './Button';

export function GoogleConnectButton() {
  const api = useRemirror();
  const [status, setStatus] = useState<GoogleStatusDTO | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setStatus(await api.googleStatus());
  }

  useEffect(() => {
    refresh();
    const off = api.onGoogleStatusChanged(setStatus);
    return off;
  }, [api]);

  async function handleConnect() {
    setBusy(true);
    try {
      await api.googleConnect();
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await api.googleDisconnect();
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh() {
    setBusy(true);
    try {
      await api.calendarRefresh();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <div className="text-muted text-sm">Loading…</div>;

  return (
    <div className="bg-surface rounded-lg p-4 border border-[rgba(250,247,240,0.07)]">
      <h4 className="text-sm font-semibold text-text mb-2">Google Calendar</h4>
      {status.connected ? (
        <>
          <p className="text-xs text-muted mb-3">
            Connected. {status.syncedAt ? `Last synced ${new Date(status.syncedAt).toLocaleTimeString()}.` : 'Sync pending.'}
            {status.lastError && <span className="text-sand"> ⚠ {status.lastError}</span>}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleRefresh} disabled={busy}>Refresh now</Button>
            <Button variant="ghost" onClick={handleDisconnect} disabled={busy}>Disconnect</Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted mb-3">
            Not connected. Connecting lets Remirror show what you planned alongside what you did.
            All data stays local. Setup instructions are in the project README.
          </p>
          <Button onClick={handleConnect} disabled={busy}>{busy ? 'Connecting…' : 'Connect Google Calendar'}</Button>
        </>
      )}
    </div>
  );
}
