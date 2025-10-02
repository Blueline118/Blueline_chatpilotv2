create or replace function public.audit_log_event(
  action text,
  org_id uuid,
  entity text,
  entity_id text,
  meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security invoker
as $$
begin
  insert into public.audit_logs(org_id, actor_user, action, target, meta)
  values (
    org_id,
    auth.uid(),
    action,
    jsonb_build_object('entity', entity, 'entity_id', entity_id),
    meta
  );
end;
$$;
