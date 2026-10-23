// Applies pending Prisma migrations during the Vercel build.
// Migrations take session-level advisory locks, which a pooled (PgBouncer) URL does not
// support, so prefer the direct connection string when the host provides one.
import { execSync } from 'node:child_process';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set; cannot apply migrations.');
  process.exit(1);
}
execSync('npx prisma migrate deploy', {
  cwd: new URL('..', import.meta.url),
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});
