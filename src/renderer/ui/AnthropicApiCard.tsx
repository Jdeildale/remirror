import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { AnthropicStatusDTO } from '@shared/types';
import { Button } from './Button';
import { Input } from './Input';
import { MODEL_IDS, MODEL_LABELS, MODEL_COST_ESTIMATE_USD, type ModelKey } from '@shared/anthropic-models';

const MODEL_OPTIONS: Array<{ key: ModelKey; id: string; label: string; cost: number }> = (Object.keys(MODEL_IDS) as ModelKey[]).map(k => ({
  key: k, id: MODEL_IDS[k], label: MODEL_LABELS[k], cost: MODEL_COST_ESTIMATE_USD[k],
}));

export function AnthropicApiCard() {
  const api = useRemirror();
  const [status, setStatus] = useState<AnthropicStatusDTO | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() { setStatus(await api.anthropicStatus()); }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const s = await api.anthropicStatus();
      if (mounted) setStatus(s);
    })();
    return () => { mounted = false; };
  }, [api]);

  async function saveKey() {
    if (!draftKey.trim()) return;
    setBusy(true);
    try {
      await api.anthropicSetKey(draftKey.trim());
      setDraftKey('');
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, error: msg });
    } finally {
      setBusy(false);
    }
  }
  async function clearKey() {
    setBusy(true);
    try {
      await api.anthropicClearKey();
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, error: msg });
    } finally {
      setBusy(false);
    }
  }
  async function changeModel(id: string) {
    setBusy(true);
    try {
      await api.anthropicSetModel(id);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, error: msg });
    } finally {
      setBusy(false);
    }
  }
  async function runTest() {
    setBusy(true);
    setTestResult(null);
    try {
      setTestResult(await api.anthropicTest());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, error: msg });
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <div className="text-muted text-sm">Loading…</div>;

  const selected = MODEL_OPTIONS.find(m => m.id === status.model) ?? MODEL_OPTIONS[0];

  return (
    <div className="bg-surface rounded-lg p-4 border border-[rgba(250,247,240,0.07)]">
      <h4 className="text-sm font-semibold text-text mb-2">Anthropic API</h4>
      <p className="text-xs text-muted mb-3 max-w-2xl leading-relaxed">
        Your Anthropic API key powers the Daily Brief. Stored locally via Electron safeStorage — never sent to any third party.
      </p>

      {status.hasKey ? (
        <div className="text-xs text-muted mb-3">&#10003; Key stored. <button className="underline text-text" onClick={clearKey} disabled={busy}>Clear</button></div>
      ) : (
        <div className="flex gap-2 items-center mb-3">
          <Input
            type="password"
            placeholder="sk-ant-api03-…"
            value={draftKey}
            onChange={e => setDraftKey(e.target.value)}
            className="flex-1"
          />
          <Button onClick={saveKey} disabled={!draftKey.trim() || busy}>Save</Button>
        </div>
      )}

      <div className="mb-3">
        <label className="text-xs text-muted block mb-1">Model</label>
        <select
          className="w-full bg-bg text-text rounded-md px-3 py-2 outline-none ring-1 ring-transparent focus:ring-accent"
          value={status.model}
          onChange={e => changeModel(e.target.value)}
          disabled={busy}
        >
          {MODEL_OPTIONS.map(m => (
            <option key={m.id} value={m.id}>{m.label} (~${m.cost.toFixed(3)}/brief)</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 items-center">
        <Button variant="ghost" onClick={runTest} disabled={!status.hasKey || busy}>Test connection</Button>
        {testResult?.ok && <span className="text-accent text-xs">&#10003; Connected. Test brief generation cost: ~${selected.cost.toFixed(3)} per brief.</span>}
        {testResult && !testResult.ok && <span className="text-sand text-xs">&#9888; {testResult.error}</span>}
      </div>
    </div>
  );
}
