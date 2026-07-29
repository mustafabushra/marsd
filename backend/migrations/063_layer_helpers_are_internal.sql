-- Migration: 063_layer_helpers_are_internal.sql
-- Purpose: trust_layer_official and trust_layer_platform, added in 062, answer
--          an unauthenticated caller.
--
-- A function created without an explicit GRANT gets Postgres's default, which is
-- EXECUTE to PUBLIC — and PUBLIC includes anon. Both are SECURITY DEFINER, so
-- RLS does not apply, and both take a company id: anyone could read a company's
-- official and platform sub-scores without an account, minutes after 059 closed
-- the registry.
--
-- probe-anon-rpc caught it on the first run after 062. That is the check working
-- as intended — it found my own mistake, in the migration I had just written,
-- before anyone else saw it.
--
-- Neither is called from the application. compute_trust_score calls them, and it
-- runs as the owner, so revoking the browser's grant costs nothing.

revoke all on function public.trust_layer_official(uuid)  from public, anon, authenticated;
revoke all on function public.trust_layer_platform(uuid)  from public, anon, authenticated;

do $blk$
declare v_n int;
begin
  select count(*) into v_n
    from information_schema.role_routine_grants
   where routine_schema = 'public'
     and grantee in ('anon', 'authenticated', 'PUBLIC')
     and routine_name in ('trust_layer_official', 'trust_layer_platform');
  if v_n > 0 then
    raise exception 'ما زالت % صلاحية قائمة على دوال الطبقات', v_n;
  end if;

  -- And the score itself must still compute, since it calls them.
  perform public.compute_trust_score(id) from public.companies limit 1;
  raise notice '✅ دوال الطبقات داخلية · الاحتساب يعمل';
end $blk$;
