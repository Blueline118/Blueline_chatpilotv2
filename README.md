# Blueline Chatpilot – Netlify Functions met Supabase RLS

Deze app gebruikt Netlify Functions die altijd de Supabase **anon key** combineren met de user-JWT van de ingelogde gebruiker. Hierdoor blijven alle Row Level Security (RLS) policies actief en is er nooit een service-role key nodig vanuit de frontend.

## Vereiste environment variabelen
Maak lokaal een `.env` met onderstaande variabelen. Configureer dezelfde waarden in het Netlify dashboard.

```bash
SUPABASE_URL="https://<project>.supabase.co"
SUPABASE_ANON_KEY="<public-anon-key>"
ALLOWED_ORIGINS="https://bluelineccs.nl,https://<live-site>.netlify.app,http://localhost:8888,http://localhost:5173"
```

> Gebruik **nooit** de `SUPABASE_SERVICE_ROLE_KEY` voor deze functies. Alle requests krijgen het user-token mee via de `Authorization: Bearer <access_token>` header.

## Netlify Functions
De map [`netlify/functions`](netlify/functions) bevat o.a.:

- `getProfile.ts` – geeft het huidige profiel terug.
- `listMemberships.ts` – toont memberships (optioneel gefilterd op `org_id`).
- `updateMemberRole.ts` – wijzigt een rol via de `update_member_role` RPC en logt audit events.
- `deleteMember.ts` – verwijdert een lid via de `delete_member` RPC met audit logging.

Alle functies ondersteunen CORS/OPTIONS en accepteren alleen requests met een geldige Bearer token afkomstig van `supabase.auth.getSession()`.

## Frontend gebruik
De Members-admin gebruikt `/.netlify/functions/*` endpoints en stuurt automatisch de `Authorization` header mee. Rollen wijzigen of verwijderen triggert audit logging in Supabase.

## Lokaal draaien en testen
1. Installeer dependencies: `npm install`
2. Start Netlify dev-server (frontend + functies):
   ```bash
   netlify dev
   ```
3. Test een endpoint met een geldige Supabase user access token:
   ```bash
   curl -i -H "Authorization: Bearer <USER_ACCESS_TOKEN>" http://localhost:8888/.netlify/functions/getProfile
   curl -i -H "Authorization: Bearer <USER_ACCESS_TOKEN>" "http://localhost:8888/.netlify/functions/listMemberships?org_id=<uuid>"
   ```
4. Bouwcontrole voor de frontend:
   ```bash
   npm run build
   ```

Als je een andere origin gebruikt tijdens ontwikkeling, voeg die dan toe aan `ALLOWED_ORIGINS`.
