import 'dotenv/config';
import { z } from 'zod';
const env = z
  .object({
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32),
    // Comma-separated list of allowed browser origins.
    CLIENT_ORIGIN: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  })
  // API_PORT wins over PORT so tools that inject PORT for the client dev server don't hijack the API.
  .parse({ ...process.env, PORT: process.env.API_PORT ?? process.env.PORT });

const CLIENT_ORIGINS = env.CLIENT_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const config = { ...env, CLIENT_ORIGINS };
