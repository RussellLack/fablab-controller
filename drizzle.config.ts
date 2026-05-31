import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Next.js convention: read from .env.local first, then .env.
// Drizzle-kit doesn't auto-load .env.local; we do it explicitly.
config({ path: '.env.local' });
config({ path: '.env' });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Prefer DIRECT_URL (session pooler, port 5432) for schema ops.
    // DATABASE_URL is the transaction pooler (port 6543) used at runtime — it
    // can't do drizzle-kit's introspection.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL!
  },
  verbose: true,
  strict: true
});
