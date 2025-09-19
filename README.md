# Blueline Chatpilot

Blueline Chatpilot gebruikt Netlify Functions als beveiligde proxy richting Supabase. Alle ledenbeheer-acties (lijst, rol aanpassen, verwijderen) gaan via deze laag en sturen het Supabase user-JWT als `Authorization: Bearer ...` mee zodat Row Level Security (RLS) altijd wordt afgedwongen in development, deploy previews en productie.

## Netlify & Supabase configuratie

| Variabele              | Contexten                                | Opmerkingen |
| ---------------------- | ---------------------------------------- | ----------- |
| `SUPABASE_URL`         | Production, Deploy Preview, Netlify CLI  | Supabase project URL |
| `SUPABASE_ANON_KEY`    | Production, Deploy Preview, Netlify CLI  | Publieke (anon) API key |

> Zorg dat **niet** de service-role key wordt gebruikt in clients of Netlify Functions. De functions injecteren automatisch de user access token in `Authorization` zodat Supabase RLS policies blijven gelden.

Netlify bundelt de functions met esbuild (`netlify.toml`) en verwacht de bronbestanden in `netlify/functions/`. Wanneer je lokaal via `netlify dev` draait, zet dezelfde env vars in `.env` of je shell.

## Smoke test voor RLS

`scripts/smoke-rls.mjs` verifieert de kritieke paden:

1. Admin kan via `/updateMemberRole` een rol wijzigen (200).
2. Niet-admin en requests zonder token krijgen een 401/403.
3. Admin kan `/deleteMember` aanroepen (optioneel te skippen).
4. Een OPTIONS-preflight geeft CORS-headers terug.

Gebruik:

```bash
export ADMIN_ACCESS_TOKEN="<admin_jwt>"
export USER_ACCESS_TOKEN="<member_jwt>"
export ORG_ID="<org_uuid>"
export TARGET_USER_ID="<target_user_uuid>"
# Optioneel:
# export RLS_BASE_URL="https://deploy-preview-123--example.netlify.app/.netlify/functions"
# export RLS_SKIP_DELETE=1   # sla delete rooktest over
# export RLS_ROLE=TEAM       # gewenste rol voor de update rooktest

node scripts/smoke-rls.mjs
```

De `BASE_URL` wijst standaard naar `http://localhost:9999/.netlify/functions` zodat de test zowel tegen `netlify dev` als tegen een deploy preview kan draaien.

## Lokale ontwikkeling

```bash
npm install
npm run dev
```

Configureer je lokale Supabase connectie via een `.env.local` voor Vite:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

De UI gebruikt `netlifyJson()` helpers om ledenbeheer-acties naar `/.netlify/functions/*` te sturen; val niet terug op directe Supabase-mutaties zodat RLS gehandhaafd blijft.
