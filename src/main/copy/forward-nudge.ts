export interface WeeklyGoal {
  text: string;
  projectLabel?: string;
}

export interface NudgeContext {
  goal: WeeklyGoal | null;
  goalProgressMs: number;
  goalTargetMs: number;
  topProjectToday: { label: string; returnCount: number } | null;
  anySessionsToday: boolean;
}

function fmtHours(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function generateForwardNudge(ctx: NudgeContext): string | null {
  if (ctx.goal) {
    const onPace = ctx.goalTargetMs > 0 && ctx.goalProgressMs / ctx.goalTargetMs >= 0.85;
    const progress = fmtHours(ctx.goalProgressMs);
    if (onPace) {
      return `You said ${ctx.goal.text}. You've done ${progress} toward it. You're tracking ahead — keep the current rhythm.`;
    }
    return `You said ${ctx.goal.text}. You've done ${progress} on it. Your next 90 minutes is the easiest place to close the gap.`;
  }

  if (!ctx.anySessionsToday || !ctx.topProjectToday) {
    return null;
  }

  return `You've returned to ${ctx.topProjectToday.label} ${ctx.topProjectToday.returnCount} times today. That's where your brain keeps wanting to land.`;
}
