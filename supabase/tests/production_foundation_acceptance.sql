-- Production acceptance test for the normalized CCTV backend foundation.
-- Safe for a linked production database: every mutation is wrapped in one
-- transaction and rolled back. Any failed invariant raises an exception.

BEGIN;

SELECT set_config(
  'app.test_user_id',
  (SELECT user_id::text FROM public.cctv_projects ORDER BY created_at LIMIT 1),
  true
);
SELECT set_config(
  'app.test_project_id',
  (SELECT id::text FROM public.cctv_projects ORDER BY created_at LIMIT 1),
  true
);
SELECT set_config(
  'app.test_layout_id',
  (
    SELECT l.id::text
    FROM public.cctv_layouts l
    WHERE l.project_id = current_setting('app.test_project_id')::uuid
    ORDER BY l.sort_order, l.created_at
    LIMIT 1
  ),
  true
);

DO $$
BEGIN
  IF nullif(current_setting('app.test_user_id', true), '') IS NULL THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL: no cctv_projects row available for test';
  END IF;
  IF nullif(current_setting('app.test_layout_id', true), '') IS NULL THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL: selected project has no cctv_layouts row';
  END IF;
END;
$$;

-- -------------------------------------------------------------------------
-- RLS: owner can read the project/layout.
-- -------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('app.test_user_id'),
  true
);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.cctv_projects
    WHERE id = current_setting('app.test_project_id')::uuid
  ) THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL: project owner cannot read own project';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cctv_layouts
    WHERE id = current_setting('app.test_layout_id')::uuid
  ) THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL: project owner cannot read own layout';
  END IF;
END;
$$;

RESET ROLE;

-- -------------------------------------------------------------------------
-- RLS: unrelated authenticated user cannot read the project/layout.
-- -------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000099',
  true
);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.cctv_projects
    WHERE id = current_setting('app.test_project_id')::uuid
  ) THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL: unrelated user can read foreign project';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cctv_layouts
    WHERE id = current_setting('app.test_layout_id')::uuid
  ) THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL: unrelated user can read foreign layout';
  END IF;
END;
$$;

RESET ROLE;

-- -------------------------------------------------------------------------
-- RPC behaviour: snapshot + approve geometry + readiness guard.
-- All changes disappear at ROLLBACK.
-- -------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('app.test_user_id'),
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_layout_id uuid := current_setting('app.test_layout_id')::uuid;
  v_before integer;
  v_after integer;
  v_snapshot uuid;
  v_approval uuid;
  v_ready boolean;
BEGIN
  SELECT count(*) INTO v_before
  FROM public.cctv_layout_revisions
  WHERE layout_id = v_layout_id;

  v_snapshot := public.snapshot_cctv_layout(
    v_layout_id,
    'production-foundation-acceptance'
  );
  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL: snapshot_cctv_layout returned NULL';
  END IF;

  v_approval := public.approve_cctv_layout_geometry(
    v_layout_id,
    jsonb_build_object(
      'walls', jsonb_build_array(),
      'boundary', jsonb_build_array(),
      'openings', jsonb_build_array()
    ),
    100
  );
  IF v_approval IS NULL THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL: approve_cctv_layout_geometry returned NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cctv_layouts
    WHERE id = v_layout_id
      AND geometry_status = 'approved'
      AND px_per_meter = 100
  ) THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL: geometry approval did not persist expected state';
  END IF;

  SELECT count(*) INTO v_after
  FROM public.cctv_layout_revisions
  WHERE layout_id = v_layout_id;

  IF v_after <> v_before + 2 THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL: expected 2 new revisions, got %', v_after - v_before;
  END IF;

  -- Ensure readiness can be evaluated without permanently altering production.
  UPDATE public.cctv_layouts
  SET floorplan_path = COALESCE(floorplan_path, 'acceptance/rollback-plan.png')
  WHERE id = v_layout_id;

  v_ready := public.assert_layout_ready_for_design(v_layout_id);
  IF v_ready IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL: assert_layout_ready_for_design did not return true';
  END IF;
END;
$$;

RESET ROLE;

-- -------------------------------------------------------------------------
-- Project/layout invariants.
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.cctv_projects p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.cctv_layouts l WHERE l.project_id = p.id
    )
  ) THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL: at least one project has no layout';
  END IF;

  IF EXISTS (
    SELECT project_id
    FROM public.cctv_layouts
    GROUP BY project_id
    HAVING count(*) FILTER (WHERE is_active) <> 1
  ) THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL: a project does not have exactly one active layout';
  END IF;
END;
$$;

ROLLBACK;

SELECT 'PASS' AS production_foundation_acceptance;
