import { db } from './db.js';
import { logger } from './http.js';
import { processEmailOutbox } from './services/email.js';
import { markNoShows } from './services/attendance.js';

// One pass of each background task. A long-running server calls these on a timer;
// serverless hosting (Vercel) calls them from the cron endpoint instead.
export async function runNoShowSweep() {
  // System task discovers tenant IDs, then performs all work within each tenant.
  const organizations = await db.organization.findMany({ select: { id: true } });
  for (const org of organizations) await markNoShows(org.id);
}
export async function runEmailSweep() {
  const organizations = await db.organization.findMany({ select: { id: true } });
  for (const org of organizations) await processEmailOutbox(org.id);
}

function every(intervalMs: number, task: () => Promise<void>, label: string) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await task();
    } catch (err) {
      logger.error({ err }, label + ' failed');
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => {
    void run();
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
export const startAttendanceJob = () => every(60000, runNoShowSweep, 'Attendance job');
export const startEmailJob = () => every(30000, runEmailSweep, 'Email job');
