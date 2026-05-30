import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Lazy DB client.
 *
 * The connection isn't established at module-load time — that lets
 * `next build` succeed without a DATABASE_URL set (CI type-check, etc).
 * Pages already guard `if (!process.env.DATABASE_URL) return []`,
 * so the build step never actually connects.
 *
 * At runtime, the first DB call throws cleanly via postgres-js if
 * DATABASE_URL is missing or malformed.
 */
function makeClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — DB calls require a Supabase connection string');
  }
  // Supabase pooler in transaction mode — appropriate for serverless functions.
  // prepare: false is required when using Supabase's transaction pooler.
  return postgres(connectionString, { prepare: false, max: 1 });
}

// Cache the client across requests in the same function instance.
let _client: ReturnType<typeof makeClient> | null = null;
function getClient() {
  if (!_client) _client = makeClient();
  return _client;
}

// Drizzle wraps the client lazily — the proxy intercepts the first query
// and instantiates the underlying postgres client only then.
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    const real = drizzle(getClient(), { schema });
    return Reflect.get(real, prop, real);
  }
});

export type DB = typeof db;
export * from './schema';
