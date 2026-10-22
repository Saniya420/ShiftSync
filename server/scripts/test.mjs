import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config();
const url = process.env.TEST_DATABASE_URL ?? 'postgresql://shiftsync@localhost:5433/shiftsync_test';
const parsed = new URL(url);
if (parsed.pathname !== '/shiftsync_test')
  throw new Error('Tests require a database named shiftsync_test.');
const env = {
  ...process.env,
  DATABASE_URL: url,
  NODE_ENV: 'test',
  JWT_SECRET: 'test-only-secret-with-at-least-32-characters',
};
const run = (path, args) => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(path, import.meta.url)), ...args],
    { stdio: 'inherit', env },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run('../../node_modules/prisma/build/index.js', ['migrate', 'deploy']);
run('../../node_modules/vitest/vitest.mjs', ['run', '--configLoader', 'runner']);
