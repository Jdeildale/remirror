import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { DailyStatsDTO, ProjectBreakdownDTO, CalendarEventDTO, WeeklyGoalDTO } from '@shared/types';
import { TruthHeadline } from './TruthHeadline';
import { StatCard } from './StatCard';
import { CalendarTodayList } from './CalendarTodayList';
import { ForwardNudge } from './ForwardNudge';
import { ProjectBreakdown } from './ProjectBreakdown';

function fmtHours(ms: number): string {
  return (ms / 3_600_000).toFixed(1);
}

function generateNudgeText(
  goal: WeeklyGoalDTO | null,
  breakdown: ProjectBreakdownDTO[],
  anySessionsToday: boolean,
): string | null {
  // Mirror the logic in src/main/copy/forward-nudge.ts but executed renderer-side
  // for now. (Phase 2b/4 can move this to main if needed for Claude.)
  if (goal) {
    const matched = breakdown.find(b => b.label === goal.projectLabel);
    const progressMs = matched?.totalMs ?? 0;
    const fmt = (ms: number) => {
      const total = Math.floor(ms / 60_000);
      const h = Math.floor(total / 60);
      const m = total % 60;
      return h === 0 ? `${m}m` : `${h}h ${m}m`;
    };
    return `You said ${goal.text}. You've done ${fmt(progressMs)} on it. Your next 90 minutes is the easiest place to close the gap.`;
  }
  if (!anySessionsToday) return null;
  // top project = first in breakdown (already sorted desc by totalMs)
  const top = breakdown.find(b => b.label !== 'unclassified');
  if (!top) return null;
  return `You've returned to ${top.label} ${top.returnCount} times today. That's where your brain keeps wanting to land.`;
}

export function StoryColumn() {
  const api = useRemirror();
  const [stats, setStats] = useState<DailyStatsDTO | null>(null);
  const [breakdown, setBreakdown] = useState<ProjectBreakdownDTO[]>([]);
  const [events, setEvents] = useState<CalendarEventDTO[]>([]);
  const [goal, setGoal] = useState<WeeklyGoalDTO | null>(null);

  async function refresh() {
    const [s, bd, ev, g] = await Promise.all([
      api.todayStatsV2(),
      api.projectBreakdown(),
      api.calendarListToday(),
      api.getGoal(),
    ]);
    setStats(s);
    setBreakdown(bd);
    setEvents(ev);
    setGoal(g);
  }

  useEffect(() => {
    refresh();
    const off = api.onSessionsChanged(refresh);
    const interval = setInterval(refresh, 5000);
    return () => { off(); clearInterval(interval); };
  }, [api]);

  if (!stats) return <div className="text-muted p-6">Loading…</div>;

  const anySessions = stats.switchesCount > 0;
  const nudge = generateNudgeText(goal, breakdown, anySessions);

  return (
    <div className="p-6 border-r border-[#312d28] overflow-auto">
      <TruthHeadline stats={stats} />

      <div className="grid grid-cols-2 gap-2 mb-5">
        <StatCard label="Focus blocks ≥20m" value={stats.focusBlocksCount} emphasize />
        <StatCard label="Window switches" value={stats.switchesCount} />
        <StatCard label="Focused hours" value={fmtHours(stats.focusedMs)} emphasize />
        <StatCard label="Time elsewhere" value={fmtHours(stats.elsewhereMs)} />
      </div>

      <CalendarTodayList events={events} />

      <ForwardNudge text={nudge} />

      <ProjectBreakdown entries={breakdown} />
    </div>
  );
}
