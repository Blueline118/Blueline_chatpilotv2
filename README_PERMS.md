# Permission Test Guide

Deze repository bevat een permissietestscript om de nieuwe RLS-policies en RPC's te valideren.

## Stappenplan

1. Start de lokale stack:
   ```bash
   supabase start
   ```
2. Reset de database met de nieuwste migraties en seeds:
   ```bash
   supabase db reset
   ```
3. (Optioneel) Controleer de database via `psql` of `supabase db connect`.
4. Voer de permissietests uit:
   ```bash
   node scripts/test-perms.mjs
   ```

Alle testcases zouden als `PASS` moeten loggen en het script sluit af met `All permission tests passed`.

## Seeds voor lokale ontwikkeling

De seed `supabase/seed/roles.sql` maakt drie testgebruikers met rollen aan. Hosted Supabase-projecten laten geen directe inserts in `auth.users` toe; deze seeds zijn bedoeld voor een lokale ontwikkelomgeving die via `supabase start` draait.
