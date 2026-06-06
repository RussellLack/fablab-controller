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
  // Supabase pooler in transaction mode — `prepare: false` is required.
  //
  // Pool sizing: we use `max: 5` so a single request can fan-out to a
  // handful of parallel queries (the Today view runs ~11 small queries
  // via Promise.all). The previous `max: 1` serialised them all on one
  // connection and tipped the page over Netlify's edge-wrapper timeout
  // once we added the Today STATS aggregates and the awaiting-
  // confirmation queue. Supabase transaction-pooler connections are
  // short-lived so the per-instance ceiling here stays well inside
  // any plan's connection budget.
  //
  // `idle_timeout` releases warm connections that have been unused for
  // a while; `connect_timeout` keeps a slow DNS / network hiccup from
  // hanging the page indefinitely.
  return postgres(connectionString, {
    prepare: false,
    max: 5,
    idle_timeout: 30,
    connect_timeout: 10
  });
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
