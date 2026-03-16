// Clamp interval to 15–1440 minutes
const MIN_INTERVAL = 15;
const MAX_INTERVAL = 1440;

let timerHandle: ReturnType<typeof setInterval> | null = null;

export async function startScheduler(): Promise<void> {
  if (timerHandle) return;

  let intervalMinutes = parseInt(process.env.COLLECT_INTERVAL_MINUTES || '60', 10);
  if (isNaN(intervalMinutes) || intervalMinutes < MIN_INTERVAL) intervalMinutes = MIN_INTERVAL;
  if (intervalMinutes > MAX_INTERVAL) intervalMinutes = MAX_INTERVAL;

  const intervalMs = intervalMinutes * 60 * 1000;

  async function runCollect() {
    console.log(`[Scheduler] Collecting snapshots (every ${intervalMinutes} min)...`);
    try {
      const { collectAll } = await import('./collector');
      const result = await collectAll();
      console.log(`[Scheduler] Done: ${result.totalSuccess} items collected`);
    } catch (err) {
      console.error('[Scheduler] Error:', err);
    }
  }

  timerHandle = setInterval(runCollect, intervalMs);
  console.log(`[Scheduler] Started: collecting every ${intervalMinutes} minutes`);
}

export function stopScheduler(): void {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}
