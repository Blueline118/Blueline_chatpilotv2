Korte stappen:

supabase db reset

supabase db connect en voer:
\\i scripts/db-diagnose-delete.sql

Verwacht: alleen policy admin_delete_membership voor DELETE, en security_definer = false voor delete_member(uuid,uuid).
