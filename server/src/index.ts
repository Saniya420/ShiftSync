import { app } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { logger } from './http.js';
import { startAttendanceJob } from './jobs.js';
const stopJob = config.NODE_ENV === 'test' ? () => {} : startAttendanceJob();
const server = app.listen(config.PORT, () =>
  logger.info({ port: config.PORT }, 'ShiftSync is running'),
);
const shutdown = () => {
  stopJob();
  server.close(() => {
    void db.$disconnect().then(() => process.exit(0));
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
