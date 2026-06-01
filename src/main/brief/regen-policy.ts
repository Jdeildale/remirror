/**
 * The user can regenerate the day's brief at most this many times after the
 * initial generation. After the cap, the button disables and the
 * "This is the brief. Sit with it." copy appears.
 */
export const USER_REGEN_CAP = 2;

/**
 * generation_count is 1-indexed: the initial generation increments it to 1.
 * Each user-initiated regen increments it by 1. Auto-regens for banned-vocab
 * or parse violations do NOT increment generation_count.
 */
export function canRegenerate(generationCount: number): boolean {
  const used = Math.max(0, generationCount - 1);
  return used < USER_REGEN_CAP;
}

export interface RegenStatus {
  used: number;
  cap: number;
  locked: boolean;
}

export function regenStatus(generationCount: number): RegenStatus {
  const used = Math.min(USER_REGEN_CAP, Math.max(0, generationCount - 1));
  return { used, cap: USER_REGEN_CAP, locked: used >= USER_REGEN_CAP };
}
