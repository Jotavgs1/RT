let cronJob: { stop: () => void } | null = null;

export async function startScheduler(): Promise<void> {
  if (cronJob) return;
  const intervalMinutes = parseInt(process.env.COLLECT_INTERVAL_MINUTES || '60', 10);
  if (intervalMinutes <= 0) return;

  const cron = await import('node-cron');
  const cronExpr = `*/${intervalMinutes} * * * *`;

  cronJob = cron.schedule(cronExpr, async () => {
    console.log(`[Scheduler] Collecting snapshots (every ${intervalMinutes} min)...`);
    try {
      const { collectAll } = await import('./collector');
      const result = await collectAll();
      console.log(`[Scheduler] Done: ${result.totalSuccess} items collected`);
    } catch (err) {
      console.error('[Scheduler] Error:', err);
    }
  });

  console.log(`[Scheduler] Started: collecting every ${intervalMinutes} minutes`);
}

export function stopScheduler(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
}
