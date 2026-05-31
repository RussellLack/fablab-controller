/**
 * One-shot setup script — applies the SQL bits that Drizzle migrations
 * don't generate automatically:
 *   1. The booking exclusion constraint (Postgres GIST)
 *   2. The handle_new_user trigger that mirrors auth.users → public.users on first sign-in
 *
 * Idempotent: safe to re-run. Each statement uses IF NOT EXISTS / OR REPLACE.
 *
 * Run after `npm run db:migrate` (or `db:push` in dev):
 *   npm run db:setup
 */

// Next.js convention: read from .env.local first, then .env.
// tsx doesn't auto-load .env.local; we do it explicitly.
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import postgres from 'postgres';

async function main() {
  // Prefer DIRECT_URL (session pooler) for DDL; fall back to DATABASE_URL.
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');

  const sql = postgres(connectionString, { prepare: false, max: 1 });

  console.log('🔧 Setting up Postgres extensions, constraints, and triggers…');

  // 1. Enable btree_gist (required for exclusion constraints with equality + range)
  await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS btree_gist;`);
  console.log('   ✓ btree_gist extension enabled');

  // 2. Booking exclusion constraint — prevents overlapping bookings on the same equipment
  try {
    await sql.unsafe(`
      ALTER TABLE bookings
        DROP CONSTRAINT IF EXISTS bookings_no_overlap;
    `);
    await sql.unsafe(`
      ALTER TABLE bookings
        ADD CONSTRAINT bookings_no_overlap
        EXCLUDE USING gist (
          equipment_id WITH =,
          tstzrange(starts_at, ends_at) WITH &&
        ) WHERE (status IN ('scheduled', 'in_progress'));
    `);
    console.log('   ✓ bookings_no_overlap exclusion constraint added');
  } catch (e) {
    console.warn('   ⚠ bookings_no_overlap not added (table may not exist yet):', (e as Error).message);
  }

  // 3. handle_new_user trigger — auto-create public.users row on auth signup
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      INSERT INTO public.users (id, email, name, roles, language_pref)
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        ARRAY['project_lead']::text[],
        'no'
      )
      ON CONFLICT (id) DO NOTHING;
      RETURN NEW;
    END;
    $$;
  `);

  await sql.unsafe(`DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;`);
  await sql.unsafe(`
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
  `);
  console.log('   ✓ handle_new_user trigger installed');

  // 4. Backfill any auth.users that don't yet have a public.users row
  const backfilled = await sql.unsafe(`
    INSERT INTO public.users (id, email, name, roles, language_pref)
    SELECT id, email,
      COALESCE(raw_user_meta_data->>'full_name', email),
      ARRAY['project_lead']::text[],
      'no'
    FROM auth.users
    WHERE id NOT IN (SELECT id FROM public.users)
    RETURNING id;
  `);
  if (backfilled.length > 0) {
    console.log(`   ✓ Backfilled ${backfilled.length} public.users row(s)`);
  }

  console.log('✅ Setup complete.');
  await sql.end();
  process.exit(0);
}

main().catch(e => { console.error('❌ Setup failed:', e); process.exit(1); });
