/** How tense the music should be, from 0 (calm) to 1 (one heart left and the train about to go). */
export const CALM_UNTIL = 30;

export function dangerLevel(hp: number, maxHp: number, timeLeft: number): number {
  const heart = maxHp > 1 ? Math.min(1, Math.max(0, (maxHp - hp) / (maxHp - 1))) : 0;
  const clock = Math.min(1, Math.max(0, (CALM_UNTIL - timeLeft) / CALM_UNTIL));
  return Math.min(1, heart * 0.7 + clock * 0.5);
}
