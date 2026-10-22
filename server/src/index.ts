import { app } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { logger } from './http.js';
const server = app.listen(config.PORT, () =>
  logger.info({ port: config.PORT }, 'ShiftSync is running'),
);
const shutdown = () => {
  server.close(() => {
    void db.$disconnect().then(() => process.exit(0));
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
