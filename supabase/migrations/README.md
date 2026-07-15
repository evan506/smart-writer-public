# Supabase Migrations

This project now reserves `supabase/migrations/` as the source-controlled home
for database schema changes.

Current status:

- The application has generated TypeScript DB types in `src/types/database.types.ts`.
- No SQL migration history was present in the repository before this directory was added.
- The first real migration should be a remote schema baseline exported from the active
  Supabase project, including tables, indexes, RLS policies, and RPC functions.

Recommended baseline command once Supabase CLI/project access is available:

```bash
supabase db dump --schema public > supabase/migrations/YYYYMMDDHHMMSS_baseline.sql
```

After that point, all DB changes should be added as new timestamped `.sql`
migrations instead of being applied only through the Supabase dashboard.
