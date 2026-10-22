import { db } from './db.js';
import { logger } from './http.js';
import { markNoShows } from './services/attendance.js';
export function startAttendanceJob() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      // System task discovers tenant IDs, then performs all work within each tenant.
      const organizations = await db.organization.findMany({ select: { id: true } });
      for (const org of organizations) await markNoShows(org.id);
    } catch (err) {
      logger.error({ err }, 'Attendance job failed');
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => {
    void run();
  }, 60000);
  timer.unref();
  return () => clearInterval(timer);
}
