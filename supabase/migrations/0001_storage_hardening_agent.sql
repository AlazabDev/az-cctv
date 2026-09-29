-- Applied to project jdnbtjplzbatowzbxqis via MCP (fix_storage_and_function_hardening)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('floorplans','floorplans',false,20971520,
        ARRAY['image/png','image/jpeg','image/webp','image/svg+xml','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public=false, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;

ALTER FUNCTION public.touch_updated_at() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_user_id_change() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'user_id is immutable'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER cctv_projects_lock_owner BEFORE UPDATE ON public.cctv_projects FOR EACH ROW EXECUTE FUNCTION public.prevent_user_id_change();
CREATE INDEX IF NOT EXISTS cctv_projects_user_updated_idx ON public.cctv_projects (user_id, updated_at DESC);

-- agent_threads / agent_messages: see live schema (RLS: owner-only; messages require owned thread)
