-- Reproducible schema for AI assistant and CCTV design proposals.

CREATE TABLE IF NOT EXISTS public.agent_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  project_id UUID REFERENCES public.cctv_projects(id) ON DELETE CASCADE,
  layout_id UUID REFERENCES public.cctv_layouts(id) ON DELETE CASCADE,
  title TEXT,
  last_response_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.agent_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content TEXT NOT NULL,
  response_id TEXT,
  agent_name TEXT,
  agent_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_design_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  project_id UUID NOT NULL REFERENCES public.cctv_projects(id) ON DELETE CASCADE,
  layout_id UUID REFERENCES public.cctv_layouts(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.agent_threads(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','applied','rejected','superseded')),
  cameras JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  iterations INTEGER NOT NULL DEFAULT 0 CHECK (iterations >= 0),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_design_proposals TO authenticated;
GRANT ALL ON public.agent_threads, public.agent_messages, public.agent_design_proposals TO service_role;

ALTER TABLE public.agent_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_design_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own agent threads select" ON public.agent_threads;
CREATE POLICY "own agent threads select" ON public.agent_threads
FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own agent threads insert" ON public.agent_threads;
CREATE POLICY "own agent threads insert" ON public.agent_threads
FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND (project_id IS NULL OR EXISTS (
    SELECT 1 FROM public.cctv_projects p WHERE p.id = project_id AND p.user_id = auth.uid()
  ))
  AND (layout_id IS NULL OR EXISTS (
    SELECT 1 FROM public.cctv_layouts l WHERE l.id = layout_id AND l.user_id = auth.uid()
  ))
);
DROP POLICY IF EXISTS "own agent threads update" ON public.agent_threads;
CREATE POLICY "own agent threads update" ON public.agent_threads
FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own agent threads delete" ON public.agent_threads;
CREATE POLICY "own agent threads delete" ON public.agent_threads
FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own agent messages select" ON public.agent_messages;
CREATE POLICY "own agent messages select" ON public.agent_messages
FOR SELECT TO authenticated USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.agent_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "own agent messages insert" ON public.agent_messages;
CREATE POLICY "own agent messages insert" ON public.agent_messages
FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.agent_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "own agent messages update" ON public.agent_messages;
CREATE POLICY "own agent messages update" ON public.agent_messages
FOR UPDATE TO authenticated USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.agent_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()
  )
) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own agent messages delete" ON public.agent_messages;
CREATE POLICY "own agent messages delete" ON public.agent_messages
FOR DELETE TO authenticated USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.agent_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "own design proposals select" ON public.agent_design_proposals;
CREATE POLICY "own design proposals select" ON public.agent_design_proposals
FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own design proposals insert" ON public.agent_design_proposals;
CREATE POLICY "own design proposals insert" ON public.agent_design_proposals
FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.cctv_projects p WHERE p.id = project_id AND p.user_id = auth.uid()
  )
  AND (layout_id IS NULL OR EXISTS (
    SELECT 1 FROM public.cctv_layouts l WHERE l.id = layout_id AND l.user_id = auth.uid()
  ))
);
DROP POLICY IF EXISTS "own design proposals update" ON public.agent_design_proposals;
CREATE POLICY "own design proposals update" ON public.agent_design_proposals
FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own design proposals delete" ON public.agent_design_proposals;
CREATE POLICY "own design proposals delete" ON public.agent_design_proposals
FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS agent_threads_user_updated_idx
  ON public.agent_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_threads_project_idx
  ON public.agent_threads(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_threads_layout_idx
  ON public.agent_threads(layout_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_messages_thread_created_idx
  ON public.agent_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS agent_design_proposals_project_created_idx
  ON public.agent_design_proposals(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_design_proposals_layout_created_idx
  ON public.agent_design_proposals(layout_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_design_proposals_status_idx
  ON public.agent_design_proposals(user_id, status, created_at DESC);

DROP TRIGGER IF EXISTS agent_threads_touch ON public.agent_threads;
CREATE TRIGGER agent_threads_touch
BEFORE UPDATE ON public.agent_threads
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS agent_threads_lock_owner ON public.agent_threads;
CREATE TRIGGER agent_threads_lock_owner
BEFORE UPDATE ON public.agent_threads
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_id_change();
DROP TRIGGER IF EXISTS agent_messages_lock_owner ON public.agent_messages;
CREATE TRIGGER agent_messages_lock_owner
BEFORE UPDATE ON public.agent_messages
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_id_change();
DROP TRIGGER IF EXISTS agent_design_proposals_lock_owner ON public.agent_design_proposals;
CREATE TRIGGER agent_design_proposals_lock_owner
BEFORE UPDATE ON public.agent_design_proposals
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_id_change();

-- Backfill missing columns if these tables already existed in the live project.
ALTER TABLE public.agent_threads ADD COLUMN IF NOT EXISTS layout_id UUID REFERENCES public.cctv_layouts(id) ON DELETE CASCADE;
ALTER TABLE public.agent_design_proposals ADD COLUMN IF NOT EXISTS layout_id UUID REFERENCES public.cctv_layouts(id) ON DELETE CASCADE;
ALTER TABLE public.agent_design_proposals ADD COLUMN IF NOT EXISTS metrics JSONB NOT NULL DEFAULT '{}'::jsonb;
