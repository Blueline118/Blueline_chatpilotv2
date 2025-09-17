# Rollenbeheer fix checklist

## Migraties uitvoeren in Supabase Studio
1. Open [Supabase Studio](https://supabase.com/dashboard) voor het project.
2. Ga naar **SQL Editor** → **New query**.
3. Plak de inhoud van `supabase/migrations/01_memberships_policies.sql` en voer de query uit.
4. Plak daarna de inhoud van `supabase/migrations/02_memberships_rpcs.sql` en voer ook deze uit.
5. Controleer onder **Authentication → Policies** dat de nieuwe UPDATE/DELETE policies actief zijn.

> Let op: de functie `public.is_org_admin` mag niet worden gewijzigd of verwijderd.

## Verificatiescript draaien
1. Zet de volgende variabelen in je shell:
   ```bash
   export SUPABASE_URL=...              # Project URL
   export SUPABASE_ANON_KEY=...         # Anon/public API key
   export SUPABASE_SERVICE_ROLE_KEY=... # Service role key
   ```
2. Installeer dependencies (eenmalig):
   ```bash
   npm install
   ```
3. Run het script:
   ```bash
   node scripts/verify-admin-actions.mjs
   ```

Het script controleert:
- ✅ Admin kan de rol van het TEAM-lid bijwerken.
- ✅ Customer krijgt een 403 bij dezelfde actie.
- ✅ Admin kan de CUSTOMER verwijderen (en het script zet het lid weer terug).

## Acceptatie
- Admin kan in de UI rollen wijzigen en leden verwijderen; de lijst ververst zonder foutmeldingen.
- Team en Customer accounts kunnen deze acties niet uitvoeren (403 via RPC, knoppen verborgen).
