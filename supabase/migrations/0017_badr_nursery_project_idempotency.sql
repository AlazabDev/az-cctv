-- Idempotent real-client project creation for Badr Nursery.
-- Scoped to the named client starter; ordinary AZ-CCTV project naming remains unchanged.
-- Keeps the existing projects untouched. Re-run safely when no duplicates exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.cctv_projects
    WHERE name = 'حضانة بدر - نظام كاميرات المراقبة'
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Badr Nursery projects exist; reconcile them before adding the unique index';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS cctv_badr_nursery_one_per_owner
  ON public.cctv_projects (user_id, name)
  WHERE name = 'حضانة بدر - نظام كاميرات المراقبة';
