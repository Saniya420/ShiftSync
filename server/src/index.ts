import { app } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { logger } from './http.js';
import { startAttendanceJob, startEmailJob } from './jobs.js';
const stopJob = config.NODE_ENV === 'test' ? () => {} : startAttendanceJob();
const stopEmailJob = config.NODE_ENV === 'test' ? () => {} : startEmailJob();
const server = app.listen(config.PORT, () =>
  logger.info({ port: config.PORT }, 'ShiftSync is running'),
);
const shutdown = () => {
  stopJob();
  stopEmailJob();
  server.close(() => {
    void db.$disconnect().then(() => process.exit(0));
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
